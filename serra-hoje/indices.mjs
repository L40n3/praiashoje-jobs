/**
 * Índices do serra-hoje: neblina por hora, geada e neve por dia, melhor
 * horário em mirante e alerta de gelo. Funções puras, sem I/O: recebem as
 * séries horárias do Open-Meteo já alinhadas e devolvem níveis.
 *
 * Os limiares são a versão 0, escrita antes da validação: a fase de sombra
 * compara o que eles disseram com o que aconteceu e ajusta. Todo número mora
 * em LIMIARES; mudou um, sobe INDICES_VERSAO.
 *
 * Regras de saída (decisões do Laone, 20/10/2026):
 *   - nível é chance, nunca certeza: 'sem' / 'possivel' / 'provavel'
 *     (neve: 'sem_sinal' / 'baixa' / 'moderada' / 'alta');
 *   - gelo na pista só existe como alerta: o contrato publica as janelas de
 *     alerta e nada mais. Não há estado "pista ok", nem implícito: lista
 *     vazia quer dizer "o modelo não indica", e a UI manda para a fonte
 *     oficial em qualquer caso;
 *   - dado ausente vira null e nunca vira "sem".
 */

export const INDICES_VERSAO = '0.1.0';

export const LIMIARES = {
  neblina: {
    // Nevoeiro pela definição meteorológica: visibilidade abaixo de 1 km.
    visProvavel: 1000,
    // Névoa: entre 1 e 5 km a vista de mirante já some.
    visPossivel: 5000,
    // Sem visibilidade (ou com ela otimista), o ar saturado com nuvem baixa
    // em cima do ponto é neblina em montanha.
    saturadoUr: 98, saturadoSpread: 0.5, saturadoNuvemBaixa: 90, saturadoVentoMax: 20,
    umidoUr: 95, umidoSpread: 1.5, umidoNuvemBaixa: 60,
  },
  melhorHorario: {
    // Hora com chuva acima disto não serve para mirante.
    chuvaMax: 0.3,
  },
  geada: {
    // Madrugada e começo da manhã do dia: 00h às 08h.
    horaFim: 8,
    // A geada aparece com 2 a 3 °C no termômetro a 2 m, porque o chão esfria
    // mais que o ar; precisa de céu limpo e vento calmo.
    provavelTmin: 2, possivelTmin: 3.5,
    // Abaixo disto o frio basta, mesmo com vento ou nuvem.
    frioBastaTmin: -1, possivelSempreTmin: 1,
    calmoVento: 10, possivelVento: 15,
    ceuLimpoNuvem: 30, possivelNuvem: 60,
    // Chão a 0 °C ou menos (temperatura do solo do modelo, sem correção de altitude).
    soloPossivel: 0, soloProvavel: -1,
  },
  neve: {
    // A neve chega ao chão uns 300 m abaixo da isoterma de 0 °C.
    margemAlta: 300, margemBaixa: 700,
    altaNeveCm: 1, moderadaNeveCm: 0.2,
    chuvaHora: 0.1, tempModerada: 1, tempBaixa: 3,
  },
  gelo: {
    horasChuva: 6, chuvaMin: 0.2,
    soloMax: 0.5, tempMax: 1,
    // Ar saturado com neblina abaixo de zero deposita gelo (sincelo) sem chover.
    urSincelo: 97,
  },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Neblina numa hora. */
export function nivelNeblina({ vis, ur, temp, orvalho, nuvemBaixa, vento }) {
  const L = LIMIARES.neblina;
  vis = num(vis); ur = num(ur); temp = num(temp); orvalho = num(orvalho);
  nuvemBaixa = num(nuvemBaixa); vento = num(vento);
  const spread = temp !== null && orvalho !== null ? temp - orvalho : null;
  const temUmidade = ur !== null && spread !== null && nuvemBaixa !== null;
  if (vis === null && !temUmidade) return null;

  if (vis !== null && vis < L.visProvavel) return 'provavel';
  if (temUmidade && ur >= L.saturadoUr && spread <= L.saturadoSpread && nuvemBaixa >= L.saturadoNuvemBaixa
      && (vento === null || vento < L.saturadoVentoMax)) return 'provavel';
  if (vis !== null && vis < L.visPossivel) return 'possivel';
  if (temUmidade && ur >= L.umidoUr && spread <= L.umidoSpread && nuvemBaixa >= L.umidoNuvemBaixa) return 'possivel';
  return 'sem';
}

/**
 * Janelas de céu aberto num dia, só com sol (is_day). `horas` são os índices
 * da série que pertencem ao dia; `t` é a série de horários locais.
 * Devolve { janelas, melhor, motivo } com início e fim em "HH:MM" (fim é a
 * hora seguinte à última hora boa).
 */
export function melhorHorario(horas, s) {
  const L = LIMIARES.melhorHorario;
  const diurnas = horas.filter((i) => s.dia[i] === 1);
  if (diurnas.length === 0) return { janelas: [], melhor: null, motivo: 'sem_dado' };

  let semDado = 0, comNeblina = 0, comChuva = 0;
  const boa = (i) => {
    const n = s.neblina[i];
    const chuva = num(s.chuva[i]);
    if (n === null) { semDado++; return false; }
    if (n !== 'sem') { comNeblina++; return false; }
    if (chuva !== null && chuva > L.chuvaMax) { comChuva++; return false; }
    return true;
  };

  const janelas = [];
  let atual = null;
  for (const i of diurnas) {
    if (boa(i)) {
      if (atual && atual.ultimo === i - 1) { atual.ultimo = i; atual.vis.push(num(s.vis[i])); }
      else { atual = { primeiro: i, ultimo: i, vis: [num(s.vis[i])] }; janelas.push(atual); }
    } else {
      atual = null;
    }
  }

  const hora = (i) => s.t[i].slice(11, 16);
  const horaFim = (i) => (i + 1 < s.t.length ? hora(i + 1) : '24:00');
  const saida = janelas.map((j) => {
    const vis = j.vis.filter((v) => v !== null);
    return {
      inicio: hora(j.primeiro),
      fim: horaFim(j.ultimo),
      horas: j.ultimo - j.primeiro + 1,
      vis_min_m: vis.length ? Math.min(...vis) : null,
    };
  });

  let melhor = null;
  for (const j of saida) if (!melhor || j.horas > melhor.horas) melhor = j;

  let motivo = null;
  if (!melhor) {
    if (semDado === diurnas.length) motivo = 'sem_dado';
    else motivo = comChuva > comNeblina ? 'chuva' : 'neblina';
  }
  return { janelas: saida, melhor, motivo };
}

/** Geada na madrugada do dia. */
export function nivelGeada(horas, s) {
  const L = LIMIARES.geada;
  const madrugada = horas.filter((i) => Number(s.t[i].slice(11, 13)) <= L.horaFim);
  const temps = madrugada.map((i) => num(s.temp[i]));
  if (temps.every((v) => v === null)) return { nivel: null };

  let iMin = null;
  for (const i of madrugada) {
    const v = num(s.temp[i]);
    if (v !== null && (iMin === null || v < num(s.temp[iMin]))) iMin = i;
  }
  const tmin = num(s.temp[iMin]);
  const solos = madrugada.map((i) => num(s.solo[i])).filter((v) => v !== null);
  const soloMin = solos.length ? Math.min(...solos) : null;
  const vento = num(s.vento[iMin]);
  const nuvens = madrugada.map((i) => num(s.nuvem[i])).filter((v) => v !== null);
  const nuvem = nuvens.length ? nuvens.reduce((a, b) => a + b, 0) / nuvens.length : null;

  const calmo = vento !== null && vento <= L.calmoVento;
  const limpo = nuvem !== null && nuvem <= L.ceuLimpoNuvem;
  const ventoOk = vento === null || vento <= L.possivelVento;
  const nuvemOk = nuvem === null || nuvem <= L.possivelNuvem;

  let nivel = 'sem';
  if (tmin <= L.frioBastaTmin
      || (tmin <= L.provavelTmin && calmo && limpo)
      || (soloMin !== null && soloMin <= L.soloProvavel && calmo)) nivel = 'provavel';
  else if (tmin <= L.possivelSempreTmin
      || (tmin <= L.possivelTmin && ventoOk && nuvemOk)
      || (soloMin !== null && soloMin <= L.soloPossivel)) nivel = 'possivel';

  return {
    nivel,
    tmin: arred(tmin, 1),
    hora_tmin: s.t[iMin].slice(11, 16),
    solo_min: arred(soloMin, 1),
    vento_kmh: arred(vento, 0),
    nuvem_pct: arred(nuvem, 0),
  };
}

/** Chance de neve no dia, cruzando neve prevista, isoterma de 0 °C e altitude. */
export function nivelNeve(horas, s, altitude) {
  const L = LIMIARES.neve;
  const neves = horas.map((i) => num(s.neve[i]));
  const chuvas = horas.map((i) => num(s.chuva[i]));
  if (neves.every((v) => v === null) && chuvas.every((v) => v === null)) return { nivel: null };

  const neveCm = neves.reduce((a, v) => a + (v ?? 0), 0);
  const chuvaMm = chuvas.reduce((a, v) => a + (v ?? 0), 0);

  let margemMin = null;
  let moderadaPorFrio = false, baixaPorFrio = false;
  for (const i of horas) {
    const chuva = num(s.chuva[i]);
    const iso = num(s.isoterma[i]);
    const temp = num(s.temp[i]);
    if (chuva === null || chuva < L.chuvaHora || iso === null) continue;
    const margem = iso - altitude;
    if (margemMin === null || margem < margemMin) margemMin = margem;
    if (margem <= L.margemAlta && temp !== null && temp <= L.tempModerada) moderadaPorFrio = true;
    if (margem <= L.margemBaixa && temp !== null && temp <= L.tempBaixa) baixaPorFrio = true;
  }

  let nivel = 'sem_sinal';
  if (neveCm >= L.altaNeveCm && margemMin !== null && margemMin <= L.margemAlta) nivel = 'alta';
  else if (neveCm >= L.moderadaNeveCm || moderadaPorFrio) nivel = 'moderada';
  else if (neveCm > 0 || baixaPorFrio) nivel = 'baixa';

  return {
    nivel,
    neve_cm: arred(neveCm, 1),
    chuva_mm: arred(chuvaMm, 1),
    // Isoterma mais baixa nas horas com precipitação, e quanto ela fica acima do ponto.
    isoterma_min_m: margemMin === null ? null : Math.round(margemMin + altitude),
    margem_min_m: margemMin === null ? null : Math.round(margemMin),
  };
}

/** Alerta de gelo numa hora. Só `true` significa alguma coisa. */
export function alertaGelo(i, s) {
  const L = LIMIARES.gelo;
  const solo = num(s.solo[i]);
  const temp = num(s.temp[i]);
  const frio = (solo !== null && solo <= L.soloMax) || (temp !== null && temp <= L.tempMax);
  if (!frio) return false;

  let chuva6h = 0;
  for (let k = Math.max(0, i - L.horasChuva + 1); k <= i; k++) chuva6h += num(s.chuva[k]) ?? 0;
  const neve = (num(s.neve[i]) ?? 0) > 0;
  const ur = num(s.ur[i]);
  const sincelo = s.neblina[i] === 'provavel' && ur !== null && ur >= L.urSincelo;
  return chuva6h >= L.chuvaMin || neve || sincelo;
}

/** Junta horas seguidas com alerta em janelas { inicio, fim } (ISO local). */
export function janelasDeAlerta(indices, s) {
  const janelas = [];
  let atual = null;
  for (const i of indices) {
    if (alertaGelo(i, s)) {
      if (atual && atual.ultimo === i - 1) atual.ultimo = i;
      else { atual = { primeiro: i, ultimo: i }; janelas.push(atual); }
    } else {
      atual = null;
    }
  }
  return janelas.map((j) => ({
    inicio: s.t[j.primeiro],
    fim: j.ultimo + 1 < s.t.length ? s.t[j.ultimo + 1] : null,
  }));
}

export function arred(v, casas) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}
