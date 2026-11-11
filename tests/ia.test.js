const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'store.js', 'contrato.js', 'ia-roteiro.js');
const ctx = () => ({ area: null, ocorrencias: GC.criarStore(GC.data).ocorrencias() });
const ocorrencia = (id) => GC.data.ocorrencias.find((o) => o.id === id);

const EXEMPLOS = {
  alagamento: 'Onde mais alaga este mês?',
  energia: 'Quais bairros têm mais falta de energia?',
  saude: 'Como está a lotação das UBS hoje?',
  seguranca: 'Como evoluiu a criminalidade?',
  mobilidade: 'Onde está o trânsito crítico?',
  educacao: 'Como está a frequência nas escolas?',
  limpeza: 'Onde a coleta de lixo está atrasada?',
  resumo: 'Me dá o resumo da semana',
};

test('cada cenário do roteiro devolve resposta válida', () => {
  for (const [id, pergunta] of Object.entries(EXEMPLOS)) {
    const r = GC.ia.perguntar(pergunta, ctx());
    assert.deepEqual([...GC.validarResposta(r)], [], `${id}: ${GC.validarResposta(r).join('; ')}`);
    assert.equal(r.cenario, id, pergunta);
  }
});

test('casa sem acento e em maiúsculas', () => {
  assert.equal(GC.ia.perguntar('ONDE MAIS ALAGA?', ctx()).cenario, 'alagamento');
  assert.equal(GC.ia.perguntar('teve apagao?', ctx()).cenario, 'energia');
  assert.equal(GC.ia.perguntar('SAÚDE', ctx()).cenario, 'saude');
});

test("pergunta vazia ou fora do roteiro devolve fallback com ações 'perguntar'", () => {
  for (const p of ['   ', '', 'qual a cor do céu']) {
    const r = GC.ia.perguntar(p, ctx());
    assert.equal(r.cenario, 'fallback');
    assert.deepEqual([...GC.validarResposta(r)], []);
    assert.equal(r.acoes.length, 3); // só 3 sugestões: não vira um paredão de botões
    assert.ok(r.acoes.every((a) => a.tipo === 'perguntar' && a.payload.texto));
  }
});

test('cumprimento responde com o quadro do momento, não com o fallback', () => {
  for (const p of ['Bom dia', 'oi, tudo bem?', 'Boa noite, Copiloto']) {
    const r = GC.ia.perguntar(p, ctx());
    assert.equal(r.cenario, 'saudacao', p);
    assert.deepEqual([...GC.validarResposta(r)], []);
    assert.match(r.texto, /ocorrência/);
    assert.ok(r.acoes.length >= 2 && r.acoes.length <= 3);
  }
  // Gestor de uma secretaria: o quadro e a mais urgente são só da pasta dele.
  const c = ctx();
  const saude = GC.ia.perguntar('Bom dia', Object.assign(c, { areasPerfil: ['saude'] }));
  const n = c.ocorrencias.filter((o) => o.area === 'saude').length;
  assert.match(saude.texto, new RegExp(`Há ${n} ocorrência`));
  const foco = saude.acoes.find((a) => a.tipo === 'focarOcorrencia');
  if (foco) assert.equal(c.ocorrencias.find((o) => o.id === foco.payload.ocorrenciaId).area, 'saude');
  // Cumprimento junto com um tema responde o tema.
  assert.equal(GC.ia.perguntar('Bom dia, onde mais alaga?', ctx()).cenario, 'alagamento');
});

test('dados do gráfico de alagamento batem com historico30d', () => {
  const r = GC.ia.perguntar('alagamento', ctx());
  const hist = GC.data.historico30d.defesa_civil;
  r.grafico.rotulos.forEach((rot, i) => {
    const b = GC.data.bairros.find((x) => x.nome === rot);
    assert.equal(r.grafico.series[0].valores[i], hist[b.id], rot);
  });
  assert.equal(r.mapa.tipo, 'calor');
});

