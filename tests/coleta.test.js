const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-coleta.js');
const r = GC.coleta.resumo();
const rota = (id) => r.rotas.find((x) => x.id === id);
const bairro = (id) => r.calendario.find((b) => b.id === id);

test('rotas atendem bairros existentes e todo bairro tem coleta comum e seletiva', () => {
  const ids = new Set(GC.data.bairros.map((b) => b.id));
  for (const x of GC.data.coleta.rotas) for (const b of x.bairros) assert.ok(ids.has(b), `${x.id}: ${b}`);
  for (const c of r.calendario) {
    assert.ok(c.domiciliar.dias.length, `${c.id}: comum`);
    assert.ok(c.seletiva.dias.length, `${c.id}: seletiva`);
  }
});

test('hoje é quinta: 4 rotas, Porto atrasada, 2 caminhões na rua', () => {
  assert.equal(r.diaHoje, 'qui');
  assert.deepEqual([...r.deHoje.map((x) => x.id)].sort(), ['rota-bela-serra', 'rota-centro', 'rota-porto', 'seletiva-sul']);
  assert.deepEqual([...r.atrasadas.map((x) => x.id)], ['rota-porto']);
  assert.equal(r.emAndamento.length, 2);
  assert.equal(rota('rota-vila-nova').status, 'sem_coleta_hoje');
  assert.equal(r.rotas[0].id, 'rota-porto'); // atrasada primeiro
});

test('no prazo (ponderado pelas toneladas) bate com a série "Coleta no prazo" da Limpeza: 87%', () => {
  assert.equal(r.noPrazoPct, 87);
  const serie = GC.data.tendencias.find((t) => t.area === 'limpeza');
  assert.equal(serie.valor, '87%');
});

test('calendário: próxima coleta (hoje, amanhã ou dia da semana) e bairro atrasado marcado', () => {
  assert.equal(bairro('centro').domiciliar.proxima.texto, 'hoje');
  assert.equal(bairro('vila_nova').domiciliar.proxima.texto, 'amanhã');
  assert.equal(bairro('alto_da_serra').seletiva.proxima.texto, 'terça');
  assert.equal(bairro('porto_dourado').atrasada, true);
  assert.equal(bairro('centro').atrasada, false);
  assert.deepEqual([...bairro('centro').domiciliar.dias], ['seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

test('caminhão no trajeto: início, meio e fim; rota de um bairro vira uma volta fechada', () => {
  const pts = [[0, 0], [0, 10], [10, 10]];
  assert.deepEqual([...GC.coleta.pontoNoTrajeto(pts, 0)], [0, 0]);
  assert.deepEqual([...GC.coleta.pontoNoTrajeto(pts, 0.5)], [0, 10]);
  assert.deepEqual([...GC.coleta.pontoNoTrajeto(pts, 1)], [10, 10]);
  const volta = GC.coleta.trajeto(rota('rota-centro'));
  assert.equal(volta.length, 5);
  assert.deepEqual([...volta[0]], [...volta[4]]);
});
