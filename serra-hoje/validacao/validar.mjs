/**
 * validar.mjs — compara o que os índices do serra-hoje teriam dito com o que
 * as estações automáticas do INMET mediram.
 *
 *   node serra-hoje/validacao/validar.mjs --inmet <pasta> --inicio 2025-05-01 --fim 2025-09-30 \
 *        [--saida relatorio.md] [--json resultado.json] [--estacoes A815,A865]
 *        [--ajuste '{"neblina":{"saturadoUr":97}}'] [--correcao A815:1,A897:-1]
 *
 * --ajuste troca limiares de indices.mjs só nesta rodada; --correcao soma
 * graus à temperatura prevista de uma estação. Servem para testar uma
 * calibração antes de mexer no job. Relatório do inverno de 2025: inverno-2025.md.
 *
 * <pasta> tem um CSV por estação, como sai do arquivo anual do INMET
 * (portal.inmet.gov.br/dadoshistoricos), com o nome <codigo>.csv. Os CSVs não
 * vão para o git.
 *
 * A previsão vem de duas APIs do Open-Meteo, na coordenada e altitude da
 * estação, com as mesmas funções do job (coletar.mjs, indices.mjs):
 *   antecedência 0 — previsões arquivadas (historical-forecast): as primeiras
 *                    horas de cada rodada, com todas as variáveis. É o caso
 *                    do "hoje" do retrato, e o melhor caso.
 *   antecedência 1 e 2 — previous-runs: a previsão feita 1 e 2 dias antes. Essa
 *                    API não guarda visibilidade, nuvem baixa, isoterma nem
 *                    solo: neblina e melhor horário ficam sem dado, a neve
 *                    só conta com a neve prevista e a geada sem o chão.
 *
 * O INMET não mede visibilidade nem geada, então o "aconteceu" é aproximado:
 *   geada     — mínima da madrugada (00h às 08h) até 3 °C ("possível") e até
 *               1 °C ("provável"), no abrigo a 1,5 m;
 *   neblina   — umidade relativa de 97% ou mais na hora: a estação dentro da
 *               nuvem ou do nevoeiro;
 *   gelo      — a mesma regra do índice aplicada ao que foi medido (ar até
 *               1 °C com chuva nas 6 h anteriores, ou saturado abaixo disso);
 *   neve      — dias da lista de ocorrências (EVENTOS_NEVE), mais as horas
 *               com chuva medida e ar até 1,5 °C.
 */

import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { HORARIAS, series } from '../coletar.mjs';
import { INDICES_VERSAO, LIMIARES, alertaGelo, arred, melhorHorario, nivelGeada, nivelNeve } from '../indices.mjs';

// Ocorrências de neve na serra catarinense (página de neve do
// serracatarinensetrip, fontes Epagri/Ciram e Defesa Civil).
const EVENTOS_NEVE = ['2025-05-29', '2025-06-30', '2025-08-09', '2026-05-09', '2026-09-06'];

const PREVIOUS_RUNS = ['temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'precipitation', 'snowfall', 'cloud_cover', 'wind_speed_10m'];

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, v) => {
  if (a.startsWith('--')) acc.push([a.slice(2), v[i + 1]]);
  return acc;
}, []));
const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const log = (m) => console.error(`[${new Date().toISOString()}] ${m}`);

// ── INMET ────────────────────────────────────────────────────────────────

