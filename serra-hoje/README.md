# serra-hoje

Condições das duas serras para o [SerraCatarinenseTrip](https://serracatarinensetrip.com.br) e o [SerraGaúchaTrip](https://serragauchatrip.com.br): neblina hora a hora, chance de geada e de neve por dia, melhor horário em mirante e alerta de gelo na estrada. A fonte é o [Open-Meteo](https://open-meteo.com/) (CC BY 4.0), modelo `best_match`.

## Esteira

```
cron do cPanel (php/serra-hoje-cron.php, 8x/dia)
  -> workflow_dispatch: .github/workflows/relay-serra-hoje.yml
       node --test serra-hoje/indices.test.mjs
       node serra-hoje/coletar.mjs   -> relay-out/serra-hoje/serra-hoje-{sc,sg}.json
       node serra-hoje/upload.mjs    -> POST api.floripatrip.com/serra-hoje-relay-upload.php?site=...
  -> api.floripatrip.com/serra-hoje-relay.php?site=sc|sg  (CORS: domínios das serras e localhost)
  -> navegador (componente Astro dos sites, fase 4)
```

Nada passa pela Vercel: os sites são estáticos e leem o JSON no navegador, então o dado se renova sem deploy. O upload guarda também uma cópia compactada de cada retrato por 45 dias em `/home1/laoneb51/data/serra-hoje/historico/<site>/`, para a validação.

| arquivo | o que faz |
|---|---|
| `pontos.mjs` | catálogo: 18 pontos, com coordenada, altitude e a fonte de cada uma |
| `indices.mjs` | os índices e todos os limiares (`LIMIARES`, `INDICES_VERSAO`) |
| `coletar.mjs` | chama o Open-Meteo, calcula e escreve um arquivo por site |
| `upload.mjs` | publica os dois arquivos |
| `indices.test.mjs` | testes (`node --test serra-hoje/indices.test.mjs`) |
| `php/` | os três PHPs que sobem para a HostGator |

## Regras que o contrato carrega

Decisões do Laone em 20/10/2026:

- **Chance, nunca certeza.** Neblina e geada: `sem`, `possivel`, `provavel`. Neve: `sem_sinal`, `baixa`, `moderada`, `alta`. O texto da página segue o GUIA-VOZ ("a previsão indica", nunca "vai").
- **Gelo só como alerta.** O contrato publica `gelo.janelas_alerta` e mais nada. Lista vazia quer dizer "o modelo não indica", não "pista sem gelo": a página nunca mostra estado verde de estrada e sempre manda para a fonte oficial.
- **Dado ausente é `null`**, nunca `sem`.
- **`estado`** vale `sombra` até o Laone liberar a exibição. Os sites só mostram o bloco com `publico`. Para ligar ou desligar sem deploy: variável `SERRA_HOJE_ESTADO` em Settings → Secrets and variables → Actions → Variables deste repositório.

## Contrato `serra-hoje/1`

```jsonc
{
  "contrato": "serra-hoje/1",
  "indices_versao": "0.1.0",
  "estado": "sombra",              // ou "publico"
  "site": "sc",                    // ou "sg"
  "gerado_em": "2026-10-20T21:47:42.565Z",
  "fuso": "America/Sao_Paulo",
  "hoje": "2026-10-20",            // dia local da serra quando o retrato foi gerado
  "fonte": { "nome": "Open-Meteo", "url": "https://open-meteo.com/", "licenca": "CC BY 4.0", "modelo": "best_match" },
  "pontos": [{
    "id": "morro-da-igreja", "nome": "Morro da Igreja", "tipo": "mirante",   // mirante | cidade | atracao
    "lat": -28.12721, "lon": -49.48015, "altitude_m": 1787,
    "coord_fonte": "…", "altitude_fonte": "…",
    "grade": { "lat": -28.1, "lon": -49.5 },   // célula do modelo que respondeu
    "horas": {                                  // hoje 00h até amanhã 23h, 48 valores por coluna
      "inicio": "2026-10-20T00:00", "passo_min": 60,
      "temp": [], "orvalho": [], "ur": [], "vis_m": [], "nuvem": [], "nuvem_baixa": [],
      "vento_kmh": [], "chuva_mm": [], "prob_chuva": [], "neve_cm": [], "isoterma_m": [],
      "solo": [], "dia": [], "neblina": []      // neblina: "sem" | "possivel" | "provavel" | null
    },
    "dias": [{                                  // hoje até D+3
      "data": "2026-10-20", "nascer": "05:31", "por": "18:47",
      "geada": { "nivel": "possivel", "tmin": 0.8, "hora_tmin": "06:00", "solo_min": 1.2, "vento_kmh": 3, "nuvem_pct": 20 },
      "neve": { "nivel": "sem_sinal", "neve_cm": 0, "chuva_mm": 0, "isoterma_min_m": null, "margem_min_m": null },
      "melhor_horario": {                       // só mirante, só hoje e amanhã
        "janelas": [{ "inicio": "08:00", "fim": "18:00", "horas": 10, "vis_min_m": 8400 }],
        "melhor": { "inicio": "08:00", "fim": "18:00", "horas": 10, "vis_min_m": 8400 },
        "motivo": null                          // sem janela: "neblina" | "chuva" | "sem_dado"
      }
    }],
    "gelo": { "estrada": "SC-390", "janelas_alerta": [{ "inicio": "2026-07-15T04:00", "fim": "2026-07-15T07:00" }] }
  }]
}
```

`gelo` só aparece nos pontos com estrada de serra perto (`gelo: true` no catálogo). `estrada` é `null` quando o nome não é certo: aí a página fala em "estradas da região".

## Índices, versão 0.1.0

Os números estão em `LIMIARES` (`indices.mjs`) e foram escritos antes da validação. A fase de sombra ajusta.

- **Neblina (hora):** `provavel` com visibilidade abaixo de 1 km, ou com ar saturado (umidade ≥ 98%, temperatura até 0,5 °C do ponto de orvalho, nuvem baixa ≥ 90%, vento abaixo de 20 km/h). `possivel` com visibilidade abaixo de 5 km, ou umidade ≥ 95%, diferença até 1,5 °C e nuvem baixa ≥ 60%.
- **Melhor horário (mirante):** a janela seguida mais longa com sol, sem neblina e sem chuva acima de 0,3 mm/h.
- **Geada (madrugada, 00h às 08h):** `provavel` com mínima até 2 °C, céu limpo (nuvem ≤ 30%) e vento até 10 km/h; ou mínima até −1 °C; ou chão até −1 °C com vento calmo. `possivel` com mínima até 3,5 °C, nuvem ≤ 60% e vento ≤ 15 km/h; ou mínima até 1 °C; ou chão até 0 °C. A temperatura do ar é corrigida pela altitude do ponto; a do solo é a da célula do modelo.
- **Neve (dia):** `alta` com 1 cm ou mais de neve prevista e isoterma de 0 °C até 300 m acima do ponto nas horas com precipitação. `moderada` com 0,2 cm, ou precipitação com isoterma até 300 m acima e ar até 1 °C. `baixa` com qualquer neve prevista, ou precipitação com isoterma até 700 m acima e ar até 3 °C.
- **Gelo (hora, só alerta):** chão até 0,5 °C ou ar até 1 °C, com chuva de 0,2 mm ou mais nas 6 horas anteriores, neve prevista ou neblina com ar saturado (sincelo).

## Validação

Para refazer o retrato de um dia passado com as previsões arquivadas do Open-Meteo (o retrato sai marcado como `reprocessado` e o upload recusa):

```bash
SERRA_HOJE_DATA=2025-08-09 RELAY_OUT_DIR=/tmp/rep node serra-hoje/coletar.mjs
```

Primeira rodada, em 20/10/2026, contra os dias de neve da página de neve do SerraCatarinense:

| dia | o que aconteceu | o que o índice disse |
|---|---|---|
| 29/05/2025 | nevou | São Joaquim `alta`, Urupema `moderada`, Morro da Igreja e Rio do Rastro `baixa` |
| 30/06/2025 | nevou | `sem_sinal` em todos: o modelo não previu precipitação (ar seco, isoterma acima de 3.300 m) |
| 09/08/2025 | nevou | São Joaquim e Rio do Rastro `moderada`, Urupema e Morro da Igreja `baixa` |
| 06/09/2026 | Defesa Civil confirmou neve | Morro da Igreja `moderada`, demais `sem_sinal` |

A API de previsões arquivadas junta as primeiras horas de cada rodada, então é o melhor caso: a previsão de verdade, de um a três dias antes, erra mais.
