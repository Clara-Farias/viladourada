const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'data-leitos.js', 'data-seguranca.js', 'data-risco.js', 'data-obras.js', 'data-educacao.js', 'data-frota.js', 'data-coleta.js', 'data-medicamentos.js', 'data-secretarias.js', 'store.js', 'relatorios.js');
GC.agora = () => 1_700_000_000_000;
const novo = () => GC.criarStore(GC.data);

// ---- Task 1: dados ----
test('alertas30d = soma das regras; alertasPorMes tem 12 e termina nele', () => {
  const soma = Object.values(GC.data.regras).reduce((s, r) => s + r.disparos30d, 0);
  assert.equal(GC.alertas30d(), soma);
  const m = GC.alertasPorMes();
  assert.equal(m.length, 12);
  assert.equal(m[11], soma);
  assert.ok(m.slice(0, 11).every((v) => v >= 70 && v <= 110));
});

test('areaDoTipo', () => {
  assert.equal(GC.areaDoTipo('alagamento'), 'defesa_civil');
  assert.equal(GC.areaDoTipo('xyz'), null);
});

// ---- Task 2: montagem ----
for (const tipo of ['executivo', 'secretaria', 'bairro', 'alertas']) {
  for (const periodo of ['7', '30', '90', '12m', 'm3-8']) {
    test(`${tipo} ${periodo}: estrutura completa`, () => {
      const alvo = { secretaria: 'saude', bairro: 'centro' }[tipo] || '-';
      const r = GC.montarRelatorio(novo(), { tipo, alvo, periodo });
      assert.ok(r.titulo && r.resumo && r.fontes.length, 'titulo/resumo/fontes');
      assert.ok(r.kpis.length >= 4 && r.kpis.length <= 6, `kpis ${r.kpis.length}`);
      assert.ok(r.secoes.length >= 2, 'secoes');
      const json = JSON.stringify(r);
      assert.ok(!json.includes('undefined') && !json.includes('NaN'), json.slice(0, 300));
    });
  }
}

test('30 dias bate com a visão geral', () => {
  const s = novo();
  const r = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '30' });
  const d = s.desempenho(null).resumo;
  assert.equal(r.kpis.find((k) => k.rotulo.startsWith('Resolvidas')).valor, d.resolvidas.toLocaleString('pt-BR'));
  assert.equal(r.kpis.find((k) => k.rotulo.startsWith('No prazo')).valor, `${d.noPrazoPct}%`);
});

test('90 dias e 12 meses: resolvidas seguem a curva de alertas; período em meses', () => {
  const s = novo();
  const r = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '12m' });
  assert.equal(r.periodo.rotulo, 'nov/2025 a out/2026');
  assert.equal(GC.montarRelatorio(s, { tipo: 'alertas', alvo: '-', periodo: '90' }).periodo.rotulo, 'ago/2026 a out/2026');
  const m = GC.alertasPorMes();
  const esperado = Math.round((s.desempenho(null).resumo.resolvidas * m.reduce((a, b) => a + b, 0)) / m[11]);
  const resolvidas = r.kpis.find((k) => k.rotulo.startsWith('Resolvidas'));
  assert.equal(resolvidas.valor, `≈ ${esperado.toLocaleString('pt-BR')}`);
  assert.match(resolvidas.detalhe, /^estimativa/);
  assert.ok(r.kpis.find((k) => k.rotulo.startsWith('No prazo')).rotulo.includes('(30 dias)'));
});

test('estimativas aparecem como estimativas (≈ e nota), e só fora dos 30 dias', () => {
  const s = novo();
  const r30 = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '30' });
  assert.ok(!JSON.stringify(r30).includes('≈'));
  const r7 = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '7' });
  assert.match(r7.painel.kpis[0].valor, /^≈ /);
  assert.match(r7.resumo, /cerca de .+estimativa/);
  const a7 = GC.montarRelatorio(s, { tipo: 'alertas', alvo: '-', periodo: '7' });
  assert.match(a7.kpis[0].valor, /^≈ /);
  // 90 dias e 12 meses de alertas são a série mensal registrada: não é estimativa.
  assert.ok(!/^≈/.test(GC.montarRelatorio(s, { tipo: 'alertas', alvo: '-', periodo: '90' }).kpis[0].valor));
  assert.ok(GC.relatorioCsv(r7).includes('Indicador;Valor;Observação'));
});

