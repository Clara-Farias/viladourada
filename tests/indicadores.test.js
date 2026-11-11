const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const ARQUIVOS = ['icones.js', 'data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js',
  'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-social.js', 'cidade.js', 'data-secretarias.js', 'store.js', 'indicadores.js'];
const avaliar = (cidade) => {
  const GC = carregar({ cidade }, ...ARQUIVOS);
  return { GC, lista: GC.avaliarIndicadores(GC.contextoIndicadores(GC.criarStore(GC.data))) };
};

test('cada ficha está completa: meta e frequência nos 3 portes, fonte, fórmula, origem', () => {
  const { GC } = avaliar('media');
  const ids = new Set();
  for (const i of GC.CATALOGO_INDICADORES) {
    assert.ok(!ids.has(i.id), `código repetido ${i.id}`);
    ids.add(i.id);
    assert.ok(['menor', 'maior'].includes(i.polaridade), i.id);
    for (const p of GC.PORTES_INDICADOR) {
      assert.equal(typeof i.meta[p], 'number', `${i.id} meta ${p}`);
      assert.ok(i.frequencia[p], `${i.id} frequência ${p}`);
    }
    for (const campo of ['nome', 'unidade', 'fonte', 'formula', 'granularidade', 'fase', 'origem']) assert.ok(i[campo], `${i.id} sem ${campo}`);
    assert.ok(i.area === null || GC.data.areas.some((a) => a.id === i.area), `${i.id}: área ${i.area}`);
    assert.ok(GC.perguntaIndicador(i).endsWith('?'));
  }
});

test('um número só: o último ponto do gráfico é o valor do cartão, e a meta da série é a da ficha', () => {
  for (const cidade of ['pequena', 'media', 'grande']) {
    const { GC, lista } = avaliar(cidade);
    const comSerie = lista.filter((i) => i.serieAtual);
    assert.ok(comSerie.length >= 4, cidade);
    for (const i of comSerie) {
      const m = i.serieAtual.meses;
      assert.equal(m[m.length - 1], i.valorAtual, `${cidade} ${i.id}: último ponto`);
      assert.equal(i.serieAtual.rotulos.length, m.length, `${cidade} ${i.id}: rótulos`);
      assert.equal(GC.data.secretarias[i.serieArea].serie.meta, i.metaAtual, `${cidade} ${i.id}: meta da secretaria`);
    }
  }
});

test('valor de agora diferente do mês fechado: ganha o ponto "agora", sem mexer no histórico', () => {
  const { GC } = avaliar('media');
  const serie = GC.data.secretarias.limpeza.serie;
  const fechado = serie.meses.slice();
  const ctx = GC.contextoIndicadores(GC.criarStore(GC.data));
  ctx.coleta = Object.assign({}, ctx.coleta, { noPrazoPct: 89 });
  const lim = GC.avaliarIndicadores(ctx).find((i) => i.id === 'LIM01');
  assert.equal(lim.serieAtual.meses.length, 13);
  assert.equal(lim.serieAtual.meses[12], 89);
  assert.equal(lim.serieAtual.rotulos[12], 'agora');
  assert.equal(JSON.stringify(serie.meses), JSON.stringify(fechado));
});

test('nas 3 cidades todo indicador tem valor numérico e situação', () => {
  for (const cidade of ['pequena', 'media', 'grande']) {
    const { lista } = avaliar(cidade);
    for (const i of lista) {
      assert.equal(typeof i.valorAtual, 'number', `${cidade} ${i.id}`);
      assert.ok(Number.isFinite(i.valorAtual), `${cidade} ${i.id}`);
      assert.notEqual(i.situacao, 'sem_dado', `${cidade} ${i.id}`);
      assert.equal(i.porte, cidade);
    }
  }
});

test('o valor é o mesmo número que o resto do painel mostra', () => {
  const { GC, lista } = avaliar('media');
  const v = (id) => lista.find((i) => i.id === id).valorAtual;
  assert.equal(v('SAU01'), GC.leitos.resumo().pct);
  assert.equal(v('SAU04'), GC.medicamentos.resumo().rupturas);
  assert.equal(v('MOB01'), GC.frota.resumo().onibus.disponibilidadePct);
  assert.equal(v('SEG01'), Math.round((GC.seguranca.resumo().total30d / 250000) * 100000) / 10);
});

test('a meta muda com o porte: a mesma espera na UBS está fora da meta na pequena e dentro na grande', () => {
  const p = avaliar('pequena').lista.find((i) => i.id === 'SAU03');
  const g = avaliar('grande').lista.find((i) => i.id === 'SAU03');
  assert.equal(p.valorAtual, g.valorAtual);
  assert.equal(p.situacao, 'critico');
  assert.equal(g.situacao, 'ok');
});

test('situação: na meta, perto (até a tolerância) e fora, nos dois sentidos', () => {
  const { GC } = avaliar('media');
  const menor = { polaridade: 'menor', meta: { media: 85 }, tolerancia: 5 };
  assert.equal(GC.situacaoIndicador(menor, 85, 'media'), 'ok');
  assert.equal(GC.situacaoIndicador(menor, 90, 'media'), 'atencao');
  assert.equal(GC.situacaoIndicador(menor, 91, 'media'), 'critico');
  const maior = { polaridade: 'maior', meta: { media: 95 } }; // tolerância padrão: 10% da meta
  assert.equal(GC.situacaoIndicador(maior, 96, 'media'), 'ok');
  assert.equal(GC.situacaoIndicador(maior, 86, 'media'), 'atencao');
  assert.equal(GC.situacaoIndicador(maior, 85, 'media'), 'critico');
  assert.equal(GC.situacaoIndicador(maior, null, 'media'), 'sem_dado');
});

