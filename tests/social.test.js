const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

// CadÚnico × Saúde × Escola (busca ativa), nas 3 cidades.
const ARQUIVOS = ['icones.js', 'data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-secretarias.js',
  'store.js', 'contrato.js', 'ia-roteiro.js', 'dados.js'];
const cidade = (c) => carregar({ cidade: c }, ...ARQUIVOS);

test('um registro por bairro, com os números encaixados (família ⊇ vulnerável ⊇ faltando ⊇ crianças)', () => {
  for (const c of ['pequena', 'media', 'grande']) {
    const GC = cidade(c);
    const r = GC.social.resumo();
    assert.equal(r.bairros.length, GC.data.bairros.length, c);
    for (const b of r.bairros) {
      assert.ok(b.familias > 0, `${c} ${b.id}`);
      assert.ok(b.vulneraveis <= b.familias && b.faltando <= b.vulneraveis && b.criancas <= b.faltando && b.semLembrete <= b.faltando, `${c} ${b.id}`);
      assert.ok(b.atualizadoPct >= 55 && b.atualizadoPct <= 95, `${c} ${b.id}`);
      assert.ok(['ok', 'atencao', 'critica'].includes(b.situacao));
    }
    const soma = (campo) => r.bairros.reduce((s, b) => s + b[campo], 0);
    assert.equal(r.faltando, soma('faltando'));
    assert.equal(r.criancas, soma('criancas'));
    // Famílias no CadÚnico: entre 10% e 50% dos domicílios (Brasil: ~1/3).
    const domicilios = GC.cidade.populacao / 3.1;
    assert.ok(r.familias > domicilios * 0.1 && r.familias < domicilios * 0.5, `${c}: ${r.familias}`);
  }
});

test('bairro mais vulnerável (menos alfabetizados, menos satisfeitos) tem mais famílias no CadÚnico por domicílio', () => {
  const GC = cidade('media');
  const r = GC.social.resumo();
  const porDom = (b) => b.familias / (b.populacao / 3.1);
  const ordenados = r.bairros.slice().sort((x, y) => x.vulnerabilidade - y.vulnerabilidade);
  assert.ok(porDom(ordenados[ordenados.length - 1]) > porDom(ordenados[0]));
});

test('lembretes: a cidade caiu bem mais que as famílias vulneráveis', () => {
  const e = cidade('media').social.resumo().efeitoLembrete;
  assert.ok(e.geralAntes - e.geralDepois >= 4);
  assert.ok(e.vulneraveisAntes - e.vulneraveisDepois < 2.5);
  assert.ok(e.vulneraveisDepois > e.geralDepois * 1.5);
});

test('crítico é relativo à cidade: nenhuma cidade fica com mais da metade dos bairros críticos', () => {
  for (const c of ['pequena', 'media', 'grande']) {
    const r = cidade(c).social.resumo();
    assert.ok(r.criticos.length <= r.bairros.length / 2, `${c}: ${r.criticos.length}/${r.bairros.length}`);
    r.criticos.forEach((b) => assert.ok(b.taxaPct >= r.faltandoPct, `${c} ${b.id}`));
  }
});

test('Copiloto: pergunta sobre faltas, CadÚnico e busca ativa cai no tema social; violência e escola continuam nos seus', () => {
  const GC = cidade('media');
  const ctx = { ocorrencias: GC.criarStore(GC.data).ocorrencias() };
  for (const p of ['Como evoluíram as faltas em consultas depois dos lembretes por WhatsApp?', 'Quantas famílias do CadÚnico estão vulneráveis?',
    'Quais crianças precisam de busca ativa?', 'quem está faltando à consulta e à escola?']) {
    const r = GC.ia.perguntar(p, ctx);
    assert.equal(r.cenario, 'social', p);
    assert.deepEqual([...GC.validarResposta(r)], [], p);
    assert.equal(r.grafico.series.length, 2);
    assert.ok(r.acoes.some((a) => a.tipo === 'criarAlerta'), 'Transformar em alerta');
  }
  assert.equal(GC.ia.perguntar('violência contra crianças', ctx).cenario, 'violencia');
  assert.equal(GC.ia.perguntar('Onde faltam professores?', ctx).cenario, 'educacao');
});

test('a tabela agregada aparece na tela Dados e é a fonte que a resposta cita', () => {
  const GC = cidade('media');
  const store = GC.criarStore(GC.data);
  const t = GC.tabelasDados(store).find((x) => x.id === 'assistencia.cadunico_bairro');
  assert.ok(t, 'tabela na tela Dados');
  assert.equal(t.linhas.length, GC.data.bairros.length);
  assert.ok(t.linhas.every((l) => l.length === t.colunas.length));
  const r = GC.ia.perguntar('busca ativa do CadÚnico', { ocorrencias: store.ocorrencias() });
  assert.ok(r.fontes.includes('assistencia.cadunico_bairro'));
});