test("aoEvento 'acao' de alagamento no Centro cita '4º'", () => {
  const r = GC.ia.aoEvento({ tipo: 'acao', ocorrencia: ocorrencia('oc-01') }, ctx());
  assert.equal(r.cenario, 'evento_acao');
  assert.match(r.texto, /4º/);
  assert.match(r.texto, /Centro/);
  assert.deepEqual([...GC.validarResposta(r)], []);
  assert.equal(r.acoes[0].tipo, 'mostrarMapa');
});

test("aoEvento 'acao' sem histórico ≥2 retorna null", () => {
  // oc-05: defesa_civil em porto_dourado, histórico 1
  assert.equal(GC.ia.aoEvento({ tipo: 'acao', ocorrencia: ocorrencia('oc-05') }, ctx()), null);
});

test("aoEvento 'status' retorna null", () => {
  assert.equal(GC.ia.aoEvento({ tipo: 'status', ocorrencia: ocorrencia('oc-01') }, ctx()), null);
});

test("aoEvento 'nova' fala em encaminhado e oferece priorizar", () => {
  const extra = GC.data.ocorrenciasExtras[0];
  const r = GC.ia.aoEvento({ tipo: 'nova', ocorrencia: extra }, ctx());
  assert.deepEqual([...GC.validarResposta(r)], []);
  assert.match(r.texto, /Já encaminhado à .+ \(prazo 2 h\)/);
  assert.equal(r.acoes[0].tipo, 'agir');
  assert.equal(r.acoes[0].payload.acao, 'priorizar');
  assert.equal(r.acoes[0].payload.ocorrenciaId, extra.id);
  assert.ok(r.acoes.some((a) => a.tipo === 'focarOcorrencia'));
});

test('validarResposta acusa valores.length diferente de rotulos.length', () => {
  const erros = GC.validarResposta({
    texto: 'x',
    grafico: { tipo: 'barra', titulo: 't', rotulos: ['a', 'b'], series: [{ nome: 's', valores: [1] }] },
  });
  assert.ok(erros.length > 0);
});

test('validarResposta acusa texto vazio, tipo de mapa e bairro inválidos', () => {
  assert.ok(GC.validarResposta({ texto: '' }).length > 0);
  assert.ok(GC.validarResposta({ texto: 'x', mapa: { tipo: 'outro' } }).length > 0);
  assert.ok(GC.validarResposta({ texto: 'x', mapa: { tipo: 'destaque', bairros: ['atlantida'] } }).length > 0);
  assert.ok(GC.validarResposta({ texto: 'x', acoes: [{ rotulo: 'a', tipo: 'voar', payload: {} }] }).length > 0);
});

test('normalizar remove acentos, caixa e espaços extras', () => {
  assert.equal(GC.ia.normalizar('  Ônibus   ATRASADO  '), 'onibus atrasado');
});

// ---- correções da revisão final ----
const semOcorrencia = (id) => ({ area: null, ocorrencias: GC.criarStore(GC.data).ocorrencias().filter((o) => o.id !== id) });

test('mobilidade não cita semáforo apagado depois que ele foi resolvido', () => {
  const com = GC.ia.perguntar('trânsito', ctx());
  assert.match(com.texto, /Semáforo apagado/i);
  const sem = GC.ia.perguntar('trânsito', semOcorrencia('oc-19'));
  assert.doesNotMatch(sem.texto, /semáforo apagado/i);
});

test('rótulo de ação focar descreve a ocorrência realmente escolhida', () => {
  const r = GC.ia.perguntar('criminalidade', semOcorrencia('oc-17'));
  const ac = r.acoes.find((a) => a.tipo === 'focarOcorrencia');
  const alvo = GC.data.ocorrencias.find((o) => o.id === ac.payload.ocorrenciaId);
  assert.ok(ac.rotulo.includes(alvo.titulo), ac.rotulo);
  assert.doesNotMatch(ac.rotulo, /Praça Central/);
});

test('educação e limpeza não citam ocorrência ativa que já não existe', () => {
  assert.doesNotMatch(GC.ia.perguntar('escola', semOcorrencia('oc-15')).texto, /falta de água/);
  assert.doesNotMatch(GC.ia.perguntar('coleta de lixo', semOcorrencia('oc-22')).texto, /3 dias/);
});