test('gabinete preventivo aberto tira a área da conta de "sem ação preventiva"', () => {
  const { GC } = avaliar('media');
  const store = GC.criarStore(GC.data);
  const ctx = GC.contextoIndicadores(store);
  const sem = GC.avaliarIndicadores(ctx).find((i) => i.id === 'DEF02');
  assert.equal(sem.valorAtual, 1);
  const com = GC.avaliarIndicadores(Object.assign(ctx, { preventivos: [ctx.risco.preventivo.id] })).find((i) => i.id === 'DEF02');
  assert.equal(com.valorAtual, 0);
  assert.equal(com.situacao, 'ok');
});

test('filtro por secretaria e placar', () => {
  const { GC, lista } = avaliar('media');
  const ctx = GC.contextoIndicadores(GC.criarStore(GC.data));
  const saude = GC.avaliarIndicadores(ctx, { area: 'saude' });
  assert.ok(saude.length >= 4 && saude.every((i) => i.area === 'saude'));
  assert.ok(GC.avaliarIndicadores(ctx, { area: 'gabinete' }).every((i) => i.area === null));
  const p = GC.placarIndicadores(lista);
  assert.equal(p.ok + p.atencao + p.critico + p.sem_dado, p.total);
  assert.equal(p.total, lista.length);
});

test('formatação: unidades e singular', () => {
  const { GC } = avaliar('media');
  assert.equal(GC.formatarIndicador(79, '%'), '79%');
  assert.equal(GC.formatarIndicador(1, 'áreas'), '1 área');
  assert.equal(GC.formatarIndicador(137, 'famílias'), '137 famílias');
  assert.equal(GC.formatarIndicador(22.2, 'por 10 mil'), '22,2 por 10 mil');
  assert.equal(GC.formatarIndicador(null, '%'), '—');
});

test('leitura dos indicadores: urgência, distância, tendência, leitura da série e portes', () => {
  const { GC, lista } = avaliar('media');
  const ord = GC.ordenarPorUrgencia(lista);
  const pos = { critico: 0, atencao: 1, ok: 2, sem_dado: 3 };
  for (let k = 1; k < ord.length; k++) assert.ok(pos[ord[k - 1].situacao] <= pos[ord[k].situacao], 'situação fora de ordem');
  // Dentro de "fora da meta", o mais distante vem antes.
  const fora = ord.filter((i) => i.situacao === 'critico');
  for (let k = 1; k < fora.length; k++) assert.ok(GC.distanciaMeta(fora[k - 1]) >= GC.distanciaMeta(fora[k]));
  const ind = { polaridade: 'menor', valorAtual: 72, metaAtual: 60, porte: 'media', meta: { pequena: 45, media: 60, grande: 75 }, tolerancia: 5,
    serieAtual: { meses: [80, 78, 75, 73, 72] } };
  assert.equal(GC.distanciaMeta(ind), 20);
  const t = GC.tendenciaIndicador(ind);
  assert.equal(t.direcao, 'desce');
  assert.equal(t.melhorou, true); // menor é melhor
  assert.equal(GC.insightIndicador(ind).tom, 'ok'); // melhor valor da série
  assert.deepEqual([...GC.portesAtendidos(ind)], ['grande']);
  const piora = Object.assign({}, ind, { serieAtual: { meses: [60, 61, 64, 66, 70, 62] } });
  assert.match(GC.insightIndicador(piora).texto, /Melhorou/);
  const sequencia = Object.assign({}, ind, { serieAtual: { meses: [50, 49, 55, 58, 63, 66] } });
  assert.equal(GC.insightIndicador(sequencia).tom, 'critico');
});

test('mudanças desde a última visita: só o que trocou de situação, com o sentido', () => {
  const { GC } = avaliar('media');
  const lista = [{ id: 'A', situacao: 'critico' }, { id: 'B', situacao: 'ok' }, { id: 'C', situacao: 'atencao' }];
  const m = GC.mudancasIndicadores(lista, { A: 'ok', B: 'atencao', C: 'atencao' });
  assert.deepEqual(Object.keys(m).sort(), ['A', 'B']);
  assert.equal(m.A.melhorou, false);
  assert.equal(m.B.melhorou, true);
  assert.equal(Object.keys(GC.mudancasIndicadores(lista, null)).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(GC.fotoIndicadores(lista))), { A: 'critico', B: 'ok', C: 'atencao' });
});

test('referência do porte (simulada): quanto melhor o valor, maior o "melhor que X%", nas duas polaridades', () => {
  const { GC } = avaliar('media');
  const menor = (v) => GC.referenciaPorte({ polaridade: 'menor', unidade: 'min', valorAtual: v, porte: 'media', meta: { pequena: 45, media: 60, grande: 75 } });
  assert.ok(menor(30).melhorQuePct > menor(60).melhorQuePct);
  assert.ok(menor(60).melhorQuePct > menor(90).melhorQuePct);
  assert.equal(menor(1000).melhorQuePct, 0);
  assert.equal(menor(60).simulada, true);
  const maior = (v) => GC.referenciaPorte({ polaridade: 'maior', unidade: '%', valorAtual: v, porte: 'media', meta: { pequena: 90, media: 95, grande: 95 } });
  assert.ok(maior(99).melhorQuePct > maior(95).melhorQuePct);
  assert.ok(maior(95).melhorQuePct > maior(70).melhorQuePct);
  assert.ok(maior(95).mediana <= 100);
  assert.equal(GC.referenciaPorte({ polaridade: 'menor', valorAtual: null, porte: 'media', meta: { media: 10 } }), null);
});
