const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-educacao.js');
const D = GC.data.educacao;
const r = GC.educacao.resumo();
const por = (id) => r.escolas.find((x) => x.id === id);

test('escolas em bairros existentes, com professores e alunos coerentes', () => {
  const bairros = new Set(GC.data.bairros.map((b) => b.id));
  for (const x of D.escolas) {
    assert.ok(bairros.has(x.bairroId), x.id);
    assert.ok(x.professores > 0 && x.professores <= x.necessarios, `${x.id}: professores`);
    assert.ok(x.frequenciaPct > 0 && x.frequenciaPct <= 100, `${x.id}: frequência`);
  }
  for (const b of GC.data.bairros) {
    assert.equal(typeof D.populacao.alfabetizados15[b.id], 'number', b.id);
    assert.equal(typeof D.populacao.ensinoMedio25[b.id], 'number', b.id);
  }
});

test('frequência das escolas bate com a frequência escolar por bairro', () => {
  for (const x of D.escolas.filter((e) => e.tipo === 'emef')) assert.equal(x.frequenciaPct, GC.data.series.frequenciaEscolar[x.bairroId], x.id);
});

test('rede: 15 professores faltando = 300 aulas perdidas por semana', () => {
  assert.equal(r.faltando, 15);
  assert.equal(r.aulasPerdidasSemana, 300);
  assert.equal(r.escolasSemProfessor, 6);
});

test('situação: Lagoa Azul crítica (professores, evasão e frequência), CMEI crítico pela fila, Centro em dia', () => {
  assert.equal(por('emef-lagoa').situacao, 'critica');
  assert.deepEqual([...por('emef-lagoa').motivos.map((m) => m.tipo)], ['professor', 'evasao', 'frequencia', 'lotacao']);
  assert.equal(por('cmei-vila-nova').situacao, 'critica');
  assert.equal(por('cmei-vila-nova').evasaoPct, null);
  assert.equal(por('emef-serra').situacao, 'atencao');
  assert.equal(por('emef-centro').situacao, 'ok');
  assert.equal(r.escolas[0].id, 'emef-lagoa'); // crítica com mais professores faltando primeiro
});

test('médias ponderadas: evasão e alfabetização só do fundamental; escolaridade pela população', () => {
  assert.ok(r.evasaoPct > 2 && r.evasaoPct < 5, `evasão ${r.evasaoPct}`);
  assert.ok(r.alfabetizacao3anoPct > 64 && r.alfabetizacao3anoPct < 88);
  assert.ok(r.cidade.alfabetizados15 > 91 && r.cidade.alfabetizados15 < 98);
  assert.deepEqual([...r.piorEscolaridade.map((b) => b.id)], ['lagoa_azul', 'alto_da_serra', 'vila_nova']);
  assert.deepEqual([...r.evasaoAlta.map((x) => x.id)], ['emef-lagoa', 'emef-serra']);
});
