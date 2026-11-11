(function (GC) {
  const AVANCOS_MS = [6000, 16000]; // depois de uma ação do prefeito: em_campo → resolvida
  const NOVA_OCORRENCIA_MS = 45000;
  const PASSO_CIDADE_MS = 20000; // a cidade anda sozinha (e o relógio dos prazos é redesenhado)
  const FALA_ACAO = { cobrar: 'cobrada', priorizar: 'priorizada' };
  const PALCO_COMPACTO = 0.6; // abaixo disso, somem a faixa de atenção e a legenda

  // Sem mapa (biblioteca não carregou ou navegador sem WebGL): mesmo formato do mapa, sem efeito.
  function mapaOffline(el) {
    el.innerHTML = '<div class="mapa-offline">🗺 Mapa indisponível (sem conexão ou navegador sem suporte a mapas) — o restante do painel continua funcionando.</div>';
    const nada = () => {};
    return { renderOcorrencias: nada, focar: nada, mostrarCamada: nada, limparCamada: nada, alternarConquistas: nada, focarConquista: nada, alternarLeitos: nada, focarLeito: nada, alternarCalorBO: nada, alternarRisco: nada, alternarObras: nada, filtrarObras: nada, focarObra: nada, alternarEscolas: nada, focarEscola: nada, alternarFrota: nada, focarFrota: nada, alternarColeta: nada, focarColeta: nada, alternarFarmacias: nada, focarFarmacia: nada, atualizarRisco: nada, focarRisco: nada, fecharPopup: nada, visaoGeral: nada, sobrevoar: async () => false, girarDevagar: nada, pararCamera: nada,destacarBairro: nada, ajustar: nada, redimensionar: nada, limparEVoltar: nada, encerrarFoco: nada, temAlgoAberto: () => false, acender: nada, mostrarAoLado: nada, mostrarResolvida: nada };
  }

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  // Visualizações salvas no navegador (falha silenciosa sem armazenamento). Uma chave por perfil: o que o
  // gestor do setor escolhe não muda o painel do prefeito (o gestor geral continua com a chave de sempre).
  const p0 = GC.perfil || { id: 'prefeito' };
  const CHAVE_VISTAS = p0.id === 'prefeito' ? 'gc.vistas' : `gc.vistas.${p0.id}${p0.area ? `.${p0.area}` : ''}`;
  const armazenamentoVistas = {
    ler() { try { return JSON.parse(localStorage.getItem(CHAVE_VISTAS)); } catch (e) { return null; } },
    gravar(o) { try { localStorage.setItem(CHAVE_VISTAS, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  };
  // Widgets fixados do Copiloto: uma chave por cidade (os bairros mudam) e por perfil, como as visualizações.
  const CHAVE_WIDGETS_IA = `gc.widgets-ia.${GC.cidade ? GC.cidade.id : 'media'}${CHAVE_VISTAS.slice('gc.vistas'.length)}`;
  const armazenamentoWidgetsIA = {
    ler() { try { return JSON.parse(localStorage.getItem(CHAVE_WIDGETS_IA)); } catch (e) { return null; } },
    gravar(o) { try { localStorage.setItem(CHAVE_WIDGETS_IA, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (GC.redirecionando) return; // perfil Cidadão: indo para o portal (js/perfil.js), nada do painel monta
    const $ = (id) => document.getElementById(id);
    const corpo = document.body;
    // Perfil de acesso (js/perfil.js): gestor geral, gestor do setor (travado na pasta) ou cidadão.
    const perfil = GC.perfil || { id: 'prefeito', area: null };
    const areasPerfil = GC.areasDoPerfil ? GC.areasDoPerfil() : null;
    const ehCidadao = perfil.id === 'cidadao';
    const daPasta = (o) => !areasPerfil || areasPerfil.includes(o.area);
    corpo.classList.add(`perfil-${perfil.id}`);
    const store = GC.criarStore(GC.data);
    GC.storeAtual = store; // os modelos de documentos (js/modelos.js) leem os mesmos números das telas
    // Toda ação do prefeito vai para o registro; a cobrança sai com o aviso (SMS/WhatsApp) e o prazo de resposta.
    const agirNaStore = store.agir;
    store.agir = (id, tipo) => {
      const ok = agirNaStore(id, tipo);
      const o = ok && store.buscar(id);
      if (!o || !GC.registrar) return ok;
      const a = GC.data.areas.find((x) => x.id === o.area);
      const b = GC.data.bairros.find((x) => x.id === o.bairroId);
      const onde = `${o.titulo}${b ? ` (${b.nome})` : ''}`;
      if (tipo === 'cobrar' && GC.avisoCobranca) {
        const av = GC.avisoCobranca(o, a.secretaria.nome);
        GC.registrar('cobrar', `${a.secretaria.nome}: ${onde}`, { ocorrenciaId: id, area: o.area, respostaH: av.respostaH, canais: av.canais, contato: av.contato });
        avisoNaTela(`📣 Cobrança enviada a ${av.contato || a.secretaria.nome}${av.canais.length ? ` por ${av.canais.join(' e ')}` : ''} · resposta em até ${av.respostaH} h`);
      } else {
        GC.registrar(tipo, `${{ priorizar: 'Priorizou', gabinete: 'Convocou gabinete de crise para' }[tipo] || tipo}: ${onde}`, { ocorrenciaId: id, area: o.area });
      }
      return ok;
    };
    function avisoNaTela(texto) {
      let el = document.getElementById('aviso-acao');
      if (!el) { el = document.createElement('div'); el.id = 'aviso-acao'; el.className = 'aviso-acao'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
      el.textContent = texto; el.classList.add('visivel');
      clearTimeout(avisoNaTela.t); avisoNaTela.t = setTimeout(() => el.classList.remove('visivel'), 6000);
    }
    const extras = GC.data.ocorrenciasExtras.slice();
    const btnLimpar = $('btn-limpar-camada');

    // ---- estado único: filtros + widgets (é o que uma visualização guarda) ----
    const areas = new Set(); // secretarias (acumulativas)
    const severidades = new Set(); // gravidades (nenhuma = todas)
    let bairros = []; // bairros em foco (vários pelo filtro; o clique no mapa foca um só)
    const bairroUnico = () => (bairros.length === 1 ? bairros[0] : null); // para o que só sabe falar de um bairro
    const filtroBairros = () => (bairros.length ? bairros.slice() : null); // null = cidade inteira
    let recorte = null; // situação: criticas | estourado | andamento
    // Antes de qualquer visualização ser aplicada: os widgets do Copiloto precisam estar no catálogo.
    const widgetsIA = GC.criarWidgetsIA ? GC.criarWidgetsIA(armazenamentoWidgetsIA) : null;
    let widgetsCfg = { ativos: (GC.WIDGETS_PADRAO || GC.WIDGETS.map((w) => w.id)).slice(), pulsos: null };
    const filtroAreas = () => [...areas];
    // Filtros por atributo da ocorrência: pessoas afetadas, tempo aberta, origem do aviso, várias secretarias.
    const SEM_ATRIBUTOS = { afetados: [], tempos: [], origens: [], multi: false };
    let atributos = Object.assign({}, SEM_ATRIBUTOS);
    const estadoFiltros = () => Object.assign({ recorte, severidades: [...severidades], areas: filtroAreas(), bairros: bairros.slice() }, atributos);
    const estadoAtual = () => ({ filtros: estadoFiltros(), widgets: widgetsCfg });
    // Gravidade + atributos (secretaria, bairro e situação já vêm filtrados do store).
    const porSeveridade = (lista) => GC.filtrarPorAtributos(lista, estadoFiltros());
    // Valor calculado na primeira vez que alguém pede (e guardado para os próximos).
    const umaVez = (f) => { let feito = false; let v; return () => { if (!feito) { feito = true; v = f(); } return v; }; };
    const vistas = GC.criarVistas(armazenamentoVistas, { prontas: GC.vistasProntasDoPerfil ? GC.vistasProntasDoPerfil() : null });
    // Camadas e eventos que o perfil enxerga (gestor do setor: só a pasta dele; os outros, tudo).
    const podeCamada = (toggleId) => !GC.podeCamada || GC.podeCamada(toggleId);
    const doPerfil = (o) => !GC.ocorrenciaDoPerfil || GC.ocorrenciaDoPerfil(o);

    const contexto = () => ({ area: filtroAreas(), areasPerfil, bairro: bairroUnico(), bairros: bairros.slice(), ocorrencias: store.ocorrencias(), desempenho: store.desempenho(filtroBairros()) });

    // ---- gavetas (uma por vez, pela direita) ----
    const gavetas = GC.criarGavetas($('gavetas'), {
      botoes: { atencao: $('btn-alertas'), filtros: $('btn-filtros'), widgets: $('btn-widgets') },
      aoTrocar(anterior, nova) {
        if (anterior === 'alerta' && nova !== 'alerta') gaveta.fechar();
        if (anterior === 'info' && nova !== 'info') fecharInfo();
        if (anterior === 'copiloto' && nova !== 'copiloto') chat.recolher(true);
        if (nova) corpo.dataset.gaveta = nova;
        else delete corpo.dataset.gaveta;
        $('chat-aba').classList.toggle('ativo', nova === 'copiloto');
        $('chat-aba').setAttribute('aria-expanded', String(nova === 'copiloto'));
        if (nova === 'vistas' || nova === 'filtros') vistasUI.atualizar();
        // Reaberta, a gaveta Filtros começa do topo (seletor de visualização à vista).
        if (nova === 'filtros') document.querySelector('#gaveta-filtros .filtros-rolagem').scrollTop = 0;
        // Alertas: o mapa reenquadra no espaço que sobra à esquerda (nenhum pino fica sob a gaveta).
        if ((nova === 'atencao' || (anterior === 'atencao' && !nova)) && !mapa.temAlgoAberto()) setTimeout(() => mapa.ajustar(), 300);
      },
    });
    const abrirCopiloto = () => chat.recolher(false);

    // O enquadramento do mapa desconta o que flutua por cima (menu, cabeçalho, chips, faixa de baixo, gaveta).
    // Formato neutro { top, right, bottom, left } em px: cada motor de mapa converte para o seu.
    GC.margensMapa = function (n) {
      const palco = $('palco').getBoundingClientRect();
      const caixa = (el) => (el && !el.hidden && el.offsetParent !== null ? el.getBoundingClientRect() : null);
      const menu = caixa($('menu'));
      const topo = Math.max(...[document.querySelector('.topo'), $('btn-filtros'), $('vistas'), $('btn-camadas')].map(caixa).filter(Boolean).map((r) => r.bottom), palco.top) - palco.top;
      const base = corpo.classList.contains('compacto') ? null : caixa(document.querySelector('.base-palco'));
      const esq = menu ? Math.max(0, menu.right - palco.left) : 0;
      const baixo = base ? Math.max(0, palco.bottom - base.top) : 0;
      const dir = gavetas.largura();
      const m = { top: topo + n, right: dir + n, bottom: baixo + n, left: esq + n };
      // Pouca área sobrando: melhor enquadrar no palco inteiro do que num buraco.
      if (m.left + m.right > palco.width * 0.75 || m.top + m.bottom > palco.height * 0.75) return GC.mapaLogica.margensUniformes(n);
      return m;
    };

    // Palco encolhido (rolagem): o mapa enquadra pela largura.
    GC.mapaEmFaixa = () => corpo.classList.contains('compacto') && !corpo.classList.contains('tela-aberta');

    // A legenda fixa nasce depois do mapa: guarda o último aviso de camadas até ela existir.
    let camadasLegenda = {};
    let legendaFixa = null;
    const mapa = GC.mapaDisponivel && GC.mapaDisponivel()
      ? GC.criarMapa($('mapa'), {
        aoAgir: agir, legenda: $('mapa-legenda'), aoMudarCamada: (ativa) => { btnLimpar.hidden = !ativa; if (!ativa) marcarSatisfacao(false); },
        aoMudarLegenda: (c) => { camadasLegenda = c; if (legendaFixa) legendaFixa.definirCamadas(c); },
        aoSelecionarBairro: clicarBairro, aoDetalhar: detalhar,
        // Popups dos pontos (risco, leitos, obras, escolas, frota…) aparecem na gaveta da direita.
        aoInfo: (conteudo, { fechar, lngLat }) => {
          const meu = abrirInfo(conteudo, fechar);
          if (lngLat) setTimeout(() => mapa.centralizarAoLado(lngLat, gavetas.largura()), 60);
          return () => { if (infoAtual === meu) { infoAtual = null; gavetas.fechar('info'); } };
        },
        aoLinhaTempo: () => linhaTempo && linhaTempo.alternar(),
        aoCidadeInteira: () => verCidadeInteira(),
        aoCarregar: () => tirarCarregando(),
      })
      : mapaOffline($('mapa'));

    // Tela de carregamento: sai quando o mapa carrega; sem mapa (offline) ou se demorar, sai assim mesmo.
    function tirarCarregando() {
      const tela = $('carregando');
      if (!tela || tela.classList.contains('saindo')) return;
      tela.classList.add('saindo');
      setTimeout(() => tela.remove(), 600);
    }
    if (GC.cidade && $('carregando-nome')) $('carregando-nome').textContent = GC.cidade.nome;
    setTimeout(tirarCarregando, GC.mapaDisponivel && GC.mapaDisponivel() ? 8000 : 300);

    // ---- gaveta "info": detalhe de um ponto do mapa ou de um bairro ----
    // Um conteúdo por vez; quem abriu recebe o aviso quando ela fecha (o popup escondido fecha junto).
    const painelInfo = $('gaveta-info');
    let infoAtual = null; // { aoFechar }
    function abrirInfo(conteudo, aoFechar) {
      fecharInfo();
      const meu = { aoFechar };
      infoAtual = meu;
      painelInfo.innerHTML = '<button type="button" class="gaveta-x info-fechar" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button>';
      painelInfo.querySelector('.info-fechar').onclick = () => gavetas.fechar('info');
      painelInfo.appendChild(conteudo);
      painelInfo.scrollTop = 0;
      gavetas.abrir('info');
      return meu;
    }
    function fecharInfo() {
      const atual = infoAtual;
      infoAtual = null;
      if (atual && atual.aoFechar) atual.aoFechar();
    }

    // Clique num bairro do mapa: só abre o painel dele à direita e o destaca no mapa (não filtra: um clique
    // sem querer não pode zerar os números do topo). Filtrar é o botão "Filtrar o painel por este bairro".
    // Clicar de novo no mesmo bairro fecha o painel.
    function clicarBairro(id) {
      if (infoBairro && infoAtual === infoBairro && infoBairro.id === id) { gavetas.fechar('info'); return; }
      abrirInfoBairro(id); // primeiro a gaveta: o enquadramento do bairro já desconta a largura dela
      if (!bairros.includes(id)) mapa.destacarBairro([id]);
    }
    function abrirInfoBairro(id) {
      const r = GC.resumoBairro(id, {
        ocorrencias: store.ocorrencias(),
        leitos: GC.leitos ? GC.leitos.resumo().unidades : [],
        escolas: GC.educacao ? GC.educacao.resumo().escolas : [],
        obras: GC.obras ? GC.obras.resumo().obras : [],
      });
      if (!r) return;
      const div = document.createElement('div');
      div.className = 'info-conteudo';
      const filtrado = bairros.length === 1 && bairros[0] === id;
      div.innerHTML = GC.htmlBairro(r, { filtrado });
      div.querySelectorAll('[data-ocorrencia]').forEach((b) => { b.onclick = () => detalhar(b.dataset.ocorrencia); });
      div.querySelector('[data-acao-bairro="cidade"]').onclick = () => verCidadeInteira();
      div.querySelector('[data-acao-bairro="perguntar"]').onclick = () => { abrirCopiloto(); perguntar(`Como está o bairro ${r.nome}?`); };
      div.querySelector('[data-acao-bairro="filtrar"]').onclick = () => {
        definirBairros(filtrado ? [] : [id]);
        abrirInfoBairro(id); // redesenha o botão com o estado novo
        if (filtrado) mapa.destacarBairro([id]); // sem filtro, continua destacado enquanto o painel está aberto
      };
      // Fechar o painel de um bairro só destacado (sem filtro) devolve o mapa ao enquadramento do filtro.
      const meu = abrirInfo(div, () => { if (infoBairro === meu) { infoBairro = null; if (!bairros.includes(id)) mapa.destacarBairro(bairros); } });
      infoBairro = meu;
      infoBairro.id = id;
    }
    // Painel do bairro aberto na gaveta (null = nenhum): some junto quando o bairro sai de foco.
    let infoBairro = null;
    function fecharInfoBairroSeSaiu() {
      // Só fecha quando o filtro passou para outro bairro (tirar o filtro não fecha: o painel abre pelo clique).
      if (infoBairro && bairros.length && !bairros.includes(infoBairro.id) && infoAtual === infoBairro) gavetas.fechar('info');
    }
    // "Ver a cidade inteira" (controle do mapa ou painel do bairro): tira o foco de bairro e o painel dele.
    function verCidadeInteira() {
      if (infoBairro && infoAtual === infoBairro) gavetas.fechar('info');
      if (bairros.length) definirBairros([]);
      mapa.visaoGeral();
    }

    // ---- linha do tempo (qualquer dia do último ano, escolhido no calendário) e modo telão ----
    // O histórico simulado de cada dia fica em cache em linha-tempo.js; desenharPinos o pede já cortado em agora.
    const linhaTempo = GC.criarLinhaTempoUI($('palco'), {
      agora: () => GC.agora(),
      aoMudar: () => desenharPinos(),
    });
    // As ocorrências com pino no mapa agora (mesmos filtros do render).
    const noMapaAgora = () => porSeveridade(store.ocorrencias(filtroAreas(), bairros, recorte));
    const telao = GC.criarTelao({
      mapa,
      // As que precisam do prefeito primeiro; sem nenhuma, as críticas ativas. O total é o de verdade:
      // o telão só percorre as 6 primeiras, mas o cartão da cidade diz quantas são.
      // Segue os mesmos filtros do mapa (visualização salva, áreas, bairros, gravidade): só entra na fila
      // o que tem pino na tela. Antes, uma "alta" com o filtro "Crítica" entrava na fila, a câmera não
      // tinha para onde ir e o telão pulava sem explicar.
      lista: () => {
        const naTela = new Set(noMapaAgora().map((o) => o.id));
        const at = store.atencao().todas.filter((o) => naTela.has(o.id));
        const criterio = at.length ? 'atencao' : 'criticas';
        const base = at.length ? at : noMapaAgora().filter((o) => o.severidade === 'critica');
        return { itens: base.slice(0, 6), total: base.length, criterio };
      },
      // Só as ativas e visíveis: uma resolvida (ou filtrada) no meio do ciclo sai da fila.
      buscar: (id) => noMapaAgora().find((o) => o.id === id) || null,
      // Rótulo do filtro ativo, para o telão dizer por que algumas ocorrências não aparecem.
      filtro: () => GC.resumoFiltros(areasPerfil ? Object.assign(estadoFiltros(), { areas: [] }) : estadoFiltros()).join(' · '),
      // O cartão do telão mostra o prazo de forma explícita ("a equipe deve chegar em até…"): o
      // "faltam 2 h" do resto do app não dizia faltam para quê.
      descrever: (o) => {
        const area = GC.data.areas.find((a) => a.id === o.area) || {};
        const restante = GC.prazoRestanteMin(o);
        const acao = { cobrar: '📣 Prefeito cobrou', priorizar: '⚡ Prefeito priorizou', gabinete: '🚨 Gabinete convocado' }[o.acaoPrefeito] || '';
        let prazo;
        if (o.status === 'em_campo') prazo = { estado: 'campo', texto: 'Equipe já está no local' };
        else if (GC.estourada(o)) prazo = { estado: 'atrasada', rotulo: 'Equipe atrasada há',tempo: GC.tempoTexto(-restante), detalhe: `prazo para chegar era ${GC.tempoTexto(o.prazoMin)}` };
        else prazo = { estado: 'correndo', rotulo: 'Equipe deve chegar em até', tempo: GC.tempoTexto(restante), usadoPct: Math.min(100, Math.max(0, (GC.idadeMin(o) / o.prazoMin) * 100)) };
        return {
          gravidade: { critica: 'Crítica', alta: 'Alta', media: 'Média' }[o.severidade],
          onde: (GC.data.bairros.find((b) => b.id === o.bairroId) || {}).nome || '',
          area: `${area.emoji || ''} ${area.secretaria ? area.secretaria.nome : area.nome || ''}`.trim(),
          afetados: o.afetados || 0,
          // O prazo já tem o seu bloco: os motivos aqui são os outros (várias secretarias, caso repetido).
          motivos: GC.motivosAtencao(o).filter((m) => m.tipo !== 'prazo').map((m) => m.texto),
          acao,
          prazo,
        };
      },
      aoMudar: (ligado) => {
        if (ligado) { gavetas.fechar(); if (tela !== 'painel') rotas.ir({ tela: 'painel' }); if (linhaTempo.aberta()) linhaTempo.fechar(); }
      },
    });
    $('btn-telao').addEventListener('click', () => telao.entrar());
    // Dados (as tabelas por trás do painel) é só do gestor geral: a porta fica no menu ⋯.
    $('btn-dados').hidden = !!(GC.perfil && GC.perfil.id !== 'prefeito');
    $('btn-dados').addEventListener('click', () => rotas.ir({ tela: 'dados', tabela: null }));
    // Marca e sessão (telas acessórias): Personalizar é do gestor geral; Sair volta ao login.
    $('btn-personalizar').hidden = !!(GC.perfil && GC.perfil.id !== 'prefeito');
    $('btn-personalizar').addEventListener('click', () => rotas.ir({ tela: 'personalizar' }));
    $('btn-admin').hidden = !!(GC.perfil && GC.perfil.id !== 'prefeito');
    $('btn-admin').addEventListener('click', () => rotas.ir({ tela: 'admin', aba: 'consistencia' }));
    $('btn-sair').addEventListener('click', () => { if (GC.registrar) GC.registrar('logout', 'Saiu do painel'); GC.sair(); });
    // Entrada no painel: uma linha no registro por sessão.
    try {
      if (GC.sessao && GC.registrar && window.sessionStorage.getItem('gc.reg-entrada') !== String(GC.sessao.desde)) {
        GC.registrar('login', `Entrou como ${GC.perfilRotulo ? GC.perfilRotulo() : 'gestor'}${GC.cidade ? ` · ${GC.cidade.nome}` : ''}`);
        window.sessionStorage.setItem('gc.reg-entrada', String(GC.sessao.desde));
      }
    } catch (e) { /* sem sessionStorage */ }
    $('sessao-quem').textContent = GC.sessao ? `Conectado como ${GC.sessao.nome} · ${GC.sessao.email}` : 'Sem login (modo de desenvolvimento)';

    // O mapa acompanha o próprio tamanho (rolagem encolhendo o palco, janela mudando).
    if (window.ResizeObserver) {
      let espera;
      // No telão, só recalcula: a câmera é dele (reenquadrar a cidade desfazia o voo até o alerta).
      new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(() => mapa.redimensionar({ manterCamera: telao.ativo() }), 150); }).observe($('mapa'));
    }

    let idsTabelas = null;
    const idsTabelasDados = () => (idsTabelas = idsTabelas || new Set(GC.tabelasDados(store).map((t) => t.id)));
    const chat = GC.criarChat(
      { mensagens: $('chat-mensagens'), sugestoes: $('chat-sugestoes'), form: $('chat-form'), input: $('chat-input'), btnResumo: $('btn-resumo'), app: document.querySelector('.app'), naoLidas: $('chat-nao-lidas'), btnRecolher: $('btn-recolher-chat') },
      {
        aoPerguntar: perguntar,
        aoAcao: executar,
        aoRecolher: (recolhido) => (recolhido ? gavetas.fechar('copiloto') : gavetas.abrir('copiloto')),
        // Fonte da resposta que existe na tela Dados vira link para a tabela (as outras são dos sistemas das secretarias).
        tabelaExiste: (id) => idsTabelasDados().has(id),
        aoAbrirTabela: (id) => rotas.ir({ tela: 'dados', tabela: id }),
        aoFixarWidget: ({ pergunta, resposta }) => {
          if (!widgetsIA) return null;
          const r = widgetsIA.criar({ pergunta, grafico: resposta.grafico, cenario: resposta.cenario });
          if (r.widget) ligarWidgetIA(r.widget.id);
          return r;
        },
        aoVerWidget: (id) => verWidgetIA(id),
      },
    );
    $('chat-aba').addEventListener('click', () => chat.recolher(gavetas.aberta() === 'copiloto'));

    const dashboard = GC.criarDashboard(
      { menu: $('menu'), kpis: $('kpis') },
      {
        aoIr: (r) => rotas.ir(r),
        aoClicarNumero: clicarNumero,
        // Itens do menu que abrem uma gaveta (Alertas): voltam ao mapa e abrem a gaveta.
        aoGaveta: (g) => { if (tela !== 'painel') rotas.ir({ tela: 'painel' }); subirAoMapa(); gavetas.abrir(g); },
      },
    );

    // ---- filtros, legenda, visualizações e widgets ----
    const filtrosUI = GC.criarFiltrosUI(
      { gaveta: $('filtros-corpo'), legenda: $('mapa-legenda-fixa'), btnLegenda: document.querySelector('.legenda-alternar'), btnFiltros: $('btn-filtros') },
      { aoMudar: (f) => aplicarEstado({ filtros: f, widgets: widgetsCfg }), aoFechar: () => gavetas.fechar(), aoSalvarVista: () => vistasUI.iniciarSalvar(), areasFixas: areasPerfil },
    );
    legendaFixa = filtrosUI;
    filtrosUI.definirCamadas(camadasLegenda);
    const vistasUI = GC.criarVistasUI(
      { barra: $('vistas'), gaveta: $('gaveta-vistas') },
      vistas,
      { estadoAtual, aoAplicar: aplicarEstado, aoAbrirGaveta: () => gavetas.abrir('vistas'), aoFechar: () => gavetas.fechar() },
    );
    $('filtros-fechar').onclick = () => gavetas.fechar('filtros');

    // ---- busca rápida (lupa ao lado de Filtros): leva até o que foi achado ----
    const CAMADA_DA_BUSCA = { leito: 'leitos', escola: 'escolas', obra: 'obras', farmacia: 'farmacias', linha: 'frota', coleta: 'coleta', risco: 'risco' };
    GC.criarBuscaUI(
      { raiz: $('busca'), botao: $('btn-busca'), caixa: $('busca-caixa'), input: $('busca-input'), lista: $('busca-lista'), fechar: $('busca-fechar') },
      {
        itens: () => (GC.filtrarBuscaDoPerfil || ((x) => x))(GC.itensBusca({
          ocorrencias: store.ocorrencias(),
          leitos: GC.leitos ? GC.leitos.resumo().unidades : [],
          escolas: GC.educacao ? GC.educacao.resumo().escolas : [],
          obras: GC.obras ? GC.obras.resumo().obras : [],
          farmacias: GC.medicamentos && GC.medicamentos.farmacias ? GC.medicamentos.farmacias() : [],
          linhas: GC.frota ? GC.frota.resumo().linhas : [],
          rotas: GC.coleta ? GC.coleta.resumo().rotas : [],
          riscos: GC.risco ? GC.risco.resumo(store.ocorrencias()).areas : [],
        })),
        aoEscolher: (r) => {
          if (r.tipo === 'tela') return rotas.ir(r.rota);
          if (r.tipo === 'secretaria') return rotas.ir({ tela: 'secretaria', area: r.id });
          if (r.tipo === 'ocorrencia') return noPainel(() => detalhar(r.id));
          if (r.tipo === 'bairro') {
            return noPainel(() => {
              subirAoMapa();
              // Igual ao clique no mapa: abre a gaveta e destaca, sem filtrar (o filtro fica no botão da gaveta).
              abrirInfoBairro(r.id); // primeiro a gaveta: o enquadramento do bairro desconta a largura dela
              if (!bairros.includes(r.id)) mapa.destacarBairro([r.id]);
            });
          }
          if (CAMADA_DA_BUSCA[r.tipo]) { abrirCamada(CAMADA_DA_BUSCA[r.tipo], r.id); marcarCamadas(); }
        },
      },
    );

    // A visualização em uso aparece no seletor ao lado da busca; o botão Filtros só a cita na dica.
    function marcarVistaNoBotao() {
      const atual = vistas.atual();
      const alterada = vistas.alterada(estadoAtual());
      $('btn-filtros').title = `Filtros · visualização em uso: ${atual.nome}${alterada ? ' (alterada)' : ''}`;
    }

    function salvarVista() {
      gavetas.abrir('vistas');
      vistasUI.focarNome();
    }
    const widgetsUI = GC.criarWidgetsUI(
      { area: $('widgets'), gaveta: $('gaveta-widgets'), escopo: $('dash-escopo'), botaoEditar: $('dash-editar'), aoConfigurar: () => gavetas.abrir('widgets') },
      {
        // Widgets novos (js/widgets-extra.js): ficha do indicador, alerta, gabinete, resumo.
        aoAbrirIndicador: (id) => rotas.ir({ tela: 'indicadores', alvo: id }),
        aoAbrirAlerta: (id) => noPainel(() => detalhar(id)),
        aoIrCrise: (id) => rotas.ir({ tela: 'crise', id }),
        aoResumo: (tipo, area) => {
          if (tipo === 'alertas') return noPainel(() => { subirAoMapa(); gavetas.abrir('atencao'); });
          if (tipo === 'chuva') return noPainel(() => { subirAoMapa(); $('toggle-risco').checked = true; marcarCamadas(); });
          if (area) rotas.ir({ tela: 'secretaria', area });
        },
        // "Restaurar padrão": volta aos widgets da visualização em uso.
        aoRestaurar: () => aplicarEstado({ filtros: estadoFiltros(), widgets: vistas.atual().widgets }),
        infoVista: () => ({ nome: vistas.atual().nome, alterada: vistas.alterada(estadoAtual()) }),
        aoMudar: (w) => {
          if (widgetsIA) widgetsIA.marcarLigados(w.ativos || []); // escolha explícita na gaveta ou no ✕
          aplicarEstado({ filtros: estadoFiltros(), widgets: w });
        },
        aoFechar: () => gavetas.fechar(),
        aoSalvarVista: salvarVista,
        aoAbrirSecretaria: (a) => rotas.ir({ tela: 'secretaria', area: a }),
        aoVerResolvida: (r) => { if (r && typeof r.lat === 'number') noPainel(() => { subirAoMapa(); mapa.mostrarResolvida(r); }); },
        aoSelecionarBairro: (id) => { selecionarBairro(id); subirAoMapa(); },
        aoVerLeito: (id) => {
          $('toggle-leitos').checked = true; marcarCamadas();
          mapa.alternarLeitos(true);
          noPainel(() => { subirAoMapa(); mapa.focarLeito(id); });
        },
        aoVerFrota: (id) => abrirCamada('frota', id),
        aoVerColeta: (id) => abrirCamada('coleta', id),
        aoVerFarmacia: (id) => abrirCamada('farmacias', id),
        // Busca ativa: só destaque de bairros (dado agregado, nunca ponto de família).
        aoVerSocial: (bairros) => noPainel(() => {
          subirAoMapa();
          mapa.mostrarCamada({ tipo: 'destaque', bairros, legenda: 'Famílias vulneráveis faltando a consultas · bairros em destaque' });
        }),
        aoVerEscola: (id) => {
          $('toggle-escolas').checked = true; marcarCamadas();
          mapa.alternarEscolas(true);
          noPainel(() => { subirAoMapa(); mapa.focarEscola(id); });
        },
        aoVerObra: (id) => {
          $('toggle-obras').checked = true; marcarCamadas();
          mapa.alternarObras(true);
          noPainel(() => { subirAoMapa(); mapa.focarObra(id); });
        },
        // Filtro de setor do widget vale também para o mapa (e liga a camada).
        aoFiltrarObras: (setor) => {
          $('toggle-obras').checked = true; marcarCamadas();
          mapa.alternarObras(true);
          mapa.filtrarObras(setor);
        },
        aoVerRisco: (id) => {
          $('toggle-risco').checked = true; marcarCamadas();
          noPainel(() => { subirAoMapa(); mapa.focarRisco(id); });
        },
        aoVerCalorBO: () => {
          $('toggle-calor-bo').checked = true; marcarCamadas();
          mapa.alternarCalorBO(true);
          noPainel(() => { subirAoMapa(); mapa.visaoGeral(); });
        },
        // Violência contra mulheres e crianças: só os bairros (agregado), nunca pontos.
        aoVerViolencia: (bairros) => noPainel(() => {
          subirAoMapa();
          mapa.mostrarCamada({ tipo: 'destaque', bairros, legenda: 'Violência contra mulheres e crianças · bairros com mais casos no mês' });
        }),
        // Widgets fixados do Copiloto: a pergunta é refeita a cada desenho (dados de agora).
        widgetsIA,
        graficoAtualIA: (w) => {
          try {
            const r = GC.ia.perguntar(w.pergunta, contexto());
            return r && r.grafico && (!w.cenario || r.cenario === w.cenario) ? r.grafico : null;
          } catch (e) { return null; }
        },
        aoPerguntarIA: (id) => {
          const w = widgetsIA && widgetsIA.buscar(id);
          if (!w) return;
          abrirCopiloto();
          perguntar(w.pergunta);
        },
        aoExcluirIA: (id) => {
          if (!widgetsIA || !widgetsIA.remover(id)) return;
          aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: widgetsCfg.ativos.filter((x) => x !== id) }) });
        },
      },
    );
    // Widget novo do Copiloto entra ligado, no topo do dashboard.
    function ligarWidgetIA(id) {
      if (widgetsCfg.ativos.includes(id)) return render();
      aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: [id, ...widgetsCfg.ativos] }) });
    }
    // "Ver no dashboard": abre "Indicadores" e leva até o widget, com um destaque rápido.
    function verWidgetIA(id) {
      if (!widgetsCfg.ativos.includes(id)) ligarWidgetIA(id);
      noPainel(() => {
        if (abaDash === 'metas') rotas.ir({ tela: 'painel' });
        abrirDashboard(true);
        escolherAba('widgets');
        setTimeout(() => {
          const alvo = document.querySelector(`[data-widget="${id}"]`);
          if (!alvo) return;
          alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
          alvo.classList.remove('w-ia-novo');
          void alvo.offsetWidth; // reinicia a animação
          alvo.classList.add('w-ia-novo');
        }, 350);
      });
    }
    $('dash-configurar').onclick = () => gavetas.abrir('widgets');
    // Alertas com uma tela aberta: volta ao mapa (a gaveta fala do mapa).
    $('btn-alertas').addEventListener('click', () => { if (tela !== 'painel') rotas.ir({ tela: 'painel' }); });

    // Aplica um estado inteiro (de uma visualização, da gaveta de filtros ou de widgets).
    function aplicarEstado(estado) {
      const e = GC.normalizarEstado(estado);
      const bairrosAntes = bairros.join(',');
      areas.clear(); e.filtros.areas.forEach((a) => areas.add(a));
      severidades.clear(); e.filtros.severidades.forEach((s) => severidades.add(s));
      recorte = e.filtros.recorte;
      bairros = e.filtros.bairros.slice();
      atributos = { afetados: e.filtros.afetados, tempos: e.filtros.tempos, origens: e.filtros.origens, multi: e.filtros.multi };
      if (areasPerfil) { areas.clear(); areasPerfil.forEach((a) => areas.add(a)); }
      widgetsCfg = GC.widgetsDoPerfil ? Object.assign({}, e.widgets, { ativos: GC.widgetsDoPerfil(e.widgets.ativos), pulsos: areasPerfil || e.widgets.pulsos }) : e.widgets;
      if (bairros.join(',') !== bairrosAntes) { mapa.destacarBairro(bairros); fecharInfoBairroSeSaiu(); }
      render();
    }

    // ---- telas: o Painel é o próprio mapa; as outras abrem num painel sobre ele, esmaecido ----
    const TELAS = { estudio: $('tela-estudio'), admin: $('tela-admin'), cruzamento: $('tela-cruzamento'), personalizar: $('tela-personalizar'), relatorios: $('tela-relatorios'), alertas: $('tela-alertas'), dados: $('tela-dados'), secretarias: $('tela-secretarias'), secretaria: $('tela-secretaria'), crise: $('tela-crise') };

    // ---- Gabinete de crise: nasce do botão "Gabinete de crise" de uma ocorrência ou da previsão de chuva ----
    // Salvos no navegador (por cidade): recarregar a página não apaga a sala, o registro nem os comunicados.
    const CHAVE_GABINETES = `gc.gabinetes.${GC.cidade ? GC.cidade.id : 'media'}`;
    const gabinetes = GC.criarGabinetes({
      armazenamento: {
        ler() { try { return JSON.parse(localStorage.getItem(CHAVE_GABINETES)); } catch (e) { return null; } },
        gravar(o) { try { localStorage.setItem(CHAVE_GABINETES, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } },
      },
    });
    const nomeSecretaria = (area) => (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: 'Secretaria' } }).secretaria.nome;
    // #/crise é sempre a listagem (é para lá que o menu leva, mesmo depois de sair olhando uma sala);
    // um gabinete só abre com o id na rota (#/crise/<id>). #/crise/novo e id que não existe: listagem.
    const gabineteDaPasta = (g) => !areasPerfil || g.areas.some((a) => areasPerfil.includes(a));
    function gabineteDaRota(rota) {
      if (!rota || !rota.id || rota.id === GC.CRISE_NOVO) return null;
      const g = gabinetes.buscar(rota.id);
      return g && gabineteDaPasta(g) ? g : null;
    }
    // Abas: os ativos e o que está aberto; sem gabinete aberto, a listagem mostra todos (com o resumo de cada sala).
    const estadoCrise = (rota) => {
      const g = gabineteDaRota(rota);
      const lista = (g ? gabinetes.todos().filter((x) => x.id === g.id || !x.encerradoEm) : gabinetes.todos()).filter(gabineteDaPasta);
      const risco = GC.risco.resumo(store.ocorrencias());
      const comSala = new Set(gabinetes.ativos().map((x) => x.ocorrenciaId).filter(Boolean));
      return {
        atual: g ? gabinetes.resumo(g.id, g.ocorrenciaId ? store.buscar(g.ocorrenciaId) : null, g.areaRiscoId ? risco.areas.find((a) => a.id === g.areaRiscoId) : null) : null,
        gabinetes: lista,
        salas: g ? [] : lista.map((x) => gabinetes.resumo(x.id)),
        risco,
        // Ocorrências que pedem gabinete e ainda não têm sala aberta (a sala sobrevive ao recarregar; a ocorrência, não).
        candidatas: store.ocorrencias().filter((o) => GC.acoesDisponiveis(o).includes('gabinete') && !comSala.has(o.id)),
        dispensas: gabinetes.dispensas(),
        // Ocorrências abertas com posição: o mini-mapa da sala desenha as que caem perto do gabinete.
        pontos: g ? store.ocorrencias().filter((o) => o.status !== 'resolvida' && Number.isFinite(o.lat) && Number.isFinite(o.lng))
          .map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, titulo: o.titulo, severidade: o.severidade })) : [],
        rascunhos: g ? Object.fromEntries(GC.FASES_COMUNICADO.map((f) => [f.id, gabinetes.rascunho(g.id, f.id)])) : null,
      };
    };
    const irParaGabinete = (g) => { if (g) rotas.ir({ tela: 'crise', id: g.id }); };
    const abrirPreventivo = (areaId) => irParaGabinete(gabinetes.abrirPreventivo(GC.risco.resumo(store.ocorrencias()).areas.find((a) => a.id === areaId)));

    // ---- Resumo do dia: cartão no canto do mapa (alertas, chuva, melhorou/piorou, decisões, gabinete) ----
    const resumoDia = GC.criarResumoDia($('resumo-dia'), {
      // Um painel da doca por vez: abrir o resumo fecha o dashboard e o resumo da semana.
      aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoSemana.alternar(true); } },
      aoVerAlertas: () => gavetas.abrir('atencao'),
      aoAbrirAlerta: (id) => detalhar(id),
      aoAgir: (id, tipo) => agir(id, tipo),
      aoGabinete: (g) => (g.tipo === 'ativo' ? rotas.ir({ tela: 'crise', id: g.id }) : abrirPreventivo(g.areaRiscoId)),
      aoDestaque: (d) => {
        if (d.tipo === 'alertas') return gavetas.abrir('atencao');
        if (d.tipo === 'chuva') {
          $('toggle-risco').checked = true; marcarCamadas();
          if (d.alvoRisco) mapa.focarRisco(d.alvoRisco);
          return;
        }
        if (d.area) rotas.ir({ tela: 'secretaria', area: d.area });
      },
    }, { botao: $('btn-resumo-dia'), contador: $('resumo-dia-n') });
    const atualizarResumoDia = () => resumoDia.atualizar(GC.resumoDoDia({ criticasTotal: store.kpis().criticas,
      // Mesmo recorte do mapa e da gaveta de Alertas (secretaria, bairro e número clicado no topo).
      atencao: store.atencao(filtroAreas(), bairros, recorte).todas,
      tendencias: GC.data.tendencias,
      risco: GC.risco.resumo(store.ocorrencias()),
      gabinetesAtivos: gabinetes.ativos().filter(gabineteDaPasta),
      areas: filtroAreas(),
      bairros: bairros.slice(),
      agora: GC.agora(),
      sugerirGabinete: perfil.id === 'prefeito',
    }));
    // ---- Resumo da semana: na doca, ao lado do Resumo do dia (mesmo lugar, um por vez) ----
    const resumoSemana = GC.criarResumoSemana($('resumo-semana'), {
      aoAlternar: (aberto) => { if (aberto) { abrirDashboard(false); resumoDia.alternar(true); atualizarResumoSemana(); } },
      aoAbrirSecretaria: (area) => rotas.ir({ tela: 'secretaria', area }),
      aoVerEntregas: (id) => {
        $('toggle-conquistas').checked = true; marcarCamadas();
        mapa.alternarConquistas(true);
        resumoSemana.alternar(true);
        noPainel(() => { subirAoMapa(); if (id) mapa.focarConquista(id); else mapa.visaoGeral(); });
      },
      aoPerguntar: (texto) => { abrirCopiloto(); perguntar(texto); },
    }, { botao: $('btn-resumo-semana') });
    function atualizarResumoSemana() {
      resumoSemana.atualizar(GC.resumoDaSemana({
        tendencias: GC.data.tendencias,
        conquistas: GC.data.conquistas,
        desempenho: GC.data.desempenho30d,
        areas: filtroAreas(),
        agora: GC.agora(),
      }));
    }
    const atualizarCrise = () => { if (tela === 'crise') telaCrise.atualizar(estadoCrise(rotas.atual())); };
    const tarefaDe = (gid, tid) => gabinetes.buscar(gid).tarefas.find((x) => x.id === tid);
    // ---- Indicadores: catálogo com metas por porte de cidade (js/indicadores.js) ----
    const estadoIndicadores = () => ({
      cidade: (GC.cidade && GC.cidade.nome) || 'Vila Dourada',
      porte: (GC.cidade && GC.cidade.id) || 'media',
      indicadores: GC.avaliarIndicadores(GC.contextoIndicadores(store, { preventivos: gabinetes.ativos().map((g) => g.areaRiscoId).filter(Boolean) }), { area: areasPerfil ? areasPerfil[0] : null, publico: ehCidadao }),
      publico: ehCidadao,
      titulo: areasPerfil ? 'Indicadores da pasta' : null,
    });
    const telaIndicadores = GC.criarTelaIndicadores($('tela-indicadores'), {
      aoAbrir: (id) => rotas.ir({ tela: 'indicadores', alvo: id }),
      aoSecretaria: (area) => rotas.ir({ tela: 'secretaria', area }),
      aoPerguntar: (ind) => { abrirCopiloto(); perguntar(GC.perguntaIndicador(ind)); },
    });

    const telaCrise = GC.criarTelaCrise($('tela-crise'), {
      aoAbrirGabinete: (id) => rotas.ir({ tela: 'crise', id: id === GC.CRISE_NOVO ? null : id }),
      aoConvocar: (id) => agir(id, 'gabinete'),
      aoPreventivo: (areaId) => { if (GC.podeNaCrise('abrir')) abrirPreventivo(areaId); },
      aoAvancar: (gid, tid) => {
        if (!GC.podeNaCrise('avancar', tarefaDe(gid, tid).area)) return;
        if (!gabinetes.avancarTarefa(gid, tid)) return;
        const t = tarefaDe(gid, tid);
        chat.secretaria(t.area, `${nomeSecretaria(t.area)}: ${t.status === 'concluida' ? 'concluímos' : 'iniciamos'} "${t.texto}".`);
        atualizarCrise();
      },
      aoCobrar: (gid, tid) => {
        if (!GC.podeNaCrise('cobrar', tarefaDe(gid, tid).area)) return;
        if (!gabinetes.cobrarTarefa(gid, tid)) return;
        const t = tarefaDe(gid, tid);
        chat.secretaria(t.area, `${nomeSecretaria(t.area)}: recebemos a cobrança do gabinete. ${t.status === 'a_fazer' ? 'Equipe sendo deslocada agora.' : 'Seguimos em campo e mandamos atualização em seguida.'}`);
        atualizarCrise();
      },
      // Devolve o comunicado publicado (ou null): a tela confirma e esvazia a caixa só quando publicou.
      aoPublicar: (gid, comunicado) => {
        if (!GC.podeNaCrise('comunicar')) return null;
        const c = gabinetes.publicarComunicado(gid, comunicado);
        if (c) atualizarCrise();
        return c;
      },
      // Encerrado, a sala continua aberta (a rota tem o id) e mostra o balanço.
      aoEncerrar: (gid, opcoes) => { if (GC.podeNaCrise('gerir') && gabinetes.encerrar(gid, opcoes)) atualizarCrise(); },
      aoAdicionarTarefa: (gid, dados) => {
        if (!GC.podeNaCrise('gerir')) return null;
        const t = gabinetes.adicionarTarefa(gid, dados);
        if (!t) return null;
        chat.secretaria(t.area, `${nomeSecretaria(t.area)}: recebemos a nova tarefa do gabinete ("${t.texto}").`);
        atualizarCrise();
        return t;
      },
      aoEstenderPrazo: (gid, tid, min) => { if (GC.podeNaCrise('gerir') && gabinetes.estenderPrazo(gid, tid, min)) atualizarCrise(); },
      aoDispensar: (chave, motivo) => { if (GC.podeNaCrise('abrir') && gabinetes.dispensar(chave, motivo)) atualizarCrise(); },
      aoReativar: (chave) => { if (GC.podeNaCrise('abrir') && gabinetes.reativar(chave)) atualizarCrise(); },
      aoAbrirAlerta: (id) => noPainel(() => detalhar(id)),
      aoVerNoMapa: (g) => {
        const o = g.ocorrenciaId && store.buscar(g.ocorrenciaId);
        if (o && o.status !== 'resolvida') return noPainel(() => focar(o.id));
        if (g.areaRiscoId) {
          $('toggle-risco').checked = true; marcarCamadas();
          return noPainel(() => { subirAoMapa(); mapa.focarRisco(g.areaRiscoId); });
        }
        noPainel(() => { selecionarBairro(g.bairroId); subirAoMapa(); });
      },
      aoPerguntar: (g) => {
        abrirCopiloto();
        perguntar(g.grupo === 'chuva' ? 'Qual o risco de chuva nas próximas horas e quem será afetado?'
          : g.grupo === 'energia' ? 'Como estão as quedas de energia?' : `Como está o bairro ${GC.data.bairros.find((b) => b.id === g.bairroId).nome}?`);
      },
    });
    const telaAlertas = GC.criarTelaAlertas($('tela-alertas'), {
      aoAgir: (id, tipo) => agir(id, tipo),
      aoAbrir: (id) => noPainel(() => detalhar(id)),
      aoVerNoMapa: (id) => noPainel(() => focar(id)),
      aoAlternarRegra: (id) => store.alternarRegra(id),
    });
    const telaCruzamento = GC.criarTelaCruzamento($('tela-cruzamento'), {
      aoIr: (r) => rotas.ir(r),
      aoPerguntar: (texto) => { abrirCopiloto(); perguntar(texto); },
    });
    const telaPersonalizar = GC.criarTelaPersonalizar($('tela-personalizar'));
    const telaEstudio = GC.criarTelaEstudio($('tela-estudio'), { store, aoIr: (r) => rotas.ir(r), aoPerguntar: (texto) => { abrirCopiloto(); perguntar(texto); } });
    const telaAdmin = GC.criarTelaAdmin($('tela-admin'), {
      store,
      aoIr: (r, ocorrenciaId) => { rotas.ir(r); if (ocorrenciaId) noPainel(() => focar(ocorrenciaId)); },
    });
    const telaDados = GC.criarTelaDados($('tela-dados'), {
      aoAbrirTabela: (id) => rotas.ir({ tela: 'dados', tabela: id }),
      base: () => store,
    });
    const estadoDados = () => ({ resumo: GC.resumoDados(store), tabelas: GC.tabelasDados(store) });
    // Os números do topo são contados pela própria tela na lista da pasta (perfil) e no recorte dela.
    // O balanço de 30 dias (tempo médio, total de resolvidas) vem da store, no mesmo recorte.
    const estadoAlertas = () => ({
      ocorrencias: store.todas().filter(daPasta),
      historico: (GC.data.resolvidasRecentes || []).filter(daPasta),
      regras: store.regras().filter((r) => !areasPerfil || !r.area || areasPerfil.includes(r.area)),
      desempenho: (area, bairro) => store.desempenho(bairro, area ? [area] : areasPerfil),
    });
    const telaRelatorios = GC.criarTelaRelatorios($('tela-relatorios'), {
      aoMudar: (r) => rotas.ir(r),
      // Itens do relatório levam ao que citam: a ocorrência (no mapa) ou a página da secretaria.
      aoAbrir: (l) => {
        if (l.tipo === 'ocorrencia') noPainel(() => detalhar(l.id));
        else if (l.tipo === 'secretaria') rotas.ir({ tela: 'secretaria', area: l.id });
      },
    });
    const relatorioDe = (r) => GC.montarRelatorio(store, r);
    const telaSecretaria = GC.criarTelaSecretaria ? GC.criarTelaSecretaria($('tela-secretaria'), {
      aoAbrirAlerta: (id) => noPainel(() => detalhar(id)),
      aoPerguntar: (texto) => { abrirCopiloto(); perguntar(texto); },
      aoGerarRelatorio: (a) => rotas.ir({ tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: '30' }),
      aoVerIndicadores: (a) => rotas.ir({ tela: 'indicadores', alvo: a }),
    }) : null;
    const telaSecretarias = GC.criarTelaSecretarias ? GC.criarTelaSecretarias($('tela-secretarias'), {
      aoSelecionarBairro: escolherBairro,
      // Chip da secretaria: filtra só esta tela (não mexe no filtro de secretarias do mapa).
      aoSelecionarArea: (a) => { areaSecretarias = a || null; if (tela === 'secretarias') telaSecretarias.atualizar(estadoSecretarias()); },
      aoAbrirSecretaria: (a) => rotas.ir({ tela: 'secretaria', area: a }),
      aoRelatorioExecutivo: () => rotas.ir({ tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }),
      aoRelatorioSecretaria: (a) => rotas.ir({ tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: '30' }),
      aoAbrirAlerta: (id) => noPainel(() => detalhar(id)),
      aoPerguntar: (texto) => { abrirCopiloto(); perguntar(texto); },
      aoVerResolvida: (r) => { if (r && typeof r.lat === 'number') noPainel(() => mapa.mostrarResolvida(r)); },
    }) : null;
    let areaSecretarias = null; // secretaria escolhida nos chips da visão geral
    let tela = null;
    let rotaAnterior = null;
    let aoChegarNoPainel = null; // ação que espera o painel da tela sair da frente do mapa

    // Troca de tela suave: o esqueleto aparece por um instante e o conteúdo entra com fade.
    const esqueleto = $('esqueleto');
    let fimEsqueleto = null;
    function transicao(alvo) {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      clearTimeout(fimEsqueleto);
      esqueleto.hidden = false;
      alvo.classList.add('entrando');
      fimEsqueleto = setTimeout(() => {
        esqueleto.hidden = true;
        alvo.classList.remove('entrando');
      }, 280);
    }

    function mostrarTela(rota) {
      // O perfil manda: rota fora dele vai para a equivalente permitida (ex.: setor em #/dados → a própria secretaria).
      const permitida = GC.rotaDoPerfil ? GC.rotaDoPerfil(rota) : rota;
      if (GC.hashDe(permitida) !== GC.hashDe(rota)) { rotas.ir(permitida); return; }
      // #/cidadao: o cidadão tem portal próprio (cidadao.html); daqui, o gestor só "vê como cidadão".
      if (rota.tela === 'cidadao') { window.location.href = GC.urlDoPerfil('cidadao'); return; }
      const anterior = tela;
      const mudou = rotaAnterior && GC.hashDe(rotaAnterior) !== GC.hashDe(rota);
      rotaAnterior = rota;
      // #/indicadores não é uma tela sobre o mapa: abre a gaveta de baixo na aba "Metas e fichas".
      const ehIndicadores = rota.tela === 'indicadores';
      tela = ehIndicadores ? 'painel' : rota.tela;
      const noMapa = tela === 'painel';
      Object.entries(TELAS).forEach(([nome, el]) => { el.hidden = nome !== tela; });
      $('sobre').hidden = noMapa;
      corpo.classList.toggle('tela-aberta', !noMapa);
      dashboard.marcarTela(rota);
      if (!noMapa) {
        if (GC.fecharDashboard) GC.fecharDashboard(); // o mapa inteiro fica atrás do painel
        if (gavetas.aberta() && gavetas.aberta() !== 'copiloto') gavetas.fechar();
        if (mudou) transicao(TELAS[tela]);
      }
      // Voltar ao mapa vindo de outra tela começa do topo (sem herdar a rolagem do dashboard).
      if (noMapa && anterior && anterior !== 'painel') window.scrollTo(0, 0);
      // No celular a gaveta ocupa a tela inteira: trocar de tela fecha até o Copiloto.
      if (mudou && gavetas.aberta() && window.matchMedia && window.matchMedia('(max-width: 720px)').matches) gavetas.fechar();
      if (noMapa && anterior && anterior !== 'painel') {
        // Espera o painel sair da frente (fade) e só então roda a ação pendente no mapa.
        setTimeout(() => {
          const acao = aoChegarNoPainel;
          aoChegarNoPainel = null;
          if (acao) acao();
        }, 120);
      }
      if (tela === 'secretaria' && telaSecretaria) telaSecretaria.mostrar(store.paginaSecretaria(rota.area));
      if (tela === 'secretarias' && telaSecretarias) telaSecretarias.mostrar(estadoSecretarias());
      if (tela === 'relatorios') telaRelatorios.mostrar(rota, relatorioDe(rota));
      if (tela === 'alertas') telaAlertas.mostrar(estadoAlertas());
      if (tela === 'dados') telaDados.mostrar(rota.tabela, estadoDados());
      if (tela === 'cruzamento') telaCruzamento.mostrar(rota);
      if (tela === 'personalizar') telaPersonalizar.mostrar();
      if (tela === 'admin') telaAdmin.mostrar(rota);
      if (tela === 'estudio') telaEstudio.mostrar(rota);
      if (tela === 'crise') telaCrise.mostrar(estadoCrise(rota));
      if (ehIndicadores) {
        abrirDashboard(true);
        escolherAba('metas');
        telaIndicadores.mostrar(rota.alvo, estadoIndicadores());
      } else if (dashAberto && abaDash === 'metas' && !ehCidadao) escolherAba('widgets'); // voltar (#/painel) com a gaveta aberta: Painel
      if (TELAS[tela]) TELAS[tela].scrollTop = 0;
    }
    const estadoSecretarias = () => {
      const a = areaSecretarias;
      return {
        bairro: bairroUnico(),
        bairros: filtroBairros(),
        area: a,
        desempenho: store.desempenho(filtroBairros(), a ? [a] : null),
        pulsos: store.pulsos(filtroBairros()),
        pagina: a ? store.paginaSecretaria(a) : null,
        bairrosDaArea: a ? store.bairrosDaSecretaria(a) : [],
      };
    };
    $('sobre-fechar').onclick = () => rotas.ir({ tela: 'painel' });
    // Clique no mapa esmaecido também volta.
    document.querySelector('.esmaecer').onclick = () => rotas.ir({ tela: 'painel' });

    // Ações que precisam do mapa: fecha o painel da tela e age depois.
    function noPainel(acao) {
      if (tela === 'painel') return acao();
      aoChegarNoPainel = acao;
      rotas.ir({ tela: 'painel' });
    }

    const gaveta = GC.criarGaveta($('gaveta'), {
      aoAgir: agir,
      aoPerguntar: perguntarSobre,
      aoFechar: () => { mapa.acender(null); mapa.encerrarFoco(); gavetas.fechar('alerta'); },
    });

    // Gaveta Alertas: as exceções e todos os ativos. O item abre o detalhe com "← Alertas" para voltar.
    const decisao = GC.criarDecisao(
      { raiz: $('gaveta-atencao') },
      {
        aoAgir: agir,
        aoDetalhar: (id) => detalhar(id, { voltar: () => { mapa.acender(null); gavetas.abrir('atencao'); } }),
        // Ao sair do item, o realce volta para o alerta aberto no detalhe (se houver).
        aoRealcar: (id) => mapa.acender(id || gaveta.abertaId()),
        aoFechar: () => gavetas.fechar('atencao'),
        aoAbrirCentral: () => rotas.ir({ tela: 'alertas' }),
      },
    );

    function escopoTexto() {
      const partes = [];
      if (bairros.length === 1) partes.push(`📍 ${GC.data.bairros.find((b) => b.id === bairros[0]).nome}`);
      else if (bairros.length > 1) partes.push(`📍 ${bairros.length} bairros`);
      if (areas.size) partes.push(filtroAreas().map((a) => GC.data.areas.find((x) => x.id === a).nome).join(', '));
      return partes.length ? partes.join(' · ') : 'cidade inteira';
    }

    // Contador do botão Camadas: quantas camadas extras estão ligadas (há quem as ligue por código, sem evento).
    function marcarCamadas() {
      const n = document.querySelectorAll('#painel-camadas input:checked').length;
      const c = $('camadas-contador');
      c.textContent = n;
      c.hidden = !n;
      $('camadas-limpar').disabled = !n;
    }

    // Pinos do mapa. Linha do tempo num instante passado: o que estava aberto naquela hora (com os filtros
    // de secretaria, bairro, situação e gravidade); o resto do painel continua ao vivo. A linha do tempo chama só
    // isto a cada passo (o render inteiro redesenha os widgets e não aguenta 12 passos por segundo).
    function desenharPinos(visiveis) {
      const fa = filtroAreas();
      const instante = linhaTempo ? linhaTempo.instante() : null;
      let noMapa = visiveis || porSeveridade(store.ocorrencias(fa, bairros, recorte));
      if (instante !== null) {
        noMapa = porSeveridade(GC.abertasEm(instante, store.todas(), GC.historicoEm(GC.data, instante, GC.agora()))
          .filter((o) => (!fa.length || fa.includes(o.area)) && (!bairros.length || bairros.includes(o.bairroId))
            && GC.casaRecorteEm(o, recorte, instante)));
      }
      if (linhaTempo && linhaTempo.aberta()) linhaTempo.marcar(noMapa.length);
      mapa.renderOcorrencias(ehCidadao ? [] : noMapa);
    }

    // Botão Alertas do cabeçalho: o número é o da gaveta (segue os filtros). O title diz de onde ele vem
    // (Alertas são exceções, não "críticas": prazo estourado, várias secretarias ou caso repetido) e,
    // com filtro, quantos há no total, que é o número do menu.
    const MOTIVO_ALERTA = {
      prazo: ['com prazo estourado', 'com prazo estourado'],
      conjunta: ['envolve várias secretarias', 'envolvem várias secretarias'],
      recorrente: ['caso repetido no bairro', 'casos repetidos no bairro'],
    };
    let tituloAlertas = '';
    function marcarBotaoAlertas(lista, temFiltro, total) {
      const filtrado = temFiltro || lista.length !== total;
      const porMotivo = {};
      lista.forEach((o) => { const m = GC.motivosAtencao(o)[0]; if (m) porMotivo[m.tipo] = (porMotivo[m.tipo] || 0) + 1; });
      const partes = Object.keys(MOTIVO_ALERTA).filter((t) => porMotivo[t]).map((t) => `${porMotivo[t]} ${MOTIVO_ALERTA[t][porMotivo[t] === 1 ? 0 : 1]}`);
      const qtd = lista.length === 1 ? '1 precisa' : `${lista.length} precisam`;
      const titulo = `Alertas: ${qtd} de você${filtrado ? ` no recorte atual (${total} no total)` : ''}`
        + (partes.length ? `. ${partes.join(' · ')}` : '');
      const contador = $('alertas-contador');
      contador.textContent = lista.length;
      contador.hidden = !lista.length;
      contador.classList.toggle('filtrado', filtrado);
      if (titulo !== tituloAlertas) {
        tituloAlertas = titulo;
        $('btn-alertas').title = titulo;
        $('btn-alertas').setAttribute('aria-label', titulo);
      }
    }

    function render() {
      marcarCamadas();
      const fa = filtroAreas();
      const visiveis = porSeveridade(store.ocorrencias(fa, bairros, recorte));
      desenharPinos(visiveis);
      filtrosUI.atualizar(estadoFiltros(), visiveis);
      vistasUI.atualizar();
      marcarVistaNoBotao();
      dashboard.marcarRecorte(recorte);
      dashboard.atualizarFaixa(store.kpis(fa, bairros));
      // Risco climático: recalculado com as ocorrências ativas (resolver um alagamento tira o "atingida").
      const risco = GC.risco.resumo(store.ocorrencias());
      mapa.atualizarRisco(risco);
      widgetsUI.atualizar(widgetsCfg, {
        kpis: store.kpis(fa, bairros),
        pulsos: store.pulsos(),
        desempenho: store.desempenho(filtroBairros(), fa),
        satisfacao: GC.data.satisfacaoPorBairro,
        leitos: GC.leitos.resumo(),
        seguranca: GC.seguranca.resumo(),
        risco,
        obras: GC.obras,
        educacao: GC.educacao.resumo(),
        frota: GC.frota.resumo(),
        coleta: GC.coleta.resumo(),
        medicamentos: GC.medicamentos.resumo(),
        social: GC.social ? GC.social.resumo() : null,
        bairro: bairroUnico(),
        escopo: escopoTexto(),
        // Widgets novos: calculados só se algum widget pedir (uma vez por desenho).
        agora: GC.agora(),
        ocorrencias: store.ocorrencias(),
        indicadores: umaVez(() => estadoIndicadores().indicadores),
        atencao: umaVez(() => porSeveridade(store.atencao(fa, bairros, recorte).todas)),
        gabinetes: umaVez(() => gabinetes.ativos().filter(gabineteDaPasta)),
        resumoDia: umaVez(() => GC.resumoDoDia({ criticasTotal: store.kpis().criticas,
          atencao: store.atencao(fa, bairros, recorte).todas, tendencias: GC.data.tendencias, risco,
          gabinetesAtivos: gabinetes.ativos().filter(gabineteDaPasta), areas: fa, bairros: bairros.slice(), agora: GC.agora(), sugerirGabinete: perfil.id === 'prefeito',
        })),
        resumoSemana: umaVez(() => GC.resumoDaSemana({ tendencias: GC.data.tendencias, conquistas: GC.data.conquistas, desempenho: GC.data.desempenho30d, areas: fa, agora: GC.agora() })),
        resumoBairro: (id) => GC.resumoBairro(id, {
          ocorrencias: store.ocorrencias(), leitos: GC.leitos.resumo().unidades,
          escolas: GC.educacao.resumo().escolas, obras: GC.obras.resumo ? GC.obras.resumo().obras : [],
        }),
      });
      if (tela === 'secretaria' && telaSecretaria) telaSecretaria.atualizar(store.paginaSecretaria(rotas.atual().area));
      if (tela === 'secretarias' && telaSecretarias) telaSecretarias.atualizar(estadoSecretarias());
      if (tela === 'relatorios') telaRelatorios.atualizar(relatorioDe(rotas.atual()));
      if (tela === 'alertas') telaAlertas.atualizar(estadoAlertas());
      if (tela === 'dados') telaDados.atualizar(estadoDados());
      atualizarCrise();
      if (!$('tela-indicadores').hidden) telaIndicadores.atualizar(estadoIndicadores());
      atualizarResumoDia();
      atualizarResumoSemana();
      const totalPerfil = store.atencao(areasPerfil).todas.length;
      dashboard.marcarContadorAlertas(totalPerfil);
      const at = store.atencao(fa, bairros, recorte);
      const todas = porSeveridade(at.todas);
      const temFiltro = GC.contarFiltrosEstado(estadoFiltros()) > 0;
      decisao.atualizar({ todas, ativos: visiveis }, { cidade: store.atencao().todas.length, temFiltro });
      marcarBotaoAlertas(todas, temFiltro, totalPerfil);
      // A gaveta aberta também acompanha o relógio (prazo estoura sem evento da própria ocorrência).
      if (gaveta.abertaId()) gaveta.atualizar(store.buscar(gaveta.abertaId()));
      const criticas = {};
      store.ocorrencias().filter((o) => o.severidade === 'critica').forEach((o) => { criticas[o.area] = (criticas[o.area] || 0) + 1; });
      dashboard.atualizarBadges(criticas);
    }

    // Ação do prefeito numa exceção (cartão, popup, gaveta ou Copiloto). Ação fora de hora é ignorada.
    // Gabinete de crise: além de avisar as secretarias, abre a sala do gabinete (tela própria).
    function agir(id, tipo) {
      const ok = store.agir(id, tipo);
      if (ok && tipo === 'gabinete') irParaGabinete(gabinetes.abrirDeOcorrencia(store.buscar(id)));
    }

    // "satisfação" liga/desliga o destaque dos bairros com menor satisfação.
    let satisfacaoNoMapa = false;
    function marcarSatisfacao(ativo) {
      satisfacaoNoMapa = ativo;
      if (typeof dashboard !== 'undefined') dashboard.marcarNumero('satisfacaoPct', ativo);
    }

    // Números do cabeçalho: os três primeiros filtram (clicar de novo desfaz); satisfação pergunta à IA.
    function clicarNumero(novo, chave) {
      if (chave === 'satisfacaoPct') {
        if (satisfacaoNoMapa) return mapa.limparEVoltar();
        abrirCopiloto();
        perguntar('Como está a satisfação por bairro?');
        return;
      }
      recorte = recorte === novo ? null : novo;
      render();
      if (tela !== 'painel') rotas.ir({ tela: 'painel' }); // filtrou: mostra o mapa
    }

    // Troca os bairros em foco (filtro). O painel do bairro que saiu de foco fecha junto.
    function definirBairros(lista) {
      bairros = lista.slice();
      mapa.destacarBairro(bairros);
      fecharInfoBairroSeSaiu();
      render();
    }
    // Atalhos de um bairro só (widgets, seletor): foca aquele bairro; o mesmo de novo (ou null) desfaz.
    function selecionarBairro(id) {
      definirBairros(!id || (bairros.length === 1 && bairros[0] === id) ? [] : [id]);
    }

    // Seletor de bairro (visão geral): escolhe exatamente aquele bairro (ou nenhum).
    function escolherBairro(id) {
      const alvo = id ? [id] : [];
      if (alvo.join(',') !== bairros.join(',')) definirBairros(alvo);
    }

    function focar(id) {
      const o = store.buscar(id);
      if (o && areas.size && !areas.has(o.area)) { areas.add(o.area); render(); }
      if (o && severidades.size && !severidades.has(o.severidade)) { severidades.add(o.severidade); render(); }
      // Escondida por afetados/tempo/origem: solta esses filtros para a ocorrência aparecer no mapa.
      if (o && !GC.filtrarPorAtributos([o], atributos).length) { atributos = Object.assign({}, SEM_ATRIBUTOS); render(); }
      if (o && bairros.length && !bairros.includes(o.bairroId)) definirBairros([]);
      subirAoMapa();
      mapa.focar(id);
    }

    // Detalhes de um alerta (popup "Ver detalhes", cartões de atenção, Central de alertas).
    function detalhar(id, opcoesDetalhe = {}) {
      const o = store.buscar(id);
      if (!o) return;
      subirAoMapa();
      gavetas.abrir('alerta');
      gaveta.abrir(o, opcoesDetalhe);
      mapa.acender(id);
      mapa.mostrarAoLado(id, gavetas.largura());
    }

    // "✨ Perguntar à IA" na gaveta: a IA recebe a ocorrência em foco no contexto.
    function perguntarSobre(id) {
      const o = store.buscar(id);
      if (!o) return;
      const texto = `Me explique o alerta: ${o.titulo}`;
      abrirCopiloto();
      chat.prefeito(texto);
      // Mesmo resolvida (fora da lista de ativas), a ocorrência em foco vai junto para a IA.
      const ctx = contexto();
      if (!ctx.ocorrencias.includes(o)) ctx.ocorrencias = [...ctx.ocorrencias, o];
      chat.ia(daIA(() => GC.ia.perguntar(texto, Object.assign(ctx, { ocorrenciaFoco: id }))));
    }

    // Liga uma camada fixa do mapa (o controle acompanha) e, com id, abre o ponto dela.
    const CAMADAS_MAPA = {
      leitos: ['toggle-leitos', 'alternarLeitos', 'focarLeito'],
      risco: ['toggle-risco', 'alternarRisco', 'focarRisco'],
      obras: ['toggle-obras', 'alternarObras', 'focarObra'],
      escolas: ['toggle-escolas', 'alternarEscolas', 'focarEscola'],
      frota: ['toggle-frota', 'alternarFrota', 'focarFrota'],
      coleta: ['toggle-coleta', 'alternarColeta', 'focarColeta'],
      farmacias: ['toggle-farmacias', 'alternarFarmacias', 'focarFarmacia'],
      'calor-bo': ['toggle-calor-bo', 'alternarCalorBO', null],
    };
    function abrirCamada(nome, id) {
      const c = CAMADAS_MAPA[nome];
      if (!c || !podeCamada(c[0])) return; // camada fora do perfil (ex.: B.O.s para a Saúde)
      const [toggle, ligar, focarNela] = c;
      mapa.limparCamada(); // o destaque/calor da resposta anterior não fica por baixo
      if ($(toggle)) $(toggle).checked = true;
      mapa[ligar](true);
      if (nome === 'obras') mapa.filtrarObras(null);
      noPainel(() => { subirAoMapa(); if (id && focarNela) mapa[focarNela](id); else mapa.visaoGeral(); });
    }

    function executar(acao) {
      const p = acao.payload || {};
      if (acao.tipo === 'mostrarMapa') noPainel(() => { subirAoMapa(); mapa.mostrarCamada(p.mapa); });
      else if (acao.tipo === 'agir') agir(p.ocorrenciaId, p.acao);
      else if (acao.tipo === 'focarOcorrencia') noPainel(() => focar(p.ocorrenciaId));
      else if (acao.tipo === 'perguntar') perguntar(p.texto);
      else if (acao.tipo === 'abrirTela') rotas.ir(p.rota);
      else if (acao.tipo === 'abrirCamada') abrirCamada(p.camada, p.id);
      else if (acao.tipo === 'criarAlerta') {
        const r = store.criarRegra(p);
        chat.ia({ texto: r.criada
          ? `🔔 Regra criada: "${p.nome}" (${p.expressao}). Ela aparece na Central de alertas.`
          : 'Essa regra já existe na Central de alertas.' });
      }
    }

    // Fronteira com a IA: aceita resposta síncrona ou Promise (IA real) e nunca deixa o chat travar.
    function daIA(chamada) {
      return Promise.resolve().then(chamada).then(GC.sanearResposta, (erro) => {
        console.error(erro);
        return GC.sanearResposta(null);
      });
    }

    // No mapa, a camada da resposta aparece na hora. Com uma tela aberta, a resposta
    // ganha "🗺 Ver no mapa" em vez de tirar o prefeito da tela onde ele está.
    function perguntar(texto) {
      chat.prefeito(texto);
      const resposta = daIA(() => GC.ia.perguntar(texto, contexto())).then((r) => {
        const temas = r && GC.ia.areasDoTema ? GC.ia.areasDoTema(r.cenario) : null;
        if (areasPerfil && temas && !temas.some((a) => areasPerfil.includes(a))) {
          return { texto: `Como gestor(a) da ${nomeSecretaria(areasPerfil[0])}, você vê os dados da sua pasta. Esse tema é de outra secretaria: peça ao Gabinete do Prefeito ou pergunte sobre a ${nomeSecretaria(areasPerfil[0])}.` };
        }
        if (r && r.mapa && tela !== 'painel' && !(r.acoes || []).some((a) => a.tipo === 'mostrarMapa')) {
          r.acoes = [...(r.acoes || []), { rotulo: '🗺 Ver no mapa', tipo: 'mostrarMapa', payload: { mapa: r.mapa } }];
        }
        return r;
      });
      chat.ia(resposta).then((r) => {
        if (!r || !r.mapa || tela !== 'painel') return;
        mapa.mostrarCamada(r.mapa);
        marcarSatisfacao(r.cenario === 'satisfacao');
      });
    }

    // Ocorrência de tipo com regra pausada fica retida: o Copiloto avisa, e ela entra ao reativar.
    // As 4 do roteiro saem primeiro. Depois (o relógio de 45 s esgota o estoque em ~3 min e o "N" ficava
    // mudo), reaproveita as mesmas como modelo, com outro id e um pouco deslocadas no mapa.
    const moldes = GC.data.ocorrenciasExtras;
    let reaproveitadas = 0;
    function proximaExtra() {
      if (extras.length) return extras.shift();
      if (!moldes.length) return null;
      const m = moldes[reaproveitadas % moldes.length];
      reaproveitadas++;
      const desvio = () => (Math.random() - 0.5) * 0.004; // ~200 m: continua no mesmo bairro
      return Object.assign({}, m, {
        id: `${m.id}-r${reaproveitadas}`, areasEnvolvidas: [...m.areasEnvolvidas],
        lat: +(m.lat + desvio()).toFixed(5), lng: +(m.lng + desvio()).toFixed(5),
      });
    }
    function novaOcorrencia() {
      const o = proximaExtra();
      if (o && !store.adicionar(o)) {
        if (doPerfil(o)) chat.ia({ texto: `🔕 Alerta retido: ${o.titulo} (regra "${o.tipo}" pausada). Ele entra assim que a regra for reativada na Central de alertas.` });
        render(); // a retenção não emite evento: a Central precisa mostrar a contagem
      }
    }

    // Aviso discreto quando algo novo chega: os números mudam com a tela parada e o prefeito precisa saber por quê.
    const aviso = $('aviso-novo');
    let fimAviso = null;
    function avisar(html, id) {
      aviso.innerHTML = html;
      aviso.hidden = false;
      aviso.classList.remove('saindo');
      aviso.classList.toggle('clicavel', !!id);
      aviso.onclick = id ? () => { aviso.hidden = true; detalhar(id); } : null;
      clearTimeout(fimAviso);
      fimAviso = setTimeout(() => {
        aviso.classList.add('saindo');
        setTimeout(() => { aviso.hidden = true; }, 300);
      }, 7000);
    }
    const SEV_AVISO = { critica: 'Crítica', alta: 'Alta', media: 'Média' };

    store.assinar((e) => {
      const o = e.ocorrencia;
      // Gestor do setor: o painel se atualiza com tudo, mas aviso, falas das secretarias e Copiloto só da pasta dele.
      const daMinhaPasta = !o || doPerfil(o);
      if (e.tipo === 'nova' && o && daMinhaPasta) {
        const b = GC.data.bairros.find((x) => x.id === o.bairroId);
        avisar(`<span class="sev-txt ${o.severidade}">Nova · ${SEV_AVISO[o.severidade]}</span> <b>${GC.escaparHtml(o.titulo)}</b> <span class="aviso-meta">${GC.escaparHtml(b ? b.nome : '')} · já encaminhada à secretaria</span> <u>ver</u>`, o.id);
      }
      if (e.tipo === 'status' && o.status === 'resolvida') mapa.fecharPopup(o.id);
      render();
      // No telão o aviso fica escondido: ele mesmo interrompe o ciclo e voa até a nova (depois do render,
      // para o pino já estar no mapa).
      if (e.tipo === 'nova' && o) telao.novidade(o);
      gaveta.atualizar(o);
      if (e.tipo === 'acao') {
        if (o.acaoPrefeito === 'gabinete') o.areasEnvolvidas.filter((a) => !areasPerfil || areasPerfil.includes(a)).forEach((a) => chat.secretaria(a, GC.textoSecretaria(o, 'gabinete', a)));
        else if (daPasta(o)) chat.secretaria(o.area, GC.textoSecretaria(o, FALA_ACAO[o.acaoPrefeito]));
        AVANCOS_MS.forEach((ms) => setTimeout(() => store.avancar(o.id), ms));
      }
      if (e.tipo === 'status' && daPasta(o)) chat.secretaria(o.area, GC.textoSecretaria(o, o.status));
      if (!daMinhaPasta) return;
      Promise.resolve()
        .then(() => GC.ia.aoEvento(e, contexto()))
        .then((r) => { if (r) chat.ia(GC.sanearResposta(r)); })
        .catch((erro) => console.error(erro));
    });

    // A altura do cabeçalho muda com a largura (quebra de linha): o que vem abaixo dele acompanha.
    const topoEl = document.querySelector('.topo');
    const medirTopo = () => document.documentElement.style.setProperty('--topo-h', `${topoEl.offsetHeight}px`);
    medirTopo();
    if (window.ResizeObserver) new ResizeObserver(medirTopo).observe(topoEl);

    // ---- gaveta de Indicadores: abre só no clique ("Indicadores" na doca) e cobre a tela inteira ----
    // É a única porta dos indicadores: aba Painel (widgets) e aba Metas e fichas (catálogo, rota #/indicadores).
    // A rodinha do mouse não rola mais a página: sobre o mapa, ela dá zoom.
    const palco = $('palco');
    const painelDash = $('dashboard');
    const btnDash = $('ir-dashboard');
    let dashAberto = false;
    let esconderDash = null;
    // O cidadão não tem widgets: a gaveta dele é só o catálogo público.
    let abaDash = ehCidadao ? 'metas' : 'widgets';
    // O seletor de visualização (#vistas) muda para o cabeçalho da gaveta enquanto ela está aberta: a mesma
    // peça (lista, salvar, gerenciar), só em outro lugar. Fechada a gaveta, volta para cima do mapa.
    const vistasEl = $('vistas');
    function moverVistas(naGaveta) {
      if (naGaveta) painelDash.querySelector('.dash-abas').after(vistasEl);
      else $('mapa-controles').before(vistasEl);
    }
    function escolherAba(aba) {
      if (ehCidadao) aba = 'metas';
      abaDash = aba;
      painelDash.dataset.aba = aba; // na aba Indicadores o seletor de visualização some (não muda nada lá)
      painelDash.querySelectorAll('.dash-aba').forEach((b) => {
        const sel = b.dataset.aba === aba;
        b.setAttribute('aria-selected', String(sel));
        b.tabIndex = sel ? 0 : -1;
        b.classList.toggle('ativo', sel);
      });
      $('widgets').hidden = aba !== 'widgets';
      $('tela-indicadores').hidden = aba !== 'metas';
      $('dash-configurar').hidden = aba !== 'widgets';
      $('dash-editar').hidden = aba !== 'widgets' || ehCidadao;
      if (aba !== 'widgets' && widgetsUI.editando()) widgetsUI.alternarEdicao(false);
    }
    escolherAba(abaDash);
    // Trocar de aba: a aba Metas tem rota própria (#/indicadores), o Painel fica em #/painel.
    function irParaAba(aba) {
      if (aba === 'metas') rotas.ir({ tela: 'indicadores', alvo: null });
      else { if (rotas.atual().tela === 'indicadores') rotas.ir({ tela: 'painel' }); escolherAba('widgets'); }
      painelDash.scrollTop = 0;
    }
    painelDash.querySelectorAll('.dash-aba').forEach((b) => {
      b.onclick = () => irParaAba(b.dataset.aba);
      b.onkeydown = (ev) => {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        const outra = painelDash.querySelector(`.dash-aba:not([data-aba="${b.dataset.aba}"])`);
        irParaAba(outra.dataset.aba);
        outra.focus();
      };
    });
    function aplicarPalco() {
      // A gaveta cobre o mapa inteiro (ele não encolhe mais). A linha do tempo fecha e volta ao vivo, para o mapa
      // não ficar no passado escondido atrás da gaveta.
      palco.style.height = `${window.innerHeight}px`;
      if (dashAberto && linhaTempo.aberta()) linhaTempo.fechar();
    }
    function abrirDashboard(valor = !dashAberto) {
      if (valor === dashAberto) return;
      dashAberto = valor;
      clearTimeout(esconderDash);
      moverVistas(valor);
      if (valor) {
        resumoDia.alternar(true);
        resumoSemana.alternar(true);
        painelDash.hidden = false;
        painelDash.scrollTop = 0;
        requestAnimationFrame(() => corpo.classList.add('dash-aberto'));
      } else {
        if (widgetsUI.editando()) widgetsUI.alternarEdicao(false);
        corpo.classList.remove('dash-aberto');
        esconderDash = setTimeout(() => { if (!dashAberto) painelDash.hidden = true; }, 300);
      }
      btnDash.setAttribute('aria-expanded', String(valor));
      aplicarPalco();
      if (valor) $('dash-fechar').focus({ preventScroll: true });
    }
    // Fechar a gaveta na aba Metas também tira o #/indicadores do endereço.
    function fecharDashboard() {
      abrirDashboard(false);
      if (rotas.atual().tela === 'indicadores') rotas.ir({ tela: 'painel' });
    }
    GC.fecharDashboard = () => abrirDashboard(false); // telão e tour voltam ao mapa inteiro
    window.addEventListener('resize', aplicarPalco);
    aplicarPalco();
    function subirAoMapa() { if (dashAberto) fecharDashboard(); }
    // Reabre na última aba usada (a aba Metas pela rota, para o endereço acompanhar).
    btnDash.onclick = () => { if (abaDash === 'metas') rotas.ir({ tela: 'indicadores', alvo: null }); else abrirDashboard(true); };
    $('dash-fechar').onclick = () => { fecharDashboard(); btnDash.focus(); };
    // Clique fora do resumo aberto (e fora do botão dele) fecha o cartão.
    document.addEventListener('click', (ev) => {
      if ($('doca').contains(ev.target) || $('gavetas').contains(ev.target)) return;
      if (resumoDia.aberto()) resumoDia.alternar(true);
      if (resumoSemana.aberto()) resumoSemana.alternar(true);
    });

    // Esc volta um passo por vez: gaveta → tela sobre o mapa → popup/camada/foco → bairro.
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || telao.ativo()) return; // no telão, o Esc é dele (sai do modo)
      if (document.querySelector('dialog[open]')) return; // com um modal aberto (detalhes do widget), o Esc fecha só ele
      if (gavetas.fechar()) { ev.stopImmediatePropagation(); return; }
      // Com o calendário aberto, o Esc fecha só ele; o próximo fecha a linha do tempo.
      if (linhaTempo.aberta()) { if (!linhaTempo.fecharCalendario()) linhaTempo.fechar(); ev.stopImmediatePropagation(); return; }
      if (tela !== 'painel') { rotas.ir({ tela: 'painel' }); ev.stopImmediatePropagation(); return; }
      if (resumoDia.aberto()) { resumoDia.alternar(true); $('btn-resumo-dia').focus(); ev.stopImmediatePropagation(); return; }
      if (resumoSemana.aberto()) { resumoSemana.alternar(true); $('btn-resumo-semana').focus(); ev.stopImmediatePropagation(); return; }
      // Ficha de indicador aberta: o Esc fecha só ela (volta à lista).
      if (dashAberto && !$('tela-indicadores').hidden && telaIndicadores.fichaAberta()) { rotas.ir({ tela: 'indicadores', alvo: null }); ev.stopImmediatePropagation(); return; }
      if (dashAberto && widgetsUI.editando()) { widgetsUI.alternarEdicao(false); $('dash-editar').focus(); ev.stopImmediatePropagation(); return; }
      if (dashAberto) { fecharDashboard(); btnDash.focus(); ev.stopImmediatePropagation(); return; }
      if (mapa.temAlgoAberto()) mapa.limparEVoltar();
      else if (bairros.length) definirBairros([]);
    }, true);
    $('toggle-conquistas').addEventListener('change', (ev) => mapa.alternarConquistas(ev.target.checked));
    $('toggle-leitos').addEventListener('change', (ev) => mapa.alternarLeitos(ev.target.checked));
    $('toggle-calor-bo').addEventListener('change', (ev) => mapa.alternarCalorBO(ev.target.checked));
    $('toggle-risco').addEventListener('change', (ev) => mapa.alternarRisco(ev.target.checked));
    $('toggle-obras').addEventListener('change', (ev) => mapa.alternarObras(ev.target.checked));
    $('toggle-escolas').addEventListener('change', (ev) => mapa.alternarEscolas(ev.target.checked));
    $('toggle-frota').addEventListener('change', (ev) => mapa.alternarFrota(ev.target.checked));
    $('toggle-coleta').addEventListener('change', (ev) => mapa.alternarColeta(ev.target.checked));
    $('toggle-farmacias').addEventListener('change', (ev) => mapa.alternarFarmacias(ev.target.checked));
    $('painel-camadas').addEventListener('change', marcarCamadas);
    // "Limpar todas": desliga cada camada ligada pelo mesmo caminho do clique (o evento change chama o mapa).
    $('camadas-limpar').addEventListener('click', () => {
      document.querySelectorAll('#painel-camadas input:checked').forEach((i) => {
        i.checked = false;
        i.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    // Camadas fora do perfil somem do painel (gestor do setor: públicas + as da pasta).
    document.querySelectorAll('#painel-camadas input[type="checkbox"]').forEach((i) => {
      if (podeCamada(i.id)) return;
      i.checked = false;
      const rotulo = i.closest('label');
      if (rotulo) { rotulo.hidden = true; rotulo.style.display = 'none'; } // .toggle tem display próprio
    });
    // Contagem em cada camada: quantas pedem atenção (em vermelho) ou, sem nenhuma, o total.
    const resumoCamadas = GC.mapaLogica.resumoCamadas();
    [['toggle-escolas', 'escolas'], ['toggle-obras', 'obras'], ['toggle-risco', 'risco'], ['toggle-calor-bo', 'calorBo'],
      ['toggle-leitos', 'leitos'], ['toggle-frota', 'frota'], ['toggle-coleta', 'coleta'], ['toggle-farmacias', 'farmacias'], ['toggle-conquistas', 'conquistas']].forEach(([id, chave]) => {
      const c = resumoCamadas[chave];
      const rotulo = $(id) && $(id).closest('label');
      if (!c || !rotulo || rotulo.querySelector('.camada-n')) return;
      const n = document.createElement('small');
      n.className = `camada-n${c.alerta ? ' alerta' : ''}`;
      n.textContent = c.alerta ? `${c.alerta} ${c.rotulo[c.alerta > 1 ? 1 : 0]}` : c.total.toLocaleString('pt-BR');
      rotulo.appendChild(n);
    });
    btnLimpar.addEventListener('click', () => mapa.limparEVoltar());
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'n' && ev.key !== 'N') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return; // Ctrl+N é do navegador; segurar a tecla não cria várias
      const a = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable) return;
      novaOcorrencia();
    });
    // Modo demonstração (?demo=1): a cidade não anda sozinha, para nenhum alerta ou recado de secretaria
    // interromper a apresentação. Quem apresenta dispara um alerta novo com a tecla N, na hora certa.
    const modoDemo = new URLSearchParams(location.search).has('demo');
    document.body.classList.toggle('modo-demo', modoDemo);
    if (!modoDemo) setInterval(novaOcorrencia, NOVA_OCORRENCIA_MS);
    // Sem passo da cidade, redesenha mesmo assim: prazos estouram com a tela parada.
    setInterval(() => { if (modoDemo || !store.passoAutomatico()) render(); }, PASSO_CIDADE_MS);

    // Cidade da demonstração (pequena, média, grande): trocar recarrega a página com os dados da outra cidade.
    if (GC.cidade) {
      const hab = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi hab.` : `${Math.round(n / 1000)} mil hab.`);
      $('cidade-nome').textContent = GC.cidade.nome;
      document.title = `${GC.cidade.nome} · Painel do Prefeito`;
      const sel = $('cidade-sel');
      sel.innerHTML = GC.CIDADES.map((c) => `<option value="${c.id}"${c.id === GC.cidade.id ? ' selected' : ''}>${GC.escaparHtml(`${c.nome} · ${hab(c.populacao)}`)}</option>`).join('');
      sel.addEventListener('change', () => GC.escolherCidade(sel.value));
    }

    // Perfil de acesso: rótulo no cabeçalho e seletor no menu ⋯ (trocar recarrega a página, como a cidade).
    if (GC.PERFIS) {
      const esc = GC.escaparHtml;
      $('cidade-nome').insertAdjacentHTML('afterend', ` <span class="perfil-chip" title="Perfil de acesso">${esc(GC.perfilRotulo())}</span>`);
      document.title = `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · ${ehCidadao ? 'Prefeitura' : areasPerfil ? GC.perfilRotulo() : 'Painel do Prefeito'}`;
      const sel = $('perfil-sel');
      const valor = perfil.id === 'setor' ? `setor:${perfil.area}` : perfil.id;
      const p = (id) => GC.PERFIS.find((x) => x.id === id);
      sel.innerHTML = `<option value="prefeito">${esc(p('prefeito').emoji)} Gestor geral (Prefeito)</option>
        <optgroup label="Gestor do setor">${GC.data.areas.map((a) => `<option value="setor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>
        <option value="cidadao">${esc(p('cidadao').emoji)} Cidadão</option>`;
      sel.value = valor;
      $('perfil-desc').textContent = p(perfil.id).descricao;
      sel.addEventListener('change', () => { const [id, area] = sel.value.split(':'); GC.escolherPerfil(id, area); });
    }

    // A hora não ocupa o cabeçalho: fica no title do ponto "ao vivo" (e para o leitor de tela).
    const relogio = () => {
      const agora = new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      $('relogio').textContent = agora;
      $('ao-vivo').title = `Ao vivo · ${agora}`;
    };
    relogio();
    setInterval(relogio, 30000);

    // ---- painéis suspensos (menu ⋯ e Camadas): um aberto por vez; fecham no clique fora e no Esc ----
    const suspensos = [
      { botao: $('btn-mais'), painel: $('menu-mais') },
      { botao: $('btn-camadas'), painel: $('painel-camadas') },
    ];
    function abrirSuspenso(alvo, abrir) {
      suspensos.forEach((s) => {
        const aberto = s === alvo && abrir;
        s.painel.hidden = !aberto;
        s.botao.setAttribute('aria-expanded', String(aberto));
        s.botao.classList.toggle('ativo', aberto);
      });
    }
    suspensos.forEach((s) => {
      s.botao.addEventListener('click', (ev) => { ev.stopPropagation(); abrirSuspenso(s, s.painel.hidden); });
    });
    document.addEventListener('pointerdown', (ev) => {
      if (!suspensos.some((s) => s.botao.contains(ev.target) || s.painel.contains(ev.target))) abrirSuspenso(null, false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && suspensos.some((s) => !s.painel.hidden)) { abrirSuspenso(null, false); ev.stopImmediatePropagation(); }
    }, true);
    // Itens do menu ⋯ fecham o menu depois de agir (Widgets abre a gaveta; Tour começa).
    $('menu-mais').querySelectorAll('.item-mais').forEach((b) => b.addEventListener('click', () => abrirSuspenso(null, false)));

    // Abertura: a visualização em uso (lembrada no navegador) define filtros e widgets.
    if (!location.hash && GC.rotaInicialDoPerfil) history.replaceState(null, '', GC.hashDe(GC.rotaInicialDoPerfil()));
    const rotas = GC.criarRotas(mostrarTela);
    const vistaSetor = areasPerfil && GC.vistaDoSetor ? GC.vistaDoSetor(areasPerfil[0]) : null;
    aplicarEstado(vistas.selecionar(vistaSetor || vistas.atual().id));
    // Widgets do Copiloto que ficaram ligados voltam ao topo do dashboard (a visualização não os conhece).
    const iaLigados = widgetsIA ? widgetsIA.ligados().filter((id) => !widgetsCfg.ativos.includes(id)) : [];
    if (iaLigados.length) aplicarEstado({ filtros: estadoFiltros(), widgets: Object.assign({}, widgetsCfg, { ativos: [...iaLigados, ...widgetsCfg.ativos] }) });
    rotas.iniciar();
    setTimeout(() => mapa.redimensionar(), 320); // enquadra a cidade depois que o layout assentou
    chat.sugestoes(GC.ia.acoesRapidas ? GC.ia.acoesRapidas() : GC.ia.sugestoes); // ações pré-definidas
    const k = store.kpis(areasPerfil);
    const maisAtrasada = store.atencao(areasPerfil).cartoes[0];
    if (areasPerfil) {
      chat.ia({
        texto: `${saudacao()}, secretário(a). A ${nomeSecretaria(areasPerfil[0])} tem ${k.criticas} ocorrências críticas e ${k.estouradas} com prazo estourado. Este painel mostra só a sua pasta.`,
        acoes: maisAtrasada ? [{ rotulo: 'Ver a mais atrasada', tipo: 'focarOcorrencia', payload: { ocorrenciaId: maisAtrasada.id } }] : [],
      }, { atrasoMs: 1200 });
    } else if (!ehCidadao) chat.ia({
      texto: `${saudacao()}, prefeito. ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} tem ${k.criticas} ocorrências críticas e ${k.estouradas} com prazo estourado. As secretarias já recebem tudo automaticamente; em 🔔 Alertas ficam só as que precisam da sua atenção.`,
      acoes: maisAtrasada ? [{ rotulo: 'Ver a mais atrasada', tipo: 'focarOcorrencia', payload: { ocorrenciaId: maisAtrasada.id } }] : [],
    }, { atrasoMs: 1200 });
  });
})(window.GC = window.GC || {});
