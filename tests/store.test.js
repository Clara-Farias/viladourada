const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'store.js');

// Relógio controlável: cada store novo começa no mesmo instante.
const INICIO = 1_700_000_000_000;
let agora = INICIO;
GC.agora = () => agora;

function novo() {
  agora = INICIO;
  const store = GC.criarStore(GC.data);
  const eventos = [];
  store.assinar((e) => eventos.push(e));
  return { store, eventos };
}

const ids = (lista) => [...lista].map((o) => o.id);

// ---- ciclo: encaminhada → em_campo → resolvida ----
test('nasce encaminhada com responsável, prazo e linha do tempo', () => {
  const o = novo().store.buscar('oc-01');
  assert.equal(o.status, 'encaminhada');
  assert.equal(o.responsavel, GC.data.responsaveis.defesa_civil[0]);
  assert.equal(o.prazoMin, 120);
  assert.equal(o.linhaTempo[0].texto, 'Regra disparou automaticamente');
  assert.equal(o.linhaTempo[0].t, INICIO - 42 * 60000);
  assert.match(o.linhaTempo[1].texto, /^Encaminhada à Defesa Civil · responsável: /);
});

test('as que já começam em campo têm o passo na linha do tempo', () => {
  const o = novo().store.buscar('oc-05');
  assert.equal(o.status, 'em_campo');
  assert.equal(o.linhaTempo.at(-1).texto, '🚧 Equipe em campo');
});

test('avancar percorre encaminhada→em_campo→resolvida e depois retorna false', () => {
  const { store, eventos } = novo();
  assert.equal(store.avancar('oc-01'), true);
  assert.equal(store.buscar('oc-01').status, 'em_campo');
  assert.equal(store.avancar('oc-01'), true);
  assert.equal(store.buscar('oc-01').status, 'resolvida');
  assert.equal(store.avancar('oc-01'), false);
  assert.equal(store.avancar('oc-999'), false);
  assert.equal(eventos.map((e) => e.tipo).join(','), 'status,status');
  assert.equal(store.buscar('oc-01').linhaTempo.at(-1).texto, '✅ Resolvida');
});

test('resolvida some de ocorrencias()', () => {
  const { store } = novo();
  const antes = store.ocorrencias().length;
  store.avancar('oc-05');
  assert.equal(store.ocorrencias().length, antes - 1);
  assert.ok(!store.ocorrencias().some((o) => o.id === 'oc-05'));
});

// ---- prazo ----
test('estourada só quando encaminhada e passou do prazo', () => {
  const { store } = novo();
  assert.equal(GC.estourada(store.buscar('oc-13')), true);
  assert.equal(GC.estourada(store.buscar('oc-22')), true);
  assert.equal(GC.estourada(store.buscar('oc-06')), false);
  agora += 41 * 60000;
  assert.equal(GC.estourada(store.buscar('oc-06')), true);
  assert.equal(GC.estourada(store.buscar('oc-05')), false);
});

test('prazoRestanteMin é negativo quando estourado', () => {
  const { store } = novo();
  assert.equal(Math.round(GC.prazoRestanteMin(store.buscar('oc-13'))), -120);
  assert.equal(Math.round(GC.prazoRestanteMin(store.buscar('oc-06'))), 40);
});

// ---- motivos de atenção e bloco ----
test('motivosAtencao: prazo, conjunta e recorrente', () => {
  const { store } = novo();
  assert.deepEqual([...GC.motivosAtencao(store.buscar('oc-13'))].map((m) => m.tipo), ['prazo']);
  assert.deepEqual([...GC.motivosAtencao(store.buscar('oc-06'))].map((m) => m.tipo), ['conjunta', 'recorrente']);
  assert.equal(GC.motivosAtencao(store.buscar('oc-17'))[0].texto, '🔁 8º chamado de Segurança no bairro em 30 dias');
  assert.equal(GC.motivosAtencao(store.buscar('oc-01'))[0].texto, '🤝 Envolve 2 secretarias');
  assert.equal(GC.motivosAtencao(store.buscar('oc-13'))[0].texto, '⏰ Prazo estourado há 2 h');
  assert.equal(GC.motivosAtencao(store.buscar('oc-10')).length, 0);
});

