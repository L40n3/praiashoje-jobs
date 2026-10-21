# Validação do serra-hoje: inverno de 2026

Segunda rodada, de 1º de maio a 30 de setembro de 2026, com os mesmos índices 0.1.0 e o mesmo método do [inverno de 2025](inverno-2025.md). Feita em 21/10/2026. As tabelas completas estão no fim.

## De onde vêm os números

- **Medido:** CSVs exportados à mão pelo Laone em tempo.inmet.gov.br em 20/10/2026. Os arquivos não dizem a estação, então ela foi identificada pela pressão média, comparada com a de 2025.
- **Entraram duas estações:**
  - São José dos Ausentes (A829, 1.229 m), com cerca de 70% das horas;
  - Cambará do Sul (A897, 1.017 m), só com parte de maio e algumas horas de julho e agosto (15 madrugadas com dado).
- **Ficaram de fora:**
  - um arquivo inteiro em branco, de estação desconhecida;
  - o de "São Francisco de Paula", que pela pressão é de uma estação a uns 360 m de altitude e não pode ser a B820;
  - São Joaquim (A815), que veio só de setembro e outubro, e sem dado de 02/09 a 09/10.

  **Não há nenhuma estação catarinense em 2026.**
- **Previsto e referências:** os mesmos de 2025. Neblina é umidade de 97% ou mais. Geada é mínima da madrugada até 3 °C ou até 1 °C. Antecedência 0 são as previsões arquivadas; 1 e 2 são as previsões feitas dias antes, sem as variáveis de neblina, solo e isoterma.

## Leitura

**O que 2026 confirma de 2025:**
- **"Hoje não tem janela" é o sinal mais confiável do sistema.** Em Ausentes o índice deu 10 dias sem janela, e os 10 foram fechados de fato: em média, só 3% das horas de sol ficaram limpas. Somando os dois invernos, são 15 de 17 dias.
- **A janela do melhor horário quase não acrescenta.** Em Ausentes, 64% das horas da janela foram limpas, contra 63% no dia inteiro. Vale o "não suba hoje", não o "suba das 10h às 15h".
- **Neblina "provável" acerta quando fala, mas fala pouco.** Em Ausentes, alarme falso de 13% e só 46% das horas de neblina vistas. Em Cambará, com poucos dias, o resultado é fraco.
- **Temperatura da madrugada:** erro médio de 1,2 °C no dia e 1,5 °C com 2 dias, em Ausentes.

**O que 2026 acrescenta:**
- **Ausentes é previsto quente nos dois anos:** +0,6 °C em 2025 e +0,9 °C em 2026. Por isso a geada "possível" perde metade das madrugadas frias, sem alarme falso em 2026.
- **Neve em 09/05/2026:** Ausentes deu "moderada" no dia e "baixa" com 1 e 2 dias de antecedência; Cambará, "baixa" com 1 e 2 dias. É o primeiro caso em que a antecedência de 2 dias viu alguma coisa. Não muda a decisão de mostrar neve só para hoje e amanhã: em 2025 foram três episódios sem sinal nenhum com 2 dias, e "baixa" com 2 dias de antecedência não é informação que se publique.
- **Neve em 06/09/2026:** foi na serra catarinense, e não há estação de SC em 2026 para julgar. No reprocessamento pelo catálogo, o Morro da Igreja deu "moderada" no dia.

## A correção de temperatura, testada fora da amostra

Teste: somar −1 °C à temperatura prevista só no cálculo da geada. A correção veio do viés de 2025, então 2026 é o teste com dado novo. Na tabela, "acertos / alarmes falsos / perdidos" e POD:

| estação, antecedência | 2025 sem | 2025 com −1 °C | 2026 sem | 2026 com −1 °C |
|---|---|---|---|---|
| Ausentes, "possível", dia | 11/2/11, POD 50% | 14/7/8, POD 64% | 19/0/20, POD 49% | 22/0/17, POD 56% |
| Ausentes, "possível", 1 dia | 12/9/10, POD 55% | 17/15/5, POD 77% | 20/0/19, POD 51% | 24/0/15, POD 62% |
| Ausentes, "possível", 2 dias | 14/8/8, POD 64% | 16/13/6, POD 73% | 16/0/23, POD 41% | 22/1/17, POD 56% |
| Ausentes, "provável", dia | 5/2/3, POD 62% | 6/3/2, POD 75% | 6/2/11, POD 35% | 8/3/9, POD 47% |
| Ausentes, "provável", 1 dia | 6/2/2, POD 75% | 6/8/2, POD 75% | 4/1/13, POD 24% | 9/2/8, POD 53% |
| Cambará, "possível", dia | 10/0/9, POD 53% | 14/2/5, POD 74% | 0/0/3 | 2/0/1 |

**Por ano:**
- **2026:** a correção melhora todas as linhas, e o alarme falso fica entre 0% e 27%.
- **2025:** também acerta mais, mas o alarme falso sobe. Com 1 e 2 dias de antecedência, o "provável" passa de 25% para 57% a 60% de alarme falso.

**Em Cambará, 2026 não serve de prova:** teve só 3 madrugadas frias com dado.

