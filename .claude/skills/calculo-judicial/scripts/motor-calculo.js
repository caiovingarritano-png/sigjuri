/*!
 * SIGJURI — Motor de Cálculo de Atualização de Débitos Judiciais
 * ----------------------------------------------------------------
 * Funciona no navegador (window.MotorCalculo) e no Node.js (require/import).
 *
 * Fonte oficial de índices: API SGS do Banco Central do Brasil
 *   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json
 *
 * Base legal implementada (ver .claude/skills/calculo-judicial/references/legislacao.md):
 *   - CC arts. 389, par. ún., e 406 (red. Lei 14.905/2024, vigência 30/08/2024):
 *     correção pelo IPCA e juros pela "taxa legal" (Selic − IPCA, piso zero).
 *   - Res. CMN 5.171/2024: metodologia da taxa legal (juros simples, pro rata).
 *   - Tabela Prática do TJSP: INPC até 08/2024 e IPCA-15 a partir de 09/2024.
 *   - EC 113/2021, art. 3º: Selic única (Fazenda Pública) a partir de 12/2021.
 *   - STJ, REsp 1.795.982/SP (Corte Especial): Selic como taxa do art. 406 antigo.
 *   - STJ, Tema 678 / REsp 1.265.580: deflação aplicada com piso no valor nominal.
 *   - CPC art. 523, §1º (multa 10% + honorários 10%); art. 528 (alimentos);
 *     Súmula 309/STJ; CC art. 206, §2º e art. 197, II (prescrição alimentar).
 *
 * IMPORTANTE: os critérios do título judicial (sentença/acórdão/acordo)
 * SEMPRE prevalecem sobre os padrões deste motor. Tudo é configurável.
 *
 * ATENÇÃO: este arquivo existe em duas cópias idênticas:
 *   calculadora/motor-calculo.js  (fonte)
 *   .claude/skills/calculo-judicial/scripts/motor-calculo.js (cópia da skill)
 * Rode `node scripts/sync-skill.mjs` após editar a fonte.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorCalculo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSAO = '1.0.0';

  // ===================================================================
  // 1. CATÁLOGO DE SÉRIES (SGS / Banco Central)
  // ===================================================================
  const SERIES_SGS = {
    'IPCA':      { codigo: 433,   tipo: 'percentual', descricao: 'IPCA (IBGE) — variação % mensal' },
    'IPCA-15':   { codigo: 7478,  tipo: 'percentual', descricao: 'IPCA-15 (IBGE) — variação % mensal' },
    // O IPCA-E é o IPCA-15 acumulado por trimestre; as tabelas judiciais (CJF, TJs)
    // usam, mês a mês, a variação do IPCA-15. Por isso IPCA-E aponta para a série 7478.
    'IPCA-E':    { codigo: 7478,  tipo: 'percentual', descricao: 'IPCA-E (variação mensal do IPCA-15, como nas tabelas judiciais)' },
    'INPC':      { codigo: 188,   tipo: 'percentual', descricao: 'INPC (IBGE) — variação % mensal' },
    'IGP-M':     { codigo: 189,   tipo: 'percentual', descricao: 'IGP-M (FGV) — variação % mensal' },
    'IGP-DI':    { codigo: 190,   tipo: 'percentual', descricao: 'IGP-DI (FGV) — variação % mensal' },
    'TR':        { codigo: 7811,  tipo: 'percentual', descricao: 'TR — taxa mensal (1º dia do mês)' },
    'SELIC':     { codigo: 4390,  tipo: 'percentual', descricao: 'Selic acumulada no mês (% a.m.)' },
    'TAXA_LEGAL':{ codigo: 29543, tipo: 'percentual', descricao: 'Taxa legal — art. 406 CC / Res. CMN 5.171/2024 (% a.m.)' },
    'SALARIO_MINIMO': { codigo: 1619, tipo: 'valor', descricao: 'Salário mínimo nacional (R$)' }
  };

  // Tabela embutida de salário mínimo (fallback quando a API não responde).
  // Chave = mês a partir do qual o valor vigora. CONFERIR antes de uso formal.
  const SALARIO_MINIMO_TABELA = {
    '2015-01': 788.00, '2016-01': 880.00, '2017-01': 937.00, '2018-01': 954.00,
    '2019-01': 998.00, '2020-01': 1039.00, '2020-02': 1045.00, '2021-01': 1100.00,
    '2022-01': 1212.00, '2023-01': 1302.00, '2023-05': 1320.00, '2024-01': 1412.00,
    '2025-01': 1518.00, '2026-01': 1621.00
  };

  // Marcos legais (datas de vigência) usados pelos presets.
  const MARCOS = {
    LEI_14905_VIGENCIA: '2024-08-30',
    LEI_14905_ULTIMO_DIA_REGIME_ANTIGO: '2024-08-29',
    EC_113_SELIC_DESDE: '2021-12-09',
    TJSP_INPC_ATE: '2024-08',
    TJSP_IPCA15_DESDE: '2024-09'
  };

  // ===================================================================
  // 2. PRESETS DE CORREÇÃO, JUROS E REGIMES
  // ===================================================================
  // Correção: string com o nome do índice OU lista de segmentos
  //   [{ indice: 'INPC', ate: 'AAAA-MM' (inclusive) }, { indice: 'IPCA-15' }]
  const PRESETS_CORRECAO = {
    TJSP_LEI_14905: { rotulo: 'Tabela Prática TJSP (INPC até 08/2024; IPCA-15 desde 09/2024)',
      spec: [{ indice: 'INPC', ate: '2024-08' }, { indice: 'IPCA-15' }] },
    CC_ART389_INPC_IPCA: { rotulo: 'CC art. 389 (INPC até 08/2024; IPCA desde 09/2024)',
      spec: [{ indice: 'INPC', ate: '2024-08' }, { indice: 'IPCA' }] },
    IPCA: { rotulo: 'IPCA', spec: 'IPCA' },
    'IPCA-E': { rotulo: 'IPCA-E', spec: 'IPCA-E' },
    'IPCA-15': { rotulo: 'IPCA-15', spec: 'IPCA-15' },
    INPC: { rotulo: 'INPC', spec: 'INPC' },
    'IGP-M': { rotulo: 'IGP-M', spec: 'IGP-M' },
    'IGP-DI': { rotulo: 'IGP-DI', spec: 'IGP-DI' },
    TR: { rotulo: 'TR', spec: 'TR' },
    NENHUMA: { rotulo: 'Sem correção monetária', spec: 'NENHUMA' }
  };

  // Juros: lista de segmentos por data (dia):
  //   [{ ate: 'AAAA-MM-DD' (inclusive), tipo: 'fixa', taxa: 1 }, { tipo: 'taxa_legal' }]
  //   tipo: 'fixa' (taxa % a.m., simples, pro rata die) | 'taxa_legal' | 'selic_simples' | 'nenhum'
  const PRESETS_JUROS = {
    CC_LEI_14905: { rotulo: '1% a.m. até 29/08/2024; taxa legal (Selic − IPCA) desde 30/08/2024',
      spec: [{ ate: '2024-08-29', tipo: 'fixa', taxa: 1 }, { tipo: 'taxa_legal' }] },
    FIXA_1: { rotulo: '1% ao mês (simples, pro rata die)', spec: [{ tipo: 'fixa', taxa: 1 }] },
    FIXA_05: { rotulo: '0,5% ao mês (simples, pro rata die)', spec: [{ tipo: 'fixa', taxa: 0.5 }] },
    TAXA_LEGAL: { rotulo: 'Taxa legal (art. 406 CC)', spec: [{ tipo: 'taxa_legal' }] },
    NENHUM: { rotulo: 'Sem juros de mora', spec: [{ tipo: 'nenhum' }] }
  };

  // Regimes completos (correção + juros + fase Selic opcional)
  const REGIMES = {
    TJSP_LEI_14905: {
      rotulo: 'Cível TJSP — Tabela Prática + juros 1% a.m. e taxa legal (Lei 14.905/2024)',
      correcao: 'TJSP_LEI_14905', juros: 'CC_LEI_14905', selic: null
    },
    CC_LEI_14905: {
      rotulo: 'Cível CC (Lei 14.905/2024) — INPC/IPCA + 1% a.m./taxa legal',
      correcao: 'CC_ART389_INPC_IPCA', juros: 'CC_LEI_14905', selic: null
    },
    STJ_SELIC_CIVEL: {
      rotulo: 'Cível STJ (REsp 1.795.982) — correção até a mora, Selic até 29/08/2024, depois IPCA + taxa legal',
      correcao: 'CC_ART389_INPC_IPCA', juros: 'TAXA_LEGAL',
      selic: { desde: null, ate: '2024-08-29' }
    },
    FAZENDA_EC113: {
      rotulo: 'Fazenda Pública (EC 113/2021) — IPCA-E + 0,5% a.m. até 11/2021; Selic desde 12/2021',
      correcao: 'IPCA-E', juros: 'FIXA_05',
      selic: { desde: '2021-12-09', ate: null }
    },
    PERSONALIZADO: { rotulo: 'Personalizado', correcao: 'IPCA', juros: 'FIXA_1', selic: null }
  };

  // ===================================================================
  // 3. UTILITÁRIOS DE DATA E NÚMERO
  // ===================================================================
  function parseData(s) {
    if (s instanceof Date) return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
    const str = String(s).trim();
    let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (r) return { y: +r[1], m: +r[2], d: +r[3] };
    r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
    if (r) return { y: +r[3], m: +r[2], d: +r[1] };
    r = /^(\d{4})-(\d{2})$/.exec(str);
    if (r) return { y: +r[1], m: +r[2], d: 1 };
    throw new Error('Data inválida: ' + s + ' (use AAAA-MM-DD ou DD/MM/AAAA)');
  }
  const pad = (n) => String(n).padStart(2, '0');
  function iso(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function normData(s) { return iso(parseData(s)); }
  function mesDe(s) { const p = parseData(s); return p.y + '-' + pad(p.m); }
  function diasNoMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function toUTC(s) { const p = parseData(s); return Date.UTC(p.y, p.m - 1, p.d); }
  function diffDias(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function addDias(s, n) { const t = new Date(toUTC(s) + n * 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function addMeses(mes, n) { const [y, m] = mes.split('-').map(Number); const t = (y * 12 + (m - 1)) + n;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1); }
  function cmpMes(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function maxData(a, b) { return normData(a) >= normData(b) ? normData(a) : normData(b); }
  function minData(a, b) { return normData(a) <= normData(b) ? normData(a) : normData(b); }
  function primeiroDia(mes) { return mes + '-01'; }
  function dataBR(s) { const p = parseData(s); return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
  function mesBR(mes) { const [y, m] = mes.split('-'); return m + '/' + y; }
  function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
  function brl(v) {
    const n = round2(v); const s = Math.abs(n).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + 'R$ ' + s[0] + ',' + s[1];
  }
  function pct(v, casas) { return (v).toFixed(casas == null ? 4 : casas).replace('.', ',') + '%'; }
  function listaMeses(deMes, ateMesExclusivo) {
    const out = []; let m = deMes;
    while (cmpMes(m, ateMesExclusivo) < 0) { out.push(m); m = addMeses(m, 1); }
    return out;
  }

  // ===================================================================
  // 4. BUSCA DE ÍNDICES EM TEMPO REAL (BCB / SGS)
  // ===================================================================
  function urlSerieBCB(codigo, deMes, ateMes) {
    const ini = primeiroDia(deMes); const [y, m] = ateMes.split('-').map(Number);
    const fim = ateMes + '-' + pad(diasNoMes(y, m));
    return 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + codigo +
      '/dados?formato=json&dataInicial=' + dataBR(ini) + '&dataFinal=' + dataBR(fim);
  }

  function parseRespostaBCB(json) {
    const out = {};
    if (!Array.isArray(json)) return out;
    for (const row of json) {
      if (!row || !row.data) continue;
      const mes = mesDe(row.data);
      const v = parseFloat(String(row.valor).replace(',', '.'));
      if (!isNaN(v)) out[mes] = v;
    }
    return out;
  }

  async function buscarSerieBCB(nome, deMes, ateMes, opts) {
    opts = opts || {};
    const info = SERIES_SGS[nome];
    if (!info) throw new Error('Série desconhecida: ' + nome);
    const f = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new Error('fetch indisponível neste ambiente');
    const url = urlSerieBCB(info.codigo, deMes, ateMes);
    let ultimoErro;
    for (let t = 0; t < (opts.tentativas || 3); t++) {
      try {
        const resp = await f(url, { headers: { Accept: 'application/json' } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return parseRespostaBCB(await resp.json());
      } catch (e) {
        ultimoErro = e;
        await new Promise((r) => setTimeout(r, 400 * (t + 1)));
      }
    }
    throw new Error('Falha ao buscar ' + nome + ' (SGS ' + info.codigo + '): ' + (ultimoErro && ultimoErro.message));
  }

  /** Busca várias séries. Retorna { indices, erros, fonte, consultadoEm }. */
  async function buscarIndices(nomes, deMes, ateMes, opts) {
    opts = opts || {};
    const unicos = Array.from(new Set(nomes));
    const indices = {}; const erros = {};
    // IPCA-E e IPCA-15 compartilham a série; busca-se uma vez.
    const cache = {};
    await Promise.all(unicos.map(async (nome) => {
      const cod = SERIES_SGS[nome] && SERIES_SGS[nome].codigo;
      try {
        if (!cache[cod]) cache[cod] = buscarSerieBCB(nome, deMes, ateMes, opts);
        indices[nome] = await cache[cod];
        if (opts.onProgresso) opts.onProgresso(nome, true);
      } catch (e) {
        erros[nome] = e.message;
        if (opts.onProgresso) opts.onProgresso(nome, false, e.message);
      }
    }));
    return { indices, erros, fonte: 'Banco Central do Brasil — SGS (api.bcb.gov.br)', consultadoEm: new Date().toISOString() };
  }

  /** Lista as séries que um cálculo precisa. */
  function seriesNecessarias(config) {
    const regime = resolverRegime(config.regime);
    const s = new Set();
    for (const nome of nomesDaCorrecao(regime.correcao)) if (nome !== 'NENHUMA') s.add(nome);
    if (regime.correcaoAntesSelic) for (const n of nomesDaCorrecao(regime.correcaoAntesSelic)) if (n !== 'NENHUMA') s.add(n);
    for (const seg of regime.juros) {
      if (seg.tipo === 'taxa_legal') { s.add('TAXA_LEGAL'); s.add('SELIC'); s.add('IPCA-15'); }
      if (seg.tipo === 'selic_simples') s.add('SELIC');
    }
    if (regime.selic) s.add('SELIC');
    if (config.pensao && config.pensao.modo === 'salario_minimo') s.add('SALARIO_MINIMO');
    return Array.from(s);
  }

  function nomesDaCorrecao(spec) {
    if (typeof spec === 'string') return [spec];
    return spec.map((x) => x.indice);
  }

  // ===================================================================
  // 5. RESOLUÇÃO DE REGIME
  // ===================================================================
  function resolverCorrecao(c) {
    if (c == null) return 'IPCA';
    if (typeof c === 'string' && PRESETS_CORRECAO[c]) return PRESETS_CORRECAO[c].spec;
    return c;
  }
  function resolverJuros(j) {
    if (j == null) return PRESETS_JUROS.NENHUM.spec;
    if (typeof j === 'string' && PRESETS_JUROS[j]) return PRESETS_JUROS[j].spec;
    if (!Array.isArray(j)) return [j];
    return j;
  }
  function rotuloCorrecao(c) {
    if (typeof c === 'string' && PRESETS_CORRECAO[c]) return PRESETS_CORRECAO[c].rotulo;
    const spec = resolverCorrecao(c);
    if (typeof spec === 'string') return spec;
    return spec.map((s) => s.indice + (s.ate ? ' até ' + mesBR(s.ate) : ' em diante')).join('; ');
  }
  function rotuloJuros(j) {
    if (typeof j === 'string' && PRESETS_JUROS[j]) return PRESETS_JUROS[j].rotulo;
    return resolverJuros(j).map((s) => {
      const t = s.tipo === 'fixa' ? (String(s.taxa).replace('.', ',') + '% a.m.') :
        s.tipo === 'taxa_legal' ? 'taxa legal' : s.tipo === 'selic_simples' ? 'Selic' : 'sem juros';
      return t + (s.ate ? ' até ' + dataBR(s.ate) : '');
    }).join('; ');
  }

  /**
   * Aceita: nome de REGIME (string) ou objeto { base?, correcao, juros, selic, pisoNominal }.
   */
  function resolverRegime(r) {
    let base = {};
    if (typeof r === 'string') { if (!REGIMES[r]) throw new Error('Regime desconhecido: ' + r); base = REGIMES[r]; r = {}; }
    else if (r && r.base) { base = REGIMES[r.base] || {}; }
    r = r || {};
    const correcaoRaw = r.correcao != null ? r.correcao : base.correcao;
    const jurosRaw = r.juros != null ? r.juros : base.juros;
    const selic = r.selic !== undefined ? r.selic : base.selic;
    return {
      rotulo: r.rotulo || base.rotulo || 'Personalizado',
      correcao: resolverCorrecao(correcaoRaw),
      correcaoRotulo: rotuloCorrecao(correcaoRaw),
      correcaoAntesSelic: r.correcaoAntesSelic ? resolverCorrecao(r.correcaoAntesSelic) : null,
      juros: resolverJuros(jurosRaw),
      jurosRotulo: rotuloJuros(jurosRaw),
      selic: selic ? { desde: selic.desde || null, ate: selic.ate || null } : null,
      pisoNominal: r.pisoNominal !== false
    };
  }

  // ===================================================================
  // 6. NÚCLEO: CORREÇÃO, JUROS, SELIC
  // ===================================================================
  function indiceDoMes(spec, mes) {
    if (typeof spec === 'string') return spec;
    for (const seg of spec) if (!seg.ate || cmpMes(mes, seg.ate) <= 0) return seg.indice;
    return spec[spec.length - 1].indice;
  }

  function valorIndice(indices, nome, mes, avisos) {
    const serie = indices[nome] || (nome === 'IPCA-E' ? indices['IPCA-15'] : nome === 'IPCA-15' ? indices['IPCA-E'] : null);
    if (serie && serie[mes] != null) return serie[mes];
    avisos.add('Índice ' + nome + ' de ' + mesBR(mes) + ' indisponível — considerado 0% (aguardando divulgação ou fora da série).');
    return 0;
  }

  /** Fator de correção entre meses [deMes, ateMesExclusivo). */
  function fatorCorrecao(spec, deMes, ateMesExcl, indices, avisos) {
    const detalhes = []; let fator = 1;
    if (spec === 'NENHUMA') return { fator: 1, detalhes };
    for (const mes of listaMeses(deMes, ateMesExcl)) {
      const nome = indiceDoMes(spec, mes);
      if (nome === 'NENHUMA') continue;
      const taxa = valorIndice(indices, nome, mes, avisos);
      fator *= 1 + taxa / 100;
      detalhes.push({ mes, indice: nome, taxa });
    }
    return { fator, detalhes };
  }

  /** Taxa legal do mês (% a.m.). Usa série oficial; na falta, calcula pela Res. CMN 5.171. */
  function taxaLegalDoMes(indices, mes, avisos) {
    if (indices.TAXA_LEGAL && indices.TAXA_LEGAL[mes] != null) return indices.TAXA_LEGAL[mes];
    const ant = addMeses(mes, -1);
    const selic = indices.SELIC && indices.SELIC[ant];
    const ipca15 = (indices['IPCA-15'] && indices['IPCA-15'][ant]) ?? (indices['IPCA-E'] && indices['IPCA-E'][ant]);
    if (selic != null && ipca15 != null) {
      const tl = Math.max(0, ((1 + selic / 100) / (1 + ipca15 / 100) - 1) * 100);
      avisos.add('Taxa legal de ' + mesBR(mes) + ' calculada pela fórmula da Res. CMN 5.171/2024 (Selic e IPCA-15 de ' + mesBR(ant) + '): ' + pct(tl, 6) + '. Conferir com a divulgação oficial do BCB.');
      return Math.round(tl * 1e6) / 1e6;
    }
    avisos.add('Taxa legal de ' + mesBR(mes) + ' indisponível — considerada 0%.');
    return 0;
  }

  function segmentoJurosNaData(spec, data) {
    for (const seg of spec) if (!seg.ate || normData(data) <= normData(seg.ate)) return seg;
    return spec[spec.length - 1];
  }

  /**
   * Juros simples (%) entre as datas [de, ate) — pro rata die pelo número de dias do mês.
   * Retorna { pct, detalhes: [{ de, ate, dias, tipo, taxaMes, pct }] }.
   */
  function jurosPercentual(spec, de, ate, indices, avisos) {
    de = normData(de); ate = normData(ate);
    const detalhes = []; let total = 0;
    if (de >= ate) return { pct: 0, detalhes };
    // fronteiras: inícios de mês + dia seguinte ao fim de cada segmento
    const fronteiras = new Set([de, ate]);
    let m = mesDe(de);
    while (true) { m = addMeses(m, 1); const d = primeiroDia(m); if (d >= ate) break; fronteiras.add(d); }
    for (const seg of spec) if (seg.ate) { const d = addDias(seg.ate, 1); if (d > de && d < ate) fronteiras.add(d); }
    const pts = Array.from(fronteiras).sort();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = segmentoJurosNaData(spec, a);
      if (seg.tipo === 'nenhum') continue;
      const p = parseData(a); const mes = mesDe(a);
      const dias = diffDias(a, b); const dm = diasNoMes(p.y, p.m);
      let taxaMes;
      if (seg.tipo === 'fixa') taxaMes = Number(seg.taxa) || 0;
      else if (seg.tipo === 'taxa_legal') taxaMes = taxaLegalDoMes(indices, mes, avisos);
      else if (seg.tipo === 'selic_simples') taxaMes = valorIndice(indices, 'SELIC', mes, avisos);
      else taxaMes = 0;
      const parcela = taxaMes * dias / dm;
      total += parcela;
      detalhes.push({ de: a, ate: addDias(b, -1), dias, tipo: seg.tipo, taxaMes, pct: parcela });
    }
    return { pct: total, detalhes };
  }

  /** Selic acumulada de forma simples (soma) nos meses [deMes, ateMesExcl) — EC 113 / Manual CJF. */
  function selicAcumulada(deMes, ateMesExcl, indices, avisos) {
    let soma = 0; const detalhes = [];
    for (const mes of listaMeses(deMes, ateMesExcl)) {
      const t = valorIndice(indices, 'SELIC', mes, avisos);
      soma += t; detalhes.push({ mes, taxa: t });
    }
    return { pct: soma, detalhes };
  }

  /**
   * Atualiza UM valor (sem pagamentos).
   * item: { valor, dataBase, dataJuros|null, semJuros }
   */
  function atualizarValor(item, dataFinal, regime, indices, avisos) {
    const P = Number(item.valor);
    const dataBase = normData(item.dataBase);
    dataFinal = normData(dataFinal);
    const dataJuros = (item.semJuros || item.dataJuros === null) ? null : normData(item.dataJuros || item.dataBase);
    const mem = [];
    const r = { valorOriginal: P, correcao: 0, juros: 0, selic: 0, total: P, fatorCorrecao: 1, jurosPct: 0, selicPct: 0, memoria: mem, fases: [] };
    if (dataBase >= dataFinal) { mem.push('Data-base igual ou posterior à data do cálculo: sem atualização.'); return r; }

    // Define as fases
    let sIni = null, sFim = null;
    if (regime.selic) {
      const desde = regime.selic.desde ? normData(regime.selic.desde) : '0000-01-01';
      // A Selic engloba juros: começa na mora (dataJuros); sem juros, Selic não se aplica.
      if (dataJuros) {
        sIni = maxData(maxData(desde, dataJuros), dataBase);
        sFim = regime.selic.ate ? addDias(regime.selic.ate, 1) : dataFinal;
        sFim = minData(sFim, dataFinal);
        if (sIni >= sFim) { sIni = null; sFim = null; }
      }
    }

    const fases = [];
    if (sIni) {
      fases.push({ tipo: 'cj', de: dataBase, ate: sIni, correcao: regime.correcaoAntesSelic || regime.correcao });
      fases.push({ tipo: 'selic', de: sIni, ate: sFim });
      if (sFim < dataFinal) fases.push({ tipo: 'cj', de: sFim, ate: dataFinal, correcao: regime.correcao });
    } else {
      fases.push({ tipo: 'cj', de: dataBase, ate: dataFinal, correcao: regime.correcao });
    }

    let base = P; let correcaoTot = 0, jurosTot = 0, selicTot = 0, fatorTot = 1, jurosPctTot = 0, selicPctTot = 0;
    for (const [fi, f] of fases.entries()) {
      if (f.tipo === 'cj') {
        const fc = fatorCorrecao(f.correcao, mesDe(f.de), mesDe(f.ate), indices, avisos);
        let fator = fc.fator;
        if (regime.pisoNominal && fator < 1) {
          avisos.add('Deflação acumulada em fase do cálculo: fator limitado a 1,000000 (preservação do valor nominal — STJ, Tema 678).');
          fator = 1;
        }
        const corrigido = base * fator;
        let jp = 0, jd = [];
        if (dataJuros) {
          // Na 1ª fase os juros podem começar ANTES da data-base (ex.: danos morais — juros desde o
          // evento danoso, Súm. 54/STJ, e correção desde o arbitramento, Súm. 362/STJ).
          const ji = fi === 0 ? dataJuros : maxData(f.de, dataJuros);
          if (ji < f.ate) { const j = jurosPercentual(regime.juros, ji, f.ate, indices, avisos); jp = j.pct; jd = j.detalhes; }
        }
        const juros = corrigido * jp / 100;
        mem.push('Fase ' + dataBR(f.de) + ' → ' + dataBR(f.ate) + ': ' + brl(base) + ' × fator ' + fator.toFixed(6) +
          ' = ' + brl(corrigido) + (jp ? '; juros ' + pct(jp) + ' = ' + brl(juros) : '; sem juros nesta fase'));
        r.fases.push({ tipo: 'correcao_juros', de: f.de, ate: f.ate, base, fator, corrigido, jurosPct: jp, juros, indices: fc.detalhes, jurosDetalhes: jd });
        correcaoTot += corrigido - base; jurosTot += juros; fatorTot *= fator; jurosPctTot += jp;
        base = corrigido + juros;
      } else {
        const s = selicAcumulada(mesDe(f.de), mesDe(f.ate), indices, avisos);
        const acresc = base * s.pct / 100;
        mem.push('Fase Selic ' + dataBR(f.de) + ' → ' + dataBR(f.ate) + ': ' + brl(base) + ' × Selic acumulada simples ' + pct(s.pct) + ' = ' + brl(acresc));
        r.fases.push({ tipo: 'selic', de: f.de, ate: f.ate, base, selicPct: s.pct, acrescimo: acresc, detalhes: s.detalhes });
        selicTot += acresc; selicPctTot += s.pct;
        base += acresc;
      }
    }
    r.correcao = correcaoTot; r.juros = jurosTot; r.selic = selicTot; r.total = base;
    r.fatorCorrecao = fatorTot; r.jurosPct = jurosPctTot; r.selicPct = selicPctTot;
    return r;
  }

  /**
   * Atualiza um item com pagamentos parciais, com imputação do art. 354 CC
   * (o pagamento quita primeiro os juros vencidos e depois o capital).
   * Cada saldo remanescente vira um novo "sub-item" a partir da data do pagamento.
   */
  function atualizarItem(item, dataFinal, regime, indices, avisos) {
    const pagamentos = (item.pagamentos || []).filter((p) => Number(p.valor) > 0)
      .map((p) => ({ data: normData(p.data), valor: Number(p.valor) })).sort((a, b) => (a.data < b.data ? -1 : 1));
    const memoria = [];
    let saldos = [{ valor: Number(item.valor), dataBase: normData(item.dataBase),
      dataJuros: item.semJuros || item.dataJuros === null ? null : normData(item.dataJuros || item.dataBase), semJuros: !!item.semJuros, origem: 'principal' }];
    let credito = 0; let totalPago = 0;

    for (const pg of pagamentos) {
      if (pg.data > normData(dataFinal)) { avisos.add('Pagamento em ' + dataBR(pg.data) + ' posterior à data do cálculo foi ignorado.'); continue; }
      totalPago += pg.valor;
      let restante = pg.valor;
      // Atualiza todos os saldos até a data do pagamento
      const atual = saldos.map((s) => ({ s, r: atualizarValor(s, pg.data, regime, indices, avisos) }));
      const jurosDevidos = atual.reduce((a, x) => a + x.r.juros, 0);
      const totalDevido = atual.reduce((a, x) => a + x.r.total, 0);
      memoria.push('Pagamento de ' + brl(pg.valor) + ' em ' + dataBR(pg.data) + ': débito atualizado na data = ' + brl(totalDevido) + ' (juros ' + brl(jurosDevidos) + ').');
      if (restante >= totalDevido - 0.005) {
        credito += restante - totalDevido;
        memoria.push('→ Parcela quitada.' + (restante - totalDevido > 0.005 ? ' Excedente de ' + brl(restante - totalDevido) + ' lançado como crédito do devedor (corrigido, sem juros).' : ''));
        saldos = [];
        if (restante - totalDevido > 0.005) saldos.push({ valor: -(restante - totalDevido), dataBase: pg.data, dataJuros: null, semJuros: true, origem: 'credito' });
        continue;
      }
      const pagoJuros = Math.min(restante, jurosDevidos);
      restante -= pagoJuros;
      const capital = totalDevido - jurosDevidos - restante; // capital (corrigido + Selic) remanescente
      const jurosPendentes = jurosDevidos - pagoJuros;
      const novaDataJuros = saldos.some((s) => s.dataJuros && s.dataJuros <= pg.data) ? pg.data :
        (saldos.find((s) => s.dataJuros) || {}).dataJuros || null;
      const temJuros = saldos.some((s) => !s.semJuros);
      saldos = [{ valor: capital, dataBase: pg.data, dataJuros: temJuros ? novaDataJuros : null, semJuros: !temJuros, origem: 'saldo' }];
      if (jurosPendentes > 0.005) saldos.push({ valor: jurosPendentes, dataBase: pg.data, dataJuros: null, semJuros: true, origem: 'juros_pendentes' });
      memoria.push('→ Imputação (art. 354 CC): ' + brl(pagoJuros) + ' em juros e ' + brl(restante) + ' em capital. Saldo de capital ' + brl(capital) +
        (jurosPendentes > 0.005 ? ' + juros pendentes ' + brl(jurosPendentes) + ' (corrigidos, sem novos juros)' : '') + '.');
    }

    const res = { valorOriginal: Number(item.valor), totalPago, correcao: 0, juros: 0, selic: 0, total: 0, fatorCorrecao: null, jurosPct: null, memoria, fases: [], subitens: [] };
    for (const s of saldos) {
      const r = atualizarValor(s, dataFinal, regime, indices, avisos);
      res.subitens.push({ origem: s.origem, dataBase: s.dataBase, dataJuros: s.dataJuros, ...r });
      res.memoria.push(...r.memoria.map((l) => (saldos.length > 1 || pagamentos.length ? '[' + s.origem + '] ' : '') + l));
      res.correcao += r.correcao; res.juros += r.juros; res.selic += r.selic; res.total += r.total;
      if (res.fatorCorrecao == null && s.origem !== 'credito') { res.fatorCorrecao = r.fatorCorrecao; res.jurosPct = r.jurosPct; }
      res.fases.push(...r.fases);
    }
    if (!saldos.length) res.memoria.push('Item integralmente quitado.');
    res.fatorCorrecao = res.fatorCorrecao == null ? 1 : res.fatorCorrecao;
    res.jurosPct = res.jurosPct || 0;
    // Para itens com pagamentos, "correção" é o que excede o valor original não amortizado
    // identidade: original − pago + correção + juros + selic = total
    if (pagamentos.length) res.correcao = res.total - res.juros - res.selic - (Number(item.valor) - totalPago);
    return res;
  }

  // ===================================================================
  // 7. ENCARGOS FINAIS (art. 523 CPC, honorários, multa)
  // ===================================================================
  function calcularEncargos(baseDebito, enc) {
    enc = enc || {};
    const linhas = [];
    const add = (rotulo, valor, fundamento) => { if (valor) linhas.push({ rotulo, valor: round2(valor), fundamento }); };
    if (enc.multaPercentual) add('Multa (' + String(enc.multaPercentual).replace('.', ',') + '% sobre o débito atualizado)', baseDebito * enc.multaPercentual / 100, enc.multaFundamento || 'Título executivo / contrato');
    if (enc.multa523) add('Multa de 10% — art. 523, §1º, CPC', baseDebito * 0.10, 'CPC, art. 523, §1º (não pagamento voluntário em 15 dias)');
    if (enc.honorarios523) add('Honorários advocatícios de 10% — art. 523, §1º, CPC', baseDebito * 0.10, 'CPC, art. 523, §1º — base: débito sem a multa (STJ)');
    if (enc.honorariosPercentual) add('Honorários sucumbenciais (' + String(enc.honorariosPercentual).replace('.', ',') + '%)', baseDebito * enc.honorariosPercentual / 100, 'Fixados no título judicial (CPC, art. 85)');
    if (enc.honorariosFixos) add('Honorários (valor fixo)', Number(enc.honorariosFixos), 'Fixados no título judicial');
    return linhas;
  }

  // ===================================================================
  // 8. CÁLCULO PRINCIPAL
  // ===================================================================
  /**
   * config = {
   *   dataCalculo: 'AAAA-MM-DD',
   *   regime: 'TJSP_LEI_14905' | {...},
   *   itens: [{ descricao, valor, dataBase, dataJuros?, semJuros?, pagamentos?: [{data, valor}] }],
   *   despesas?: [{ descricao, valor, data }]   // custas: só correção, sem juros
   *   encargos?: { multa523, honorarios523, honorariosPercentual, honorariosFixos, multaPercentual }
   *   processo?: { numero, partes, juizo, observacoes }
   * }
   */
  function calcular(config, indices) {
    indices = indices || {};
    const avisosSet = new Set();
    const regime = resolverRegime(config.regime || 'TJSP_LEI_14905');
    const dataCalculo = normData(config.dataCalculo || new Date().toISOString().slice(0, 10));
    const itensRes = [];
    for (const [i, it] of (config.itens || []).entries()) {
      if (!it || !(Number(it.valor) || (it.pagamentos && it.pagamentos.length))) continue;
      const r = atualizarItem(it, dataCalculo, regime, indices, avisosSet);
      itensRes.push({ n: i + 1, descricao: it.descricao || ('Item ' + (i + 1)), dataBase: normData(it.dataBase),
        dataJuros: it.semJuros ? null : normData(it.dataJuros || it.dataBase), tags: it.tags || [],
        competencia: it.competencia, obs: it.obs,
        ...r, correcao: round2(r.correcao), juros: round2(r.juros), selic: round2(r.selic), total: round2(r.total), totalPago: round2(r.totalPago) });
    }
    const despesasRes = [];
    const regimeDesp = { ...regime, juros: PRESETS_JUROS.NENHUM.spec, selic: null };
    for (const d of (config.despesas || [])) {
      if (!Number(d.valor)) continue;
      const r = atualizarValor({ valor: d.valor, dataBase: d.data, semJuros: true }, dataCalculo, regimeDesp, indices, avisosSet);
      despesasRes.push({ descricao: d.descricao || 'Despesa', data: normData(d.data), valorOriginal: Number(d.valor), fatorCorrecao: r.fatorCorrecao, total: round2(r.total) });
    }
    const soma = (arr, k) => round2(arr.reduce((a, x) => a + (x[k] || 0), 0));
    const totais = {
      valorOriginal: soma(itensRes, 'valorOriginal'), pago: soma(itensRes, 'totalPago'),
      correcao: soma(itensRes, 'correcao'), juros: soma(itensRes, 'juros'), selic: soma(itensRes, 'selic'),
      debito: soma(itensRes, 'total'), despesas: soma(despesasRes, 'total')
    };
    const encargos = calcularEncargos(totais.debito, config.encargos);
    const totalEncargos = round2(encargos.reduce((a, e) => a + e.valor, 0));
    const totalGeral = round2(totais.debito + totais.despesas + totalEncargos);

    const indicesUsados = {};
    for (const it of itensRes) for (const f of it.fases) {
      if (f.indices) for (const d of f.indices) (indicesUsados[d.indice] = indicesUsados[d.indice] || {})[d.mes] = d.taxa;
      if (f.detalhes) for (const d of f.detalhes) (indicesUsados.SELIC = indicesUsados.SELIC || {})[d.mes] = d.taxa;
      if (f.jurosDetalhes) for (const d of f.jurosDetalhes) if (d.tipo === 'taxa_legal') (indicesUsados.TAXA_LEGAL = indicesUsados.TAXA_LEGAL || {})[mesDe(d.de)] = d.taxaMes;
    }

    return {
      versaoMotor: VERSAO, geradoEm: new Date().toISOString(), dataCalculo,
      processo: config.processo || {}, regime: { rotulo: regime.rotulo, correcao: regime.correcaoRotulo, juros: regime.jurosRotulo, selic: regime.selic, pisoNominal: regime.pisoNominal },
      itens: itensRes, despesas: despesasRes, totais, encargos, totalEncargos, totalGeral,
      indicesUsados, avisos: Array.from(avisosSet)
    };
  }

  // ===================================================================
  // 9. PENSÃO ALIMENTÍCIA
  // ===================================================================
  function salarioMinimo(mes, indices) {
    if (indices && indices.SALARIO_MINIMO && indices.SALARIO_MINIMO[mes] != null) return { valor: indices.SALARIO_MINIMO[mes], fonte: 'BCB/SGS 1619' };
    let v = null;
    for (const k of Object.keys(SALARIO_MINIMO_TABELA).sort()) if (k <= mes) v = SALARIO_MINIMO_TABELA[k];
    return { valor: v, fonte: 'tabela interna (conferir)' };
  }

  /**
   * pensao = {
   *   modo: 'fixo' | 'salario_minimo' | 'manual',
   *   valor (fixo), percentualSM (ex.: 30 = 30% do SM), valoresManuais: { 'AAAA-MM': valor },
   *   inicio: 'AAAA-MM', fim: 'AAAA-MM', diaVencimento: 10,
   *   decimoTerceiro: false (gera parcela extra em dezembro, ex.: alimentos sobre 13º),
   *   pagamentos: [{ competencia: 'AAAA-MM', data, valor }],
   *   dataAjuizamento: 'AAAA-MM-DD' (opcional — separa rito da prisão x expropriação),
   *   prescricaoSuspensa: true (credor menor sob poder familiar do devedor — art. 197, II, CC)
   * }
   */
  function gerarParcelasPensao(pensao, indices, avisos) {
    const itens = [];
    const ini = mesDe(pensao.inicio), fim = mesDe(pensao.fim);
    const dia = Math.min(Math.max(parseInt(pensao.diaVencimento, 10) || 10, 1), 31);
    const pags = (pensao.pagamentos || []).map((p) => ({ ...p, competencia: p.competencia ? mesDe(p.competencia) : mesDe(p.data) }));
    const meses = listaMeses(ini, addMeses(fim, 1));
    const comp = [];
    for (const m of meses) {
      comp.push({ mes: m, extra: false });
      if (pensao.decimoTerceiro && m.endsWith('-12')) comp.push({ mes: m, extra: true });
    }
    for (const c of comp) {
      const [y, mm] = c.mes.split('-').map(Number);
      const venc = c.mes + '-' + pad(Math.min(dia, diasNoMes(y, mm)));
      let valor = 0, obs = '';
      if (pensao.modo === 'salario_minimo') {
        const sm = salarioMinimo(c.mes, indices);
        if (sm.valor == null) { avisos.add('Salário mínimo de ' + mesBR(c.mes) + ' não encontrado.'); continue; }
        valor = round2(sm.valor * Number(pensao.percentualSM) / 100);
        obs = String(pensao.percentualSM).replace('.', ',') + '% × SM ' + brl(sm.valor) + ' (' + sm.fonte + ')';
        if (sm.fonte !== 'BCB/SGS 1619') avisos.add('Salário mínimo obtido da tabela interna para algumas competências — conferir valores oficiais.');
      } else if (pensao.modo === 'manual') {
        const v = pensao.valoresManuais && pensao.valoresManuais[c.mes];
        if (v == null || v === '') continue;
        valor = Number(v); obs = 'valor informado';
      } else {
        valor = Number(pensao.valor); obs = 'valor fixo';
      }
      const pagamentos = pags.filter((p) => p.competencia === c.mes && !!p.extra === c.extra).map((p) => ({ data: p.data || venc, valor: p.valor }));
      itens.push({ descricao: 'Pensão ' + mesBR(c.mes) + (c.extra ? ' (13º)' : ''), competencia: c.mes, valor, dataBase: venc, dataJuros: venc, pagamentos, obs });
    }
    return itens;
  }

  function calcularPensao(config, indices) {
    indices = indices || {};
    const avisos = new Set();
    const pensao = config.pensao || {};
    const dataCalc = normData(config.dataCalculo || new Date().toISOString().slice(0, 10));
    const todas = gerarParcelasPensao(pensao, indices, avisos);
    // Parcelas que ainda não venceram na data do cálculo não são dívida.
    const itens = todas.filter((i) => i.dataBase <= dataCalc);
    if (itens.length < todas.length) avisos.add((todas.length - itens.length) + ' parcela(s) com vencimento após a data do cálculo não foram incluídas.');
    const dataAj = pensao.dataAjuizamento ? normData(pensao.dataAjuizamento) : null;

    // Classificação por rito (art. 528, §7º, CPC + Súmula 309/STJ)
    if (dataAj) {
      const anteriores = itens.filter((i) => i.dataBase < dataAj);
      const tres = new Set(anteriores.slice(-3).map((i) => i));
      for (const it of itens) {
        it.tags = [];
        if (it.dataBase >= dataAj) it.tags.push('prisao_vincenda');
        else if (tres.has(it)) it.tags.push('prisao_3_ultimas');
        else it.tags.push('expropriacao');
        if (!pensao.prescricaoSuspensa) {
          const limite = String(+dataAj.slice(0, 4) - 2) + dataAj.slice(4);
          if (it.dataBase < limite) it.tags.push('possivel_prescricao');
        }
      }
    }
    let itensCalc = itens;
    if (pensao.excluirPrescritas) itensCalc = itens.filter((i) => !(i.tags || []).includes('possivel_prescricao'));

    const res = calcular({ ...config, itens: itensCalc }, indices);
    res.avisos = Array.from(new Set([...avisos, ...res.avisos]));
    res.pensao = { modo: pensao.modo, dataAjuizamento: dataAj, prescricaoSuspensa: !!pensao.prescricaoSuspensa, parcelas: itens.length };

    if (dataAj) {
      const somaTag = (pred) => round2(res.itens.filter(pred).reduce((a, x) => a + x.total, 0));
      res.ritos = {
        prisao: somaTag((x) => x.tags.includes('prisao_3_ultimas') || x.tags.includes('prisao_vincenda')),
        prisao3Ultimas: somaTag((x) => x.tags.includes('prisao_3_ultimas')),
        prisaoVincendas: somaTag((x) => x.tags.includes('prisao_vincenda')),
        expropriacao: somaTag((x) => x.tags.includes('expropriacao')),
        possivelPrescricao: somaTag((x) => x.tags.includes('possivel_prescricao'))
      };
      if (!pensao.prescricaoSuspensa && res.ritos.possivelPrescricao > 0)
        res.avisos.push('Há parcelas vencidas há mais de 2 anos do ajuizamento (art. 206, §2º, CC). Verificar se a prescrição está suspensa (art. 197, II, CC — credor menor sob poder familiar do devedor).');
    }
    return res;
  }

  // ===================================================================
  // 10. MEMÓRIA DE CÁLCULO (Markdown) e CSV
  // ===================================================================
  function gerarMemoriaMarkdown(res) {
    const L = [];
    const p = res.processo || {};
    L.push('# Memória de Cálculo — Atualização de Débito Judicial');
    L.push('');
    if (p.numero) L.push('**Processo:** ' + p.numero + '  ');
    if (p.juizo) L.push('**Juízo:** ' + p.juizo + '  ');
    if (p.partes) L.push('**Partes:** ' + p.partes + '  ');
    L.push('**Data do cálculo:** ' + dataBR(res.dataCalculo) + '  ');
    L.push('**Critério:** ' + res.regime.rotulo + '  ');
    L.push('**Correção monetária:** ' + res.regime.correcao + '  ');
    L.push('**Juros de mora:** ' + res.regime.juros + '  ');
    if (res.regime.selic) L.push('**Fase Selic:** ' + (res.regime.selic.desde ? 'desde ' + dataBR(res.regime.selic.desde) : 'desde a mora') + (res.regime.selic.ate ? ' até ' + dataBR(res.regime.selic.ate) : ' até a data do cálculo') + ' (Selic acumulada simples, não cumulada com outros índices)  ');
    L.push('**Fonte dos índices:** Banco Central do Brasil — SGS (api.bcb.gov.br)');
    L.push('');
    L.push('## Demonstrativo');
    L.push('');
    L.push('| # | Descrição | Data-base | Valor original | Pago | Fator corr. | Correção | Juros (%) | Juros | Selic | Total |');
    L.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const it of res.itens) {
      L.push('| ' + it.n + ' | ' + it.descricao + (it.tags && it.tags.length ? ' `' + it.tags.join(', ') + '`' : '') + ' | ' + dataBR(it.dataBase) + ' | ' + brl(it.valorOriginal) + ' | ' + brl(it.totalPago || 0) +
        ' | ' + it.fatorCorrecao.toFixed(6) + ' | ' + brl(it.correcao) + ' | ' + pct(it.jurosPct, 4) + ' | ' + brl(it.juros) + ' | ' + brl(it.selic) + ' | **' + brl(it.total) + '** |');
    }
    const t = res.totais;
    L.push('| | **Totais** | | ' + brl(t.valorOriginal) + ' | ' + brl(t.pago) + ' | | ' + brl(t.correcao) + ' | | ' + brl(t.juros) + ' | ' + brl(t.selic) + ' | **' + brl(t.debito) + '** |');
    L.push('');
    if (res.despesas.length) {
      L.push('## Custas e despesas (somente correção monetária)');
      L.push('');
      L.push('| Descrição | Data | Valor | Fator | Atualizado |'); L.push('|---|---|---:|---:|---:|');
      for (const d of res.despesas) L.push('| ' + d.descricao + ' | ' + dataBR(d.data) + ' | ' + brl(d.valorOriginal) + ' | ' + d.fatorCorrecao.toFixed(6) + ' | ' + brl(d.total) + ' |');
      L.push('');
    }
    L.push('## Resumo');
    L.push('');
    L.push('| Rubrica | Valor |'); L.push('|---|---:|');
    L.push('| Débito principal atualizado (correção + juros) | ' + brl(t.debito) + ' |');
    if (t.despesas) L.push('| Custas e despesas atualizadas | ' + brl(t.despesas) + ' |');
    for (const e of res.encargos) L.push('| ' + e.rotulo + ' | ' + brl(e.valor) + ' |');
    L.push('| **TOTAL GERAL** | **' + brl(res.totalGeral) + '** |');
    L.push('');
    if (res.ritos) {
      L.push('## Pensão alimentícia — separação por rito');
      L.push('');
      L.push('| Rito | Valor atualizado |'); L.push('|---|---:|');
      L.push('| Prisão civil (art. 528, §§3º e 7º, CPC; Súm. 309/STJ) — 3 últimas anteriores ao ajuizamento | ' + brl(res.ritos.prisao3Ultimas) + ' |');
      L.push('| Prisão civil — parcelas vencidas no curso do processo | ' + brl(res.ritos.prisaoVincendas) + ' |');
      L.push('| Expropriação (art. 528, §8º, c/c art. 523, CPC) — demais parcelas | ' + brl(res.ritos.expropriacao) + ' |');
      if (res.ritos.possivelPrescricao) L.push('| ⚠ Parcelas com possível prescrição (art. 206, §2º, CC) | ' + brl(res.ritos.possivelPrescricao) + ' |');
      L.push('');
    }
    L.push('## Detalhamento por item');
    L.push('');
    for (const it of res.itens) {
      L.push('**' + it.n + '. ' + it.descricao + '** — ' + brl(it.valorOriginal) + ' em ' + dataBR(it.dataBase) + (it.dataJuros ? '; juros desde ' + dataBR(it.dataJuros) : '; sem juros'));
      for (const m of it.memoria) L.push('- ' + m);
      L.push('');
    }
    const usados = res.indicesUsados || {};
    const nomes = Object.keys(usados);
    if (nomes.length) {
      L.push('## Índices utilizados (% ao mês)');
      L.push('');
      const meses = Array.from(new Set(nomes.flatMap((n) => Object.keys(usados[n])))).sort();
      L.push('| Mês | ' + nomes.join(' | ') + ' |');
      L.push('|---|' + nomes.map(() => '---:').join('|') + '|');
      for (const m of meses) L.push('| ' + mesBR(m) + ' | ' + nomes.map((n) => (usados[n][m] != null ? pct(usados[n][m], n === 'TAXA_LEGAL' ? 6 : 2) : '—')).join(' | ') + ' |');
      L.push('');
    }
    if (res.avisos.length) {
      L.push('## Avisos e ressalvas');
      L.push('');
      for (const a of res.avisos) L.push('- ' + a);
      L.push('');
    }
    L.push('## Notas metodológicas');
    L.push('');
    L.push('- Correção monetária mensal, sem pro rata: aplica-se a variação dos meses compreendidos entre o mês da data-base (inclusive) e o mês do cálculo (exclusive), como nas tabelas práticas dos tribunais.');
    L.push('- Juros de mora simples, calculados pro rata die (dias do período ÷ dias do mês) e incidentes sobre o valor corrigido; não há capitalização.');
    L.push('- Taxa legal (art. 406 CC, red. Lei 14.905/2024): Selic − IPCA, piso zero, conforme Res. CMN 5.171/2024 e divulgação do BCB.');
    L.push('- Pagamentos parciais imputados primeiro nos juros e depois no capital (art. 354 CC).');
    L.push('- Os critérios fixados no título judicial prevalecem sobre os aqui adotados. Cálculo sujeito a conferência pelo contador judicial.');
    L.push('');
    L.push('_Gerado pelo motor de cálculo SIGJURI v' + res.versaoMotor + ' em ' + dataBR(res.geradoEm.slice(0, 10)) + '._');
    return L.join('\n');
  }

  function gerarCSV(res) {
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const num = (v) => round2(v).toFixed(2).replace('.', ',');
    const L = [['Item', 'Descrição', 'Data-base', 'Valor original', 'Pago', 'Fator correção', 'Correção', 'Juros %', 'Juros', 'Selic', 'Total', 'Tags'].map(esc).join(';')];
    for (const it of res.itens) L.push([it.n, it.descricao, dataBR(it.dataBase), num(it.valorOriginal), num(it.totalPago || 0), it.fatorCorrecao.toFixed(6).replace('.', ','),
      num(it.correcao), it.jurosPct.toFixed(4).replace('.', ','), num(it.juros), num(it.selic), num(it.total), (it.tags || []).join(' ')].map(esc).join(';'));
    L.push(['', 'TOTAL DÉBITO', '', num(res.totais.valorOriginal), num(res.totais.pago), '', num(res.totais.correcao), '', num(res.totais.juros), num(res.totais.selic), num(res.totais.debito), ''].map(esc).join(';'));
    for (const d of res.despesas) L.push(['', d.descricao, dataBR(d.data), num(d.valorOriginal), '', d.fatorCorrecao.toFixed(6).replace('.', ','), '', '', '', '', num(d.total), 'despesa'].map(esc).join(';'));
    for (const e of res.encargos) L.push(['', e.rotulo, '', '', '', '', '', '', '', '', num(e.valor), 'encargo'].map(esc).join(';'));
    L.push(['', 'TOTAL GERAL', '', '', '', '', '', '', '', '', num(res.totalGeral), ''].map(esc).join(';'));
    return '﻿' + L.join('\r\n');
  }

  /** Mês mais antigo que o cálculo precisa (para buscar índices). */
  function mesInicialNecessario(config) {
    const datas = [];
    for (const it of config.itens || []) { if (it.dataBase) datas.push(normData(it.dataBase)); }
    for (const d of config.despesas || []) if (d.data) datas.push(normData(d.data));
    if (config.pensao && config.pensao.inicio) datas.push(primeiroDia(mesDe(config.pensao.inicio)));
    if (!datas.length) return mesDe(config.dataCalculo || new Date().toISOString().slice(0, 10));
    return addMeses(mesDe(datas.sort()[0]), -1);
  }

  /** Atalho: busca índices em tempo real e calcula (débito comum ou pensão). */
  async function calcularComIndicesAtuais(config, opts) {
    opts = opts || {};
    const series = seriesNecessarias(config);
    const de = mesInicialNecessario(config);
    const ate = mesDe(config.dataCalculo || new Date().toISOString().slice(0, 10));
    const busca = await buscarIndices(series, de, ate, opts);
    const indices = { ...busca.indices, ...(opts.indicesManuais || {}) };
    const res = config.pensao ? calcularPensao(config, indices) : calcular(config, indices);
    for (const [nome, erro] of Object.entries(busca.erros)) res.avisos.unshift('Não foi possível obter ' + nome + ' do BCB: ' + erro);
    res.fonteIndices = { fonte: busca.fonte, consultadoEm: busca.consultadoEm, series: series.map((n) => n + ' (SGS ' + SERIES_SGS[n].codigo + ')') };
    return res;
  }

  return {
    VERSAO, SERIES_SGS, SALARIO_MINIMO_TABELA, MARCOS, PRESETS_CORRECAO, PRESETS_JUROS, REGIMES,
    // núcleo
    calcular, calcularPensao, atualizarValor, atualizarItem, fatorCorrecao, jurosPercentual, selicAcumulada,
    taxaLegalDoMes, calcularEncargos, gerarParcelasPensao, salarioMinimo, resolverRegime,
    // índices
    buscarSerieBCB, buscarIndices, urlSerieBCB, parseRespostaBCB, seriesNecessarias, mesInicialNecessario, calcularComIndicesAtuais,
    // saída
    gerarMemoriaMarkdown, gerarCSV,
    // utilitários
    util: { parseData, normData, mesDe, addMeses, addDias, diffDias, dataBR, mesBR, brl, pct, round2, listaMeses }
  };
});
