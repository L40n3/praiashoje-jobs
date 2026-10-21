// node --test serra-hoje/indices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertaGelo, janelasDeAlerta, melhorHorario, nivelGeada, nivelNeblina, nivelNeve,
} from './indices.mjs';
import { PONTOS } from './pontos.mjs';
import { montarRetratos } from './coletar.mjs';

/** Série de 24 h do dia 2026-07-15 com todos os campos num valor base. */
function serie(base = {}) {
  const t = Array.from({ length: 24 }, (_, h) => `2026-07-15T${String(h).padStart(2, '0')}:00`);
  const campo = (v) => t.map(() => v);
  const s = {
    t,
    temp: campo(10), orvalho: campo(2), ur: campo(60), vis: campo(30000), nuvem: campo(10),
    nuvemBaixa: campo(0), vento: campo(5), chuva: campo(0), probChuva: campo(0), neve: campo(0),
    isoterma: campo(3500), solo: campo(10), dia: t.map((_, h) => (h >= 7 && h <= 17 ? 1 : 0)),
  };
  Object.assign(s, base);
  s.neblina = t.map((_, i) => nivelNeblina({
    vis: s.vis[i], ur: s.ur[i], temp: s.temp[i], orvalho: s.orvalho[i], nuvemBaixa: s.nuvemBaixa[i], vento: s.vento[i],
  }));
  return s;
}
const todas = Array.from({ length: 24 }, (_, i) => i);

test('neblina: visibilidade abaixo de 1 km é provável, até 5 km é possível', () => {
  assert.equal(nivelNeblina({ vis: 300 }), 'provavel');
  assert.equal(nivelNeblina({ vis: 3000 }), 'possivel');
  assert.equal(nivelNeblina({ vis: 30000, ur: 60, temp: 10, orvalho: 2, nuvemBaixa: 0 }), 'sem');
});

test('neblina: ar saturado com nuvem baixa vale mesmo sem visibilidade', () => {
  assert.equal(nivelNeblina({ vis: null, ur: 100, temp: 2, orvalho: 2, nuvemBaixa: 100, vento: 5 }), 'provavel');
  assert.equal(nivelNeblina({ vis: null, ur: 96, temp: 3, orvalho: 2, nuvemBaixa: 70 }), 'possivel');
});

test('neblina: sem nenhum dado é null, nunca "sem"', () => {
  assert.equal(nivelNeblina({}), null);
  assert.equal(nivelNeblina({ vis: null, ur: 99 }), null);
});

test('melhor horário: pega a janela mais longa de dia, sem neblina nem chuva', () => {
  const vis = Array(24).fill(30000);
  for (const h of [7, 8, 9, 13]) vis[h] = 200;
  const chuva = Array(24).fill(0);
  chuva[16] = 2;
  const r = melhorHorario(todas, serie({ vis, chuva }));
  assert.deepEqual(r.janelas.map((j) => [j.inicio, j.fim]), [['10:00', '13:00'], ['14:00', '16:00'], ['17:00', '18:00']]);
  assert.equal(r.melhor.inicio, '10:00');
  assert.equal(r.motivo, null);
});

test('melhor horário: dia todo fechado devolve o motivo', () => {
  const r = melhorHorario(todas, serie({ vis: Array(24).fill(100) }));
  assert.equal(r.melhor, null);
  assert.equal(r.motivo, 'neblina');
});

test('geada: 2 °C com céu limpo e vento calmo é provável', () => {
  const temp = Array(24).fill(8);
  temp[5] = 1.8;
  const r = nivelGeada(todas, serie({ temp, nuvem: Array(24).fill(10), vento: Array(24).fill(4) }));
  assert.equal(r.nivel, 'provavel');
  assert.equal(r.hora_tmin, '05:00');
});

test('geada: 2 °C com céu encoberto e vento não passa de possível', () => {
  const temp = Array(24).fill(8);
  temp[5] = 1.8;
  assert.equal(nivelGeada(todas, serie({ temp, nuvem: Array(24).fill(100), vento: Array(24).fill(25) })).nivel, 'sem');
  assert.equal(nivelGeada(todas, serie({ temp, nuvem: Array(24).fill(50), vento: Array(24).fill(12) })).nivel, 'possivel');
});

test('geada: o ajuste do ponto entra na mínima antes dos limiares', () => {
  const temp = Array(24).fill(8);
  temp[5] = 2.8;
  const s = serie({ temp, nuvem: Array(24).fill(10), vento: Array(24).fill(4) });
  assert.equal(nivelGeada(todas, s).nivel, 'possivel');
  const r = nivelGeada(todas, s, -1);
  assert.equal(r.nivel, 'provavel');
  assert.equal(r.tmin, 1.8);
  assert.equal(r.ajuste_c, -1);
  assert.equal(nivelGeada(todas, s).ajuste_c, undefined);
});

