const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js');
const todas = [...GC.data.ocorrencias, ...GC.data.ocorrenciasExtras];
const oc = (id) => todas.find((o) => o.id === id);

test('todas as 28 ocorrências têm detalhe completo', () => {
  assert.equal(todas.length, 28);
  for (const o of todas) {
    assert.ok(GC.data.detalhes[o.id], `${o.id}: sem detalhe escrito`);
    assert.ok(GC.data.regras[o.tipo], `${o.id}: sem regra para o tipo ${o.tipo}`);
    const d = GC.detalharOcorrencia(o);
    assert.ok(d.regra && d.regra.expressao, `${o.id}: regra`);
    assert.ok(d.regra.fontes.length >= 1, `${o.id}: fontes`);
    assert.ok(Number.isInteger(d.regra.disparos30d), `${o.id}: disparos`);
    assert.equal(d.evidencias.length, 3, `${o.id}: evidências`);
    assert.ok(d.evidencias.every((e) => typeof e === 'string' && e.trim()), `${o.id}: evidência vazia`);
    assert.ok(d.impacto && d.acaoRecomendada, `${o.id}: impacto/ação`);
    assert.ok(d.responsaveis.length >= 2, `${o.id}: responsáveis`);
  }
});

test('linha de histórico bate com historico30d', () => {
  assert.equal(GC.detalharOcorrencia(oc('oc-01')).evidencias[2], '4 casos de Defesa Civil no bairro em 30 dias (média por bairro: 1)');
});

test('bairro sem histórico mostra 0', () => {
  assert.ok(GC.detalharOcorrencia(oc('oc-15')).evidencias[2].startsWith('2 casos de Educação'));
  assert.ok(GC.detalharOcorrencia(oc('oc-25')).evidencias[2].startsWith('0 casos de Defesa Civil'));
});

test('responsáveis na ordem fixada', () => {
  assert.equal(GC.data.responsaveis.defesa_civil[0], 'Coord. de Defesa Civil');
});

test('detalharOcorrencia não altera a ocorrência', () => {
  const o = oc('oc-01');
  const antes = JSON.stringify(o);
  GC.detalharOcorrencia(o);
  assert.equal(JSON.stringify(o), antes);
});

test('disparos das regras não passam do histórico de 30 dias da área', () => {
  const porArea = {};
  for (const tipo of new Set(todas.map((o) => o.tipo))) {
    const areaId = todas.find((o) => o.tipo === tipo).area;
    porArea[areaId] = (porArea[areaId] || 0) + GC.data.regras[tipo].disparos30d;
  }
  for (const [areaId, soma] of Object.entries(porArea)) {
    const total = Object.values(GC.data.historico30d[areaId]).reduce((s, n) => s + n, 0);
    assert.ok(soma <= total, `${areaId}: regras ${soma} > histórico ${total}`);
  }
});

test('toda regra tem a versão em palavras, sem jargão técnico', () => {
  for (const [tipo, r] of Object.entries(GC.data.regras)) {
    const t = GC.regraEmPalavras(r);
    assert.ok(t && t.length > 10, `${tipo}: sem texto`);
    assert.ok(!/[_<>=]/.test(t), `${tipo}: texto com jargão: ${t}`);
  }
});

test('regra nova (sem texto escrito) ganha tradução simples da expressão', () => {
  const t = GC.regraEmPalavras({ expressao: 'chuva_mm_h > 30 E chamados_156 >= 5' });
  assert.equal(t, 'Chuva mm h acima de 30 e chamados 156 pelo menos 5');
  assert.equal(GC.regraEmPalavras(null), '');
});
