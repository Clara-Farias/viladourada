(function (GC) {
  // Tela "Dados": as tabelas que alimentam o painel, com descrição das colunas, prévia das 15
  // primeiras linhas e download (CSV da tabela, base completa em JSON, dicionário em Markdown).
  const esc = (t) => GC.escaparHtml(t);
  const PREVIA = 15;
  const hoje = () => {
    const d = new Date(GC.agora());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  GC.criarTelaDados = function (el, { aoAbrirTabela, base }) {
    let id = null;
    let ultimo = null;
    let assinatura = '';
    // Redesenha só quando algo mudou (as tabelas estáticas nunca mudam; ocorrências e regras sim).
    const assinar = (estado) => JSON.stringify([estado.resumo, (estado.tabelas.find((t) => t.id === id) || estado.tabelas[0]).linhas, estado.tabelas.map((t) => t.linhas.length)]);
    el.innerHTML = `
      <header class="sec-topo"><div><h2>🗄 Dados</h2><p>As tabelas que alimentam o painel: o que está aqui é exatamente o que as telas mostram.</p></div>
        <span class="sec-acoes"><button type="button" class="btn-sec dad-json">⬇ Baixar base completa (.json)</button><button type="button" class="btn-sec dad-md">📘 Dicionário de dados</button></span></header>
      <div class="alr-kpis dad-kpis"></div>
      <div class="dad-grade">
        <nav class="rel-cartao dad-lista" aria-label="Tabelas"></nav>
        <section class="rel-cartao dad-tabela"></section>
      </div>`;
    el.querySelector('.dad-json').onclick = () => GC.baixarArquivo(GC.baseJson(base()), `vila-dourada-base-${hoje()}.json`, 'application/json');
    el.querySelector('.dad-md').onclick = () => GC.baixarArquivo(GC.dicionarioMd(base()), 'vila-dourada-dicionario-de-dados.md', 'text/markdown;charset=utf-8');

    function desenhar() {
      const { resumo, tabelas } = ultimo;
      const atual = tabelas.find((t) => t.id === id) || tabelas[0];
      el.querySelector('.dad-kpis').innerHTML = [
        ['Tabelas', resumo.tabelas], ['Registros', resumo.registros.toLocaleString('pt-BR')], ['Período', resumo.periodo], ['Atualizado', `há ${resumo.atualizadoHaMin} min`],
      ].map(([r, v]) => `<div class="rel-numero"><small>${r}</small><b>${esc(String(v))}</b></div>`).join('');
      const lista = el.querySelector('.dad-lista');
      lista.innerHTML = tabelas.map((t) => `<a href="${GC.hashDe({ tela: 'dados', tabela: t.id })}" data-tabela="${esc(t.id)}" class="${t.id === atual.id ? 'ativo' : ''}"><b>${esc(t.id)}</b><small>${esc(t.nome)} · ${t.linhas.length.toLocaleString('pt-BR')} linhas</small></a>`).join('');
      lista.querySelectorAll('[data-tabela]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); aoAbrirTabela(a.dataset.tabela); }; });
      const painel = el.querySelector('.dad-tabela');
      painel.innerHTML = `
        <div class="dad-cabecalho"><div><h3>${esc(atual.id)}</h3><p>${esc(atual.descricao)}</p></div><button type="button" class="btn-sec dad-csv">⬇ CSV</button></div>
        <details class="dad-colunas"><summary>Colunas (${atual.colunas.length})</summary><ul>${atual.colunas.map((c) => `<li><code>${esc(c.nome)}</code> ${esc(c.descricao)}</li>`).join('')}</ul></details>
        <p class="dad-previa-rotulo">Prévia: ${Math.min(PREVIA, atual.linhas.length)} de ${atual.linhas.length.toLocaleString('pt-BR')} linhas</p>
        <div class="rel-tabela-wrap"><table class="sec-tabela"><thead><tr>${atual.colunas.map((c) => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead>
        <tbody>${atual.linhas.slice(0, PREVIA).map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      painel.querySelector('.dad-csv').onclick = () => GC.baixarArquivo(GC.csvTabela(atual), `${atual.id}-${hoje()}.csv`, 'text/csv;charset=utf-8');
    }

    function mostrar(tabela, estado) {
      id = tabela;
      ultimo = estado;
      assinatura = assinar(estado);
      desenhar();
    }

    function atualizar(estado) {
      const nova = assinar(estado);
      ultimo = estado;
      if (nova === assinatura) return;
      assinatura = nova;
      const aberto = el.querySelector('.dad-colunas');
      const estavaAberto = aberto && aberto.open;
      GC.redesenharMantendo(el, ['.rel-tabela-wrap', '.dad-lista'], desenhar);
      if (estavaAberto) el.querySelector('.dad-colunas').open = true;
    }

    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