test('geada: abaixo de -1 °C basta o frio', () => {
  const temp = Array(24).fill(3);
  temp[6] = -1.5;
  assert.equal(nivelGeada(todas, serie({ temp, nuvem: Array(24).fill(90), vento: Array(24).fill(30) })).nivel, 'provavel');
});

test('neve: neve prevista com isoterma perto do ponto é alta; sem precipitação é sem sinal', () => {
  const neve = Array(24).fill(0); neve[3] = 0.8; neve[4] = 0.6;
  const chuva = Array(24).fill(0); chuva[3] = 1; chuva[4] = 1;
  const iso = Array(24).fill(1500);
  const r = nivelNeve(todas, serie({ neve, chuva, isoterma: iso, temp: Array(24).fill(0) }), 1355);
  assert.equal(r.nivel, 'alta');
  assert.equal(r.margem_min_m, 145);
  assert.equal(nivelNeve(todas, serie({ temp: Array(24).fill(-3) }), 1355).nivel, 'sem_sinal');
});

test('neve: chuva fria com isoterma baixa sem neve do modelo é moderada', () => {
  const chuva = Array(24).fill(0); chuva[2] = 0.5;
  const r = nivelNeve(todas, serie({ chuva, isoterma: Array(24).fill(1500), temp: Array(24).fill(0.5) }), 1355);
  assert.equal(r.nivel, 'moderada');
});

test('gelo: chuva nas últimas 6 h com chão a zero gera alerta; frio seco não', () => {
  const solo = Array(24).fill(5); solo[5] = 0; solo[6] = -0.5;
  const chuva = Array(24).fill(0); chuva[1] = 0.4;
  const s = serie({ solo, chuva });
  assert.equal(alertaGelo(5, s), true);
  assert.equal(alertaGelo(6, s), true);
  assert.deepEqual(janelasDeAlerta(todas, s), [{ inicio: '2026-07-15T05:00', fim: '2026-07-15T07:00' }]);
  assert.equal(alertaGelo(5, serie({ solo })), false);
});

test('retrato: um arquivo por site, com o dia de hoje e os pontos do catálogo', () => {
  const t = [];
  for (const dia of ['2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18']) {
    for (let h = 0; h < 24; h++) t.push(`${dia}T${String(h).padStart(2, '0')}:00`);
  }
  const resposta = (p) => ({
    latitude: p.lat, longitude: p.lon,
    hourly: {
      time: t,
      temperature_2m: t.map(() => 5), dew_point_2m: t.map(() => 4), relative_humidity_2m: t.map(() => 90),
      visibility: t.map(() => 20000), cloud_cover: t.map(() => 20), cloud_cover_low: t.map(() => 10),
      wind_speed_10m: t.map(() => 5), precipitation: t.map(() => 0), precipitation_probability: t.map(() => 0),
      snowfall: t.map(() => 0), freezing_level_height: t.map(() => 3000), soil_temperature_0cm: t.map(() => 6),
      is_day: t.map((x) => (Number(x.slice(11, 13)) >= 7 && Number(x.slice(11, 13)) <= 17 ? 1 : 0)),
    },
    daily: { time: t.filter((x) => x.endsWith('T00:00')).map((x) => x.slice(0, 10)), sunrise: [], sunset: [] },
  });
  const r = montarRetratos(PONTOS.map(resposta), new Date('2026-07-15T12:00:00Z'));
  assert.equal(r.sc.hoje, '2026-07-15');
  assert.equal(r.sc.pontos.length + r.sg.pontos.length, PONTOS.length);
  const mirante = r.sc.pontos.find((p) => p.id === 'morro-da-igreja');
  assert.equal(mirante.horas.inicio, '2026-07-15T00:00');
  assert.equal(mirante.horas.temp.length, 48);
  assert.equal(mirante.dias.length, 4);
  assert.ok(mirante.dias[0].melhor_horario);
  assert.equal(mirante.dias[2].melhor_horario, undefined);
  assert.ok(mirante.dias[1].neve);
  assert.equal(mirante.dias[2].neve, undefined);
  assert.ok(mirante.dias[3].geada);
  assert.deepEqual(mirante.gelo.janelas_alerta, []);
  assert.equal(r.sg.pontos.find((p) => p.id === 'gramado').gelo, undefined);
  // Campos de Cima da Serra: −1 °C só na geada; a série hora a hora não muda.
  const itaimbezinho = r.sg.pontos.find((p) => p.id === 'itaimbezinho');
  assert.equal(itaimbezinho.dias[0].geada.tmin, 4);
  assert.equal(itaimbezinho.dias[0].geada.ajuste_c, -1);
  assert.equal(itaimbezinho.horas.temp[0], 5);
  assert.equal(r.sg.pontos.find((p) => p.id === 'gramado').dias[0].geada.tmin, 5);
});