test('atencao abre com 3 cartões e os três motivos', () => {
  const { todas, cartoes } = novo().store.atencao([], null);
  assert.equal(cartoes.length, 3);
  // Gravidade antes do atraso: a UTI crítica (2 h de atraso) vem antes do lixo alta (2 dias).
  assert.deepEqual(ids(cartoes).slice(0, 2), ['oc-13', 'oc-06']);
  assert.ok(ids(todas).indexOf('oc-13') < ids(todas).indexOf('oc-22'));
  const tipos = new Set(todas.map((o) => GC.motivosAtencao(o)[0].tipo));
  assert.deepEqual([...tipos].sort(), ['conjunta', 'prazo', 'recorrente']);
  assert.deepEqual(ids(todas).sort(), ['oc-01', 'oc-06', 'oc-07', 'oc-13', 'oc-17', 'oc-19', 'oc-20', 'oc-22']);
});

test('atencao: o que o prefeito já tratou desce para o fim, com a hora da ação', () => {
  const { store } = novo();
  assert.equal(store.atencao([], null).todas[0].id, 'oc-13');
  assert.equal(store.agir('oc-13', 'cobrar'), true);
  const todas = store.atencao([], null).todas;
  assert.equal(todas[todas.length - 1].id, 'oc-13');
  assert.equal(store.buscar('oc-13').acaoEm, GC.agora());
});

test('motivos têm rótulo curto visível', () => {
  const { store } = novo();
  assert.deepEqual([...GC.motivosAtencao(store.buscar('oc-06'))].map((m) => m.curto), ['🤝 2 secretarias', '🔁 bairro recorrente']);
});

test('atencao respeita filtros de secretaria e bairro', () => {
  const { store } = novo();
  assert.equal(store.atencao(['educacao'], null).todas.length, 0);
  assert.deepEqual(ids(store.atencao([], 'vila_nova').todas).sort(), ['oc-06', 'oc-07', 'oc-13']);
});

// ---- ações do prefeito ----
test('acoesDisponiveis por situação', () => {
  const { store } = novo();
  assert.deepEqual([...GC.acoesDisponiveis(store.buscar('oc-13'))], ['cobrar', 'priorizar']);
  assert.deepEqual([...GC.acoesDisponiveis(store.buscar('oc-06'))], ['gabinete', 'priorizar']);
  assert.deepEqual([...GC.acoesDisponiveis(store.buscar('oc-10'))], ['priorizar']);
});

test('agir: uma ação por ocorrência, registra e emite', () => {
  const { store, eventos } = novo();
  assert.equal(store.agir('oc-10', 'cobrar'), false, 'cobrar sem estouro');
  assert.equal(store.agir('oc-10', 'gabinete'), false, 'gabinete sem conjunta');
  assert.equal(store.agir('oc-13', 'cobrar'), true);
  assert.equal(store.agir('oc-13', 'priorizar'), false, 'segunda ação');
  assert.equal(store.agir('oc-999', 'cobrar'), false);
  assert.deepEqual(eventos.map((e) => e.tipo), ['acao']);
  assert.match(store.buscar('oc-13').linhaTempo.at(-1).texto, /^📣 Prefeito cobrou a /);
  assert.equal(store.buscar('oc-13').acaoPrefeito, 'cobrar');
  assert.equal(GC.acoesDisponiveis(store.buscar('oc-13')).length, 0);
});

test('gabinete registra as secretarias envolvidas', () => {
  const { store } = novo();
  assert.equal(store.agir('oc-06', 'gabinete'), true);
  assert.equal(store.buscar('oc-06').linhaTempo.at(-1).texto, '🚨 Gabinete de crise: Secretaria de Obras e Infraestrutura + Secretaria de Saúde');
});

test('priorizar corta pela metade o tempo que falta', () => {
  const { store } = novo();
  store.agir('oc-10', 'priorizar');
  assert.equal(store.buscar('oc-10').prazoMin, 2880); // 1440 min de idade + metade dos 2880 que faltavam
  assert.equal(store.buscar('oc-10').linhaTempo.at(-1).texto, '⚡ Prefeito priorizou');
});

test('cobrada sai do bloco ao ir a campo; recorrente só ao resolver', () => {
  const { store } = novo();
  store.agir('oc-13', 'cobrar'); store.avancar('oc-13');
  assert.ok(!ids(store.atencao([], null).todas).includes('oc-13'));
  store.agir('oc-17', 'priorizar'); store.avancar('oc-17');
  assert.ok(ids(store.atencao([], null).todas).includes('oc-17'));
  store.avancar('oc-17');
  assert.ok(!ids(store.atencao([], null).todas).includes('oc-17'));
});

