const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-secretarias.js', 'store.js');
GC.agora = () => 1_700_000_000_000;
const novo = () => GC.criarStore(GC.data);

test('todas inclui resolvidas', () => {
  const s = novo();
  s.avancar('oc-05');
  assert.ok(s.todas().some((o) => o.id === 'oc-05'));
  assert.equal(s.todas().length, 24);
});

test('regras: automáticas com origem e ativa', () => {
  const r = novo().regras();
  assert.equal(r.filter((x) => x.origem === 'automatica').length, Object.keys(GC.data.regras).length);
  assert.ok(r.every((x) => x.ativa && x.retidas === 0));
  const al = r.find((x) => x.id === 'alagamento');
  assert.equal(al.nome, 'Alagamento');
  assert.equal(al.area, 'defesa_civil');
});

test('pausar retém ocorrência nova do tipo; reativar libera', () => {
  const s = novo();
  const ev = [];
  s.assinar((e) => ev.push(e.tipo));
  const extra = GC.data.ocorrenciasExtras.find((o) => o.tipo === 'queda de energia');
  s.alternarRegra('queda de energia');
  assert.equal(s.adicionar(extra), false);
  assert.ok(!s.todas().some((o) => o.id === extra.id));
  const r = s.regras().find((x) => x.id === 'queda de energia');
  assert.equal(r.ativa, false);
  assert.equal(r.retidas, 1);
  s.alternarRegra('queda de energia');
  assert.ok(s.ocorrencias().some((o) => o.id === extra.id));
  assert.equal(s.regras().find((x) => x.id === 'queda de energia').retidas, 0);
  assert.deepEqual(ev, ['regra', 'regra', 'nova']);
});

test('adicionar de tipo ativo devolve true', () => {
  assert.equal(novo().adicionar(GC.data.ocorrenciasExtras[0]), true);
});

test('criarRegra não duplica e não muda alertas30d', () => {
  const s = novo();
  const antes = GC.alertas30d();
  const dados = { nome: 'Pergunta: Onde mais alaga este mês?', expressao: 'x', fontes: ['f'], area: 'defesa_civil' };
  const a = s.criarRegra(dados);
  const b = s.criarRegra(dados);
  assert.equal(a.criada, true);
  assert.equal(b.criada, false);
  assert.equal(a.id, b.id);
  const r = s.regras().find((x) => x.id === a.id);
  assert.equal(r.origem, 'copiloto');
  assert.equal(r.nova, true);
  assert.equal(r.disparos30d, 0);
  assert.equal(GC.alertas30d(), antes);
  assert.equal(s.alternarRegra(a.id), true);
  assert.equal(s.regras().find((x) => x.id === a.id).ativa, false);
});

// ---- Central de alertas: números do topo e coluna Prazo ----
const GT = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-secretarias.js', 'store.js', 'tela-alertas.js');
let relogio = 1_700_000_000_000;
GT.agora = () => relogio;

test('resumoAlertas conta só a lista recebida (perfil e recorte), sem resolvidas', () => {
  const s = GT.criarStore(GT.data);
  const todas = s.todas();
  const r = GT.resumoAlertas(todas);
  assert.equal(r.abertas, s.ocorrencias().length);
  assert.equal(r.estouradas, todas.filter(GT.estourada).length);
  assert.equal(r.emCampo, todas.filter((o) => o.status === 'em_campo').length);
  const saude = todas.filter((o) => o.area === 'saude');
  assert.equal(GT.resumoAlertas(saude).abertas, saude.length);
  assert.ok(saude.length < todas.length);
  s.avancar(todas[0].id);
  s.avancar(todas[0].id);
  assert.equal(GT.resumoAlertas(s.todas()).abertas, r.abertas - 1);
});

test('prazoAlerta: em campo diz se a equipe chegou a tempo; resolvida, se fechou no prazo', () => {
  relogio = 1_700_000_000_000;
  const s = GT.criarStore(GT.data);
  const o = s.todas().find((x) => x.status === 'encaminhada' && GT.prazoRestanteMin(x) > 0);
  assert.match(GT.prazoAlerta(o).texto, /^faltam /);
  s.avancar(o.id);
  assert.deepEqual({ ...GT.prazoAlerta(o) }, { texto: 'equipe chegou no prazo', tom: 'ok' });
  const atrasada = s.todas().find((x) => GT.estourada(x));
  assert.equal(GT.prazoAlerta(atrasada).tom, 'estourado');
  s.avancar(atrasada.id);
  assert.match(GT.prazoAlerta(atrasada).texto, /^equipe chegou .* após o prazo$/);
  s.avancar(atrasada.id);
  assert.equal(GT.prazoAlerta(atrasada).texto, 'resolvida fora do prazo');
});
