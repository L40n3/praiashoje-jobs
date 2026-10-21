/**
 * Catálogo de pontos do serra-hoje: onde o job pede previsão ao Open-Meteo.
 *
 * Coordenadas copiadas dos mapas dos hubs (`src/data/mapas-hubs.ts` de cada
 * site), com a mesma fonte; o Lago Negro, que lá é `centro: true`, veio do
 * OSM. A altitude é passada ao Open-Meteo (`elevation`) para ele corrigir a
 * temperatura pela altitude do ponto e não pela da célula do modelo: sem
 * isso o Morro da Igreja saía a 1.443 m.
 *
 * Altitude: a do site quando ele já tem o fato (`src/data/fatos.ts`), senão
 * o Copernicus DEM GLO-90 pela API de elevação do Open-Meteo (20/10/2026). Em
 * mirante de borda de penhasco o DEM, de 90 m, mistura borda e paredão e
 * tende a dar menos: no Rio do Rastro deu 1.396 m contra 1.460 m. Por isso o
 * `altitudeFonte` diz de onde veio cada número.
 *
 * Campos:
 *   site     — 'sc' (serracatarinensetrip) ou 'sg' (serragauchatrip)
 *   tipo     — 'mirante' ganha `melhor_horario`; 'cidade' e 'atracao' não
 *   gelo     — publica janelas de alerta de gelo (estrada de serra perto)
 *   estrada  — nome da estrada, só onde ele é certo; senão o alerta fala
 *              em "estradas da região"
 *   ajusteGeada — °C somados à mínima prevista só no cálculo da geada.
 *              Campos de Cima da Serra: −1 °C, porque a previsão sai quente
 *              nas madrugadas de São José dos Ausentes e de Cambará do Sul
 *              (validação com o INMET, invernos de 2025 e 2026,
 *              validacao/inverno-2026.md). Na serra catarinense a previsão
 *              erra para o frio, então lá não há ajuste.
 */

const DEM = 'Copernicus DEM GLO-90, API de elevação do Open-Meteo, 20/10/2026';