function numero(v) {
  if (v === undefined || v === '' || v === '-9999') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** CSV do INMET -> { meta, horas: Map("YYYY-MM-DDTHH:00" local, medida) }. */
export function lerInmet(texto) {
  const linhas = texto.split(/\r?\n/);
  const meta = {};
  for (const l of linhas.slice(0, 8)) {
    const [k, v] = l.split(':;');
    if (v !== undefined) meta[k.trim()] = v.trim();
  }
  const cab = linhas[8].split(';');
  const col = (re) => cab.findIndex((c) => re.test(c));
  const C = {
    chuva: col(/^PRECIPITA/), temp: col(/BULBO SECO/), orvalho: col(/PONTO DE ORVALHO/),
    tminAnt: col(/TEMPERATURA M.NIMA NA HORA/), ur: col(/UMIDADE RELATIVA DO AR, HORARIA/), vento: col(/VENTO, VELOCIDADE/),
  };
  const horas = new Map();
  for (const l of linhas.slice(9)) {
    const r = l.split(';');
    if (r.length < 10) continue;
    const [a, m, d] = r[0].split(/[/-]/).map(Number);
    const h = Number(r[1].slice(0, 2));
    // Hora UTC -> hora local da serra (UTC-3, sem horário de verão desde 2019).
    const local = new Date(Date.UTC(a, m - 1, d, h) - 3 * 3_600_000).toISOString().slice(0, 13) + ':00';
    const vento = numero(r[C.vento]);
    horas.set(local, {
      chuva: numero(r[C.chuva]), temp: numero(r[C.temp]), orvalho: numero(r[C.orvalho]),
      tminAnt: numero(r[C.tminAnt]), ur: numero(r[C.ur]), vento: vento === null ? null : vento * 3.6,
    });
  }
  return {
    meta: {
      codigo: meta['CODIGO (WMO)'], nome: meta.ESTACAO,
      lat: numero(meta.LATITUDE), lon: numero(meta.LONGITUDE), altitude: Math.round(numero(meta.ALTITUDE)),
    },
    horas,
  };
}

// ── Open-Meteo ───────────────────────────────────────────────────────────

async function buscarJson(url) {
  let ultimo = '';
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      const txt = await res.text();
      if (res.ok) return JSON.parse(txt);
      ultimo = `HTTP ${res.status} ${txt.slice(0, 200)}`;
    } catch (e) {
      ultimo = e?.message ?? String(e);
    }
    log(`open-meteo falhou (${tentativa}): ${ultimo}`);
    await new Promise((r) => setTimeout(r, tentativa * 15_000));
  }
  throw new Error(ultimo);
}

