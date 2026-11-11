const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'store.js', 'mapa-logica.js');
const ML = GC.mapaLogica;

const AGORA = 1_700_000_000_000;
GC.agora = () => AGORA;

// Objetos criados dentro do vm têm outros protótipos: compara pelo valor.
const puro = (v) => JSON.parse(JSON.stringify(v));

test('barra de calor usa as mesmas paradas do mapa e tem escala', () => {
  const css = ML.gradienteCalorCss();
  ML.paradasCalor().forEach(([pos, cor]) => assert.ok(css.includes(`${cor} ${Math.round(pos * 100)}%`), cor));
  const html = ML.htmlBarraCalor();
  assert.ok(html.includes(css) && html.includes('menos') && html.includes('mais') && html.includes('role="img"'));
});

// Ocorrência mínima: o que o mapa lê. Sem "atraso", está no prazo.
const oc = (extra = {}) => Object.assign({
  id: 'x', area: 'saude', bairroId: 'centro', severidade: 'critica', status: 'encaminhada',
  lat: -22.9, lng: -47.07, criadaEm: AGORA, prazoMin: 60, acaoPrefeito: null,
}, extra);
const estourada = (extra = {}) => oc(Object.assign({ criadaEm: AGORA - 120 * 60000 }, extra));

test('pulsa só com prazo estourado e sem ação do prefeito', () => {
  assert.equal(ML.pulsa(oc()), false);
  assert.equal(ML.pulsa(estourada()), true);
  assert.equal(ML.pulsa(estourada({ acaoPrefeito: 'priorizar' })), false);
  assert.equal(ML.pulsa(estourada({ status: 'em_campo' })), false); // em campo não estoura
});

test('assinatura muda com status, gravidade, ação e prazo; não muda com o resto', () => {
  const base = ML.assinatura(oc());
  assert.equal(ML.assinatura(oc({ titulo: 'outro', afetados: 9 })), base);
  assert.notEqual(ML.assinatura(oc({ status: 'em_campo' })), base);
  assert.notEqual(ML.assinatura(oc({ severidade: 'alta' })), base);
  assert.notEqual(ML.assinatura(oc({ acaoPrefeito: 'priorizar' })), base);
  assert.notEqual(ML.assinatura(estourada()), base);
});

test('margens: neutro → MapLibre e uniformes', () => {
  const m = { top: 10, right: 20, bottom: 30, left: 40 };
  assert.deepEqual(puro(ML.margensMapLibre(m)), m);
  assert.deepEqual(puro(ML.margensUniformes(30)), { top: 30, right: 30, bottom: 30, left: 30 });
});

test('zoom: escala web clássica (contrato da IA) → MapLibre, um nível abaixo', () => {
  assert.equal(ML.zoomMapLibre(15), 14);
  assert.equal(ML.zoomMapLibre(11.25), 10.25);
  // Zoom out: até 1,5 nível além da cidade inteira (cabe a entrada, que parte de 1,4), nunca abaixo de 0.
  assert.equal(ML.zoomMinimo(12), 10.5);
  assert.ok(ML.zoomMinimo(12) <= 12 - 1.4);
  assert.equal(ML.zoomMinimo(1), 0);
});

test('limites envolvem todos os vértices dos bairros, em [lng, lat]', () => {
  const [[oeste, sul], [leste, norte]] = ML.limites(GC.data.bairros);
  GC.data.bairros.forEach((b) => b.poligono.forEach(([lat, lng]) => {
    assert.ok(lng >= oeste && lng <= leste && lat >= sul && lat <= norte, `${b.id} fora dos limites`);
  }));
  assert.ok(oeste < leste && sul < norte);
});

