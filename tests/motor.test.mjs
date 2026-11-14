// Testes do motor de cálculo — rode com: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../calculadora/motor-calculo.js');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// Índices de teste (valores fixos — não dependem da rede)
const IDX = {
  IPCA: { '2024-01': 0.42, '2024-02': 0.83, '2024-03': 0.16, '2024-08': -0.02, '2024-09': 0.44 },
  INPC: { '2024-01': 0.57, '2024-02': 0.81, '2024-03': 0.19, '2024-08': -0.14 },
  'IPCA-15': { '2024-09': 0.13, '2024-10': 0.54 },
  TAXA_LEGAL: { '2024-08': 0.5, '2024-09': 0.6, '2024-10': 0.7 },
  SELIC: { '2021-12': 0.77, '2022-01': 0.73, '2022-02': 0.76 }
};

test('correção mensal + juros 1% pro rata die', () => {
  const r = M.calcular({ dataCalculo: '2024-04-15', regime: { correcao: 'IPCA', juros: 'FIXA_1', selic: null },
    itens: [{ valor: 1000, dataBase: '2024-01-15' }] }, IDX);
  const fator = 1.0042 * 1.0083 * 1.0016;
  const jp = 17 / 31 + 1 + 1 + 14 / 30;
  const it = r.itens[0];
  near(it.fatorCorrecao, fator, 1e-9);
  near(it.jurosPct, jp, 1e-9);
  near(it.total, 1000 * fator * (1 + jp / 100));
  assert.equal(r.totais.debito, it.total);
});

test('transição Lei 14.905: 1% até 29/08/2024 e taxa legal desde 30/08/2024', () => {
  const j = M.jurosPercentual(M.PRESETS_JUROS.CC_LEI_14905.spec, '2024-08-01', '2024-10-01', IDX, new Set());
  near(j.pct, 29 / 31 * 1 + 2 / 31 * 0.5 + 0.6, 1e-9);
});

test('Tabela TJSP: INPC até 08/2024 e IPCA-15 a partir de 09/2024', () => {
  const f = M.fatorCorrecao(M.PRESETS_CORRECAO.TJSP_LEI_14905.spec, '2024-08', '2024-11', IDX, new Set());
  assert.deepEqual(f.detalhes.map((d) => d.indice), ['INPC', 'IPCA-15', 'IPCA-15']);
  near(f.fator, 0.9986 * 1.0013 * 1.0054, 1e-12);
});

test('deflação: fator limitado a 1 (piso nominal)', () => {
  const r = M.calcular({ dataCalculo: '2024-09-10', regime: { correcao: 'IPCA', juros: 'NENHUM' },
    itens: [{ valor: 500, dataBase: '2024-08-05' }] }, IDX);
  assert.equal(r.itens[0].total, 500);
  assert.ok(r.avisos.some((a) => a.includes('Deflação')));
});

test('EC 113: Selic simples desde 12/2021 sobre o valor consolidado', () => {
  const idx = { ...IDX, 'IPCA-E': { '2021-10': 1.2, '2021-11': 1.17 } };
  const r = M.calcular({ dataCalculo: '2022-03-01', regime: 'FAZENDA_EC113',
    itens: [{ valor: 1000, dataBase: '2021-10-01', dataJuros: '2021-10-01' }] }, idx);
  const it = r.itens[0];
  const corr = 1000 * 1.012 * 1.0117;
  const jp = 0.5 * 2 + 0.5 * 8 / 31; // out, nov, 1–8/dez
  const v = corr * (1 + jp / 100);
  near(it.total, v * (1 + (0.77 + 0.73 + 0.76) / 100));
  near(it.selic, v * 0.0226);
});

test('pagamento parcial: imputação primeiro nos juros (art. 354 CC)', () => {
  const r = M.calcular({ dataCalculo: '2024-03-01', regime: { correcao: 'NENHUMA', juros: 'FIXA_1' },
    itens: [{ valor: 1000, dataBase: '2024-01-01', pagamentos: [{ data: '2024-02-01', valor: 510 }] }] }, IDX);
  // em 01/02: 1000 + 10 de juros; paga 510 → 10 juros + 500 capital; saldo 500 com juros de 01/02 a 01/03 (1%)
  near(r.itens[0].total, 505);
  // identidade: original − pago + correção + juros + selic = total
  const it = r.itens[0];
  near(it.valorOriginal - it.totalPago + it.correcao + it.juros + it.selic, it.total);
});

test('pagamento menor que os juros: saldo de juros não gera novos juros', () => {
  const r = M.calcular({ dataCalculo: '2024-03-01', regime: { correcao: 'NENHUMA', juros: 'FIXA_1' },
    itens: [{ valor: 1000, dataBase: '2024-01-01', pagamentos: [{ data: '2024-02-01', valor: 4 }] }] }, IDX);
  // capital 1000 (+1% em fev = 10) + juros pendentes 6
  near(r.itens[0].total, 1016);
});

