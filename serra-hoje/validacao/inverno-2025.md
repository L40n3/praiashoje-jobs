# Validação do serra-hoje: inverno de 2025

Comparação entre o que os índices 0.1.0 teriam dito e o que as estações automáticas do INMET mediram, de 1º de maio a 30 de setembro de 2025. Feita em 20 e 21/10/2026 com `validacao/validar.mjs`. As tabelas completas estão no fim.

## De onde vêm os números

- **Medido:** arquivo anual de 2025 do INMET (portal.inmet.gov.br/dadoshistoricos). Entraram cinco estações: São Joaquim (A815, 1.400 m, sem dados em boa parte de junho), Lages (A865, 953 m), São José dos Ausentes (A829, 1.229 m, sem maio), Cambará do Sul (A897, 1.017 m) e Canela (A879, 831 m, só maio). A do Morro da Igreja (A845, 1.790 m), que seria a melhor referência para mirante, ficou fora do ar o ano de 2025 inteiro.
- **Previsto:** Open-Meteo na coordenada e na altitude de cada estação, com as mesmas funções do job.
  - **Antecedência 0:** previsões arquivadas, as primeiras horas de cada rodada. É o "hoje" do retrato e o melhor caso.
  - **Antecedência 1 e 2:** a previsão feita 1 e 2 dias antes. Essa API não guarda visibilidade, nuvem baixa, isoterma nem temperatura do solo, então neblina, melhor horário e gelo não têm como ser julgados nessas antecedências.
- **O INMET não mede neblina nem geada.** As referências são aproximações:
  - neblina = umidade de 97% ou mais na hora;
  - geada = mínima da madrugada até 3 °C ("possível") e até 1 °C ("provável");
  - neve = a lista de ocorrências da página de neve do SerraCatarinense.

  Uma madrugada fria e nublada entra como "geada" na referência, mas provavelmente não teve geada.
- **As estações ficam em cidade, não em mirante.** O resultado de neblina vale para a cidade. Na borda do cânion, onde a neblina sobe do litoral, o comportamento pode ser outro.

## Leitura

**Temperatura da madrugada: boa, e é a base da geada.**
- **No dia:** erro médio de 0,8 a 1,5 °C, com 82% a 93% dos dias dentro de 2 °C (Canela, só com maio, 71%).
- **Com 2 dias:** erro médio de 1 a 1,8 °C.
- **São Joaquim:** a previsão sai cerca de 1 °C mais fria que o medido.
- **Cambará do Sul:** sai 0,5 °C mais quente na média e 2 a 4 °C mais quente nas noites limpas e calmas de campo aberto. Exemplos: 31/05 previu 5,8 °C e mediu 2,4 °C; 02/06 previu 6,2 °C e mediu 1,5 °C; 12/09 previu 6 °C e mediu 1,8 °C.

**Geada: o "provável" é confiável, o "possível" erra para os dois lados.**
- **"Provável":** a mínima ficou até 1 °C na maior parte das vezes (alarme falso de 0% a 50% conforme a estação, 25% somando as cinco).
- **"Possível", São Joaquim:** 68% de alarme falso, puxado pelo viés frio.
- **"Possível", Cambará e Ausentes:** perde cerca de metade das madrugadas frias, puxado pelo viés quente nas noites limpas e pelos dias frios nublados que a referência conta como geada.
- **Afrouxar o filtro de nuvem e vento não mudou nada:** o que falta é temperatura, não regra.

**Neblina: quando o índice diz "provável", costuma estar certo; mas deixa passar a maior parte.**
- **Quando diz "provável":** a estação estava dentro da nuvem em 66% a 81% das horas em São Joaquim, Cambará e Canela.
- **O que deixa passar:** o índice pegou só 25% a 47% das horas de neblina. Ou seja, ele tende a dizer "aberto" quando estava fechado.
- **Variações testadas não resolvem:** umidade 97% em vez de 98%, nuvem baixa 80% em vez de 90%, visibilidade de 2 km. O acerto subiu de 30% para no máximo 35%, com mais alarme falso. A neblina perdida não aparece na previsão de umidade, nuvem nem visibilidade, então nenhum limiar a recupera.
- **Lages e Ausentes** têm poucas horas de neblina com sol, e o número ali não diz muito.

**Melhor horário: a janela ajuda pouco; o "hoje não tem janela" vale.**
- **A janela:** nas horas que o índice indicou, 82% a 100% foram limpas, contra 75% a 97% no dia inteiro. A maioria das horas de sol já é limpa nessas estações, então a janela pouco acrescenta.
- **O aviso "sem janela":** é raro (de 0 a 4 dias no inverno por estação), e o dia foi fechado de fato em 5 dos 7 casos.
- **Para o texto da página:** dá para afirmar com mais força o dia fechado do que a janela aberta.

