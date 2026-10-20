/**
 * upload.mjs — publica os retratos do serra-hoje em api.floripatrip.com.
 *
 * Um POST por site para `serra-hoje-relay-upload.php?site=sc|sg`, com o
 * mesmo desenho do relay-floripa-hoje-upload.mjs do praias-hoje: segredo
 * compartilhado em X-Relay-Secret, assinatura HMAC opcional (chave
 * "serra-hoje-<site>") e o desafio de cookie da HostGator. Não importa de
 * lá: aquele é a esteira de produção do FloripaTrip.
 *
 * Env:
 *   RELAY_OUT_DIR             — mesma pasta do coletar.mjs (default ./relay-out)
 *   SERRAHOJE_UPLOAD_URL      — https://api.floripatrip.com/serra-hoje-relay-upload.php
 *   SERRAHOJE_UPLOAD_SECRET   — o mesmo valor de SERRAHOJE_UPLOAD_SECRET no ft-secrets.php
 *   RELAY_SIGNING_SECRET      — (opcional) assina os retratos
 */

import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

const OUT_DIR = path.join(process.env.RELAY_OUT_DIR ?? path.resolve('relay-out'), 'serra-hoje');
const URL_UPLOAD = process.env.SERRAHOJE_UPLOAD_URL ?? '';
const SECRET = process.env.SERRAHOJE_UPLOAD_SECRET ?? '';
const SIGNING_SECRET = process.env.RELAY_SIGNING_SECRET ?? '';
const SITES = ['sc', 'sg'];

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

function assinar(chave, assinadoEm, corpo) {
  return createHmac('sha256', SIGNING_SECRET).update(`${chave}\n${assinadoEm}\n`).update(corpo).digest('hex');
}

// Desafio de cookie da HostGator ("Bot Protection"): em vez de responder, o
// servidor devolve HTML mandando gravar um cookie e recarregar.
const DESAFIO_RE = /document\.cookie\s*=\s*"([^"=]+)=([^";]*)/;
let cookieDesafio = null;

async function enviar(site, corpo) {
  const headers = { 'content-type': 'application/json', 'x-relay-secret': SECRET };
  if (SIGNING_SECRET) {
    const assinadoEm = new Date().toISOString();
    headers['x-relay-signed-at'] = assinadoEm;
    headers['x-relay-signature'] = assinar(`serra-hoje-${site}`, assinadoEm, corpo);
  }
  const url = `${URL_UPLOAD}?site=${site}`;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: cookieDesafio ? { ...headers, cookie: cookieDesafio } : headers,
        body: corpo,
        signal: AbortSignal.timeout(30_000),
      });
      const txt = await res.text();
      if (res.ok) {
        log(`  ${site}: OK (${corpo.length} bytes) ${txt.trim()}`);
        return true;
      }
      const m = txt.match(DESAFIO_RE);
      if (m && tentativa < 3) {
        cookieDesafio = `${m[1]}=${m[2]}`;
        log(`  ${site}: desafio de cookie da hospedagem (HTTP ${res.status}); reenviando com o cookie`);
        continue;
      }
      log(`  ${site}: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    } catch (e) {
      log(`  ${site}: erro de rede (tentativa ${tentativa}) — ${e?.message ?? e}`);
    }
    if (tentativa < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  if (!URL_UPLOAD || !SECRET) {
    console.error('SERRAHOJE_UPLOAD_URL e SERRAHOJE_UPLOAD_SECRET são obrigatórios.');
    return 1;
  }
  if (!SIGNING_SECRET) log('AVISO: RELAY_SIGNING_SECRET ausente — publicando SEM assinatura.');
  let ok = true;
  for (const site of SITES) {
    // Bytes, não string: a assinatura é sobre o que o PHP vai guardar.
    const corpo = await readFile(path.join(OUT_DIR, `serra-hoje-${site}.json`));
    if (JSON.parse(corpo.toString('utf8')).reprocessado) {
      console.error(`${site}: retrato reprocessado (SERRA_HOJE_DATA) não se publica.`);
      return 1;
    }
    ok = (await enviar(site, corpo)) && ok;
  }
  log(`FIM: ${ok ? 'publicado' : 'FALHOU'}.`);
  return ok ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error('upload: erro fatal —', e?.message ?? e);
    process.exit(1);
  });
