const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { carregar } = require('./helpers/carregar');

const GC = carregar('icones.js');
const MANTER = new Set(['▲', '▼', '●', '→', '←']);

test('semEmoji tira emojis e mantém setas de tendência e de texto', () => {
  assert.equal(GC.semEmoji('📣 Cobrar  Saúde'), 'Cobrar Saúde');
  assert.equal(GC.semEmoji('⚠️ Piorou ▲ 3%'), 'Piorou ▲ 3%');
  assert.equal(GC.semEmoji('Ver detalhes →'), 'Ver detalhes →');
  assert.equal(GC.semEmoji(null), '');
});

test('icone monta a tag do Tabler escondida de leitores de tela', () => {
  assert.equal(GC.icone('bell'), '<i class="ti ti-bell" aria-hidden="true"></i>');
  assert.equal(GC.icone('alarm', 'ic-alerta'), '<i class="ti ti-alarm ic-alerta" aria-hidden="true"></i>');
});

test('ícone próprio (nome com @): o Copiloto tem o dele, fora da fonte Tabler', () => {
  assert.equal(GC.icone('@copiloto', 'ic-ia'), '<i class="ic-copiloto ic-ia" aria-hidden="true"></i>');
  assert.deepEqual([...GC.ICONES['🛞']], ['@copiloto', 'ic-ia']);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'css', 'icone-copiloto.css'), 'utf8').includes('.ic-copiloto'));
});

test('todo emoji usado no código e no HTML tem ícone no dicionário', () => {
  const raiz = path.join(__dirname, '..');
  const arquivos = [...fs.readdirSync(path.join(raiz, 'js')).filter((f) => f !== 'icones.js').map((f) => path.join(raiz, 'js', f)), path.join(raiz, 'index.html')];
  const re = /\p{Extended_Pictographic}/gu;
  const faltando = new Set();
  arquivos.forEach((f) => {
    for (const [ch] of fs.readFileSync(f, 'utf8').matchAll(re)) {
      if (!MANTER.has(ch) && !GC.ICONES[ch]) faltando.add(`${ch} (${path.basename(f)})`);
    }
  });
  assert.deepEqual([...faltando], []);
});