**Neve: só serve para hoje e, com sorte, amanhã.**
- **No dia:** viu 29/05 (moderada em São Joaquim e Ausentes, alta em Cambará) e 09/08 (moderada em São Joaquim e Ausentes).
- **Com 1 dia:** viu só 29/05.
- **Com 2 dias:** não viu nenhum.
- **30/06:** não apareceu em nenhuma antecedência, porque o modelo não previu precipitação.
- **Alarmes sem registro:** quatro dias, todos "baixa" ou "moderada" (28 e 29/07 e 08/08 em São Joaquim, 24/08 em Cambará). O 08/08 é véspera do 09/08.

**Gelo: inconclusivo.**
- **No dia:** São Joaquim acerta metade das horas com poucos alarmes falsos.
- **Cambará:** quase não alerta, porque o gelo por sincelo depende da neblina, que o índice subestima.
- **Com 1 e 2 dias:** os dados guardados não têm as variáveis, então não há como julgar.
- **A referência é a própria regra aplicada ao medido**, sem a temperatura do asfalto. É o item com menos base, e continua só como alerta.

## O que proponho (nada aplicado)

1. **Neve só para hoje e amanhã.** Tirar D+2 e D+3 do retrato: com dois dias de antecedência o modelo não viu nenhum dos três episódios.
2. **No texto, a neblina "provável" e o dia sem janela podem ser afirmados com mais força; a ausência de neblina, não.** Sugestão para a fase 4: "a previsão não indica neblina" em vez de "céu aberto", e sempre o horário do dado.
3. **Correção de temperatura por ponto para a geada, só depois de testar em 2026.**
   - Em 2025, somar −1 °C à previsão em Cambará fez a geada "possível" subir de 53% para 74% das madrugadas frias, com alarme falso de 0% para 13%.
   - Somar +1 °C em São Joaquim baixou o alarme falso de 68% para 58%, mas perdeu acertos.
   - Com 1 dia de antecedência, Cambará piorou.
   - Como foi calibrado e medido no mesmo inverno, não é prova. Para confirmar, são precisos os dados de 2026.
4. **Dados de 2026.** O arquivo anual sai por volta de março de 2027. Para não esperar, o Laone exporta à mão em tempo.inmet.gov.br os CSVs de maio a setembro de 2026 de A845 (Morro da Igreja, se tiver dado), A815, A829, A897 e B820 (São Francisco de Paula). A página tem reCAPTCHA e limita cada exportação a 6 meses. Com isso dá para testar a correção do item 3 fora da amostra e, se a A845 voltou, medir um mirante de verdade.
5. **O histórico do servidor** (`historico/` em api.floripatrip.com) acumula, a partir de agora, o que o retrato disse de fato. Comparado com a A845 e com câmeras ao vivo, é a única forma de julgar neblina e melhor horário em mirante.

## Tabelas

Índices 0.1.0. Gerado por `validacao/validar.mjs` em 2026-10-21. Como ler: "acertos / alarmes falsos / perdidos"; **POD** é a parte dos eventos que o índice previu, **FAR** a parte dos avisos que não se confirmaram.

### Antecedência 0 (o "hoje" do retrato)

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 102 | -1 °C | 1.3 °C | 82% |
| LAGES (A865, 953 m) | 153 | 0 °C | 0.8 °C | 93% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 119 | 0.6 °C | 1 °C | 92% |
| CAMBARA DO SUL (A897, 1017 m) | 153 | 0.5 °C | 1.2 °C | 86% |
| CANELA (A879, 831 m) | 34 | -1.2 °C | 1.5 °C | 71% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 7 / 15 / 2 | 78% | 68% | 3 / 3 / 2 | 60% | 50% |
| LAGES (A865, 953 m) | 11 / 4 / 3 | 79% | 27% | 6 / 1 / 1 | 86% | 14% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 11 / 2 / 11 | 50% | 15% | 5 / 2 / 3 | 63% | 29% |
| CAMBARA DO SUL (A897, 1017 m) | 10 / 0 / 9 | 53% | 0% | 3 / 0 / 5 | 38% | 0% |
| CANELA (A879, 831 m) | 1 / 3 / 0 | 100% | 75% | 1 / 0 / 0 | 100% | 0% |

#### Neblina (horas de sol, umidade medida ≥ 97%)

| estação | "provável" | POD | FAR | "possível" ou mais | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 38 / 20 / 55 | 41% | 34% | 57 / 52 / 36 | 61% | 48% |
| LAGES (A865, 953 m) | 3 / 8 / 18 | 14% | 73% | 5 / 14 / 16 | 24% | 74% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 2 / 11 / 0 | 100% | 85% | 2 / 11 / 0 | 100% | 85% |
| CAMBARA DO SUL (A897, 1017 m) | 102 / 24 / 299 | 25% | 19% | 155 / 40 / 246 | 39% | 21% |
| CANELA (A879, 831 m) | 20 / 5 / 23 | 47% | 20% | 27 / 16 / 16 | 63% | 37% |

#### Melhor horário

