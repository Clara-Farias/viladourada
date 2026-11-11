const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-secretarias.js', 'store.js', 'relatorios.js', 'dados.js');
GC.agora = () => 1_700_000_000_000;
const novo = () => GC.criarStore(GC.data);

test('11 tabelas, colunas e linhas do mesmo tamanho', () => {
  const t = GC.tabelasDados(novo());
  assert.equal(t.length, 11);
  assert.deepEqual([...t.map((x) => x.id)], ['gestao.ocorrencias', 'monitoramento.regras', 'monitoramento.alertas_mensais', 'historico.casos_30d', 'gestao.desempenho_30d', 'gabinete.orcamento_2026', 'planejamento.metas_governo', 'secretarias.series_12m', 'unidades', 'planejamento.bairros', 'ouvidoria.satisfacao_bairro']);
  t.forEach((x) => {
    assert.ok(x.nome && x.descricao, x.id);
    assert.ok(x.colunas.every((c) => c.nome && c.descricao), x.id);
    assert.ok(x.linhas.length > 0, x.id);
    assert.ok(x.linhas.every((l) => l.length === x.colunas.length), x.id);
  });
});

test('coerência: ocorrências = store, alertas mensais = alertasPorMes, casos e séries completos', () => {
  const s = novo();
  const t = Object.fromEntries(GC.tabelasDados(s).map((x) => [x.id, x]));
  assert.equal(t['gestao.ocorrencias'].linhas.length, s.todas().length);
  assert.deepEqual([...t['monitoramento.alertas_mensais'].linhas.map((l) => Number(l[1]))], [...GC.alertasPorMes()]);
  assert.equal(t['historico.casos_30d'].linhas.length, 7 * 8);
  assert.equal(t['secretarias.series_12m'].linhas.length, 7 * 12);
  assert.equal(t['monitoramento.regras'].linhas.length, s.regras().length);
});

test('ao vivo: status muda na tabela de ocorrências; regra nova aparece', () => {
  const s = novo();
  s.avancar('oc-05');
  const l = GC.tabelasDados(s)[0].linhas.find((x) => x[0] === 'oc-05');
  assert.ok(l.includes('resolvida'));
  s.criarRegra({ nome: 'Pergunta: x', expressao: 'e', fontes: ['f'], area: 'saude' });
  assert.ok(GC.tabelasDados(s)[1].linhas.some((x) => x.includes(GC.agente())));
});

test('resumo, CSV, JSON e dicionário', () => {
  const s = novo();
  const r = GC.resumoDados(s);
  assert.equal(r.tabelas, 11);
  assert.equal(r.registros, GC.tabelasDados(s).reduce((n, x) => n + x.linhas.length, 0));
  assert.equal(r.periodo, '12 meses');
  assert.equal(r.atualizadoHaMin, Math.min(...Object.values(GC.data.basesSecretarias).map((b) => b.atualizadoHaMin)));
  const csv = GC.csvTabela(GC.tabelasDados(s)[1]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.split('\r\n')[0].includes(';'));
  assert.equal(Object.keys(JSON.parse(GC.baseJson(s)).tabelas).length, 11);
  assert.match(GC.dicionarioMd(s), /## gestao\.ocorrencias/);
});
