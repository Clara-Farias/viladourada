const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const carregarTudo = () => carregar('data.js', 'data-alertas.js', 'store.js', 'contrato.js', 'visualizacoes.js', 'ia-roteiro.js', 'widgets-ia.js');
const memoria = (inicial = null) => { let v = inicial; return { ler: () => v, gravar: (o) => { v = JSON.parse(JSON.stringify(o)); }, valor: () => v }; };
const ctx = (GC) => ({ area: null, ocorrencias: GC.criarStore(GC.data).ocorrencias() });

test('gráfico do Copiloto vira widget no catálogo e é guardado', () => {
  const GC = carregarTudo();
  const arm = memoria();
  const w = GC.criarWidgetsIA(arm);
  const r = GC.ia.perguntar('Onde mais alaga este mês?', ctx(GC));
  const c = w.criar({ pergunta: 'Onde mais alaga este mês?', grafico: r.grafico, cenario: r.cenario }, 1000);
  assert.equal(c.criado, true);
  assert.ok(GC.ehWidgetIA(c.widget.id));
  const noCatalogo = GC.WIDGETS.find((x) => x.id === c.widget.id);
  assert.ok(noCatalogo && noCatalogo.ia, 'entra no catálogo da gaveta Widgets');
  assert.match(noCatalogo.descricao, /Onde mais alaga/);
  assert.equal(arm.valor().length, 1);
  // A visualização aceita o id novo (o catálogo é lido na hora).
  assert.deepEqual([...GC.normalizarEstado({ widgets: { ativos: [c.widget.id, 'leitos'] } }).widgets.ativos], [c.widget.id, 'leitos']);
});

test('mesma pergunta não duplica; sem gráfico não cria', () => {
  const GC = carregarTudo();
  const w = GC.criarWidgetsIA(memoria());
  const r = GC.ia.perguntar('Como evoluiu a criminalidade?', ctx(GC));
  const a = w.criar({ pergunta: 'Como evoluiu a criminalidade?', grafico: r.grafico }, 1);
  const b = w.criar({ pergunta: 'como evoluiu a CRIMINALIDADE? ', grafico: r.grafico }, 2);
  assert.equal(b.criado, false);
  assert.equal(b.widget.id, a.widget.id);
  assert.equal(w.criar({ pergunta: 'Bom dia', grafico: undefined }).criado, false);
  assert.equal(w.lista().length, 1);
});

test('excluir tira do catálogo e do armazenamento; dados inválidos guardados são ignorados', () => {
  const GC = carregarTudo();
  const arm = memoria([{ id: 'ia-x', nome: 'ok', pergunta: 'p', grafico: { tipo: 'barra', titulo: 't', rotulos: ['a'], series: [{ nome: 's', valores: [1] }] } }, { id: 'leitos', grafico: {} }, 'lixo']);
  const w = GC.criarWidgetsIA(arm);
  assert.deepEqual(w.lista().map((x) => x.id), ['ia-x']);
  assert.ok(GC.WIDGETS.some((x) => x.id === 'ia-x'));
  assert.equal(w.remover('ia-x'), true);
  assert.ok(!GC.WIDGETS.some((x) => x.id === 'ia-x'));
  assert.deepEqual(arm.valor(), []);
});

test('lembra se está ligado: desligar na gaveta vale para a próxima abertura', () => {
  const GC = carregarTudo();
  const arm = memoria();
  const w = GC.criarWidgetsIA(arm);
  const g = { tipo: 'barra', titulo: 't', rotulos: ['a'], series: [{ nome: 's', valores: [1] }] };
  const a = w.criar({ pergunta: 'a', grafico: g }, 1).widget;
  const b = w.criar({ pergunta: 'b', grafico: g }, 2).widget;
  assert.deepEqual([...w.ligados()], [a.id, b.id], 'novo entra ligado');
  w.marcarLigados(['leitos', b.id]);
  assert.deepEqual([...GC.criarWidgetsIA(arm).ligados()], [b.id], 'desligado continua desligado ao recarregar');
});

test('desenho do widget: barras, linha, dados de agora × cópia e HTML escapado', () => {
  const GC = carregarTudo();
  GC.escaparHtml = GC.escaparHtml || ((t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]));
  const w = GC.criarWidgetsIA(memoria());
  const barra = w.criar({ pergunta: '<b>x</b>', grafico: { tipo: 'barra', titulo: 'Leitos', rotulos: ['A', 'B'], series: [{ nome: 'Geral', valores: [80, 95] }], unidade: '%' } }, 5).widget;
  const html = GC.htmlWidgetIA(barra, null);
  assert.match(html, /95%/);
  assert.match(html, /cópia de/);
  assert.ok(!html.includes('<b>x</b>'), 'pergunta escapada');
  const atual = GC.htmlWidgetIA(barra, { tipo: 'barra', titulo: 'Leitos', rotulos: ['A', 'B'], series: [{ nome: 'Geral', valores: [70, 99] }], unidade: '%' });
  assert.match(atual, /dados de agora/);
  assert.match(atual, /99%/);
  const linha = w.criar({ pergunta: 'serie', grafico: { tipo: 'linha', titulo: 'Série', rotulos: ['mai', 'jun', 'jul'], series: [{ nome: 'Casos', valores: [10, 12, 9] }], unidade: 'casos' } }, 6).widget;
  assert.match(GC.htmlWidgetIA(linha, null), /<polyline/);
});

test('todo tema com gráfico do roteiro pode virar widget', () => {
  const GC = carregarTudo();
  const w = GC.criarWidgetsIA(memoria());
  for (const p of GC.ia.sugestoes) {
    const r = GC.ia.perguntar(p, ctx(GC));
    if (!r.grafico) continue;
    const c = w.criar({ pergunta: p, grafico: r.grafico, cenario: r.cenario });
    assert.ok(c.widget, p);
    assert.ok(GC.htmlWidgetIA(c.widget, r.grafico).length > 100, p);
  }
});