| estação | dias com janela | horas limpas na janela | dias com 75% ou mais limpo | horas limpas no dia todo (referência) | dias sem janela | horas limpas neles | dias sem janela de fato fechados (até 25% limpo) |
|---|---|---|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 120 | 96% | 94% | 90% | 2 | 0% | 100% |
| LAGES (A865, 953 m) | 108 | 98% | 98% | 97% | 0 | — | — |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 3 | 100% | 100% | 81% | 1 | 40% | 0% |
| CAMBARA DO SUL (A897, 1017 m) | 149 | 82% | 76% | 75% | 4 | 18% | 75% |
| CANELA (A879, 831 m) | 33 | 87% | 85% | 83% | 0 | — | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 7 / 2 / 7 | 50% | 22% |
| LAGES (A865, 953 m) | 0 / 1 / 4 | 0% | 100% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 4 / 11 / 2 | 67% | 73% |
| CAMBARA DO SUL (A897, 1017 m) | 1 / 1 / 21 | 5% | 50% |
| CANELA (A879, 831 m) | 0 / 0 / 0 | — | — |

### Antecedência 1 dia

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 102 | -1.1 °C | 1.6 °C | 67% |
| LAGES (A865, 953 m) | 153 | -0.1 °C | 0.9 °C | 91% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 119 | -0.5 °C | 1.3 °C | 79% |
| CAMBARA DO SUL (A897, 1017 m) | 153 | 0.4 °C | 1.3 °C | 80% |
| CANELA (A879, 831 m) | 34 | -0.8 °C | 1.4 °C | 79% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 5 / 11 / 4 | 56% | 69% | 4 / 2 / 1 | 80% | 33% |
| LAGES (A865, 953 m) | 9 / 4 / 5 | 64% | 31% | 5 / 1 / 2 | 71% | 17% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 12 / 9 / 10 | 55% | 43% | 6 / 2 / 2 | 75% | 25% |
| CAMBARA DO SUL (A897, 1017 m) | 7 / 4 / 12 | 37% | 36% | 4 / 0 / 4 | 50% | 0% |
| CANELA (A879, 831 m) | 0 / 0 / 1 | 0% | — | 0 / 0 / 1 | 0% | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 0 / 0 / 14 | 0% | — |
| LAGES (A865, 953 m) | 0 / 0 / 4 | 0% | — |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 0 / 0 / 6 | 0% | — |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 3 / 22 | 0% | 100% |
| CANELA (A879, 831 m) | 0 / 0 / 0 | — | — |

### Antecedência 2 dias

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 102 | -1.2 °C | 1.8 °C | 61% |
| LAGES (A865, 953 m) | 153 | -0.1 °C | 1 °C | 90% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 119 | -0.4 °C | 1.3 °C | 79% |
| CAMBARA DO SUL (A897, 1017 m) | 153 | 0.4 °C | 1.4 °C | 78% |
| CANELA (A879, 831 m) | 34 | -0.9 °C | 1.4 °C | 82% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 6 / 10 / 3 | 67% | 63% | 4 / 1 / 1 | 80% | 20% |
| LAGES (A865, 953 m) | 11 / 5 / 3 | 79% | 31% | 5 / 1 / 2 | 71% | 17% |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 14 / 8 / 8 | 64% | 36% | 6 / 2 / 2 | 75% | 25% |
| CAMBARA DO SUL (A897, 1017 m) | 9 / 5 / 10 | 47% | 36% | 4 / 0 / 4 | 50% | 0% |
| CANELA (A879, 831 m) | 1 / 1 / 0 | 100% | 50% | 0 / 0 / 1 | 0% | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOAQUIM (A815, 1400 m) | 0 / 0 / 14 | 0% | — |
| LAGES (A865, 953 m) | 0 / 0 / 4 | 0% | — |
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 0 / 0 / 6 | 0% | — |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 0 / 22 | 0% | — |
| CANELA (A879, 831 m) | 0 / 0 / 0 | — | — |

### Neve, dia a dia

Dias em que algum índice saiu de `sem_sinal`, ou que estão na lista de ocorrências. "Chuva fria" são as horas com chuva medida e ar até 1,5 °C.

| dia | nevou? | SAO JOAQUIM (A815, 1400 m) | LAGES (A865, 953 m) | SAO JOSE DOS AUSENTES (A829, 1229 m) | CAMBARA DO SUL (A897, 1017 m) | CANELA (A879, 831 m) |
|---|---|---|---|---|---|---|
| 2025-05-29 | sim | moderada / moderada / · | · / · / · | moderada / · / · (3 h fria) | alta / moderada / · | · / · / · |
| 2025-06-30 | sim | · / · / · | · / · / · | · / · / · | · / · / · | · / · / · |
| 2025-07-28 |  | baixa / · / · | · / · / · | · / · / · | · / · / · | · / · / · |
| 2025-07-29 |  | baixa / · / · | · / · / · | · / · / · | · / · / · | · / · / · |
| 2025-08-08 |  | baixa / · / · | · / · / · | · / · / · | · / · / · | · / · / · |
| 2025-08-09 | sim | moderada / · / · | · / · / · | moderada / · / · (2 h fria) | baixa / · / · | baixa / · / · |
| 2025-08-24 |  | · / · / · | · / · / · | · / · / · | moderada / · / · | · / · / · |

Cada célula: antecedência 0 / 1 / 2 dias. `·` é sem sinal.