test('tabela de indicadores: todos os KPIs, com a observação (a mesma na tela, no CSV e no PDF)', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '30' });
  const t = GC.tabelaIndicadores(r);
  assert.deepEqual([...t.colunas], ['Indicador', 'Valor', 'Observação']);
  assert.equal(t.linhas.length, r.kpis.length);
  assert.ok(t.linhas.some((l) => l[0] === 'Satisfação'));
  assert.ok(t.linhas.some((l) => l[2] === 'meta 85%'));
});

test('secretaria sem unidades não quebra o relatório', () => {
  const sec = GC.data.secretarias.saude;
  const antes = sec.unidades;
  sec.unidades = [];
  try {
    const r = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '30' });
    const u = r.secoes.find((x) => x.titulo === 'Unidades');
    assert.deepEqual([...u.colunas], ['Unidade', 'Bairro', 'Situação']);
    assert.equal(u.vazio, 'Nada a listar');
  } finally {
    sec.unidades = antes;
  }
});

test('painel executivo: cor do "No prazo" segue a meta de 85%', () => {
  const s = novo();
  const k = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '30' }).painel.kpis.find((x) => x.rotulo.startsWith('No prazo'));
  assert.equal(k.tom, s.desempenho(null).resumo.noPrazoPct >= 85 ? 'ok' : 'ruim');
});

test('recomendações: ordem e limite, citando números', () => {
  const rec = GC.recomendacoes(novo());
  assert.ok(rec.length >= 1 && rec.length <= 5);
  assert.match(rec[0], /^Cobrar a .+ sobre .+ \(estourado há /);
  assert.ok(rec.some((t) => /Pedir plano de ação à Secretaria de Obras e Infraestrutura: 62% no prazo \(meta 85%\)/.test(t)), rec.join(' | '));
});

test('alertas: por secretaria soma o total; por mês só em 90/12m', () => {
  const r30 = GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '30' });
  const sec = r30.secoes.find((x) => x.titulo === 'Por secretaria');
  assert.equal(sec.linhas.reduce((s, l) => s + Number(l[1]), 0), GC.alertas30d());
  assert.ok(!r30.secoes.some((x) => x.titulo === 'Por mês'));
  assert.ok(GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '12m' }).secoes.some((x) => x.titulo === 'Por mês'));
});

test('seção sem nada para listar traz o aviso', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'bairro', alvo: 'jardim_das_flores', periodo: '30' });
  const unidades = r.secoes.find((x) => x.titulo.startsWith('Unidades'));
  assert.ok(unidades.vazio === 'Nada a listar' || unidades.linhas.length > 0);
  const r2 = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'educacao', periodo: '30' });
  assert.ok(r2.secoes.every((x) => x.vazio || (x.linhas && x.linhas.length) || (x.itens && x.itens.length)));
});

test('secretaria: evolução 12 meses = série da página; orçamento igual', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '12m' });
  const ev = r.secoes.find((x) => x.titulo.startsWith('Evolução'));
  assert.equal(ev.linhas.length, 12);
  assert.equal(ev.linhas[11][1], '71 min');
  assert.equal(r.kpis[0].valor, 'R$ 298,6 mi');
});