test('encargos do art. 523 sobre o débito (honorários sem a multa)', () => {
  const r = M.calcular({ dataCalculo: '2024-01-01', regime: { correcao: 'NENHUMA', juros: 'NENHUM' },
    itens: [{ valor: 1000, dataBase: '2024-01-01' }], encargos: { multa523: true, honorarios523: true } }, IDX);
  assert.equal(r.totalEncargos, 200);
  assert.equal(r.totalGeral, 1200);
});

test('pensão em % do salário mínimo + separação de ritos (art. 528 §7º / Súm. 309)', () => {
  const r = M.calcularPensao({ dataCalculo: '2024-07-01', regime: { correcao: 'NENHUMA', juros: 'NENHUM' },
    pensao: { modo: 'salario_minimo', percentualSM: 30, inicio: '2023-12', fim: '2024-06', diaVencimento: 10,
      dataAjuizamento: '2024-04-20', prescricaoSuspensa: true,
      pagamentos: [{ competencia: '2024-01', data: '2024-01-10', valor: 100 }] } }, IDX);
  assert.equal(r.itens.length, 7);
  assert.equal(r.itens[0].valorOriginal, 396.00); // 30% × 1320
  assert.equal(r.itens[1].valorOriginal, 423.60); // 30% × 1412
  near(r.itens[1].total, 323.60);
  // ajuizamento 20/04/2024 → 3 últimas: fev, mar, abr (venc. 10/04); vincendas: mai, jun
  assert.equal(r.ritos.prisao3Ultimas, round(423.6 * 3));
  assert.equal(r.ritos.prisaoVincendas, round(423.6 * 2));
  assert.equal(r.ritos.expropriacao, round(396 + 323.6));
});

test('prescrição bienal sinalizada quando não suspensa', () => {
  const r = M.calcularPensao({ dataCalculo: '2025-01-01', regime: { correcao: 'NENHUMA', juros: 'NENHUM' },
    pensao: { modo: 'fixo', valor: 100, inicio: '2022-06', fim: '2022-12', diaVencimento: 5, dataAjuizamento: '2024-10-01' } }, IDX);
  assert.ok(r.itens.filter((i) => i.tags.includes('possivel_prescricao')).length === 4); // jun–set/2022
});

test('taxa legal calculada pela fórmula quando a série oficial falta', () => {
  const av = new Set();
  const t = M.taxaLegalDoMes({ SELIC: { '2025-01': 1.01 }, 'IPCA-15': { '2025-01': 0.11 } }, '2025-02', av);
  near(t, ((1.0101 / 1.0011) - 1) * 100, 1e-6);
  assert.ok(av.size === 1);
});

test('memória em Markdown e CSV são gerados', () => {
  const r = M.calcular({ dataCalculo: '2024-04-15', regime: 'TJSP_LEI_14905',
    itens: [{ descricao: 'Condenação', valor: 1000, dataBase: '2024-01-15' }],
    despesas: [{ descricao: 'Custas', valor: 100, data: '2024-01-20' }] }, IDX);
  const md = M.gerarMemoriaMarkdown(r);
  assert.match(md, /Memória de Cálculo/);
  assert.match(md, /TOTAL GERAL/);
  assert.match(M.gerarCSV(r), /TOTAL GERAL/);
});

test('URL do SGS no formato esperado', () => {
  assert.equal(M.urlSerieBCB(433, '2024-01', '2024-03'),
    'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2024&dataFinal=31/03/2024');
  assert.deepEqual(M.parseRespostaBCB([{ data: '01/02/2024', valor: '0.83' }]), { '2024-02': 0.83 });
});

function round(v) { return Math.round(v * 100) / 100; }

test('juros anteriores à data-base (Súm. 54 + Súm. 362/STJ)', () => {
  const r = M.calcular({ dataCalculo: '2024-03-01', regime: { correcao: 'NENHUMA', juros: 'FIXA_1' },
    itens: [{ valor: 1000, dataBase: '2024-02-01', dataJuros: '2023-12-01' }] }, IDX);
  near(r.itens[0].jurosPct, 3, 1e-9);
  near(r.itens[0].total, 1030);
});

test('cópia do motor na skill é idêntica à fonte', async () => {
  const { readFileSync } = await import('node:fs');
  const u = (p) => new URL(p, import.meta.url);
  assert.equal(readFileSync(u('../calculadora/motor-calculo.js'), 'utf8'),
    readFileSync(u('../.claude/skills/calculo-judicial/scripts/motor-calculo.js'), 'utf8'), 'rode node scripts/sync-skill.mjs');
});

test('pensão: parcelas ainda não vencidas ficam de fora', () => {
  const r = M.calcularPensao({ dataCalculo: '2024-03-05', regime: { correcao: 'NENHUMA', juros: 'NENHUM' },
    pensao: { modo: 'fixo', valor: 100, inicio: '2024-01', fim: '2024-03', diaVencimento: 10 } }, IDX);
  assert.equal(r.itens.length, 2);
  assert.equal(r.totais.debito, 200);
});
