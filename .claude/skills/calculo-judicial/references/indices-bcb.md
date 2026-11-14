# Índices — API SGS do Banco Central

URL: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CODIGO}/dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA`
Últimos N valores: `.../dados/ultimos/N?formato=json`
Resposta: `[{"data":"01/01/2025","valor":"0.16"}, ...]` — a data é sempre o 1º dia do mês de referência.

| Nome no motor | SGS | Conteúdo | Observações |
|---|---|---|---|
| `IPCA` | 433 | variação % mensal | Índice supletivo do art. 389 CC desde 30/08/2024 |
| `IPCA-15` | 7478 | variação % mensal | Tabela Prática TJSP desde 09/2024; deflator da taxa legal |
| `IPCA-E` | 7478 | idem IPCA-15 | O IPCA-E é o IPCA-15 acumulado no trimestre; tabelas judiciais usam a variação mensal do IPCA-15 |
| `INPC` | 188 | variação % mensal | Tabela Prática TJSP até 08/2024 |
| `IGP-M` | 189 | variação % mensal | Comum em contratos de locação |
| `IGP-DI` | 190 | variação % mensal | |
| `TR` | 7811 | % mensal (1º dia do mês) | Conferir a série; TR diária é a 226 |
| `SELIC` | 4390 | Selic acumulada no mês, % a.m. | Acumulação **simples** (soma) — EC 113 / Manual CJF |
| `TAXA_LEGAL` | 29543 | taxa legal mensal (% a.m.) | Res. CMN 5.171/2024. Conferir código no portal do BCB; na falta, o motor calcula pela fórmula |
| `SALARIO_MINIMO` | 1619 | valor em R$ | Para pensão em % do SM |

## Cuidados
- Mês corrente geralmente não está divulgado: o motor considera 0% e emite aviso. Para cálculo para
  protocolo, use como data do cálculo um mês já divulgado ou informe a projeção como ressalva.
- Conferir os códigos no portal (https://www3.bcb.gov.br/sgspub) se a API devolver série inesperada.
- Fatores das tabelas dos tribunais podem diferir na 4ª–6ª casa por arredondamento: diferenças de
  centavos são normais; diferenças maiores indicam índice/mês trocado.
- Convenção do motor: correção pelos meses do mês da data-base (inclusive) até o mês do cálculo
  (exclusive), sem pro rata — igual à leitura de fatores da Tabela Prática (fator do mês do cálculo ÷ fator
  do mês da data-base).
