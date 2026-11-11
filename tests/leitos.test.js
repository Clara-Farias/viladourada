const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-leitos.js');
const L = GC.data.leitos;

test('unidades de leitos ficam em bairros existentes, com grupos coerentes', () => {
  const bairros = new Set(GC.data.bairros.map((b) => b.id));
  assert.ok(L.unidades.length >= 4);
  for (const u of L.unidades) {
    assert.ok(bairros.has(u.bairroId), u.id);
    assert.ok(typeof u.lat === 'number' && typeof u.lng === 'number', u.id);
    assert.ok(u.grupos.some((g) => g.uti), `${u.id}: sem UTI/sala vermelha`);
    for (const g of u.grupos) assert.ok(g.ocupados >= 0 && g.ocupados <= g.total, `${u.id} ${g.rotulo}`);
  }
});

test('situação: 90% ou mais é crítica, 80% atenção, abaixo folga', () => {
  assert.equal(GC.leitos.situacao(90), 'critica');
  assert.equal(GC.leitos.situacao(89), 'atencao');
  assert.equal(GC.leitos.situacao(80), 'atencao');
  assert.equal(GC.leitos.situacao(79), 'ok');
});

test('UTI cheia deixa a unidade crítica mesmo com a enfermaria folgada', () => {
  const u = GC.leitos.resumoUnidade({ id: 'x', atendimentosHoje: { A: 3, B: 2 }, grupos: [
    { rotulo: 'UTI', total: 10, ocupados: 10, uti: true },
    { rotulo: 'Enfermaria', total: 90, ocupados: 30 },
  ] });
  assert.equal(u.pct, 40);
  assert.equal(u.utiPct, 100);
  assert.equal(u.situacao, 'critica');
  assert.equal(u.livres, 60);
  assert.equal(u.atendimentos, 5);
});

test('resumo da rede soma unidades, ordena da mais cheia e aponta as críticas', () => {
  const r = GC.leitos.resumo();
  assert.equal(r.total, 386);
  assert.equal(r.ocupados, 306);
  assert.equal(r.livres, 80);
  assert.equal(r.pct, 79);
  assert.equal(r.utiTotal, 48);
  assert.equal(r.utiLivres, 10);
  assert.equal(r.unidades[0].id, 'hm');
  assert.deepEqual([...r.emAlerta.map((u) => u.id)], ['hm']);
  assert.equal(r.atendimentosHoje.total, Object.values(r.atendimentosHoje.porTipo).reduce((s, n) => s + n, 0));
});

test('unidade crítica aponta para uma ocorrência ativa de Saúde', () => {
  for (const u of GC.leitos.resumo().emAlerta) {
    const o = GC.data.ocorrencias.find((x) => x.id === u.ocorrenciaId);
    assert.ok(o, `${u.id}: sem ocorrência`);
    assert.equal(o.area, 'saude');
    assert.equal(o.bairroId, u.bairroId);
  }
});
