const test = require('node:test');
const assert = require('node:assert');
const { carregar } = require('./helpers/carregar');

const GC = carregar('marca.js');

test('cada paleta pronta vira a paleta inteira, com texto legível sobre cada cor', () => {
  for (const t of GC.TEMAS_MARCA) {
    const p = GC.paletaMarca(t);
    for (const k of ['--navy', '--navy-escuro', '--ouro', '--ia', '--sobre-navy', '--sobre-ouro', '--navy-texto', '--ia-texto', '--ouro-texto', '--topo']) assert.ok(p[k], `${t.id} ${k}`);
    assert.ok(GC.cor.contraste(p['--navy'], p['--sobre-navy']) >= 3, `${t.id}: texto sobre a principal`);
    assert.ok(GC.cor.contraste(p['--ouro'], p['--sobre-ouro']) >= 3, `${t.id}: texto sobre o destaque`);
    assert.ok(GC.cor.contraste(p['--navy-texto'], '#ffffff') >= 4.5, `${t.id}: texto da marca sobre branco`);
  }
});

test('cor clara escolhida: o texto por cima fica escuro e o texto da marca escurece até ler', () => {
  const p = GC.paletaMarca({ primaria: '#f4d35e', escura: '#b09844', destaque: '#d4a017', ia: '#a78bfa' });
  assert.equal(p['--sobre-navy'], '#111827');
  assert.ok(GC.cor.contraste(p['--navy-texto'], '#ffffff') >= 4.5);
  assert.ok(GC.cor.contraste(p['--ia-texto'], '#ffffff') >= 4.5);
});

test('exportar e importar a marca devolvem a mesma identidade; arquivo estranho é recusado', () => {
  const m = { produto: 'Saúde Conectada', agente: 'Lia', tema: 'saude', cores: null, logo: null };
  const volta = GC.lerArquivoMarca(JSON.parse(JSON.stringify(GC.exportarMarca(m))));
  assert.equal(volta.produto, 'Saúde Conectada');
  assert.equal(volta.agente, 'Lia');
  assert.equal(volta.cores.primaria, GC.TEMAS_MARCA.find((t) => t.id === 'saude').primaria);
  assert.equal(GC.lerArquivoMarca({ formato: 'outro' }), null);
  assert.equal(GC.lerArquivoMarca({ formato: 'golden-marca', cores: { primaria: 'vermelho' } }), null);
});
