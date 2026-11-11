(function (GC) {
  // Identidade do produto (white label). Padrão: identidade Golden.
  // Ordem de prioridade: o que foi salvo neste navegador (tela Personalizar) > a marca da instalação
  // (js/marca-config.js, opcional, vale para todos que abrem esta cópia) > o padrão Golden.
  // Roda no <head>, antes de tudo: as cores entram no primeiro desenho e os textos leem GC.agente().
  //
  // Quatro cores escolhidas (principal, principal escura, destaque, IA) viram a paleta inteira: tons claros,
  // bordas, sombras, gráficos, mapa, PDFs e a cor do texto sobre cada uma (branco ou escuro, pelo contraste).
  const CHAVE = 'gc.marca';

  // Paletas prontas, nos tons mais comuns de prefeituras e secretarias.
  GC.TEMAS_MARCA = [
    { id: 'golden', nome: 'Golden (padrão)', primaria: '#1b2230', escura: '#11161f', destaque: '#d4a017', ia: '#a16207' },
    { id: 'vila-dourada', nome: 'Vila Dourada (logo)', primaria: '#163b5e', escura: '#0b2238', destaque: '#d4a72c', ia: '#5b4bc4' },
    { id: 'institucional', nome: 'Azul institucional', primaria: '#1e3a5f', escura: '#152b47', destaque: '#d4a017', ia: '#6d28d9' },
    { id: 'saude', nome: 'Verde saúde', primaria: '#0f5e4a', escura: '#0a4436', destaque: '#f2b705', ia: '#0e7490' },
    { id: 'educacao', nome: 'Azul educação', primaria: '#1d4e89', escura: '#143866', destaque: '#f59e0b', ia: '#7c3aed' },
    { id: 'vinho', nome: 'Vinho', primaria: '#6b1d2a', escura: '#4d141e', destaque: '#e0b84c', ia: '#7c3aed' },
    { id: 'obras', nome: 'Terracota obras', primaria: '#7a3e12', escura: '#5a2d0c', destaque: '#f2b705', ia: '#6d28d9' },
    { id: 'petroleo', nome: 'Azul petróleo', primaria: '#0b4f6c', escura: '#073a50', destaque: '#f4a259', ia: '#5b5bd6' },
    { id: 'grafite-verde', nome: 'Grafite e verde', primaria: '#263238', escura: '#171f23', destaque: '#43a047', ia: '#00897b' },
  ];
  // Logo inicial: o monograma VD (img/logo-vila-dourada.svg), embutido para funcionar também sem servidor.
  // Trocável em Personalizar (enviar outro, voltar a este ou usar as iniciais do produto).
  GC.LOGO_PADRAO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTUiIGZpbGw9IiMwQjIyMzgiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg5LjYgOS42KSBzY2FsZSgwLjcpIj48cGF0aCBkPSJNMzYgMTRINDJBMTggMTggMCAwIDEgNDIgNTBIMzZaIiBmaWxsPSIjRDRBNzJDIi8+PHBhdGggZD0iTTggMTRMMjEgNTBMMzQgMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L2c+PC9zdmc+';
  GC.MARCA_PADRAO = Object.assign({ produto: 'Golden Gov', agente: 'Áurea', tema: 'golden', cores: null, logo: GC.LOGO_PADRAO, logoFundo: false }, GC.MARCA_INSTALACAO || {});

  // ---- utilitários de cor (também usados por gráficos, mapa e PDF, que não leem variáveis CSS) ----
  const hexRgb = (h) => {
    let s = String(h || '').trim().replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16);
    return Number.isNaN(n) || s.length !== 6 ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbHex = (r) => `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  // misturar('#1e3a5f', '#ffffff', 0.2): 20% da primeira cor, 80% da segunda.
  const misturar = (a, b, t) => { const x = hexRgb(a); const y = hexRgb(b); return rgbHex(x.map((v, i) => v * t + y[i] * (1 - t))); };
  const luminancia = (h) => {
    const [r, g, b] = hexRgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a, b) => { const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  const ESCURO_TEXTO = '#111827';
  // Texto sobre um fundo: branco se ler bem, senão quase preto.
  const sobre = (fundo) => (contraste(fundo, '#ffffff') >= 3.2 ? '#ffffff' : ESCURO_TEXTO);
  // Escurece até o branco ler bem por cima (contraste AA, 4,5:1), mantendo o tom.
  const escurecerAte = (h, alvo = 4.5) => { let c = h; for (let i = 0; i < 20 && contraste(c, '#ffffff') < alvo; i++) c = misturar(c, '#000000', 0.9); return c; };
  GC.cor = { hexRgb, rgbHex, misturar, luminancia, contraste, sobre, escurecerAte };

  const ler = () => {
    try { return JSON.parse(window.localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; }
  };
  GC.marca = Object.assign({}, GC.MARCA_PADRAO, ler() || {});
  GC.agente = () => GC.marca.agente || GC.MARCA_PADRAO.agente;
  GC.produto = () => GC.marca.produto || GC.MARCA_PADRAO.produto;
  GC.coresMarca = (m = GC.marca) => m.cores || GC.TEMAS_MARCA.find((t) => t.id === m.tema) || GC.TEMAS_MARCA[0];
  // Cor de um papel da marca, em hex: 'navy' (principal), 'escuro', 'ouro' (destaque) ou 'ia'.
  const PAPEL = { navy: 'primaria', escuro: 'escura', ouro: 'destaque', ia: 'ia' };
  GC.corMarca = (papel, c = GC.coresMarca()) => c[PAPEL[papel] || papel] || '#1e3a5f';
  GC.rgbMarca = (papel) => hexRgb(GC.corMarca(papel));

  // A paleta inteira derivada das quatro cores (nome da variável CSS → valor).
  GC.paletaMarca = function (c = GC.coresMarca()) {
    const p = c.primaria; const e = c.escura; const d = c.destaque; const ia = c.ia;
    return {
      '--navy': p, '--navy-escuro': e, '--ouro': d, '--ia': ia,
      '--navy-claro': misturar(p, '#ffffff', 0.08), '--navy-suave': misturar(p, '#ffffff', 0.16), '--navy-medio': misturar(p, '#ffffff', 0.55),
      '--ouro-claro': misturar(d, '#ffffff', 0.7), '--ouro-suave': misturar(d, '#ffffff', 0.16),
      '--ouro-fundo': misturar(d, '#ffffff', 0.12), '--ouro-texto': escurecerAte(misturar(d, '#000000', 0.7), 4.5),
      '--ia-claro': misturar(ia, '#ffffff', 0.1), '--ia-suave': misturar(ia, '#ffffff', 0.22), '--ia-medio': misturar(ia, '#ffffff', 0.6),
      '--ia-escuro': misturar(ia, '#000000', 0.72),
      // Texto na cor da marca sobre fundo claro: escurece só o necessário para ler (cor clara escolhida não some).
      '--navy-texto': escurecerAte(p, 4.5), '--navy-escuro-texto': escurecerAte(e, 4.5), '--ia-texto': escurecerAte(ia, 4.5),
      '--sobre-navy': sobre(p), '--sobre-escuro': sobre(e), '--sobre-ouro': sobre(d), '--sobre-ia': sobre(ia),
      // Nomes usados pelo portal do cidadão (css/cidadao.css) e pelo login.
      '--primaria': p, '--primaria-hover': e, '--sobre-primaria': sobre(p), '--titulo': escurecerAte(p, 4.5),
      '--topo': `linear-gradient(120deg, ${e} 0%, ${p} 55%, ${misturar(p, '#ffffff', 0.78)} 100%)`,
    };
  };

  // Iniciais do produto para o selo quando não há logo ("Golden Gov" → "GG").
  GC.iniciaisMarca = (m = GC.marca) => (m.produto || 'GG').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  GC.htmlLogoMarca = (m = GC.marca, classe = 'logo') => (m.logo
    ? `<span class="${classe} com-imagem${m.logoFundo ? ' com-fundo' : ''}"><img src="${m.logo}" alt=""></span>`
    : `<span class="${classe}" aria-hidden="true">${GC.iniciaisMarca(m)}</span>`);

  // Cores → variáveis CSS (as mesmas que todo o CSS usa) + cor da barra do navegador + ícone da aba.
  // Modo escuro do portal do cidadão (só lá há tema escuro): mesmos papéis, tons para fundo escuro.
  GC.paletaMarcaEscura = function (c = GC.coresMarca()) {
    const fundo = misturar(c.primaria, '#000000', 0.45);
    return {
      '--navy': fundo, '--navy-escuro': misturar(c.primaria, '#000000', 0.3),
      '--topo': `linear-gradient(120deg, ${misturar(c.primaria, '#000000', 0.25)} 0%, ${fundo} 60%, ${misturar(c.primaria, '#000000', 0.62)} 100%)`,
      '--primaria': misturar(c.destaque, '#ffffff', 0.85), '--primaria-hover': misturar(c.destaque, '#ffffff', 0.7), '--sobre-primaria': sobre(misturar(c.destaque, '#ffffff', 0.85)),
      '--navy-texto': misturar(c.primaria, '#ffffff', 0.2), '--navy-escuro-texto': misturar(c.primaria, '#ffffff', 0.3), '--ia-texto': misturar(c.ia, '#ffffff', 0.45),
      '--ouro': misturar(c.destaque, '#ffffff', 0.85), '--ouro-fundo': misturar(c.destaque, '#000000', 0.18), '--ouro-texto': misturar(c.destaque, '#ffffff', 0.55),
    };
  };
  const css = (vars) => Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  GC.aplicarCores = function (c = GC.coresMarca(), raiz = document.documentElement) {
    // Prévia num pedaço da tela: variáveis no próprio elemento.
    if (raiz !== document.documentElement) { Object.entries(GC.paletaMarca(c)).forEach(([k, v]) => raiz.style.setProperty(k, v)); return; }
    // Página inteira: uma <style> no fim do <head> (vence o :root dos arquivos CSS e aceita o modo escuro).
    let tag = document.getElementById('marca-cores');
    if (!tag) { tag = document.createElement('style'); tag.id = 'marca-cores'; (document.head || document.documentElement).appendChild(tag); }
    tag.textContent = `html:root { ${css(GC.paletaMarca(c))} }\n@media (prefers-color-scheme: dark) { html[data-portal]:root { ${css(GC.paletaMarcaEscura(c))} } }`;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { if (!/dark/.test(m.media || '')) m.content = c.primaria; });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${c.destaque}"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="${sobre(c.destaque)}">${GC.iniciaisMarca()}</text></svg>`;
    let icone = document.querySelector('link[rel="icon"]');
    if (!icone && document.head) { icone = document.createElement('link'); icone.rel = 'icon'; document.head.appendChild(icone); }
    if (icone) icone.href = GC.marca.logo || `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };

  // Textos marcados no HTML: data-marca="produto|agente"; data-marca-attr troca atributos.
  GC.aplicarTextosMarca = function (raiz = document) {
    if (raiz === document) document.title = document.title.replace(GC.MARCA_PADRAO.produto, GC.produto()).replace('Golden Gov', GC.produto());
    raiz.querySelectorAll('[data-marca="produto"]').forEach((el) => { el.textContent = GC.produto(); });
    raiz.querySelectorAll('[data-marca="agente"]').forEach((el) => { el.textContent = GC.agente(); });
    // Portal do cidadão: o ícone ao lado do nome da prefeitura vira o logo, quando há um.
    if (GC.marca.logo) raiz.querySelectorAll('[data-marca-icone]').forEach((el) => { el.innerHTML = `<img src="${GC.marca.logo}" alt="">`; el.classList.add('com-imagem'); });
    raiz.querySelectorAll('[data-marca-logo]').forEach((el) => { el.innerHTML = GC.htmlLogoMarca(GC.marca, el.dataset.marcaLogo || 'logo'); });
    raiz.querySelectorAll('[data-marca-attr]').forEach((el) => {
      el.dataset.marcaAttr.split(',').forEach((par) => {
        const [attr, modelo] = par.split(':');
        el.setAttribute(attr, modelo.replace('{agente}', GC.agente()).replace('{produto}', GC.produto()));
      });
    });
  };

  GC.salvarMarca = function (nova) {
    GC.marca = Object.assign({}, GC.MARCA_PADRAO, nova);
    try { window.localStorage.setItem(CHAVE, JSON.stringify(GC.marca)); } catch (e) { return false; }
    return true;
  };
  GC.restaurarMarca = function () {
    try { window.localStorage.removeItem(CHAVE); } catch (e) { /* nada salvo */ }
    GC.marca = Object.assign({}, GC.MARCA_PADRAO);
  };
  // Arquivo da marca (Exportar/Importar): o mesmo formato serve para js/marca-config.js.
  GC.exportarMarca = (m = GC.marca) => ({ formato: 'golden-marca', versao: 1, produto: m.produto, agente: m.agente, tema: m.tema, cores: GC.coresMarca(m), logo: m.logo || null, logoFundo: !!m.logoFundo });
  GC.lerArquivoMarca = function (obj) {
    if (!obj || obj.formato !== 'golden-marca' || !obj.cores) return null;
    const ok = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
    if (!['primaria', 'escura', 'destaque', 'ia'].every((k) => ok(obj.cores[k]))) return null;
    return { logoFundo: !!obj.logoFundo, produto: String(obj.produto || '').slice(0, 28) || GC.MARCA_PADRAO.produto, agente: String(obj.agente || '').slice(0, 20) || GC.MARCA_PADRAO.agente, tema: obj.tema || 'personalizado', cores: obj.cores, logo: typeof obj.logo === 'string' && obj.logo.startsWith('data:image/') ? obj.logo : null };
  };

  if (typeof document !== 'undefined' && document.documentElement) {
    GC.aplicarCores();
    const textos = () => GC.aplicarTextosMarca();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', textos); else textos();
  }
})(window.GC = window.GC || {});