// ---- Task 3: CSV ----
test('CSV: BOM, ; e escape', () => {
  const csv = GC.relatorioCsv({ titulo: 'T; "x"', periodo: { rotulo: 'p' }, kpis: [{ rotulo: 'a', valor: '1' }], resumo: 'r', secoes: [{ titulo: 's', tipo: 'tabela', colunas: ['c1', 'c2'], linhas: [['1;2', 'ok']] }], fontes: ['f'] });
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"T; ""x"""'));
  assert.ok(csv.includes('"1;2";ok'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('Indicador;Valor'));
});

test('CSV de um relatório real traz todas as seções', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '30' });
  const csv = GC.relatorioCsv(r);
  for (const s of r.secoes) assert.ok(csv.includes(s.titulo), s.titulo);
  assert.ok(csv.includes('Fontes;'));
});

// ---- correções da revisão final ----
test('alertas: por secretaria soma o total em todos os períodos', () => {
  for (const periodo of ['7', '30', '90', '12m', 'm3-8']) {
    const r = GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo });
    const total = Number(r.kpis[0].valor.replace(/\D/g, ''));
    const soma = r.secoes.find((x) => x.titulo === 'Por secretaria').linhas.reduce((s, l) => s + Number(l[1]), 0);
    assert.equal(soma, total, periodo);
  }
});

test('resumo do executivo não atribui a taxa de 30 dias ao total do período', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '12m' });
  assert.doesNotMatch(r.resumo, /delas no prazo/);
  assert.match(r.resumo, /das ocorrências resolvidas nos últimos 30 dias ficaram no prazo/);
});

// ---- painel (tela mais leve: 4 números, lista à esquerda, barras à direita) ----
for (const tipo of ['executivo', 'secretaria', 'bairro', 'alertas']) {
  for (const periodo of ['7', '30', '90', '12m', 'm3-8']) {
    test(`painel ${tipo} ${periodo}: 4 números, lista e barras`, () => {
      const alvo = { secretaria: 'saude', bairro: 'centro' }[tipo] || '-';
      const p = GC.montarRelatorio(novo(), { tipo, alvo, periodo }).painel;
      assert.equal(p.kpis.length, 4);
      assert.ok(p.esquerda.titulo && (p.esquerda.itens.length || p.esquerda.vazio));
      assert.ok(p.direita.titulo && (p.direita.barras.length || p.direita.vazio));
      assert.ok(p.direita.barras.every((b) => b.valor >= 0 && b.valor <= 100));
      assert.ok(!JSON.stringify(p).includes('undefined') && !JSON.stringify(p).includes('NaN'));
    });
  }
}

test('painel executivo: ações = recomendações, com etiqueta; barras com a meta 85', () => {
  const s = novo();
  const p = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '30' }).painel;
  assert.equal(p.esquerda.titulo, 'O que fazer agora');
  assert.equal(p.esquerda.itens.length, GC.recomendacoes(s).length);
  const { link, ...item } = p.esquerda.itens[0];
  assert.deepEqual(item, { texto: 'Cobrar a Limpeza Urbana sobre Coleta de lixo atrasada há 3 dias', etiqueta: 'estourado há 2 dias', tom: 'crit' });
  assert.equal(link.tipo, 'ocorrencia');
  assert.ok(s.ocorrencias().some((o) => o.id === link.id));
  assert.equal(p.direita.meta, 85);
  assert.equal(p.direita.barras[0].rotulo, 'Infraestrutura');
  assert.deepEqual({ ...p.kpis[0].tendencia }, { texto: '▲ 13% vs mês anterior', tom: 'ok' });
  assert.deepEqual({ ...p.direita.barras[0].link }, { tipo: 'secretaria', id: 'infraestrutura' });
});

test('painel alertas: por mês em 12 meses, por secretaria em 30 dias', () => {
  assert.equal(GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '12m' }).painel.direita.barras.length, 12);
  assert.equal(GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '30' }).painel.direita.titulo, 'Disparos por secretaria');
});

test('painel secretaria: evolução da janela do período', () => {
  assert.equal(GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '12m' }).painel.direita.barras.length, 12);
  // 90 dias: 6 meses no gráfico, os 3 de fora do período como contexto.
  const b90 = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '90' }).painel.direita.barras;
  assert.equal(b90.length, 6);
  assert.equal(b90.filter((b) => b.contexto).length, 3);
  assert.equal(GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '30' }).painel.direita.barras.length, 6);
});

