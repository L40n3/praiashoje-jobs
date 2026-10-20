<?php
/**
 * serra-hoje-relay-upload.php
 *
 * Recebe (POST) o retrato de condições da serra de um site (?site=sc ou
 * ?site=sg), publicado pelo GitHub Actions (praiashoje-jobs,
 * serra-hoje/upload.mjs), e grava em
 * /home1/laoneb51/data/serra-hoje/serra-hoje-<site>.json. O irmão
 * serra-hoje-relay.php (só leitura) serve esse arquivo para os sites.
 *
 * Mesmo desenho do floripa-hoje-relay-upload.php: a HostGator não roda
 * Node, então o retrato é montado no Actions e este endpoint só deposita o
 * resultado. Confere a forma mínima e grava (escrita atômica: .tmp +
 * rename). Contrato: praiashoje-jobs/serra-hoje/README.md.
 *
 * Diferente do floripa-hoje: guarda também uma cópia compactada de cada
 * retrato em historico/<site>/ por 45 dias. É o material da fase de sombra
 * (comparar o que o índice disse com o que aconteceu).
 *
 * Coloque na RAIZ do subdomínio api.floripatrip.com
 * (document root: /home1/laoneb51/api.floripatrip.com/), sem edição. O
 * segredo NÃO fica neste arquivo: mora em /home1/laoneb51/ft-secrets.php.
 *
 * 1. Gere uma string longa e aleatória (40+ caracteres), só deste endpoint.
 * 2. Em /home1/laoneb51/ft-secrets.php, acrescente:
 *      putenv('SERRAHOJE_UPLOAD_SECRET=<a string do passo 1>');
 * 3. No GitHub (repositório praiashoje-jobs): Settings -> Secrets and
 *    variables -> Actions -> "New repository secret":
 *      SERRAHOJE_UPLOAD_URL    = https://api.floripatrip.com/serra-hoje-relay-upload.php
 *      SERRAHOJE_UPLOAD_SECRET = (a MESMA string do passo 1)
 */

declare(strict_types=1);

const FT_SECRETS = '/home1/laoneb51/ft-secrets.php';
if (getenv('SERRAHOJE_UPLOAD_SECRET') === false && is_file(FT_SECRETS)) {
    require_once FT_SECRETS;
}
define('SEGREDO', (string) getenv('SERRAHOJE_UPLOAD_SECRET'));

// SERRAHOJE_DATA_DIR só existe para teste local; no servidor vale o default.
define('DATA_DIR', getenv('SERRAHOJE_DATA_DIR') ?: '/home1/laoneb51/data/serra-hoje');
const SITES = ['sc', 'sg'];
// Cada retrato tem dezenas de KB (10 pontos x 48 h em colunas).
const TAMANHO_MAX = 2 * 1024 * 1024;
const HISTORICO_DIAS = 45;

header('Content-Type: application/json; charset=utf-8');

function fim(int $status, array $corpo): void
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fim(405, ['erro' => 'Use POST.']);
}

// Sem segredo configurado, recusa tudo: hash_equals('', '') seria verdadeiro.
if (strlen(SEGREDO) < 32) {
    fim(503, ['erro' => 'Segredo do relay nao configurado no servidor.']);
}

$enviado = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';
if (!is_string($enviado) || !hash_equals(SEGREDO, $enviado)) {
    fim(403, ['erro' => 'Segredo invalido.']);
}

$site = $_GET['site'] ?? '';
if (!is_string($site) || !in_array($site, SITES, true)) {
    fim(400, ['erro' => 'Parametro site deve ser sc ou sg.']);
}

$corpo = file_get_contents('php://input');
if ($corpo === false || $corpo === '') {
    fim(400, ['erro' => 'Corpo vazio.']);
}
if (strlen($corpo) > TAMANHO_MAX) {
    fim(413, ['erro' => 'Retrato grande demais.']);
}

$s = json_decode($corpo, true);
if (!is_array($s)) {
    fim(422, ['erro' => 'JSON invalido: ' . json_last_error_msg()]);
}