test('agir em resolvida é recusado', () => {
  const { store } = novo();
  store.avancar('oc-05');
  assert.equal(store.agir('oc-05', 'priorizar'), false);
});

test('ao resolver grava noPrazo', () => {
  const { store } = novo();
  store.agir('oc-13', 'cobrar'); store.avancar('oc-13'); store.avancar('oc-13');
  assert.equal(store.buscar('oc-13').noPrazo, false);
  store.avancar('oc-05');
  assert.equal(store.buscar('oc-05').noPrazo, true);
});

// ---- cidade andando sozinha ----
test('passoAutomatico ignora exceções e para em 15 ativas', () => {
  const { store } = novo();
  const avancadas = [];
  let id;
  while ((id = store.passoAutomatico())) avancadas.push(id);
  const atencaoIds = new Set(['oc-13', 'oc-22', 'oc-01', 'oc-06', 'oc-07', 'oc-17', 'oc-19', 'oc-20']);
  assert.ok(avancadas.length > 0);
  assert.ok(avancadas.every((x) => !atencaoIds.has(x)));
  assert.equal(store.ocorrencias().length, 15);
});

test('passoAutomatico não mexe em quem já recebeu ação do prefeito', () => {
  const { store } = novo();
  store.agir('oc-10', 'priorizar');
  let id;
  while ((id = store.passoAutomatico())) assert.notEqual(id, 'oc-10');
});

// ---- faixa e recortes ----
test('recorte estourado e kpis.estouradas', () => {
  const { store } = novo();
  assert.deepEqual(ids(store.ocorrencias([], null, 'estourado')).sort(), ['oc-13', 'oc-22']);
  assert.equal(store.kpis().estouradas, 2);
  store.agir('oc-13', 'cobrar'); store.avancar('oc-13');
  assert.equal(store.kpis().estouradas, 1);
  assert.equal(store.kpis().emAndamento, 6);
  assert.deepEqual(ids(store.ocorrencias([], null, 'estourado')), ['oc-22']);
});

test('recortes batem com os números da faixa', () => {
  const { store } = novo();
  const k = store.kpis([], null);
  assert.equal(store.ocorrencias([], null, 'criticas').length, k.criticas);
  assert.equal(store.ocorrencias([], null, 'estourado').length, k.estouradas);
  assert.equal(store.ocorrencias([], null, 'andamento').length, k.emAndamento);
  assert.equal(store.atencao([], null, 'estourado').todas.length, 2);
});

test('sem recorte, tudo como antes', () => {
  const { store } = novo();
  assert.equal(store.ocorrencias([], null, null).length, store.ocorrencias([], null).length);
});

test("kpis('defesa_civil').criticas conta só críticas da área", () => {
  const { store } = novo();
  const esperado = GC.data.ocorrencias.filter((o) => o.area === 'defesa_civil' && o.severidade === 'critica').length;
  assert.equal(store.kpis('defesa_civil').criticas, esperado);
  assert.equal(store.kpis().criticas, GC.data.ocorrencias.filter((o) => o.severidade === 'critica').length);
});

test('kpis(null, bairro) conta só o bairro e usa a satisfação do bairro', () => {
  const { store } = novo();
  const k = store.kpis(null, 'centro');
  assert.equal(k.criticas, GC.data.ocorrencias.filter((o) => o.bairroId === 'centro' && o.severidade === 'critica').length);
  assert.equal(k.satisfacaoPct, GC.data.satisfacaoPorBairro.centro);
  assert.equal(store.kpis().satisfacaoPct, 72);
});

// ---- novas, imutabilidade, assinatura, falas ----
test("adicionar emite 'nova' e entra encaminhada", () => {
  const { store, eventos } = novo();
  const extra = Object.assign({}, GC.data.ocorrenciasExtras[0], { status: 'resolvida' });
  store.adicionar(extra);
  assert.equal(eventos[0].tipo, 'nova');
  const o = store.buscar(extra.id);
  assert.equal(o.status, 'encaminhada');
  assert.ok(o.responsavel);
  assert.equal(o.linhaTempo.length, 2);
  assert.equal(GC.estourada(o), false);
});

test('criarStore não muta GC.data.ocorrencias', () => {
  const { store } = novo();
  store.avancar('oc-02');
  assert.equal(GC.data.ocorrencias.find((o) => o.id === 'oc-02').status, 'encaminhada');
});

