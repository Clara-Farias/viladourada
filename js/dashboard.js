(function (GC) {
  // Menu em trilho flutuante (navegação entre telas), números-chave do cabeçalho,
  // contadores do menu e o cartão de pulso (usado no widget e na visão geral).
  const NUMEROS = [
    { chave: 'criticas', rotulo: 'críticas', classe: 'critico', recorte: 'criticas', dica: 'Mostrar só as críticas' },
    { chave: 'estouradas', rotulo: 'prazo estourado', classe: 'alerta', recorte: 'estourado', dica: 'Mostrar só as com prazo estourado' },
    { chave: 'emAndamento', rotulo: 'em atendimento', classe: 'andamento', recorte: 'andamento', dica: 'Mostrar só as que estão em atendimento' },
    // Satisfação saiu do cabeçalho (fica no widget e no dashboard): no topo só o que pede ação.
  ];
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);

  // Uma animação por número: a nova cancela a anterior (duas renderizações seguidas não deixam o valor velho por último).
  function contar(el, de, para, sufixo) {
    const inicio = performance.now();
    const dur = 600;
    const vez = (el._contagem = (el._contagem || 0) + 1);
    const passo = (agora) => {
      if (el._contagem !== vez) return;
      const t = Math.min(1, (agora - inicio) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(de + (para - de) * e) + (sufixo || '');
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // Seletor de bairro (usado no Painel e na visão geral das secretarias).
  GC.seletorBairro = function (aoSelecionar) {
    const label = document.createElement('label');
    label.className = 'seletor-bairro';
    label.innerHTML = `📍 Bairro <select aria-label="Bairro"><option value="">Cidade inteira</option>${GC.data.bairros.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join('')}</select>`;
    const select = label.querySelector('select');
    select.onchange = () => aoSelecionar(select.value || null);
    return { el: label, marcar: (id) => { select.value = id || ''; } };
  };

  GC.criarDashboard = function (el, opcoes) {
    const { aoIr, aoClicarNumero } = opcoes;

    // ---- menu de telas ----
    // O perfil de acesso troca o menu (setor: as telas da pasta; cidadão: "Para você", mapa e indicadores públicos).
    const ITENS_GESTOR = [
      // Seis destinos. Cada secretaria abre de dentro da tela Secretarias (antes eram 7 ícones parecidos).
      { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
      // Alertas fica fora do menu: a porta é o botão Alertas do cabeçalho (gaveta), e a Central
      // completa abre pelo rodapé dela.
      { rota: { tela: 'crise', id: null }, emoji: '🚨', nome: 'Gabinete de crise' },
      { rota: { tela: 'secretarias' }, emoji: '🏛', nome: 'Secretarias', inclui: ['secretaria'] },
      // Indicadores fica fora do menu: a porta é "Indicadores", na doca da base do mapa.
      { rota: { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }, emoji: '📄', nome: 'Relatórios' },
      { rota: { tela: 'cruzamento' }, emoji: '🔀', nome: 'Cruzamento de dados' },
      // Dados fica fora do menu: a porta é "Dados", no menu ⋯ do cabeçalho.
    ];
    const ITENS = GC.menuDoPerfil ? GC.menuDoPerfil(ITENS_GESTOR) : ITENS_GESTOR;
    el.menu.innerHTML = `<div class="menu-marca"><button type="button" class="menu-alternar" aria-expanded="false">☰</button>${GC.htmlLogoMarca ? GC.htmlLogoMarca() : '<span class="logo">GG</span>'}<b>${GC.produto ? GC.produto() : 'Golden Gov'}</b></div>`;
    const itens = [];

    // Menu recolhível (☰): começa recolhido; aberto, flutua por cima do mapa.
    const app = document.querySelector('.app');
    const btnMenu = el.menu.querySelector('.menu-alternar');
    function recolherMenu(valor) {
      app.classList.toggle('menu-recolhido', valor);
      btnMenu.title = valor ? 'Expandir o menu' : 'Recolher o menu';
      btnMenu.setAttribute('aria-label', btnMenu.title);
      btnMenu.setAttribute('aria-expanded', String(!valor));
    }
    btnMenu.onclick = () => recolherMenu(!app.classList.contains('menu-recolhido'));
    recolherMenu(true);
    // Clique fora do menu aberto e Esc também recolhem (aberto, ele cobre o título das telas).
    document.addEventListener('click', (ev) => {
      if (!app.classList.contains('menu-recolhido') && !el.menu.contains(ev.target)) recolherMenu(true);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !app.classList.contains('menu-recolhido')) { recolherMenu(true); btnMenu.focus(); }
    });
    ITENS.forEach((i) => {
      if (i.grupo) {
        el.menu.insertAdjacentHTML('beforeend', `<div class="menu-grupo">${esc(i.grupo)}</div>`);
        return;
      }
      const b = document.createElement('a');
      b.className = `menu-item${i.area ? ' sub' : ''}`;
      b.href = GC.hashDe(i.rota);
      b.title = i.nome;
      b.innerHTML = `<span class="menu-emoji">${i.emoji}</span><span class="menu-nome">${esc(i.nome)}</span>`;
      // Alertas abre a gaveta sobre o mapa (a Central completa fica no rodapé dela).
      // Escolher um destino também recolhe o menu.
      b.onclick = (e) => { e.preventDefault(); recolherMenu(true); if (i.gaveta && opcoes.aoGaveta) opcoes.aoGaveta(i.gaveta); else aoIr(i.rota); };
      itens.push({ b, i });
      el.menu.appendChild(b);
    });

    function marcarTela(rota) {
      itens.forEach(({ b, i }) => {
        // Relatórios fica ativo em qualquer relatório (tipo, alvo e período mudam).
        // Secretarias fica ativo também na página de uma secretaria.
        const ativo = (i.rota.tela === rota.tela && (rota.tela === 'relatorios' || rota.tela === 'cidadao' || rota.tela === 'crise' || i.rota.area === rota.area))
          || (i.inclui || []).includes(rota.tela);
        b.classList.toggle('ativo', ativo);
        if (ativo) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    }

    // Contador do item "Alertas": quantas precisam de atenção agora (o mesmo número do bloco).
    function marcarContadorAlertas(n) {
      const item = itens.find(({ i }) => i.contador);
      if (!item) return;
      let badge = item.b.querySelector('.badge');
      if (!n) { if (badge) badge.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; item.b.appendChild(badge); }
      badge.textContent = n;
    }

    // Número de ocorrências críticas por secretaria, no menu.
    function atualizarBadges(contagem) {
      itens.filter(({ i }) => i.area).forEach(({ b, i }) => {
        let badge = b.querySelector('.badge');
        const n = contagem[i.area] || 0;
        if (!n) { if (badge) badge.remove(); return; }
        if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; b.appendChild(badge); }
        badge.textContent = n;
      });
    }

    // ---- faixa de números ----
    el.kpis.innerHTML = `${NUMEROS.map((n) => `
      <button type="button" class="faixa-num ${n.classe}" data-numero="${n.chave}" title="${n.dica}"><b data-chave="${n.chave}">0${n.sufixo || ''}</b> ${n.rotulo}</button>`).join('')}`;
    el.kpis.querySelectorAll('[data-numero]').forEach((b) => {
      const n = NUMEROS.find((x) => x.chave === b.dataset.numero);
      b.onclick = () => aoClicarNumero(n.recorte || null, n.chave);
    });

    // Faixa estreita (menu e Copiloto abertos): os números rolam de lado. Um degradê na borda mostra que há
    // mais do que cabe, e a roda do mouse rola na horizontal.
    function marcarTransbordo() {
      const f = el.kpis;
      const max = f.scrollWidth - f.clientWidth;
      f.classList.toggle('mais-esq', max > 1 && f.scrollLeft > 1);
      f.classList.toggle('mais-dir', max > 1 && f.scrollLeft < max - 1);
    }
    el.kpis.addEventListener('scroll', marcarTransbordo, { passive: true });
    el.kpis.addEventListener('wheel', (ev) => {
      const f = el.kpis;
      if (f.scrollWidth <= f.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      f.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }, { passive: false });
    if (typeof ResizeObserver === 'function') new ResizeObserver(marcarTransbordo).observe(el.kpis);
    // Um número rolado para fora some sob o degradê: o foco do teclado o traz de volta à vista.
    el.kpis.addEventListener('focusin', (ev) => ev.target.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

    // Realça o número cujo recorte está ativo (um por vez).
    function marcarRecorte(recorte) {
      NUMEROS.forEach((n) => {
        const b = el.kpis.querySelector(`[data-numero="${n.chave}"]`);
        const ativo = !!n.recorte && n.recorte === recorte;
        b.classList.toggle('ativo', ativo);
        if (n.recorte) b.setAttribute('aria-pressed', String(ativo));
      });
    }
    const anteriores = {};

    function atualizarFaixa(kpis) {
      NUMEROS.forEach((n) => {
        const alvo = el.kpis.querySelector(`[data-chave="${n.chave}"]`);
        const de = anteriores[n.chave] || 0;
        if (de !== kpis[n.chave]) contar(alvo, de, kpis[n.chave], n.sufixo);
        anteriores[n.chave] = kpis[n.chave];
      });
      marcarTransbordo();
    }

    function marcarNumero(chave, ativo) {
      const b = el.kpis.querySelector(`[data-numero="${chave}"]`);
      if (!b) return; // número que não está no cabeçalho (ex.: satisfação)
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    }

    return { recolherMenu, marcarTela, atualizarFaixa, atualizarBadges, marcarContadorAlertas, marcarRecorte, marcarNumero };
  };

  // HTML de um cartão de pulso (Painel e visão geral das secretarias).
  // comNome: mostra a secretaria dona do indicador.
  GC.cartaoPulso = function (p, { comNome = false } = {}) {
    const a = area(p.area);
    const tom = p.neutro ? 'neutro' : p.positivo ? 'melhor' : 'pior';
    return `<button type="button" class="pulso status-${p.status}" data-pulso="${p.area}" title="${p.fonte ? `Fonte: ${esc(p.fonte)} · ` : ''}Abrir a página: ${esc(a.secretaria.nome)}">
      ${comNome ? `<span class="pulso-dono">${esc(a.nome)}</span>` : ''}
      <span class="pulso-rotulo">${a.secretaria.emoji} ${esc(p.rotulo)}</span>
      <b>${esc(p.nivel)}</b>
      <span class="pulso-var ${tom}" title="${p.neutro ? '' : p.positivo ? 'Melhorou' : 'Piorou'}">${p.neutro ? '' : `<i class="pulso-seta" aria-hidden="true">${String(p.variacao).trim().startsWith('-') ? '▼' : '▲'}</i>`}${esc(p.variacao)}${p.periodo ? ` ${p.periodo}` : ''}<span class="so-leitor">${p.neutro ? '' : p.positivo ? ', melhorou' : ', piorou'}</span></span>
    </button>`;
  };
})(window.GC = window.GC || {});
