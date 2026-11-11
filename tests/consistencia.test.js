const test = require('node:test');
const assert = require('node:assert');
const { carregar } = require('./helpers/carregar');
const ARQ = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js',
  'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-gestao.js', 'data-secretarias.js', 'data-cruzamento.js', 'cruzamento.js',
  'store.js', 'contrato.js', 'ia-roteiro.js', 'relatorios.js', 'consistencia.js'];
for (const cidade of ['pequena', 'media', 'grande']) {
  test(`${cidade}: verificador de consistência sem divergências`, () => {
    const GC = carregar({ cidade }, ...ARQ);
    const r = GC.verificarConsistencia(GC.criarStore(GC.data));
    const ruins = [...r.checagens.filter((c) => !c.ok).map((c) => `${c.nome}: ${c.a} × ${c.b}`), ...r.proporcoes.filter((p) => !p.ok).map((p) => `${p.nome}: ${p.valor}`)];
    assert.deepEqual(ruins, []);
    assert.ok(r.checagens.length >= 10);
  });
}
