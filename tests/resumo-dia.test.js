const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-risco.js', 'contrato.js', 'store.js', 'crise.js', 'resumo-dia.js');
GC.agora = () => 5_000_000_000;
const store = GC.criarStore(GC.data);
const risco = GC.risco.resumo(store.ocorrencias());
const base = () => ({ atencao: store.atencao().todas, tendencias: GC.data.tendencias, risco, gabinetesAtivos: [] });

test('quatro destaques: alertas, chuva, o que mais melhorou e o que mais piorou', () => {
  const r = GC.resumoDoDia(base());
  assert.deepEqual([...r.destaques.map((d) => d.tipo)], ['alertas', 'chuva', 'melhorou', 'piorou']);
  assert.match(r.destaques[2].rotulo, /Criminalidade/); // -9%: a maior variação boa
  assert.match(r.destaques[3].rotulo, /Alagamentos/); // +25%: a maior variação ruim
  assert.match(r.destaques[1].rotulo, /48 mm/);
});

test('decisões: as duas primeiras de "precisam de você", na mesma ordem', () => {
  const r = GC.resumoDoDia(base());
  const todas = store.atencao().todas;
  assert.equal(r.totalDecisoes, todas.length);
  assert.deepEqual([...r.decisoes.map((d) => d.id)], [...todas.slice(0, 2).map((o) => o.id)]);
  assert.ok(r.decisoes.every((d) => d.acoes.length > 0));
});

test('filtro de secretaria vale para melhorou/piorou', () => {
  const r = GC.resumoDoDia(Object.assign(base(), { areas: ['saude'] }));
  assert.match(r.destaques.find((d) => d.tipo === 'melhorou').rotulo, /vacinal/);
  assert.match(r.destaques.find((d) => d.tipo === 'piorou').rotulo, /espera/);
  assert.equal(r.escopo, 'Saúde');
});

test('sem alertas, o destaque diz que está tudo encaminhado', () => {
  const r = GC.resumoDoDia(Object.assign(base(), { atencao: [] }));
  assert.equal(r.destaques[0].tom, 'ok');
  assert.equal(r.decisoes.length, 0);
});

test('gabinete: sugere o preventivo; com um aberto, mostra o ativo com o progresso', () => {
  assert.equal(GC.resumoDoDia(base()).gabinete.tipo, 'sugerido');
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(store.buscar('oc-01'));
  gab.avancarTarefa(g.id, 't1');
  gab.avancarTarefa(g.id, 't1');
  const r = GC.resumoDoDia(Object.assign(base(), { gabinetesAtivos: gab.ativos() }));
  assert.equal(r.gabinete.tipo, 'ativo');
  assert.equal(r.gabinete.id, g.id);
  assert.match(r.gabinete.detalhe, /^1\/4 tarefas/);
});

test('recorte por bairro: escopo com o nome do bairro e críticos contados entre os que precisam de você', () => {
  const o = store.atencao().todas[0];
  const doBairro = store.atencao([], [o.bairroId]).todas;
  const r = GC.resumoDoDia(Object.assign(base(), { atencao: doBairro, bairros: [o.bairroId] }));
  assert.equal(r.totalDecisoes, doBairro.length);
  assert.equal(r.escopo, GC.data.bairros.find((b) => b.id === o.bairroId).nome);
  assert.match(r.destaques[0].detalhe, /com gravidade crítica/);
});