// Forma, não conteúdo: um run quebrado não pode apagar o retrato anterior.
if (($s['contrato'] ?? null) !== 'serra-hoje/1') {
    fim(422, ['erro' => 'contrato diferente de serra-hoje/1.']);
}
if (($s['site'] ?? null) !== $site) {
    fim(422, ['erro' => 'O retrato e de outro site.']);
}
if (!empty($s['reprocessado'])) {
    fim(422, ['erro' => 'Retrato reprocessado nao se publica.']);
}
if (!isset($s['gerado_em']) || !is_string($s['gerado_em']) || strtotime($s['gerado_em']) === false) {
    fim(422, ['erro' => 'gerado_em ausente ou nao e uma data valida.']);
}
if (!isset($s['pontos']) || !is_array($s['pontos']) || count($s['pontos']) === 0) {
    fim(422, ['erro' => 'Campo pontos ausente, nao e lista, ou esta vazio.']);
}

// Assinatura do job: este PHP não tem o segredo de assinatura, só guarda
// X-Relay-Signature / X-Relay-Signed-At num sidecar que o relay devolve.
$assinatura = $_SERVER['HTTP_X_RELAY_SIGNATURE'] ?? null;
$assinadoEm = $_SERVER['HTTP_X_RELAY_SIGNED_AT'] ?? null;
$sidecar = null;
if (is_string($assinatura) && $assinatura !== '') {
    if (!preg_match('/^[0-9a-f]{64}$/', $assinatura)) {
        fim(422, ['erro' => 'X-Relay-Signature nao e HMAC-SHA256 hex.']);
    }
    if (!is_string($assinadoEm) || $assinadoEm === '' || strlen($assinadoEm) > 40 || strtotime($assinadoEm) === false) {
        fim(422, ['erro' => 'X-Relay-Signed-At ausente ou nao e uma data valida.']);
    }
    $sidecar = json_encode(['sig' => $assinatura, 'ts' => $assinadoEm]);
}

if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0755, true)) {
    fim(500, ['erro' => 'Nao foi possivel criar ' . DATA_DIR]);
}

$destino = DATA_DIR . '/serra-hoje-' . $site . '.json';
$tmp = $destino . '.tmp';
if (file_put_contents($tmp, $corpo) === false) {
    fim(500, ['erro' => 'Falha ao escrever arquivo temporario.']);
}
if (!rename($tmp, $destino)) {
    @unlink($tmp);
    fim(500, ['erro' => 'Falha ao mover arquivo temporario.']);
}

$destinoSig = $destino . '.sig';
if ($sidecar !== null) {
    $tmpSig = $destinoSig . '.tmp';
    if (file_put_contents($tmpSig, $sidecar) === false || !rename($tmpSig, $destinoSig)) {
        @unlink($tmpSig);
        fim(500, ['erro' => 'Retrato gravado, mas falha ao gravar a assinatura.']);
    }
} else {
    @unlink($destinoSig);
}

// Histórico: falha aqui não derruba a publicação, só aparece na resposta.
$historico = 'ok';
$dirHist = DATA_DIR . '/historico/' . $site;
if (!is_dir($dirHist) && !@mkdir($dirHist, 0755, true)) {
    $historico = 'sem pasta';
} else {
    $nome = gmdate('Ymd-Hi', (int) strtotime($s['gerado_em'])) . '.json.gz';
    $gz = gzencode($corpo, 6);
    if ($gz === false || file_put_contents($dirHist . '/' . $nome, $gz) === false) {
        $historico = 'falha ao gravar';
    }
    $limite = time() - HISTORICO_DIAS * 86400;
    foreach (glob($dirHist . '/*.json.gz') ?: [] as $velho) {
        if (filemtime($velho) < $limite) {
            @unlink($velho);
        }
    }
}

fim(200, [
    'ok' => true,
    'site' => $site,
    'bytes' => strlen($corpo),
    'pontos' => count($s['pontos']),
    'gerado_em' => $s['gerado_em'],
    'assinado' => $sidecar !== null,
    'historico' => $historico,
]);
