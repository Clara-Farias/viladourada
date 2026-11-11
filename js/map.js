(function (GC) {
  // Mapa da cidade, sobre MapLibre GL. O app só conhece GC.criarMapa e o objeto que ela devolve.
  // Regras puras (GeoJSON, HTML dos pinos e popups, tema, margens) ficam em js/mapa-logica.js.
  // Veio do Leaflet em 2026-11; números calibrados lado a lado com ele: veja
  // docs/specs/2026-11-05-vila-dourada-migracao-maplibre-plano.md.
  const ML = GC.mapaLogica;
  // Bairros: cores do tema (ML.CORES_TEMA); roxo no destaque da IA.
  const ROXO = ML.COR_DESTAQUE;
  const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
  // Cidade fictícia: por padrão, fundo liso (sem ruas e nomes reais embaixo dos bairros inventados).
  // ?mapa=real liga o mapa de ruas (útil só para conferir escala).
  const BASE_REAL = (() => { try { return new URLSearchParams(window.location.search).get('mapa') === 'real'; } catch (e) { return false; } })();
  // Reserva se o estilo base não carregar (provedor fora, sem internet, firewall): fundo liso no tom do
  // tema, e bairros, pinos e camadas funcionando por cima. As fontes dos
  // nomes dos bairros vêm do mesmo provedor: sem ele, o MapLibre desenha as letras com a fonte local
  // (avisa no console, uma linha por letra) e os nomes continuam aparecendo.
  const ESTILO_RESERVA = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': GC.cor ? GC.cor.misturar(GC.corMarca('navy'), '#ffffff', 0.06) : '#eef1f5' } }],
  };
  const ESPERA_ESTILO = 8000; // ms sem o estilo base: desiste dele
  // 17 dá folga para abrir grupos de pinos muito próximos.
  const ZOOM_MAX = 17;
  // Zoom de "Ver no mapa" (o 15 da escala web clássica).
  const ZOOM_FOCO = ML.zoomMapLibre(15);
  // Raio dos grupos. O MapLibre agrupa pelo zoom inteiro de baixo (a 12,66 usa o 12), então na tela o raio
  // vale de 1x a 2x isto. Uma fonte só, com todas as gravidades: pinos que se encostariam viram um círculo
  // com o total (na cor da pior gravidade e um anel com a proporção de cada uma).
  // Até ZOOM_MAX - 1 agrupa; no zoom máximo, tudo solto.
  // 56 (era 44): com 44, grupos vizinhos se encostavam no zoom da cidade inteira e cobriam o nome dos bairros.
  const RAIO_GRUPO = 56;
  const FONTE = 'ocorrencias';

  // MapLibre carregado e WebGL disponível (VDI e navegadores travados às vezes não têm).
  GC.mapaDisponivel = function () {
    if (typeof maplibregl === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  };

  // Tema "Vila Dourada" (claro ou escuro) sobre o estilo base (regras em GC.mapaLogica.ajusteTema).
  // Guarda o valor original de cada propriedade que mexe: trocar de tema devolve tudo antes de aplicar o
  // novo (o escuro pinta camadas que o claro deixa como vieram). Só mexe nas camadas do estilo base.
  function criarTema(mapa) {
    let base = []; // camadas do estilo base (as nossas ficam de fora)
    let originais = new Map(); // "id|paint|prop" → valor do estilo
    const pegar = (id, tipo, k) => (tipo === 'paint' ? mapa.getPaintProperty(id, k) : mapa.getLayoutProperty(id, k));
    const definir = (id, tipo, k, v) => (tipo === 'paint' ? mapa.setPaintProperty(id, k, v) : mapa.setLayoutProperty(id, k, v));
    return {
      // Estilo novo (o base ou a reserva): esquece o anterior.
      lerBase() {
        base = mapa.getStyle().layers.map((c) => Object.assign({}, c));
        originais = new Map();
      },
      aplicar(tema) {
        originais.forEach((v, chave) => {
          const [id, tipo, k] = chave.split('|');
          try { if (k === 'minzoom') mapa.setLayerZoomRange(id, v[0], v[1]); else definir(id, tipo, k, v); } catch (e) { /* camada sumiu */ }
        });
        base.forEach((camada) => {
          const ajuste = ML.ajusteTema(camada, tema);
          if (!ajuste) return;
          const mexer = (tipo, k, v) => {
            const chave = `${camada.id}|${tipo}|${k}`;
            try {
              if (!originais.has(chave)) originais.set(chave, pegar(camada.id, tipo, k));
              definir(camada.id, tipo, k, v);
            } catch (e) {
              // Camada sem essa propriedade: fica como veio do estilo.
            }
          };
          Object.entries(ajuste.layout || {}).forEach(([k, v]) => mexer('layout', k, v));
          Object.entries(ajuste.paint || {}).forEach(([k, v]) => mexer('paint', k, v));
          if (ajuste.minzoom !== undefined) {
            const chave = `${camada.id}|zoom|minzoom`;
            if (!originais.has(chave)) originais.set(chave, [camada.minzoom ?? 0, camada.maxzoom ?? 24]);
            try { mapa.setLayerZoomRange(camada.id, ajuste.minzoom, camada.maxzoom ?? 24); } catch (e) { /* idem */ }
          }
        });
      },
    };
  }

  // Tema escolhido (fica no navegador; sem acesso ao armazenamento, começa claro).
  const CHAVE_TEMA = 'vd-mapa-tema';
  const lerTemaSalvo = () => { try { return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro'; } catch (e) { return 'claro'; } };
  const salvarTema = (t) => { try { localStorage.setItem(CHAVE_TEMA, t); } catch (e) { /* sem armazenamento */ } };

  const elementoDe = (html, classe = 'marcador-wrap') => {
    const el = document.createElement('div');
    el.className = classe;
    el.innerHTML = html;
    return el;
  };

  GC.criarMapa = function (elemento, opcoes) {
    const { aoAgir, legenda, aoMudarCamada, aoMudarLegenda, aoSelecionarBairro, aoDetalhar, aoRolarSemCtrl, aoInfo, aoLinhaTempo, aoCidadeInteira, aoCarregar } = opcoes;
    const limites = ML.limites(GC.data.bairros);
    // Enquadramento que desconta os elementos flutuantes (GC.margensMapa, definido pelo app).
    const margens = (n) => ML.margensMapLibre(GC.margensMapa ? GC.margensMapa(n) : ML.margensUniformes(n));
    const ms = (segundos) => segundos * 1000; // a API do mapa fala em segundos

    const mapa = new maplibregl.Map({
      container: elemento,
      style: BASE_REAL ? ESTILO : ESTILO_RESERVA,
      bounds: limites,
      fitBoundsOptions: { padding: margens(30) },
      maxZoom: ZOOM_MAX,
      // Mapa sempre "de cima", como hoje: sem girar nem inclinar.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // A atribuição vai para o canto de baixo (CSS a põe sob o botão Legenda), sempre recolhida no ⓘ.
      attributionControl: false,
    });
    mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} (cidade fictícia)` }), 'bottom-left');
    mapa.touchZoomRotate.disableRotation();
    mapa.keyboard.disableRotation();
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // ---- Tema claro / escuro ("sala de situação") ----
    const tema = criarTema(mapa);
    let temaAtual = lerTemaSalvo();
    let botaoTema = null;
    const marcarBotaoTema = () => {
      document.body.classList.toggle('mapa-escuro', temaAtual === 'escuro');
      if (!botaoTema) return;
      const escuro = temaAtual === 'escuro';
      botaoTema.innerHTML = `<i class="ti ti-${escuro ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
      botaoTema.title = escuro ? 'Mapa claro' : 'Mapa escuro (sala de situação)';
      botaoTema.setAttribute('aria-label', botaoTema.title);
      botaoTema.setAttribute('aria-pressed', String(escuro));
    };
    // Um grupo só de controles extras: ver a cidade inteira, linha do tempo e tema.
    const botaoCtrl = (classe, icone, titulo, acao) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.title = titulo;
      b.setAttribute('aria-label', titulo);
      b.innerHTML = `<i class="ti ti-${icone}" aria-hidden="true"></i>`;
      b.onclick = acao;
      return b;
    };
    mapa.addControl({
      onAdd() {
        const div = document.createElement('div');
        div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        div.appendChild(botaoCtrl('ctrl-cidade', 'focus-2', 'Ver a cidade inteira', () => (aoCidadeInteira ? aoCidadeInteira() : visaoGeral())));
        if (aoLinhaTempo) div.appendChild(botaoCtrl('ctrl-linha-tempo', 'history', 'Linha do tempo (escolha o dia e a hora)', () => aoLinhaTempo()));
        botaoTema = botaoCtrl('ctrl-tema', 'moon', '', () => trocarTema(temaAtual === 'escuro' ? 'claro' : 'escuro'));
        div.appendChild(botaoTema);
        marcarBotaoTema();
        return div;
      },
      onRemove() {},
    }, 'bottom-right');
    function trocarTema(t) {
      temaAtual = t;
      salvarTema(t);
      marcarBotaoTema();
      if (!bairrosProntos()) return; // o estilo ainda carrega: style.load aplica
      tema.aplicar(t);
      pintarTemaProprio();
    }
    marcarBotaoTema();
    // A atribuição começa recolhida no ⓘ (aberta, ocupa uma faixa do mapa); clicar no ⓘ abre.
    // Zoom out limitado a pouco além da cidade inteira; o enquadramento depende do tamanho do mapa,
    // então o limite é recalculado quando ele muda (faixa do dashboard, gaveta aberta, janela).
    function limitarZoomOut() {
      const cam = mapa.cameraForBounds(limites, { padding: margens(30) });
      if (cam && Number.isFinite(cam.zoom)) mapa.setMinZoom(ML.zoomMinimo(cam.zoom));
    }
    limitarZoomOut();
    mapa.on('resize', limitarZoomOut);

    mapa.once('load', () => {
      const atrib = elemento.querySelector('.maplibregl-ctrl-attrib');
      if (atrib) atrib.classList.remove('maplibregl-compact-show');
      entrada();
      if (aoCarregar) aoCarregar();
    });

    // ---- Entrada animada ----
    // A câmera chega de mais longe até a cidade, o véu do entorno aparece aos poucos e os pinos surgem em
    // sequência. Sem animação para quem pediu menos movimento. Enquanto ela roda, reenquadrar fica para depois.
    const poucoMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let introAte = poucoMovimento() ? 0 : Infinity; // até quando a entrada roda (Infinity = ainda não começou)
    let pinosNaEntrada = 0;
    const emEntrada = () => Date.now() < introAte;
    function entrada() {
      if (introAte !== Infinity) return;
      const DURACAO = 2200;
      introAte = Date.now() + DURACAO + 400;
      document.body.classList.add('mapa-entrando');
      const cam = mapa.cameraForBounds(limites, { padding: margens(30) });
      if (cam) {
        mapa.jumpTo({ center: cam.center, zoom: cam.zoom - 1.4 });
        mapa.easeTo({ center: cam.center, zoom: cam.zoom, duration: DURACAO, easing: (t) => 1 - Math.pow(1 - t, 3) });
      }
      if (mapa.getLayer('mascara')) mapa.setPaintProperty('mascara', 'fill-opacity', ML.CORES_TEMA[temaAtual].mascaraOpacidade);
      setTimeout(() => document.body.classList.remove('mapa-entrando'), DURACAO + 1200);
    }
    // Estilo base fora do ar: troca pela reserva (uma vez), por erro ou por demora.
    let estiloCarregou = false;
    let usandoReserva = !BASE_REAL; // fundo liso desde o início: nada a trocar
    const usarReserva = () => {
      if (estiloCarregou || usandoReserva) return;
      usandoReserva = true;
      mapa.setStyle(ESTILO_RESERVA);
    };
    mapa.on('error', (e) => { if (e && e.error && e.error.url === ESTILO) usarReserva(); });
    setTimeout(usarReserva, ESPERA_ESTILO);
    mapa.on('style.load', () => {
      estiloCarregou = true;
      tema.lerBase();
      tema.aplicar(temaAtual);
      montarBairros();
      montarCalorBO();
      montarRisco();
      montarLinhas();
      montarColeta();
      montarCalor();
      montarOcorrencias();
    });

    // A rodinha dá zoom (zoom nativo do MapLibre, em torno do cursor): a página não rola mais, o
    // dashboard abre só no clique em "Indicadores".
    if (aoRolarSemCtrl) elemento.addEventListener('wheel', aoRolarSemCtrl, { passive: true });

    // ======================= Bairros =======================
    let selecionado = []; // bairros em foco (clique no mapa ou filtro de bairros)
    let destacados = []; // bairros pintados pela IA (fase 4 liga)
    let sobMouse = null;
    const bairroPorId = (id) => GC.data.bairros.find((b) => b.id === id);
    const bairrosProntos = () => !!mapa.getLayer('bairros-preenchimento');
    // O app pode selecionar um bairro antes do estilo carregar: o estado fica guardado e vale ao montar.
    const estadoBairro = (id, estado) => { if (bairrosProntos()) mapa.setFeatureState({ source: 'bairros', id }, estado); };

    // Ocorrências por bairro: o preenchimento fica mais denso onde há mais (de 2 % a 15 %).
    const geoBairrosAtual = () => ML.geoBairros(GC.data.bairros, ML.contagemPorBairro(lista()));
    function contarBairros() {
      const f = mapa.getSource('bairros');
      if (f) f.setData(geoBairrosAtual());
    }

    function montarBairros() {
      const cores = ML.CORES_TEMA[temaAtual];
      // Entorno apagado e limite fino e discreto: a cidade se destaca do resto do mapa sem moldura chamativa.
      mapa.addSource('mascara', { type: 'geojson', data: ML.geoMascara(GC.data.bairros) });
      mapa.addSource('limite', { type: 'geojson', data: ML.geoLimite(GC.data.bairros) });
      mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara',
        // Na entrada, o véu nasce transparente e aparece com a transição (entrada() define o valor final).
        paint: { 'fill-color': cores.mascara, 'fill-opacity': introAte === Infinity ? 0 : cores.mascaraOpacidade,
          'fill-opacity-transition': { duration: 1400, delay: 300 }, 'fill-antialias': false } });
      mapa.addLayer({ id: 'limite', type: 'line', source: 'limite', layout: { 'line-join': 'round' },
        paint: { 'line-color': cores.limite, 'line-width': 1.5, 'line-opacity': 0.55 } });

      mapa.addSource('bairros', { type: 'geojson', data: geoBairrosAtual(), promoteId: 'id' });
      mapa.addSource('bairros-rotulos', { type: 'geojson', data: ML.geoRotulos(GC.data.bairros) });
      const muitosBairros = GC.data.bairros.length > 20;
      // Destaque > selecionado > mouse por cima > densidade de ocorrências.
      const estado = (chave) => ['boolean', ['feature-state', chave], false];
      mapa.addLayer({ id: 'bairros-preenchimento', type: 'fill', source: 'bairros', paint: {
        'fill-color': ['case', estado('destaque'), ROXO, cores.bairro],
        'fill-opacity': ['case', estado('destaque'), 0.25, estado('sel'), 0.16, estado('hover'), 0.14,
          ['interpolate', ['linear'], ['get', 'n'], 0, 0.02, 6, 0.15]],
        'fill-opacity-transition': { duration: 300 },
      } });
      mapa.addLayer({ id: 'bairros-contorno', type: 'line', source: 'bairros',
        // Contorno discreto (fino, contínuo, suave): o bairro se vê sem disputar com os pinos.
        paint: { 'line-color': cores.bairro, 'line-width': 1, 'line-opacity': 0.35 } });
      mapa.addLayer({ id: 'bairros-contorno-sel', type: 'line', source: 'bairros',
        paint: { 'line-color': cores.selecionado, 'line-width': 3 } });
      mapa.addLayer({ id: 'bairros-contorno-destaque', type: 'line', source: 'bairros',
        paint: { 'line-color': ROXO, 'line-width': 2.5, 'line-opacity': 0.9 } });
      // Nome sempre visível no centro do bairro, por cima de tudo.
      mapa.addLayer({ id: 'bairros-rotulo', type: 'symbol', source: 'bairros-rotulos',
        // Diminui com o zoom e quebra nomes longos: no celular, "Jardim das Flores" não atropela o vizinho.
        layout: { 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-letter-spacing': 0.02,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9.5, 12.5, 11, 14, 12.5], 'text-max-width': 7,
          // Abaixo do centro: o grupo de pinos do bairro costuma cair no centro e cobria o nome.
          'text-anchor': 'top', 'text-offset': [0, 2.2],
          // Cidade com muitos bairros (a grande tem 121): nome que colide some, e o dos mais populosos fica.
          // Ao aproximar, aparecem os outros.
          'text-allow-overlap': !muitosBairros, 'text-ignore-placement': !muitosBairros,
          'symbol-sort-key': ['-', 0, ['get', 'populacao']] },
        paint: { 'text-color': cores.rotulo, 'text-halo-color': cores.halo, 'text-halo-width': 1.5 } });
      pintarBairros();
    }

    // Troca de tema com o mapa montado: só repinta as cores das nossas camadas.
    function pintarTemaProprio() {
      const c = ML.CORES_TEMA[temaAtual];
      const p = (id, k, v) => { if (mapa.getLayer(id)) mapa.setPaintProperty(id, k, v); };
      p('mascara', 'fill-color', c.mascara);
      p('mascara', 'fill-opacity', c.mascaraOpacidade);
      p('limite', 'line-color', c.limite);
      p('bairros-preenchimento', 'fill-color', ['case', ['boolean', ['feature-state', 'destaque'], false], ROXO, c.bairro]);
      p('bairros-contorno', 'line-color', c.bairro);
      p('bairros-contorno-sel', 'line-color', c.selecionado);
      p('bairros-rotulo', 'text-color', c.rotulo);
      p('bairros-rotulo', 'text-halo-color', c.halo);
    }

    function pintarBairros() {
      if (!bairrosProntos()) return;
      const f = ML.filtrosContorno(selecionado, destacados);
      mapa.setFilter('bairros-contorno', f.normal);
      mapa.setFilter('bairros-contorno-sel', f.selecionado);
      mapa.setFilter('bairros-contorno-destaque', f.destaque);
      GC.data.bairros.forEach((b) => estadoBairro(b.id, { sel: selecionado.includes(b.id), destaque: destacados.includes(b.id) }));
    }

    // Clique num pino, grupo ou popup chega ao mapa também: não pode selecionar o bairro por baixo.
    const deCimaDoMapa = (e) => !!(e.originalEvent && e.originalEvent.target.closest
      && e.originalEvent.target.closest('.maplibregl-marker, .maplibregl-popup'));
    mapa.on('click', 'bairros-preenchimento', (e) => {
      if (deCimaDoMapa(e) || !e.features.length) return;
      // Clique numa área de risco abre a área, não seleciona o bairro por baixo.
      if (riscoVisivel && mapa.getLayer('risco-preenchimento') && mapa.queryRenderedFeatures(e.point, { layers: ['risco-preenchimento'] }).length) return;
      if (frotaVisivel && mapa.getLayer('linhas') && mapa.queryRenderedFeatures(e.point, { layers: ['linhas'] }).length) return; // idem, linha de ônibus
      if (coletaVisivel && mapa.getLayer('coleta') && mapa.queryRenderedFeatures(e.point, { layers: ['coleta'] }).length) return; // idem, rota da coleta
      if (aoSelecionarBairro) aoSelecionarBairro(e.features[0].id);
    });
    mapa.on('mousemove', 'bairros-preenchimento', (e) => {
      const id = e.features.length ? e.features[0].id : null;
      if (id === sobMouse) return;
      if (sobMouse) estadoBairro(sobMouse, { hover: false });
      sobMouse = id;
      if (id) estadoBairro(id, { hover: true });
      mapa.getCanvas().style.cursor = 'pointer';
    });
    mapa.on('mouseleave', 'bairros-preenchimento', () => {
      if (sobMouse) estadoBairro(sobMouse, { hover: false });
      sobMouse = null;
      mapa.getCanvas().style.cursor = '';
    });

    function destacarBairro(id) {
      selecionado = (Array.isArray(id) ? id : id ? [id] : []).filter((x) => bairroPorId(x));
      pintarBairros();
      voltarAoInicio(0.8);
    }

    // Enquadramento inicial: o bairro selecionado ou a cidade inteira.
    function voltarAoInicio(duracao = 0.6) {
      const alvo = selecionado.length ? ML.limites(selecionado.map(bairroPorId)) : limites;
      // Mapa encolhido numa faixa (rolagem): com as margens normais a cidade ficava do tamanho de um selo.
      // Na faixa, margem mínima (só o cabeçalho flutua) e meio nível a mais de zoom: corta uma borda da
      // cidade, mas os pinos (agrupados) ficam legíveis.
      if (GC.mapaEmFaixa && GC.mapaEmFaixa()) {
        const cam = mapa.cameraForBounds(alvo, { padding: margens(6) });
        if (cam) mapa.easeTo({ center: cam.center, zoom: cam.zoom + 0.5, duration: ms(duracao) });
        return;
      }
      mapa.fitBounds(alvo, { padding: margens(selecionado.length ? 50 : 30), duration: ms(duracao) });
    }

    // ======================= Ocorrências =======================
    // Os pontos ficam em três fontes GeoJSON (uma por gravidade: grupos não misturam gravidades), com
    // agrupamento nativo. Pinos e grupos são marcadores HTML (HTML de mapa-logica.js, CSS de styles.css), sincronizados
    // com o que a fonte agrupou: quando o zoom cruza um nível inteiro, no fim de cada movimento e quando a
    // fonte termina de processar dados novos.
    const dados = new Map(); // id → { o, assinatura, novo }
    let primeiraRenderizacao = true;
    let geoAtual = ''; // JSON da última setData (evita reagrupar à toa)
    const pinos = new Map(); // id → { id, marker, el, popup }
    const grupos = new Map(); // chave → { marker, el, sev, clusterId, chave }
    let naTela = new Map(); // chave (id do pino ou chave do grupo) → item
    let acesoId = null; // ponto realçado pelo cartão/gaveta
    let grupoAceso = null; // grupo que contém o ponto realçado
    let emFoco = false; // foco temporário ("Ver no mapa", gaveta): ao terminar, volta ao enquadramento
    let pedidoFoco = 0; // só o pedido de foco mais recente segue

    const ocorrenciasProntas = () => !!mapa.getSource(FONTE);
    const fontesCarregadas = () => ocorrenciasProntas() && mapa.isSourceLoaded(FONTE);

    // Resumo ao passar o mouse: um só, reaproveitado.
    const dica = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'resumo-ml', anchor: 'bottom', offset: 20, maxWidth: '280px' });
    let dicaDe = null;
    function abrirDica(id) {
      const d = dados.get(id);
      if (!d) return;
      dicaDe = id;
      dica.setLngLat([d.o.lng, d.o.lat]).setHTML(`<div class="resumo-ponto">${ML.htmlResumo(d.o)}</div>`).addTo(mapa);
    }
    function fecharDica(id) {
      if (id && dicaDe !== id) return;
      dicaDe = null;
      dica.remove();
    }

    function montarOcorrencias() {
      const geo = ML.geoTodas(lista());
      geoAtual = JSON.stringify(geo);
      mapa.addSource(FONTE, { type: 'geojson', data: geo, cluster: true, clusterRadius: RAIO_GRUPO, clusterMaxZoom: ZOOM_MAX - 1,
        clusterProperties: {
          pulsa: ['+', ['get', 'pulsa']],
          nivel: ['max', ['get', 'nivel']],
          critica: ['+', ['get', 'critica']],
          alta: ['+', ['get', 'alta']],
          media: ['+', ['get', 'media']],
        } });
      // Camada invisível: só para a fonte carregar e os grupos poderem ser lidos.
      mapa.addLayer({ id: FONTE, type: 'circle', source: FONTE, paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
    }
    const lista = () => [...dados.values()].map((d) => d.o);

    // ---- Popup do pino ----
    function conteudoPopup(id) {
      const o = dados.get(id).o;
      const div = elementoDe(ML.htmlPopup(o), 'popup');
      div.querySelectorAll('[data-acao]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          setTimeout(() => aoAgir(o.id, b.dataset.acao));
        };
      });
      // As do histórico simulado não estão no store: não há gaveta de detalhes para abrir.
      if (aoDetalhar && !o.historico) {
        const det = document.createElement('button');
        det.className = 'btn-detalhes';
        det.dataset.abreGaveta = '';
        det.textContent = 'Ver detalhes →';
        det.onclick = (e) => {
          e.stopPropagation();
          emFoco = false; // o foco passa para a gaveta, sem voltar o mapa no meio
          fecharPopups();
          setTimeout(() => aoDetalhar(o.id));
        };
        div.appendChild(det);
      }
      return div;
    }
    const popupAberto = () => [...pinos.values()].find((p) => p.popup.isOpen());
    // Fecha todo popup (pinos, conquistas e a resolvida).
    function fecharPopups() {
      pinos.forEach((p) => { if (p.popup.isOpen()) p.popup.remove(); });
      conquistas.forEach((c) => { if (c.popup.isOpen()) c.popup.remove(); });
      if (resolvida && resolvida.popup.isOpen()) resolvida.popup.remove();
      leitos.forEach((l) => { if (l.popup.isOpen()) l.popup.remove(); });
      if (popupRisco.isOpen()) popupRisco.remove();
      obras.forEach((ob) => { if (ob.popup.isOpen()) ob.popup.remove(); });
      escolas.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      frotaPinos.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
      if (popupLinha.isOpen()) popupLinha.remove();
      if (popupColeta.isOpen()) popupColeta.remove();
      farmacias.forEach((x) => { if (x.popup.isOpen()) x.popup.remove(); });
    }

    // ---- Popups que viram gaveta ----
    // Com o app, o conteúdo dos popups (risco, leitos, obras, escolas, frota…) aparece na gaveta da direita.
    // O popup continua "aberto" (escondido) para o resto do mapa funcionar igual: fechar a gaveta fecha o
    // popup, e clicar fora do ponto (que fecha o popup) fecha a gaveta. Ao fechar, o conteúdo volta para o
    // popup: os que recebem o HTML uma vez só (conquista, resolvida) abrem de novo inteiros.
    function naGaveta(popup) {
      if (!aoInfo) return popup;
      let fecharGaveta = null;
      let conteudo = null;
      let caixa = null;
      popup.on('open', () => {
        const el = popup.getElement();
        if (el) el.classList.add('popup-na-gaveta');
        setTimeout(() => { // depois de quem preenche o popup no próprio 'open'
          if (!popup.isOpen()) return;
          conteudo = popup.getElement().querySelector('.maplibregl-popup-content');
          caixa = document.createElement('div');
          caixa.className = 'info-conteudo';
          [...conteudo.childNodes].forEach((n) => {
            if (!(n.classList && n.classList.contains('maplibregl-popup-close-button'))) caixa.appendChild(n);
          });
          fecharGaveta = aoInfo(caixa, { fechar: () => { if (popup.isOpen()) popup.remove(); }, lngLat: popup.getLngLat() });
        });
      });
      popup.on('close', () => {
        if (conteudo && caixa) while (caixa.firstChild) conteudo.appendChild(caixa.firstChild);
        conteudo = null;
        caixa = null;
        const f = fecharGaveta;
        fecharGaveta = null;
        if (f) f();
      });
      return popup;
    }

    // ---- Pinos e grupos (elementos HTML) ----
    function marcarAceso(id) {
      const p = pinos.get(id);
      if (!p) return;
      const div = p.el.querySelector('.marcador');
      if (div) div.classList.toggle('acesa', id === acesoId);
      p.el.style.zIndex = id === acesoId ? '2' : '';
    }

    function criarPino(id) {
      const d = dados.get(id);
      const el = elementoDe(ML.htmlPino(d.o, { novo: d.novo }));
      el.dataset.id = id;
      d.novo = false;
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', className: 'popup-ocorrencia' });
      popup.on('open', () => { popup.setDOMContent(conteudoPopup(id)); fecharDica(); });
      popup.on('close', () => encerrarFoco());
      const marker = new maplibregl.Marker({ element: el }).setLngLat([d.o.lng, d.o.lat]);
      // Clique no pino abre o detalhe na gaveta da direita (com o app); sem app, o popup de sempre. As do
      // histórico simulado (linha do tempo) não estão no store: ficam com o popup, só de leitura.
      if (aoDetalhar && !d.o.historico) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          fecharDica();
          fecharPopups();
          aoDetalhar(id);
        });
      } else marker.setPopup(popup);
      if (emEntrada()) el.style.setProperty('--atraso', `${500 + (pinosNaEntrada++) * 55}ms`);
      el.setAttribute('aria-label', ML.rotuloPino(d.o)); // o MapLibre põe "Map marker"
      el.addEventListener('mouseenter', () => { el.style.zIndex = '3'; if (!popup.isOpen()) abrirDica(id); });
      el.addEventListener('mouseleave', () => { el.style.zIndex = id === acesoId ? '2' : ''; if (acesoId !== id) fecharDica(id); });
      const p = { id, marker, el, popup };
      pinos.set(id, p);
      marcarAceso(id);
      return p;
    }

    function criarGrupo(f, chave) {
      const props = f.properties;
      const sev = ML.sevDoNivel(props.nivel);
      const contagem = { critica: props.critica || 0, alta: props.alta || 0, media: props.media || 0 };
      const el = elementoDe(ML.htmlGrupo(sev, props.point_count, props.pulsa > 0, contagem));
      const marker = new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates);
      if (emEntrada()) el.style.setProperty('--atraso', `${500 + (pinosNaEntrada++) * 55}ms`);
      marker.getElement().setAttribute('aria-label', ML.rotuloGrupo(props.point_count, contagem));
      const g = { chave, sev, clusterId: props.cluster_id, el, marker };
      const abrir = async (e) => {
        e.stopPropagation();
        fecharDica();
        const z = await mapa.getSource(FONTE).getClusterExpansionZoom(props.cluster_id);
        mapa.easeTo({ center: f.geometry.coordinates, zoom: Math.min(ZOOM_MAX, z + 0.25) });
      };
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
      grupos.set(chave, g);
      return g;
    }

    function sincronizar() {
      if (!fontesCarregadas()) return;
      const vivos = new Map();
      mapa.querySourceFeatures(FONTE).forEach((f) => {
        const p = f.properties;
        if (p.cluster) {
          // O id de um grupo se repete entre zooms e após dados novos: a chave leva também o conteúdo.
          const chave = `g:${p.cluster_id}:${p.point_count}:${p.pulsa}:${p.critica}:${p.alta}:${p.media}`;
          if (!vivos.has(chave)) vivos.set(chave, grupos.get(chave) || criarGrupo(f, chave));
        } else if (dados.has(p.id) && !vivos.has(p.id)) {
          vivos.set(p.id, pinos.get(p.id) || criarPino(p.id));
        }
      });
      // Pino com popup aberto fica, mesmo que a fonte ainda esteja reagrupando (mudou de gravidade).
      const aberto = popupAberto();
      if (aberto && dados.has(aberto.id)) vivos.set(aberto.id, aberto);
      naTela.forEach((item, chave) => { if (!vivos.has(chave)) item.marker.remove(); });
      vivos.forEach((item, chave) => { if (!naTela.has(chave)) item.marker.addTo(mapa); });
      naTela = vivos;
      grupos.forEach((g, chave) => { if (!vivos.has(chave)) grupos.delete(chave); });
      // O ponto realçado pode ter entrado ou saído de um grupo.
      if (acesoId) realcarGrupo(acesoId);
    }

    let agendado = false;
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => { agendado = false; sincronizar(); });
    };
    let ultimoNivel = null;
    mapa.on('render', () => {
      const nivel = Math.floor(mapa.getZoom());
      if (nivel !== ultimoNivel) { ultimoNivel = nivel; agendar(); }
    });
    mapa.on('moveend', agendar);
    mapa.on('sourcedata', (e) => { if (e.sourceId === FONTE && e.isSourceLoaded) agendar(); });

    function renderOcorrencias(novaLista) {
      const ids = new Set(novaLista.map((o) => o.id));
      for (const id of [...dados.keys()]) {
        if (ids.has(id)) continue;
        dados.delete(id);
        const p = pinos.get(id);
        if (p) {
          p.marker.remove(); // fecha o popup junto (e o foco termina)
          pinos.delete(id);
          naTela.delete(id);
        }
        fecharDica(id);
      }
      novaLista.forEach((o) => {
        const assinatura = ML.assinatura(o);
        const d = dados.get(o.id);
        if (!d) {
          dados.set(o.id, { o, assinatura, novo: !primeiraRenderizacao });
          return;
        }
        d.o = o;
        if (d.assinatura === assinatura) return;
        d.assinatura = assinatura;
        // Mudou o que se vê: redesenha o pino no lugar (o popup aberto continua aberto, com o texto novo).
        const p = pinos.get(o.id);
        if (p) {
          p.el.innerHTML = ML.htmlPino(o);
          p.el.setAttribute('aria-label', ML.rotuloPino(o));
          marcarAceso(o.id);
          if (p.popup.isOpen()) p.popup.setDOMContent(conteudoPopup(o.id));
        }
        if (dicaDe === o.id) abrirDica(o.id);
      });
      primeiraRenderizacao = false;
      if (!ocorrenciasProntas()) return; // o estilo ainda carrega: montarOcorrencias usa estes dados
      const geo = ML.geoTodas(lista());
      const json = JSON.stringify(geo);
      if (json !== geoAtual) {
        geoAtual = json;
        mapa.getSource(FONTE).setData(geo);
        contarBairros();
      }
      agendar();
    }

    // ---- Grupos que escondem um ponto ----
    // Grupo na tela que contém o ponto (null se ele está solto ou fora da tela). Assíncrono no MapLibre.
    async function grupoDe(id) {
      const d = dados.get(id);
      if (!d || naTela.has(id)) return null;
      for (const item of naTela.values()) {
        if (item.clusterId === undefined) continue;
        try {
          const folhas = await mapa.getSource(FONTE).getClusterLeaves(item.clusterId, Infinity, 0);
          if (folhas.some((f) => f.properties.id === id)) return item;
        } catch (e) {
          // Grupo desfeito no meio da consulta (zoom mudou): segue para o próximo.
        }
      }
      return null;
    }

    let pedidoRealce = 0;
    async function realcarGrupo(id) {
      const meu = ++pedidoRealce;
      const g = await grupoDe(id);
      if (meu !== pedidoRealce || acesoId !== id) return;
      if (grupoAceso && grupoAceso !== g) grupoAceso.el.querySelector('.grupo-pinos').classList.remove('acesa');
      grupoAceso = g;
      if (g) g.el.querySelector('.grupo-pinos').classList.add('acesa');
    }

    // Passar o mouse num cartão não mexe no zoom: se o ponto está agrupado, o grupo acende.
    function acender(id) {
      const anterior = acesoId;
      acesoId = id || null;
      if (anterior) {
        marcarAceso(anterior);
        fecharDica(anterior);
      }
      pedidoRealce++;
      if (grupoAceso) grupoAceso.el.querySelector('.grupo-pinos').classList.remove('acesa');
      grupoAceso = null;
      if (!acesoId) return;
      marcarAceso(acesoId);
      if (naTela.has(acesoId)) {
        const p = pinos.get(acesoId);
        if (!p.popup.isOpen()) abrirDica(acesoId);
      } else {
        realcarGrupo(acesoId);
      }
    }

    // ---- Foco ----
    // Espera só as fontes dos pontos (não o fundo inteiro, que demora mais) e a câmera parar.
    // Limite de 2 s: se algo travar, segue com o que houver.
    const esperarMapa = () => new Promise((ok) => {
      let feito = false;
      const ver = () => {
        if (feito || !fontesCarregadas() || mapa.isMoving()) return;
        feito = true;
        mapa.off('sourcedata', ver);
        mapa.off('moveend', ver);
        ok();
      };
      mapa.on('sourcedata', ver);
      mapa.on('moveend', ver);
      setTimeout(() => { if (!feito) { feito = true; mapa.off('sourcedata', ver); mapa.off('moveend', ver); ok(); } }, 2000);
      ver();
    });
    // Move a câmera e espera ela parar. O ouvinte entra ANTES do movimento: com "reduzir movimento" no
    // sistema, o MapLibre troca a animação por um salto e dispara o moveend dentro da própria chamada
    // (ouvir depois esperava para sempre e travava o foco e o telão). Limite de 4 s, como garantia.
    // Depois do moveend, espera também o mapa assentar (idle): após um salto, os pinos e grupos do novo
    // enquadramento só existem quando os blocos forem redesenhados.
    const esperarEvento = (evento, ms) => new Promise((ok) => {
      const fim = () => { clearTimeout(limite); mapa.off(evento, fim); ok(); };
      const limite = setTimeout(fim, ms);
      mapa.on(evento, fim);
    });
    const moverEEsperar = async (mover) => {
      const parou = esperarEvento('moveend', 4000);
      mover();
      await parou;
      await esperarEvento('idle', 1500);
    };

    // Ponto dentro de um grupo: dá o zoom que abre o grupo e só então segue. Só o pedido mais recente segue: um foco antigo (outro cartão clicado, ponto resolvido
    // ou filtrado) é descartado.
    async function mostrarNoGrupo(id, depois) {
      const meu = ++pedidoFoco;
      const valido = () => meu === pedidoFoco && dados.has(id);
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        await esperarMapa();
        if (!valido()) return;
        sincronizar();
        if (naTela.has(id)) { depois(valido); return; }
        const g = await grupoDe(id);
        if (!valido()) return;
        const o = dados.get(id).o;
        let zoom = mapa.getZoom();
        if (g) zoom = Math.max(zoom, await mapa.getSource(FONTE).getClusterExpansionZoom(g.clusterId));
        if (!valido()) return;
        // Sem grupo na tela, o ponto está fora dela: centraliza nele e tenta de novo.
        await moverEEsperar(() => mapa.easeTo({ center: [o.lng, o.lat], zoom: Math.min(ZOOM_MAX, zoom), duration: 500 }));
      }
      if (valido() && naTela.has(id)) depois(valido);
    }
    const cancelarFoco = () => { pedidoFoco++; };

    function encerrarFoco() {
      cancelarFoco();
      if (!emFoco) return;
      emFoco = false;
      voltarAoInicio();
    }

    function focar(id) {
      if (!dados.has(id)) return;
      emFoco = false;
      fecharPopups();
      mostrarNoGrupo(id, async (valido) => {
        const o = dados.get(id).o;
        // Nunca afasta o zoom: se o grupo só se abre acima do zoom de foco, voltar a ele o fecharia de novo.
        await moverEEsperar(() => mapa.flyTo({ center: [o.lng, o.lat], zoom: Math.max(ZOOM_FOCO, mapa.getZoom()), duration: 800 }));
        await esperarMapa();
        if (!valido()) return;
        sincronizar();
        // Com o app, o detalhe abre na gaveta da direita (e ela reposiciona o ponto ao lado dela).
        if (aoDetalhar && !o.historico) { aoDetalhar(id); return; }
        const p = pinos.get(id);
        if (p && !p.popup.isOpen()) p.marker.togglePopup();
        emFoco = true;
      });
    }

    // Modo telão: um movimento só, contínuo e em linha reta, até o ponto: posição, zoom, inclinação e
    // giro mudam juntos. Entre dois alertas a câmera desliza de um ao outro sem se afastar (easeTo, não
    // o arco do flyTo, que subia e descia). O zoom final já é calculado antes de sair, alto o bastante
    // para o ponto estar solto (fora de grupo): assim não há zooms em degraus para abrir grupos.
    // Devolve uma promessa: true quando a câmera chegou ao ponto; false se o ponto não está no mapa
    // (resolvido, filtrado) ou se outro foco passou na frente. aoComecar() roda quando o voo começa.
    const LADO_MUNDO = 512; // pixels do mundo inteiro no zoom 0 (blocos de 512 px)
    function zoomParaSoltar(o) {
      const p = maplibregl.MercatorCoordinate.fromLngLat([o.lng, o.lat]);
      let menor = Infinity;
      dados.forEach(({ o: x }) => {
        if (x.id === o.id) return;
        const q = maplibregl.MercatorCoordinate.fromLngLat([x.lng, x.lat]);
        menor = Math.min(menor, Math.hypot(p.x - q.x, p.y - q.y));
      });
      if (!Number.isFinite(menor)) return 0;
      if (menor === 0) return ZOOM_MAX; // mesmo lugar: só se separam no zoom máximo
      // No zoom z, a distância em pixels é menor * 512 * 2^z; solto quando passa do raio do grupo.
      const z = Math.log2(RAIO_GRUPO / (menor * LADO_MUNDO)) + 0.3; // folga
      return z > ZOOM_MAX - 1 ? ZOOM_MAX : z;
    }
    // espacoEsquerda(): pixels ocupados à esquerda (o cartão do telão). O ponto fica no centro da área
    // livre, e o giro lento acontece em volta dele (o padding muda o centro da câmera).
    const SEM_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
    async function sobrevoar(id, { aoComecar, espacoEsquerda } = {}) {
      if (!dados.has(id)) return false;
      fecharPopups();
      fecharDica();
      const meu = ++pedidoFoco; // pausar ou outro sobrevoo no meio do voo cancela este
      const o = dados.get(id).o;
      // De -25° a +25°, sempre o mesmo para o mesmo ponto (hash do id: o tamanho dele quase não varia).
      const hash = [...o.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const giro = (hash % 51) - 25;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_FOCO + 0.4, zoomParaSoltar(o)));
      if (aoComecar) aoComecar();
      acender(id);
      // Duração pela distância na tela: vizinhos perto, deslize curto; do outro lado da cidade, mais longo.
      const a = mapa.project(mapa.getCenter());
      const b = mapa.project([o.lng, o.lat]);
      const duracao = Math.round(Math.min(4500, Math.max(2200, 1400 + Math.hypot(b.x - a.x, b.y - a.y) * 1.6)));
      // Só espera a câmera parar (não o mapa assentar): o telão emenda o giro lento na mesma hora,
      // sem uma parada entre o deslize e o giro.
      const parou = esperarEvento('moveend', duracao + 1500);
      const esquerda = espacoEsquerda ? espacoEsquerda() : 0;
      mapa.easeTo({ center: [o.lng, o.lat], zoom, pitch: 50, bearing: giro, duration: duracao, essential: true,
        padding: Object.assign({}, SEM_PADDING, { left: esquerda }) });
      await parou;
      return meu === pedidoFoco && dados.has(id);
    }

    // Leva um ponto qualquer para o centro da área que sobra à esquerda da gaveta.
    function centralizarAoLado(lngLat, larguraOcupada) {
      const tela = mapa.getContainer();
      const ponto = mapa.project(lngLat);
      const alvo = { x: (tela.clientWidth - larguraOcupada) / 2, y: tela.clientHeight / 2 };
      mapa.panBy([ponto.x - alvo.x, ponto.y - alvo.y], { duration: 600 });
    }

    // Leva o ponto para o centro da área que sobra à esquerda da gaveta.
    function mostrarAoLado(id, larguraOcupada) {
      if (!dados.has(id)) return;
      emFoco = true;
      mostrarNoGrupo(id, () => {
        const o = dados.get(id).o;
        const tela = mapa.getContainer();
        const ponto = mapa.project([o.lng, o.lat]);
        const alvo = { x: (tela.clientWidth - larguraOcupada) / 2, y: tela.clientHeight / 2 };
        mapa.panBy([ponto.x - alvo.x, ponto.y - alvo.y], { duration: 600 });
        if (acesoId === id) {
          marcarAceso(id);
          abrirDica(id);
        }
      });
    }

    function fecharPopup(id) {
      const p = pinos.get(id);
      if (p && p.popup.isOpen()) p.popup.remove();
    }

    // ======================= Camadas da IA =======================
    let pontosCalor = null; // pontos do mapa de calor ligado (null = desligado)
    const vazio = { type: 'FeatureCollection', features: [] };

    // Mapa de calor: cores de ML.GRADIENTE_CALOR (as da legenda); por cima do preenchimento dos bairros, sob os nomes.
    function montarCalor() {
      mapa.addSource('calor', { type: 'geojson', data: pontosCalor ? ML.geoCalor(pontosCalor) : vazio });
      const cores = ML.paradasCalor().flat();
      mapa.addLayer({ id: 'calor', type: 'heatmap', source: 'calor', paint: {
        'heatmap-weight': ['get', 'peso'],
        // Calibrado no "onde mais alaga?": centro dos focos em amarelo/laranja, borda em azul.
        'heatmap-intensity': 2,
        'heatmap-radius': 55,
        'heatmap-opacity': 0.8,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, ML.CALOR_TRANSPARENTE, ...cores],
      } }, 'bairros-contorno');
    }
    // Calor dos B.O.s (30 dias): camada fixa do prefeito, liga/desliga pelo controle do mapa. Fica sob a
    // camada da IA e usa as mesmas cores; montada de novo se o estilo trocar (reserva).
    let calorBOVisivel = false;
    function montarCalorBO() {
      if (!GC.seguranca) return;
      mapa.addSource('calor-bo', { type: 'geojson', data: ML.geoCalor(GC.seguranca.pontosCalor()) });
      mapa.addLayer({ id: 'calor-bo', type: 'heatmap', source: 'calor-bo', layout: { visibility: calorBOVisivel ? 'visible' : 'none' }, paint: {
        'heatmap-weight': ['get', 'peso'],
        // Calibrado para o Centro (92 B.O.s) chegar ao vermelho e o Alto da Serra (20) ficar azul.
        // Com zoom, o raio cresce (a mancha não vira pontinhos) e a intensidade cai (não satura tudo de vermelho).
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 15, 0.7],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 42, 15, 80],
        'heatmap-opacity': 0.6,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, ML.CALOR_TRANSPARENTE, ...ML.paradasCalor().flat()],
      } }, 'bairros-contorno');
    }
    function alternarCalorBO(visivel) {
      calorBOVisivel = !!visivel;
      if (mapa.getLayer('calor-bo')) mapa.setLayoutProperty('calor-bo', 'visibility', calorBOVisivel ? 'visible' : 'none');
      avisarLegenda();
    }

    // Áreas de risco da Defesa Civil × chuva prevista: polígono na cor do nível (vermelho = risco em até 6 h),
    // contorno tracejado se já atingida. Liga/desliga pelo controle do mapa; clique abre o detalhe.
    const COR_RISCO = ML.COR_RISCO;
    const ROTULO_NIVEL = { alto: 'Risco alto', medio: 'Risco médio', baixo: 'Risco baixo' };
    let riscoVisivel = false;
    let riscoAtual = GC.risco ? GC.risco.resumo() : null;
    const geoRisco = (r) => ({ type: 'FeatureCollection', features: (r ? r.areas : []).map((a) => ({
      type: 'Feature',
      properties: { id: a.id, nivel: a.nivel, atingida: a.atingida },
      geometry: { type: 'Polygon', coordinates: [[...a.poligono, a.poligono[0]].map(([lat, lng]) => [lng, lat])] },
    })) });
    function montarRisco() {
      if (!riscoAtual) return;
      const vis = riscoVisivel ? 'visible' : 'none';
      const cor = ['match', ['get', 'nivel'], 'alto', COR_RISCO.alto, 'medio', COR_RISCO.medio, COR_RISCO.baixo];
      mapa.addSource('risco', { type: 'geojson', data: geoRisco(riscoAtual), promoteId: 'id' });
      mapa.addLayer({ id: 'risco-preenchimento', type: 'fill', source: 'risco', layout: { visibility: vis },
        paint: { 'fill-color': cor, 'fill-opacity': ['match', ['get', 'nivel'], 'alto', 0.35, 'medio', 0.28, 0.18] } }, 'bairros-rotulo');
      mapa.addLayer({ id: 'risco-contorno', type: 'line', source: 'risco', layout: { visibility: vis },
        paint: { 'line-color': cor, 'line-width': ['case', ['get', 'atingida'], 3, 1.8] } }, 'bairros-rotulo');
    }
    function htmlRisco(a) {
      const esc = GC.escaparHtml;
      const p = riscoAtual.previsao;
      const quando = a.horasAte === null ? 'a chuva prevista não chega ao limiar em 24 h' : `chuva passa do limiar em ~${a.horasAte} h`;
      const base = a.tipo === 'deslizamento' ? ` (já choveu ${p.acumulado72h} mm em 72 h)` : '';
      return `<div class="popup popup-risco"><span class="sev risco-${a.nivel}">${ROTULO_NIVEL[a.nivel]}</span>
        <h3>${a.tipo === 'deslizamento' ? '⛰' : '🌧'} ${esc(a.nome)}</h3>
        <div class="linha">${a.tipo === 'deslizamento' ? 'Deslizamento' : 'Alagamento'} · ${esc(quando)}</div>
        <div class="linha">Limiar ${a.limiarMm} mm${esc(base)} · previsão 24 h: ${p.janelas[p.janelas.length - 1].mm} mm</div>
        <div class="linha">👥 ${a.familias} famílias na área${a.atingida ? ' · <b class="risco-atingida">🚨 já atingida agora</b>' : ''}</div>
        <div class="linha acao">👉 ${esc(a.acao)}</div></div>`;
    }
    const popupRisco = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupRisco.on('close', () => encerrarFoco());
    naGaveta(popupRisco);
    function abrirRisco(id, lngLat) {
      const a = riscoAtual && riscoAtual.areas.find((x) => x.id === id);
      if (!a) return;
      const centro = lngLat || [a.poligono.reduce((s, q) => s + q[1], 0) / a.poligono.length, a.poligono.reduce((s, q) => s + q[0], 0) / a.poligono.length];
      popupRisco.setLngLat(centro).setHTML(htmlRisco(a)).addTo(mapa);
    }
    mapa.on('click', 'risco-preenchimento', (e) => {
      if (deCimaDoMapa(e) || !e.features.length) return;
      abrirRisco(e.features[0].properties.id, e.lngLat);
    });
    mapa.on('mouseenter', 'risco-preenchimento', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    function alternarRisco(visivel) {
      riscoVisivel = !!visivel;
      ['risco-preenchimento', 'risco-contorno'].forEach((id) => {
        if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', riscoVisivel ? 'visible' : 'none');
      });
      if (!riscoVisivel && popupRisco.isOpen()) popupRisco.remove();
      avisarLegenda();
    }
    // O app recalcula a cada mudança (ocorrência resolvida deixa de "atingir" a área).
    function atualizarRisco(r) {
      riscoAtual = r;
      const f = mapa.getSource('risco');
      if (f) f.setData(geoRisco(r));
    }
    function focarRisco(id) {
      const a = riscoAtual && riscoAtual.areas.find((x) => x.id === id);
      if (!a) return;
      alternarRisco(true);
      fecharPopups();
      mapa.fitBounds(ML.limites([a]), { padding: margens(120), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirRisco(id); emFoco = true; });
    }

    function pintarCalor() {
      const f = mapa.getSource('calor');
      if (f) f.setData(pontosCalor ? ML.geoCalor(pontosCalor) : vazio);
    }

    // A legenda fixa explica as camadas ligadas: avisa o app a cada mudança.
    let conquistasVisiveis = false;
    function avisarLegenda() {
      if (aoMudarLegenda) aoMudarLegenda({ risco: riscoVisivel, calorBO: calorBOVisivel, conquistas: conquistasVisiveis, destaqueIA: destacados.length > 0, calorIA: !!pontosCalor });
    }

    function mostrarLegenda(texto, calor) {
      if (!legenda) return;
      legenda.innerHTML = ML.htmlLegenda(texto, calor);
      legenda.querySelector('.legenda-fechar').onclick = () => limparEVoltar();
      legenda.hidden = false;
    }

    function limparCamada() {
      pontosCalor = null;
      pintarCalor();
      destacados = [];
      pintarBairros();
      if (legenda) legenda.hidden = true;
      avisarLegenda();
      if (aoMudarCamada) aoMudarCamada(false);
    }

    function mostrarCamada(m) {
      if (!m) return;
      limparCamada();
      if (m.tipo === 'calor') {
        pontosCalor = m.pontos;
        pintarCalor();
      }
      if (m.tipo === 'destaque') {
        destacados = m.bairros.filter((id) => bairroPorId(id));
        pintarBairros();
      }
      if (m.foco) mapa.flyTo({ center: [m.foco.lng, m.foco.lat], zoom: ML.zoomMapLibre(m.foco.zoom), duration: 1000 });
      else if (destacados.length) mapa.fitBounds(ML.limites(destacados.map(bairroPorId)), { padding: margens(60), duration: 1000 });
      mostrarLegenda(m.legenda || 'Camada da IA', m.tipo === 'calor');
      avisarLegenda();
      if (aoMudarCamada) aoMudarCamada(true);
    }

    // ======================= Conquistas e resolvida =======================
    // Popup de pino especial: mesmo visual; fechar qualquer popup encerra o foco.
    const popupSimples = (html) => {
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', className: 'popup-ocorrencia' }).setHTML(html);
      popup.on('close', () => encerrarFoco());
      return naGaveta(popup);
    };

    const conquistas = GC.data.conquistas.map((c) => {
      const popup = popupSimples(ML.htmlPopupConquista(c));
      const marker = new maplibregl.Marker({ element: elementoDe(ML.HTML_CONQUISTA) }).setLngLat([c.lng, c.lat]).setPopup(popup);
      marker.getElement().setAttribute('aria-label', 'Conquista: ' + c.titulo);
      return { marker, popup };
    });
    function alternarConquistas(visivel) {
      conquistasVisiveis = !!visivel;
      conquistas.forEach((c) => { if (visivel) c.marker.addTo(mapa); else c.marker.remove(); });
      avisarLegenda();
    }
    // Resumo da semana: voa até a entrega e abre o popup dela (a camada de conquistas já vem ligada).
    function focarConquista(id) {
      const i = GC.data.conquistas.findIndex((c) => c.id === id);
      if (i < 0) return;
      const c = conquistas[i];
      fecharPopups();
      mapa.flyTo({ center: c.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] });
      mapa.once('moveend', () => { if (!c.popup.isOpen()) c.marker.togglePopup(); });
    }

    let resolvida = null; // ponto ✅ temporário de "Resolvidas recentemente"
    function tirarResolvida() {
      if (!resolvida) return;
      const r = resolvida;
      resolvida = null;
      r.marker.remove();
    }

    // Mostra onde foi uma ocorrência já resolvida (ela não está mais entre os pontos ativos).
    function mostrarResolvida(r) {
      tirarResolvida();
      emFoco = false;
      fecharPopups();
      const el = elementoDe(ML.HTML_RESOLVIDA);
      el.style.zIndex = '4';
      const popup = popupSimples(ML.htmlPopupResolvida(r));
      const atual = { popup, marker: new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(mapa) };
      resolvida = atual;
      popup.on('close', () => { if (resolvida === atual) tirarResolvida(); });
      mapa.flyTo({ center: [r.lng, r.lat], zoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => {
        if (resolvida !== atual) return;
        if (!popup.isOpen()) atual.marker.togglePopup();
        emFoco = true;
      });
    }

    // Há algo temporário no mapa (popup, camada da IA, foco ou resolvida)?
    const temAlgoAberto = () => !!elemento.querySelector('.maplibregl-popup:not(.resumo-ml)') || !!pontosCalor
      || destacados.length > 0 || emFoco || !!resolvida;

    // O prefeito pediu para tirar a camada da IA (ou tudo): limpa e volta ao enquadramento inicial.
    function limparEVoltar() {
      cancelarFoco();
      emFoco = false;
      fecharPopups();
      tirarResolvida();
      limparCamada();
      voltarAoInicio();
    }

    // ======================= Leitos (hospitais e UPAs) =======================
    // Pino com a ocupação (a pior entre geral e UTI), na cor da situação. Liga/desliga pelo controle do mapa.
    const SIT_LEITO = { critica: 'Crítica', atencao: 'Atenção', ok: 'Folga' };
    const escL = (t) => GC.escaparHtml(t);
    const nomeBairro = (id) => GC.data.bairros.find((b) => b.id === id).nome;
    function conteudoLeito(u) {
      const div = elementoDe('', 'popup popup-leito');
      const barras = u.grupos.map((x) => {
        const p = Math.round((x.ocupados / x.total) * 100);
        return `<li><span>${escL(x.rotulo)}</span><i class="${GC.leitos.situacao(p)}" style="--v:${p}%"></i><b>${x.ocupados}/${x.total}</b></li>`;
      }).join('');
      const tipos = Object.entries(u.atendimentosHoje).map(([t, n]) => `${escL(t)} ${n}`).join(' · ');
      div.innerHTML = `<span class="sev leito-${u.situacao}">${SIT_LEITO[u.situacao]}</span>
        <h3>${u.tipo === 'upa' ? '🚑' : '🏥'} ${escL(u.nome)}</h3>
        <div class="linha">📍 ${escL(nomeBairro(u.bairroId))} · <b>${u.pct}%</b> ocupado · ${u.livres} leitos livres</div>
        <ul class="leito-grupos">${barras}</ul>
        <div class="linha">🩺 ${u.atendimentos} atendimentos hoje · ${tipos}</div>`;
      if (u.ocorrenciaId && aoDetalhar) {
        const b = document.createElement('button');
        b.className = 'btn-detalhes';
        b.textContent = 'Ver alerta →';
        b.onclick = (e) => {
          e.stopPropagation();
          emFoco = false; // o foco passa para a gaveta
          fecharPopups();
          setTimeout(() => aoDetalhar(u.ocorrenciaId));
        };
        div.appendChild(b);
      }
      return div;
    }
    const leitos = new Map(GC.leitos.resumo().unidades.map((u) => {
      const el = elementoDe(`<div class="marcador-equip marcador-leito ${u.situacao}"><span>${u.tipo === 'upa' ? '🚑' : '🏥'}</span><b>${Math.max(u.pct, u.utiPct || 0)}%</b></div>`);
      el.title = `${u.nome}: ${u.pct}% dos leitos ocupados${u.utiPct !== null ? ` · UTI ${u.utiPct}%` : ''}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoLeito(u)));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([u.lng, u.lat]).setPopup(popup);
      el.setAttribute('aria-label', el.title);
      return [u.id, { marker, popup }];
    }));
    // ======================= Obras =======================
    // Pino de capacete na cor da situação (paralisada, atrasada, em dia, concluída). Liga/desliga pelo
    // controle do mapa; o widget de obras filtra por setor.
    const SIT_OBRA = { paralisada: 'Paralisada', atrasada: 'Atrasada', em_dia: 'No prazo', concluida: 'Concluída' };
    const dataBR = (iso) => iso.split('-').reverse().join('/');
    const mi = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
    function conteudoObra(ob) {
      const setor = GC.data.obras.setores.find((s) => s.id === ob.setor);
      const atraso = ob.diasAtraso ? ` · <b class="obra-atraso">${ob.diasAtraso} dias de atraso</b>` : '';
      const parada = ob.situacao === 'paralisada' ? `<div class="linha obra-alerta">⏸ Sem avanço há ${ob.semAvancoDias} dias</div>` : '';
      const gasto = ob.gastoAFrente ? `<div class="linha obra-alerta">💰 Pago ${ob.gastoPct}% do contrato com ${ob.avancoPct}% da obra feita</div>` : '';
      return elementoDe(`<span class="sev obra-${ob.situacao}">${SIT_OBRA[ob.situacao]}</span>
        <h3>🏗 ${escL(ob.nome)}</h3>
        <div class="linha">${setor.emoji} ${escL(setor.nome)} · 📍 ${escL(nomeBairro(ob.bairroId))} · ${escL(ob.empresa)}</div>
        <ul class="obra-barras">
          <li><span>Obra feita</span><i style="--v:${ob.avancoPct}%"></i><b>${ob.avancoPct}%</b></li>
          <li><span>Pago</span><i class="pago" style="--v:${Math.min(ob.gastoPct, 100)}%"></i><b>${ob.gastoPct}%</b></li>
        </ul>
        <div class="linha">Contrato ${mi(ob.contratoMi)} · pago ${mi(ob.gastoMi)}</div>
        <div class="linha">Início ${dataBR(ob.inicio)} · ${ob.diasEmAndamento} dias ${ob.situacao === 'concluida' ? 'de obra' : 'em andamento'}</div>
        <div class="linha">Previsão ${dataBR(ob.previsaoOriginal)}${ob.previsaoAtual !== ob.previsaoOriginal ? ` → ${ob.situacao === 'concluida' ? 'entregue' : 'agora'} ${dataBR(ob.previsaoAtual)}` : ''}${atraso}</div>
        ${parada}${gasto}`, 'popup popup-obra');
    }
    const obras = new Map(GC.obras.resumo().obras.map((ob) => {
      const el = elementoDe(`<div class="marcador-equip marcador-obra ${ob.situacao}">🏗</div>`);
      el.title = `${ob.nome}: ${SIT_OBRA[ob.situacao]}${ob.diasAtraso ? ` · ${ob.diasAtraso} dias de atraso` : ''}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoObra(ob)));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([ob.lng, ob.lat]).setPopup(popup);
      el.setAttribute('aria-label', 'Obra: ' + el.title);
      return [ob.id, { marker, popup, setor: ob.setor }];
    }));
    let obrasVisiveis = false;
    let setorObras = null;
    function pintarObras() {
      obras.forEach((ob) => {
        if (obrasVisiveis && (!setorObras || ob.setor === setorObras)) ob.marker.addTo(mapa);
        else ob.marker.remove();
      });
    }
    function alternarObras(visivel) { obrasVisiveis = !!visivel; pintarObras(); }
    function filtrarObras(setor) { setorObras = setor || null; pintarObras(); }
    function focarObra(id) {
      const ob = obras.get(id);
      if (!ob) return;
      if (!ob.marker._map) ob.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: ob.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (!ob.popup.isOpen()) ob.marker.togglePopup();
        emFoco = true;
      });
    }

    // ======================= Frota (garagem, bases do SAMU e linhas de ônibus) =======================
    // Linhas: traço pelos centros dos bairros, na cor da espera nos pontos; garagem e bases: pino com
    // "operando / necessários". Tudo liga/desliga junto pelo controle "Frota".
    const COR_LINHA = { critica: '#dc2626', atencao: '#d97706', ok: '#2563eb' };
    let frotaVisivel = false;
    let frotaAtual = GC.frota ? GC.frota.resumo() : null;
    function geoLinhas(r) {
      const centro = (id) => (GC.data.bairros.find((b) => b.id === id) || {}).centro;
      return { type: 'FeatureCollection', features: (r ? r.linhas : []).map((x, i) => {
        const desvio = (i - 2.5) * 0.0009; // linhas que passam pelos mesmos bairros não se sobrepõem
        const pts = x.bairros.map(centro).filter(Boolean).map(([lat, lng]) => [lng + desvio, lat + desvio]);
        return { type: 'Feature', properties: { id: x.id, situacao: x.situacao }, geometry: { type: 'LineString', coordinates: pts } };
      }).filter((f) => f.geometry.coordinates.length >= 2) };
    }
    function montarLinhas() {
      if (!frotaAtual) return;
      mapa.addSource('linhas', { type: 'geojson', data: geoLinhas(frotaAtual) });
      mapa.addLayer({ id: 'linhas', type: 'line', source: 'linhas', layout: { visibility: frotaVisivel ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'situacao'], 'critica', COR_LINHA.critica, 'atencao', COR_LINHA.atencao, COR_LINHA.ok],
          'line-width': ['match', ['get', 'situacao'], 'critica', 6, 'atencao', 5, 3.5], 'line-opacity': 0.8 } }, 'bairros-rotulo');
    }
    const SIT_LINHA = { critica: 'Espera crítica', atencao: 'Atenção', ok: 'Normal' };
    function htmlLinha(x) {
      const esc = GC.escaparHtml;
      return `<div class="popup popup-linha"><span class="sev linha-${x.situacao}">${SIT_LINHA[x.situacao]}</span>
        <h3>🚌 ${esc(x.nome)}</h3>
        <div class="linha">Espera média nos pontos: <b>${x.esperaMin} min</b> (programado: a cada ${x.intervaloMin} min)</div>
        <div class="linha">${x.viagensPct}% das viagens de hoje cumpridas</div>
        <div class="linha">Passa por ${esc(x.bairros.filter((b, i, a) => a.indexOf(b) === i).map(nomeBairro).join(', '))}</div></div>`;
    }
    const popupLinha = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupLinha.on('close', () => encerrarFoco());
    naGaveta(popupLinha);
    function abrirLinha(id, lngLat) {
      const x = frotaAtual && frotaAtual.linhas.find((y) => y.id === id);
      const f = geoLinhas(frotaAtual).features.find((y) => y.properties.id === id);
      if (!x || !f) return;
      const c = f.geometry.coordinates;
      popupLinha.setLngLat(lngLat || c[Math.floor(c.length / 2)]).setHTML(htmlLinha(x)).addTo(mapa);
    }
    mapa.on('click', 'linhas', (e) => { if (!deCimaDoMapa(e) && e.features.length) abrirLinha(e.features[0].properties.id, e.lngLat); });
    mapa.on('mouseenter', 'linhas', () => { mapa.getCanvas().style.cursor = 'pointer'; });

    function conteudoFrota(b) {
      const samu = b.tipo === 'samu';
      const extra = samu
        ? `<div class="linha">⏱ Tempo de resposta: <b>${b.tempoRespostaMin} min</b> · ${b.chamadosHoje} chamados hoje</div>`
        : `<div class="linha">Operadora: ${escL(GC.data.frota.contrato.operadora)} (concessão)</div>`;
      return elementoDe(`<span class="sev frota-${b.disponibilidadePct >= 95 ? 'ok' : b.disponibilidadePct >= 85 ? 'atencao' : 'critica'}">${b.disponibilidadePct}% disponível</span>
        <h3>${samu ? '🚑' : '🚌'} ${escL(b.nome)}</h3>
        <ul class="escola-numeros">
          <li><b>${b.operando}/${b.necessarios}</b><small>${samu ? 'ambulâncias' : 'ônibus'} rodando / necessários</small></li>
          <li><b>${b.corretiva}</b><small>em manutenção corretiva</small></li>
          <li><b>${b.preventiva}</b><small>em preventiva hoje</small></li>
          <li><b>${b.preventivaVencida}</b><small>rodando com preventiva vencida</small></li>
        </ul>${extra}`, 'popup popup-frota');
    }
    const frotaPinos = new Map(frotaAtual ? [...frotaAtual.garagens, ...frotaAtual.bases].map((b) => {
      const sit = b.disponibilidadePct >= 95 ? 'ok' : b.disponibilidadePct >= 85 ? 'atencao' : 'critica';
      const el = elementoDe(`<div class="marcador-frota ${sit}">${b.tipo === 'samu' ? '🚑' : '🚌'}<b>${b.operando}/${b.necessarios}</b></div>`);
      el.title = `${b.nome}: ${b.operando} de ${b.necessarios} rodando`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoFrota(b)));
      return [b.id, { marker: new maplibregl.Marker({ element: el }).setLngLat([b.lng, b.lat]).setPopup(popup), popup }];
    }) : []);
    function alternarFrota(visivel) {
      frotaVisivel = !!visivel;
      if (mapa.getLayer('linhas')) mapa.setLayoutProperty('linhas', 'visibility', frotaVisivel ? 'visible' : 'none');
      frotaPinos.forEach((x) => { if (frotaVisivel) x.marker.addTo(mapa); else x.marker.remove(); });
      if (!frotaVisivel && popupLinha.isOpen()) popupLinha.remove();
    }
    // Foco numa linha (enquadra o trajeto) ou numa garagem/base (abre o pino).
    function focarFrota(id) {
      alternarFrota(true);
      fecharPopups();
      const pino = frotaPinos.get(id);
      if (pino) {
        mapa.flyTo({ center: pino.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] });
        mapa.once('moveend', () => { if (!pino.popup.isOpen()) pino.marker.togglePopup(); emFoco = true; });
        return;
      }
      const f = geoLinhas(frotaAtual).features.find((y) => y.properties.id === id);
      if (!f) return;
      const c = f.geometry.coordinates;
      const lngs = c.map((p) => p[0]);
      const lats = c.map((p) => p[1]);
      mapa.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: margens(120), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirLinha(id); emFoco = true; });
    }

    // ======================= Coleta de lixo (rotas e caminhões) =======================
    // Rota tracejada na cor da situação de hoje (atrasada, em andamento, normal; cinza se não passa hoje) e o
    // caminhão onde está agora (parado, se atrasado). Liga/desliga pelo controle "Coleta de lixo".
    const COR_COLETA = { atrasada: '#dc2626', em_andamento: '#d97706', agendada: '#15803d', concluida: '#15803d', sem_coleta_hoje: '#94a3b8' };
    const ROTULO_COLETA = { atrasada: 'Atrasada', em_andamento: 'Em andamento', agendada: 'Hoje, mais tarde', concluida: 'Concluída', sem_coleta_hoje: 'Não passa hoje' };
    let coletaVisivel = false;
    const coletaAtual = GC.coleta ? GC.coleta.resumo() : null;
    const trajetosColeta = new Map(coletaAtual ? coletaAtual.rotas.map((x, i) => [x.id, GC.coleta.trajeto(x, GC.data.bairros, i)]) : []);
    const geoColeta = () => ({ type: 'FeatureCollection', features: (coletaAtual ? coletaAtual.rotas : []).map((x) => ({
      type: 'Feature', properties: { id: x.id, status: x.status, tipo: x.tipo },
      geometry: { type: 'LineString', coordinates: trajetosColeta.get(x.id).map(([lat, lng]) => [lng, lat]) },
    })).filter((f) => f.geometry.coordinates.length >= 2) });
    function montarColeta() {
      if (!coletaAtual) return;
      mapa.addSource('coleta', { type: 'geojson', data: geoColeta() });
      mapa.addLayer({ id: 'coleta', type: 'line', source: 'coleta', layout: { visibility: coletaVisivel ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'status'], ...Object.entries(COR_COLETA).flat(), '#94a3b8'],
          'line-width': ['match', ['get', 'status'], 'atrasada', 5, 'em_andamento', 4.5, 3],
          'line-dasharray': [2, 1.5],
          'line-opacity': ['match', ['get', 'status'], 'sem_coleta_hoje', 0.55, 0.9],
        } }, 'bairros-rotulo');
    }
    function htmlColeta(x) {
      const esc = GC.escaparHtml;
      const dias = x.dias.map((d) => GC.data.coleta.nomeDia[d]).join(', ');
      const andamento = x.status === 'em_andamento' ? ` · ${x.progressoPct}% do trajeto` : '';
      return `<div class="popup popup-coleta"><span class="sev coleta-${x.status}">${ROTULO_COLETA[x.status]}${andamento}</span>
        <h3>🚛 ${esc(x.nome)}</h3>
        <div class="linha">${x.tipo === 'seletiva' ? 'Coleta seletiva (recicláveis)' : 'Coleta domiciliar'} · ${esc(x.caminhao)}</div>
        <div class="linha">📅 ${esc(dias)} · ${esc(x.horario)}</div>
        <div class="linha">Bairros: ${esc(x.bairros.map(nomeBairro).join(', '))}</div>
        <div class="linha">${x.noPrazoPct}% das coletas no prazo (30 dias)${x.atrasoMedioDias ? ` · atraso médio de ${x.atrasoMedioDias} dia(s)` : ''}</div>
        ${x.motivo ? `<div class="linha obra-alerta">⚠ ${esc(x.motivo)}</div>` : ''}</div>`;
    }
    const popupColeta = new maplibregl.Popup({ offset: 6, maxWidth: '300px', className: 'popup-ocorrencia' });
    popupColeta.on('close', () => encerrarFoco());
    naGaveta(popupColeta);
    function abrirColeta(id, lngLat) {
      const x = coletaAtual && coletaAtual.rotas.find((y) => y.id === id);
      if (!x) return;
      const pts = trajetosColeta.get(id);
      const [lat, lng] = lngLat ? [lngLat.lat, lngLat.lng] : GC.coleta.pontoNoTrajeto(pts, x.status === 'em_andamento' || x.status === 'atrasada' ? x.progressoPct / 100 : 0.5);
      popupColeta.setLngLat([lng, lat]).setHTML(htmlColeta(x)).addTo(mapa);
    }
    mapa.on('click', 'coleta', (e) => { if (!deCimaDoMapa(e) && e.features.length) abrirColeta(e.features[0].properties.id, e.lngLat); });
    mapa.on('mouseenter', 'coleta', () => { mapa.getCanvas().style.cursor = 'pointer'; });
    // Caminhões na rua hoje (em andamento ou parados por atraso), na fração do trajeto já feita.
    const caminhoes = new Map(coletaAtual ? coletaAtual.rotas.filter((x) => x.status === 'em_andamento' || x.status === 'atrasada').map((x) => {
      const [lat, lng] = GC.coleta.pontoNoTrajeto(trajetosColeta.get(x.id), x.progressoPct / 100);
      const el = elementoDe(`<div class="marcador-caminhao ${x.status}">🚛</div>`);
      el.title = `${x.caminhao} · ${x.nome}: ${ROTULO_COLETA[x.status]}`;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); fecharPopups(); abrirColeta(x.id); });
      return [x.id, new maplibregl.Marker({ element: el }).setLngLat([lng, lat])];
    }) : []);
    function alternarColeta(visivel) {
      coletaVisivel = !!visivel;
      if (mapa.getLayer('coleta')) mapa.setLayoutProperty('coleta', 'visibility', coletaVisivel ? 'visible' : 'none');
      caminhoes.forEach((m) => { if (coletaVisivel) m.addTo(mapa); else m.remove(); });
      if (!coletaVisivel && popupColeta.isOpen()) popupColeta.remove();
    }
    // Foco numa rota (enquadra o trajeto) ou num bairro (enquadra o bairro e abre a primeira rota dele).
    function focarColeta(id) {
      alternarColeta(true);
      fecharPopups();
      let rotaId = id;
      if (!trajetosColeta.has(id)) {
        const c = coletaAtual && coletaAtual.calendario.find((b) => b.id === id);
        rotaId = c && c.rotas.find((r) => coletaAtual.rotas.find((x) => x.id === r && x.tipo === 'domiciliar'));
      }
      const pts = rotaId && trajetosColeta.get(rotaId);
      if (!pts) return;
      const lats = pts.map((p) => p[0]);
      const lngs = pts.map((p) => p[1]);
      mapa.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: margens(130), maxZoom: ZOOM_FOCO, duration: 800 });
      mapa.once('moveend', () => { abrirColeta(rotaId); emFoco = true; });
    }

    // ======================= Farmácias das UBS (estoque de medicamentos) =======================
    // Pino na cor da pior situação do estoque; o número é de itens em falta. O popup lista o que falta, o que
    // está acabando (dias de cobertura com o consumo previsto pela IA) e o remanejamento sugerido.
    const SIT_FARMACIA = { critica: 'Medicamento em falta', atencao: 'Estoque baixo', ok: 'Estoque em dia' };
    function conteudoFarmacia(f) {
      const r = GC.medicamentos.resumo();
      const linha = (x) => `<li class="${x.situacao}"><span>${escL(x.nome)}</span><b>${x.situacao === 'ruptura' ? 'em falta' : `${x.dias.toLocaleString('pt-BR')} dias`}</b></li>`;
      const alerta = [...f.rupturas, ...f.criticos];
      const chega = r.remanejamentos.filter((x) => x.paraId === f.id).map((x) => `<div class="linha">🔄 Remanejar ${x.qtd.toLocaleString('pt-BR')} (${escL(x.apresentacao)}) de ${escL(x.medicamento)} da ${escL(x.de)}</div>`).join('');
      const sai = r.remanejamentos.filter((x) => x.deId === f.id).map((x) => `<div class="linha">🔄 Pode ceder ${x.qtd.toLocaleString('pt-BR')} de ${escL(x.medicamento)} para a ${escL(x.para)}</div>`).join('');
      return elementoDe(`<span class="sev farmacia-${f.situacao}">${SIT_FARMACIA[f.situacao]}</span>
        <h3>💊 Farmácia da ${escL(f.nome)}</h3>
        <div class="linha">📍 ${escL(nomeBairro(f.bairroId))} · ${f.itens.length} itens da lista municipal</div>
        ${alerta.length ? `<ul class="farmacia-itens">${alerta.map(linha).join('')}</ul>` : '<div class="linha">Todos os itens com mais de 7 dias de estoque.</div>'}
        ${chega}${sai}`, 'popup popup-farmacia');
    }
    const farmacias = new Map(GC.medicamentos ? GC.medicamentos.resumo().farmacias.filter((f) => f.lat !== null).map((f) => {
      const el = elementoDe(`<div class="marcador-farmacia ${f.situacao}">💊${f.rupturas.length ? `<b>${f.rupturas.length}</b>` : ''}</div>`);
      el.title = `Farmácia da ${f.nome}: ${SIT_FARMACIA[f.situacao]}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoFarmacia(f)));
      return [f.id, { marker: new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).setPopup(popup), popup }];
    }) : []);
    let farmaciasVisiveis = false;
    function alternarFarmacias(visivel) {
      farmaciasVisiveis = !!visivel;
      farmacias.forEach((x) => { if (farmaciasVisiveis) x.marker.addTo(mapa); else x.marker.remove(); });
    }
    function focarFarmacia(id) {
      const x = farmacias.get(id);
      if (!x) return;
      if (!farmaciasVisiveis) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => { if (!x.popup.isOpen()) x.marker.togglePopup(); emFoco = true; });
    }

    // ======================= Escolas =======================
    // Pino na cor da situação (falta de professor, evasão, frequência, fila); o número é de professores faltando.
    const SIT_ESCOLA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
    function conteudoEscola(x) {
      const pct = (n) => (n === null ? '—' : `${n.toLocaleString('pt-BR')}%`);
      const motivos = x.motivos.map((m) => `<li class="${m.critico ? 'critico' : ''}">${escL(m.texto)}</li>`).join('');
      return elementoDe(`<span class="sev escola-${x.situacao}">${SIT_ESCOLA[x.situacao]}</span>
        <h3>🎓 ${escL(x.nome)}</h3>
        <div class="linha">📍 ${escL(nomeBairro(x.bairroId))} · ${x.tipo === 'cmei' ? 'Educação infantil' : 'Ensino fundamental'}</div>
        <ul class="escola-numeros">
          <li><b>${x.alunos}</b><small>${x.tipo === 'cmei' ? 'crianças' : 'alunos'} · ${x.ocupacaoPct}% da capacidade</small></li>
          <li><b>${x.professores}/${x.necessarios}</b><small>professores · ${x.alunosPorProfessor.toLocaleString('pt-BR')} alunos por professor</small></li>
          <li><b>${x.frequenciaPct}%</b><small>frequência</small></li>
          <li><b>${pct(x.evasaoPct)}</b><small>evasão no ano</small></li>
          ${x.alfabetizacao3anoPct !== null ? `<li><b>${x.alfabetizacao3anoPct}%</b><small>alfabetizados no 3º ano</small></li>` : ''}
          ${x.fila ? `<li><b>${x.fila}</b><small>na fila de espera</small></li>` : ''}
        </ul>
        ${motivos ? `<ul class="escola-motivos">${motivos}</ul>` : ''}`, 'popup popup-escola');
    }
    const escolas = new Map(GC.educacao.resumo().escolas.map((x) => {
      const el = elementoDe(`<div class="marcador-equip marcador-escola ${x.situacao}">🎓${x.faltando ? `<b>-${x.faltando}</b>` : ''}</div>`);
      el.title = `${x.nome}: ${SIT_ESCOLA[x.situacao]}${x.faltando ? ` · ${x.faltando} professor(es) faltando` : ''}`;
      const popup = popupSimples('');
      popup.on('open', () => popup.setDOMContent(conteudoEscola(x)));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([x.lng, x.lat]).setPopup(popup);
      return [x.id, { marker, popup }];
    }));
    let escolasVisiveis = false;
    function alternarEscolas(visivel) {
      escolasVisiveis = !!visivel;
      escolas.forEach((x) => { if (escolasVisiveis) x.marker.addTo(mapa); else x.marker.remove(); });
    }
    function focarEscola(id) {
      const x = escolas.get(id);
      if (!x) return;
      if (!escolasVisiveis) x.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: x.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (!x.popup.isOpen()) x.marker.togglePopup();
        emFoco = true;
      });
    }

    let leitosVisiveis = false;
    function alternarLeitos(visivel) {
      leitosVisiveis = !!visivel;
      leitos.forEach((l) => { if (leitosVisiveis) l.marker.addTo(mapa); else l.marker.remove(); });
    }
    function focarLeito(id) {
      const l = leitos.get(id);
      if (!l) return;
      if (!leitosVisiveis) l.marker.addTo(mapa);
      fecharPopups();
      mapa.flyTo({ center: l.marker.getLngLat(), zoom: ZOOM_FOCO, duration: 800, offset: [0, 140] }); // pino mais baixo: o popup cabe acima
      mapa.once('moveend', () => {
        if (!l.popup.isOpen()) l.marker.togglePopup();
        emFoco = true;
      });
    }

    return {
      renderOcorrencias,
      focar,
      alternarLeitos,
      focarLeito,
      alternarCalorBO,
      alternarRisco,
      alternarObras,
      filtrarObras,
      focarObra,
      alternarEscolas,
      focarEscola,
      alternarFrota,
      focarFrota,
      alternarColeta,
      focarColeta,
      alternarFarmacias,
      focarFarmacia,
      atualizarRisco,
      focarRisco,
      fecharPopup,
      mostrarAoLado,
      encerrarFoco,
      acender,
      destacarBairro,
      mostrarCamada,
      limparCamada,
      alternarConquistas,
      focarConquista,
      mostrarResolvida,
      limparEVoltar,
      temAlgoAberto,
      // Depois que a área do mapa muda de tamanho: recalcula e volta ao enquadramento inicial.
      ajustar() {
        mapa.resize();
        if (!emEntrada()) voltarAoInicio();
      },
      // O palco mudou de tamanho (rolagem, janela): recalcula e só reenquadra se nada estiver em foco.
      // manterCamera: só recalcula (o telão comanda a câmera; reenquadrar a cidade no meio do voo o
      // desfazia e deixava a câmera parada longe do alerta).
      redimensionar({ manterCamera = false } = {}) {
        mapa.resize();
        if (!manterCamera && !temAlgoAberto() && !emEntrada()) voltarAoInicio(0.4);
      },
      visaoGeral,
      sobrevoar,
      // Modo telão: giro lento em volta do centro (linear, sem acelerar nem frear) e parar tudo.
      // O giro começa acelerando de leve (os primeiros 20%) e segue em velocidade constante: emenda no
      // fim do deslize sem tranco.
      girarDevagar: (graus, duracaoMs) => mapa.easeTo({ bearing: mapa.getBearing() + graus, duration: duracaoMs, essential: true,
        easing: (t) => (t < 0.2 ? (t * t) / 0.36 : (t - 0.1) / 0.9) }),
      pararCamera: () => { cancelarFoco(); mapa.stop(); },
      centralizarAoLado,
    };

    // A cidade inteira, de cima (desfaz a inclinação do modo telão).
    function visaoGeral(duracao = 0.8) {
      cancelarFoco(); // um sobrevoo ainda abrindo grupos não pode voar depois daqui
      const cam = mapa.cameraForBounds(limites, { padding: margens(30) });
      // padding zerado: desfaz o espaço do cartão que o telão reserva à esquerda.
      if (cam) mapa.easeTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0, padding: SEM_PADDING, duration: ms(duracao) });
    }
  };
})(window.GC = window.GC || {});
