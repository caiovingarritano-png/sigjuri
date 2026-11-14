# Base legal e critérios de atualização (revisão: 11/2026)

> Base de partida. **Confira sempre na web se houve alteração** (passo 2 do SKILL.md).
> Os critérios do título judicial prevalecem (coisa julgada), salvo superveniência de lei aplicável
> aos efeitos futuros conforme a jurisprudência do tribunal.

## 1. Débitos civis em geral (CC)

### Lei 14.905/2024 — vigência em 30/08/2024
- **Art. 389, parágrafo único, CC**: na falta de índice convencionado ou previsto em lei especial,
  a correção monetária é pelo **IPCA** (IBGE).
- **Art. 406, CC**: na falta de taxa convencionada, os juros de mora seguem a **taxa legal** =
  **Selic − IPCA** (§1º); se o resultado for negativo, considera-se **zero** para o período (§3º).
- **Res. CMN 5.171/2024**: metodologia. Taxa mensal = max(0, (Fator Selic ÷ Fator IPCA − 1) × 100),
  seis casas decimais, **juros simples**, inclusive pro rata em fração de mês. O BCB divulga a taxa
  legal mensal (série SGS 29543 — conferir o código no portal do BCB). Pela resolução, o deflator usado
  é o **IPCA-15** do mês anterior (o motor usa a série oficial e só recorre à fórmula se ela faltar).
- Direito intertemporal (prática majoritária): **regime antigo até 29/08/2024** e regime novo a partir
  de 30/08/2024 para as obrigações em curso.

### Antes de 30/08/2024
- Juros de mora: **1% a.m.** (art. 406 antigo c/c art. 161, §1º, CTN) — prática das tabelas
  dos TJs, inclusive o TJSP.
- **STJ, Corte Especial, REsp 1.795.982/SP**: a taxa do art. 406 (redação antiga) é a **Selic**, que já
  engloba correção monetária (não se cumula com outro índice). Use o preset `STJ_SELIC_CIVEL` quando o
  título ou o juízo adotar esse entendimento. **Conferir o número e a data do acórdão antes de citar.**

### Tabela Prática do TJSP
- INPC de 08/1995 a 08/2024; **IPCA-15 a partir de 09/2024** (Tabela "Lei 14.905/24").
- Divergência possível entre TJSP (IPCA-15) e texto do CC (IPCA): rode os dois e informe a diferença.
- Fonte: tjsp.jus.br → Primeira Instância → Cálculos Judiciais / Tabela Prática.

### Termos iniciais (súmulas/artigos)
| Situação | Correção desde | Juros desde |
|---|---|---|
| Responsabilidade contratual, obrigação líquida e com termo | vencimento | vencimento (art. 397 CC — mora *ex re*) |
| Contratual sem termo / ilíquida | desembolso/vencimento | citação (art. 405 CC) |
| Extracontratual (ato ilícito) | efetivo prejuízo (Súm. 43/STJ) | evento danoso (Súm. 54/STJ) |
| Danos morais | arbitramento (Súm. 362/STJ) | evento danoso (extracontratual) ou citação (contratual) |
| Custas e despesas | desembolso | — (só correção) |
| Honorários sucumbenciais em valor fixo | data da fixação | trânsito em julgado (art. 85, §16, CPC) |

### Deflação
- **STJ, Tema 678 (REsp 1.265.580)**: índices negativos são aplicados, mas o valor nominal não pode ser
  reduzido. O motor limita o fator de cada fase a 1 (`pisoNominal: true`).

## 2. Fazenda Pública
- **EC 113/2021, art. 3º** (desde 09/12/2021): Selic, uma única vez, até o pagamento (correção + juros).
- Antes: **Temas 810/STF e 905/STJ** — condenações não tributárias: **IPCA-E** + juros da caderneta de
  poupança (0,5% a.m. quando a Selic > 8,5% a.a.; 70% da Selic + TR quando ≤ 8,5%). O preset usa 0,5% a.m.;
  ajuste com segmentos de juros se o período incluir meses de poupança a 70% da Selic.
- Débitos tributários: Selic (Lei 9.250/95, art. 39, §4º).
- Manual de Cálculos da Justiça Federal (CJF) é a referência na JF.

## 3. Cumprimento de sentença (CPC)
- **Art. 523, §1º**: não paga em 15 dias, acresce **multa de 10%** e **honorários de 10%**. Pagamento
  parcial: incidem sobre o restante (§2º). A base dos honorários é o débito **sem** a multa (STJ).
- **Art. 524**: requisitos do demonstrativo (índice, juros, termos inicial e final, periodicidade da
  capitalização, se houver, descontos).
- **Art. 525, §§4º e 5º**: impugnação por excesso exige declarar o valor correto com demonstrativo.
- Imputação do pagamento: **art. 354 CC** (primeiro os juros vencidos, depois o capital).
- Juros sobre juros: vedada a capitalização, salvo previsão legal/contratual; o motor usa juros simples.

## 4. Justiça do Trabalho (fora do escopo dos presets)
- **ADCs 58 e 59/STF**: IPCA-E na fase pré-judicial (+ juros do art. 39, *caput*, Lei 8.177/91) e Selic
  a partir do ajuizamento; após a Lei 14.905/2024, o TST passou a aplicar IPCA + taxa legal em parte
  do período — **verificar na web a posição atual do TST** e montar regime personalizado.
