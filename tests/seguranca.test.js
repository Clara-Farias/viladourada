const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-seguranca.js');
const S = GC.data.seguranca;
const soma = (o) => Object.values(o).reduce((s, n) => s + n, 0);

test('B.O.s do mês batem com o último ponto da série de criminalidade', () => {
  const serie = GC.data.series.criminalidadeMensal.valores;
  assert.equal(soma(S.porBairro30d), serie[serie.length - 1]);
  assert.equal(soma(S.porTipo30d), soma(S.porBairro30d));
});

test('todo bairro tem contagem de B.O. e de violência contra mulheres e crianças', () => {
  for (const b of GC.data.bairros) {
    assert.equal(typeof S.porBairro30d[b.id], 'number', b.id);
    assert.equal(typeof S.violencia.porBairro[b.id], 'number', b.id);
  }
});

test('violência por bairro soma o último mês de mulheres + crianças', () => {
  const v = S.violencia;
  const ult = v.meses.length - 1;
  assert.equal(soma(v.porBairro), v.mulheres[ult] + v.criancas[ult]);
  assert.equal(v.mulheres.length, 12);
  assert.equal(v.criancas.length, 12);
});

test('resumo: hoje vs média, bairro crítico, tipos em ordem e tendência da violência', () => {
  const r = GC.seguranca.resumo();
  assert.equal(r.total30d, 363);
  assert.equal(r.mediaDia, 12.1);
  assert.equal(r.hojeVariacaoPct, 32);
  assert.equal(r.hojeAlto, true);
  assert.equal(r.mesVariacaoPct, 3);
  assert.equal(r.bairroCritico.id, 'centro');
  assert.equal(r.porTipo[0].tipo, 'Roubo');
  assert.equal(r.violencia.mes, 71);
  assert.equal(r.violencia.variacaoPct, 4);
  assert.equal(r.violencia.subindo, true);
  assert.equal(r.violencia.porBairro[0].id, 'vila_nova');
});

test('pontos do calor: proporcionais aos B.O.s e determinísticos', () => {
  const p1 = GC.seguranca.pontosCalor();
  const p2 = GC.seguranca.pontosCalor();
  assert.deepEqual(JSON.parse(JSON.stringify(p1)), JSON.parse(JSON.stringify(p2)));
  const esperado = Object.values(S.porBairro30d).reduce((s, n) => s + Math.round(n / 3), 0);
  assert.equal(p1.length, esperado);
  for (const p of p1) assert.ok(p.lat < -22.87 && p.lat > -22.94 && p.lng > -47.11 && p.lng < -47.01);
});
