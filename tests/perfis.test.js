const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

// Perfis de acesso: gestor geral, gestor do setor e cidadão.
const ARQUIVOS = ['icones.js', 'data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-secretarias.js',
  'store.js', 'perfil.js', 'rotas.js', 'crise.js', 'indicadores.js', 'contrato.js', 'ia-roteiro.js', 'tela-cidadao.js'];
const GC = carregar(...ARQUIVOS);
const PREFEITO = { id: 'prefeito', area: null };
const SAUDE = { id: 'setor', area: 'saude' };
const CIDADAO = { id: 'cidadao', area: null };
const hash = (r) => GC.hashDe(r);

test('resolverPerfil: perfil inválido vira gestor geral; setor sem pasta válida cai numa pasta', () => {
  assert.deepEqual({ ...GC.resolverPerfil('xyz') }, PREFEITO);
  assert.deepEqual({ ...GC.resolverPerfil('setor', 'saude') }, SAUDE);
  const s = GC.resolverPerfil('setor', 'inexistente');
  assert.equal(s.id, 'setor');
  assert.ok(GC.data.areas.some((a) => a.id === s.area));
  assert.deepEqual({ ...GC.resolverPerfil('cidadao', 'saude') }, CIDADAO);
  assert.deepEqual({ ...GC.perfil }, PREFEITO, 'sem escolha: gestor geral');
});

test('rotas do gestor do setor: tudo leva à própria pasta', () => {
  const r = (h) => hash(GC.rotaDoPerfil(GC.lerRota(h), SAUDE));
  assert.equal(r('#/painel'), '#/painel');
  assert.equal(r('#/alertas'), '#/alertas');
  assert.equal(r('#/crise'), '#/crise');
  assert.equal(r('#/secretarias'), '#/secretaria/saude');
  assert.equal(r('#/secretaria/educacao'), '#/secretaria/saude');
  assert.equal(r('#/secretaria/saude'), '#/secretaria/saude');
  assert.equal(r('#/dados'), '#/secretaria/saude');
  assert.equal(r('#/cidadao'), '#/secretaria/saude');
  assert.equal(r('#/indicadores'), '#/indicadores/saude');
  assert.equal(r('#/indicadores/SAU01'), '#/indicadores/SAU01');
  assert.equal(r('#/indicadores/SEG01'), '#/indicadores/saude');
  assert.equal(r('#/relatorios/executivo/-/30'), '#/relatorios/secretaria/saude/30');
  assert.equal(r('#/relatorios/secretaria/seguranca/90'), '#/relatorios/secretaria/saude/90');
});

test('rotas do cidadão: só "Para você", o mapa e indicadores públicos', () => {
  const r = (h) => hash(GC.rotaDoPerfil(GC.lerRota(h), CIDADAO));
  assert.equal(r('#/cidadao'), '#/cidadao');
  assert.equal(r('#/painel'), '#/painel');
  for (const h of ['#/alertas', '#/crise', '#/secretarias', '#/secretaria/saude', '#/dados', '#/relatorios/executivo/-/30']) assert.equal(r(h), '#/cidadao', h);
  assert.equal(r('#/indicadores/SAU03'), '#/indicadores/SAU03');
  assert.equal(r('#/indicadores/GAB01'), '#/indicadores', 'indicador interno');
  assert.equal(hash(GC.rotaInicialDoPerfil(CIDADAO)), '#/cidadao');
  assert.equal(hash(GC.rotaInicialDoPerfil(PREFEITO)), '#/painel');
});

test('o gestor geral abre tudo como antes', () => {
  for (const h of ['#/dados', '#/secretarias', '#/relatorios/executivo/-/30', '#/crise/novo', '#/indicadores/GAB01']) {
    assert.equal(hash(GC.rotaDoPerfil(GC.lerRota(h), PREFEITO)), h);
  }
});

test('ações: setor só prioriza o que é da pasta; cidadão não age; a store recusa o resto', () => {
  const store = GC.criarStore(GC.data);
  const daSaude = store.ocorrencias().find((o) => o.area === 'saude' && !o.acaoPrefeito);
  const deOutra = store.ocorrencias().find((o) => o.area !== 'saude' && (o.areasEnvolvidas || []).length > 1);
  try {
    GC.perfil = SAUDE;
    assert.deepEqual([...GC.acoesDisponiveis(daSaude)], ['priorizar']);
    assert.deepEqual([...GC.acoesDisponiveis(deOutra)], []);
    assert.equal(store.agir(deOutra.id, 'gabinete'), false, 'setor não convoca gabinete');
    GC.perfil = CIDADAO;
    assert.deepEqual([...GC.acoesDisponiveis(daSaude)], []);
    assert.equal(store.agir(daSaude.id, 'priorizar'), false);
    GC.perfil = PREFEITO;
    assert.ok(GC.acoesDisponiveis(deOutra).includes('gabinete'));
  } finally { GC.perfil = PREFEITO; }
});

