const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-secretarias.js', 'store.js');
const AREAS = ['infraestrutura', 'defesa_civil', 'saude', 'educacao', 'seguranca', 'mobilidade', 'limpeza'];

test('toda secretaria tem os dados de evolução completos', () => {
  for (const a of AREAS) {
    const s = GC.data.secretarias[a];
    assert.equal(s.serie.meses.length, 12, a);
    assert.equal(s.serie.projecao.length, 2, a);
    assert.equal(s.metas.length, 3, a);
    assert.equal(s.indicadores.length, 3, a);
    assert.ok(s.unidades.length >= 3 && s.unidades.length <= 6, a);
    assert.ok(s.metas.every((m) => ['concluida', 'em_dia', 'atencao', 'critico'].includes(m.status)), a);
    assert.ok(s.unidades.every((u) => GC.data.bairros.some((b) => b.id === u.bairroId)), a);
    assert.ok(s.unidades.every((u) => u.metricas.length === 2 && ['ok', 'atencao', 'critica'].includes(u.situacao)), a);
  }
  assert.equal(GC.data.mesesSerie.length, 12);
});

test('variação da série bate com tendencias (tolerância 1)', () => {
  for (const a of AREAS) {
    const s = GC.data.secretarias[a];
    const t = GC.data.tendencias.find((x) => x.area === a && x.rotulo === s.tendencia);
    assert.ok(t, a);
    const v = GC.variacaoSerie(s.serie, t.rotulo);
    assert.ok(Math.abs(v - t.variacao) <= 1, `${a}: ${v} vs ${t.variacao}`);
  }
});

test('Segurança estende criminalidadeMensal e a tendência é −9%', () => {
  assert.deepEqual([...GC.data.secretarias.seguranca.serie.meses.slice(6)], [...GC.data.series.criminalidadeMensal.valores]);
  const t = GC.data.tendencias.find((x) => x.area === 'seguranca');
  assert.equal(t.variacao, -9);
  assert.equal(t.valor, '-9%');
});

test('Saúde: unidades vêm das UBS de series.lotacaoUbs', () => {
  const nomes = GC.data.secretarias.saude.unidades.map((u) => u.nome);
  assert.deepEqual([...nomes].sort(), [...GC.data.series.lotacaoUbs.map((u) => u.nome)].sort());
});

// ---- Task 2: store monta página, pulsos e status ----
const INICIO = 1_700_000_000_000;
GC.agora = () => INICIO;
const novo = () => GC.criarStore(GC.data);

test('pulsos: 7, nível = último mês da série, variação = tendencias', () => {
  const p = novo().pulsos();
  assert.equal(p.length, 7);
  const saude = p.find((x) => x.area === 'saude');
  assert.equal(saude.nivel, `${GC.data.secretarias.saude.serie.meses[11]} min`);
  assert.equal(saude.variacao, '+9%');
  assert.equal(saude.periodo, 'no mês');
  assert.equal(saude.positivo, false);
  assert.equal(p.find((x) => x.area === 'seguranca').periodo, 'no trimestre');
  assert.equal(p.find((x) => x.area === 'educacao').nivel, '95%');
  assert.equal(p.find((x) => x.area === 'seguranca').nivel, '363');
});

test('status: Saúde e Limpeza críticas (prazo estourado agora); Infraestrutura crítica por 62%', () => {
  const s = novo();
  assert.equal(s.statusSecretaria('saude'), 'critico');
  assert.equal(s.statusSecretaria('limpeza'), 'critico');
  assert.equal(s.statusSecretaria('infraestrutura'), 'critico');
  assert.equal(s.statusSecretaria('mobilidade'), 'atencao'); // meta crítica
});

test('status cai de crítico quando o estouro é resolvido', () => {
  const s = novo();
  s.agir('oc-13', 'cobrar'); s.avancar('oc-13');
  assert.notEqual(s.statusSecretaria('saude'), 'critico');
});

test('paginaSecretaria monta tudo e respeita a área', () => {
  const p = novo().paginaSecretaria('saude');
  assert.equal(p.indicadores.length, 4);
  assert.equal(p.indicadores[3].rotulo, '% no prazo (30 dias)');
  assert.ok(p.alertas.every((o) => o.area === 'saude'));
  assert.equal(p.alertas[0].id, 'oc-13');
  assert.equal(p.meses.length, 12);
  assert.equal(p.status, 'critico');
  assert.ok(p.base.fonte.includes('Secretaria de Saúde'));
  assert.equal(novo().paginaSecretaria('xyz'), null);
});

test('pulsos em %: variação em pontos percentuais com sinal', () => {
  const p = novo().pulsos();
  assert.equal(p.find((x) => x.area === 'educacao').variacao, '+2 p.p.');
  assert.equal(p.find((x) => x.area === 'limpeza').variacao, '-5 p.p.');
  assert.equal(p.find((x) => x.area === 'seguranca').variacao, '-9%');
});

// ---- visão geral: chips, bairro e correções da revisão ----
test('pulsos com bairro: indicador do bairro contra a referência', () => {
  const p = novo().pulsos('vila_nova');
  assert.equal(p.length, 7);
  assert.ok(p.every((x) => x.escopo === 'bairro' && x.periodo === ''));
  const infra = p.find((x) => x.area === 'infraestrutura');
  assert.equal(infra.nivel, String(GC.data.historico30d.infraestrutura.vila_nova));
  assert.match(infra.variacao, /^média \d+$/);
  assert.match(p.find((x) => x.area === 'educacao').variacao, /^cidade \d+%$/);
  // Sem bairro, continua igual ao de antes.
  assert.equal(novo().pulsos(null).find((x) => x.area === 'saude').periodo, 'no mês');
});

test('desempenho por bairro: variação do % no prazo usa a mesma base da cidade', () => {
  const s = novo();
  assert.equal(s.desempenho('vila_nova').resumo.noPrazoPctAnt, s.desempenho(null).resumo.noPrazoPctAnt);
  assert.equal(s.desempenho('vila_nova').resumo.tempoMedioHAnt, s.desempenho(null).resumo.tempoMedioHAnt);
});

test('desempenho: abertas por secretaria e ações das frases', () => {
  const s = novo();
  const d = s.desempenho(null);
  for (const x of d.secretarias) assert.equal(x.abertas, s.ocorrencias(x.area).length, x.area);
  assert.equal(d.ruimAcoes.length, d.ruim.length);
  assert.deepEqual({ ...d.ruimAcoes[0] }, { area: 'infraestrutura' });
  assert.ok(d.ruimAcoes[1].bairro);
});

test('bairrosDaSecretaria: mais casos primeiro, no máximo 5', () => {
  const b = novo().bairrosDaSecretaria('infraestrutura');
  assert.ok(b.length > 0 && b.length <= 5);
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].casos >= b[i].casos);
  assert.equal(b[0].casos, Math.max(...Object.values(GC.data.historico30d.infraestrutura)));
});