/** Resposta no formato do forecast normal, para series() servir sem mudança. */
async function previsao(est, inicio, fim, antecedencia) {
  const q = new URLSearchParams({
    latitude: est.lat, longitude: est.lon, elevation: est.altitude,
    timezone: 'America/Sao_Paulo', start_date: somarDias(inicio, -1), end_date: fim,
  });
  if (antecedencia === 0) {
    q.set('hourly', Object.values(HORARIAS).join(','));
    return buscarJson(`https://historical-forecast-api.open-meteo.com/v1/forecast?${q}`);
  }
  const sufixo = `_previous_day${antecedencia}`;
  q.set('hourly', [...PREVIOUS_RUNS.map((v) => v + sufixo), 'is_day'].join(','));
  const r = await buscarJson(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}`);
  const hourly = { time: r.hourly.time, is_day: r.hourly.is_day };
  for (const v of PREVIOUS_RUNS) hourly[v] = r.hourly[v + sufixo];
  return { ...r, hourly };
}

// ── Contas ───────────────────────────────────────────────────────────────

/** Tabela de contingência de pares [previu, aconteceu]. */
function contingencia(pares) {
  let a = 0, b = 0, c = 0, d = 0;
  for (const [p, o] of pares) {
    if (p && o) a++; else if (p) b++; else if (o) c++; else d++;
  }
  return {
    acertos: a, alarmes_falsos: b, perdidos: c, negativos: d,
    // POD: dos eventos que aconteceram, quantos o índice previu.
    pod: a + c ? arred(a / (a + c), 2) : null,
    // FAR: dos avisos que o índice deu, quantos não aconteceram.
    far: a + b ? arred(b / (a + b), 2) : null,
  };
}

const media = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);

function avaliar(est, obs, resposta, inicio, fim) {
  const s = series(resposta);
  const idx = new Map(s.t.map((t, i) => [t, i]));

  // Série medida no formato que alertaGelo() lê.
  const sObs = {
    t: s.t,
    temp: s.t.map((t) => obs.get(t)?.temp ?? null),
    solo: s.t.map(() => null),
    chuva: s.t.map((t) => obs.get(t)?.chuva ?? null),
    neve: s.t.map(() => null),
    ur: s.t.map((t) => obs.get(t)?.ur ?? null),
  };
  sObs.neblina = sObs.ur.map((u) => (u === null ? null : u >= 97 ? 'provavel' : 'sem'));

  const dias = [];
  const paresGeada3 = [], paresGeada1 = [], errosTmin = [];
  const paresNeblinaProv = [], paresNeblinaPoss = [], paresGelo = [];
  const janelas = [];
  const fechados = [];
  let horasClarasDia = 0, horasDia = 0;

  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    const horas = s.t.map((t, i) => (t.startsWith(data) ? i : -1)).filter((i) => i >= 0);
    if (!horas.length) continue;

    // Geada: mínima medida na madrugada, com pelo menos 7 das 9 horas.
    const madrugada = horas.filter((i) => Number(s.t[i].slice(11, 13)) <= 8);
    const medidas = madrugada.map((i) => obs.get(s.t[i])).filter((m) => m && m.temp !== null);
    const geada = nivelGeada(horas, s);
    let tminObs = null;
    if (medidas.length >= 7) {
      tminObs = Math.min(...medidas.flatMap((m) => [m.temp, m.tminAnt].filter((v) => v !== null)));
      if (geada.nivel !== null) {
        paresGeada3.push([geada.nivel !== 'sem', tminObs <= 3]);
        paresGeada1.push([geada.nivel === 'provavel', tminObs <= 1]);
        errosTmin.push(geada.tmin - tminObs);
      }
    }

    // Neblina, só com sol (é o que importa para mirante).
    for (const i of horas) {
      const m = obs.get(s.t[i]);
      if (s.dia[i] !== 1 || !m || m.ur === null) continue;
      const fog = m.ur >= 97;
      horasDia++;
      if (!fog && !(m.chuva > 0.3)) horasClarasDia++;
      if (s.neblina[i] === null) continue;
      paresNeblinaProv.push([s.neblina[i] === 'provavel', fog]);
      paresNeblinaPoss.push([s.neblina[i] !== 'sem', fog]);
    }

    // Melhor horário: nas horas da janela prevista, a estação estava fora da nuvem?
    const mh = melhorHorario(horas, s);
    if (mh.melhor) {
      const ini = horas.find((i) => s.t[i].slice(11, 16) === mh.melhor.inicio);
      let claras = 0, medidasJ = 0;
      for (let i = ini; i < ini + mh.melhor.horas; i++) {
        const m = obs.get(s.t[i]);
        if (!m || m.ur === null) continue;
        medidasJ++;
        if (m.ur < 97 && !(m.chuva > 0.3)) claras++;
      }
      if (medidasJ >= mh.melhor.horas * 0.7) janelas.push(claras / medidasJ);
    } else if (mh.motivo === 'neblina' || mh.motivo === 'chuva') {
      // Dia que o índice deu como fechado: quanto do dia de sol foi limpo de fato?
      const sol = horas.filter((i) => s.dia[i] === 1).map((i) => obs.get(s.t[i])).filter((m) => m && m.ur !== null);
      if (sol.length >= 6) fechados.push(sol.filter((m) => m.ur < 97 && !(m.chuva > 0.3)).length / sol.length);
    }

    // Gelo, hora a hora.
    for (const i of horas) {
      if (sObs.temp[i] === null) continue;
      paresGelo.push([alertaGelo(i, s), alertaGelo(i, sObs)]);
    }

    // Neve: o que o índice disse e o que se mediu de chuva fria.
    const neve = nivelNeve(horas, s, est.altitude);
    const horasChuvaFria = horas.filter((i) => {
      const m = obs.get(s.t[i]);
      return m && m.chuva > 0 && m.temp !== null && m.temp <= 1.5;
    }).length;

    dias.push({ data, geada: geada.nivel, tmin_prev: geada.tmin, tmin_obs: tminObs, nuvem_prev: geada.nuvem_pct, vento_prev: geada.vento_kmh, neve: neve.nivel, neve_cm: neve.neve_cm, horas_chuva_fria: horasChuvaFria });
  }

  return {
    dias,
    tmin: {
      n: errosTmin.length,
      vies: arred(media(errosTmin), 1),
      erro_medio: arred(media(errosTmin.map(Math.abs)), 1),
      ate_2c: errosTmin.length ? arred(errosTmin.filter((e) => Math.abs(e) <= 2).length / errosTmin.length, 2) : null,
    },
    geada_ate3: contingencia(paresGeada3),
    geada_ate1: contingencia(paresGeada1),
    neblina_provavel: paresNeblinaProv.length ? contingencia(paresNeblinaProv) : null,
    neblina_possivel: paresNeblinaPoss.length ? contingencia(paresNeblinaPoss) : null,
    melhor_horario: {
      dias: janelas.length,
      claras_na_janela: arred(media(janelas), 2),
      dias_75pct: janelas.length ? arred(janelas.filter((f) => f >= 0.75).length / janelas.length, 2) : null,
      // Referência: fração de horas de sol sem nuvem em qualquer hora do dia.
      claras_no_dia: horasDia ? arred(horasClarasDia / horasDia, 2) : null,
      // Dias sem janela: quantos e quanto do dia ficou limpo mesmo assim.
      dias_fechados: fechados.length,
      fechados_claras: arred(media(fechados), 2),
      fechados_ate_25pct: fechados.length ? arred(fechados.filter((f) => f <= 0.25).length / fechados.length, 2) : null,
    },
    gelo: contingencia(paresGelo),
  };
}

// ── Relatório ────────────────────────────────────────────────────────────

const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const linhaCont = (c) => (c ? `${c.acertos} / ${c.alarmes_falsos} / ${c.perdidos} | ${pct(c.pod)} | ${pct(c.far)}` : '— | — | —');

function relatorio(resultados, inicio, fim) {
  const L = [];
  L.push(`# Validação do serra-hoje, ${inicio} a ${fim}`, '');
  L.push(`Índices ${INDICES_VERSAO}${args.ajuste ? `, com o ajuste \`${args.ajuste}\`` : ''}. Gerado por \`validacao/validar.mjs\` em ${new Date().toISOString().slice(0, 10)}. Como ler: "acertos / alarmes falsos / perdidos"; **POD** é a parte dos eventos que o índice previu, **FAR** a parte dos avisos que não se confirmaram.`, '');

  for (const ant of [0, 1, 2]) {
    const rs = resultados.filter((r) => r.antecedencia === ant);
    if (!rs.length) continue;
    L.push(`## Antecedência ${ant === 0 ? '0 (o "hoje" do retrato)' : `${ant} dia${ant > 1 ? 's' : ''}`}`, '');
    L.push('### Mínima da madrugada', '', '| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |', '|---|---|---|---|---|');
    for (const r of rs) L.push(`| ${r.estacao} | ${r.tmin.n} | ${r.tmin.vies ?? '—'} °C | ${r.tmin.erro_medio ?? '—'} °C | ${pct(r.tmin.ate_2c)} |`);
    L.push('', '### Geada', '', '| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |', '|---|---|---|---|---|---|---|');
    for (const r of rs) L.push(`| ${r.estacao} | ${linhaCont(r.geada_ate3)} | ${linhaCont(r.geada_ate1)} |`);
    if (ant === 0) {
      L.push('', '### Neblina (horas de sol, umidade medida ≥ 97%)', '', '| estação | "provável" | POD | FAR | "possível" ou mais | POD | FAR |', '|---|---|---|---|---|---|---|');
      for (const r of rs) L.push(`| ${r.estacao} | ${linhaCont(r.neblina_provavel)} | ${linhaCont(r.neblina_possivel)} |`);
      L.push('', '### Melhor horário', '', '| estação | dias com janela | horas limpas na janela | dias com 75% ou mais limpo | horas limpas no dia todo (referência) | dias sem janela | horas limpas neles | dias sem janela de fato fechados (até 25% limpo) |', '|---|---|---|---|---|---|---|---|');
      for (const r of rs) L.push(`| ${r.estacao} | ${r.melhor_horario.dias} | ${pct(r.melhor_horario.claras_na_janela)} | ${pct(r.melhor_horario.dias_75pct)} | ${pct(r.melhor_horario.claras_no_dia)} | ${r.melhor_horario.dias_fechados} | ${pct(r.melhor_horario.fechados_claras)} | ${pct(r.melhor_horario.fechados_ate_25pct)} |`);
    }
    L.push('', '### Gelo (hora a hora, contra a mesma regra no medido)', '', '| estação | alerta | POD | FAR |', '|---|---|---|---|');
    for (const r of rs) L.push(`| ${r.estacao} | ${linhaCont(r.gelo)} |`);
    L.push('');
  }

  L.push('## Neve, dia a dia', '', 'Dias em que algum índice saiu de `sem_sinal`, ou que estão na lista de ocorrências. "Chuva fria" são as horas com chuva medida e ar até 1,5 °C.', '');
  const datas = new Set();
  for (const r of resultados) for (const d of r.dias) if ((d.neve && d.neve !== 'sem_sinal') || EVENTOS_NEVE.includes(d.data)) datas.add(d.data);
  const estacoes = [...new Set(resultados.map((r) => r.estacao))];
  L.push(`| dia | nevou? | ${estacoes.join(' | ')} |`, `|---|---|${estacoes.map(() => '---').join('|')}|`);
  for (const data of [...datas].sort()) {
    const cels = estacoes.map((e) => {
      const v = [0, 1, 2].map((ant) => resultados.find((r) => r.estacao === e && r.antecedencia === ant)?.dias.find((d) => d.data === data));
      const fria = v[0]?.horas_chuva_fria ? ` (${v[0].horas_chuva_fria} h fria)` : '';
      return v.map((d) => (d?.neve ? d.neve.replace('sem_sinal', '·') : '?')).join(' / ') + fria;
    });
    L.push(`| ${data} | ${EVENTOS_NEVE.includes(data) ? 'sim' : ''} | ${cels.join(' | ')} |`);
  }
  L.push('', 'Cada célula: antecedência 0 / 1 / 2 dias. `·` é sem sinal.', '');
  return L.join('\n');
}

