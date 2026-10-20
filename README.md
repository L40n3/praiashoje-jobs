# praiashoje-jobs

Jobs de coleta do [PraiasHoje](https://praiashoje.com.br) que rodam no GitHub Actions.

O repositório é público para que esses jobs não consumam a cota de minutos do
plano Free. Nada aqui é sensível: os scripts leem só dados abertos e os
segredos de publicação ficam nos *secrets* do repositório.

| job | fonte | cadência |
|---|---|---|
| `lightning-relay` | NOAA GOES-19 / GLM (atividade elétrica), acesso anônimo | a cada 30 min, disparado externamente |
| `relay-buscar-indice` | índice do buscador de praias (código do repositório privado) | a cada 2 h, disparado externamente |
| `relay-floripa-hoje` | retrato de praias do FloripaTrip (código do repositório privado) | 8 vezes ao dia, disparado externamente |
| `relay-serra-hoje` | Open-Meteo: neblina, geada, neve e gelo nas duas serras ([serra-hoje/](serra-hoje/README.md)) | 8 vezes ao dia, disparado externamente |

O código do produto continua no repositório privado. O `lightning-relay` roda uma
cópia do script, com a origem registrada no próprio arquivo. O `relay-serra-hoje`
mora inteiro aqui (script, índices e os PHPs da HostGator), porque não usa nada
do PraiasHoje. Os outros dois fazem
checkout do repositório privado com uma deploy key só de leitura: aqui ficam só o
workflow e os logs, nunca o código.