// ---- revisão de UX (prioridade alta) ----
test('painel executivo: tendência tem cor própria, separada da meta', () => {
  const s = novo();
  const d = s.desempenho(null).resumo;
  const k = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: '30' }).painel.kpis.find((x) => x.rotulo.startsWith('No prazo'));
  const delta = d.noPrazoPct - d.noPrazoPctAnt;
  assert.equal(k.tendencia.tom, Math.abs(delta) < 0.5 ? '' : delta > 0 ? 'ok' : 'ruim');
  assert.ok(!k.detalhe.includes('vs mês anterior'));
  assert.match(k.detalhe, /meta/);
});

test('secretaria: barra pior que a meta fica vermelha conforme o sentido do indicador', () => {
  // Espera nas UBS (min): menor é melhor.
  const saude = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'saude', periodo: '12m' }).painel.direita;
  const serie = GC.data.secretarias.saude.serie;
  saude.barras.forEach((b, i) => assert.equal(b.tom, serie.meses[i] > serie.meta ? 'ruim' : '', b.rotulo));
  assert.match(saude.legenda, /^Menor é melhor/);
  // Frequência escolar (%): maior é melhor.
  const edu = GC.montarRelatorio(novo(), { tipo: 'secretaria', alvo: 'educacao', periodo: '12m' }).painel.direita;
  const se = GC.data.secretarias.educacao.serie;
  edu.barras.forEach((b, i) => assert.equal(b.tom, se.meses[i] < se.meta ? 'ruim' : '', b.rotulo));
  assert.match(edu.legenda, /^Maior é melhor/);
});

test('detalhes: Recomendações só no documento; cartões marcados para não repetir na tela', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '30' });
  assert.ok(r.secoes.find((x) => x.titulo === 'Recomendações').soDocumento);
  assert.ok(GC.relatorioCsv(r).includes('Recomendações'), 'CSV mantém a seção');
  assert.deepEqual([...r.kpis.filter((k) => !k.noCartao).map((k) => k.rotulo)], ['Orçamento 2026', 'Satisfação']);
  assert.equal(GC.tabelaIndicadores(r).linhas.length, r.kpis.length, 'PDF/CSV com todos');
});

test('alertas: disparos por secretaria com nome curto, do maior para o menor, com link', () => {
  const b = GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '30' }).painel.direita.barras;
  const n = b.map((x) => Number(x.texto));
  assert.deepEqual(n, n.slice().sort((x, y) => y - x));
  assert.ok(b.every((x) => !x.rotulo.startsWith('Secretaria')));
  assert.ok(b.filter((x) => x.rotulo !== 'Outras').every((x) => x.link && x.link.tipo === 'secretaria'));
});

