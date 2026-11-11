const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'store.js', 'contrato.js', 'mapa-logica.js', 'foco.js');

const AGORA = 1_700_000_000_000;
GC.agora = () => AGORA;

// Objetos criados dentro do vm têm outros protótipos: compara pelo valor.
const puro = (v) => JSON.parse(JSON.stringify(v));

// Ocorrência mínima: o que a legenda e o grupo de pinos leem.
const oc = (area, severidade, extra = {}) => Object.assign({ area, severidade, status: 'em_campo', criadaEm: AGORA, prazoMin: 120 }, extra);

test('resumoLegenda conta só o que aparece', () => {
  const r = GC.resumoLegenda([oc('saude', 'critica'), oc('saude', 'critica'), oc('defesa_civil', 'media')]);
  assert.deepEqual(puro(r.severidades), [{ chave: 'critica', n: 2 }, { chave: 'media', n: 1 }]);
  assert.equal(r.tipos[0].area, 'saude');
  assert.equal(r.tipos[0].n, 2);
  assert.equal(r.tipos[0].emoji, '🏥');
  assert.equal(r.tipos.length, 2);
  assert.equal(r.total, 3);
});

test('resumoLegenda empata pela ordem das áreas', () => {
  const r = GC.resumoLegenda([oc('saude', 'alta'), oc('infraestrutura', 'alta')]);
  assert.deepEqual(puro(r.tipos.map((t) => t.area)), ['infraestrutura', 'saude']);
});

test('resumoLegenda de lista vazia', () => {
  assert.deepEqual(puro(GC.resumoLegenda([])), { severidades: [], tipos: [], total: 0 });
});

test('htmlLegendaMapa mostra só o que está no mapa, sem linhas zeradas', () => {
  const html = GC.htmlLegendaMapa([oc('saude', 'critica'), oc('saude', 'critica'), oc('defesa_civil', 'media')]);
  assert.ok(html.includes('No mapa agora: 3 ocorrências'));
  assert.ok(html.includes('Crítica<small>2</small>'));
  assert.ok(!html.includes('Alta<small>'), 'gravidade sem pinos não aparece');
  assert.equal((html.match(/class="leg-emoji"/g) || []).length, 2, 'só as duas secretarias com pinos');
  assert.ok(!html.includes('leg-secao'), 'sem camadas ligadas, sem seções extras');
});

test('htmlLegendaMapa explica os pinos com mini-pinos do próprio mapa', () => {
  const html = GC.htmlLegendaMapa([oc('saude', 'alta')]);
  assert.ok(html.includes('class="marcador alta em_campo"'), 'equipe em campo');
  assert.ok(html.includes('class="marcador critica pulsar"'), 'prazo estourado');
  assert.ok(html.includes('class="grupo-pinos critica"') && html.includes('conic-gradient'), 'grupo com anel');
  assert.ok(!html.includes('contorno azul = '), 'o texto corrido saiu');
  assert.ok(!GC.htmlLegendaMapa([]).includes('leg-simbolos'), 'mapa vazio não explica pinos');
});

test('htmlLegendaMapa marca o que está filtrado', () => {
  const html = GC.htmlLegendaMapa([oc('saude', 'alta')], { severidades: ['alta'], areas: [] });
  assert.match(html, /leg-linha filtrado"><i class="bola alta"/);
});

test('htmlLegendaMapa vazia avisa e não desenha listas', () => {
  const html = GC.htmlLegendaMapa([]);
  assert.ok(html.includes('0 ocorrências') && html.includes('leg-vazio'));
  assert.ok(!html.includes('leg-lista'));
});

test('htmlLegendaMapa explica cada camada ligada, com as cores do mapa', () => {
  const ML = GC.mapaLogica;
  const html = GC.htmlLegendaMapa([oc('saude', 'alta')], {}, { risco: true, calorBO: true, conquistas: true, destaqueIA: true, calorIA: false });
  assert.ok(html.includes('Áreas de risco') && html.includes(ML.COR_RISCO.alto));
  assert.ok(html.includes('B.O.s (30 dias)') && html.includes('barra-calor'));
  assert.ok(html.includes('Conquistas'));
  assert.ok(html.includes('Bairro destacado pela IA') && html.includes(ML.COR_DESTAQUE));
  assert.ok(!html.includes('Calor da IA'));
});

test('contarFiltros soma secretarias e bairro', () => {
  assert.equal(GC.contarFiltros([], null), 0);
  assert.equal(GC.contarFiltros(['saude', 'educacao'], 'centro'), 3);
});

test('tituloAtencao mostra a cidade só quando o filtro esconde algo', () => {
  assert.equal(GC.tituloAtencao(8, 8, false), '(8)');
  assert.equal(GC.tituloAtencao(3, 8, true), '(3 · 8 na cidade)');
  assert.equal(GC.tituloAtencao(8, 8, true), '(8)');
  assert.equal(GC.tituloAtencao(0, 0, false), '(0)');
});

test('contarPiorando conta os pulsos negativos', () => {
  assert.equal(GC.contarPiorando([{ positivo: true }, { positivo: false }, { positivo: false }]), 2);
});

test('widgetsVisiveis respeita a escolha e ignora escolha inválida', () => {
  const pulsos = [{ area: 'infraestrutura' }, { area: 'saude' }, { area: 'educacao' }];
  assert.equal(GC.widgetsVisiveis(pulsos, null).length, 3);
  assert.deepEqual(puro(GC.widgetsVisiveis(pulsos, ['saude']).map((p) => p.area)), ['saude']);
  assert.deepEqual(puro(GC.widgetsVisiveis(pulsos, ['educacao', 'infraestrutura']).map((p) => p.area)), ['infraestrutura', 'educacao']);
  assert.equal(GC.widgetsVisiveis(pulsos, ['nao_existe']).length, 3);
  assert.equal(GC.widgetsVisiveis(pulsos, 'lixo').length, 3);
});

test('urgenciaGrupo pega a maior gravidade e pulsa com prazo estourado sem ação', () => {
  assert.deepEqual(puro(GC.urgenciaGrupo([oc('saude', 'alta'), oc('saude', 'media')])), { severidade: 'alta', pulsar: false });
  const estourada = oc('saude', 'media', { status: 'encaminhada', criadaEm: AGORA - 200 * 60000 });
  assert.deepEqual(puro(GC.urgenciaGrupo([oc('saude', 'media'), estourada])), { severidade: 'media', pulsar: true });
  assert.equal(GC.urgenciaGrupo([Object.assign({}, estourada, { acaoPrefeito: 'cobrar' })]).pulsar, false);
});
