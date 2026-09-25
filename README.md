# praiashoje-jobs

Jobs de coleta do [PraiasHoje](https://praiashoje.com.br) que rodam no GitHub Actions.

O repositório é público para que esses jobs não consumam a cota de minutos do
plano Free. Nada aqui é sensível: os scripts leem só dados abertos e os
segredos de publicação ficam nos *secrets* do repositório.

| job | fonte | cadência |
|---|---|---|
| `lightning-relay` | NOAA GOES-19 / GLM (atividade elétrica), acesso anônimo | a cada 30 min, disparado externamente |

O código do produto continua no repositório privado. Os scripts daqui são cópias
e a origem deles fica registrada no próprio arquivo.
