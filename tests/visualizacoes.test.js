const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'visualizacoes.js');
const puro = (x) => JSON.parse(JSON.stringify(x));

function memoria(inicial) {
  let guardado = inicial === undefined ? null : inicial;
  return { ler: () => guardado, gravar: (o) => { guardado = puro(o); }, ver: () => guardado };
}

test('normalizarEstado descarta inválidos e ordena o que não tem ordem', () => {
  const e = GC.normalizarEstado({
    filtros: { recorte: 'xyz', severidades: ['media', 'critica', 'nada'], areas: ['saude', 'infraestrutura', 'x'], bairro: 'nao_existe' },
    widgets: { ativos: ['satisfacao', 'numeros', 'numeros', 'lixo'], pulsos: ['saude', 'infraestrutura'] },
  });
  assert.deepEqual(puro(e), {
    filtros: { recorte: null, severidades: ['critica', 'media'], areas: ['infraestrutura', 'saude'], bairros: [], afetados: [], tempos: [], origens: [], multi: false },
    widgets: { ativos: ['satisfacao', 'numeros'], pulsos: ['infraestrutura', 'saude'] },
  });
});

test('normalizarEstado sem widgets liga todos; pulsos vazio vira null', () => {
  const e = GC.normalizarEstado({ widgets: { pulsos: [] } });
  assert.deepEqual(puro(e.widgets.ativos), puro(GC.WIDGETS.map((w) => w.id)));
  assert.equal(e.widgets.pulsos, null);
  assert.deepEqual(puro(GC.normalizarEstado({ widgets: { ativos: [] } }).widgets.ativos), []);
});

test('estadosIguais ignora a ordem dos filtros mas não a dos widgets', () => {
  assert.ok(GC.estadosIguais({ filtros: { areas: ['saude', 'educacao'] } }, { filtros: { areas: ['educacao', 'saude'] } }));
  assert.ok(!GC.estadosIguais({ widgets: { ativos: ['numeros', 'pulsos'] } }, { widgets: { ativos: ['pulsos', 'numeros'] } }));
});

test('contarFiltrosEstado soma cada filtro ligado', () => {
  assert.equal(GC.contarFiltrosEstado({}), 0);
  assert.equal(GC.contarFiltrosEstado({ areas: ['saude', 'educacao'], severidades: ['critica'], bairro: 'centro', recorte: 'estourado' }), 5);
});

test('começa na "Cidade inteira" com as prontas listadas', () => {
  const v = GC.criarVistas(memoria());
  assert.equal(v.atual().id, 'cidade');
  assert.deepEqual(puro(v.lista().map((x) => x.id)), puro(GC.VISTAS_PRONTAS.map((x) => x.id)));
});

test('selecionar devolve o estado normalizado e lembra a escolha', () => {
  const mem = memoria();
  const v = GC.criarVistas(mem);
  const e = v.selecionar('saude');
  assert.deepEqual(puro(e.filtros.areas), ['saude']);
  assert.deepEqual(puro(e.widgets.pulsos), ['saude']);
  assert.equal(mem.ver().atual, 'saude');
  assert.equal(GC.criarVistas(mem).atual().id, 'saude');
  assert.equal(v.selecionar('nao_existe'), null);
});

test('alterada compara o estado atual com o da visualização escolhida', () => {
  const v = GC.criarVistas(memoria());
  const e = v.selecionar('criticas');
  assert.equal(v.alterada(e), false);
  assert.equal(v.alterada(Object.assign({}, e, { filtros: Object.assign({}, e.filtros, { bairro: 'centro' }) })), true);
});

test('salvarComo cria, seleciona e persiste; nome vazio é recusado', () => {
  const mem = memoria();
  const v = GC.criarVistas(mem);
  assert.equal(v.salvarComo('   ', {}), null);
  const nova = v.salvarComo('  Meu bairro  ', { filtros: { bairro: 'centro' }, widgets: { ativos: ['numeros'] } });
  assert.equal(nova.nome, 'Meu bairro');
  assert.equal(v.atual().id, nova.id);
  const relido = GC.criarVistas(mem);
  assert.equal(relido.atual().nome, 'Meu bairro');
  assert.deepEqual(puro(relido.atual().filtros.bairros), ['centro']); // "bairro" salvo antes da seleção múltipla vira lista
});

test('normalizarEstado: vários bairros, na ordem da cidade, sem repetidos nem inexistentes', () => {
  const ids = GC.data.bairros.map((b) => b.id);
  const e = GC.normalizarEstado({ filtros: { bairros: [ids[2], 'nao_existe', ids[0], ids[2]] } });
  assert.deepEqual(puro(e.filtros.bairros), [ids[0], ids[2]]);
  assert.equal(GC.contarFiltrosEstado({ bairros: [ids[0], ids[1], ids[2]] }), 3);
});