test('gabinete de crise: setor só avança tarefas da pasta; cidadão nada', () => {
  assert.equal(GC.podeNaCrise('avancar', 'saude', SAUDE), true);
  assert.equal(GC.podeNaCrise('avancar', 'mobilidade', SAUDE), false);
  for (const a of ['cobrar', 'abrir', 'comunicar', 'gerir']) assert.equal(GC.podeNaCrise(a, 'saude', SAUDE), false, a);
  for (const a of ['avancar', 'cobrar', 'abrir', 'comunicar', 'gerir']) {
    assert.equal(GC.podeNaCrise(a, 'saude', PREFEITO), true, a);
    assert.equal(GC.podeNaCrise(a, 'saude', CIDADAO), false, a);
  }
});

test('menu: setor com as telas da pasta, cidadão com 2 destinos, gestor geral intacto', () => {
  const base = [{ rota: { tela: 'painel' }, nome: 'Mapa' }, { rota: { tela: 'dados' }, nome: 'Dados' }];
  assert.equal(GC.menuDoPerfil(base, PREFEITO), base);
  const setor = GC.menuDoPerfil(base, SAUDE);
  assert.ok(setor.some((i) => i.rota.tela === 'secretaria' && i.rota.area === 'saude'));
  assert.ok(!setor.some((i) => i.rota.tela === 'dados' || i.rota.tela === 'secretarias'));
  setor.forEach((i) => assert.equal(hash(GC.rotaDoPerfil(i.rota, SAUDE)), hash(i.rota), `item ${i.nome} abre sem redirecionar`));
  const cid = GC.menuDoPerfil(base, CIDADAO);
  assert.deepEqual([...cid.map((i) => i.rota.tela)], ['cidadao', 'painel']);
  // Indicadores saíram do menu de todos os perfis: a porta única é a gaveta da doca.
  assert.ok(![...setor, ...cid].some((i) => i.rota.tela === 'indicadores'));
});

test('widgets do setor: gerais + os da pasta', () => {
  const todos = GC.WIDGETS ? GC.WIDGETS.map((w) => w.id) : ['numeros', 'leitos', 'seguranca', 'obras', 'social', 'desempenho'];
  const saude = GC.widgetsDoPerfil(['numeros', 'leitos', 'seguranca', 'obras', 'social', 'desempenho'], SAUDE);
  assert.deepEqual([...saude], ['numeros', 'leitos', 'social', 'desempenho']);
  assert.deepEqual([...GC.widgetsDoPerfil(['seguranca'], { id: 'setor', area: 'seguranca' })], ['seguranca']);
  assert.equal(GC.widgetsDoPerfil(todos, PREFEITO), todos);
  assert.equal(GC.vistaDoSetor('mobilidade'), 'frota');
});

test('indicadores públicos: os internos ficam de fora para o cidadão', () => {
  const ctx = GC.contextoIndicadores(GC.criarStore(GC.data));
  const pub = GC.avaliarIndicadores(ctx, { publico: true }).map((i) => i.id);
  for (const id of ['GAB01', 'DEF02', 'SOC01', 'SOC02']) assert.ok(!pub.includes(id), id);
  assert.ok(pub.includes('SAU03') && pub.includes('SEG01'));
  assert.equal(GC.indicadorPublico('SOC01'), false);
  assert.equal(GC.indicadorPublico('SAU01'), true);
});

test('"Para você": avisos, meu bairro e perguntas sem nada interno', () => {
  const store = GC.criarStore(GC.data);
  const c = GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), comunicados: [{ t: 1, titulo: 'Comunicado', texto: 'Evite a Rua XV.' }], bairro: 'vila_nova' });
  assert.equal(c.avisos[0].tipo, 'comunicado');
  assert.ok(c.avisos.some((a) => a.tipo === 'risco'), 'aviso de risco de chuva');
  assert.ok(c.avisos.some((a) => a.tipo === 'evite'), 'ocorrência que pede evitar a região');
  assert.equal(c.meuBairro.id, 'vila_nova');
  assert.ok(c.meuBairro.itens.some((i) => i.titulo === 'Coleta de lixo'));
  assert.ok(c.faq.length >= 7);
  const tudo = JSON.stringify(c);
  for (const interno of ['prazo estourado', 'Cobrar', 'responsável:', 'regra', 'CadÚnico', 'violência']) assert.ok(!tudo.includes(interno), interno);
  const busca = GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), busca: 'creche' });
  assert.equal(busca.faq.length, 1);
  assert.match(busca.faq[0].pergunta, /creche/);
  assert.equal(GC.conteudoCidadao({ ocorrencias: [], bairro: 'nao-existe' }).meuBairro.id, 'centro');
});

