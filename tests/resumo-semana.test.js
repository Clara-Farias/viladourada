const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'resumo-semana.js');
const base = (extra = {}) => Object.assign({ tendencias: GC.data.tendencias, conquistas: GC.data.conquistas, desempenho: GC.data.desempenho30d, agora: Date.UTC(2026, 10, 5, 12) }, extra);

test('melhorou e piorou, do maior para o menor efeito', () => {
  const r = GC.resumoDaSemana(base());
  assert.match(r.melhorou[0].rotulo, /Criminalidade/); // -9%
  assert.match(r.piorou[0].rotulo, /Alagamentos/); // +25%
  assert.equal(r.contagem.melhorou + r.contagem.piorou, GC.data.tendencias.length);
  assert.ok(r.melhorou.length <= 4 && r.piorou.length <= 4);
  assert.equal(r.periodo, '30/10 a 05/11');
});

test('entregas: as mais recentes primeiro, no máximo 3', () => {
  const r = GC.resumoDaSemana(base());
  assert.equal(r.entregas.length, 3);
  const datas = [...r.entregas.map((e) => e.data)];
  assert.deepEqual(datas, [...datas].sort().reverse());
  assert.equal(r.contagem.entregas, GC.data.conquistas.length);
});

test('prazo: a secretaria que mais ganhou e a que mais perdeu (pontos percentuais)', () => {
  const { ganhou, perdeu } = GC.resumoDaSemana(base()).prazo;
  assert.ok(ganhou.variacaoPp > 0 && perdeu.variacaoPp < 0);
  const d = GC.data.desempenho30d;
  const variacoes = Object.values(d).map((x) => x.noPrazoPct - x.anterior.noPrazoPct);
  assert.equal(ganhou.variacaoPp, Math.max(...variacoes));
  assert.equal(perdeu.variacaoPp, Math.min(...variacoes));
});

test('filtro de secretaria vale para tudo (gestor do setor vê só a pasta)', () => {
  const r = GC.resumoDaSemana(base({ areas: ['saude'] }));
  assert.ok([...r.melhorou, ...r.piorou, ...r.entregas].every((x) => x.area === 'saude'));
  assert.ok(!r.prazo.ganhou || r.prazo.ganhou.area === 'saude');
  assert.ok(!r.prazo.perdeu || r.prazo.perdeu.area === 'saude');
  assert.ok(r.escopo);
});