## O que proponho

1. **Correção de −1 °C só no cálculo da geada**, nos pontos dos Campos de Cima da Serra do catálogo: Cambará do Sul, Itaimbezinho e Fortaleza.
   - A evidência é de Ausentes e Cambará, que ficam nessa região, nos dois invernos.
   - Ausentes não está no catálogo; serve de referência para a região.
   - A temperatura hora a hora continua a do modelo. O campo `geada.tmin` passa a vir corrigido, e a página usa esse valor quando falar de geada.
   - Nos pontos catarinenses, não: São Joaquim saiu 1 °C mais frio em 2025, e não há SC em 2026.
2. **Para a fase 4, o texto se apoia no que funcionou:**
   - o dia sem janela pode ser dito com firmeza;
   - a neblina "provável", com a ressalva de sempre;
   - a ausência de neblina vira "a previsão não indica neblina";
   - a janela do melhor horário entra como orientação, não como promessa.
3. **Ainda falta medir mirante em SC.** Para isso, refazer a exportação de maio a setembro de 2026:
   - A815, São Joaquim;
   - A845, Morro da Igreja, se o arquivo em branco não era ela;
   - B820, São Francisco de Paula, conferindo o nome antes de baixar.

## Tabelas

Índices 0.1.0. Gerado por `validacao/validar.mjs` em 2026-10-21. Como ler: "acertos / alarmes falsos / perdidos"; **POD** é a parte dos eventos que o índice previu, **FAR** a parte dos avisos que não se confirmaram.

### Antecedência 0 (o "hoje" do retrato)

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 144 | 0.9 °C | 1.2 °C | 80% |
| CAMBARA DO SUL (A897, 1017 m) | 15 | 0.1 °C | 0.8 °C | 100% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 19 / 0 / 20 | 49% | 0% | 6 / 2 / 11 | 35% | 25% |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 0 / 3 | 0% | — | 0 / 0 / 0 | — | — |

#### Neblina (horas de sol, umidade medida ≥ 97%)

| estação | "provável" | POD | FAR | "possível" ou mais | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 147 / 22 / 171 | 46% | 13% | 216 / 96 / 102 | 68% | 31% |
| CAMBARA DO SUL (A897, 1017 m) | 6 / 12 / 20 | 23% | 67% | 16 / 22 / 10 | 62% | 58% |

#### Melhor horário

| estação | dias com janela | horas limpas na janela | dias com 75% ou mais limpo | horas limpas no dia todo (referência) | dias sem janela | horas limpas neles | dias sem janela de fato fechados (até 25% limpo) |
|---|---|---|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 45 | 64% | 58% | 63% | 10 | 3% | 100% |
| CAMBARA DO SUL (A897, 1017 m) | 24 | 92% | 92% | 89% | 0 | — | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 7 / 7 / 18 | 28% | 50% |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 0 / 1 | 0% | — |

### Antecedência 1 dia

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 144 | 0.9 °C | 1.4 °C | 75% |
| CAMBARA DO SUL (A897, 1017 m) | 15 | 0.3 °C | 1.1 °C | 93% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 20 / 0 / 19 | 51% | 0% | 4 / 1 / 13 | 24% | 20% |
| CAMBARA DO SUL (A897, 1017 m) | 1 / 0 / 2 | 33% | 0% | 0 / 0 / 0 | — | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 0 / 1 / 25 | 0% | 100% |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 0 / 1 | 0% | — |

### Antecedência 2 dias

#### Mínima da madrugada

| estação | dias | viés (prev − medido) | erro médio | erro até 2 °C |
|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 144 | 1 °C | 1.5 °C | 70% |
| CAMBARA DO SUL (A897, 1017 m) | 15 | 0.3 °C | 1.2 °C | 80% |

#### Geada

| estação | "possível" × mínima até 3 °C | POD | FAR | "provável" × mínima até 1 °C | POD | FAR |
|---|---|---|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 16 / 0 / 23 | 41% | 0% | 4 / 0 / 13 | 24% | 0% |
| CAMBARA DO SUL (A897, 1017 m) | 1 / 0 / 2 | 33% | 0% | 0 / 0 / 0 | — | — |

#### Gelo (hora a hora, contra a mesma regra no medido)

| estação | alerta | POD | FAR |
|---|---|---|---|
| SAO JOSE DOS AUSENTES (A829, 1229 m) | 0 / 3 / 25 | 0% | 100% |
| CAMBARA DO SUL (A897, 1017 m) | 0 / 0 / 1 | 0% | — |

### Neve, dia a dia

Dias em que algum índice saiu de `sem_sinal`, ou que estão na lista de ocorrências. "Chuva fria" são as horas com chuva medida e ar até 1,5 °C.

| dia | nevou? | SAO JOSE DOS AUSENTES (A829, 1229 m) | CAMBARA DO SUL (A897, 1017 m) |
|---|---|---|---|
| 2026-05-09 | sim | moderada / baixa / baixa | · / baixa / baixa |
| 2026-09-06 | sim | · / · / · | · / · / · |

Cada célula: antecedência 0 / 1 / 2 dias. `·` é sem sinal.