// ---- período por meses, resumo em tópicos, meta/média nas barras, regras em palavras ----
test('período por meses (m<de>-<ate>): rótulo, contagens e evolução seguem o intervalo', () => {
  const s = novo();
  assert.deepEqual({ ...GC.periodoInfo('m3-8') }, { de: 3, ate: 8 });
  assert.equal(GC.periodoInfo('m8-3'), null);
  assert.equal(GC.periodoInfo('m3-12'), null);
  const ex = GC.montarRelatorio(s, { tipo: 'executivo', alvo: '-', periodo: 'm3-8' });
  assert.equal(ex.periodo.rotulo, 'fev/2026 a jul/2026');
  const m = GC.alertasPorMes();
  const esperado = Math.round((s.desempenho(null).resumo.resolvidas * m.slice(3, 9).reduce((a, b) => a + b, 0)) / m[11]);
  assert.equal(ex.kpis.find((k) => k.rotulo.startsWith('Resolvidas')).valor, `≈ ${esperado.toLocaleString('pt-BR')}`);
  const sec = GC.montarRelatorio(s, { tipo: 'secretaria', alvo: 'saude', periodo: 'm3-8' });
  const ev = sec.secoes.find((x) => x.titulo.startsWith('Evolução'));
  assert.equal(ev.linhas.length, 6);
  assert.equal(ev.linhas[0][0], 'fev/2026');
  assert.equal(sec.painel.direita.barras.length, 6);
  assert.ok(sec.painel.direita.barras.every((b) => !b.contexto));
  // Um mês só: o gráfico mostra 6 meses terminando nele, só o escolhido sem esmaecer.
  const um = GC.montarRelatorio(s, { tipo: 'secretaria', alvo: 'saude', periodo: 'm7-7' }).painel.direita.barras;
  assert.equal(um.length, 6);
  assert.equal(um.filter((b) => !b.contexto).length, 1);
  assert.equal(um[5].rotulo, 'jun/2026');
  const al = GC.montarRelatorio(s, { tipo: 'alertas', alvo: '-', periodo: 'm3-8' });
  assert.equal(Number(al.kpis[0].valor.replace(/\D/g, '')), m.slice(3, 9).reduce((a, b) => a + b, 0));
  assert.equal(al.secoes.find((x) => x.titulo === 'Por mês').itens.length, 6);
  assert.equal(al.painel.direita.titulo, 'Disparos por mês');
});

test('resumo em tópicos: o texto corrido é a junção, e o CSV leva cada tópico', () => {
  for (const tipo of ['executivo', 'secretaria', 'bairro', 'alertas']) {
    const alvo = { secretaria: 'saude', bairro: 'centro' }[tipo] || '-';
    const r = GC.montarRelatorio(novo(), { tipo, alvo, periodo: '30' });
    assert.ok(r.topicos.length >= 2, tipo);
    assert.equal(r.resumo, r.topicos.join(' '));
    assert.ok(r.topicos.every((t) => /[.]$/.test(t)), tipo);
    const csv = GC.relatorioCsv(r);
    r.topicos.forEach((t) => assert.ok(csv.includes(t.includes(';') ? `"${t}"` : t), t));
  }
});

test('barras: executivo sem etiqueta do indicador-chave; bairro com a média e vermelho só acima de 1,5×', () => {
  const ex = GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '30' }).painel.direita;
  assert.ok(ex.barras.every((b) => !b.etiqueta && b.dica));
  const ba = GC.montarRelatorio(novo(), { tipo: 'bairro', alvo: 'centro', periodo: '30' }).painel.direita;
  assert.ok(ba.barras.every((b) => b.marca >= 0 && b.marca <= 100));
  ba.barras.forEach((b) => {
    const [n, media] = b.texto.split(' · média ').map((x) => Number(x.replace(',', '.')));
    assert.equal(b.tom, n > media * 1.5 && n - media >= 1 ? 'ruim' : '', b.rotulo);
  });
});

test('alertas: regras em palavras na tela; expressão técnica fica como dica e coluna própria', () => {
  const r = GC.montarRelatorio(novo(), { tipo: 'alertas', alvo: '-', periodo: '30' });
  r.painel.esquerda.itens.forEach((i) => {
    assert.doesNotMatch(i.texto, /[a-z]+_[a-z]+/, i.texto);
    assert.match(i.dica, /^Regra técnica: /);
  });
  const t = r.secoes.find((x) => x.titulo === 'Por regra');
  assert.deepEqual([...t.colunas], ['Tipo', 'Regra', 'Expressão técnica', 'Fontes', 'Disparos (30 dias)']);
});

test('fontes: nome legível; o CSV leva nome e código', () => {
  assert.equal(GC.nomeFonte('gestao.ocorrencias'), 'Registro de ocorrências');
  assert.equal(GC.nomeFonte('xyz'), 'xyz');
  const csv = GC.relatorioCsv(GC.montarRelatorio(novo(), { tipo: 'executivo', alvo: '-', periodo: '30' }));
  assert.ok(csv.includes('Registro de ocorrências [gestao.ocorrencias]'));
});
