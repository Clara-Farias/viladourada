(function (GC) {
  // Gavetas pela direita: Filtros, Widgets, Visualizações, Copiloto e Detalhes do alerta.
  // Uma por vez, por cima do mapa (não o empurram). Quem abre/fecha avisa pelo aoTrocar.
  GC.criarGavetas = function (raiz, { aoTrocar, botoes = {} } = {}) {
    const paineis = {};
    // Cada painel é um diálogo não modal: o mapa atrás continua usável (os filtros valem ao vivo),
    // por isso o foco não fica preso; ele entra na gaveta ao abrir e volta ao botão ao fechar.
    raiz.querySelectorAll('[data-gaveta]').forEach((p) => {
      paineis[p.dataset.gaveta] = p;
      if (!p.hasAttribute('role')) p.setAttribute('role', 'dialog');
      if (!p.hasAttribute('tabindex')) p.tabIndex = -1;
    });
    let aberta = null;
    let esconder = null;

    function marcarBotoes() {
      Object.entries(botoes).forEach(([nome, b]) => {
        if (!b) return;
        b.classList.toggle('ativo', aberta === nome);
        b.setAttribute('aria-expanded', String(aberta === nome));
      });
    }

    // focar: aberta por um gesto da pessoa (botão) → o foco entra no painel (o leitor de tela anuncia o nome).
    function abrir(nome, { focar = false } = {}) {
      if (!paineis[nome] || aberta === nome) return;
      const anterior = aberta;
      aberta = nome;
      clearTimeout(esconder);
      Object.entries(paineis).forEach(([n, p]) => { p.hidden = n !== nome; });
      raiz.dataset.aberta = nome;
      raiz.hidden = false;
      requestAnimationFrame(() => raiz.classList.add('aberta'));
      marcarBotoes();
      if (aoTrocar) aoTrocar(anterior, nome);
      if (focar) paineis[nome].focus({ preventScroll: true });
    }

    // Fecha a gaveta aberta (ou só a indicada, se for ela). Devolve true se fechou algo.
    function fechar(nome) {
      if (!aberta || (nome && nome !== aberta)) return false;
      const anterior = aberta;
      // O foco estava na gaveta (ou se perdeu no redesenho): volta ao botão que a abre, se houver.
      const a = document.activeElement;
      const devolverFoco = (!a || a === document.body || raiz.contains(a)) && botoes[anterior];
      aberta = null;
      raiz.classList.remove('aberta');
      delete raiz.dataset.aberta;
      clearTimeout(esconder);
      esconder = setTimeout(() => { if (!aberta) raiz.hidden = true; }, 280);
      marcarBotoes();
      if (aoTrocar) aoTrocar(anterior, null);
      if (devolverFoco) devolverFoco.focus({ preventScroll: true });
      return true;
    }

    const alternar = (nome) => (aberta === nome ? fechar() : abrir(nome, { focar: true }));
    Object.entries(botoes).forEach(([nome, b]) => { if (b) b.addEventListener('click', () => alternar(nome)); });

    return { abrir, fechar, alternar, aberta: () => aberta, largura: () => (aberta ? raiz.offsetWidth : 0), painel: (n) => paineis[n] };
  };
})(window.GC = window.GC || {});
