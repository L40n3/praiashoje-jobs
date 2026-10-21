/**
 * coletar.mjs — monta o retrato do serra-hoje (contrato em README.md).
 *
 * Uma chamada ao Open-Meteo Forecast com todos os pontos de pontos.mjs,
 * cálculo dos índices (indices.mjs) e dois arquivos de saída, um por site:
 *   $RELAY_OUT_DIR/serra-hoje/serra-hoje-sc.json
 *   $RELAY_OUT_DIR/serra-hoje/serra-hoje-sg.json
 *
 * Sem dependência: Node 22, fetch nativo. Falha (exit 1, sem escrever nada)
 * se o Open-Meteo não responder ou se metade dos pontos vier sem
 * temperatura: o relay continua servindo o retrato anterior, que carrega o
 * próprio gerado_em.
 *
 * Env:
 *   RELAY_OUT_DIR       — pasta de saída (default ./relay-out)
 *   SERRA_HOJE_ESTADO   — 'sombra' (default) ou 'publico'. Os sites só mostram
 *                         o bloco com 'publico': é o interruptor que liga e
 *                         desliga a exibição sem deploy na Vercel.
 *   OPEN_METEO_FIXTURE  — (testes) caminho de um JSON salvo no lugar da rede
 *   SERRA_HOJE_DATA     — (validação) "YYYY-MM-DD": refaz o retrato daquele
 *                         dia, às 06h, com a API de previsões arquivadas do
 *                         Open-Meteo. O retrato sai com `reprocessado: true` e
 *                         o upload.mjs se recusa a publicá-lo.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PONTOS } from './pontos.mjs';
import {
  INDICES_VERSAO, arred, janelasDeAlerta, melhorHorario, nivelGeada, nivelNeblina, nivelNeve,
} from './indices.mjs';

const FUSO = 'America/Sao_Paulo';
const OUT_DIR = path.join(process.env.RELAY_OUT_DIR ?? path.resolve('relay-out'), 'serra-hoje');
const ESTADO = process.env.SERRA_HOJE_ESTADO === 'publico' ? 'publico' : 'sombra';
const DATA_REPROCESSO = /^\d{4}-\d{2}-\d{2}$/.test(process.env.SERRA_HOJE_DATA ?? '') ? process.env.SERRA_HOJE_DATA : null;

// Hoje e amanhã vão hora a hora; a geada vai até D+3.
const DIAS_HORARIOS = 2;
const DIAS_RESUMO = 4;
// Neve só hoje e amanhã: no inverno de 2025, com dois dias de antecedência o
// modelo não viu nenhum dos três episódios (validacao/inverno-2025.md).
const DIAS_NEVE = 2;

export const HORARIAS = {
  temp: 'temperature_2m',
  sensacao: 'apparent_temperature',
  codigo: 'weather_code',
  orvalho: 'dew_point_2m',
  ur: 'relative_humidity_2m',
  vis: 'visibility',
  nuvem: 'cloud_cover',
  nuvemBaixa: 'cloud_cover_low',
  vento: 'wind_speed_10m',
  chuva: 'precipitation',
  probChuva: 'precipitation_probability',
  neve: 'snowfall',
  isoterma: 'freezing_level_height',
  solo: 'soil_temperature_0cm',
  dia: 'is_day',
};

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function urlOpenMeteo() {
  const q = new URLSearchParams({
    latitude: PONTOS.map((p) => p.lat).join(','),
    longitude: PONTOS.map((p) => p.lon).join(','),
    elevation: PONTOS.map((p) => p.altitude).join(','),
    hourly: Object.values(HORARIAS).join(','),
    daily: 'sunrise,sunset,weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max',
    timezone: FUSO,
  });
  // Ontem entra para somar a chuva das 6 h anteriores ao alerta de gelo da madrugada.
  if (DATA_REPROCESSO) {
    q.set('start_date', somarDias(DATA_REPROCESSO, -1));
    q.set('end_date', somarDias(DATA_REPROCESSO, DIAS_RESUMO - 1));
    return `https://historical-forecast-api.open-meteo.com/v1/forecast?${q}`;
  }
  q.set('past_days', '1');
  q.set('forecast_days', String(DIAS_RESUMO));
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

async function buscar() {
  if (process.env.OPEN_METEO_FIXTURE) {
    return JSON.parse(await readFile(process.env.OPEN_METEO_FIXTURE, 'utf8'));
  }
  const url = urlOpenMeteo();
  let ultimo = '';
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'serra-hoje (github.com/L40n3/praiashoje-jobs)' },
        // 18 pontos numa chamada: 30 s já estourou uma vez (20/10/2026).
        signal: AbortSignal.timeout(60_000),
      });
      const txt = await res.text();
      if (res.ok) {
        const dados = JSON.parse(txt);
        return Array.isArray(dados) ? dados : [dados];
      }
      ultimo = `HTTP ${res.status} — ${txt.slice(0, 200)}`;
    } catch (e) {
      ultimo = `erro de rede — ${e?.message ?? e}`;
    }
    log(`open-meteo: falhou (tentativa ${tentativa}): ${ultimo}`);
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 10_000));
  }
  throw new Error(`Open-Meteo não respondeu: ${ultimo}`);
}

/** Data local de hoje no fuso da serra, "YYYY-MM-DD". */
function hojeLocal(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function series(resposta) {
  const h = resposta.hourly ?? {};
  const s = { t: h.time ?? [] };
  for (const [nome, campo] of Object.entries(HORARIAS)) {
    s[nome] = h[campo] ?? s.t.map(() => null);
  }
  s.neblina = s.t.map((_, i) => nivelNeblina({
    vis: s.vis[i], ur: s.ur[i], temp: s.temp[i], orvalho: s.orvalho[i],
    nuvemBaixa: s.nuvemBaixa[i], vento: s.vento[i],
  }));
  return s;
}

const coluna = (s, nome, ini, fim, casas) => s[nome].slice(ini, fim).map((v) => arred(v, casas));

function montarPonto(ponto, resposta, hoje) {
  const s = series(resposta);
  const iHoje = s.t.findIndex((t) => t.startsWith(hoje));
  if (iHoje < 0) throw new Error(`${ponto.id}: a série não tem o dia ${hoje}`);
  const iFim = Math.min(s.t.length, iHoje + 24 * DIAS_HORARIOS);

  const datas = [...new Set(s.t.slice(iHoje).map((t) => t.slice(0, 10)))].slice(0, DIAS_RESUMO);
  const daily = resposta.daily ?? {};
  const dias = datas.map((data, d) => {
    const horas = [];
    s.t.forEach((t, i) => { if (t.startsWith(data)) horas.push(i); });
    const iDaily = (daily.time ?? []).indexOf(data);
    const dia = {
      data,
      nascer: iDaily >= 0 ? daily.sunrise?.[iDaily]?.slice(11, 16) ?? null : null,
      por: iDaily >= 0 ? daily.sunset?.[iDaily]?.slice(11, 16) ?? null : null,
      geada: nivelGeada(horas, s, ponto.ajusteGeada ?? 0),
      // Para o card dos sites (ícone do céu e faixa de dias). Sem correção de altitude extra nem
      // o ajuste da geada: a mínima de geada continua sendo `geada.tmin`.
      tempo: {
        codigo: iDaily >= 0 ? daily.weather_code?.[iDaily] ?? null : null,
        tmin: iDaily >= 0 ? arred(daily.temperature_2m_min?.[iDaily] ?? null, 1) : null,
        tmax: iDaily >= 0 ? arred(daily.temperature_2m_max?.[iDaily] ?? null, 1) : null,
        prob_chuva: iDaily >= 0 ? daily.precipitation_probability_max?.[iDaily] ?? null : null,
      },
    };
    if (d < DIAS_NEVE) dia.neve = nivelNeve(horas, s, ponto.altitude);
    if (ponto.tipo === 'mirante' && d < DIAS_HORARIOS) dia.melhor_horario = melhorHorario(horas, s);
    return dia;
  });

  const horasPublicadas = [];
  for (let i = iHoje; i < iFim; i++) horasPublicadas.push(i);

  const saida = {
    id: ponto.id,
    nome: ponto.nome,
    tipo: ponto.tipo,
    lat: ponto.lat,
    lon: ponto.lon,
    altitude_m: ponto.altitude,
    coord_fonte: ponto.coordFonte,
    altitude_fonte: ponto.altitudeFonte,
    // Centro da célula do modelo que respondeu por este ponto.
    grade: { lat: arred(resposta.latitude, 4), lon: arred(resposta.longitude, 4) },
    horas: {
      inicio: s.t[iHoje],
      passo_min: 60,
      temp: coluna(s, 'temp', iHoje, iFim, 1),
      sensacao: coluna(s, 'sensacao', iHoje, iFim, 1),
      codigo: s.codigo.slice(iHoje, iFim),
      orvalho: coluna(s, 'orvalho', iHoje, iFim, 1),
      ur: coluna(s, 'ur', iHoje, iFim, 0),
      vis_m: s.vis.slice(iHoje, iFim).map((v) => (v === null ? null : Math.round(v / 10) * 10)),
      nuvem: coluna(s, 'nuvem', iHoje, iFim, 0),
      nuvem_baixa: coluna(s, 'nuvemBaixa', iHoje, iFim, 0),
      vento_kmh: coluna(s, 'vento', iHoje, iFim, 0),
      chuva_mm: coluna(s, 'chuva', iHoje, iFim, 1),
      prob_chuva: coluna(s, 'probChuva', iHoje, iFim, 0),
      neve_cm: coluna(s, 'neve', iHoje, iFim, 2),
      isoterma_m: s.isoterma.slice(iHoje, iFim).map((v) => (v === null ? null : Math.round(v / 10) * 10)),
      solo: coluna(s, 'solo', iHoje, iFim, 1),
      dia: s.dia.slice(iHoje, iFim),
      neblina: s.neblina.slice(iHoje, iFim),
    },
    dias,
  };
  if (ponto.gelo) {
    // Só alerta: a lista vazia NÃO quer dizer pista sem gelo (ver indices.mjs).
    saida.gelo = { estrada: ponto.estrada ?? null, janelas_alerta: janelasDeAlerta(horasPublicadas, s) };
  }
  return saida;
}

export function montarRetratos(respostas, agora = new Date()) {
  if (respostas.length !== PONTOS.length) {
    throw new Error(`Open-Meteo devolveu ${respostas.length} pontos, o catálogo tem ${PONTOS.length}`);
  }
  const hoje = hojeLocal(agora);
  const pontos = PONTOS.map((p, k) => ({ site: p.site, ponto: montarPonto(p, respostas[k], hoje) }));

  const semTemp = pontos.filter(({ ponto }) => ponto.horas.temp.every((v) => v === null)).length;
  if (semTemp * 2 >= pontos.length) {
    throw new Error(`${semTemp} de ${pontos.length} pontos sem temperatura: retrato não publicado`);
  }

  const base = {
    contrato: 'serra-hoje/1',
    indices_versao: INDICES_VERSAO,
    estado: ESTADO,
    gerado_em: agora.toISOString(),
    ...(DATA_REPROCESSO ? { reprocessado: true } : {}),
    fuso: FUSO,
    hoje,
    fonte: {
      nome: 'Open-Meteo',
      url: 'https://open-meteo.com/',
      licenca: 'CC BY 4.0',
      modelo: 'best_match',
    },
  };
  return Object.fromEntries(['sc', 'sg'].map((site) => [site, {
    ...base,
    site,
    pontos: pontos.filter((p) => p.site === site).map((p) => p.ponto),
  }]));
}

async function main() {
  log(`serra-hoje: ${PONTOS.length} pontos, índices ${INDICES_VERSAO}, estado ${ESTADO}`);
  const respostas = await buscar();
  // Reprocesso: o retrato "das 06h" daquele dia (09:00 UTC).
  const retratos = montarRetratos(respostas, DATA_REPROCESSO ? new Date(`${DATA_REPROCESSO}T09:00:00Z`) : new Date());
  await mkdir(OUT_DIR, { recursive: true });
  for (const [site, retrato] of Object.entries(retratos)) {
    const arquivo = path.join(OUT_DIR, `serra-hoje-${site}.json`);
    const corpo = JSON.stringify(retrato);
    await writeFile(arquivo, corpo);
    log(`  ${site}: ${retrato.pontos.length} pontos, ${corpo.length} bytes -> ${arquivo}`);
  }
  return 0;
}

// Rodado como script (os testes importam montarRetratos sem disparar a coleta).
if (process.argv[1]?.endsWith('coletar.mjs')) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error('serra-hoje: erro fatal —', e?.message ?? e);
      process.exit(1);
    });
}
