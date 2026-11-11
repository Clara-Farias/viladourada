const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-obras.js');
const D = GC.data.obras;
const r = GC.obras.resumo();
const por = (id) => r.obras.find((o) => o.id === id);

test('obras: bairro e setor existentes, gasto até o contrato, datas em ordem', () => {
  const bairros = new Set(GC.data.bairros.map((b) => b.id));
  const setores = new Set(D.setores.map((s) => s.id));
  for (const o of D.obras) {
    assert.ok(bairros.has(o.bairroId), o.id);
    assert.ok(setores.has(o.setor), o.id);
    assert.ok(o.gastoMi <= o.contratoMi, `${o.id}: pago acima do contrato`);
    assert.ok(o.inicio < o.previsaoOriginal && o.inicio <= o.ultimoAvanco, `${o.id}: datas`);
  }
});

test('6 atrasadas: bate com o indicador "Obras atrasadas" da Infraestrutura', () => {
  assert.equal(r.atrasadas, 6);
  assert.equal(r.emAndamento, 10);
  assert.equal(r.concluidas, 2);
  assert.equal(r.noPrazo, 4);
});

test('situação: paralisada, atrasada, em dia e concluída (entregue antes não conta atraso)', () => {
  assert.equal(por('cmei-vn').situacao, 'paralisada');
  assert.equal(por('cmei-vn').semAvancoDias, 77);
  assert.equal(por('galeria-xv').situacao, 'atrasada');
  assert.equal(por('galeria-xv').diasAtraso, 38);
  assert.equal(por('teatro-centro').situacao, 'em_dia');
  assert.equal(por('praca-flores').situacao, 'concluida');
  assert.equal(por('praca-flores').diasAtraso, 0);
  // A paralisada vem primeiro; depois as atrasadas da que mais atrasou.
  assert.equal(r.obras[0].id, 'cmei-vn');
  assert.equal(r.obras[1].id, 'hm-uti');
});

test('previsão vencida sem nova data também conta como atraso', () => {
  const o = GC.obras.avaliar({ id: 'x', contratoMi: 1, gastoMi: 0.5, avancoPct: 50, inicio: '2026-01-01', previsaoOriginal: '2026-10-01', previsaoAtual: '2026-10-01', ultimoAvanco: '2026-11-01' }, '2026-11-05');
  assert.equal(o.diasAtraso, 35);
  assert.equal(o.situacao, 'atrasada');
});

test('pago à frente do feito: 15 p.p. ou mais vira alerta', () => {
  assert.deepEqual([...r.gastoAFrente.map((o) => o.id)].sort(), ['cmei-vn', 'galeria-xv', 'hm-uti']);
});

test('filtro por setor: só as obras do setor, e os chips continuam da cidade inteira', () => {
  const s = GC.obras.resumo('educacao');
  assert.deepEqual([...s.obras.map((o) => o.id)].sort(), ['cmei-vn', 'escola-lagoa']);
  assert.equal(s.atrasadas, 1);
  assert.equal(s.porSetor.reduce((n, x) => n + x.total, 0), D.obras.length);
});