test('assinar devolve função que cancela', () => {
  const { store } = novo();
  let n = 0;
  const cancelar = store.assinar(() => n++);
  cancelar();
  store.avancar('oc-01');
  assert.equal(n, 0);
});

test('textoSecretaria cita a secretaria e o bairro em cada etapa', () => {
  const o = GC.data.ocorrencias.find((x) => x.id === 'oc-01');
  for (const etapa of ['em_campo', 'resolvida', 'cobrada', 'priorizada']) {
    const t = GC.textoSecretaria(o, etapa);
    assert.match(t, /Defesa Civil/, etapa);
    assert.match(t, /Centro/, etapa);
  }
  assert.match(GC.textoSecretaria(o, 'gabinete', 'mobilidade'), /Secretaria de Mobilidade/);
});

// ---- bairro selecionado + indicadores por secretaria ----
test('ocorrencias(area, bairro) filtra pelo bairro', () => {
  const { store } = novo();
  const centro = store.ocorrencias(null, 'centro');
  assert.ok(centro.length > 0 && centro.every((o) => o.bairroId === 'centro'));
  assert.ok(store.ocorrencias('saude', 'centro').every((o) => o.area === 'saude' && o.bairroId === 'centro'));
});

test('todo bairro tem satisfação entre 0 e 100', () => {
  for (const b of GC.data.bairros) {
    const v = GC.data.satisfacaoPorBairro[b.id];
    assert.ok(v >= 0 && v <= 100, b.id);
  }
});

test('porSecretaria devolve as 7 secretarias na ordem das áreas, com fonte', () => {
  const { store } = novo();
  const lista = store.porSecretaria(null);
  assert.deepEqual(lista.map((s) => s.area).join(), GC.data.areas.map((a) => a.id).join());
  for (const s of lista) {
    assert.ok(s.secretaria.nome && s.fonte.includes(s.secretaria.nome), s.area);
    assert.ok(typeof s.atualizadoHaMin === 'number');
    assert.ok(s.metrica.rotulo);
  }
});

test('porSecretaria no Centro: Defesa Civil com 2 críticas e 4 casos em 30 dias', () => {
  const { store } = novo();
  const dc = store.porSecretaria('centro').find((s) => s.area === 'defesa_civil');
  assert.equal(dc.ativas, 2);
  assert.equal(dc.criticas, 2);
  assert.equal(dc.metrica.valor, 4);
});

test('porSecretaria Saúde: UBS do bairro, sem UBS vira null, cidade é a média', () => {
  const { store } = novo();
  assert.equal(store.porSecretaria('centro').find((s) => s.area === 'saude').metrica.valor, 94);
  assert.equal(store.porSecretaria('parque_industrial').find((s) => s.area === 'saude').metrica.valor, null);
  const ubs = GC.data.series.lotacaoUbs;
  const media = Math.round(ubs.reduce((s, u) => s + u.pct, 0) / ubs.length);
  assert.equal(store.porSecretaria(null).find((s) => s.area === 'saude').metrica.valor, media);
});

test('porSecretaria reflete ocorrência resolvida', () => {
  const { store } = novo();
  store.avancar('oc-01'); store.avancar('oc-01');
  assert.equal(store.porSecretaria('centro').find((s) => s.area === 'defesa_civil').ativas, 1);
});

// ---- filtros acumulativos (várias secretarias + bairro) ----
test('ocorrencias aceita lista de áreas', () => {
  const { store } = novo();
  const esperado = GC.data.ocorrencias.filter((o) => o.area === 'defesa_civil' || o.area === 'saude').length;
  assert.equal(store.ocorrencias(['defesa_civil', 'saude']).length, esperado);
});

test('lista de áreas vazia equivale a sem filtro', () => {
  const { store } = novo();
  assert.equal(store.ocorrencias([]).length, store.ocorrencias().length);
});

test('kpis com lista de áreas + bairro', () => {
  const { store } = novo();
  const k = store.kpis(['defesa_civil', 'saude'], 'centro');
  const sel = GC.data.ocorrencias.filter((o) => ['defesa_civil', 'saude'].includes(o.area) && o.bairroId === 'centro');
  assert.equal(k.criticas, sel.filter((o) => o.severidade === 'critica').length);
});

