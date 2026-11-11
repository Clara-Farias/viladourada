const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-risco.js');
const R = GC.data.risco;
const oc = (id) => GC.data.ocorrencias.find((o) => o.id === id);

test('cada área de risco fica dentro do seu bairro', () => {
  for (const a of R.areas) {
    const b = GC.data.bairros.find((x) => x.id === a.bairroId);
    assert.ok(b, a.id);
    for (const p of a.poligono) assert.ok(GC.risco.dentro(p, b.poligono), `${a.id}: vértice fora de ${b.id}`);
  }
});

test('previsão é acumulada (cada janela >= a anterior)', () => {
  R.previsao.janelas.reduce((ant, j) => { assert.ok(j.mm >= ant.mm && j.horas > ant.horas); return j; });
});

test('deslizamento soma o que já choveu; alagamento olha só a chuva que vem', () => {
  const prev = { acumulado72h: 64, janelas: [{ horas: 6, mm: 22 }, { horas: 24, mm: 48 }] };
  const base = { poligono: [[0, 0], [0, 1], [1, 1]], familias: 1 };
  assert.equal(GC.risco.avaliar(Object.assign({ tipo: 'deslizamento', limiarMm: 80 }, base), prev).horasAte, 6);
  assert.equal(GC.risco.avaliar(Object.assign({ tipo: 'alagamento', limiarMm: 80 }, base), prev).horasAte, null);
  assert.equal(GC.risco.avaliar(Object.assign({ tipo: 'alagamento', limiarMm: 40 }, base), prev).nivel, 'medio');
  assert.equal(GC.risco.avaliar(Object.assign({ tipo: 'alagamento', limiarMm: 20 }, base), prev).nivel, 'alto');
});

test('áreas com alagamento/deslizamento aberto aparecem como atingidas', () => {
  const r = GC.risco.resumo(GC.data.ocorrencias);
  const por = (id) => r.areas.find((a) => a.id === id);
  assert.deepEqual([...por('baixada-xv').atingidaPor], ['oc-01']);
  assert.deepEqual([...por('margem-lagoa').atingidaPor], ['oc-03']);
  assert.deepEqual([...por('encosta-serra').atingidaPor], ['oc-04']);
  assert.equal(por('corrego-porto').atingida, false);
  // Resolvida não atinge mais.
  const semOc04 = GC.data.ocorrencias.map((o) => (o.id === 'oc-04' ? Object.assign({}, o, { status: 'resolvida' }) : o));
  assert.equal(GC.risco.resumo(semOc04).areas.find((a) => a.id === 'encosta-serra').atingida, false);
  assert.ok(oc('oc-04'));
});

test('resumo: ordem por nível, famílias em risco alto e alerta preventivo onde ainda dá para agir', () => {
  const r = GC.risco.resumo(GC.data.ocorrencias);
  assert.deepEqual([...r.altas.map((a) => a.id)].sort(), ['baixada-xv', 'encosta-serra', 'morro-vila-nova']);
  assert.equal(r.familiasRiscoAlto, 137);
  assert.equal(r.areas[r.areas.length - 1].nivel, 'baixo');
  // Encosta e Baixada já foram atingidas: o preventivo é o Morro da Vila Nova (ainda dá para agir).
  assert.equal(r.preventivo.id, 'morro-vila-nova');
  assert.equal(r.preventivo.horasAte, 6);
  // Sem ocorrências abertas, o preventivo é a área alta com mais famílias e menos horas.
  assert.equal(GC.risco.resumo([]).preventivo.id, 'morro-vila-nova');
});
