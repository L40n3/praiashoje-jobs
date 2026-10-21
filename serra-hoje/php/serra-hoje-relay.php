<?php
/**
 * serra-hoje-relay.php
 *
 * Endpoint leve, só leitura, que serve o retrato de condições da serra
 * (neblina, geada, neve, melhor horário em mirante, alerta de gelo) de um
 * site, publicado pelo GitHub Actions via serra-hoje-relay-upload.php.
 *
 *   https://api.floripatrip.com/serra-hoje-relay.php?site=sc   (serracatarinensetrip)
 *   https://api.floripatrip.com/serra-hoje-relay.php?site=sg   (serragauchatrip)
 *
 * Os sites são Astro estático na Vercel: o componente lê isto no navegador,
 * então o dado se renova sem deploy. CORS só para os domínios das duas
 * serras e para localhost (desenvolvimento), nunca `*`.
 *
 * Este arquivo nunca processa nada: só devolve o JSON que o job depositou.
 * Coloque na RAIZ do subdomínio api.floripatrip.com, sem edição.
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

const ORIGENS_PERMITIDAS = [
    'https://serracatarinensetrip.com.br',
    'https://www.serracatarinensetrip.com.br',
    'https://serragauchatrip.com.br',
    'https://www.serragauchatrip.com.br',
];
$origem = $_SERVER['HTTP_ORIGIN'] ?? '';
if (is_string($origem) && (
    in_array($origem, ORIGENS_PERMITIDAS, true)
    || preg_match('#^http://(localhost|127\.0\.0\.1):\d{2,5}$#', $origem)
)) {
    header('Access-Control-Allow-Origin: ' . $origem);
}
// Sempre, não só quando a origem é permitida: sem isso, a resposta de quem
// abriu a URL direto (sem Origin, sem permissão) fica no cache do navegador
// e a leitura do site, logo depois, falha no CORS (visto em 20/10/2026).
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: If-None-Match');
header('Access-Control-Expose-Headers: ETag, Last-Modified, X-Relay-Signature, X-Relay-Signed-At');
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// SERRAHOJE_DATA_DIR só existe para teste local; no servidor vale o default.
define('DATA_DIR', getenv('SERRAHOJE_DATA_DIR') ?: '/home1/laoneb51/data/serra-hoje');
const SITES = ['sc', 'sg'];

header('Content-Type: application/json; charset=utf-8');

$site = $_GET['site'] ?? '';
if (!is_string($site) || !in_array($site, SITES, true)) {
    http_response_code(400);
    echo json_encode(['erro' => 'Parametro site deve ser sc ou sg.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$arquivo = DATA_DIR . '/serra-hoje-' . $site . '.json';

// Publicação de 3 em 3 h de dia e de 4 em 4 h à noite (serra-hoje-cron.php).
// O retrato traz a série hora a hora de hoje e amanhã: o navegador escolhe a
// hora atual e confere gerado_em antes de mostrar qualquer coisa como "agora".
header('Cache-Control: public, max-age=600');

if (!is_file($arquivo) || !is_readable($arquivo)) {
    // 503, não 404: o cliente trata como "sem retrato agora" e mostra o texto fixo.
    http_response_code(503);
    echo json_encode(['erro' => 'Condicoes da serra indisponiveis.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$mtime = filemtime($arquivo);
$etag = 'W/"' . md5('serra-hoje-' . $site . '-' . (string) $mtime) . '"';
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

$sidecar = $arquivo . '.sig';
if (is_file($sidecar) && is_readable($sidecar)) {
    $sig = json_decode((string) file_get_contents($sidecar), true);
    if (is_array($sig)
        && is_string($sig['sig'] ?? null) && preg_match('/^[0-9a-f]{64}$/', $sig['sig'])
        && is_string($sig['ts'] ?? null) && strlen($sig['ts']) <= 40 && preg_match('/^[0-9TZ:.+\-]+$/', $sig['ts'])
    ) {
        header('X-Relay-Signature: ' . $sig['sig']);
        header('X-Relay-Signed-At: ' . $sig['ts']);
    }
}

$ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? null;
if ($ifNoneMatch !== null && trim($ifNoneMatch) === $etag) {
    http_response_code(304);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
    exit;
}

readfile($arquivo);