test('porSecretaria restringe às áreas filtradas mantendo a ordem do menu', () => {
  const { store } = novo();
  assert.equal(store.porSecretaria('centro', ['saude', 'defesa_civil']).map((s) => s.area).join(), 'defesa_civil,saude');
  assert.equal(store.porSecretaria(null, []).length, 7);
});

// ---- desempenho de 30 dias ----
test('desempenho da cidade: resumo, pior e frases', () => {
  const d = novo().store.desempenho(null);
  const soma = Object.values(GC.data.desempenho30d).reduce((s, x) => s + x.resolvidas, 0);
  assert.equal(d.resumo.resolvidas, soma);
  assert.ok(Number.isInteger(d.resumo.noPrazoPct));
  assert.equal(d.secretarias.length, 7);
  assert.equal(d.secretarias[0].area, 'infraestrutura');
  assert.equal(d.secretarias[0].pior, true);
  assert.equal(d.secretarias.filter((s) => s.pior).length, 1);
  assert.equal(d.ruim[0], 'Infraestrutura: só 62% no prazo (meta 85%)');
  assert.equal(d.ruim[1], 'Porto Dourado: 1 prazo estourado agora');
  assert.equal(d.ruim[2], 'Alagamentos (mês): +25%');
  assert.equal(d.escopoCidade, false);
});

test('desempenho: atrasadas agora por secretaria', () => {
  const d = novo().store.desempenho(null);
  assert.equal(d.secretarias.find((s) => s.area === 'saude').atrasadas, 1);
  assert.equal(d.secretarias.find((s) => s.area === 'limpeza').atrasadas, 1);
});

test('resolver na demo soma no desempenho e aparece em recentes', () => {
  const { store } = novo();
  const antes = store.desempenho(null).resumo.resolvidas;
  store.avancar('oc-05');
  const d = store.desempenho(null);
  assert.equal(d.resumo.resolvidas, antes + 1);
  assert.equal(d.recentes[0].id, 'oc-05');
  assert.equal(d.recentes[0].atrasoMin, 0);
  assert.ok(d.recentes.length <= 5);
});

test('resolvida atrasada entra com atrasoMin e derruba o % no prazo', () => {
  const { store } = novo();
  const antes = store.desempenho(null).resumo.noPrazoPct;
  store.agir('oc-22', 'cobrar'); store.avancar('oc-22'); store.avancar('oc-22');
  const d = store.desempenho(null);
  assert.equal(d.recentes[0].atrasoMin, 2880);
  assert.ok(d.resumo.noPrazoPct <= antes);
});

test('desempenho por bairro: proporcional, sem NaN, frases do bairro', () => {
  const { store } = novo();
  const d = store.desempenho('vila_nova');
  assert.equal(d.escopoCidade, true);
  assert.ok(d.secretarias.every((s) => Number.isInteger(s.resolvidas) && !Number.isNaN(s.noPrazoPct)));
  assert.equal(d.secretarias.find((s) => s.area === 'saude').atrasadas, 1);
  assert.ok(d.ruim.includes('1 prazo estourado agora no bairro'));
  assert.ok(d.ruim.includes('Infraestrutura: 6 casos no bairro em 30 dias'));
  assert.ok(d.ruim.includes('Satisfação de 58% (cidade: 72%)'));
  const semCasos = store.desempenho('parque_industrial').secretarias.find((s) => s.area === 'educacao');
  assert.equal(semCasos.resolvidas, 0);
});

test('bairro sem estouro não gera frase de estouro; recentes só do bairro', () => {
  const d = novo().store.desempenho('bela_vista');
  assert.ok(!d.ruim.some((f) => f.includes('estourad')));
  assert.ok(d.recentes.every((r) => r.bairroId === 'bela_vista'));
});

test('kpis traz noPrazoPct e tempoMedioH do desempenho', () => {
  const { store } = novo();
  const r = store.desempenho(null).resumo;
  assert.equal(store.kpis().noPrazoPct, r.noPrazoPct);
  assert.equal(store.kpis().tempoMedioH, r.tempoMedioH);
});

