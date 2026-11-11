const test = require('node:test');
const assert = require('node:assert');
const { carregar } = require('./helpers/carregar');

// Base completa (como o painel carrega) + cruzamento, nas três cidades da demonstração.
const ARQ = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js',
  'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-gestao.js', 'data-secretarias.js',
  'data-cruzamento.js', 'cruzamento.js'];
const CIDADES = ['pequena', 'media', 'grande'];
const soma = (a) => a.reduce((s, n) => s + n, 0);

for (const cidade of CIDADES) {
  const GC = carregar({ cidade }, ...ARQ);
  const D = GC.data;
  const X = D.cruzamento;

  test(`${cidade}: toda região tem bairro e todo bairro está em uma região`, () => {
    const vistos = X.regioes.flatMap((r) => r.bairros);
    assert.equal(vistos.length, D.bairros.length);
    assert.equal(new Set(vistos).size, D.bairros.length);
  });

  test(`${cidade}: somas por bairro = total da cidade = série da secretaria, mês a mês`, () => {
    const SERIE = { alagamentos: 'defesa_civil', quedas: 'infraestrutura', bos: 'seguranca' };
    for (const [ind, area] of Object.entries(SERIE)) {
      for (let m = 0; m < 12; m++) {
        const bairros = soma(D.bairros.map((b) => X.porBairro[ind][b.id][m]));
        assert.equal(bairros, X.cidade[ind][m], `${ind} mês ${m}`);
        assert.equal(X.cidade[ind][m], D.secretarias[area].serie.meses[m], `${ind} × ${area} mês ${m}`);
        assert.equal(soma(X.regioes.map((r) => X.porRegiao[ind][r.id][m])), X.cidade[ind][m]);
      }
    }
  });

  test(`${cidade}: B.O.s do último mês por bairro = mapa de 30 dias da segurança`, () => {
    D.bairros.forEach((b) => assert.equal(X.porBairro.bos[b.id][11], D.seguranca.porBairro30d[b.id] || 0, b.id));
    assert.equal(X.cidade.bos[11], GC.seguranca.resumo().total30d);
  });

  test(`${cidade}: ocupação do último mês = ocupação atual da central de leitos`, () => {
    assert.equal(Math.round(X.cidade.ocupacao[11]), GC.leitos.resumo().pct);
  });

  test(`${cidade}: médias das regiões batem com a cidade`, () => {
    const pop = (r) => r.populacao;
    for (const ind of ['espera', 'coleta']) {
      for (let m = 0; m < 12; m++) {
        const v = soma(X.regioes.map((r) => X.porRegiao[ind][r.id][m] * pop(r))) / soma(X.regioes.map(pop));
        assert.ok(Math.abs(v - X.cidade[ind][m]) < 0.15, `${ind} mês ${m}: ${v} × ${X.cidade[ind][m]}`);
      }
    }
    assert.equal(X.cidade.espera[11], D.secretarias.saude.serie.meses[11]);
    assert.equal(X.cidade.coleta[11], D.secretarias.limpeza.serie.meses[11]);
  });

  test(`${cidade}: relações esperadas aparecem (e as sem sentido não)`, () => {
    const c = GC.cruzamento;
    assert.ok(c.cruzar('alagamentos', 'chuva', { meses: 12 }).r > 0.6);
    assert.ok(c.cruzar('ocupacao', 'chuva', { meses: 12 }).r > 0.6);
    const res = c.cruzar('ocupacao', 'chuva', { meses: 3 });
    assert.equal(res.rotulos.length, 3);
    assert.ok(res.leitura.length >= 3);
    assert.ok(res.leitura.at(-1).includes('não prova'));
  });
}

test('interpretar: indicadores, período e região saem do texto', () => {
  const GC = carregar({ cidade: 'media' }, ...ARQ);
  GC.perfil = { id: 'prefeito' };
  const p = GC.cruzamento.interpretar('Cruze a ocupação hospitalar com a chuva dos últimos 6 meses na região norte');
  assert.deepEqual([p.a, p.b, p.meses, p.recorte], ['ocupacao', 'chuva', 6, 'norte']);
  const s = GC.cruzamento.interpretar('cruzar dados', { id: 'setor', area: 'seguranca' });
  assert.ok(['bos', 'chuva'].includes(s.a));
  assert.ok(GC.cruzamento.indicadores({ id: 'setor', area: 'saude' }).every((i) => !i.area || i.area === 'saude'));
});