test('portal do cidadão: avisos agrupados, com nível escrito, e o bairro do morador primeiro', () => {
  const store = GC.criarStore(GC.data);
  const c = GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), comunicados: [{ t: 1, titulo: 'Comunicado', texto: 'Evite a Rua XV.', bairroId: 'centro' }], bairro: 'centro' });
  assert.equal(c.avisos[0].tipo, 'comunicado', 'comunicado oficial sempre no topo');
  c.avisos.forEach((a) => assert.ok(GC.NIVEIS_AVISO[a.nivel], `nível de ${a.titulo}`));
  const tipos = c.avisos.filter((a) => a.tipo === 'evite').map((a) => a.id);
  assert.equal(new Set(tipos).size, tipos.length, 'um aviso por tipo de ocorrência');
  const alag = c.avisos.find((a) => a.id === 'evite-alagamento');
  if (alag && alag.pontos.length > 1) assert.equal(alag.locais.length, alag.pontos.length);
  const outros = c.avisos.filter((a) => a.tipo !== 'comunicado');
  const primeiroDeFora = outros.findIndex((a) => !a.doMeuBairro);
  assert.ok(outros.slice(primeiroDeFora < 0 ? outros.length : primeiroDeFora).every((a) => !a.doMeuBairro), 'os do bairro vêm antes');
  assert.ok(c.hoje.length >= 2 && c.hoje.every((h) => h.icone && h.texto));
  assert.equal(c.meuBairro.escolhido, true);
  assert.equal(GC.conteudoCidadao({ ocorrencias: [] }).meuBairro.escolhido, false, 'sem bairro salvo: o portal pergunta');
});

test('mapa do cidadão: só pontos públicos (sem prazo, responsável ou ocorrência interna)', () => {
  const store = GC.criarStore(GC.data);
  const pontos = GC.pontosMapaCidadao(GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), bairro: 'centro' }));
  assert.ok(pontos.length > 5);
  pontos.forEach((p) => {
    assert.ok(['avisos', 'saude', 'escolas', 'obras'].includes(p.camada), p.id);
    assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lng), p.id);
  });
  const tudo = JSON.stringify(pontos);
  for (const interno of ['Roubo', 'B.O', 'prazo', 'responsavel', 'Comandante', 'ocupad']) assert.ok(!tudo.includes(interno), interno);
});

test('portal do cidadão: bairro pela localização, busca única e texto para compartilhar', () => {
  const b = GC.data.bairros.find((x) => x.id === 'vila_nova');
  assert.equal(GC.bairroDoPonto(b.centro[0], b.centro[1]), 'vila_nova');
  assert.equal(GC.bairroDoPonto(-23.55, -46.63), null, 'fora da cidade');

  const store = GC.criarStore(GC.data);
  const c = GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), bairro: 'centro' });
  assert.deepEqual([...GC.buscaCidadao(c, 'c')], [], 'uma letra só: nada');
  const creche = GC.buscaCidadao(c, 'CRECHE');
  assert.ok(creche.some((r) => r.tipo === 'pergunta'), 'acha a pergunta sem ligar para maiúsculas');
  const vila = GC.buscaCidadao(c, 'vila nova');
  assert.equal(vila[0].tipo, 'bairro');
  assert.equal(vila[0].alvo, 'vila_nova');
  assert.ok(GC.buscaCidadao(c, '199').some((r) => r.tipo === 'contato' && r.alvo === '199'));
  assert.ok(GC.buscaCidadao(c, 'alagamento').some((r) => r.tipo === 'aviso'));
  assert.ok(GC.buscaCidadao(c, 'poste').some((r) => r.tipo === 'servico'));

  const texto = GC.textoCompartilharAviso(c.avisos.find((a) => a.tipo !== 'comunicado'), 'Vila Dourada');
  assert.match(texto, /Prefeitura de Vila Dourada/);
  assert.match(texto, /199/);
});

