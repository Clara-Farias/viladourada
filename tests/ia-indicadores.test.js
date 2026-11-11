const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

// O Copiloto com os indicadores do workshop carregados (como no index.html).
const ARQUIVOS = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'cidade.js', 'data-secretarias.js', 'store.js', 'contrato.js', 'ia-roteiro.js'];
const carregarCidade = (cidade) => carregar(cidade ? { cidade } : {}, ...ARQUIVOS);
const GC = carregarCidade();
const ctx = () => ({ area: null, ocorrencias: GC.criarStore(GC.data).ocorrencias() });
const perguntar = (p) => GC.ia.perguntar(p, ctx());

const EXEMPLOS = {
  leitos: ['Como estão os leitos de UTI?', 'tem vaga no hospital?', 'internação'],
  risco: ['Onde vai alagar nas próximas horas?', 'qual a previsão de chuva?', 'risco de deslizamento'],
  obras: ['Quais obras estão atrasadas?', 'tem obra paralisada?'],
  violencia: ['violência contra a mulher', 'como estão os casos de violência contra crianças?'],
  educacao: ['Onde faltam professores?', 'como está a alfabetização?', 'evasão escolar'],
  frota: ['Quantos ônibus e ambulâncias estão rodando?', 'como está a frota do SAMU?', 'espera no ponto de ônibus'],
  mobilidade: ['Onde está o trânsito crítico?'],
  medicamentos: ['Vai faltar algum medicamento?', 'como está o estoque de insulina?', 'tem remédio na farmácia da UBS?'],
  limpeza: ['Quando passa o caminhão de lixo no Centro?', 'a coleta de lixo está atrasada?', 'quando passam os recicláveis na Vila Nova?'],
  // Os temas antigos continuam respondendo as mesmas perguntas.
  alagamento: ['Onde mais alaga este mês?'],
  seguranca: ['Como evoluiu a criminalidade?'],
  saude: ['Como está a lotação das UBS?'],
  desempenho: ['Quem está atrasando os prazos?'],
};

test('cada pergunta cai no tema certo e a resposta passa no contrato', () => {
  for (const [id, perguntas] of Object.entries(EXEMPLOS)) {
    for (const p of perguntas) {
      const r = perguntar(p);
      assert.equal(r.cenario, id, p);
      assert.deepEqual([...GC.validarResposta(r)], [], `${p}: ${GC.validarResposta(r).join('; ')}`);
    }
  }
});

test('sugestões começam pelos indicadores novos e todas têm resposta', () => {
  assert.deepEqual([...GC.ia.sugestoes.slice(0, 4)], ['Como estão os leitos de UTI?', 'Onde vai alagar nas próximas horas?', 'Quais obras estão atrasadas?', 'Onde faltam professores?']);
  for (const s of GC.ia.sugestoes) assert.notEqual(perguntar(s).cenario, 'fallback', s);
});

test('leitos: cita UTI do Hospital Municipal, sugere transferência e liga a camada', () => {
  const r = perguntar('Como estão os leitos de UTI?');
  assert.match(r.texto, /79% dos leitos ocupados/);
  assert.match(r.texto, /Hospital Municipal: UTI com 95%/);
  // Para o mesmo tipo de UTI (adulto): o Hospital Regional, nunca a UTI neonatal da maternidade.
  assert.match(r.texto, /transferir pacientes para Hospital Regional Lagoa Azul, que tem 2 vaga\(s\) de UTI adulto/);
  assert.deepEqual({ ...r.acoes[0].payload }, { camada: 'leitos', id: 'hm' });
  assert.ok(r.acoes.some((a) => a.tipo === 'focarOcorrencia' && a.payload.ocorrenciaId === 'oc-13'));
  assert.ok(r.acoes.some((a) => a.tipo === 'criarAlerta'));
});

test('risco: alerta preventivo no Morro da Vila Nova', () => {
  const r = perguntar('Onde vai alagar nas próximas horas?');
  assert.match(r.texto, /48 mm de chuva nas próximas 24 h/);
  assert.match(r.texto, /Morro da Vila Nova, risco de deslizamento em ~6 h/);
  assert.deepEqual({ ...r.acoes[0].payload }, { camada: 'risco', id: 'morro-vila-nova' });
});

test('obras: 6 atrasadas, CMEI parado e pagamento à frente', () => {
  const r = perguntar('Quais obras estão atrasadas?');
  assert.match(r.texto, /^6 de 10 obras/);
  assert.match(r.texto, /CMEI Vila Nova · ampliação \(120 vagas\) está parada há 77 dias/);
  assert.match(r.texto, /já se pagou bem mais do que foi feito/);
  assert.deepEqual({ ...r.acoes[0].payload }, { camada: 'obras', id: 'cmei-vn' });
});

test('violência contra mulheres e crianças: só números por bairro, sem pontos no mapa', () => {
  const r = perguntar('violência contra a mulher');
  assert.match(r.texto, /108 casos/); // média com os bairros novos em volta (js/cidade.js)
  assert.match(r.texto, /nunca endereços/);
  assert.equal(r.mapa.tipo, 'destaque');
  assert.deepEqual([...r.mapa.bairros], ['vila_nova', 'centro', 'lagoa_azul']);
});

