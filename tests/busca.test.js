const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'busca.js');
GC.escaparHtml = GC.escaparHtml || ((t) => String(t));
const ids = (lista) => [...lista].map((r) => `${r.tipo}:${r.id}`); // array deste contexto (o vm tem outro protótipo)

const itens = GC.itensBusca({
  ocorrencias: [
    { id: 'oc-1', titulo: 'Alagamento na Avenida', severidade: 'critica', bairroId: 'centro' },
    { id: 'oc-2', titulo: 'Buraco na rua', severidade: 'media', bairroId: 'vila_nova' },
    { id: 'oc-3', titulo: 'Árvore caída na praça', severidade: 'alta', bairroId: 'centro' },
  ],
  escolas: [{ id: 'e1', nome: 'EM Monteiro Lobato', bairroId: 'centro' }],
  leitos: [{ id: 'upa-centro', nome: 'UPA Centro', tipo: 'UPA', bairroId: 'centro', pct: 92 }],
});

test('itensBusca junta bairros, ocorrências, secretarias, equipamentos e telas', () => {
  const tipos = new Set(itens.map((i) => i.tipo));
  ['bairro', 'ocorrencia', 'secretaria', 'escola', 'leito', 'tela'].forEach((t) => assert.ok(tipos.has(t), t));
  assert.equal(itens.filter((i) => i.tipo === 'bairro').length, GC.data.bairros.length);
});

test('buscar ignora acento e maiúscula; quem começa com o termo vem primeiro', () => {
  const r = GC.buscar('ALAGAMENTO', itens);
  assert.equal(ids(r)[0], 'ocorrencia:oc-1');
  const centro = GC.buscar('centro', itens);
  assert.equal(ids(centro)[0], 'bairro:centro', 'bairro antes da UPA Centro (mesma pontuação, tipo primeiro)');
  assert.ok(ids(centro).includes('leito:upa-centro'));
  assert.deepEqual(ids(GC.buscar('ARVORE caida', itens)), ['ocorrencia:oc-3']);
});

test('buscar com várias palavras exige todas; vazio e sem resultado devolvem lista vazia', () => {
  assert.deepEqual(ids(GC.buscar('upa centro', itens)), ['leito:upa-centro']);
  assert.equal(GC.buscar('   ', itens).length, 0);
  assert.equal(GC.buscar('xyzxyz', itens).length, 0);
  assert.ok(GC.buscar('a', itens, 5).length <= 5);
});

test('sinônimos do tipo: "hospital" e "saúde" acham a UPA; "lixo" acha a coleta', () => {
  const com = GC.itensBusca({
    leitos: [{ id: 'upa-centro', nome: 'UPA Centro', tipo: 'UPA', bairroId: 'centro', pct: 92 }],
    rotas: [{ id: 'r1', nome: 'Rota Norte', horario: '7h' }],
  });
  assert.ok(ids(GC.buscar('hospital', com)).includes('leito:upa-centro'));
  assert.ok(ids(GC.buscar('saúde', com)).includes('leito:upa-centro'));
  assert.deepEqual(ids(GC.buscar('lixo', com)), ['coleta:r1']);
});

test('texto de exibição não vira termo: números e "moradores" não casam com tudo', () => {
  assert.equal(GC.buscar('moradores', itens).length, 0);
  assert.equal(GC.buscar('ocupado', itens).length, 0);
  assert.equal(GC.buscar('92', itens).length, 0);
  assert.equal(GC.buscar('painel', itens).length, 0);
  // o bairro continua servindo para refinar: "escola centro" acha a escola de lá
  assert.deepEqual(ids(GC.buscar('escola centro', itens)), ['escola:e1']);
});

test('severidade baixa tem nome e o detalhe não fica com separador sobrando', () => {
  const r = GC.itensBusca({
    ocorrencias: [{ id: 'oc-9', titulo: 'Poste apagado', severidade: 'baixa', bairroId: 'centro' }],
    escolas: [{ id: 'e9', nome: 'EM Sem Bairro' }],
  });
  const oc = r.find((i) => i.id === 'oc-9');
  assert.match(oc.detalhe, /^Baixa · /);
  assert.equal(r.find((i) => i.id === 'e9').detalhe, 'Escola');
  assert.ok(ids(GC.buscar('baixa', r)).includes('ocorrencia:oc-9'));
});