// ── Execução ─────────────────────────────────────────────────────────────

async function main() {
  const { inmet, inicio, fim } = args;
  // --ajuste '{"neblina":{"saturadoUr":97}}': testa limiares sem mexer em indices.mjs.
  if (args.ajuste) {
    for (const [grupo, valores] of Object.entries(JSON.parse(args.ajuste))) Object.assign(LIMIARES[grupo], valores);
    log(`limiares ajustados: ${args.ajuste}`);
  }
  if (!inmet || !inicio || !fim) {
    console.error('uso: validar.mjs --inmet <pasta> --inicio YYYY-MM-DD --fim YYYY-MM-DD [--saida x.md] [--json x.json] [--estacoes A815,A865]');
    return 1;
  }
  const codigos = (args.estacoes ?? 'A815,A845,A865,A829,A897,A879').split(',');
  const resultados = [];
  for (const codigo of codigos) {
    let est;
    try {
      est = lerInmet(await readFile(path.join(inmet, `${codigo}.csv`), 'latin1'));
    } catch {
      log(`${codigo}: CSV não encontrado, pulando`);
      continue;
    }
    const comDado = [...est.horas].filter(([t, m]) => t >= inicio && t <= `${fim}T23:00` && m.temp !== null).length;
    if (comDado < 24 * 20) {
      log(`${codigo} (${est.meta.nome}): só ${comDado} horas medidas no período, pulando`);
      continue;
    }
    for (const antecedencia of [0, 1, 2]) {
      log(`${codigo} ${est.meta.nome}: antecedência ${antecedencia}`);
      const resposta = await previsao(est.meta, inicio, fim, antecedencia);
      // --correcao A815:1,A897:-1.5: soma à temperatura prevista da estação (teste de ajuste por ponto).
      const corr = Number(Object.fromEntries((args.correcao ?? '').split(',').filter(Boolean).map((x) => x.split(':')))[codigo] ?? 0);
      if (corr) resposta.hourly.temperature_2m = resposta.hourly.temperature_2m.map((v) => (v === null ? null : v + corr));
      const r = avaliar(est.meta, est.horas, resposta, inicio, fim);
      resultados.push({ estacao: `${est.meta.nome} (${codigo}, ${est.meta.altitude} m)`, codigo, antecedencia, horas_medidas: comDado, ...r });
    }
  }
  const md = relatorio(resultados, inicio, fim);
  if (args.saida) await writeFile(args.saida, md); else console.log(md);
  if (args.json) await writeFile(args.json, JSON.stringify(resultados, null, 1));
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
