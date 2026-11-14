# Pensão alimentícia — regras de cálculo (revisão: 11/2026)

## Valor de cada parcela
| Fixação | Como o motor calcula (`pensao.modo`) |
|---|---|
| Valor fixo | `fixo` — `valor` mensal; corrigido desde cada vencimento (o título pode prever reajuste anual por índice: nesse caso use `manual` com os valores reajustados). |
| % do salário mínimo | `salario_minimo` — `percentualSM` × SM **vigente no mês de cada parcela** (série SGS 1619; tabela interna como reserva). Depois, correção e juros desde o vencimento. Alguns juízos adotam o SM da data do pagamento sem correção — se o título/juízo assim determinar, use `manual` com o SM atual e regime de correção `NENHUMA`, e explique a diferença. |
| % dos rendimentos líquidos | `manual` — informe o valor devido mês a mês (`valoresManuais`), a partir dos holerites/informes. Incide sobre 13º e férias conforme o título (`decimoTerceiro: true` gera parcela extra em dezembro). |

## Correção e juros
- Cada parcela é dívida líquida com termo: **correção e juros desde o vencimento** (art. 397 CC, mora *ex re*).
- Mesmos critérios de débito civil: preset `TJSP_LEI_14905` (padrão nas Varas de Família do TJSP).

## Pagamentos parciais
- Informar `{ competencia, data, valor }`. Imputação do art. 354 CC (juros antes do capital).
- Pagamento sem competência definida: imputar na parcela mais antiga (art. 355 CC), salvo indicação do devedor
  no momento do pagamento (art. 352 CC).

## Rito da execução (CPC)
- **Prisão civil (art. 528, §§3º e 7º; Súmula 309/STJ)**: só as **3 prestações anteriores ao ajuizamento**
  e as que **vencerem no curso do processo**. O motor separa (`dataAjuizamento`): tags
  `prisao_3_ultimas` e `prisao_vincenda`.
- **Expropriação (art. 528, §8º, e art. 530; cumprimento de sentença do art. 523)**: demais parcelas
  (tag `expropriacao`). Aqui incidem multa de 10% e honorários de 10% se não houver pagamento em 15 dias
  (marque `encargos.multa523/honorarios523` só no cálculo do rito expropriatório).
- Título extrajudicial (escritura/acordo referendado): arts. 911 a 913 CPC — mesma lógica de ritos.
- É comum ajuizar dois procedimentos (ou um com dois pedidos): rode o cálculo duas vezes, uma para cada
  grupo, com os encargos adequados.

## Prescrição
- **2 anos** a partir do vencimento de cada parcela (art. 206, §2º, CC).
- **Não corre** entre ascendentes e descendentes durante o poder familiar (art. 197, II, CC) — credor menor
  de 18 anos sob poder familiar do devedor (`prescricaoSuspensa: true`). Após a maioridade, o prazo começa
  a correr. Absolutamente incapaz: art. 198, I, CC.
- O motor sinaliza (`possivel_prescricao`) parcelas vencidas há mais de 2 anos do ajuizamento quando a
  prescrição não está suspensa; `excluirPrescritas: true` as remove do total.

## Outros pontos a verificar
- Exoneração/redução/majoração: valores mudam a partir da citação na ação revisional (art. 13, §2º, Lei 5.478/68;
  Súm. 621/STJ: os efeitos retroagem à citação, vedadas compensação e repetibilidade). Use `manual`.
- Alimentos *in natura* pagos sem previsão no título, em regra, não abatem (verificar jurisprudência atual).
- Desconto em folha (art. 529 CPC) e protesto (art. 528, §1º) — mencionar ao usuário quando útil.
- Débito alimentar antigo pode perder o caráter de urgência — razão da Súm. 309; não confundir com prescrição.
