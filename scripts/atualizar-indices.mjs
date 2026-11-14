// Baixa do BCB (SGS) o histórico dos índices e grava calculadora/indices-snapshot.js,
// usado pela calculadora quando a consulta em tempo real não é possível.
// Uso: node scripts/atualizar-indices.mjs [AAAA-MM inicial]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../calculadora/motor-calculo.js');
const de = process.argv[2] || '2000-01';
const ate = new Date().toISOString().slice(0, 7);
const nomes = ['IPCA', 'IPCA-15', 'INPC', 'IGP-M', 'IGP-DI', 'TR', 'SELIC', 'TAXA_LEGAL', 'SALARIO_MINIMO'];
const indices = {};
for (const n of nomes) {
  // a API limita consultas longas: busca em blocos de 10 anos
  indices[n] = {};
  for (let y = +de.slice(0, 4); y <= +ate.slice(0, 4); y += 10) {
    const ini = y === +de.slice(0, 4) ? de : y + '-01';
    const fim = Math.min(y + 9, +ate.slice(0, 4)) + '-12';
    try { Object.assign(indices[n], await M.buscarSerieBCB(n, ini, fim)); } catch (e) { console.error(n, ini, e.message); }
  }
  console.log(n, Object.keys(indices[n]).length, 'meses; último', Object.keys(indices[n]).sort().pop());
}
// A Selic do mês corrente é parcial (acumulada até hoje): não entra no retrato.
delete indices.SELIC[ate];
const out = '/* Gerado por scripts/atualizar-indices.mjs — fonte: Banco Central do Brasil (SGS). Não editar à mão. */\n' +
  '(function (r) { r.INDICES_SNAPSHOT = ' + JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'BCB/SGS', indices }) + '; })(typeof self !== "undefined" ? self : this);\n' +
  'if (typeof module === "object" && module.exports) module.exports = (typeof self !== "undefined" ? self : this).INDICES_SNAPSHOT;\n';
writeFileSync('calculadora/indices-snapshot.js', out);
console.log('Gravado calculadora/indices-snapshot.js (' + Math.round(out.length / 1024) + ' KB)');