test('sanearResposta completa mostrarMapa sem payload com o mapa da resposta', () => {
  const mapa = { tipo: 'destaque', bairros: ['centro'] };
  const r = GC.sanearResposta({ texto: 'x', mapa, acoes: [{ rotulo: 'Ver', tipo: 'mostrarMapa' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(r.acoes[0].payload.mapa)), mapa);
});

test('sanearResposta descarta partes inválidas e mantém o texto', () => {
  const r = GC.sanearResposta({
    texto: 'ok',
    grafico: { tipo: 'barra', titulo: 't', rotulos: ['a'] },
    mapa: { tipo: 'calor' },
    acoes: [{ rotulo: 'a', tipo: 'voar' }, { rotulo: 'b', tipo: 'perguntar', payload: { texto: 'oi' } }],
  });
  assert.equal(r.texto, 'ok');
  assert.equal(r.grafico, undefined);
  assert.equal(r.mapa, undefined);
  assert.equal(r.acoes.length, 1);
  assert.deepEqual([...GC.validarResposta(r)], []);
});

test('sanearResposta transforma resposta inutilizável em texto de erro', () => {
  for (const ruim of [null, undefined, {}, { texto: '' }, 'texto solto']) {
    const r = GC.sanearResposta(ruim);
    assert.deepEqual([...GC.validarResposta(r)], [], String(ruim));
  }
});

test('escaparHtml neutraliza tags', () => {
  assert.equal(GC.escaparHtml('<img src=x onerror=alert(1)> & "a"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;a&quot;');
});

// ---- v2: fontes e pergunta sobre um alerta ----
test('cenários do roteiro trazem fontes e confiabilidade válidas', () => {
  for (const [id, pergunta] of Object.entries(EXEMPLOS)) {
    const r = GC.ia.perguntar(pergunta, ctx());
    assert.ok(Array.isArray(r.fontes) && r.fontes.length >= 1, `${id}: fontes`);
    assert.ok(['alta', 'media', 'baixa'].includes(r.confiabilidade.nivel), `${id}: confiabilidade`);
    assert.equal(typeof r.consulta, 'string', `${id}: consulta`);
    assert.deepEqual([...GC.validarResposta(r)], [], `${id}: ${GC.validarResposta(r).join('; ')}`);
  }
});

test('fallback não tem fontes', () => {
  assert.equal(GC.ia.perguntar('qual a cor do céu', ctx()).fontes, undefined);
});

test('pergunta sobre alerta usa a ocorrência em foco', () => {
  const r = GC.ia.perguntar('Me explique este alerta', Object.assign(ctx(), { ocorrenciaFoco: 'oc-01' }));
  assert.equal(r.cenario, 'ocorrencia');
  assert.ok(r.texto.includes('Alagamento na Rua XV de Novembro'), r.texto);
  assert.ok(r.texto.includes('4 casos de Defesa Civil'), r.texto);
  assert.ok(r.fontes.length >= 1);
  assert.deepEqual([...GC.validarResposta(r)], []);
  assert.deepEqual([...r.acoes.filter((a) => a.tipo === 'agir').map((a) => a.payload.acao)], ['gabinete', 'priorizar']);
  assert.ok(r.acoes.every((a) => a.tipo !== 'agir' || a.payload.ocorrenciaId === 'oc-01'));
  assert.ok(r.acoes.some((a) => a.tipo === 'focarOcorrencia'));
});

test('sobreOcorrencia oferece cobrar quando o prazo estourou', () => {
  const r = GC.ia.perguntar('x', Object.assign(ctx(), { ocorrenciaFoco: 'oc-13' }));
  assert.deepEqual([...r.acoes.filter((a) => a.tipo === 'agir').map((a) => a.payload.acao)], ['cobrar', 'priorizar']);
  assert.match(r.acoes[0].rotulo, /^📣 Cobrar Secretaria de Saúde$/);
});

test('depois de agir, não oferece ação de novo', () => {
  const store = GC.criarStore(GC.data);
  store.agir('oc-01', 'gabinete');
  const r = GC.ia.perguntar('Me explique este alerta', { area: null, ocorrencias: store.ocorrencias(), ocorrenciaFoco: 'oc-01' });
  assert.equal(r.cenario, 'ocorrencia');
  assert.ok(!r.acoes.some((a) => a.tipo === 'agir'));
});

test('tema desempenho usa contexto.desempenho', () => {
  const store = GC.criarStore(GC.data);
  const r = GC.ia.perguntar('Quem está atrasando os prazos?', { desempenho: store.desempenho(null) });
  assert.equal(r.cenario, 'desempenho');
  assert.match(r.texto, /Infraestrutura/);
  assert.match(r.texto, /85%/);
  assert.equal(r.grafico.rotulos.length, 7);
  assert.equal(r.grafico.series[0].valores.length, 7);
  assert.ok(r.fontes.includes('gestao.prazos_sla'));
  assert.deepEqual([...GC.validarResposta(r)], []);
  assert.ok(GC.ia.sugestoes.includes('Quem está atrasando os prazos?'));
});

test('tema desempenho sem números no contexto', () => {
  const r = GC.ia.perguntar('como está o desempenho?', {});
  assert.equal(r.cenario, 'desempenho');
  assert.match(r.texto, /Ainda não tenho os números de desempenho/);
});

test('nenhuma resposta do roteiro usa acionarSecretaria', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'ia-roteiro.js'), 'utf8');
  assert.ok(!/acionarSecretaria|Acionar /.test(src));
});