/** @type {Array<{id:string,nome:string,site:'sc'|'sg',tipo:'mirante'|'cidade'|'atracao',lat:number,lon:number,coordFonte:string,altitude:number,altitudeFonte:string,gelo?:boolean,estrada?:string,ajusteGeada?:number}>} */
export const PONTOS = [
  // ── Serra Catarinense ────────────────────────────────────────────────
  { id: 'morro-da-igreja', nome: 'Morro da Igreja', site: 'sc', tipo: 'mirante', lat: -28.12721, lon: -49.48015, coordFonte: 'OSM, nó 1010835049 (mirante do Morro da Igreja)', altitude: 1787, altitudeFonte: DEM, gelo: true },
  { id: 'rio-do-rastro', nome: 'Mirante da Serra do Rio do Rastro', site: 'sc', tipo: 'mirante', lat: -28.39324, lon: -49.54883, coordFonte: 'OSM, nó 767990618', altitude: 1460, altitudeFonte: "serracatarinensetrip, src/data/fatos.ts ('rio-do-rastro-altitude-mirante'); o DEM dá 1.396 m", gelo: true, estrada: 'SC-390' },
  { id: 'corvo-branco', nome: 'Serra do Corvo Branco', site: 'sc', tipo: 'mirante', lat: -28.05599, lon: -49.36684, coordFonte: 'OSM, nó 5494608421 (mirante da Serra do Corvo Branco)', altitude: 1207, altitudeFonte: DEM, gelo: true, estrada: 'SC-370' },
  { id: 'canion-laranjeiras', nome: 'Cânion das Laranjeiras', site: 'sc', tipo: 'mirante', lat: -28.27044, lon: -49.54137, coordFonte: 'OSM, nó 5009816524', altitude: 1177, altitudeFonte: DEM },
  { id: 'morro-das-torres', nome: 'Morro das Torres', site: 'sc', tipo: 'mirante', lat: -27.92316, lon: -49.85903, coordFonte: 'OSM, nó 4255627814 (Mirante Morro das Torres)', altitude: 1719, altitudeFonte: DEM },
  { id: 'urubici', nome: 'Urubici', site: 'sc', tipo: 'cidade', lat: -28.015, lon: -49.592, coordFonte: 'serracatarinensetrip, centro do mapa do hub', altitude: 918, altitudeFonte: DEM },
  { id: 'sao-joaquim', nome: 'São Joaquim', site: 'sc', tipo: 'cidade', lat: -28.294, lon: -49.932, coordFonte: 'serracatarinensetrip, centro do mapa do hub', altitude: 1355, altitudeFonte: DEM, gelo: true },
  { id: 'bom-jardim-da-serra', nome: 'Bom Jardim da Serra', site: 'sc', tipo: 'cidade', lat: -28.338, lon: -49.628, coordFonte: 'serracatarinensetrip, centro do mapa do hub', altitude: 1224, altitudeFonte: DEM, gelo: true },
  { id: 'urupema', nome: 'Urupema', site: 'sc', tipo: 'cidade', lat: -27.956, lon: -49.876, coordFonte: 'serracatarinensetrip, centro do mapa do hub', altitude: 1327, altitudeFonte: DEM, gelo: true },
  { id: 'lages', nome: 'Lages', site: 'sc', tipo: 'cidade', lat: -27.816, lon: -50.326, coordFonte: 'serracatarinensetrip, centro do mapa do hub', altitude: 917, altitudeFonte: DEM },

  // ── Serra Gaúcha ─────────────────────────────────────────────────────
  { id: 'itaimbezinho', nome: 'Cânion Itaimbezinho', site: 'sg', tipo: 'mirante', lat: -29.15831, lon: -50.07856, coordFonte: 'OSM, nó 287169829 (Itaimbezinho)', altitude: 917, altitudeFonte: DEM, ajusteGeada: -1 },
  { id: 'fortaleza', nome: 'Cânion Fortaleza', site: 'sg', tipo: 'mirante', lat: -29.06288, lon: -49.95646, coordFonte: 'OSM, nó 5793683653 (Cânion Fortaleza)', altitude: 1091, altitudeFonte: DEM, ajusteGeada: -1 },
  { id: 'skyglass', nome: 'Skyglass', site: 'sg', tipo: 'mirante', lat: -29.27019, lon: -50.84416, coordFonte: 'OSM, relação 12217799', altitude: 730, altitudeFonte: DEM },
  { id: 'cambara-do-sul', nome: 'Cambará do Sul', site: 'sg', tipo: 'cidade', lat: -29.04895, lon: -50.14541, coordFonte: 'serragauchatrip, centro do mapa do hub', altitude: 1025, altitudeFonte: DEM, gelo: true, estrada: 'RS-020', ajusteGeada: -1 },
  { id: 'sao-francisco-de-paula', nome: 'São Francisco de Paula', site: 'sg', tipo: 'cidade', lat: -29.44845, lon: -50.5833, coordFonte: 'serragauchatrip, centro do mapa do hub', altitude: 902, altitudeFonte: DEM, gelo: true, estrada: 'RS-020' },
  { id: 'gramado', nome: 'Gramado', site: 'sg', tipo: 'cidade', lat: -29.37929, lon: -50.8737, coordFonte: 'serragauchatrip, centro do mapa do hub', altitude: 822, altitudeFonte: DEM },
  { id: 'lago-negro', nome: 'Lago Negro', site: 'sg', tipo: 'atracao', lat: -29.39496, lon: -50.87561, coordFonte: 'OSM, via 227673118 (Lago Negro)', altitude: 858, altitudeFonte: DEM },
  { id: 'canela', nome: 'Canela', site: 'sg', tipo: 'cidade', lat: -29.36361, lon: -50.80968, coordFonte: 'serragauchatrip, centro do mapa do hub', altitude: 837, altitudeFonte: DEM },
];
