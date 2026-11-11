const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const ARQUIVOS = ['icones.js', 'contrato.js', 'data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-gestao.js',
  'data-secretarias.js', 'store.js', 'visualizacoes.js', 'indicadores.js', 'resumo-dia.js', 'resumo-semana.js', 'painel-bairro.js', 'widgets-extra.js'];

function montar(cidade) {
  const GC = carregar({ cidade }, ...ARQUIVOS);
  const store = GC.criarStore(GC.data);
  const agora = Date.now();
  const risco = GC.risco.resumo(store.ocorrencias());
  const indicadores = GC.avaliarIndicadores(GC.contextoIndicadores(store));
  const d = {
    agora, risco, ocorrencias: store.ocorrencias(), frota: GC.frota.resumo(),
    indicadores: () => indicadores,
    atencao: () => store.atencao().todas,
    gabinetes: () => [],
    resumoDia: () => GC.resumoDoDia({ atencao: store.atencao().todas, tendencias: GC.data.tendencias, risco, agora }),
    resumoSemana: () => GC.resumoDaSemana({ tendencias: GC.data.tendencias, conquistas: GC.data.conquistas, desempenho: GC.data.desempenho30d, agora }),
    resumoBairro: (id) => GC.resumoBairro(id, { ocorrencias: store.ocorrencias(), leitos: GC.leitos.resumo().unidades, escolas: GC.educacao.resumo().escolas, obras: GC.obras.resumo().obras }),
  };
  return { GC, d, indicadores, store };
}

test('todo widget do catálogo tem categoria e ícone válidos, e os 23 novos têm desenho', () => {
  const { GC } = montar('media');
  const cats = GC.CATEGORIAS_WIDGET.map((c) => c.id);
  for (const w of GC.WIDGETS) {
    assert.ok(cats.includes(w.categoria), `${w.id}: categoria ${w.categoria}`);
    assert.ok(w.icone, `${w.id} sem ícone`);
  }
  const novos = Object.keys(GC.WIDGETS_EXTRA);
  assert.equal(novos.length, 23);
  novos.forEach((id) => assert.ok(GC.WIDGETS.some((w) => w.id === id), `${id} fora do catálogo`));
  // Os novos começam desligados: o painel padrão não muda.
  novos.forEach((id) => assert.ok(!GC.WIDGETS_PADRAO.includes(id), `${id} ligado por padrão`));
});

for (const cidade of ['pequena', 'media', 'grande']) {
  test(`cada widget novo monta sem erro e sem "undefined"/"NaN" (cidade ${cidade})`, () => {
    const { GC, d } = montar(cidade);
    for (const [id, f] of Object.entries(GC.WIDGETS_EXTRA)) {
      for (const opcoes of [{}, id === 'resumo' ? { periodo: 'semana' } : id === 'kpi' ? { ind: 'SAU03' } : id === 'nota' ? { texto: 'Lembrar <b>x</b>' } : {}]) {
        const html = f(d, opcoes);
        assert.equal(typeof html, 'string', id);
        assert.ok(html.length > 20, `${id} vazio`);
        assert.ok(!/undefined|NaN|\[object Object\]/.test(html), `${id}: ${html.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,40}/)}`);
      }
    }
  });
}

