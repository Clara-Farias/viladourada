(function (GC) {
  // Regras do mapa que não dependem da biblioteca (MapLibre, em js/map.js): GeoJSON, HTML de pinos,
  // popups e legenda, margens, escala de zoom e tema do fundo. Tudo puro e testável em Node.
  const ML = {};
  ML.SEVERIDADES = ['critica', 'alta', 'media'];

  // ---- Ocorrências ----

  // O que, ao mudar, exige redesenhar o pino (ícone, grupo, pulsar).
  ML.assinatura = (o) => `${o.status}|${o.severidade}|${o.acaoPrefeito || ''}|${GC.estourada(o)}`;
  // Pino pulsa: prazo estourado sem ação do prefeito.
  ML.pulsa = (o) => GC.estourada(o) && !o.acaoPrefeito;

  // ---- HTML dos pinos e popups (o mesmo nos dois motores: paridade visual garantida) ----

  const SEV_NOME = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  // Sem selo no pino (poluía o mapa): "em campo" é o contorno azul; o detalhe fica no popup.
  const BADGE = {};
  ML.ZOOM_NOMES_RUA = 14; // escala MapLibre: só aparecem com o mapa aproximado
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // Idade em texto curto (recebe minutos já arredondados).
  ML.tempo = function (min) {
    if (min < 60) return `${min} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  };
  const idade = (o) => ML.tempo(Math.round(GC.idadeMin(o)));

  // Pino: emoji da área na cor da gravidade; contorno azul em campo; pulsa com prazo estourado.
  ML.htmlPino = function (o, { novo } = {}) {
    const classes = ['marcador', o.severidade, o.status];
    if (ML.pulsa(o)) classes.push('pulsar');
    if (novo) classes.push('surgir');
    const badge = BADGE[o.status] ? `<span class="status-badge">${BADGE[o.status]}</span>` : '';
    return `<div class="${classes.join(' ')}">${area(o.area).emoji}${badge}</div>`;
  };

  // Grupo de pinos próximos (de qualquer gravidade), na cor da pior; pulsa se esconder um prazo estourado.
  // Com a contagem por gravidade, ganha um anel com a proporção de cada uma e um nome acessível.
  ML.NIVEL = { critica: 3, alta: 2, media: 1 };
  ML.sevDoNivel = (n) => (n >= 3 ? 'critica' : n >= 2 ? 'alta' : 'media');
  const COR_SEV = { critica: '#dc2626', alta: '#ea580c', media: '#d97706' };
  ML.anelGrupo = function (contagem) {
    const total = ML.SEVERIDADES.reduce((s, k) => s + (contagem[k] || 0), 0) || 1;
    let ate = 0;
    const paradas = ML.SEVERIDADES.filter((k) => contagem[k]).map((k) => {
      const de = ate;
      ate += (contagem[k] / total) * 360;
      return `${COR_SEV[k]} ${Math.round(de)}deg ${Math.round(ate)}deg`;
    });
    return `conic-gradient(${paradas.join(', ')})`;
  };
  ML.rotuloGrupo = function (n, contagem) {
    const partes = ML.SEVERIDADES.filter((k) => contagem && contagem[k])
      .map((k) => `${contagem[k]} ${SEV_NOME[k].toLowerCase()}${contagem[k] > 1 ? 's' : ''}`);
    return `${n} ocorrências próximas${partes.length ? `: ${partes.join(', ')}` : ''}. Clique para aproximar.`;
  };
  ML.htmlGrupo = function (severidade, n, pulsar, contagem) {
    if (!contagem) return `<div class="grupo-pinos ${severidade}${pulsar ? ' pulsar' : ''}"><span>${n}</span></div>`;
    const rotulo = ML.rotuloGrupo(n, contagem);
    return `<div class="grupo-pinos ${severidade}${pulsar ? ' pulsar' : ''}${n >= 10 ? ' grande' : ''}" role="button" tabindex="0" aria-label="${rotulo}" title="${rotulo}" style="background:${ML.anelGrupo(contagem)}"><span class="${severidade}">${n}</span></div>`;
  };

  // Nome acessível do pino (leitor de tela): gravidade, título, bairro e situação.
  ML.rotuloPino = (o) => `${SEV_NOME[o.severidade]}: ${o.titulo} · ${bairro(o.bairroId).nome} · ${GC.situacao(o)}`;

  // Resumo ao passar o mouse (e ao realçar pelo cartão): o ponto se explica sem clicar.
  // Três níveis sem repetição: resumo (o quê e onde) → popup (situação, ações rápidas) → gaveta (o porquê).
  ML.htmlResumo = (o) => `<span class="resumo-sev ${o.severidade}">${SEV_NOME[o.severidade]}</span><b>${area(o.area).emoji} ${esc(o.titulo)}</b>${esc(bairro(o.bairroId).nome)} · há ${idade(o)}<br><u>clique para ver</u>`;

  // Miolo do popup (o motor embrulha em div.popup e liga os botões data-acao).
  ML.htmlPopup = (o) => `
        <span class="sev ${o.severidade}">${SEV_NOME[o.severidade]}</span>
        <h3>${area(o.area).emoji} ${esc(o.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(o.bairroId).nome)} · há ${idade(o)}</div>
        ${o.afetados ? `<div class="linha">👥 ~${o.afetados.toLocaleString('pt-BR')} pessoas afetadas</div>` : ''}
        <div class="fonte">Fonte: ${esc(o.fonte)}</div>
        <div class="linha situacao${ML.pulsa(o) ? ' estourada' : ''}">${esc(GC.situacao(o))}</div>
        <div class="linha responsavel">👤 ${esc(o.responsavel)}</div>
        <div class="popup-acoes">${GC.botoesAcao(o)}</div>`;

  // Pinos especiais: conquista (⭐, camada ligável) e resolvida (✅, temporária).
  ML.HTML_CONQUISTA = '<div class="marcador conquista surgir">⭐</div>';
  ML.HTML_RESOLVIDA = '<div class="marcador resolvida surgir">✅</div>';

  ML.htmlPopupConquista = (c) => `<div class="popup"><span class="sev" style="background:#15803d">Conquista</span>
        <h3>${area(c.area).emoji} ${esc(c.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(c.bairroId).nome)} · ${esc(c.data.split('-').reverse().join('/'))}</div>
        <div class="linha">${esc(c.descricao)}</div></div>`;

  ML.htmlPopupResolvida = function (r) {
    const situacao = r.atrasoMin ? `⏰ ${ML.tempo(r.atrasoMin)} atrasada` : 'no prazo';
    return `<div class="popup"><span class="sev" style="background:#15803d">Resolvida</span>
        <h3>${area(r.area).emoji} ${esc(r.titulo)}</h3>
        <div class="linha">📍 ${esc(bairro(r.bairroId).nome)} · resolvida ${r.haMin < 1 ? 'agora' : `há ${ML.tempo(r.haMin)}`} · ${situacao}</div></div>`;
  };

  // Cores do mapa de calor (posição 0–1 → cor), as mesmas nos dois motores e na barra da legenda.
  // Uma família só (âmbar → vinho): lê-se como "mais quente = pior" sem o arco-íris de radar de TV.
  ML.GRADIENTE_CALOR = { 0.2: '#fcd34d', 0.45: '#f59e0b', 0.7: '#ea580c', 1: '#b91c1c' };
  ML.CALOR_TRANSPARENTE = 'rgba(252, 211, 77, 0)';
  // Paradas [posição, cor] em ordem crescente. Não confiar na ordem das chaves: o JS põe '1' (cara de
  // inteiro) antes de '0.2', e o MapLibre exige paradas crescentes.
  ML.paradasCalor = () => Object.entries(ML.GRADIENTE_CALOR).map(([pos, cor]) => [Number(pos), cor]).sort((a, b) => a[0] - b[0]);
  // A barra das legendas sai das mesmas paradas do mapa: não há um segundo gradiente no CSS para divergir.
  ML.gradienteCalorCss = () => `linear-gradient(90deg, ${ML.paradasCalor().map(([pos, cor]) => `${cor} ${Math.round(pos * 100)}%`).join(', ')})`;
  ML.htmlBarraCalor = () => `<div class="barra-calor" style="background: ${ML.gradienteCalorCss()}" role="img" aria-label="Escala do calor: amarelo é menos, vinho é mais"></div><div class="barra-calor-escala" aria-hidden="true"><span>menos</span><span>mais</span></div>`;

  // Cores das camadas que a legenda fixa também explica (o motor pinta com as mesmas).
  // Cores da marca (js/marca.js); sem ela (testes antigos), o azul institucional.
  const corMarca = (papel, padrao) => (GC.corMarca ? GC.corMarca(papel) : padrao);
  const tom = (papel, padrao, branco) => (GC.cor ? GC.cor.misturar(corMarca(papel, padrao), '#ffffff', branco) : padrao);
  ML.COR_DESTAQUE = corMarca('ia', '#6d28d9'); // bairros destacados pela IA
  ML.COR_RISCO = { alto: '#dc2626', medio: '#d97706', baixo: '#64748b' };

  // Legenda da camada da IA (o ✕ tira a camada; o motor liga o clique).
  ML.htmlLegenda = (texto, calor) => `<button type="button" class="legenda-fechar" title="Tirar esta camada do mapa" aria-label="Tirar esta camada do mapa">✕</button><strong>✨ ${esc(texto)}</strong>${calor ? ML.htmlBarraCalor() : ''}`;

  // ---- Margens: formato neutro { top, right, bottom, left } em px ----

  ML.margensUniformes = (n) => ({ top: n, right: n, bottom: n, left: n });
  ML.margensMapLibre = (m) => ({ top: m.top, right: m.right, bottom: m.bottom, left: m.left });

  // ---- Zoom ----
  // O contrato da IA (mapa.foco.zoom) fala na escala web clássica, de ladrilhos de 256 px (a do OSM e do
  // Google, e a que o roteiro usa). O MapLibre usa ladrilhos de 512 px: o mesmo enquadramento é um nível
  // a menos nele.
  ML.zoomMapLibre = (zoomWeb) => zoomWeb - 1;

  // Limite de zoom out: um pouco além do enquadramento da cidade inteira (a entrada animada parte de 1,4
  // nível acima dele, e precisa caber). Mais longe que isso a cidade vira um ponto no meio do nada.
  ML.FOLGA_ZOOM_OUT = 1.5;
  ML.zoomMinimo = (zoomCidade) => Math.max(0, zoomCidade - ML.FOLGA_ZOOM_OUT);

  // ---- GeoJSON (coordenadas [lng, lat]; os dados guardam [lat, lng]) ----

  const ponto = (lat, lng, properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lng, lat] } });
  const colecao = (features) => ({ type: 'FeatureCollection', features });

  // Retângulo que envolve todos os bairros: [[oeste, sul], [leste, norte]].
  ML.limites = function (bairros) {
    const pts = bairros.flatMap((b) => b.poligono);
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  };

  // Polígonos dos bairros (anel fechado) com a contagem de ocorrências, para pintar e extrudar.
  ML.geoBairros = (bairros, contagem = {}) => colecao(bairros.map((b) => ({
    type: 'Feature',
    properties: { id: b.id, nome: b.nome, n: contagem[b.id] || 0 },
    geometry: { type: 'Polygon', coordinates: [[...b.poligono, b.poligono[0]].map(([lat, lng]) => [lng, lat])] },
  })));

  ML.geoRotulos = (bairros) => colecao(bairros.map((b) => ponto(b.centro[0], b.centro[1], { id: b.id, nome: b.nome, populacao: b.populacao || 0 })));

  // Ocorrências de uma gravidade (os grupos de pinos não misturam gravidades).
  ML.geoOcorrencias = (lista, severidade) => colecao(lista
    .filter((o) => o.severidade === severidade)
    .map((o) => ponto(o.lat, o.lng, { id: o.id, pulsa: ML.pulsa(o) ? 1 : 0 })));
  // Todas as ocorrências numa fonte só: pinos próximos se agrupam mesmo com gravidades diferentes.
  // Cada ponto leva o nível (3 crítica … 1 média) e um contador por gravidade para o anel do grupo.
  ML.geoTodas = (lista) => colecao(lista.map((o) => ponto(o.lat, o.lng, {
    id: o.id, pulsa: ML.pulsa(o) ? 1 : 0, nivel: ML.NIVEL[o.severidade] || 1,
    critica: o.severidade === 'critica' ? 1 : 0, alta: o.severidade === 'alta' ? 1 : 0, media: o.severidade === 'media' ? 1 : 0,
  })));

  ML.geoCalor = (pontos) => colecao(pontos.map((p) => ponto(p.lat, p.lng, { peso: p.peso })));

  // Retângulo de um bairro só (para enquadrá-lo).
  ML.limitesBairro = (bairro) => ML.limites([bairro]);

  // Contorno de cada bairro: destaque da IA (roxo) > selecionado (contínuo, grosso) > normal (tracejado).
  // Devolve um filtro por camada de linha: o tracejado não pode variar por feição, então são três camadas,
  // e filtros não enxergam feature-state, então vão pelo id. Cada bairro cai em exatamente uma.
  // selecionado: id, lista de ids (filtro com vários bairros) ou nada.
  ML.filtrosContorno = function (selecionado, destacados = []) {
    const em = (ids) => ['in', ['get', 'id'], ['literal', ids]];
    const selecionados = Array.isArray(selecionado) ? selecionado : selecionado ? [selecionado] : [];
    const sel = selecionados.filter((id) => !destacados.includes(id));
    return { normal: ['!', em([...destacados, ...sel])], selecionado: em(sel), destaque: em([...destacados]) };
  };

  ML.contagemPorBairro =(lista) => lista.reduce((n, o) => { n[o.bairroId] = (n[o.bairroId] || 0) + 1; return n; }, {});

  // ---- Limite da cidade e máscara do entorno ----
  // Os bairros são uma grade com vértices compartilhados: aresta que aparece uma vez só é borda da cidade.
  // Encadeia essas arestas num anel [lng, lat] fechado. Se a grade não fechar um anel (dados à mão),
  // devolve null e quem chama usa os bairros um a um.
  ML.contornoCidade = function (bairros) {
    const chave = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    const arestas = new Map(); // chave da aresta (sem direção) → [a, b]
    bairros.forEach((b) => b.poligono.forEach((p, i) => {
      const q = b.poligono[(i + 1) % b.poligono.length];
      const k = [chave(p), chave(q)].sort().join('|');
      if (arestas.has(k)) arestas.set(k, null); else arestas.set(k, [p, q]);
    }));
    const vizinhos = new Map(); // vértice → vértices ligados por aresta de borda
    const pontoDe = new Map();
    [...arestas.values()].filter(Boolean).forEach(([p, q]) => {
      [[p, q], [q, p]].forEach(([a, b]) => {
        pontoDe.set(chave(a), a);
        if (!vizinhos.has(chave(a))) vizinhos.set(chave(a), []);
        vizinhos.get(chave(a)).push(chave(b));
      });
    });
    if (!vizinhos.size || [...vizinhos.values()].some((v) => v.length !== 2)) return null;
    const inicio = vizinhos.keys().next().value;
    const anel = [inicio];
    let anterior = null;
    let atual = inicio;
    for (;;) {
      const prox = vizinhos.get(atual).find((v) => v !== anterior);
      if (prox === inicio) break;
      if (anel.includes(prox)) return null;
      anel.push(prox);
      anterior = atual;
      atual = prox;
    }
    if (anel.length !== vizinhos.size) return null; // mais de uma "ilha": não é um contorno só
    const pts = anel.map((k) => { const [lat, lng] = pontoDe.get(k); return [lng, lat]; });
    return [...pts, pts[0]];
  };

  const anelBairro = (b) => [...b.poligono, b.poligono[0]].map(([lat, lng]) => [lng, lat]);
  // Véu sobre o mundo com um furo na forma da cidade: o entorno apaga e a cidade "acende".
  ML.geoMascara = function (bairros) {
    const mundo = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const contorno = ML.contornoCidade(bairros);
    const furos = contorno ? [contorno] : bairros.map(anelBairro);
    return colecao([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [mundo, ...furos] } }]);
  };
  // Linha do limite da cidade.
  ML.geoLimite = function (bairros) {
    const contorno = ML.contornoCidade(bairros);
    const aneis = contorno ? [contorno] : bairros.map(anelBairro);
    return colecao(aneis.map((a) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: a } })));
  };

  // ---- Camadas extras: total e quantas pedem atenção (para o painel Camadas) ----
  ML.resumoCamadas = function () {
    const out = {};
    const conta = (lista, f) => lista.filter(f).length;
    if (GC.educacao) {
      const l = GC.educacao.resumo().escolas;
      out.escolas = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['crítica', 'críticas'] };
    }
    if (GC.obras) {
      const l = GC.obras.resumo().obras;
      out.obras = { total: l.length, alerta: conta(l, (x) => x.situacao === 'atrasada' || x.situacao === 'paralisada'), rotulo: ['atrasada', 'atrasadas'] };
    }
    if (GC.risco) {
      const l = GC.risco.resumo().areas;
      out.risco = { total: l.length, alerta: conta(l, (x) => x.nivel === 'alto'), rotulo: ['em risco alto', 'em risco alto'] };
    }
    if (GC.seguranca) out.calorBo = { total: GC.seguranca.resumo().total30d, alerta: 0 };
    if (GC.leitos) {
      const l = GC.leitos.resumo().unidades;
      out.leitos = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['lotada', 'lotadas'] };
    }
    if (GC.frota) {
      const l = GC.frota.resumo().linhas;
      out.frota = { total: l.length, alerta: conta(l, (x) => x.situacao === 'critica'), rotulo: ['linha crítica', 'linhas críticas'] };
    }
    if (GC.medicamentos) {
      const l = GC.medicamentos.resumo().farmacias;
      out.farmacias = { total: l.length, alerta: l.filter((x) => x.rupturas.length).length, rotulo: ['UBS com falta', 'UBS com falta'] };
    }
    if (GC.coleta) {
      const l = GC.coleta.resumo().rotas;
      out.coleta = { total: l.length, alerta: conta(l, (x) => x.status === 'atrasada'), rotulo: ['atrasada', 'atrasadas'] };
    }
    if (GC.data && GC.data.conquistas) out.conquistas = { total: GC.data.conquistas.length, alerta: 0 };
    return out;
  };

  // ---- Tema "Vila Dourada" do fundo vetorial ----
  // Cidade fictícia: some com nomes de lugares reais (cidades, rios, lagos), POIs e placas; tons do app.
  // Nomes de rua ficam: ajudam a localizar e não denunciam a cidade. "poi" casa só como palavra
  // (senão pegaria "point" em water_name_point_label).
  // Recebe uma camada do estilo e devolve o ajuste ({ layout } e/ou { paint }) ou null.
  const ESCONDER = /(^|[-_])poi([-_]|$)|place|shield|water_name|label_(city|town|village|state|country|other)/;
  const RUA = /highway|road|street|transportation/;

  // Cores das camadas da própria Vila Dourada (bairros, nomes, véu do entorno, limite) em cada tema.
  ML.TEMAS = ['claro', 'escuro'];
  ML.CORES_TEMA = {
    claro: { bairro: corMarca('navy', '#1e3a5f'), selecionado: corMarca('navy', '#1e3a5f'), rotulo: corMarca('navy', '#1e3a5f'), halo: '#ffffff',
      mascara: tom('navy', '#dfe4ec', 0.1), mascaraOpacidade: 0.72, limite: corMarca('navy', '#1e3a5f') },
    escuro: { bairro: tom('navy', '#7ea3d1', 0.45), selecionado: '#e2e8f0', rotulo: '#e2e8f0', halo: '#0b1424',
      mascara: '#03060c', mascaraOpacidade: 0.62, limite: '#cbd5e1' },
  };

  // Tema "sala de situação": fundo azul-noite; o que não tem regra própria escurece pelo tipo.
  const ESCURO = { fundo: '#0b1424', agua: '#10223a', verde: '#12233a', rua: '#1d2d45', predio: '#13203a', outro: '#0f1a2d', texto: '#8494ad' };
  function ajusteEscuro({ id, type }) {
    if (type === 'background') return { paint: { 'background-color': ESCURO.fundo } };
    if (type === 'symbol' && ESCONDER.test(id)) return { layout: { visibility: 'none' } };
    if (type === 'symbol') {
      const cor = { 'text-color': ESCURO.texto, 'text-halo-color': ESCURO.fundo };
      return RUA.test(id) ? { paint: cor, minzoom: ML.ZOOM_NOMES_RUA } : { paint: cor };
    }
    if (type === 'fill' && /water/.test(id)) return { paint: { 'fill-color': ESCURO.agua } };
    if (type === 'fill' && /park|landcover|landuse|wood|grass/.test(id)) return { paint: { 'fill-color': ESCURO.verde, 'fill-opacity': 0.5 } };
    if (type === 'fill' && /building/.test(id)) return { paint: { 'fill-color': ESCURO.predio, 'fill-outline-color': ESCURO.rua } };
    if (type === 'fill') return { paint: { 'fill-color': ESCURO.outro } };
    if (type === 'line' && /water/.test(id)) return { paint: { 'line-color': ESCURO.agua } };
    if (type === 'line' && RUA.test(id)) return { paint: { 'line-color': ESCURO.rua } };
    if (type === 'line') return { paint: { 'line-color': ESCURO.outro } };
    return null;
  }

  ML.ajusteTema = function (camada, tema = 'claro') {
    if (tema === 'escuro') return ajusteEscuro(camada);
    const { id, type } = camada;
    if (type === 'background') return { paint: { 'background-color': '#eef1f5' } };
    if (type === 'fill' && /water/.test(id)) return { paint: { 'fill-color': '#cddcec' } };
    if (type === 'fill' && /park|landcover|landuse|wood|grass/.test(id)) return { paint: { 'fill-opacity': 0.3 } };
    if (type === 'symbol' && ESCONDER.test(id)) return { layout: { visibility: 'none' } };
    if (type === 'line' && /highway|road|street|transportation/.test(id)) return { paint: { 'line-color': '#ffffff' } };
    // Nomes de rua só ao aproximar: na cidade inteira eram ruído atrás dos pinos.
    if (type === 'symbol' && /highway|road|street|transportation/.test(id)) return { minzoom: ML.ZOOM_NOMES_RUA };
    return null;
  };

  GC.mapaLogica = ML;
})(window.GC = window.GC || {});
