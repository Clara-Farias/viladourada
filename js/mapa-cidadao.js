(function (GC) {
  // Mapa do Portal do Cidadão (cidadao.html): bairros, áreas de risco e pontos públicos (avisos, saúde,
  // escolas, obras). Separado do mapa do gestor (js/map.js) de propósito: aqui não existe ocorrência interna,
  // prazo, responsável nem botão de ação, então não há o que vazar. Regras de GeoJSON em js/mapa-logica.js.
  const ML = GC.mapaLogica;
  const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
  // Cidade fictícia: por padrão, fundo liso (sem ruas e nomes reais embaixo dos bairros inventados).
  // ?mapa=real liga o mapa de ruas (útil só para conferir escala).
  const BASE_REAL = (() => { try { return new URLSearchParams(window.location.search).get('mapa') === 'real'; } catch (e) { return false; } })();
  const ESTILO_RESERVA = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1f5' } }],
  };
  const ESPERA_ESTILO = 8000;
  const esc = (t) => GC.escaparHtml(t);
  const AZUL = GC.corMarca ? GC.corMarca('navy') : '#1e3a5f';

  // Áreas de risco como polígonos (o cidadão vê onde fica, não quantas famílias).
  const geoRisco = (areas) => ({ type: 'FeatureCollection', features: areas.map((a) => ({
    type: 'Feature', id: a.id, properties: { id: a.id, nome: a.nome, nivel: a.nivel, tipo: a.tipo },
    geometry: { type: 'Polygon', coordinates: [[...a.poligono, a.poligono[0]].map(([lat, lng]) => [lng, lat])] },
  })) });

  // opcoes: { aoBairro(id), areasRisco: [...] }
  GC.criarMapaCidadao = function (elemento, opcoes = {}) {
    const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };
    if (typeof maplibregl === 'undefined' || !webgl()) {
      elemento.innerHTML = '<p class="p-mapa-erro">O mapa não abriu neste navegador. As mesmas informações estão em "Início" e "Meu bairro".</p>';
      return null;
    }
    const limites = ML.limites(GC.data.bairros);
    const mapa = new maplibregl.Map({
      container: elemento, style: BASE_REAL ? ESTILO : ESTILO_RESERVA, bounds: limites, fitBoundsOptions: { padding: 24 },
      maxZoom: 17, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false,
    });
    mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: `${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} (cidade fictícia)` }), 'bottom-left');
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapa.touchZoomRotate.disableRotation();
    mapa.keyboard.disableRotation();

    let selecionado = null;
    let pronto = false;
    const marcadores = new Map(); // id → { marker, ponto }
    let camadas = new Set(['avisos', 'saude', 'escolas', 'obras']);
    let popup = null;

    const reserva = setTimeout(() => { if (!pronto) mapa.setStyle(ESTILO_RESERVA); }, ESPERA_ESTILO);
    mapa.on('style.load', () => {
      pronto = true;
      clearTimeout(reserva);
      montar();
      // Créditos do mapa recolhidos no ⓘ (abertos, cobrem uma faixa do mapa no celular).
      elemento.querySelectorAll('.maplibregl-ctrl-attrib').forEach((a) => { a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); });
    });

    function montar() {
      if (mapa.getSource('bairros')) return;
      mapa.addSource('mascara', { type: 'geojson', data: ML.geoMascara(GC.data.bairros) });
      mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara', paint: { 'fill-color': '#dfe4ec', 'fill-opacity': 0.72 } });
      mapa.addSource('bairros', { type: 'geojson', data: ML.geoBairros(GC.data.bairros), promoteId: 'id' });
      mapa.addLayer({ id: 'bairros', type: 'fill', source: 'bairros', paint: {
        'fill-color': AZUL,
        'fill-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.16, ['boolean', ['feature-state', 'hover'], false], 0.1, 0.03],
      } });
      mapa.addLayer({ id: 'bairros-contorno', type: 'line', source: 'bairros', paint: { 'line-color': AZUL, 'line-width': 1, 'line-opacity': 0.4 } });
      mapa.addLayer({ id: 'bairros-sel', type: 'line', source: 'bairros', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': AZUL, 'line-width': 3 } });
      mapa.addSource('risco', { type: 'geojson', data: geoRisco(opcoes.areasRisco || []) });
      mapa.addLayer({ id: 'risco', type: 'fill', source: 'risco', paint: {
        'fill-color': ['match', ['get', 'nivel'], 'alto', '#dc2626', 'medio', '#ea580c', '#d97706'], 'fill-opacity': 0.22 } });
      mapa.addLayer({ id: 'risco-contorno', type: 'line', source: 'risco', paint: {
        'line-color': ['match', ['get', 'nivel'], 'alto', '#dc2626', 'medio', '#ea580c', '#d97706'], 'line-width': 1.5, 'line-dasharray': [2, 1] } });
      mapa.addSource('rotulos', { type: 'geojson', data: ML.geoRotulos(GC.data.bairros) });
      mapa.addLayer({ id: 'rotulos', type: 'symbol', source: 'rotulos', layout: {
        'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 13],
        'text-max-width': 7, 'text-anchor': 'top', 'text-offset': [0, 1.6],
        'text-allow-overlap': GC.data.bairros.length <= 20, 'symbol-sort-key': ['-', 0, ['get', 'populacao']] },
      paint: { 'text-color': AZUL, 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });

      let sob = null;
      mapa.on('mousemove', 'bairros', (e) => {
        const id = e.features.length ? e.features[0].id : null;
        if (id === sob) return;
        if (sob) mapa.setFeatureState({ source: 'bairros', id: sob }, { hover: false });
        sob = id;
        if (id) mapa.setFeatureState({ source: 'bairros', id }, { hover: true });
        mapa.getCanvas().style.cursor = 'pointer';
      });
      mapa.on('mouseleave', 'bairros', () => {
        if (sob) mapa.setFeatureState({ source: 'bairros', id: sob }, { hover: false });
        sob = null;
        mapa.getCanvas().style.cursor = '';
      });
      mapa.on('click', 'risco', (e) => {
        if (!e.features.length || !camadas.has('avisos')) return;
        const a = e.features[0].properties;
        abrirPopup(e.lngLat, `<b>${esc(a.nome)}</b><p>Área de risco ${a.nivel === 'alto' ? 'alto' : a.nivel === 'medio' ? 'médio' : 'baixo'} de ${esc(a.tipo)}. Em caso de chuva forte, ligue 199.</p>`);
      });
      mapa.on('click', 'bairros', (e) => {
        if (!e.features.length) return;
        if (e.originalEvent && e.originalEvent.target.closest && e.originalEvent.target.closest('.maplibregl-marker, .maplibregl-popup')) return;
        if (camadas.has('avisos') && mapa.queryRenderedFeatures(e.point, { layers: ['risco'] }).length) return;
        if (opcoes.aoBairro) opcoes.aoBairro(e.features[0].id);
      });
      pintarSelecao();
      aplicarCamadas();
    }

    function abrirPopup(lngLat, html) {
      if (popup) popup.remove();
      popup = new maplibregl.Popup({ offset: 16, maxWidth: '280px', className: 'p-popup' }).setLngLat(lngLat).setHTML(html).addTo(mapa);
    }

    function pintarSelecao() {
      if (!mapa.getLayer('bairros-sel')) return;
      mapa.setFilter('bairros-sel', ['==', ['get', 'id'], selecionado || '']);
      GC.data.bairros.forEach((b) => mapa.setFeatureState({ source: 'bairros', id: b.id }, { sel: b.id === selecionado }));
    }

    function aplicarCamadas() {
      agrupar();
      ['risco', 'risco-contorno'].forEach((id) => { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', camadas.has('avisos') ? 'visible' : 'none'); });
    }

    // Pinos que se sobrepõem na tela viram um círculo com a quantidade; o toque aproxima o mapa.
    // Do zoom ZOOM_SOLTO para cima todos aparecem soltos (o morador já está olhando a rua).
    const RAIO_GRUPO = 34;
    const ZOOM_SOLTO = 15;
    const PESO = (p) => (p.camada === 'avisos' ? (p.nivel === 'urgente' ? 3 : 2) : 1);
    let grupos = [];
    // Marker.addTo tira e põe de novo (fechando o popup aberto): só mexe no que muda de estado.
    const naTela = new Set();
    let fixo = null; // pino aberto pelo "Ver no mapa": nunca entra num grupo
    const mostrar = (marker) => { if (!naTela.has(marker)) { marker.addTo(mapa); naTela.add(marker); } };
    const esconder = (marker) => { if (naTela.has(marker)) { marker.remove(); naTela.delete(marker); } };
    function agrupar() {
      grupos.forEach((g) => g.remove());
      grupos = [];
      const visiveis = [...marcadores.values()].filter(({ ponto }) => camadas.has(ponto.camada));
      marcadores.forEach(({ marker, ponto }) => { if (!camadas.has(ponto.camada)) esconder(marker); });
      if (mapa.getZoom() >= ZOOM_SOLTO) { visiveis.forEach(({ marker }) => mostrar(marker)); return; }
      if (fixo && visiveis.some((v) => v.marker === fixo)) mostrar(fixo);
      const itens = visiveis.filter((v) => v.marker !== fixo).map((v) => ({ ...v, px: mapa.project(v.marker.getLngLat()) }))
        .sort((a, b) => PESO(b.ponto) - PESO(a.ponto));
      const usado = new Set();
      itens.forEach((a, k) => {
        if (usado.has(k)) return;
        usado.add(k);
        const membros = [a];
        itens.forEach((b, j) => {
          if (usado.has(j)) return;
          if (Math.hypot(a.px.x - b.px.x, a.px.y - b.px.y) < RAIO_GRUPO) { usado.add(j); membros.push(b); }
        });
        if (membros.length === 1) { mostrar(a.marker); return; }
        membros.forEach((m) => esconder(m.marker));
        const urg = membros.some((m) => m.ponto.nivel === 'urgente');
        const aten = membros.some((m) => m.ponto.nivel === 'atencao');
        const lng = membros.reduce((s, m) => s + m.marker.getLngLat().lng, 0) / membros.length;
        const lat = membros.reduce((s, m) => s + m.marker.getLngLat().lat, 0) / membros.length;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `p-pino p-grupo${urg ? ' urgente' : aten ? ' atencao' : ''}`;
        el.textContent = String(membros.length);
        el.setAttribute('aria-label', `${membros.length} pontos juntos${urg ? ', com aviso urgente' : ''}. Aproximar o mapa`);
        el.title = membros.map((m) => m.ponto.titulo).join('\n');
        el.onclick = (e) => {
          e.stopPropagation();
          mapa.easeTo({ center: [lng, lat], zoom: Math.min(mapa.getZoom() + 2, ZOOM_SOLTO + 0.2), duration: 500 });
        };
        const g = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(mapa);
        g.getElement().style.zIndex = urg ? '4' : '3';
        grupos.push(g);
      });
    }
    mapa.on('zoomend', () => { if (pronto) agrupar(); });

    function htmlPonto(p) {
      return `${p.nivel ? `<span class="p-nivel ${p.nivel}">${esc(GC.NIVEIS_AVISO[p.nivel])}</span>` : ''}<b>${esc(p.titulo)}</b><p>${esc(p.texto)}</p>`;
    }

    return {
      // Pontos públicos (GC.pontosMapaCidadao): recria os pinos.
      pontos(lista) {
        marcadores.forEach(({ marker }) => esconder(marker));
        marcadores.clear();
        fixo = null;
        lista.forEach((p) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = `p-pino ${p.camada}${p.nivel ? ` ${p.nivel}` : ''}`;
          el.innerHTML = `<i class="ti ti-${p.icone}" aria-hidden="true"></i>`;
          el.setAttribute('aria-label', `${p.titulo}${p.nivel ? ` (${GC.NIVEIS_AVISO[p.nivel]})` : ''}`);
          el.title = p.titulo;
          const pop = new maplibregl.Popup({ offset: 18, maxWidth: '280px', className: 'p-popup' }).setHTML(htmlPonto(p));
          const marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).setPopup(pop);
          // Avisos por cima de tudo (urgente acima de atenção): é o que o morador precisa ver primeiro.
          marker.getElement().style.zIndex = p.camada === 'avisos' ? (p.nivel === 'urgente' ? '3' : '2') : '1';
          marcadores.set(p.id, { marker, ponto: p });
        });
        if (mapa.loaded() || pronto) aplicarCamadas();
      },
      camadas(conjunto) {
        camadas = new Set(conjunto);
        aplicarCamadas();
      },
      areasRisco(areas) {
        opcoes.areasRisco = areas;
        const f = mapa.getSource('risco');
        if (f) f.setData(geoRisco(areas));
      },
      selecionarBairro(id, { voar = true } = {}) {
        selecionado = id;
        pintarSelecao();
        const b = GC.data.bairros.find((x) => x.id === id);
        if (b && voar) mapa.fitBounds(ML.limitesBairro(b), { padding: 60, maxZoom: 15, duration: 600 });
      },
      // "Ver no mapa": abre o pino (ou a primeira área de risco) daquela camada.
      focar(camada, id) {
        if (!camadas.has(camada)) { camadas.add(camada); aplicarCamadas(); }
        const alvo = [...marcadores.values()].find(({ ponto }) => ponto.camada === camada && (!id || ponto.id === `${camada}-${id}` || ponto.id.startsWith(id)));
        if (alvo) {
          // Perto o bastante para o pino aparecer solto (fora de um grupo), e já no mapa para o popup abrir.
          // O easeTo encerra a animação anterior e dispara zoomend na hora (reagrupando): por isso o pino
          // focado fica fora dos grupos e só é mostrado depois.
          fixo = alvo.marker;
          mapa.easeTo({ center: alvo.marker.getLngLat(), zoom: Math.max(mapa.getZoom(), ZOOM_SOLTO), duration: 600 });
          mostrar(alvo.marker);
          if (!alvo.marker.getPopup().isOpen()) alvo.marker.togglePopup();
          return true;
        }
        return false;
      },
      focarPonto(lat, lng) { mapa.easeTo({ center: [lng, lat], zoom: Math.max(mapa.getZoom(), ZOOM_SOLTO), duration: 600 }); },
      visaoGeral() { mapa.fitBounds(limites, { padding: 24, duration: 600 }); },
      redimensionar() { mapa.resize(); },
    };
  };
})(window.GC = window.GC || {});