test('prontas não podem ser sobrescritas, renomeadas nem removidas', () => {
  const v = GC.criarVistas(memoria());
  assert.equal(v.sobrescrever('cidade', {}), false);
  assert.equal(v.renomear('cidade', 'X'), false);
  assert.equal(v.remover('cidade'), false);
});

test('sobrescrever, renomear e remover uma salva', () => {
  const v = GC.criarVistas(memoria());
  const nova = v.salvarComo('Teste', {});
  assert.ok(v.sobrescrever(nova.id, { filtros: { severidades: ['alta'] } }));
  assert.deepEqual(puro(v.buscar(nova.id).filtros.severidades), ['alta']);
  assert.ok(v.renomear(nova.id, 'Altas'));
  assert.equal(v.buscar(nova.id).nome, 'Altas');
  assert.ok(v.remover(nova.id));
  assert.equal(v.atual().id, 'cidade');
});

test('armazenamento corrompido ou com atual inexistente não quebra', () => {
  assert.equal(GC.criarVistas({ ler: () => { throw new Error('x'); }, gravar() {} }).atual().id, 'cidade');
  assert.equal(GC.criarVistas(memoria({ salvas: 'lixo', atual: 'sumiu' })).atual().id, 'cidade');
  const v = GC.criarVistas(memoria({ salvas: [{ id: 'a', nome: '' }, { id: 'b', nome: 'Ok', filtros: { areas: ['saude'] } }], atual: 'b' }));
  assert.deepEqual(puro(v.lista().filter((x) => !x.fixa).map((x) => x.id)), ['b']);
  assert.equal(v.atual().id, 'b');
});

// ---- bairros: seleção múltipla vale para o store ----
test('store filtra ocorrências, kpis e desempenho por uma lista de bairros', () => {
  const GS = require('./helpers/carregar').carregar('data.js', 'data-alertas.js', 'store.js');
  const store = GS.criarStore(GS.data);
  const todas = store.ocorrencias();
  const [a, b] = [...new Set(todas.map((o) => o.bairroId))];
  const lista = store.ocorrencias(null, [a, b]);
  assert.equal(lista.length, todas.filter((o) => o.bairroId === a || o.bairroId === b).length);
  assert.deepEqual(store.ocorrencias(null, [a]).map((o) => o.id), store.ocorrencias(null, a).map((o) => o.id));
  assert.equal(store.ocorrencias(null, []).length, todas.length, 'lista vazia = cidade inteira');
  const k = store.kpis(null, [a, b]);
  assert.ok(Number.isFinite(k.satisfacaoPct) && Number.isFinite(k.noPrazoPct) && Number.isFinite(k.tempoMedioH));
  const d = store.desempenho([a, b]);
  assert.ok(d.escopoCidade);
  assert.ok(d.resumo.resolvidas <= store.desempenho(null).resumo.resolvidas);
});

test('Cidade inteira não liga os widgets que repetem o cabeçalho e a tela Secretarias', () => {
  const cidade = GC.VISTAS_PRONTAS.find((v) => v.id === 'cidade');
  assert.ok(!cidade.widgets.ativos.includes('numeros'));
  assert.ok(!cidade.widgets.ativos.includes('desempenho'));
  assert.ok(cidade.widgets.ativos.includes('pulsos'));
  // Os 23 widgets novos (js/widgets-extra.js) começam fora: entram pela gaveta Widgets ou pelas sugestões.
  assert.equal(cidade.widgets.ativos.length, GC.WIDGETS.length - 2 - 23);
  assert.ok(!cidade.widgets.ativos.includes('feed') && !cidade.widgets.ativos.includes('nota'));
});

test('normalizarEstado: afetados, tempo e origem na ordem das faixas; multi só com true', () => {
  const f = GC.normalizarEstado({ filtros: { afetados: ['mais1000', 'x', 'ate100'], tempos: ['dias', 'recentes'], origens: ['equipes', 'cidadao', 'nada'], multi: 'sim' } }).filtros;
  assert.deepEqual(puro(f.afetados), ['ate100', 'mais1000']);
  assert.deepEqual(puro(f.tempos), ['recentes', 'dias']);
  assert.deepEqual(puro(f.origens), ['cidadao', 'equipes']);
  assert.equal(f.multi, false);
  assert.equal(GC.contarFiltrosEstado({ afetados: ['ate100'], tempos: ['dias'], origens: ['cidadao', 'sistemas'], multi: true }), 5);
});

