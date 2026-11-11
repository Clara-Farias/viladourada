const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Executa arquivos de js/ num contexto isolado (como o navegador faria) e devolve window.GC.
function carregar(...arquivos) {
  // Primeiro argumento opcional { cidade: 'pequena' | 'grande' } força a cidade de js/cidade.js.
  const opcoes = typeof arquivos[0] === 'object' ? arquivos.shift() : {};
  const GC = { hojeForcado: opcoes.hoje || '2026-11-05' }; // testes rodam no "hoje" em que os dados foram escritos
  if (opcoes.cidade) GC.cidadeForcada = opcoes.cidade;
  const ctx = { window: { GC }, console, URL, URLSearchParams };
  vm.createContext(ctx);
  if (!arquivos.includes('relogio.js')) arquivos.unshift('relogio.js');
  if (!arquivos.includes('marca.js')) arquivos.unshift('marca.js');
  for (const arquivo of arquivos) {
    const codigo = fs.readFileSync(path.join(__dirname, '..', '..', 'js', arquivo), 'utf8');
    vm.runInContext(codigo, ctx, { filename: arquivo });
  }
  return ctx.window.GC;
}

module.exports = { carregar };