test('cada perfil tem a sua página: cidadão no portal, gestores no painel (a cidade vai junto)', () => {
  const base = 'http://x/pasta/index.html?cidade=grande&perfil=prefeito#/alertas';
  assert.equal(GC.urlDoPerfil('cidadao', null, base), 'http://x/pasta/cidadao.html?cidade=grande&perfil=cidadao');
  assert.equal(GC.urlDoPerfil('setor', 'saude', 'http://x/pasta/cidadao.html?cidade=grande&perfil=cidadao#/mapa'), 'http://x/pasta/index.html?cidade=grande&perfil=setor&area=saude');
  assert.equal(GC.urlDoPerfil('prefeito', null, 'http://x/cidadao.html'), 'http://x/index.html?perfil=prefeito');
});

test('Copiloto: cada tema diz de que secretaria é (o setor só vê os da pasta)', () => {
  assert.deepEqual([...GC.ia.areasDoTema('leitos')], ['saude']);
  assert.ok(GC.ia.areasDoTema('desempenho').length === GC.data.areas.length, 'tema geral serve a todas as pastas');
  assert.equal(GC.ia.areasDoTema('fallback'), null);
});

test('camadas do gestor do setor: públicas + as da pasta (B.O.s só para a Segurança)', () => {
  const SEG = { id: 'setor', area: 'seguranca' };
  assert.equal(GC.camadasDoPerfil(PREFEITO), null, 'gestor geral vê todas');
  assert.ok(GC.podeCamada('toggle-calor-bo', PREFEITO));
  assert.ok(!GC.podeCamada('toggle-calor-bo', SAUDE), 'Saúde não vê B.O.s');
  assert.ok(GC.podeCamada('toggle-calor-bo', SEG));
  assert.ok(GC.podeCamada('toggle-leitos', SAUDE) && GC.podeCamada('toggle-farmacias', SAUDE) && GC.podeCamada('toggle-frota', SAUDE));
  assert.ok(!GC.podeCamada('toggle-leitos', SEG) && !GC.podeCamada('toggle-farmacias', SEG) && !GC.podeCamada('toggle-frota', SEG));
  GC.CAMADAS_PUBLICAS.forEach((c) => assert.ok(GC.podeCamada(c, SEG), `${c} é contexto público`));
});

test('visualizações prontas do setor: a da pasta e "Críticas agora"', () => {
  assert.equal(GC.vistasProntasDoPerfil(PREFEITO), null);
  assert.deepEqual([...GC.vistasProntasDoPerfil(SAUDE)], ['saude', 'criticas']);
  assert.deepEqual([...GC.vistasProntasDoPerfil({ id: 'setor', area: 'infraestrutura' })], ['chuva', 'criticas']);
});

test('ocorrência do perfil: a da pasta ou em que a pasta está envolvida', () => {
  const daSaude = { area: 'saude', areasEnvolvidas: ['saude'] };
  const conjunta = { area: 'defesa_civil', areasEnvolvidas: ['defesa_civil', 'saude'] };
  const outra = { area: 'limpeza', areasEnvolvidas: ['limpeza'] };
  assert.ok(GC.ocorrenciaDoPerfil(daSaude, SAUDE));
  assert.ok(GC.ocorrenciaDoPerfil(conjunta, SAUDE));
  assert.ok(!GC.ocorrenciaDoPerfil(outra, SAUDE));
  assert.ok(GC.ocorrenciaDoPerfil(outra, PREFEITO));
});

test('busca do setor: só ocorrências, secretaria, telas e camadas da pasta', () => {
  const itens = [
    { tipo: 'bairro', id: 'centro' },
    { tipo: 'ocorrencia', id: 'o1', area: 'saude', areas: ['saude'] },
    { tipo: 'ocorrencia', id: 'o2', area: 'limpeza', areas: ['limpeza'] },
    { tipo: 'ocorrencia', id: 'o3', area: 'defesa_civil', areas: ['defesa_civil', 'saude'] },
    { tipo: 'secretaria', id: 'saude' }, { tipo: 'secretaria', id: 'seguranca' },
    { tipo: 'tela', id: 'alertas' }, { tipo: 'tela', id: 'dados' }, { tipo: 'tela', id: 'secretarias' },
    { tipo: 'leito', id: 'l1' }, { tipo: 'linha', id: 'b1' }, { tipo: 'escola', id: 'e1' },
  ];
  const ids = (p) => GC.filtrarBuscaDoPerfil(itens, p).map((i) => `${i.tipo}:${i.id}`);
  assert.equal(GC.filtrarBuscaDoPerfil(itens, PREFEITO).length, itens.length);
  assert.deepEqual(ids(SAUDE), ['bairro:centro', 'ocorrencia:o1', 'ocorrencia:o3', 'secretaria:saude', 'tela:alertas', 'leito:l1', 'linha:b1', 'escola:e1']);
  assert.deepEqual(ids({ id: 'setor', area: 'educacao' }), ['bairro:centro', 'tela:alertas', 'escola:e1']);
});
