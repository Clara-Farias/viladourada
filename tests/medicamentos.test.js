const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-medicamentos.js');
const r = GC.medicamentos.resumo();
const item = (id) => r.itens.find((x) => x.id === id);
const farmacia = (bairro) => r.farmacias.find((f) => f.bairroId === bairro);

test('uma farmácia por UBS, dentro do bairro, com os 10 itens da lista municipal', () => {
  assert.equal(r.farmacias.length, GC.data.series.lotacaoUbs.length);
  for (const f of r.farmacias) {
    assert.equal(f.itens.length, 10, f.id);
    assert.ok(typeof f.lat === 'number' && typeof f.lng === 'number', f.id);
  }
});

test('situação por dias de cobertura: falta, crítico (< 7), atenção (< 15), sobrando (> 60)', () => {
  const s = GC.medicamentos.situacao;
  assert.deepEqual([s(0), s(3), s(10), s(30), s(90)], ['ruptura', 'critico', 'atencao', 'ok', 'excesso']);
});

test('3 faltas hoje: Losartana no Centro, Amoxicilina na Vila Nova, Soro na Lagoa', () => {
  assert.equal(r.rupturas, 3);
  assert.deepEqual([...farmacia('centro').rupturas.map((x) => x.id)], ['losartana']);
  assert.deepEqual([...farmacia('vila_nova').rupturas.map((x) => x.id)], ['amoxicilina']);
  assert.deepEqual([...farmacia('lagoa_azul').rupturas.map((x) => x.id)], ['soro']);
  assert.equal(farmacia('bela_vista').situacao, 'ok');
});

test('previsão da IA: dengue acelera paracetamol e soro; insulina acaba antes do pedido chegar', () => {
  assert.ok(item('paracetamol').consumoPrevistoDia > item('paracetamol').consumoDia);
  assert.deepEqual([...r.vaoFaltar.map((x) => x.id)].sort(), ['insulina', 'paracetamol', 'soro']);
  assert.equal(item('insulina').faltaAntesDoPedido, true);
  assert.ok(item('insulina').dias < item('insulina').chegaEmDias);
  assert.ok(item('soro').compraSugerida > 0);
  assert.equal(item('losartana').faltaAntesDoPedido, false); // o pedido chega antes de acabar
});

test('remanejamento: sobra (> 60 dias) vai para quem está em falta, sem deixar a origem com menos de 30 dias', () => {
  assert.deepEqual([...r.remanejamentos.map((x) => `${x.id}:${x.de}>${x.para}`)].sort(),
    ['amoxicilina:UBS Serra>UBS Vila Nova', 'losartana:UBS Bela Vista>UBS Central']);
  for (const x of r.remanejamentos) {
    const origem = r.farmacias.find((f) => f.id === x.deId).itens.find((i) => i.id === x.id);
    assert.ok(origem.estoque - x.qtd >= Math.round(origem.consumoDia * 30) - 1, x.id);
  }
});