test('educação: professores faltando, escola mais grave e escolaridade', () => {
  const r = perguntar('Onde faltam professores?');
  assert.match(r.texto, /faltam 15 professores \(300 aulas perdidas por semana\)/);
  assert.match(r.texto, /mais grave é na Escola Lagoa Azul/);
  assert.match(r.texto, /concluíram o ensino médio/);
  assert.deepEqual({ ...r.acoes[0].payload }, { camada: 'escolas', id: 'emef-lagoa' });
});

test('segurança: B.O.s de hoje e ação de ligar o calor', () => {
  const r = perguntar('Como evoluiu a criminalidade?');
  assert.match(r.texto, /Hoje já são 24 B\.O\.s/);
  assert.ok(r.acoes.some((a) => a.tipo === 'abrirCamada' && a.payload.camada === 'calor-bo'));
});

test('frota: abaixo do contrato, Linha 102 e SAMU acima da meta', () => {
  const r = perguntar('Quantos ônibus e ambulâncias estão rodando?');
  assert.ok(r.texto.startsWith('Hoje rodam 96 de 104 ônibus necessários (92%, meta do contrato 95%) e 10 de 12 ambulâncias'), r.texto);
  assert.ok(r.texto.includes('cabe notificar, com multa estimada de R$ 72 mil'), r.texto);
  assert.ok(r.texto.includes('tempo de resposta de 14 min (meta 12)'), r.texto);
  assert.match(r.texto, /Linha 102 · Jardim das Flores – Centro: 27 min, para 12 programados/);
  assert.deepEqual({ ...r.acoes[0].payload }, { camada: 'frota', id: '102' });
  assert.ok(r.acoes.some((a) => a.tipo === 'focarOcorrencia' && a.payload.ocorrenciaId === 'oc-21'));
});

test('coleta: sem bairro, situação das rotas; com bairro, o calendário dele', () => {
  const geral = perguntar('a coleta de lixo está atrasada?');
  assert.ok(geral.texto.includes('A Rota Porto e Parque Industrial está atrasada'), geral.texto);
  assert.ok(geral.texto.includes('89% das coletas saíram no prazo'), geral.texto);
  assert.deepEqual({ ...geral.acoes[0].payload }, { camada: 'coleta', id: 'rota-porto' });
  assert.ok(geral.acoes.some((a) => a.tipo === 'focarOcorrencia' && a.payload.ocorrenciaId === 'oc-22'));
  const centro = perguntar('Quando passa o caminhão de lixo no Centro?');
  assert.ok(centro.texto.startsWith('No Centro, o lixo comum é recolhido de segunda a sábado, das 19h às 01h'), centro.texto);
  assert.ok(centro.texto.includes('Os recicláveis passam quinta'), centro.texto);
  assert.ok(centro.texto.includes('A próxima passagem é hoje'), centro.texto);
  const porto = perguntar('quando passa o lixo no Porto Dourado?');
  assert.ok(porto.texto.includes('a coleta está atrasada (caminhão quebrado'), porto.texto);
  assert.deepEqual({ ...centro.acoes[0].payload }, { camada: 'coleta', id: 'centro' });
});

test('medicamentos: faltas de hoje, previsão da IA, remanejamento antes de comprar', () => {
  const r = perguntar('Vai faltar algum medicamento?');
  assert.ok(r.texto.startsWith('Hoje faltam 3 itens nas UBS'), r.texto);
  assert.ok(r.texto.includes('Losartana 50 mg na UBS Central'), r.texto);
  assert.ok(r.texto.includes('Insulina NPH (~17 dias; o pedido só chega em 20 dias)'), r.texto);
  assert.ok(r.texto.includes('casos suspeitos de dengue em alta na Lagoa Azul'), r.texto);
  assert.ok(r.texto.includes('remanejar 4.320 de Losartana 50 mg da UBS Bela Vista para a UBS Central'), r.texto);
  assert.equal(r.acoes[0].payload.camada, 'farmacias');
  assert.equal(perguntar('falta de médico na UBS').cenario, 'saude'); // médico continua sendo saúde
});

test('contrato: abrirCamada só com camada conhecida', () => {
  const ok = { texto: 'x', acoes: [{ rotulo: 'a', tipo: 'abrirCamada', payload: { camada: 'leitos', id: 'hm' } }] };
  const ruim = { texto: 'x', acoes: [{ rotulo: 'a', tipo: 'abrirCamada', payload: { camada: 'piscinas' } }] };
  assert.deepEqual([...GC.validarResposta(ok)], []);
  assert.equal(GC.validarResposta(ruim).length, 1);
  assert.equal(GC.sanearResposta(ruim).acoes, undefined);
});

for (const cidade of ['pequena', 'grande']) {
  test(`${cidade}: todas as sugestões e temas novos respondem dentro do contrato`, () => {
    const G = carregarCidade(cidade);
    const c = { area: null, ocorrencias: G.criarStore(G.data).ocorrencias() };
    for (const p of [...G.ia.sugestoes, 'violência contra a mulher', 'como estão as escolas?']) {
      const r = G.ia.perguntar(p, c);
      assert.notEqual(r.cenario, 'fallback', p);
      assert.deepEqual([...G.validarResposta(r)], [], `${p}: ${G.validarResposta(r).join('; ')}`);
    }
  });
}
