<?php
/**
 * serra-hoje-cron.php
 *
 * Dispara o workflow `relay-serra-hoje` (GitHub Actions, repositório público
 * praiashoje-jobs), que monta os retratos de condições das duas serras e os
 * publica em api.floripatrip.com.
 *
 * Cópia do floripa-hoje-cron.php (praias-hoje) com o alvo trocado: o
 * agendamento mora na HostGator porque o `schedule:` do GitHub, no plano
 * Free, é best-effort e chegou a disparar 2 vezes em 17 horas.
 *
 * Orçamento: o praiashoje-jobs é público, então o runner não consome a cota
 * de minutos da conta. O job não instala nada (Node puro) e leva menos de
 * um minuto. Open-Meteo: 18 pontos com 15 variáveis contam menos de 40
 * chamadas por disparo, menos de 320 por dia, longe das 10 mil/dia do plano
 * gratuito.
 *
 * Layout, mesmo padrão dos outros crons desta conta:
 *   /home1/laoneb51/cron/serra-hoje-cron.php   <- este arquivo
 *   /home1/laoneb51/cron/serra-hoje-cron.log   <- log
 *
 * TOKEN: o MESMO fine-grained PAT dos outros crons (PRAIASHOJE_GH_DISPATCH_TOKEN
 * em /home1/laoneb51/ft-secrets.php, "Actions: Read and write" no
 * praiashoje-jobs). Não precisa de token novo. Este arquivo sobe sem edição.
 */

// ---------------------------------------------------------------------
// ENTRADAS DE CRON (em comentário de linha, nunca no docblock: um `*/`
// fecharia o bloco e quebraria o arquivo, como já aconteceu no buscar-cron).
//
//   50 5,8,11,14,17,20 * * * /usr/bin/php /home1/laoneb51/cron/serra-hoje-cron.php >> /home1/laoneb51/cron/serra-hoje-cron.log 2>&1
//   50 23,2 * * * /usr/bin/php /home1/laoneb51/cron/serra-hoje-cron.php >> /home1/laoneb51/cron/serra-hoje-cron.log 2>&1
//
// Disparos às 02h50, 05h50, 08h50, 11h50, 14h50, 17h50, 20h50 e 23h50. O das
// 05h50 é o que importa para quem sai cedo para o mirante: chega com a
// rodada da madrugada dos modelos. O retrato traz hoje e amanhã hora a hora,
// então o intervalo entre disparos não deixa a hora atual sem dado.
//
// O :50 não coincide com o :00/:30 do lightning, o :15 do buscar e o :45 do
// floripa-hoje.
// ---------------------------------------------------------------------

declare(strict_types=1);

const LOG_FILE = '/home1/laoneb51/cron/serra-hoje-cron.log';

const GH_OWNER = 'L40n3';
const GH_REPO = 'praiashoje-jobs';
const GH_WORKFLOW = 'relay-serra-hoje.yml';
const GH_REF = 'main';

const FT_SECRETS = '/home1/laoneb51/ft-secrets.php';
if (getenv('PRAIASHOJE_GH_DISPATCH_TOKEN') === false && is_file(FT_SECRETS)) {
    require_once FT_SECRETS;
}
define('GH_TOKEN', (string) getenv('PRAIASHOJE_GH_DISPATCH_TOKEN'));

const HTTP_TIMEOUT = 20; // segundos

function log_msg(string $msg): void
{
    $linha = '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
    $dir = dirname(LOG_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(LOG_FILE, $linha, FILE_APPEND);
    echo $linha;
}

/** Uma tentativa de disparo. Devolve [status, corpo, erro_curl]; sucesso é 204. */
function disparar(): array
{
    $url = 'https://api.github.com/repos/' . GH_OWNER . '/' . GH_REPO
        . '/actions/workflows/' . GH_WORKFLOW . '/dispatches';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['ref' => GH_REF]),
        CURLOPT_TIMEOUT => HTTP_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Accept: application/vnd.github+json',
            'Authorization: Bearer ' . GH_TOKEN,
            'X-GitHub-Api-Version: 2022-11-28',
            'Content-Type: application/json',
            // A API do GitHub responde 403 sem User-Agent.
            'User-Agent: praiashoje-serra-hoje-cron',
        ],
    ]);
    $corpo = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $erro = curl_errno($ch) ? ('errno ' . curl_errno($ch) . ' - ' . curl_error($ch)) : '';
    curl_close($ch);

    return [$status, is_string($corpo) ? $corpo : '', $erro];
}

if (GH_TOKEN === '') {
    log_msg('ERRO: PRAIASHOJE_GH_DISPATCH_TOKEN nao configurado em ' . FT_SECRETS . ' — nada disparado.');
    exit(1);
}

// Retry único para 5xx transitório; 401/403/404/422 são configuração.
$ultimo = '';
for ($tentativa = 1; $tentativa <= 2; $tentativa++) {
    [$status, $corpo, $erro] = disparar();

    if ($status === 204) {
        log_msg('OK: workflow ' . GH_WORKFLOW . ' disparado em ' . GH_REF
            . ($tentativa > 1 ? ' (2a tentativa)' : ''));
        exit(0);
    }

    $ultimo = $erro !== ''
        ? ('curl: ' . $erro)
        : ('HTTP ' . $status . ' - ' . substr(trim($corpo), 0, 300));

    if (in_array($status, [401, 403, 404, 422], true) || $tentativa === 2) {
        break;
    }

    log_msg('falhou (' . $ultimo . ') — retry em 5s');
    sleep(5);
}

log_msg('ERRO: nao consegui disparar — ' . $ultimo);
exit(1);
