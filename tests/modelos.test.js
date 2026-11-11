const test = require('node:test');
const assert = require('node:assert');
const { carregar } = require('./helpers/carregar');
const ARQ = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js',
  'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-gestao.js', 'data-secretarias.js', 'data-cruzamento.js', 'cruzamento.js',
  'store.js', 'contrato.js', 'ia-roteiro.js', 'relatorios.js', 'indicadores.js', 'gestao-config.js', 'estudio.js', 'tela-cidadao.js', 'modelos.js'];
const vazio = (x) => JSON.stringify(x, (k, v) => (typeof v === 'function' ? undefined : v)).match(/undefined|NaN|null,"?undefined/);

for (const cidade of ['pequena', 'media', 'grande']) {
  test(`${cidade}: cada pedido de exemplo cai no modelo certo e gera dados completos`, () => {
    const GC = carregar({ cidade }, ...ARQ);
    GC.storeAtual = GC.criarStore(GC.data);
    for (const m of GC.modelos.lista) {
      assert.equal((GC.modelos.identificar(m.exemplo) || {}).id, m.id, `pedido "${m.exemplo}"`);
      const r = GC.modelos.responder(m.exemplo);
      assert.ok(r && r.texto && !/undefined|NaN/.test(r.texto), `${m.id}: texto`);
      assert.ok(r.arquivos && r.arquivos.length, `${m.id}: arquivo para baixar`);
    }
  });
  test(`${cidade}: briefing funciona para todo bairro e a planilha tem as abas da base`, () => {
    const GC = carregar({ cidade }, ...ARQ);
    GC.storeAtual = GC.criarStore(GC.data);
    const b = GC.modelos.lista.find((m) => m.id === 'briefing');
    for (const x of GC.data.bairros) {
      const d = b.montar({ bairro: x.id });
      assert.ok(d.atencao.length >= 1 && d.b.nome === x.nome, x.id);
    }
    const ex = GC.modelos.lista.find((m) => m.id === 'excel').montar({ foco: 'Ocorrências' });
    assert.equal(ex.ordem[0], 'Ocorrências');
    for (const nome of ex.ordem) {
      assert.ok(ex.abas[nome].length > 1, nome);
      assert.ok(!ex.abas[nome].some((l) => l.some((c) => c === undefined || Number.isNaN(c))), `${nome}: célula vazia`);
    }
  });
}

test('pedidos com parâmetros: bairro, período, Word, tipo de gráfico', () => {
  const GC = carregar({ cidade: 'media' }, ...ARQ);
  GC.storeAtual = GC.criarStore(GC.data);
  const n = GC.modelos._norm;
  const br = GC.modelos.lista.find((m) => m.id === 'briefing').params(n('briefing para a visita ao bairro Jardim América amanhã'));
  assert.equal(br.bairro, 'jardim_america');
  const pc = GC.modelos.lista.find((m) => m.id === 'prestacao').params(n('prestação de contas do ano em word'));
  assert.deepEqual([pc.periodo, pc.word], ['12m', true]);
  const gr = GC.modelos.lista.find((m) => m.id === 'grafico').params(n('gráfico de barras da chuva nos últimos 6 meses'));
  assert.deepEqual([gr.ind, gr.meses, gr.tipo], ['chuva', 6, 'barra']);
  assert.ok(GC.modelos.responder('Quais modelos você gera?').texto.includes('Planilha Excel'));
});