test('geoBairros: anel fechado em [lng, lat], com nome e contagem', () => {
  const contagem = ML.contagemPorBairro(GC.data.ocorrencias);
  const g = ML.geoBairros(GC.data.bairros, contagem);
  assert.equal(g.type, 'FeatureCollection');
  assert.equal(g.features.length, GC.data.bairros.length);
  g.features.forEach((f, i) => {
    const b = GC.data.bairros[i];
    const anel = f.geometry.coordinates[0];
    assert.equal(f.geometry.type, 'Polygon');
    assert.equal(anel.length, b.poligono.length + 1);
    assert.deepEqual(puro(anel[0]), puro(anel[anel.length - 1]));
    assert.deepEqual(puro(anel[0]), [b.poligono[0][1], b.poligono[0][0]]);
    assert.equal(f.properties.id, b.id);
    assert.equal(f.properties.nome, b.nome);
    assert.equal(f.properties.n, contagem[b.id] || 0);
  });
  // Sem contagem, todos com zero.
  assert.ok(ML.geoBairros(GC.data.bairros).features.every((f) => f.properties.n === 0));
});

// Avalia os filtros (só os operadores usados: !, in, get, literal) para um bairro.
function casa(filtro, id) {
  const [op, ...args] = filtro;
  if (op === '!') return !casa(args[0], id);
  if (op === 'in') return args[1][1].includes(id);
  throw new Error(`operador ${op}`);
}
const contornoDe = (f, id) => ['normal', 'selecionado', 'destaque'].filter((k) => casa(f[k], id));

test('filtrosContorno: cada bairro cai em exatamente um contorno, destaque > selecionado > normal', () => {
  const ids = GC.data.bairros.map((b) => b.id);
  const casos = [[null, []], ['centro', []], [null, ['centro', 'vila_nova']], ['centro', ['centro']], ['lagoa_azul', ['centro']]];
  casos.forEach(([sel, dest]) => {
    const f = ML.filtrosContorno(sel, dest);
    ids.forEach((id) => {
      const esperado = dest.includes(id) ? 'destaque' : id === sel ? 'selecionado' : 'normal';
      assert.deepEqual(contornoDe(f, id), [esperado], `${id} com sel=${sel} dest=${dest}`);
    });
  });
});

test('filtrosContorno não altera a lista recebida', () => {
  const dest = ['centro'];
  ML.filtrosContorno('vila_nova', dest);
  assert.deepEqual(dest, ['centro']);
});

test('limitesBairro envolve só aquele bairro', () => {
  const b = GC.data.bairros.find((x) => x.id === 'centro');
  const [[o, s], [l, n]] = ML.limitesBairro(b);
  b.poligono.forEach(([lat, lng]) => assert.ok(lng >= o && lng <= l && lat >= s && lat <= n));
  const [[oc, sc], [lc, nc]] = ML.limites(GC.data.bairros);
  assert.ok(o >= oc && s >= sc && l <= lc && n <= nc);
  assert.ok(l - o < lc - oc);
});

test('contagemPorBairro soma tudo', () => {
  const n = ML.contagemPorBairro(GC.data.ocorrencias);
  assert.equal(Object.values(n).reduce((s, x) => s + x, 0), GC.data.ocorrencias.length);
  assert.deepEqual(puro(ML.contagemPorBairro([])), {});
});

test('geoRotulos: um ponto no centro de cada bairro', () => {
  const g = ML.geoRotulos(GC.data.bairros);
  g.features.forEach((f, i) => {
    const b = GC.data.bairros[i];
    assert.deepEqual(puro(f.geometry.coordinates), [b.centro[1], b.centro[0]]);
    assert.equal(f.properties.nome, b.nome);
  });
});

test('geoOcorrencias separa por gravidade e marca quem pulsa', () => {
  const lista = [oc({ id: 'a' }), estourada({ id: 'b' }), oc({ id: 'c', severidade: 'alta', lat: -22.91, lng: -47.05 })];
  const criticas = ML.geoOcorrencias(lista, 'critica');
  assert.deepEqual(puro(criticas.features.map((f) => f.properties)), [{ id: 'a', pulsa: 0 }, { id: 'b', pulsa: 1 }]);
  const altas = ML.geoOcorrencias(lista, 'alta');
  assert.equal(altas.features.length, 1);
  assert.deepEqual(puro(altas.features[0].geometry.coordinates), [-47.05, -22.91]);
  assert.equal(ML.geoOcorrencias(lista, 'media').features.length, 0);
  // Toda ocorrência cai em exatamente uma gravidade do mapa.
  const store = GC.criarStore(GC.data);
  const todas = store.ocorrencias();
  const total = ML.SEVERIDADES.reduce((s, sev) => s + ML.geoOcorrencias(todas, sev).features.length, 0);
  assert.equal(total, todas.length);
});