test('origensDe classifica a fonte (pode ter mais de uma) e cai em equipes sem pista', () => {
  assert.deepEqual(puro(GC.origensDe({ fonte: 'Sensor pluviométrico + 18 chamados 156' })), ['cidadao', 'sistemas']);
  assert.deepEqual(puro(GC.origensDe({ fonte: 'App Cidadão (31 fotos)' })), ['cidadao']);
  assert.deepEqual(puro(GC.origensDe({ fonte: 'Vistoria da Defesa Civil' })), ['equipes']);
  assert.deepEqual(puro(GC.origensDe({ fonte: 'Algo sem pista' })), ['equipes']);
  assert.deepEqual(puro(GC.origensDe({ fonte: '156', origens: ['sistemas'] })), ['sistemas']);
});

test('filtrarPorAtributos aplica gravidade, afetados, tempo, origem e várias secretarias', () => {
  const oc = (id, extra) => Object.assign({ id, severidade: 'alta', afetados: 50, abertaHaMin: 30, fonte: '156', areasEnvolvidas: ['saude'] }, extra);
  const lista = [
    oc('a'),
    oc('b', { afetados: 100 }),
    oc('c', { afetados: 101, abertaHaMin: 60 }),
    oc('d', { afetados: 5000, abertaHaMin: 1440, fonte: 'Central de tráfego (integração)', areasEnvolvidas: ['saude', 'mobilidade'] }),
    oc('e', { severidade: 'critica', abertaHaMin: 4320, fonte: 'Equipe de varrição' }),
  ];
  const ids = (filtros) => GC.filtrarPorAtributos(lista, filtros).map((o) => o.id).join('');
  assert.equal(ids({}), 'abcde');
  assert.equal(ids({ afetados: ['ate100'] }), 'abe');
  assert.equal(ids({ afetados: ['ate1000', 'mais1000'] }), 'cd');
  assert.equal(ids({ tempos: ['recentes'] }), 'ab');
  assert.equal(ids({ tempos: ['horas'] }), 'c');
  assert.equal(ids({ tempos: ['dias'] }), 'de');
  assert.equal(ids({ origens: ['sistemas'] }), 'd');
  assert.equal(ids({ origens: ['equipes'] }), 'e');
  assert.equal(ids({ multi: true }), 'd');
  assert.equal(ids({ severidades: ['critica'], tempos: ['dias'] }), 'e');
  assert.equal(ids({ afetados: ['ate100'], multi: true }), '');
});

test('resumoFiltros descreve os filtros em poucas palavras', () => {
  assert.deepEqual(puro(GC.resumoFiltros({})), []);
  assert.deepEqual(puro(GC.resumoFiltros({ areas: ['saude'], severidades: ['critica', 'alta'], afetados: ['mais1000'], multi: true })), ['Saúde', 'Crítica + Alta', '+1.000 afetados', 'várias secretarias']);
  const b = GC.data.bairros.slice(0, 2).map((x) => x.id);
  assert.deepEqual(puro(GC.resumoFiltros({ bairros: b, areas: ['saude', 'educacao', 'limpeza'] })), ['3 secretarias', '2 bairros']);
});

test('duplicar copia (também as prontas) sem trocar a visualização em uso; mover reordena as salvas', () => {
  const mem = memoria();
  const v = GC.criarVistas(mem);
  const copia = v.duplicar('saude');
  assert.equal(copia.nome, 'Saúde (cópia)');
  assert.equal(copia.fixa, undefined);
  assert.deepEqual(puro(copia.filtros.areas), ['saude']);
  assert.equal(v.atual().id, 'cidade');
  const a = v.salvarComo('A', {});
  const b = v.salvarComo('B', {});
  const salvas = () => v.lista().filter((x) => !x.fixa).map((x) => x.nome).join(',');
  assert.equal(salvas(), 'Saúde (cópia),A,B');
  assert.equal(v.mover(b.id, -1), true);
  assert.equal(salvas(), 'Saúde (cópia),B,A');
  assert.equal(v.mover(copia.id, -1), false);
  assert.equal(v.mover('saude', 1), false);
  const c2 = v.duplicar(a.id);
  assert.equal(salvas(), 'Saúde (cópia),B,A,A (cópia)');
  assert.equal(mem.ver().salvas.length, 4);
  assert.equal(v.duplicar('nao-existe'), null);
  assert.ok(c2.id !== a.id);
});

test('criarVistas com prontas restritas: lista só as permitidas e cai na primeira', () => {
  const v = GC.criarVistas(memoria({ salvas: [], atual: 'seguranca' }), { prontas: ['saude', 'criticas'] });
  assert.deepEqual([...v.lista().map((x) => x.id)], ['saude', 'criticas']);
  assert.equal(v.atual().id, 'saude', 'visualização de outra pasta guardada não volta');
  assert.equal(v.selecionar('seguranca'), null);
  const s = v.salvarComo('Minha', v.selecionar('saude'));
  assert.ok(v.remover(s.id));
  assert.equal(v.atual().id, 'saude');
  assert.equal(GC.criarVistas(memoria()).atual().id, 'cidade', 'sem restrição: segue como antes');
});
