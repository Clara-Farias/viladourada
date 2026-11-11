(function (GC) {
  // Visão geral das secretarias: chips para focar numa secretaria, painel da escolhida (com o
  // indicador principal dela) e o atendimento dos últimos 30 dias, tudo no bairro do Painel.
  const esc = (t) => GC.escaparHtml(t);
  const STATUS = { em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const STATUS_META = { concluida: 'Concluída', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: '' }).nome;
  // A dica de uso aparece até a pessoa dispensar ou usar um chip (por navegador).
  const CHAVE_DICA = 'vd-secretarias-dica-vista';
  const dicaVista = () => { try { return localStorage.getItem(CHAVE_DICA) === '1'; } catch (e) { return false; } };

  function chips(estado) {
    const porArea = Object.fromEntries(estado.desempenho.secretarias.map((s) => [s.area, s]));
    const status = Object.fromEntries(estado.pulsos.map((p) => [p.area, p.status]));
    const chip = (id) => {
      const a = area(id);
      const s = porArea[id] || {};
      const ativo = estado.area === id;
      const st = STATUS[status[id]] || '';
      const atras = s.atrasadas ? `${s.atrasadas} atrasada${s.atrasadas > 1 ? 's' : ''}` : '';
      // Contagem com o mesmo relógio da coluna "Atrasadas" do ranking (não parece notificação).
      return `<button type="button" class="sec-chip st-borda-${status[id] || 'em_dia'}${ativo ? ' ativo' : ''}" data-chip="${id}" aria-pressed="${ativo}"
        aria-label="${esc([a.nome, st, atras].filter(Boolean).join(', '))}"
        title="${esc(a.secretaria.nome)} · ${st}${atras ? ` · ${atras} agora` : ''}">
        <span class="sec-chip-ponto" aria-hidden="true"></span>${a.secretaria.emoji} ${esc(a.nome)}${s.atrasadas ? `<span class="sec-chip-n" aria-hidden="true">⏰ ${s.atrasadas}</span>` : ''}</button>`;
    };
    return `<button type="button" class="sec-chip${estado.area ? '' : ' ativo'}" data-chip="" aria-pressed="${!estado.area}">Todas</button>
      ${GC.data.areas.map((a) => chip(a.id)).join('')}`;
  }

  // Indicador principal da secretaria (o antigo cartão do "pulso"), agora dentro do painel do chip.
  function indicadorPrincipal(estado, area) {
    const p = estado.pulsos.find((x) => x.area === area);
    if (!p) return '';
    const nB = estado.bairros ? estado.bairros.length : 0;
    const dica = nB
      ? `Indicador no bairro em 30 dias, comparado à ${nB > 1 ? 'média dos bairros' : 'média por bairro / cidade'}`
      : 'Indicador principal da secretaria e a variação no período';
    const tom = p.neutro ? 'igual' : p.positivo ? 'melhor' : 'pior';
    return `<div class="sec-foco-ind" title="${esc(dica)}"><b>${esc(p.nivel)}</b><small>${esc(p.rotulo)}</small>
      <i class="${tom}">${esc(p.variacao)}${p.periodo ? ` ${esc(p.periodo)}` : ''}</i></div>`;
  }

  // Painel da secretaria escolhida no chip.
  function foco(estado) {
    const p = estado.pagina;
    if (!p) return '';
    const s = estado.desempenho.secretarias.find((x) => x.area === p.area) || {};
    const bs = estado.bairros;
    const alertas = bs ? p.alertas.filter((o) => bs.includes(o.bairroId)) : p.alertas;
    const casos = estado.bairrosDaArea.map((b) => b.casos);
    const maxCasos = Math.max(1, ...casos);
    // Barras só quando há diferença real entre os bairros (5, 5, 5, 4 não diz nada a mais que os números).
    const comBarras = casos.length > 1 && (maxCasos - Math.min(...casos)) / maxCasos >= 0.3;
    const exec = p.orcamento.executadoPct;
    // Mesmo recorte do bloco "Atendimento" (que some com secretaria escolhida): traz a variação para cá.
    const r = estado.desempenho.resumo || {};
    const temR = r.resolvidas !== undefined;
    const meta = s.metaPrazoPct || 85;
    const noPrazo = temR ? r.noPrazoPct : s.noPrazoPct;
    return `
      <section class="painel-card sec-foco" aria-label="${esc(p.secretaria.nome)}">
        <div class="sec-foco-topo">
          <div>
            <h3>${p.secretaria.emoji} ${esc(p.secretaria.nome)} <span class="sec-status st-${p.status}">${STATUS[p.status]}</span></h3>
            <p>Orçamento 2026: R$ ${p.orcamento.dotacaoMi.toLocaleString('pt-BR')} mi
              <span class="sec-foco-exec" title="Orçamento executado"><i style="width:${exec}%"></i></span> ${exec}% executado
              · base atualizada há ${p.base.atualizadoHaMin} min</p>
          </div>
          <span class="sec-acoes">
            <button type="button" class="btn-sec" data-foco="perguntar">✨ Perguntar</button>
            <button type="button" class="btn-sec" data-foco="pagina">Abrir página completa ›</button>
          </span>
        </div>
        <div class="sec-foco-numeros">
          ${indicadorPrincipal(estado, p.area)}
          <div><b>${s.abertas ?? alertas.length}</b><small>abertas agora${bs ? ' no bairro' : ''}</small></div>
          <div><b class="${s.atrasadas ? 'abaixo' : ''}">${s.atrasadas || 0}</b><small>atrasadas agora</small></div>
          <div><b>${temR ? r.resolvidas : s.resolvidas ?? '—'}</b><small>resolvidas em 30 dias</small>${temR ? GC.variacaoTexto(r.resolvidas, r.resolvidasAnt, '%', 'mais') : ''}</div>
          <div><b class="${noPrazo < meta ? 'abaixo' : ''}">${noPrazo ?? '—'}%</b><small>no prazo (meta ${meta}%)</small>${temR ? GC.variacaoTexto(r.noPrazoPct, r.noPrazoPctAnt, 'p.p.', 'mais') : ''}</div>
        </div>
        <div class="sec-foco-grade">
          <div>
            <h4>Metas do plano de governo</h4>
            ${p.metas.map((m) => `<div class="sec-meta">
              <div class="sec-meta-topo"><span title="${esc(m.titulo)}">${esc(m.titulo)}</span><span class="sec-status st-${m.status}">${STATUS_META[m.status]}</span></div>
              <div class="sec-meta-linha"><div class="sec-barra"><i class="st-${m.status}" style="width:${m.progressoPct}%"></i></div>
              <small>${m.progressoPct}% · até ${esc(m.prazo)}</small></div></div>`).join('')}
          </div>
          <div>
            <h4>Bairros com mais casos <small>30 dias</small></h4>
            ${estado.bairrosDaArea.length ? `<ul class="sec-foco-bairros${comBarras ? '' : ' sem-barras'}">${estado.bairrosDaArea.map((b) => `<li><button type="button" data-bairro="${b.bairroId}"
              class="${bs && bs.includes(b.bairroId) ? 'ativo' : ''}" title="Ver ${esc(b.nome)}">
              <span>${esc(b.nome)}</span>${comBarras ? `<span class="sec-foco-barra"><i style="width:${Math.round((b.casos / maxCasos) * 100)}%"></i></span>` : ''}
              <b>${b.casos}</b>${b.abertas ? `<small>${b.abertas} aberta(s)</small>` : '<small></small>'}</button></li>`).join('')}</ul>`
              : '<p class="painel-vazio">Sem casos registrados em 30 dias.</p>'}
          </div>
          <div>
            <h4>Alertas ativos${bs ? ' no bairro' : ''} (${alertas.length})</h4>
            ${alertas.length ? `<ul class="sec-foco-alertas">${alertas.slice(0, 4).map((o) => `<li><button type="button" data-alerta="${o.id}">
              <span class="sev-ponto ${o.severidade}" aria-hidden="true"></span><b>${esc(o.titulo)}</b>
              <small>${esc(nomeBairro(o.bairroId))} · ${esc(GC.situacao(o))}</small></button></li>`).join('')}</ul>
              ${alertas.length > 4 ? `<button type="button" class="link-mais" data-foco="pagina">+${alertas.length - 4} na página da secretaria ›</button>` : ''}`
              : '<p class="painel-vazio">Nenhum alerta ativo 🎉</p>'}
          </div>
        </div>
      </section>`;
  }

  GC.criarTelaSecretarias = function (el, opcoes) {
    const { aoSelecionarBairro, aoSelecionarArea, aoAbrirSecretaria, aoVerResolvida, aoRelatorioExecutivo, aoRelatorioSecretaria, aoAbrirAlerta, aoPerguntar } = opcoes;
    el.innerHTML = `
      <header class="sec-topo">
        <div><h2>📊 Secretarias <span class="sec-sub">· visão geral</span><span class="sec-bairro"></span></h2>
        <p class="sec-dica"${dicaVista() ? ' hidden' : ''}>Escolha uma secretaria nos chips para ver o resumo dela; clique na linha do ranking para abrir a página completa.
          <button type="button" class="sec-dica-ok" aria-label="Dispensar a dica">Entendi</button></p></div>
      </header>
      <nav class="sec-chips" aria-label="Filtrar por secretaria"></nav>
      <div class="visao-foco"></div>
      <h3 class="sec-secao"><span>Atendimento</span> <small>últimos 30 dias</small></h3>
      <div class="visao-desempenho"></div>`;
    const seletor = GC.seletorBairro(aoSelecionarBairro);
    const acoes = document.createElement('span');
    acoes.className = 'sec-acoes';
    acoes.innerHTML = '<button type="button" class="btn-primario sec-relatorio">📄 Relatório executivo</button>';
    acoes.prepend(seletor.el);
    el.querySelector('.sec-topo').appendChild(acoes);
    const $ = (s) => el.querySelector(s);
    let ultimo = null;
    $('.sec-dica-ok').onclick = dispensarDica;

    // Celular: ao rolar para baixo o botão de menu flutuante se recolhe (o CSS lê esta classe).
    let topoAnterior = 0;
    el.addEventListener('scroll', () => {
      const y = el.scrollTop;
      if (Math.abs(y - topoAnterior) < 6) return;
      el.classList.toggle('rolando-desce', y > topoAnterior && y > 80);
      topoAnterior = y;
    }, { passive: true });

    // Chips que rolam na horizontal: esmaece a borda do lado que ainda tem chip escondido.
    const nav = $('.sec-chips');
    const marcarRolagemChips = () => {
      const resto = nav.scrollWidth - nav.clientWidth;
      nav.classList.toggle('mais-direita', resto > 4 && nav.scrollLeft < resto - 4);
      nav.classList.toggle('mais-esquerda', resto > 4 && nav.scrollLeft > 4);
    };
    nav.addEventListener('scroll', marcarRolagemChips, { passive: true });
    window.addEventListener('resize', marcarRolagemChips);

    function dispensarDica() {
      $('.sec-dica').hidden = true;
      try { localStorage.setItem(CHAVE_DICA, '1'); } catch (e) { /* sem armazenamento: só some agora */ }
    }

    function atualizar(estado) {
      ultimo = estado;
      const { bairro, desempenho: d, area: escolhida } = estado;
      seletor.marcar(bairro);
      const nBairros = estado.bairros ? estado.bairros.length : 0;
      const local = bairro ? `📍 ${nomeBairro(bairro)}` : nBairros > 1 ? `📍 ${nBairros} bairros` : '';
      const nome = escolhida ? area(escolhida).nome : '';
      // Recorte atual em etiquetas: no celular vão para uma linha própria, sem quebrar o título.
      $('.sec-bairro').innerHTML = [nome, local].filter(Boolean).map((t) => `<span class="sec-tag">${esc(t)}</span>`).join('');
      const rel = $('.sec-relatorio');
      rel.textContent = escolhida ? '📄 Relatório da secretaria' : '📄 Relatório executivo';
      rel.onclick = () => (escolhida ? aoRelatorioSecretaria(escolhida) : aoRelatorioExecutivo());

      nav.innerHTML = chips(estado);
      // No celular os chips rolam na horizontal: mantém o escolhido à vista.
      const ativo = nav.querySelector('.sec-chip.ativo');
      if (ativo && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, ativo.offsetLeft - nav.offsetLeft - 8);
      requestAnimationFrame(marcarRolagemChips);
      nav.querySelectorAll('[data-chip]').forEach((b) => {
        b.onclick = () => {
          if (b.dataset.chip) dispensarDica(); // já usou o filtro: a dica cumpriu o papel
          aoSelecionarArea(b.dataset.chip && b.dataset.chip !== escolhida ? b.dataset.chip : null);
        };
      });

      const f = $('.visao-foco');
      f.innerHTML = foco(estado);
      f.querySelectorAll('[data-foco="pagina"]').forEach((b) => { b.onclick = () => aoAbrirSecretaria(escolhida); });
      const perguntar = f.querySelector('[data-foco="perguntar"]');
      if (perguntar) perguntar.onclick = () => aoPerguntar(`Como está a ${area(escolhida).secretaria.nome}${bairro ? ` em ${nomeBairro(bairro)}` : ''}?`);
      f.querySelectorAll('[data-bairro]').forEach((b) => {
        b.onclick = () => aoSelecionarBairro(bairro === b.dataset.bairro ? null : b.dataset.bairro);
      });
      f.querySelectorAll('[data-alerta]').forEach((b) => { b.onclick = () => aoAbrirAlerta(b.dataset.alerta); });

      GC.desenharDesempenho($('.visao-desempenho'), d, {
        aoClicarArea: aoAbrirSecretaria,
        aoVerResolvida,
        selecionada: escolhida,
        semKpis: !!escolhida, // os números já estão no painel da secretaria, com a variação
        aoAcaoRuim: (acao) => {
          if (!acao) return;
          if (acao.area) aoSelecionarArea(acao.area);
          else if (acao.bairro) aoSelecionarBairro(acao.bairro);
        },
      });
    }

    return { mostrar: atualizar, atualizar, estado: () => ultimo };
  };
})(window.GC = window.GC || {});
