const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

// Cadeia completa de dados, como no index.html, + o que consome os dados (store, IA, relatórios).
const ARQUIVOS = ['data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'cidade.js', 'data-secretarias.js', 'store.js', 'contrato.js', 'ia-roteiro.js', 'relatorios.js'];
const carregarCidade = (cidade) => {
  const GC = carregar(cidade ? { cidade } : {}, ...ARQUIVOS);
  GC.agora = () => 1_700_000_000_000;
  return GC;
};

function dentro([y, x], poligono) {
  let inside = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('sem escolha, é a média (Vila Dourada): os 8 bairros escritos à mão ficam iguais e a cidade cresce em volta', () => {
  const GC = carregarCidade();
  const base = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-risco.js', 'data-obras.js'); // sem cidade.js
  assert.equal(GC.cidade.id, 'media');
  assert.equal(GC.cidade.nome, 'Vila Dourada');
  assert.equal(GC.data.bairros.length, 25);
  for (const b of base.data.bairros) assert.equal(GC.data.bairros.find((x) => x.id === b.id).populacao, b.populacao, b.id);
  // As 24 do miolo ficam iguais, na mesma ordem; os bairros novos ganham ocorrências próprias.
  assert.equal(GC.data.ocorrencias.slice(0, base.data.ocorrencias.length).map((o) => o.id).join(), base.data.ocorrencias.map((o) => o.id).join());
  const novos = GC.data.bairros.filter((b) => !base.data.bairros.some((x) => x.id === b.id));
  const comOcorrencia = novos.filter((b) => GC.data.ocorrencias.some((o) => o.bairroId === b.id));
  assert.equal(comOcorrencia.length, novos.length, 'todo bairro novo tem ao menos uma ocorrência');
  const leitos = (G) => G.data.leitos.unidades.map((u) => u.grupos.map((g) => `${g.ocupados}/${g.total}`).join()).join(';');
  // Os hospitais do miolo ficam iguais; a periferia ganhou dois hospitais clínicos (rede perto de 2,6 leitos por mil).
  const doMiolo = (G) => ({ data: { leitos: { unidades: G.data.leitos.unidades.filter((u) => !['hzn', 'hzs'].includes(u.id)) } } });
  assert.equal(leitos(doMiolo(GC)), leitos(base));
  assert.equal(GC.data.leitos.unidades.filter((u) => ['hzn', 'hzs'].includes(u.id)).map((u) => u.id).join(), 'hzn,hzs');
  assert.equal(GC.data.obras.obras.map((o) => o.contratoMi).join(), base.data.obras.obras.map((o) => o.contratoMi).join());
});

for (const [id, nBairros, popMin, popMax] of [['pequena', 7, 18000, 26000], ['media', 25, 240000, 260000], ['grande', 123, 2300000, 2700000]]) {
  test(`${id}: geografia, população e tudo apontando para bairros que existem`, () => {
    const GC = carregarCidade(id);
    const D = GC.data;
    assert.equal(GC.cidade.id, id);
    assert.equal(D.bairros.length, nBairros);
    const pop = D.bairros.reduce((s, b) => s + b.populacao, 0);
    assert.ok(pop >= popMin && pop <= popMax, `população ${pop}`);
    const bairro = Object.fromEntries(D.bairros.map((b) => [b.id, b]));
    const comPonto = [...D.ocorrencias, ...D.ocorrenciasExtras, ...D.conquistas, ...D.resolvidasRecentes, ...D.leitos.unidades, ...D.obras.obras, ...D.educacao.escolas, ...D.frota.bases, ...D.frota.garagens];
    for (const x of comPonto) {
      assert.ok(bairro[x.bairroId], `${x.id || x.titulo}: bairro ${x.bairroId}`);
      assert.ok(dentro([x.lat, x.lng], bairro[x.bairroId].poligono), `${x.id || x.titulo}: fora de ${x.bairroId}`);
    }
    for (const a of D.risco.areas) {
      assert.ok(bairro[a.bairroId], a.id);
      for (const p of a.poligono) assert.ok(dentro(p, bairro[a.bairroId].poligono), `${a.id}: vértice fora`);
    }
    for (const u of D.series.lotacaoUbs) assert.ok(bairro[u.bairroId], u.nome);
    for (const l of D.frota.linhas) for (const b of l.bairros) assert.ok(bairro[b], `linha ${l.id}: ${b}`);
    for (const f of GC.medicamentos.resumo().farmacias) assert.ok(bairro[f.bairroId] && dentro([f.lat, f.lng], bairro[f.bairroId].poligono), `farmácia ${f.id}`);
    for (const x of D.coleta.rotas) for (const b of x.bairros) assert.ok(bairro[b], `coleta ${x.id}: ${b}`);
    for (const c of GC.coleta.resumo().calendario) assert.ok(c.domiciliar.dias.length, `${c.id}: sem coleta domiciliar`);
    for (const m of D.frota.agenda) assert.ok([...D.frota.bases, ...D.frota.garagens].some((x) => x.id === m.local), m.veiculo);
    for (const s of Object.values(D.secretarias)) for (const u of s.unidades || []) assert.ok(bairro[u.bairroId], `${u.nome}: ${u.bairroId}`);
    for (const b of D.bairros) {
      assert.equal(typeof D.satisfacaoPorBairro[b.id], 'number', `satisfação ${b.id}`);
      assert.equal(typeof D.seguranca.porBairro30d[b.id], 'number', `B.O. ${b.id}`);
      assert.equal(typeof D.educacao.populacao.ensinoMedio25[b.id], 'number', `ensino médio ${b.id}`);
    }
    const ids = comPonto.map((x) => x.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  });

  test(`${id}: números coerentes entre si`, () => {
    const GC = carregarCidade(id);
    const S = GC.data.seguranca;
    const soma = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    const serie = GC.data.series.criminalidadeMensal.valores;
    assert.equal(soma(S.porBairro30d), serie[serie.length - 1]);
    assert.equal(soma(S.porTipo30d), soma(S.porBairro30d));
    const v = S.violencia;
    const ult = v.meses.length - 1;
    assert.equal(soma(v.porBairro), v.mulheres[ult] + v.criancas[ult]);
    for (const u of GC.data.leitos.unidades) for (const g of u.grupos) assert.ok(g.ocupados <= g.total && g.total > 0, u.id);
    for (const o of GC.data.obras.obras) assert.ok(o.gastoMi <= o.contratoMi, o.id);
  });

  test(`${id}: store, Copiloto e relatórios funcionam`, () => {
    const GC = carregarCidade(id);
    const store = GC.criarStore(GC.data);
    assert.ok(store.ocorrencias().length > 0);
    assert.ok(store.kpis().criticas >= 0);
    const ctx = { area: null, ocorrencias: store.ocorrencias() };
    for (const p of ['onde mais alaga?', 'falta de energia', 'lotação das UBS', 'criminalidade', 'trânsito', 'escolas', 'coleta de lixo', 'satisfação', 'desempenho', 'resumo da semana']) {
      assert.ok(GC.ia.perguntar(p, ctx).texto, p);
    }
    const r = GC.montarRelatorio(store, { tipo: 'bairro', alvo: GC.data.bairros[GC.data.bairros.length - 1].id, periodo: '30' });
    assert.ok(r.titulo && r.kpis.length);
    assert.ok(GC.montarRelatorio(store, { tipo: 'executivo', alvo: '-', periodo: '30' }).titulo);
  });
}

test('pequena tem menos de tudo e grande tem mais que a média', () => {
  const [p, m, g] = ['pequena', null, 'grande'].map(carregarCidade);
  const conta = (GC) => [GC.data.ocorrencias.length, GC.leitos.resumo().total, GC.obras.resumo().obras.length, GC.seguranca.resumo().total30d, GC.educacao.resumo().alunos, GC.frota.resumo().onibus.total];
  const [cp, cm, cg] = [conta(p), conta(m), conta(g)];
  cp.forEach((n, i) => assert.ok(n < cm[i], `pequena[${i}] ${n} >= ${cm[i]}`));
  cg.forEach((n, i) => assert.ok(n > cm[i], `grande[${i}] ${n} <= ${cm[i]}`));
});
