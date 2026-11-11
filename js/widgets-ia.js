(function (GC) {
  // Widgets criados a partir de gráficos do Copiloto ("▦ Fixar como widget" na resposta).
  // Cada um guarda a pergunta que o gerou: ao desenhar, a pergunta é refeita para o gráfico vir com os
  // dados de agora; se a resposta não trouxer gráfico, vale a cópia guardada na hora em que foi fixado.
  // Entram no catálogo GC.WIDGETS (gaveta Widgets, visualizações) com id "ia-…". Lógica pura: o
  // armazenamento é injetado (navegador: localStorage, uma chave por cidade).
  const PREFIXO = 'ia-';
  const MAX = 12;
  const TIPOS = ['barra', 'linha', 'pizza'];
  const esc = (t) => (GC.escaparHtml ? GC.escaparHtml(t) : String(t));
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  GC.ehWidgetIA = (id) => typeof id === 'string' && id.startsWith(PREFIXO);

  // Gráfico válido (o mesmo formato da Resposta da IA), ou null.
  function graficoValido(g) {
    if (!g || !TIPOS.includes(g.tipo) || !Array.isArray(g.rotulos) || !g.rotulos.length || !Array.isArray(g.series) || !g.series.length) return null;
    const series = g.series
      .filter((s) => s && Array.isArray(s.valores))
      .map((s) => ({ nome: String(s.nome || ''), valores: g.rotulos.map((_, i) => (Number.isFinite(Number(s.valores[i])) ? Number(s.valores[i]) : 0)) }));
    if (!series.length) return null;
    return { tipo: g.tipo, titulo: String(g.titulo || 'Gráfico do ' + GC.agente() + ''), rotulos: g.rotulos.map(String), series, unidade: g.unidade ? String(g.unidade) : '' };
  }
  GC.graficoWidgetValido = graficoValido;

  function valido(w) {
    if (!w || !GC.ehWidgetIA(w.id)) return null;
    const grafico = graficoValido(w.grafico);
    if (!grafico) return null;
    return { id: w.id, nome: String(w.nome || grafico.titulo).slice(0, 80), pergunta: String(w.pergunta || ''), cenario: w.cenario ? String(w.cenario) : null, grafico, criadoEm: Number(w.criadoEm) || 0, ligado: w.ligado !== false };
  }

  // No catálogo: entram depois dos widgets fixos, na ordem em que foram criados.
  const noCatalogo = (w) => ({
    id: w.id,
    nome: w.nome,
    emoji: '✨',
    descricao: w.pergunta ? `Do ${GC.agente()}: "${w.pergunta}"` : 'Gráfico fixado do ' + GC.agente() + '',
    ia: true,
  });

  GC.criarWidgetsIA = function (armazenamento = { ler: () => null, gravar: () => {} }) {
    let lista = (Array.isArray(armazenamento.ler()) ? armazenamento.ler() : []).map(valido).filter(Boolean).slice(-MAX);

    function sincronizarCatalogo() {
      if (!GC.WIDGETS) return;
      for (let i = GC.WIDGETS.length - 1; i >= 0; i--) if (GC.WIDGETS[i].ia) GC.WIDGETS.splice(i, 1);
      lista.forEach((w) => GC.WIDGETS.push(noCatalogo(w)));
    }
    const gravar = () => { armazenamento.gravar(lista); sincronizarCatalogo(); };
    sincronizarCatalogo();

    // Mesma pergunta com o mesmo gráfico não duplica: devolve o que já existe.
    function criar({ pergunta, grafico, cenario }, agora = Date.now()) {
      const g = graficoValido(grafico);
      if (!g) return { criado: false, widget: null, motivo: 'sem gráfico' };
      const chave = `${normalizar(pergunta)}|${normalizar(g.titulo)}`;
      const existente = lista.find((w) => `${normalizar(w.pergunta)}|${normalizar(w.grafico.titulo)}` === chave);
      if (existente) return { criado: false, widget: existente, motivo: 'já existe' };
      let id = `${PREFIXO}${agora.toString(36)}`;
      while (lista.some((w) => w.id === id)) id += 'x';
      const w = { id, nome: g.titulo.slice(0, 80), pergunta: String(pergunta || '').trim(), cenario: cenario || null, grafico: g, criadoEm: agora, ligado: true };
      lista = [...lista, w].slice(-MAX);
      gravar();
      return { criado: true, widget: w };
    }

    function remover(id) {
      const antes = lista.length;
      lista = lista.filter((w) => w.id !== id);
      if (lista.length !== antes) gravar();
      return lista.length !== antes;
    }

    // Ligado/desligado pela gaveta ou pelo ✕: ao recarregar, os ligados voltam ao dashboard.
    function marcarLigados(ativos) {
      let mudou = false;
      lista = lista.map((w) => {
        const ligado = ativos.includes(w.id);
        if (ligado === w.ligado) return w;
        mudou = true;
        return Object.assign({}, w, { ligado });
      });
      if (mudou) gravar();
    }

    return {
      lista: () => lista.slice(),
      buscar: (id) => lista.find((w) => w.id === id) || null,
      ligados: () => lista.filter((w) => w.ligado).map((w) => w.id),
      criar,
      remover,
      marcarLigados,
    };
  };

  // ---- desenho no dashboard (HTML/SVG, como os outros widgets: funciona com o dashboard escondido) ----
  const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const comUnidade = (v, u) => (u === '%' ? `${num(v)}%` : `${num(v)}${u ? ` ${u}` : ''}`);

  function barras(g) {
    const [s, s2] = g.series;
    const max = Math.max(...g.series.flatMap((x) => x.valores), 1);
    const maior = Math.max(...s.valores);
    const linhas = g.rotulos.map((r, i) => {
      const v = s.valores[i];
      const extra = s2 ? `<small>${esc(s2.nome)}: ${comUnidade(s2.valores[i], g.unidade)}</small>` : '';
      return `<li><div class="w-ia-linha"><span>${esc(r)}${extra}</span><i style="--v:${Math.round((v / max) * 100)}%" class="${v === maior ? 'topo' : ''}"></i><b>${comUnidade(v, g.unidade)}</b></div></li>`;
    }).join('');
    const legenda = s2 ? `<p class="w-legenda"><span><i style="background:var(--ia)"></i>${esc(s.nome)}</span></p>` : '';
    return `<ul class="w-satisf w-ia-barras">${linhas}</ul>${legenda}`;
  }

  function linha(g) {
    const L = 320; const A = 90; const m = 6;
    const todos = g.series.flatMap((s) => s.valores);
    const lo = Math.min(...todos); const hi = Math.max(...todos);
    const n = g.rotulos.length;
    const x = (i) => (n === 1 ? L / 2 : m + (i * (L - 2 * m)) / (n - 1));
    const y = (v) => (hi === lo ? A / 2 : A - m - ((v - lo) * (A - 2 * m)) / (hi - lo));
    const pontos = (v) => v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
    const s = g.series[0];
    const ult = s.valores[n - 1];
    const polys = g.series.map((serie, k) => `<polyline points="${pontos(serie.valores)}" class="w-ia-serie${k ? ' w-ia-serie-2' : ''}"/>`).join('');
    return `<div class="w-ia-destaque"><b>${comUnidade(ult, g.unidade)}</b><small>${esc(g.rotulos[n - 1])} · de ${comUnidade(s.valores[0], g.unidade)} em ${esc(g.rotulos[0])}</small></div>
      <figure class="w-ia-linha-fig">
        <svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="${esc(g.titulo)}: ${g.rotulos.map((r, i) => `${esc(r)} ${comUnidade(s.valores[i], g.unidade)}`).join(', ')}">${polys}
          <circle cx="${x(n - 1).toFixed(1)}" cy="${y(ult).toFixed(1)}" r="3.5" class="w-ia-ponto"/>
        </svg>
        <figcaption><span>${esc(g.rotulos[0])}</span><span>${esc(g.rotulos[n - 1])}</span></figcaption>
      </figure>`;
  }

  // Corpo do widget: o gráfico, a pergunta de origem e os botões (perguntar de novo, ver no Copiloto).
  GC.htmlWidgetIA = function (w, graficoAtual) {
    const g = graficoValido(graficoAtual) || w.grafico;
    const aoVivo = !!graficoValido(graficoAtual);
    const corpo = g.tipo === 'linha' ? linha(g) : barras(g);
    const quando = w.criadoEm ? new Date(w.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    return `<div class="w-ia">
      ${g.titulo !== w.nome ? `<p class="w-ia-titulo">${esc(g.titulo)}</p>` : ''}
      ${corpo}
      <footer class="w-ia-pe">
        <span title="${aoVivo ? 'O gráfico é refeito com os dados de agora' : 'Cópia do gráfico de quando foi fixado'}">${aoVivo ? '● dados de agora' : `cópia de ${quando}`}${w.pergunta ? ` · "${esc(w.pergunta)}"` : ''}</span>
        ${w.pergunta ? `<button type="button" class="w-ia-perguntar" data-ia-perguntar="${esc(w.id)}">✨ Perguntar ao ${GC.agente()}</button>` : ''}
      </footer>
    </div>`;
  };
})(window.GC = window.GC || {});