test('geoCalor leva o peso', () => {
  const g = ML.geoCalor([{ lat: -22.9, lng: -47.1, peso: 0.6 }]);
  assert.deepEqual(puro(g.features[0]), { type: 'Feature', properties: { peso: 0.6 }, geometry: { type: 'Point', coordinates: [-47.1, -22.9] } });
});

test('ajusteTema esconde lugares reais e POIs, recolore fundo, água e ruas', () => {
  assert.deepEqual(puro(ML.ajusteTema({ id: 'background', type: 'background' })), { paint: { 'background-color': '#eef1f5' } });
  assert.deepEqual(puro(ML.ajusteTema({ id: 'water', type: 'fill' })), { paint: { 'fill-color': '#cddcec' } });
  assert.deepEqual(puro(ML.ajusteTema({ id: 'park', type: 'fill' })), { paint: { 'fill-opacity': 0.3 } });
  ['place_city', 'label_town', 'label_city_capital', 'poi_r1', 'poi', 'highway-shield-non-us', 'road_shield_us',
    'water_name_point_label', 'water_name_line_label'].forEach((id) => {
    assert.deepEqual(puro(ML.ajusteTema({ id, type: 'symbol' })), { layout: { visibility: 'none' } }, id);
  });
  // "poi" só como palavra: não pega "point" fora de nome de água.
  assert.equal(ML.ajusteTema({ id: 'route_point_label', type: 'symbol' }), null);
  assert.deepEqual(puro(ML.ajusteTema({ id: 'highway_minor', type: 'line' })), { paint: { 'line-color': '#ffffff' } });
  // Nomes de rua só aparecem ao aproximar; o que não casa fica intacto.
  assert.deepEqual(puro(ML.ajusteTema({ id: 'highway-name-minor', type: 'symbol' })), { minzoom: ML.ZOOM_NOMES_RUA });
  assert.equal(ML.ajusteTema({ id: 'building', type: 'fill' }), null);
});

// ---- HTML compartilhado pelos dois motores ----
const GH = carregar('data.js', 'data-alertas.js', 'store.js', 'contrato.js', 'mapa-logica.js');
GH.agora = () => AGORA;
const lojaH = GH.criarStore(GH.data);
const MH = GH.mapaLogica;
const primeira = () => lojaH.ocorrencias()[0];

test('tempo em minutos, horas e dias', () => {
  assert.equal(MH.tempo(42), '42 min');
  assert.equal(MH.tempo(90), '2 h');
  assert.equal(MH.tempo(3000), '2 dias');
});

test('htmlPino: emoji da área, classes de gravidade/status, pulsar, surgir e selo em campo', () => {
  const o = primeira();
  const emoji = GH.data.areas.find((a) => a.id === o.area).emoji;
  const h = MH.htmlPino(o);
  assert.match(h, new RegExp(`class="marcador ${o.severidade} ${o.status}[^"]*"`));
  assert.ok(h.includes(emoji));
  assert.ok(!h.includes('surgir'));
  assert.ok(MH.htmlPino(o, { novo: true }).includes(' surgir'));
  // Em campo: só o contorno (classe), sem selo extra no pino.
  const emCampo = MH.htmlPino(Object.assign({}, o, { status: 'em_campo' }));
  assert.ok(emCampo.includes(' em_campo') && !emCampo.includes('status-badge'));
  const estourada = Object.assign({}, o, { status: 'encaminhada', criadaEm: AGORA - 10 * 86400000, acaoPrefeito: null });
  assert.ok(MH.htmlPino(estourada).includes(' pulsar'));
});

