const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

// "De onde veio": cada resposta diz quantos registros leu, o período e a hora de referência.
const ARQUIVOS = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-secretarias.js', 'store.js', 'contrato.js', 'ia-roteiro.js'];
const GC = carregar(...ARQUIVOS);
const store = GC.criarStore(GC.data);
const ctx = () => ({ area: null, ocorrencias: store.ocorrencias(), desempenho: store.desempenho(null) });

const PERGUNTAS = {
  leitos: 'Como estão os leitos de UTI?', risco: 'Onde vai alagar nas próximas horas?', obras: 'Quais obras estão atrasadas?',
  violencia: 'violência contra a mulher', educacao: 'Onde faltam professores?', frota: 'Quantos ônibus e ambulâncias estão rodando?',
  medicamentos: 'Vai faltar algum medicamento?', limpeza: 'a coleta de lixo está atrasada?', alagamento: 'Onde mais alaga este mês?',
  seguranca: 'Como evoluiu a criminalidade?', saude: 'Como está a lotação das UBS?', satisfacao: 'Como está a satisfação por bairro?',
  desempenho: 'Quem está atrasando os prazos?', resumo: 'Resumo da semana',
  social: 'Como evoluíram as faltas em consultas depois dos lembretes por WhatsApp?',
};

test('toda resposta de tema tem base consultada válida, que passa no contrato', () => {
  for (const [tema, p] of Object.entries(PERGUNTAS)) {
    const r = GC.ia.perguntar(p, ctx());
    assert.equal(r.cenario, tema, p);
    assert.ok(r.base, `${tema} sem base`);
    assert.ok(Number.isInteger(r.base.registros) && r.base.registros > 0, `${tema}: ${r.base.registros}`);
    assert.ok(r.base.periodo && r.base.referencia, tema);
    assert.deepEqual([...GC.validarResposta(r)], [], tema);
    assert.ok(GC.sanearResposta(r).base, `${tema}: o saneamento manteve a base`);
  }
});

test('os registros saem dos dados da resposta (não são decorativos)', () => {
  const v = GC.ia.perguntar(PERGUNTAS.violencia, ctx());
  assert.equal(v.base.registros, GC.seguranca.resumo().violencia.mes);
  const a = GC.ia.perguntar(PERGUNTAS.alagamento, ctx());
  assert.equal(a.base.registros, Object.values(GC.data.historico30d.defesa_civil).reduce((s, n) => s + n, 0));
  const f = GC.ia.perguntar(PERGUNTAS.frota, ctx());
  assert.equal(f.base.registros, GC.frota.resumo().onibus.total + GC.frota.resumo().ambulancias.total);
});

test('pergunta sobre um alerta também diz a base (casos do bairro em 30 dias)', () => {
  const o = store.ocorrencias()[0];
  const r = GC.ia.perguntar('Me explique o alerta', Object.assign(ctx(), { ocorrenciaFoco: o.id }));
  assert.equal(r.cenario, 'ocorrencia');
  assert.equal(r.base.registros, ((GC.data.historico30d[o.area] || {})[o.bairroId] || 0) + 1);
  assert.deepEqual([...GC.validarResposta(r)], []);
});

test('contrato: base malformada é descartada, o resto da resposta fica', () => {
  const ruins = [{ registros: -1, periodo: '30 dias', referencia: 'agora' }, { registros: 1.5, periodo: 'x', referencia: 'y' },
    { registros: 3, periodo: '', referencia: 'y' }, { registros: 3, periodo: 'x'.repeat(61), referencia: 'y' }, 'base'];
  for (const base of ruins) {
    assert.ok(GC.validarResposta({ texto: 'oi', base }).includes('base inválida'));
    const s = GC.sanearResposta({ texto: 'oi', base });
    assert.equal(s.texto, 'oi');
    assert.equal(s.base, undefined);
  }
});

test('fallback (pergunta fora do roteiro) não inventa base', () => {
  const r = GC.ia.perguntar('qual a capital da França?', ctx());
  assert.equal(r.cenario, 'fallback');
  assert.equal(r.base, undefined);
});
