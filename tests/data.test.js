const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js');
const d = GC.data;
const AREAS = ['infraestrutura', 'defesa_civil', 'saude', 'educacao', 'seguranca', 'mobilidade', 'limpeza'];
const SEVERIDADES = ['critica', 'alta', 'media'];

function dentro(ponto, poligono) {
  const [y, x] = ponto;
  let inside = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('areas tem os 7 ids esperados', () => {
  assert.deepEqual([...d.areas.map((a) => a.id)].sort(), [...AREAS].sort());
  for (const a of d.areas) assert.ok(a.secretaria.nome && a.secretaria.emoji && a.nome && a.emoji);
});

test('toda ocorrência e conquista referencia bairro e área existentes', () => {
  const bairros = new Set(d.bairros.map((b) => b.id));
  for (const item of [...d.ocorrencias, ...d.ocorrenciasExtras, ...d.conquistas]) {
    assert.ok(bairros.has(item.bairroId), `${item.id} bairro ${item.bairroId}`);
    assert.ok(AREAS.includes(item.area), `${item.id} area ${item.area}`);
  }
});

test('toda ocorrência tem severidade válida', () => {
  for (const o of [...d.ocorrencias, ...d.ocorrenciasExtras]) assert.ok(SEVERIDADES.includes(o.severidade), o.id);
});

test('ocorrências nascem encaminhadas, e 5 já estão em campo', () => {
  const emCampo = d.ocorrencias.filter((o) => o.status === 'em_campo').map((o) => o.id);
  assert.deepEqual([...emCampo], ['oc-05', 'oc-11', 'oc-14', 'oc-16', 'oc-21']);
  assert.ok(d.ocorrencias.every((o) => ['encaminhada', 'em_campo'].includes(o.status)));
  assert.ok(d.ocorrenciasExtras.every((o) => o.status === 'encaminhada'));
});

test('areasEnvolvidas: duas conjuntas, o resto só a própria área', () => {
  const todas = [...d.ocorrencias, ...d.ocorrenciasExtras];
  assert.deepEqual([...todas.filter((o) => o.areasEnvolvidas.length > 1).map((o) => o.id)], ['oc-01', 'oc-06']);
  assert.ok(todas.every((o) => o.areasEnvolvidas[0] === o.area));
});

test('prazoMin por gravidade', () => {
  assert.deepEqual({ ...d.prazoMin }, { critica: 120, alta: 1440, media: 4320 });
});

test('desempenho30d coerente com historico30d', () => {
  for (const a of d.areas) {
    const x = d.desempenho30d[a.id];
    const casos = Object.values(d.historico30d[a.id]).reduce((s, n) => s + n, 0);
    assert.ok(x.resolvidas <= casos && x.anterior.resolvidas > 0, a.id);
    assert.ok(x.noPrazoPct >= 0 && x.noPrazoPct <= 100, a.id);
  }
  assert.deepEqual([...d.areas.filter((a) => d.desempenho30d[a.id].noPrazoPct < 85).map((a) => a.id)], ['infraestrutura']);
});

test('resolvidasRecentes: 3 itens, um atrasado, com posição', () => {
  assert.equal(d.resolvidasRecentes.length, 3);
  assert.equal(d.resolvidasRecentes.filter((r) => r.atrasoMin > 0).length, 1);
  assert.ok(d.resolvidasRecentes.every((r) => typeof r.lat === 'number' && r.haMin > 0));
});

test('há 24 ocorrências ativas e 4 extras com ids únicos entre si', () => {
  assert.equal(d.ocorrencias.length, 24);
  assert.equal(d.ocorrenciasExtras.length, 4);
  const ids = [...d.ocorrencias, ...d.ocorrenciasExtras].map((o) => o.id);
  assert.equal(new Set(ids).size, 28);
});

test('cada ponto está dentro do polígono do seu bairro', () => {
  const porId = Object.fromEntries(d.bairros.map((b) => [b.id, b]));
  for (const item of [...d.ocorrencias, ...d.ocorrenciasExtras, ...d.conquistas]) {
    assert.ok(dentro([item.lat, item.lng], porId[item.bairroId].poligono), `${item.id} fora de ${item.bairroId}`);
  }
});

test('Centro tem ≥2 alagamentos críticos e historico30d.defesa_civil.centro === 4', () => {
  const alag = d.ocorrencias.filter((o) => o.bairroId === 'centro' && o.area === 'defesa_civil' && o.severidade === 'critica');
  assert.ok(alag.length >= 2);
  assert.equal(d.historico30d.defesa_civil.centro, 4);
});

test('Vila Nova tem ≥2 quedas de energia', () => {
  const quedas = d.ocorrencias.filter((o) => o.bairroId === 'vila_nova' && o.area === 'infraestrutura' && /energia/i.test(o.tipo));
  assert.ok(quedas.length >= 2);
});

test('toda área tem ao menos uma tendência', () => {
  for (const a of AREAS) assert.ok(d.tendencias.some((t) => t.area === a), a);
});
