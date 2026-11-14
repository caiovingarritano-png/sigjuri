#!/usr/bin/env node
// CLI do motor de cálculo judicial (skill "calculo-judicial").
//
// Uso:
//   node calcular.mjs entrada.json                      → busca índices no BCB e imprime a memória (Markdown)
//   node calcular.mjs entrada.json --indices idx.json   → mescla/sobrepõe índices manuais
//   node calcular.mjs entrada.json --offline --indices idx.json
//   node calcular.mjs entrada.json --json res.json --csv res.csv --md memoria.md
//   node calcular.mjs --serie IPCA 2024-01 2025-12      → baixa e imprime uma série do BCB (conferência)
//   node calcular.mjs --urls entrada.json               → só lista as URLs do BCB necessárias
//                                                          (para baixar com web_fetch quando a rede do script estiver bloqueada)
//
// Formato de índices manuais (idx.json):
//   { "IPCA": { "2025-01": 0.16, "2025-02": 1.31 }, "TAXA_LEGAL": { "2025-02": 0.5 } }
//   Também aceita a resposta crua do BCB: { "IPCA": [ {"data":"01/01/2025","valor":"0.16"}, ... ] }
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require(join(dirname(fileURLToPath(import.meta.url)), 'motor-calculo.js'));

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };

function lerIndices(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const out = {};
  for (const [nome, v] of Object.entries(raw)) out[nome] = Array.isArray(v) ? M.parseRespostaBCB(v) : v;
  return out;
}

async function main() {
  if (args[0] === '--serie') {
    const [, nome, de, ate] = args;
    const s = await M.buscarSerieBCB(nome, de, ate);
    console.log(JSON.stringify({ [nome]: s }, null, 2));
    return;
  }
  if (args[0] === '--urls') {
    const cfg = JSON.parse(readFileSync(args[1], 'utf8'));
    const de = M.mesInicialNecessario(cfg), ate = M.util.mesDe(cfg.dataCalculo);
    for (const n of M.seriesNecessarias(cfg)) console.log(n + '\t' + M.urlSerieBCB(M.SERIES_SGS[n].codigo, de, ate));
    return;
  }
  const entrada = args.find((a) => !a.startsWith('--') && a.endsWith('.json') && args[args.indexOf(a) - 1] !== '--indices' &&
    !['--json', '--csv', '--md'].includes(args[args.indexOf(a) - 1]));
  if (!entrada) { console.error('Informe o arquivo de entrada .json. Veja o cabeçalho deste script.'); process.exit(2); }
  const cfg = JSON.parse(readFileSync(entrada, 'utf8'));
  if (!cfg.dataCalculo) cfg.dataCalculo = new Date().toISOString().slice(0, 10);
  const manuais = flag('--indices') ? lerIndices(flag('--indices')) : {};

  let res;
  if (flag('--offline')) {
    res = cfg.pensao ? M.calcularPensao(cfg, manuais) : M.calcular(cfg, manuais);
    res.avisos.unshift('Cálculo feito com índices fornecidos manualmente (modo offline).');
  } else {
    res = await M.calcularComIndicesAtuais(cfg, { indicesManuais: manuais });
  }

  const md = M.gerarMemoriaMarkdown(res);
  if (flag('--md')) writeFileSync(flag('--md'), md);
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 2));
  if (flag('--csv')) writeFileSync(flag('--csv'), M.gerarCSV(res));
  console.log(md);
  const semIndices = res.avisos.filter((a) => /Não foi possível obter/.test(a));
  if (semIndices.length) {
    console.error('\n⚠ Alguns índices não puderam ser obtidos do BCB. Rode com --urls para listar as URLs,');
    console.error('  baixe-as (web_fetch) e passe o resultado com --indices idx.json.');
    process.exitCode = 3;
  }
}

main().catch((e) => { console.error('Erro: ' + e.message); process.exit(1); });
