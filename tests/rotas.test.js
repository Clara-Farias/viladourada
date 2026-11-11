const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'rotas.js');

test('lerRota reconhece as telas e cai no Painel no resto', () => {
  assert.deepEqual({ ...GC.lerRota('') }, { tela: 'painel' });
  assert.deepEqual({ ...GC.lerRota('#/painel') }, { tela: 'painel' });
  assert.deepEqual({ ...GC.lerRota('#/secretarias') }, { tela: 'secretarias' });
  assert.deepEqual({ ...GC.lerRota('#/secretaria/saude') }, { tela: 'secretaria', area: 'saude' });
  assert.deepEqual({ ...GC.lerRota('#/secretaria/xyz') }, { tela: 'painel' });
  assert.deepEqual({ ...GC.lerRota('#/qualquer') }, { tela: 'painel' });
  assert.deepEqual({ ...GC.lerRota(undefined) }, { tela: 'painel' });
});

test('hashDe é o inverso de lerRota', () => {
  for (const h of ['#/painel', '#/secretarias', '#/secretaria/limpeza']) assert.equal(GC.hashDe(GC.lerRota(h)), h);
});

test('rota de relatórios: válida e inválida', () => {
  assert.deepEqual({ ...GC.lerRota('#/relatorios/secretaria/saude/90') }, { tela: 'relatorios', tipo: 'secretaria', alvo: 'saude', periodo: '90' });
  assert.deepEqual({ ...GC.lerRota('#/relatorios') }, { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' });
  assert.deepEqual({ ...GC.lerRota('#/relatorios/bairro/xyz/45') }, { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' });
  assert.deepEqual({ ...GC.lerRota('#/relatorios/executivo/-/7') }, { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '7' });
  assert.equal(GC.hashDe(GC.lerRota('#/relatorios/bairro/centro/30')), '#/relatorios/bairro/centro/30');
  // Período que não muda o relatório vira 30 dias (bairro só tem 30 dias; secretaria é mensal).
  assert.equal(GC.lerRota('#/relatorios/bairro/centro/12m').periodo, '30');
  assert.equal(GC.lerRota('#/relatorios/secretaria/saude/7').periodo, '30');
  assert.equal(GC.lerRota('#/relatorios/secretaria/saude/12m').periodo, '12m');
});

test('rotas de alertas e dados', () => {
  assert.deepEqual({ ...GC.lerRota('#/alertas') }, { tela: 'alertas' });
  assert.equal(GC.hashDe({ tela: 'alertas' }), '#/alertas');
  assert.deepEqual({ ...GC.lerRota('#/dados') }, { tela: 'dados', tabela: null });
  assert.deepEqual({ ...GC.lerRota('#/dados/gestao.ocorrencias') }, { tela: 'dados', tabela: 'gestao.ocorrencias' });
  assert.equal(GC.hashDe({ tela: 'dados', tabela: 'unidades' }), '#/dados/unidades');
  assert.equal(GC.hashDe({ tela: 'dados', tabela: null }), '#/dados');
});

test('rota do gabinete de crise vai e volta, com ou sem id', () => {
  assert.deepEqual({ ...GC.lerRota('#/crise') }, { tela: 'crise', id: null });
  assert.deepEqual({ ...GC.lerRota('#/crise/g-oc-01-1') }, { tela: 'crise', id: 'g-oc-01-1' });
  assert.equal(GC.hashDe({ tela: 'crise', id: null }), '#/crise');
  assert.equal(GC.hashDe({ tela: 'crise', id: 'g-oc-01-1' }), '#/crise/g-oc-01-1');
});

test('rota de indicadores: sem alvo, com secretaria ou com código', () => {
  assert.deepEqual({ ...GC.lerRota('#/indicadores') }, { tela: 'indicadores', alvo: null });
  assert.deepEqual({ ...GC.lerRota('#/indicadores/saude') }, { tela: 'indicadores', alvo: 'saude' });
  assert.equal(GC.hashDe({ tela: 'indicadores', alvo: 'SAU01' }), '#/indicadores/SAU01');
  assert.equal(GC.hashDe({ tela: 'indicadores', alvo: null }), '#/indicadores');
});

test('rota "Para você" do cidadão', () => {
  assert.deepEqual({ ...GC.lerRota('#/cidadao') }, { tela: 'cidadao' });
  assert.equal(GC.hashDe({ tela: 'cidadao' }), '#/cidadao');
});

test('relatórios: intervalo de meses na rota (menos no bairro)', () => {
  assert.equal(GC.lerRota('#/relatorios/executivo/-/m3-8').periodo, 'm3-8');
  assert.equal(GC.lerRota('#/relatorios/secretaria/saude/m0-11').periodo, 'm0-11');
  assert.equal(GC.lerRota('#/relatorios/bairro/centro/m3-8').periodo, '30');
  assert.equal(GC.lerRota('#/relatorios/executivo/-/m8-3').tipo, 'executivo');
  assert.equal(GC.lerRota('#/relatorios/executivo/-/m8-3').periodo, '30');
  assert.equal(GC.lerRota('#/relatorios/alertas/-/m2-14').periodo, '30');
  assert.equal(GC.hashDe(GC.lerRota('#/relatorios/alertas/-/m2-5')), '#/relatorios/alertas/-/m2-5');
});