test('ocorrenciaFoco desconhecida cai no roteiro normal', () => {
  assert.equal(GC.ia.perguntar('onde alaga', Object.assign(ctx(), { ocorrenciaFoco: 'oc-99' })).cenario, 'alagamento');
});

test('alerta já resolvido: responde sobre ele e avisa que foi resolvido', () => {
  const store = GC.criarStore(GC.data);
  store.avancar('oc-01');
  store.avancar('oc-01');
  const r = GC.ia.perguntar('Me explique este alerta', { area: null, ocorrencias: [...store.ocorrencias(), store.buscar('oc-01')], ocorrenciaFoco: 'oc-01' });
  assert.equal(r.cenario, 'ocorrencia');
  assert.ok(r.texto.includes('já foi resolvido'), r.texto);
  assert.ok(!r.acoes.some((a) => a.tipo === 'agir'));
});

test('satisfação: gráfico por bairro e destaque dos piores', () => {
  const r = GC.ia.perguntar('Como está a satisfação por bairro?', ctx());
  assert.equal(r.cenario, 'satisfacao');
  assert.deepEqual([...GC.validarResposta(r)], []);
  assert.equal(r.grafico.rotulos.length, 8);
  assert.deepEqual([...r.mapa.bairros], ['vila_nova', 'centro']);
  assert.ok(r.texto.includes('Vila Nova'));
  assert.ok(r.fontes.length >= 1);
});

test('temas de secretaria oferecem Transformar em alerta; satisfação e resumo não', () => {
  const r = GC.ia.perguntar('Onde mais alaga este mês?', ctx());
  const a = r.acoes.find((x) => x.tipo === 'criarAlerta');
  assert.equal(a.rotulo, '🔔 Transformar em alerta');
  assert.equal(a.payload.nome, 'Pergunta: Onde mais alaga este mês?');
  assert.equal(a.payload.area, 'defesa_civil');
  assert.ok(a.payload.fontes.length >= 1 && a.payload.expressao);
  assert.deepEqual([...GC.validarResposta(r)], []);
  for (const p of ['Como está a satisfação por bairro?', 'Me dá o resumo da semana']) {
    assert.ok(!(GC.ia.perguntar(p, ctx()).acoes || []).some((x) => x.tipo === 'criarAlerta'), p);
  }
  for (const [p, area] of [['Quais bairros têm mais falta de energia?', 'infraestrutura'], ['Como está a lotação das UBS?', 'saude'], ['Onde a coleta de lixo está atrasada?', 'limpeza']]) {
    assert.equal(GC.ia.perguntar(p, ctx()).acoes.find((x) => x.tipo === 'criarAlerta').payload.area, area, p);
  }
});