test('a nota escapa o HTML do texto', () => {
  const { GC, d } = montar('media');
  const html = GC.WIDGETS_EXTRA.nota(d, { texto: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('feed: mais recentes primeiro; histograma de 24 h soma as ocorrências do período', () => {
  const agora = 1_800_000_000_000 + 45 * 60000; // 45 min depois de uma hora cheia
  const { GC } = montar('media');
  const H = 3600000;
  const lista = [
    { id: 'a', criadaEm: agora - 30 * 60000, severidade: 'critica' },
    { id: 'b', criadaEm: agora - 5 * H, severidade: 'media' },
    { id: 'c', criadaEm: agora - 5 * H - 60000, severidade: 'alta' },
    { id: 'd', criadaEm: agora - 30 * H, severidade: 'media' }, // fora das 24 h
  ];
  assert.deepEqual(GC.feedOcorrencias(lista, 3).map((o) => o.id), ['a', 'b', 'c']);
  const h = GC.histograma24h(lista, agora);
  assert.equal(h.horas.length, 24);
  assert.equal(h.total, 3);
  assert.equal(h.horas[23].criticas, 1);
  assert.equal(h.horas[h.pico].n, 2);
});

test('calor por bairro: nível 0 sem ocorrência, 4 no mais carregado; resolvidas não contam', () => {
  const { GC } = montar('media');
  const bairros = [{ id: 'x', nome: 'X' }, { id: 'y', nome: 'Y' }, { id: 'z', nome: 'Z' }];
  const r = GC.calorBairros([
    { bairroId: 'x', severidade: 'critica', status: 'aberta' }, { bairroId: 'x', severidade: 'alta', status: 'aberta' },
    { bairroId: 'y', severidade: 'media', status: 'aberta' }, { bairroId: 'z', severidade: 'critica', status: 'resolvida' },
  ], bairros);
  const por = Object.fromEntries(r.map((b) => [b.id, b]));
  assert.equal(por.x.nivel, 4);
  assert.equal(por.x.criticas, 1);
  assert.ok(por.y.nivel >= 1 && por.y.nivel < 4);
  assert.equal(por.z.nivel, 0);
});

test('sugestões: só widgets fora do painel, no máximo 3, com motivo', () => {
  const { GC, indicadores } = montar('media');
  const s = GC.sugerirWidgets({ ativos: ['feed'], gabinetes: [{ id: 'g' }], indicadores, atencao: [{}], contratos: GC.gestao.contratos() });
  assert.ok(s.length <= 3 && s.length > 0);
  assert.ok(s.every((x) => x.id !== 'feed' && x.motivo));
  assert.equal(s[0].id, 'crise');
});

test('normalizarEstado guarda tamanho e opções válidos e descarta o resto', () => {
  const { GC } = montar('media');
  const b = GC.data.bairros.map((x) => x.id);
  const w = GC.normalizarEstado({ widgets: {
    ativos: ['nota', 'kpi'],
    tamanhos: { nota: 'p', kpi: 'l', leitos: 'm', lixo: 'l', feed: 'x' },
    opcoes: { nota: { texto: 'oi' }, kpi: { ind: 'SAU03' }, bairro_foco: { bairro: 'nao_existe' }, comparativo: { a: b[0], b: b[0] }, resumo: { periodo: 'semana' } },
  } }).widgets;
  assert.deepEqual(JSON.parse(JSON.stringify(w.tamanhos)), { kpi: 'l', nota: 'p' });
  assert.deepEqual(JSON.parse(JSON.stringify(w.opcoes)), { kpi: { ind: 'SAU03' }, nota: { texto: 'oi' }, resumo: { periodo: 'semana' } });
  // Sem nada mudado, as chaves nem aparecem (estado enxuto).
  const limpo = GC.normalizarEstado({ widgets: { ativos: ['nota'] } }).widgets;
  assert.ok(!('tamanhos' in limpo) && !('opcoes' in limpo));
});

test('dados de gestão escalam com a cidade e fecham as contas', () => {
  const p = montar('pequena').GC.gestao; const g = montar('grande').GC.gestao;
  assert.ok(g.orcamento().previstoMi > p.orcamento().previstoMi * 50);
  const o = montar('media').GC.gestao.orcamento();
  assert.ok(Math.abs(o.previstoMi - o.areas.reduce((s, a) => s + a.previstoMi, 0)) < 0.2);
  assert.ok(o.pagoMi <= o.empenhadoMi);
  const ab = montar('pequena').GC.gestao.assistencia();
  ab.abrigos.forEach((a) => assert.ok(a.ocupadas <= a.vagas && a.vagas > 0));
  const prev = montar('media').GC.gestao.previsao48h(montar('media').GC.data.risco.previsao, Date.now());
  assert.equal(prev.blocos.length, 8);
  assert.ok(prev.blocos.every((x) => x.mm >= 0));
});

test('agenda: só os próximos 14 dias, em ordem, com contratos vencendo', () => {
  const { GC } = montar('media');
  const agora = Date.now();
  const a = GC.gestao.agenda(agora, { obras: GC.obras.resumo().obras });
  assert.ok(a.length >= 4);
  for (let k = 1; k < a.length; k++) assert.ok(a[k].quando >= a[k - 1].quando);
  assert.ok(a.every((x) => x.emDias >= 0 && x.emDias <= 14));
  assert.ok(a.some((x) => x.tipo === 'contrato'));
});
