(function (GC) {
  // Ícones (Tabler Icons) no lugar de emojis.
  // Os textos do painel (dados, store, IA, tour) continuam usando o emoji como "marcador" de significado;
  // na hora de exibir, cada emoji vira o ícone correspondente deste dicionário. Assim a troca vale
  // também para mensagens da IA. Emoji fora do dicionário é removido da tela.
  // Em atributos (title, aria-label, placeholder) e no título da aba, o emoji só é removido.
  const ICONES = {
    // navegação e telas
    '🖼': 'photo', '🎞': 'presentation', '🔊': 'volume', 'ℹ': 'info-circle', '🧪': 'flask', '🧩': 'puzzle', '🗒': 'notes', '⚙': 'settings', '🔑': 'key', '🚪': 'logout',
    '🔀': 'arrows-shuffle', '🎨': 'palette', '🗓': 'calendar-week', '⬆': 'upload',
    '🗺': 'map-2', '📄': 'file-text', '🔔': 'bell', '🔕': 'bell-off', '🗄': 'database', '📊': 'chart-bar',
    '📍': 'map-pin', '📋': 'clipboard-list', '📚': 'books', '📘': 'book-2', '⬇': 'download', '🗂': 'stack-2',
    // secretarias (secretaria e tipo de ocorrência)
    '🛠': 'tools', '🔧': 'tool', '🛰': 'satellite', '🌧': 'cloud-rain', '🩺': 'stethoscope', '🏥': 'building-hospital', '🛏': 'bed', '🚑': 'ambulance', '🔥': ['flame', 'ic-critica'], '⛰': 'mountain', '🏗': 'crane', '🎭': 'masks-theater', '⚽': 'ball-football', '⏸': ['player-pause', 'ic-critica'], '⏱': 'stopwatch', '♻': ['recycle', 'ic-ok'], '📅': 'calendar', '💊': 'pill', '🔄': 'arrows-exchange', '💰': ['coin', 'ic-alerta'],
    '🎓': 'school', '🚓': 'shield-check', '🛡': 'shield', '🚌': 'bus', '🚦': 'traffic-lights',
    '🚛': 'truck', '🧹': 'recycle', '🏛': 'building-bank',
    // situação e ações
    '📡': ['send', 'ic-andamento'], '🚧': ['barrier-block', 'ic-andamento'], '✅': ['circle-check', 'ic-ok'],
    '⏰': ['alarm', 'ic-alerta'], '⏳': ['hourglass', 'ic-suave'], '🤝': ['users-group', 'ic-conjunta'],
    '🔁': ['repeat', 'ic-critica'], '📣': 'speakerphone', '⚡': 'arrow-big-up-lines', '🚨': ['urgent', 'ic-critica'],
    '⚠': ['alert-triangle', 'ic-alerta'], '🎉': ['confetti', 'ic-ok'], '👁': 'eye', '👤': 'user', '👥': 'users',
    '📈': ['trending-up', 'ic-ok'], '📉': ['trending-down', 'ic-critica'], '☀': ['sun', 'ic-ouro'], '📏': 'ruler-measure', '❓': 'help-circle',
    // IA, widgets e visualizações
    // ✨ = IA em geral (previsões, widgets gerados); 🛞 = o Copiloto em si (ícone próprio: css/icone-copiloto.css).
    '✨': ['sparkles', 'ic-ia'], '🛞': ['@copiloto', 'ic-ia'], '⭐': ['star', 'ic-ouro'], '🔢': 'numbers', '🏁': 'flag', '🙂': 'mood-smile',
    '🏙': 'building-community', '🔴': ['flame', 'ic-critica'], '💾': 'device-floppy',
    // widgets de gestão (js/widgets-extra.js)
    '🎯': 'target-arrow', '🕒': 'clock-hour-4', '📑': 'file-certificate', '🧾': 'receipt', '🏦': 'building-bank', '💬': 'messages',
    '💡': 'bulb', '🌳': 'trees', '🏠': 'home-heart', '⚖': 'scale', '📝': 'note',
    // controles
    '⚙': 'adjustments-horizontal', '▦': 'layout-dashboard', '◧': 'list-details', '☰': 'menu-2', '➤': 'send-2',
    '▶': 'player-play', '✕': 'x', '✓': 'check', '↻': 'refresh', '✎': 'pencil', '🗑': 'trash', '⋯': 'dots',
    '↑': 'arrow-up', '↓': 'arrow-down', '▾': 'chevron-down', '▴': 'chevron-up', '👋': 'hand-stop', '👉': 'hand-finger-right',
  };
  GC.ICONES = ICONES;

  // Emojis (com ou sem o seletor de variação) + os símbolos de controle do dicionário.
  const RE = /(?:\p{Extended_Pictographic}|[▦◧☰➤✕✓↻✎⋯↑↓▾▴])️?/gu;
  const MANTER = new Set(['▲', '▼', '●', '→', '←']); // setas de tendência e de texto ficam como texto
  const chave = (ch) => ch.replace('️', '');
  const entrada = (ch) => ICONES[chave(ch)];

  // Nome com "@" é ícone próprio do painel (classe ic-<nome>), não da fonte Tabler.
  const classeIcone = (nome, classe) => `${nome.startsWith('@') ? `ic-${nome.slice(1)}` : `ti ti-${nome}`}${classe ? ` ${classe}` : ''}`;
  GC.icone = function (nome, classe) {
    return `<i class="${classeIcone(nome, classe)}" aria-hidden="true"></i>`;
  };

  // Texto puro sem emoji (atributos, título da aba, PDF).
  GC.semEmoji = (t) => String(t ?? '').replace(RE, (m) => (MANTER.has(m) ? m : '')).replace(/\s{2,}/g, ' ').trim();

  const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE', 'CANVAS']);
  const SO_TEXTO = new Set(['OPTION', 'TITLE']);

  function trocarTexto(no) {
    const t = no.nodeValue;
    RE.lastIndex = 0;
    if (!t || !RE.test(t)) return;
    const pai = no.parentNode;
    if (!pai || PULAR.has(pai.nodeName) || (pai.closest && pai.closest('pre, code'))) return;
    if (SO_TEXTO.has(pai.nodeName)) { no.nodeValue = GC.semEmoji(t); return; }
    const frag = document.createDocumentFragment();
    let ultimo = 0;
    RE.lastIndex = 0;
    let m;
    let removeuAntes = false;
    while ((m = RE.exec(t))) {
      if (MANTER.has(m[0])) continue;
      let antes = t.slice(ultimo, m.index);
      if (removeuAntes) antes = antes.replace(/^\s+/, '');
      if (antes) frag.appendChild(document.createTextNode(antes));
      const e = entrada(m[0]);
      removeuAntes = !e;
      if (e) {
        const [nome, classe] = Array.isArray(e) ? e : [e];
        const i = document.createElement('i');
        i.className = classeIcone(nome, classe);
        i.setAttribute('aria-hidden', 'true');
        frag.appendChild(i);
      }
      ultimo = m.index + m[0].length;
    }
    let resto = t.slice(ultimo);
    if (removeuAntes) resto = resto.replace(/^\s+/, '');
    if (resto) frag.appendChild(document.createTextNode(resto));
    pai.replaceChild(frag, no);
  }

  const ATRIBUTOS = ['title', 'aria-label', 'placeholder'];
  function limparAtributos(el) {
    ATRIBUTOS.forEach((a) => {
      const v = el.getAttribute(a);
      if (!v) return;
      RE.lastIndex = 0;
      if (RE.test(v)) el.setAttribute(a, GC.semEmoji(v));
    });
  }

  function varrer(raiz) {
    if (raiz.nodeType === 3) return trocarTexto(raiz);
    if (raiz.nodeType !== 1 || PULAR.has(raiz.nodeName)) return;
    limparAtributos(raiz);
    raiz.querySelectorAll('[title], [aria-label], [placeholder]').forEach(limparAtributos);
    const textos = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) textos.push(w.currentNode);
    textos.forEach(trocarTexto);
  }

  // Liga a conversão na página inteira e em tudo que for desenhado depois (render, popups, chat).
  GC.iniciarIcones = function () {
    document.title = GC.semEmoji(document.title);
    varrer(document.body);
    new MutationObserver((mudancas) => {
      mudancas.forEach((m) => {
        if (m.type === 'childList') m.addedNodes.forEach(varrer);
        else if (m.type === 'characterData') trocarTexto(m.target);
        else if (m.type === 'attributes') limparAtributos(m.target);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => GC.iniciarIcones());
  }
})(window.GC = window.GC || {});
