const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-frota.js');
const F = GC.data.frota;
const r = GC.frota.resumo();

test('garagem, bases, linhas e agenda apontam para bairros e locais que existem', () => {
  const bairros = new Set(GC.data.bairros.map((b) => b.id));
  for (const x of [...F.garagens, ...F.bases]) assert.ok(bairros.has(x.bairroId), x.id);
  for (const l of F.linhas) for (const b of l.bairros) assert.ok(bairros.has(b), `${l.id}: ${b}`);
  const locais = new Set([...F.garagens, ...F.bases].map((x) => x.id));
  for (const m of F.agenda) assert.ok(locais.has(m.local), m.veiculo);
});

test('ônibus: 120 na frota, 96 de 104 rodando (92%), abaixo do contrato', () => {
  assert.equal(r.onibus.total, 120);
  assert.equal(r.onibus.operando, 96);
  assert.equal(r.onibus.disponibilidadePct, 92);
  assert.equal(r.onibus.viagensPct, 95);
  assert.equal(r.onibus.foraDoContrato, true);
  assert.equal(r.onibus.pontosAbaixo, 6);
  assert.equal(r.onibus.multaEstimadaMil, 72);
});

test('ambulâncias: soma das bases, 10 de 12 rodando e tempo de resposta ponderado pelos chamados', () => {
  assert.equal(r.ambulancias.total, 14);
  assert.equal(r.ambulancias.operando, 10);
  assert.equal(r.ambulancias.disponibilidadePct, 83);
  assert.equal(r.ambulancias.chamadosHoje, 63);
  assert.equal(r.ambulancias.tempoRespostaMin, 14);
});

test('agenda: vencidas primeiro, depois hoje e próximas', () => {
  assert.deepEqual([...r.agenda.map((x) => x.situacao)].slice(0, 5), ['vencida', 'vencida', 'vencida', 'hoje', 'hoje']);
  assert.equal(r.vencidas.length, 3);
  assert.equal(r.agenda[0].veiculo, 'Ônibus 1042');
});

test('linhas: 102 crítica (espera 2,25× o intervalo), 103 atenção, Circular normal', () => {
  const por = (id) => r.linhas.find((x) => x.id === id);
  assert.equal(por('102').situacao, 'critica');
  assert.equal(por('102').razao, 2.3);
  assert.equal(por('103').situacao, 'atencao');
  assert.equal(por('106').situacao, 'ok');
  assert.equal(r.linhas[0].id, '102');
  assert.equal(GC.frota.avaliarLinha({ intervaloMin: 10, esperaMin: 11, viagensPct: 87 }).situacao, 'critica');
});
