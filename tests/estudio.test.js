const test = require('node:test');
const assert = require('node:assert');
const { carregar } = require('./helpers/carregar');
const ARQ = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js',
  'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-gestao.js', 'data-secretarias.js', 'store.js', 'estudio.js'];
for (const cidade of ['pequena', 'media', 'grande']) {
  test(`${cidade}: todo modelo do Estúdio gera a imagem para todos os assuntos, com o número da tela`, () => {
    const GC = carregar({ cidade }, ...ARQ);
    const ctx = { store: GC.criarStore(GC.data) };
    for (const m of GC.MODELOS_ESTUDIO) {
      for (const a of m.alvos(ctx)) {
        const g = GC.gerarImagem(m.id, a.id, ctx);
        assert.ok(g.svg.startsWith('<svg') && g.svg.includes(GC.cidade.nome), `${m.id} ${a.id}`);
        assert.ok(!/undefined|NaN/.test(g.svg), `${m.id} ${a.id}: campo vazio`);
      }
    }
    const p = ctx.store.pulsos()[0];
    assert.ok(GC.gerarImagem('numero', p.area, ctx).svg.includes(p.nivel), 'o número do card é o mesmo do Pulso');
  });
}
