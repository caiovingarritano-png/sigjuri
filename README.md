# SIGJURI — Sistema de Gestão Jurídica

- `index.html.html` — gestão e análise de processos (com IA).
- `calculadora.html` — **Calculadora de Atualização de Débitos Judiciais** (débitos cíveis, Fazenda Pública e pensão alimentícia),
  com índices oficiais buscados em tempo real na API SGS do Banco Central e agente de IA para revisão do cálculo e da legislação.

## Calculadora

Abra `calculadora.html` no navegador (ou pelo menu ☰ da tela de processos). Página guiada, em uma coluna:

1. Escolha **Dívida ou condenação** ou **Pensão alimentícia**.
2. Preencha valor e data (ou, na pensão, % do salário mínimo/valor, meses em atraso e pagamentos parciais).
3. O total aparece na hora, com correção, juros, multa e honorários; na pensão, separado entre **pedido de prisão** (art. 528 CPC, Súm. 309/STJ) e **cobrança por penhora**.
4. Copie o **texto para a petição**, a **memória de cálculo** ou a tabela para o **Excel**.

Critérios prontos: Tabela Prática do TJSP (Lei 14.905/2024), Código Civil (IPCA + taxa legal), Selic (STJ) e Fazenda Pública (EC 113).
Data do cálculo, honorários da sentença, custas, índice/juros personalizados e índices manuais ficam em **Opções avançadas**.

Índices: a página tenta consultar o Banco Central na hora; se não conseguir, usa o retrato oficial embutido
(`calculadora/indices-snapshot.js`, desde 2000). O motor (`calculadora/motor-calculo.js`) é o mesmo da skill e do agente.

## Agente e skill do Claude

- Skill: `.claude/skills/calculo-judicial/` (SKILL.md, motor, CLI, referências legais, exemplos).
- Agente (Claude Code): `.claude/agents/calculista-judicial.md`.
- Para usar a skill no claude.ai: envie `dist/calculo-judicial.zip` em *Settings → Capabilities → Skills*.

```bash
node --test tests/                       # testes do motor
node scripts/sync-skill.mjs              # copia o motor para a skill após editar
NODE_USE_ENV_PROXY=1 node scripts/atualizar-indices.mjs   # atualiza o retrato de índices do BCB embutido na calculadora
python3 scripts/empacotar-skill.py       # gera dist/calculo-judicial.zip
node .claude/skills/calculo-judicial/scripts/calcular.mjs .claude/skills/calculo-judicial/exemplos/pensao.json
```

> Os critérios do título judicial prevalecem sobre os padrões. Confira o cálculo antes de protocolar.
