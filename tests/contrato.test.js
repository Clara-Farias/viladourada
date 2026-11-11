const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'contrato.js');

const FONTES = ['saude.atendimentos_ubs', 'planejamento.bairros'];
const CONF = { nivel: 'alta', motivo: '2 fontes · atualizadas há 3 min' };
const CONSULTA = 'SELECT bairro, AVG(espera_min) FROM saude.atendimentos_ubs GROUP BY bairro';

test('fontes, confiabilidade e consulta válidas passam', () => {
  const r = GC.sanearResposta({ texto: 'ok', fontes: FONTES, confiabilidade: CONF, consulta: CONSULTA });
  assert.deepEqual([...r.fontes], FONTES);
  assert.equal(r.confiabilidade.nivel, 'alta');
  assert.equal(r.confiabilidade.motivo, CONF.motivo);
  assert.equal(r.consulta, CONSULTA);
});

test('cada campo inválido é descartado sem derrubar o texto', () => {
  const r = GC.sanearResposta({ texto: 'ok', fontes: 'x', confiabilidade: { nivel: 'altíssima' }, consulta: '' });
  assert.deepEqual(Object.keys(r), ['texto']);
  assert.deepEqual(Object.keys(GC.sanearResposta({ texto: 'ok', fontes: [], consulta: 'x'.repeat(2001) })), ['texto']);
  assert.deepEqual(Object.keys(GC.sanearResposta({ texto: 'ok', fontes: ['ok', 42] })), ['texto']);
});

test('fontes com HTML são mantidas como texto (escape é na renderização)', () => {
  const fonte = '<img src=x onerror=alert(1)>';
  assert.deepEqual([...GC.sanearResposta({ texto: 'ok', fontes: [fonte] }).fontes], [fonte]);
});

test('mostrarMapa sem mapa válido é descartada', () => {
  const ruim = GC.sanearResposta({ texto: 'ok', mapa: { tipo: 'desconhecido' }, acoes: [{ rotulo: 'Ver', tipo: 'mostrarMapa' }] });
  assert.equal(ruim.mapa, undefined);
  assert.equal(ruim.acoes, undefined);
  const bom = GC.sanearResposta({ texto: 'ok', mapa: { tipo: 'destaque', bairros: ['centro'] }, acoes: [{ rotulo: 'Ver', tipo: 'mostrarMapa' }] });
  assert.equal(bom.acoes[0].payload.mapa.tipo, 'destaque');
});

test('validarResposta aponta erro de nível de confiabilidade', () => {
  assert.ok(GC.validarResposta({ texto: 'ok', confiabilidade: { nivel: 'altíssima' } }).length > 0);
});

test('agir válido passa; acao desconhecida ou sem id é descartada', () => {
  const r = GC.sanearResposta({ texto: 'x', acoes: [
    { rotulo: 'a', tipo: 'agir', payload: { ocorrenciaId: 'oc-1', acao: 'cobrar' } },
    { rotulo: 'b', tipo: 'agir', payload: { ocorrenciaId: 'oc-1', acao: 'acionar' } },
    { rotulo: 'c', tipo: 'agir', payload: { acao: 'priorizar' } },
    { rotulo: 'd', tipo: 'acionarSecretaria', payload: { ocorrenciaId: 'oc-1' } },
  ] });
  assert.deepEqual([...r.acoes.map((a) => a.rotulo)], ['a']);
});

test('criarAlerta válido passa; sem fontes ou com área inválida descarta', () => {
  const ok = { rotulo: 'a', tipo: 'criarAlerta', payload: { nome: 'n', expressao: 'e', fontes: ['f'], area: 'saude' } };
  const r = GC.sanearResposta({ texto: 'x', acoes: [
    ok,
    { ...ok, rotulo: 'b', payload: { nome: 'n', expressao: 'e', fontes: [], area: 'saude' } },
    { ...ok, rotulo: 'c', payload: { nome: 'n', expressao: 'e', fontes: ['f'], area: 'xyz' } },
    { ...ok, rotulo: 'd', payload: { expressao: 'e', fontes: ['f'], area: 'saude' } },
  ] });
  assert.deepEqual([...r.acoes.map((a) => a.rotulo)], ['a']);
});