test('htmlGrupo mostra o total e pulsa só quando pedido', () => {
  assert.equal(MH.htmlGrupo('alta', 4, false), '<div class="grupo-pinos alta"><span>4</span></div>');
  assert.equal(MH.htmlGrupo('critica', 2, true), '<div class="grupo-pinos critica pulsar"><span>2</span></div>');
});

test('grupo misto: cor da pior gravidade, anel proporcional e nome acessível', () => {
  const contagem = { critica: 1, alta: 2, media: 1 };
  const h = MH.htmlGrupo('critica', 4, false, contagem);
  assert.match(h, /class="grupo-pinos critica"/);
  assert.match(h, /role="button"/);
  assert.match(h, /aria-label="4 ocorrências próximas: 1 crítica, 2 altas, 1 média\. Clique para aproximar\."/);
  assert.match(h, /conic-gradient\(#dc2626 0deg 90deg, #ea580c 90deg 270deg, #d97706 270deg 360deg\)/);
  assert.ok(MH.htmlGrupo('alta', 12, false, { alta: 12 }).includes(' grande'));
  assert.equal(MH.sevDoNivel(3), 'critica');
  assert.equal(MH.sevDoNivel(2), 'alta');
  assert.equal(MH.sevDoNivel(1), 'media');
});

test('geoTodas: uma fonte com todas as gravidades, nível e contadores para o agrupamento', () => {
  const store = GC.criarStore(GC.data);
  const todas = store.ocorrencias();
  const g = ML.geoTodas(todas);
  assert.equal(g.features.length, todas.length);
  g.features.forEach((f, i) => {
    const o = todas[i];
    const p = f.properties;
    assert.equal(p.id, o.id);
    assert.equal(p.nivel, { critica: 3, alta: 2, media: 1 }[o.severidade]);
    assert.equal(p.critica + p.alta + p.media, 1);
    assert.equal(p[o.severidade], 1);
  });
});

test('rotuloPino diz gravidade, título e bairro (leitor de tela)', () => {
  const o = primeira();
  const r = MH.rotuloPino(o);
  assert.ok(r.startsWith({ critica: 'Crítica', alta: 'Alta', media: 'Média' }[o.severidade]));
  assert.ok(r.includes(o.titulo));
  assert.ok(r.includes(GH.data.bairros.find((b) => b.id === o.bairroId).nome));
});

test('htmlResumo é curto (o quê e onde); htmlPopup traz situação e responsável; ambos escapam', () => {
  const o = Object.assign({}, primeira(), { titulo: '<b>x</b>', fonte: '<i>f</i>' });
  const r = MH.htmlResumo(o);
  const p = MH.htmlPopup(o);
  [r, p].forEach((h) => {
    assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'));
    assert.ok(!h.includes('<b>x</b>'));
  });
  assert.ok(p.includes(GH.escaparHtml(o.responsavel)));
  assert.ok(!r.includes(GH.escaparHtml(o.responsavel)), 'o resumo não repete o popup');
  assert.ok(r.includes(GH.escaparHtml(GH.data.bairros.find((b) => b.id === o.bairroId).nome)));
  assert.ok(p.includes('&lt;i&gt;f&lt;/i&gt;'));
  assert.ok(p.includes('data-acao='));
  assert.ok(r.includes('clique para ver'));
});

test('conquista, resolvida e legenda: texto escapado e situação do prazo', () => {
  const c = Object.assign({}, GH.data.conquistas[0], { titulo: '<x>', descricao: 'a & b' });
  const hc = MH.htmlPopupConquista(c);
  assert.ok(hc.includes('Conquista') && hc.includes('&lt;x&gt;') && hc.includes('a &amp; b'));
  assert.ok(hc.includes(c.data.split('-').reverse().join('/')));
  const base = { area: 'saude', bairroId: 'centro', titulo: 'UBS', haMin: 0, atrasoMin: 0 };
  assert.ok(MH.htmlPopupResolvida(base).includes('resolvida agora · no prazo'));
  assert.ok(MH.htmlPopupResolvida(Object.assign({}, base, { haMin: 90, atrasoMin: 120 })).includes('resolvida há 2 h · ⏰ 2 h atrasada'));
  const l = MH.htmlLegenda('<b>Calor</b>', true);
  assert.ok(l.includes('legenda-fechar') && l.includes('&lt;b&gt;Calor') && l.includes('barra-calor'));
  assert.ok(!MH.htmlLegenda('Destaque', false).includes('barra-calor'));
  assert.ok(MH.HTML_CONQUISTA.includes('conquista') && MH.HTML_RESOLVIDA.includes('resolvida'));
});

test('paradasCalor: crescentes (o MapLibre exige), do âmbar ao vinho', () => {
  // As chaves do objeto não vêm em ordem ('1' tem cara de inteiro e vem primeiro): por isso a função.
  const p = puro(MH.paradasCalor());
  assert.deepEqual(p.map((x) => x[0]), [0.2, 0.45, 0.7, 1]);
  assert.equal(p[0][1], '#fcd34d');
  assert.equal(p[p.length - 1][1], '#b91c1c');
});

test('contornoCidade: anel fechado só com a borda externa da grade de bairros', () => {
  const anel = puro(ML.contornoCidade(GC.data.bairros));
  assert.ok(anel, 'a grade fecha um anel');
  assert.deepEqual(anel[0], anel[anel.length - 1]);
  // Nenhum vértice do anel fica no meio da grade: cada um está no limite dos bairros.
  const [[oeste, sul], [leste, norte]] = puro(ML.limites(GC.data.bairros));
  const naBorda = ([lng, lat]) => [oeste, leste].includes(lng) || [sul, norte].includes(lat);
  assert.ok(anel.length >= 5);
  assert.ok(anel.filter(naBorda).length >= 4);
  // Grade que não fecha (dois bairros soltos, sem aresta comum): sem contorno.
  const solto = (dy) => ({ poligono: [[0 + dy, 0], [0 + dy, 1], [1 + dy, 1], [1 + dy, 0]] });
  assert.equal(ML.contornoCidade([solto(0), solto(5)]), null);
});

test('geoMascara: mundo com furo na forma da cidade (ou um furo por bairro, sem contorno)', () => {
  const m = puro(ML.geoMascara(GC.data.bairros)).features[0].geometry.coordinates;
  assert.equal(m.length, 2);
  assert.deepEqual(m[0][0], [-180, -85]);
  const solto = (dy) => ({ poligono: [[0 + dy, 0], [0 + dy, 1], [1 + dy, 1], [1 + dy, 0]] });
  assert.equal(puro(ML.geoMascara([solto(0), solto(5)])).features[0].geometry.coordinates.length, 3);
  assert.equal(puro(ML.geoLimite(GC.data.bairros)).features[0].geometry.type, 'LineString');
});

test('ajusteTema escuro: fundo noturno, mesmos lugares escondidos, nomes de rua só ao aproximar', () => {
  assert.equal(ML.ajusteTema({ id: 'background', type: 'background' }, 'escuro').paint['background-color'], '#0b1424');
  assert.deepEqual(puro(ML.ajusteTema({ id: 'place_city', type: 'symbol' }, 'escuro')), { layout: { visibility: 'none' } });
  const rua = puro(ML.ajusteTema({ id: 'highway-name-minor', type: 'symbol' }, 'escuro'));
  assert.equal(rua.minzoom, ML.ZOOM_NOMES_RUA);
  assert.ok(rua.paint['text-color']);
  // O escuro pinta até o que o claro deixa como veio (prédios, outras linhas).
  assert.ok(ML.ajusteTema({ id: 'building', type: 'fill' }, 'escuro'));
  assert.ok(ML.ajusteTema({ id: 'railway', type: 'line' }, 'escuro'));
  assert.ok(ML.CORES_TEMA.claro && ML.CORES_TEMA.escuro);
});