// ---- textos e botões compartilhados pelas telas ----
test('situacao descreve cada estado', () => {
  const { store } = novo();
  assert.equal(GC.situacao(store.buscar('oc-13')), '📡 Encaminhada há 4 h · prazo era 2 h · sem equipe em campo');
  assert.equal(GC.situacao(store.buscar('oc-06')), '📡 Encaminhada · faltam 40 min');
  assert.equal(GC.situacao(store.buscar('oc-05')), '🚧 Equipe em campo');
  store.agir('oc-13', 'cobrar');
  assert.equal(GC.situacao(store.buscar('oc-13')), '📣 Cobrada · equipe a caminho');
  store.agir('oc-06', 'gabinete');
  assert.equal(GC.situacao(store.buscar('oc-06')), '🚨 Gabinete convocado');
  store.avancar('oc-13');
  assert.equal(GC.situacao(store.buscar('oc-13')), '🚧 Equipe em campo · 📣 cobrada');
  store.avancar('oc-13');
  assert.equal(GC.situacao(store.buscar('oc-13')), '✅ Resolvida');
});

test('botoesAcao gera um botão por ação disponível', () => {
  const { store } = novo();
  const html = GC.botoesAcao(store.buscar('oc-13'));
  assert.deepEqual([...html.matchAll(/data-acao="(\w+)"/g)].map((m) => m[1]), ['cobrar', 'priorizar']);
  assert.match(html, />📣 Cobrar</);
  assert.match(GC.botoesAcao(store.buscar('oc-13'), { completo: true }), />📣 Cobrar Secretaria de Saúde</);
  store.agir('oc-13', 'cobrar');
  assert.equal(GC.botoesAcao(store.buscar('oc-13')), '');
});

test('botoesAcao compacto: só a principal com texto', () => {
  const { store } = novo();
  const html = GC.botoesAcao(store.buscar('oc-13'), { compacto: true });
  assert.match(html, /data-acao="cobrar">📣 Cobrar</);
  assert.match(html, /data-acao="priorizar" title="Priorizar" aria-label="Priorizar">⚡</);
});

// ---- desempenho segue o filtro de secretaria (ranking continua completo) ----
test('desempenho com filtro de secretaria: resumo, frases e recentes só dela', () => {
  const { store } = novo();
  store.avancar('oc-05'); // defesa civil
  store.avancar('oc-11'); // infraestrutura
  const d = store.desempenho(null, ['infraestrutura']);
  assert.equal(d.secretarias.length, 7);
  assert.deepEqual([...d.secretarias.filter((s) => s.noFiltro).map((s) => s.area)], ['infraestrutura']);
  assert.equal(d.resumo.resolvidas, GC.data.desempenho30d.infraestrutura.resolvidas + 1);
  assert.equal(d.ruim[0], 'Infraestrutura: só 65% no prazo (meta 85%)'); // 62% + 1 resolvida no prazo
  assert.ok(!d.ruim.some((f) => f.includes('Porto Dourado')), 'estouro é de outra secretaria');
  assert.ok(d.ruim.includes('Quedas de energia (mês): +18%'));
  assert.ok(d.recentes.every((r) => r.area === 'infraestrutura'));
  assert.equal(d.recentes[0].id, 'oc-11');
});

test('desempenho com secretaria dentro da meta não aponta pior', () => {
  const d = novo().store.desempenho(null, ['mobilidade']);
  assert.equal(d.secretarias.filter((s) => s.pior).length, 0);
  assert.ok(!d.ruim.some((f) => f.includes('no prazo (meta')));
});

test('desempenho sem filtro marca todas como no filtro', () => {
  const d = novo().store.desempenho(null, []);
  assert.equal(d.secretarias.filter((s) => s.noFiltro).length, 7);
});

// ---- correções da revisão final ----
test('priorizar não faz uma ocorrência dentro do prazo estourar', () => {
  const { store } = novo();
  store.agir('oc-06', 'priorizar'); // crítica, 80 min de 120
  const o = store.buscar('oc-06');
  assert.equal(GC.estourada(o), false);
  assert.equal(Math.round(GC.prazoRestanteMin(o)), 20); // faltavam 40, agora 20
  assert.equal(store.kpis().estouradas, 2);
  store.avancar('oc-06'); store.avancar('oc-06');
  assert.equal(o.noPrazo, true);
});

test('desempenho por bairro compara com o mês anterior do mesmo bairro', () => {
  const { store } = novo();
  for (const b of GC.data.bairros) {
    const r = store.desempenho(b.id).resumo;
    if (!r.resolvidasAnt) continue;
    const razao = r.resolvidas / r.resolvidasAnt;
    assert.ok(razao > 0.5 && razao < 2, `${b.id}: ${r.resolvidas} vs ${r.resolvidasAnt}`);
  }
});
