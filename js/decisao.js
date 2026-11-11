(function (GC) {
  // Gaveta "Alertas" (pela direita, como Filtros e Copiloto): substitui a faixa que cobria o mapa.
  // Duas abas: "Precisam de você" (só as exceções: prazo estourado, mais de uma secretaria, caso
  // repetido) e "Todos ativos" (tudo o que está no mapa com os filtros atuais). Cada item abre o
  // detalhe na mesma gaveta, com "← Alertas" para voltar à lista.
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' }; // gravidade da ocorrência: o mesmo rótulo em todo o painel
  const ORDEM = { critica: 0, alta: 1, media: 2 };
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // O que o prefeito já fez e quando: o cartão continua na lista (a ocorrência segue aberta), mas desce.
  const FEITO = { cobrar: '📣 Você cobrou', priorizar: '⚡ Você priorizou', gabinete: '🚨 Você convocou o gabinete' };
  const feito = (o) => `${FEITO[o.acaoPrefeito]}${o.acaoEm ? ` há ${GC.tempoTexto(Math.max(1, (GC.agora() - o.acaoEm) / 60000))}` : ''}`;

  // Ativos em ordem de urgência: gravidade e, dentro dela, o prazo que vence primeiro.
  GC.ordenarAtivos = (lista) => lista.slice().sort((a, b) => (ORDEM[a.severidade] - ORDEM[b.severidade])
    || (GC.prazoRestanteMin(a) - GC.prazoRestanteMin(b)));

  GC.criarDecisao = function (el, opcoes) {
    const { aoAgir, aoDetalhar, aoRealcar, aoFechar, aoAbrirCentral } = opcoes;
    let aba = 'atencao'; // atencao | ativos
    let ultimo = { todas: [], ativos: [] };
    let extraUlt = { cidade: 0, temFiltro: false };

    el.raiz.innerHTML = `
      <header class="gaveta-cab">
        <div><h2>🔔 Alertas</h2><p class="alertas-sub">Tudo já foi encaminhado às secretarias. Aqui fica o que pede você.</p></div>
        <button type="button" class="gaveta-x" aria-label="Fechar Alertas">✕</button>
      </header>
      <div class="alertas-abas" role="tablist" aria-label="Quais alertas">
        <button type="button" role="tab" data-aba="atencao">👁 Precisam de você <b></b></button>
        <button type="button" role="tab" data-aba="ativos">Todos ativos <b></b></button>
      </div>
      <p class="alertas-explica"></p>
      <div class="gaveta-corpo alertas-lista" role="tabpanel"></div>
      <footer class="gaveta-pe">
        <small class="alertas-resumo"></small>
        <button type="button" class="btn-sec alertas-central">Central completa →</button>
      </footer>`;
    const lista = el.raiz.querySelector('.alertas-lista');
    const abas = [...el.raiz.querySelectorAll('[data-aba]')];
    el.raiz.querySelector('.gaveta-x').onclick = () => aoFechar && aoFechar();
    el.raiz.querySelector('.alertas-central').onclick = () => aoAbrirCentral && aoAbrirCentral();
    abas.forEach((b) => { b.onclick = () => { aba = b.dataset.aba; lista.scrollTop = 0; desenhar(); }; });

    function ligar(node, o) {
      node.onclick = () => aoDetalhar(o.id);
      node.onkeydown = (e) => { if (e.key === 'Enter' && e.target === node) aoDetalhar(o.id); };
      node.onmouseenter = () => aoRealcar(o.id);
      node.onmouseleave = () => aoRealcar(null);
      node.querySelectorAll('[data-acao]').forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); aoAgir(o.id, b.dataset.acao); };
      });
    }

    const envolvidas = (o) => o.areasEnvolvidas.map((a) => `${area(a).secretaria.emoji} ${esc(area(a).nome)}`).join(' + ');

    // Etiqueta do motivo principal, curta para caber ao lado do título (o texto completo fica no title).
    function chipMotivo(m, o) {
      if (m.tipo === 'prazo') return `⏰ ${GC.tempoTexto(-GC.prazoRestanteMin(o))} de atraso`;
      if (m.tipo === 'recorrente') { const n = /(\d+º)/.exec(m.texto); return n ? `🔁 ${n[1]} chamado` : m.curto; }
      return m.curto || m.texto;
    }

    // Barra do prazo para pôr equipe em campo: quanto já foi consumido. Em campo, a barra some e fica o texto.
    function prazoBarra(o) {
      if (o.status !== 'encaminhada') return `<div class="alerta-prazo"><span>${esc(GC.situacao(o))}</span></div>`;
      const usado = GC.idadeMin(o) / o.prazoMin;
      const r = GC.prazoRestanteMin(o);
      const tom = usado >= 1 ? 'estourado' : usado >= 0.75 ? 'quase' : '';
      const texto = r < 0 ? `estourado há ${GC.tempoTexto(-r)} · prazo de ${GC.tempoTexto(o.prazoMin)}` : `faltam ${GC.tempoTexto(r)} de ${GC.tempoTexto(o.prazoMin)}`;
      return `<div class="alerta-prazo ${tom}"><i class="barra" role="img" aria-label="Prazo: ${esc(texto)}"><b style="width:${Math.round(Math.min(1, usado) * 100)}%"></b></i><span>${esc(o.acaoPrefeito ? GC.situacao(o) : texto)}</span></div>`;
    }

    // Cartão em 4 linhas: título com o motivo, onde e quem, prazo, uma ação. A gravidade fica na barra lateral
    // e num ponto colorido; vermelho forte só no que está estourado e ninguém agiu.
    function item(o) {
      const div = document.createElement('article');
      const tratada = aba === 'atencao' && !!o.acaoPrefeito;
      div.className = `alerta-item ${o.severidade}${GC.estourada(o) && !o.acaoPrefeito ? ' estourada' : ''}${tratada ? ' tratada' : ''}`;
      div.dataset.abreGaveta = '';
      div.dataset.id = o.id;
      div.tabIndex = 0;
      div.setAttribute('aria-label', `${SEV[o.severidade]}: ${o.titulo}, ${bairro(o.bairroId).nome}${tratada ? `. ${feito(o)}` : ''}`);
      const [principal, ...outros] = GC.motivosAtencao(o);
      const chip = tratada ? `<span class="alerta-chip m-feito">${esc(feito(o))}</span>`
        : principal ? `<span class="alerta-chip m-${principal.tipo}" title="${esc(principal.texto)}">${esc(chipMotivo(principal, o))}</span>` : '';
      const extras = (tratada ? [principal, ...outros].filter(Boolean) : outros)
        .map((m) => `<span class="motivo-mini m-${m.tipo}" title="${esc(m.texto)}">${esc(m.curto || m.texto)}</span>`).join('');
      div.innerHTML = `
        <div class="alerta-topo"><h3>${esc(o.titulo)}</h3>${chip}</div>
        <div class="alerta-tag"><span class="sev-pt ${o.severidade}" aria-hidden="true"></span><span class="sev-txt">${SEV[o.severidade]}</span> · ${esc(bairro(o.bairroId).nome)} · ${envolvidas(o)}${extras ? ` ${extras}` : ''}</div>
        ${prazoBarra(o)}
        <div class="alerta-pe">${GC.botoesAcao(o, { principal: true })}<button type="button" class="alerta-ver">Detalhes</button></div>`;
      ligar(div, o);
      return div;
    }

    function desenhar() {
      const { todas, ativos } = ultimo;
      const itens = aba === 'atencao' ? todas : ativos;
      abas.forEach((b) => {
        const ativa = b.dataset.aba === aba;
        b.classList.toggle('ativo', ativa);
        b.setAttribute('aria-selected', String(ativa));
        b.querySelector('b').textContent = b.dataset.aba === 'atencao' ? todas.length : ativos.length;
      });
      el.raiz.querySelector('.alertas-explica').textContent = aba === 'atencao'
        ? `${todas.length} de ${ativos.length} ativos fugiram do normal: prazo estourado, mais de uma secretaria ou bairro com muitos chamados da mesma secretaria.`
        : 'Tudo o que está no mapa agora, do mais urgente para o menos.';
      el.raiz.querySelector('.alertas-resumo').textContent = extraUlt.temFiltro
        ? `Com os filtros atuais · ${extraUlt.cidade} na cidade` : 'Cidade inteira';
      const rolagem = lista.scrollTop;
      lista.innerHTML = '';
      if (!itens.length) {
        lista.innerHTML = `<p class="decisao-vazio">${aba === 'atencao' ? 'Nada fugiu do normal agora 🎉' : 'Nenhuma ocorrência ativa com estes filtros.'}</p>`;
        return;
      }
      // A store já põe as tratadas por último; um divisor separa as duas partes.
      const pendentes = aba === 'atencao' ? itens.filter((o) => !o.acaoPrefeito).length : itens.length;
      itens.forEach((o, i) => {
        if (i === pendentes) {
          lista.insertAdjacentHTML('beforeend', `<h3 class="alertas-divisor">✓ Você já agiu · ${itens.length - pendentes} aguardando a secretaria</h3>`);
        }
        lista.appendChild(item(o, i));
      });
      lista.scrollTop = rolagem;
    }

    // estado: { todas: exceções, ativos: tudo que está no mapa }; extra: total da cidade e se há filtro.
    function atualizar(estado, extra = { cidade: estado.todas.length, temFiltro: false }) {
      ultimo = { todas: estado.todas, ativos: GC.ordenarAtivos(estado.ativos || estado.todas) };
      extraUlt = extra;
      desenhar();
    }

    return { atualizar, mostrarAba: (a) => { aba = a; desenhar(); } };
  };
})(window.GC = window.GC || {});
