# SIGJURI — Sistema de Gestão Jurídica

- `index.html.html` — gestão e análise de processos (com IA).
- `calculadora.html` — **Calculadora de Atualização de Débitos Judiciais** (débitos cíveis, Fazenda Pública e pensão alimentícia),
  com índices oficiais buscados em tempo real na API SGS do Banco Central e agente de IA para revisão do cálculo e da legislação.

## Calculadora

Abra `calculadora.html` no navegador (ou pelo menu ☰ da tela de processos).

- **Regimes prontos**: Tabela Prática TJSP + Lei 14.905/2024; CC art. 389/406; Selic (STJ, REsp 1.795.982); Fazenda Pública (EC 113/2021); personalizado.
- **Índices em tempo real** (BCB/SGS): IPCA, IPCA-15/IPCA-E, INPC, IGP-M, IGP-DI, TR, Selic, taxa legal, salário mínimo. Se a consulta falhar, usa o retrato oficial embutido (`calculadora/indices-snapshot.js`, desde 2000) e aceita índices manuais.
- **Juros** simples pro rata die; taxa legal (Selic − IPCA, piso zero — Res. CMN 5.171/2024); fase Selic sem cumulação.
- **Pagamentos parciais** com imputação do art. 354 CC; piso nominal na deflação (STJ, Tema 678).
- **Encargos**: multa e honorários do art. 523, §1º, CPC; honorários sucumbenciais; custas só com correção.
- **Pensão alimentícia**: valor fixo, % do salário mínimo ou mês a mês; 13º; separação **rito da prisão** (3 últimas + vincendas — art. 528, §7º, CPC; Súm. 309/STJ) × **expropriação**; alerta de prescrição bienal (art. 206, §2º, e art. 197, II, CC).
- **Saídas**: memória de cálculo (Markdown), CSV para Excel, impressão/PDF.
- **Agente IA** (Gemini + Google Search): revisa o cálculo e a legislação vigente, minuta petição de cumprimento, lista pontos de impugnação.

O motor (`calculadora/motor-calculo.js`) é o mesmo usado pela skill e pelo agente do Claude.

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
