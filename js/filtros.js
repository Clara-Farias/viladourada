(function (GC) {
  // v3: gaveta de Filtros, legenda (só informa) e as visualizações (seletor rápido ao lado
  // da busca, sobre o mapa + gaveta para gerenciar). Os filtros ligados se editam na gaveta.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = [
    { id: 'critica', nome: 'Crítica' },
    { id: 'alta', nome: 'Alta' },
    { id: 'media', nome: 'Média' },
  ];
  const RECORTES = [
    { id: null, nome: 'Todas' },
    { id: 'criticas', nome: 'Só críticas' },
    { id: 'estourado', nome: 'Prazo estourado' },
    { id: 'andamento', nome: 'Em atendimento' },
  ];
  // Filtros de lista (vários valores): data-f → campo do estado e as opções.
  const LISTAS = {
    afetados: { campo: 'afetados', opcoes: () => GC.FAIXAS_AFETADOS },
    tempo: { campo: 'tempos', opcoes: () => GC.FAIXAS_TEMPO },
    origem: { campo: 'origens', opcoes: () => GC.ORIGENS },
  };
  const VAZIO = { recorte: null, severidades: [], areas: [], bairros: [], afetados: [], tempos: [], origens: [], multi: false };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const cabecalho = (titulo, sub) => `
    <header class="gaveta-cab">
      <div><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <button type="button" class="gaveta-x" data-fechar aria-label="Fechar">✕</button>
    </header>`;

  // Alterna um item numa lista (devolve uma lista nova).
  const alternarEm = (lista, id) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  // Redesenhar com innerHTML destrói o controle com foco: guarda qual era (pelos data-*) e o devolve.
  const ATRIBUTOS_FOCO = ['data-f-bairro', 'data-f', 'data-vista', 'data-subir', 'data-descer', 'data-renomear', 'data-duplicar', 'data-excluir'];
  function chaveDoFoco(raiz) {
    const a = document.activeElement;
    if (!a || a === raiz || !raiz.contains(a)) return null;
    const attr = ATRIBUTOS_FOCO.find((n) => a.hasAttribute(n));
    if (attr === 'data-f') return `[data-f="${a.dataset.f}"][data-v="${a.dataset.v}"]`;
    if (attr) return `[${attr}="${a.getAttribute(attr)}"]`;
    if (a.matches('summary')) return 'summary';
    const marca = [...a.attributes].find((x) => x.name.startsWith('data-'));
    return marca ? `[${marca.name}]` : null;
  }
  function devolverFoco(raiz, chave, reserva) {
    if (!chave) return;
    let alvo = raiz.querySelector(chave);
    if (!alvo || alvo.disabled) alvo = reserva ? raiz.querySelector(reserva) : null;
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    if (alvo.tagName === 'INPUT' && alvo.type !== 'checkbox') alvo.setSelectionRange(alvo.value.length, alvo.value.length);
  }

  // areasFixas: perfil de secretaria. A pasta é imposta pelo perfil: não aparece como filtro
  // removível, não conta no contador e as outras secretarias nem são oferecidas.
  GC.criarFiltrosUI = function (el, { aoMudar, aoFechar, aoSalvarVista, areasFixas = null }) {
    let f = Object.assign({}, VAZIO);
    let buscaBairro = ''; // texto da busca na lista de bairros (sobrevive ao redesenho da gaveta)
    let maisAberto = false; // "Mais filtros" aberto (sobrevive ao redesenho)
    // Filtros que a pessoa ligou (a pasta fixa do perfil não conta).
    const contar = () => GC.contarFiltrosEstado(areasFixas ? Object.assign({}, f, { areas: [] }) : f);
    const contarMais = () => f.origens.length + (f.multi ? 1 : 0);

    function mudar(parcial) { aoMudar(Object.assign({}, f, parcial)); }

    // Um só ouvinte por contêiner: os botões trazem data-f (qual filtro) e data-v (valor).
    // "Só críticas" (Situação) e Gravidade dizem a mesma coisa: a última escolha vale e desliga a outra,
    // para não somar duas condições que se anulam (ex.: Só críticas + Média = 0 ocorrências).
    function aplicarClique(b) {
      const v = b.dataset.v === '' ? null : b.dataset.v;
      const tipo = b.dataset.f;
      if (tipo === 'recorte') mudar(v === 'criticas' ? { recorte: v, severidades: [] } : { recorte: v });
      if (tipo === 'sev') mudar(Object.assign({ severidades: alternarEm(f.severidades, v) }, f.recorte === 'criticas' ? { recorte: null } : {}));
      if (tipo === 'area' && !areasFixas) mudar({ areas: v === null ? [] : alternarEm(f.areas, v) });
      if (tipo === 'bairro') mudar({ bairros: v === null ? [] : alternarEm(f.bairros, v) });
      if (LISTAS[tipo]) { const c = LISTAS[tipo].campo; mudar({ [c]: v === null ? [] : alternarEm(f[c], v) }); }
      if (tipo === 'multi') mudar({ multi: !f.multi });
    }

    // ---- gaveta ----
    el.gaveta.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) return aplicarClique(b);
      const resumo = e.target.closest('.mais-filtros > summary');
      if (resumo) { maisAberto = !resumo.parentElement.open; return; }
      if (e.target.closest('[data-fechar]')) return aoFechar();
      if (e.target.closest('[data-limpar]')) return aoMudar(VAZIO);
      if (e.target.closest('[data-salvar-vista]')) return aoSalvarVista();
    });

    // Seleção múltipla. Poucos bairros: um botão por bairro (liga/desliga). Cidade grande (dezenas de
    // bairros): lista com busca e caixas de marcar, em ordem alfabética.
    const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function seletorBairro() {
      const bairros = GC.data.bairros;
      if (bairros.length <= 20) return `<div class="chips">${chip('bairro', null, 'Todos', !f.bairros.length)}${bairros.map((b) => chip('bairro', b.id, esc(b.nome), f.bairros.includes(b.id))).join('')}</div>`;
      const ordem = [...bairros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const q = normalizar(buscaBairro.trim());
      const n = f.bairros.length;
      return `<div class="multi-bairro">
          <div class="mb-topo">
            <input type="search" class="mb-busca" data-busca-bairro placeholder="Buscar entre ${bairros.length} bairros…" aria-label="Buscar bairro" value="${esc(buscaBairro)}">
            <button type="button" class="mb-limpar" data-f="bairro" data-v=""${n ? '' : ' disabled'}>${n ? `Limpar (${n})` : 'Todos'}</button>
          </div>
          <div class="mb-lista" role="group" aria-label="Bairros">${ordem.map((b) => `<label class="mb-item${f.bairros.includes(b.id) ? ' marcado' : ''}"${q && !normalizar(b.nome).includes(q) ? ' hidden' : ''} data-nome="${esc(normalizar(b.nome))}"><input type="checkbox" data-f-bairro="${b.id}"${f.bairros.includes(b.id) ? ' checked' : ''}> ${esc(b.nome)}</label>`).join('')}</div>
          <p class="mb-vazio" hidden>Nenhum bairro com esse nome.</p>
        </div>`;
    }
    function filtrarListaBairros() {
      const q = normalizar(buscaBairro.trim());
      let visiveis = 0;
      el.gaveta.querySelectorAll('.mb-item').forEach((l) => { l.hidden = !!q && !l.dataset.nome.includes(q); if (!l.hidden) visiveis++; });
      const vazio = el.gaveta.querySelector('.mb-vazio');
      if (vazio) vazio.hidden = visiveis > 0;
    }
    el.gaveta.addEventListener('change', (e) => {
      const id = e.target.dataset && e.target.dataset.fBairro;
      if (id) mudar({ bairros: alternarEm(f.bairros, id) });
    });
    el.gaveta.addEventListener('input', (e) => {
      if (!e.target.matches('[data-busca-bairro]')) return;
      buscaBairro = e.target.value;
      filtrarListaBairros();
    });

    function chip(filtro, valor, rotulo, ativo, extra = '') {
      return `<button type="button" class="chip-f${ativo ? ' ativo' : ''}" data-f="${filtro}" data-v="${valor === null ? '' : valor}" aria-pressed="${ativo}">${extra}${rotulo}</button>`;
    }
    // Grupo de faixas (afetados, tempo, origem): nenhuma marcada = todas.
    function grupoLista(tipo, titulo) {
      const { campo, opcoes } = LISTAS[tipo];
      return `<fieldset><legend>${titulo} <small>(nenhuma = todas)</small></legend><div class="chips">${opcoes().map((x) => chip(tipo, x.id, esc(x.nome), f[campo].includes(x.id))).join('')}</div></fieldset>`;
    }

    function secretarias() {
      if (!areasFixas) return `<fieldset><legend>Secretarias</legend><div class="chips">${chip('area', null, 'Todas', !f.areas.length)}${GC.data.areas.map((a) => chip('area', a.id, esc(a.nome), f.areas.includes(a.id), `${a.emoji} `)).join('')}</div></fieldset>`;
      const nomes = areasFixas.map(area).filter(Boolean);
      return `<fieldset><legend>${nomes.length === 1 ? 'Sua pasta' : 'Suas pastas'}</legend><div class="chips">${nomes.map((a) => `<span class="chip-f fixo" title="Definido pelo seu perfil de acesso"><i class="ti ti-lock" aria-hidden="true"></i> ${a.emoji} ${esc(a.nome)}</span>`).join('')}</div>
        <p class="filtro-nota">Seu perfil mostra só ${nomes.length === 1 ? 'esta secretaria' : 'estas secretarias'}.</p></fieldset>`;
    }

    function desenharGaveta(total) {
      const n = contar();
      // A parte fixa: aviso para leitor de tela (o total não ocupa mais espaço na tela).
      if (!el.gaveta.querySelector('.filtros-anuncio')) {
        el.gaveta.innerHTML = '<p class="filtros-anuncio so-leitor" aria-live="polite"></p><div class="filtros-redesenho"></div>';
      }
      const caixa = el.gaveta.querySelector('.filtros-redesenho');
      const lista = el.gaveta.querySelector('.mb-lista');
      const rolagemLista = lista ? lista.scrollTop : 0;
      const foco = chaveDoFoco(el.gaveta);
      el.gaveta.querySelector('.filtros-anuncio').textContent = `${plural(total, 'ocorrência', 'ocorrências')} no mapa`;
      const nMais = contarMais();
      const abrirMais = maisAberto || nMais > 0;
      caixa.innerHTML = `
        <div class="gaveta-corpo">
          ${!total && n ? `<p class="filtros-zero"><b>Nenhuma ocorrência</b> com ${n === 1 ? 'este filtro' : 'estes filtros'}. <button type="button" class="link-acao" data-limpar>Limpar filtros</button></p>` : ''}
          <fieldset><legend>Situação</legend><div class="chips">${RECORTES.map((r) => chip('recorte', r.id, r.nome, f.recorte === r.id)).join('')}</div></fieldset>
          <fieldset><legend>Gravidade <small>(nenhuma = todas)</small></legend><div class="chips">${SEV.map((s) => chip('sev', s.id, s.nome, f.severidades.includes(s.id), `<i class="bola ${s.id}"></i>`)).join('')}</div></fieldset>
          ${secretarias()}
          ${grupoLista('afetados', 'Pessoas afetadas')}
          ${grupoLista('tempo', 'Tempo aberta')}
          <fieldset><legend>Bairros <small>(nenhum = cidade inteira)</small></legend>${seletorBairro()}</fieldset>
          <details class="mais-filtros"${abrirMais ? ' open' : ''}>
            <summary>Mais filtros${nMais ? ` <span class="mais-n">${nMais}</span>` : ''}</summary>
            ${grupoLista('origem', 'Origem do aviso')}
            <fieldset><legend>Coordenação</legend><div class="chips">${chip('multi', null, 'Envolve mais de uma secretaria', f.multi, '🤝 ')}</div></fieldset>
          </details>
        </div>
        <footer class="gaveta-pe">
          <button type="button" class="btn-sec" data-limpar${n ? '' : ' disabled'}>Limpar tudo</button>
          <button type="button" class="btn-sec principal" data-salvar-vista>💾 Salvar como visualização</button>
        </footer>`;
      const novaLista = el.gaveta.querySelector('.mb-lista');
      if (novaLista) novaLista.scrollTop = rolagemLista;
      filtrarListaBairros();
      // Se o controle sumiu ou ficou desligado (ex.: "Limpar tudo"), o foco vai para o primeiro filtro.
      devolverFoco(caixa, foco, '[data-f]');
    }

    // ---- legenda: só explica o mapa (com contagem). Filtrar é na gaveta Filtros (um lugar só). ----
    el.btnLegenda.addEventListener('click', () => {
      const abrir = el.legenda.hidden;
      el.legenda.hidden = !abrir;
      el.btnLegenda.setAttribute('aria-expanded', String(abrir));
      el.btnLegenda.classList.toggle('ativo', abrir);
    });

    // Contagens e seções vêm de GC.htmlLegendaMapa (js/foco.js, testada); aqui só se guarda o estado.
    let ultimasVisiveis = [];
    let camadas = {};
    function desenharLegenda() {
      el.legenda.innerHTML = GC.htmlLegendaMapa(ultimasVisiveis, f, camadas);
    }
    // O mapa avisa quando liga/desliga uma camada (risco, B.O.s, conquistas, camada da IA).
    function definirCamadas(c) {
      camadas = c || {};
      desenharLegenda();
    }

    function atualizar(filtros, visiveis) {
      f = GC.normalizarEstado({ filtros }).filtros;
      ultimasVisiveis = visiveis;
      desenharGaveta(visiveis.length);
      desenharLegenda();
      const n = contar();
      const contador = el.btnFiltros.querySelector('.filtros-contador');
      contador.textContent = n;
      contador.hidden = !n;
    }

    return { atualizar, definirCamadas };
  };

  // ---- visualizações: seletor no topo da gaveta Filtros + gaveta para gerenciar ----
  GC.criarVistasUI = function (el, vistas, { estadoAtual, aoAplicar, aoAbrirGaveta, aoFechar }) {
    let editando = null; // id da visualização sendo renomeada
    let excluindo = null; // id aguardando confirmação
    let listaAberta = false; // lista do seletor aberta
    let salvando = false; // campo "Salvar como nova" aberto no seletor
    let rascunho = ''; // nome sendo digitado (sobrevive ao redesenho)
    let erroNome = false;

    // O que a visualização mostra, por extenso: "Saúde · Crítica · 2 bairros · 6 widgets".
    const resumo = (v) => {
      const n = GC.normalizarEstado(v);
      const partes = GC.resumoFiltros(n.filtros);
      return `${partes.length ? partes.join(' · ') : 'Sem filtros'} · ${plural(n.widgets.ativos.length, 'widget', 'widgets')}`;
    };
    const prontas = () => vistas.lista().filter((v) => v.fixa);
    const suas = () => vistas.lista().filter((v) => !v.fixa);

    // ---- seletor (topo da gaveta Filtros) ----
    function opcao(v, atual) {
      return `<button type="button" aria-pressed="${v.id === atual.id}" class="vista-opcao${v.id === atual.id ? ' ativo' : ''}" data-vista="${v.id}"><span>${v.emoji} ${esc(v.nome)}</span><small>${esc(resumo(v))}</small></button>`;
    }
    function desenharBarra() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      const foco = chaveDoFoco(el.barra);
      const lSuas = suas();
      let linha = '';
      if (salvando) {
        linha = `<form class="vista-inline" data-form-inline>
            <input class="vista-nome-inline" maxlength="40" placeholder="Nome, ex.: Chuva no Centro" aria-label="Nome da nova visualização" value="${esc(rascunho)}">
            <button type="submit" class="btn-sec principal">Salvar</button>
            <button type="button" class="btn-sec" data-cancelar-inline>Cancelar</button>
          </form>
          ${erroNome ? '<p class="vista-erro vista-erro-inline">Dê um nome para a visualização.</p>' : ''}`;
      } else if (alterada) {
        linha = `<div class="vista-alterada">
            <span class="va-rotulo"><i class="ponto" aria-hidden="true"></i> Alterada</span>
            <span class="va-acoes">
              ${atual.fixa ? '' : '<button type="button" class="va-btn principal" data-salvar title="Guardar as mudanças nesta visualização">Salvar</button>'}
              <button type="button" class="va-btn${atual.fixa ? ' principal' : ''}" data-salvar-nova>Salvar como nova</button>
              <button type="button" class="va-btn" data-descartar title="Voltar ao que a visualização guarda">Descartar</button>
            </span>
          </div>`;
      }
      // A lista suspensa abre sob o seletor: no topo, o que fazer com as mudanças (ou o campo de nome).
      el.barra.innerHTML = `
        <button type="button" class="vista-atual" data-abrir aria-haspopup="true" aria-expanded="${listaAberta}" title="Trocar a visualização (filtros e widgets salvos)${alterada ? ' · alterada' : ''}">
          <span class="vista-atual-rotulo">Visualização</span> ${atual.emoji} <b>${esc(atual.nome)}</b>${alterada ? '<i class="alterada" aria-label="alterada">•</i>' : ''} <i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="vistas-lista-suspensa vidro" ${listaAberta ? '' : 'hidden'}>
          ${linha}
          ${lSuas.length ? `<p class="vl-titulo">Suas visualizações</p>${lSuas.map((v) => opcao(v, atual)).join('')}` : ''}
          <p class="vl-titulo">Prontas</p>
          ${prontas().map((v) => opcao(v, atual)).join('')}
          <hr>
          <button type="button" class="vista-opcao gerenciar" data-gerenciar><i class="ti ti-settings" aria-hidden="true"></i> Gerenciar visualizações…</button>
        </div>`;
      devolverFoco(el.barra, foco, '[data-abrir]');
      ajustarAltura();
    }
    // A lista nunca passa do espaço visível: vai do seletor até a doca de baixo (ou o fim da tela) e rola por dentro.
    function ajustarAltura() {
      const lista = el.barra.querySelector('.vistas-lista-suspensa');
      if (!lista || lista.hidden) return;
      const doca = document.querySelector('.doca-botoes');
      const caixaDoca = doca && doca.offsetParent !== null ? doca.getBoundingClientRect() : null;
      const fundo = Math.min(window.innerHeight, caixaDoca && caixaDoca.top > 0 ? caixaDoca.top : window.innerHeight) - 12;
      lista.style.left = '';
      const caixa = lista.getBoundingClientRect();
      lista.style.maxHeight = `${Math.max(160, Math.round(fundo - caixa.top))}px`;
      // Tela estreita: se passar da borda direita, puxa para a esquerda (12px de margem).
      const sobra = caixa.right - (window.innerWidth - 12);
      if (sobra > 0) lista.style.left = `${-Math.round(sobra)}px`;
    }
    window.addEventListener('resize', ajustarAltura);
    // Fechar a lista também desiste do nome que estava sendo digitado.
    function abrirLista(v) { listaAberta = v; if (!v) { salvando = false; rascunho = ''; erroNome = false; } desenharBarra(); }
    function fecharSalvar() { salvando = false; rascunho = ''; erroNome = false; desenharBarra(); }

    // Abre a lista do seletor já com o campo de nome (sem trocar de gaveta).
    function iniciarSalvar() {
      salvando = true; listaAberta = true; erroNome = false;
      desenharBarra();
      const i = el.barra.querySelector('.vista-nome-inline');
      if (i) { i.scrollIntoView({ block: 'nearest' }); i.focus({ preventScroll: true }); }
    }

    document.addEventListener('pointerdown', (e) => { if (listaAberta && !el.barra.contains(e.target)) abrirLista(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!listaAberta) return;
      // Esc no campo de nome só desiste do nome; fora dele, fecha a lista.
      if (salvando && el.barra.contains(document.activeElement)) fecharSalvar();
      else abrirLista(false);
      el.barra.querySelector('[data-abrir]').focus();
      e.stopImmediatePropagation();
    }, true);

    el.barra.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-abrir]')) return abrirLista(!listaAberta);
      const v = t.closest('[data-vista]');
      if (v) { listaAberta = false; const estado = vistas.selecionar(v.dataset.vista); if (estado) aoAplicar(estado); desenharBarra(); return; }
      if (t.closest('[data-salvar]')) { vistas.sobrescrever(vistas.atual().id, estadoAtual()); listaAberta = false; atualizar(); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-salvar-nova]')) return iniciarSalvar();
      if (t.closest('[data-descartar]')) { listaAberta = false; aoAplicar(vistas.selecionar(vistas.atual().id)); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-cancelar-inline]')) { fecharSalvar(); return el.barra.querySelector('[data-abrir]').focus(); }
      if (t.closest('[data-gerenciar]')) { listaAberta = false; desenharBarra(); aoAbrirGaveta(); }
    });
    el.barra.addEventListener('input', (e) => {
      if (!e.target.matches('.vista-nome-inline')) return;
      rascunho = e.target.value;
      if (erroNome) { erroNome = false; const p = el.barra.querySelector('.vista-erro-inline'); if (p) p.remove(); }
    });
    el.barra.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!vistas.salvarComo(rascunho, estadoAtual())) { erroNome = true; desenharBarra(); return; }
      salvando = false; rascunho = ''; erroNome = false; listaAberta = false;
      atualizar();
      el.barra.querySelector('[data-abrir]').focus();
    });

    // ---- gaveta Visualizações (gerenciar) ----
    function focarNome() { setTimeout(() => { const i = el.gaveta.querySelector('.vista-nome'); if (i) i.focus(); }, 60); }

    function item(v, atual, i, total) {
      const nome = editando === v.id
        ? `<input class="vista-renomear" value="${esc(v.nome)}" maxlength="40" aria-label="Novo nome">`
        : `<button type="button" class="vista-aplicar" data-vista="${v.id}" title="Usar esta visualização"><b>${v.emoji} ${esc(v.nome)}</b><small>${esc(resumo(v))}</small></button>`;
      const icone = (attr, ic, rotulo, desligado) => `<button type="button" class="icone" ${attr}="${v.id}" title="${rotulo}" aria-label="${rotulo}: ${esc(v.nome)}"${desligado ? ' disabled' : ''}><i class="ti ti-${ic}" aria-hidden="true"></i></button>`;
      let acoes;
      if (v.fixa) acoes = icone('data-duplicar', 'copy', 'Duplicar para editar');
      else if (excluindo === v.id) acoes = `<span class="vista-confirma">Excluir? <button type="button" data-confirmar="${v.id}">Sim</button><button type="button" data-cancelar>Não</button></span>`;
      else {
        acoes = icone('data-subir', 'arrow-up', 'Subir', i === 0) + icone('data-descer', 'arrow-down', 'Descer', i === total - 1)
          + icone('data-renomear', 'pencil', 'Renomear') + icone('data-duplicar', 'copy', 'Duplicar') + icone('data-excluir', 'trash', 'Excluir');
      }
      return `<li class="${v.id === atual.id ? 'atual' : ''}">${nome}<span class="vista-acoes">${v.id === atual.id ? '<small class="vista-em-uso">em uso</small>' : ''}${acoes}</span></li>`;
    }

    function desenharGaveta() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      const foco = chaveDoFoco(el.gaveta);
      const lSuas = suas();
      const lProntas = prontas();
      el.gaveta.innerHTML = `
        ${cabecalho('🗂 Visualizações', 'Conjuntos de filtros e widgets. Troque pelo seletor no topo da gaveta Filtros.')}
        <div class="gaveta-corpo">
          <form class="vista-form">
            <label>Salvar o que está na tela
              <span class="vista-form-linha"><input class="vista-nome" maxlength="40" placeholder="Ex.: Chuva no Centro" aria-label="Nome da nova visualização"><button type="submit" class="btn-sec principal">Salvar como nova</button></span>
            </label>
            <p class="vista-erro" hidden>Dê um nome para a visualização.</p>
            ${!atual.fixa && alterada ? `<button type="button" class="btn-sec" data-sobrescrever>↻ Atualizar “${esc(atual.nome)}” com o que está na tela</button>` : ''}
          </form>
          <h3 class="vl-secao">Suas visualizações</h3>
          ${lSuas.length
            ? `<ul class="vistas-lista">${lSuas.map((v, i) => item(v, atual, i, lSuas.length)).join('')}</ul>`
            : '<p class="vl-vazio">Você ainda não salvou nenhuma. Ajuste filtros e widgets e salve acima, ou duplique uma pronta.</p>'}
          <h3 class="vl-secao">Prontas</h3>
          <ul class="vistas-lista">${lProntas.map((v, i) => item(v, atual, i, lProntas.length)).join('')}</ul>
        </div>`;
      const ren = el.gaveta.querySelector('.vista-renomear');
      if (ren) {
        ren.focus();
        ren.select();
        // Sai do campo antes de redesenhar (com o foco nele, atualizar() acharia que ainda está digitando).
        const concluir = (salvar) => {
          const id = editando;
          if (salvar) vistas.renomear(id, ren.value);
          editando = null;
          ren.onblur = null;
          ren.blur();
          atualizar();
          const b = el.gaveta.querySelector(`[data-renomear="${id}"]`);
          if (b) b.focus();
        };
        ren.onkeydown = (e) => { if (e.key === 'Enter') concluir(true); if (e.key === 'Escape') { e.stopPropagation(); concluir(false); } };
        ren.onblur = () => { if (editando) concluir(true); };
      } else devolverFoco(el.gaveta, foco, '.vista-nome');
      const nome = el.gaveta.querySelector('.vista-nome');
      nome.oninput = () => { el.gaveta.querySelector('.vista-erro').hidden = true; };
      el.gaveta.querySelector('.vista-form').onsubmit = (e) => {
        e.preventDefault();
        if (!vistas.salvarComo(nome.value, estadoAtual())) { el.gaveta.querySelector('.vista-erro').hidden = false; nome.focus(); return; }
        nome.value = '';
        nome.blur();
        atualizar();
      };
    }

    el.gaveta.addEventListener('click', (e) => {
      const t = e.target;
      const id = (attr) => { const b = t.closest(`[${attr}]`); return b ? b.getAttribute(attr) : null; };
      if (t.closest('[data-fechar]')) return aoFechar();
      if (id('data-vista')) { const estado = vistas.selecionar(id('data-vista')); if (estado) aoAplicar(estado); return; }
      if (t.closest('[data-sobrescrever]')) { vistas.sobrescrever(vistas.atual().id, estadoAtual()); return atualizar(); }
      const subir = id('data-subir');
      const mov = subir || id('data-descer');
      if (mov) {
        vistas.mover(mov, subir ? -1 : 1);
        atualizar();
        // Foco na mesma seta; se ela ficou desligada (chegou ao topo/fundo), na outra.
        const [mesma, outra] = subir ? ['data-subir', 'data-descer'] : ['data-descer', 'data-subir'];
        const alvo = el.gaveta.querySelector(`[${mesma}="${mov}"]:not(:disabled)`) || el.gaveta.querySelector(`[${outra}="${mov}"]:not(:disabled)`);
        if (alvo) alvo.focus();
        return;
      }
      if (id('data-renomear')) { editando = id('data-renomear'); excluindo = null; return desenharGaveta(); }
      // Duplicar já abre o nome da cópia para editar.
      if (id('data-duplicar')) { const c = vistas.duplicar(id('data-duplicar')); if (c) { editando = c.id; excluindo = null; desenharBarra(); desenharGaveta(); } return; }
      if (id('data-excluir')) { excluindo = id('data-excluir'); return desenharGaveta(); }
      if (t.closest('[data-cancelar]')) { excluindo = null; return desenharGaveta(); }
      const c = id('data-confirmar');
      if (c) {
        const eraAtual = vistas.atual().id === c;
        vistas.remover(c);
        excluindo = null;
        if (eraAtual) aoAplicar(vistas.selecionar(vistas.atual().id));
        else atualizar();
      }
    });

    function atualizar() {
      desenharBarra();
      // Não redesenha a gaveta com o prefeito digitando um nome.
      const digitando = el.gaveta.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
      if (!digitando) desenharGaveta();
    }

    return { atualizar, focarNome, iniciarSalvar };
  };
})(window.GC = window.GC || {});
