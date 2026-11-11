(function (GC) {
  // Tela Indicadores (#/indicadores[/<área ou código>]): o catálogo de js/indicadores.js avaliado para a
  // cidade atual. Placar clicável (na meta / perto / fora, filtra a lista), filtro por secretaria com a
  // contagem do que está fora, três visões (cartões, lista compacta, mapa de calor) e a ficha do indicador
  // com gráfico de 12 meses, leitura da série, metas nos 3 portes e navegação ← → entre indicadores.
  const esc = (t) => GC.escaparHtml(t);
  const SIT = { ok: 'Na meta', atencao: 'Perto da meta', critico: 'Fora da meta', sem_dado: 'Sem dado' };
  const SIT_CLASSE = { ok: 'st-em_dia', atencao: 'st-atencao', critico: 'st-critico', sem_dado: '' };
  const GRUPO = { critico: 'Fora da meta', atencao: 'Perto da meta', ok: 'Na meta', sem_dado: 'Sem dado' };
  const PORTE_NOME = { pequena: 'Cidade pequena', media: 'Cidade média', grande: 'Cidade grande' };
  const VISTAS = [
    { id: 'cartoes', nome: 'Cartões', icone: 'layout-grid' },
    { id: 'lista', nome: 'Lista', icone: 'list' },
    { id: 'calor', nome: 'Mapa de calor', icone: 'grid-dots' },
  ];
  const fmt = (v, u) => GC.formatarIndicador(v, u);
  const sinal = (i) => (i.polaridade === 'menor' ? '≤' : '≥');
  const ic = (nome, classe) => GC.icone ? GC.icone(nome, classe) : '';
  const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const estreita = () => !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  const semMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const guardar = { // preferências do visitante (sem garantia: navegador privado pode recusar)
    ler: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    gravar: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };

  const areaDe = (i) => i.area || 'gabinete';
  const nomeAreaCurto = (id) => (id === 'gabinete' ? 'Gestão e intersetorial' : (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome);
  const emojiArea = (id) => (id === 'gabinete' ? '🏛' : (GC.data.areas.find((a) => a.id === id) || {}).emoji || '');

  function filtros(lista) {
    const usadas = [...new Set(lista.map(areaDe))];
    if (usadas.length < 2) return [];
    return [{ id: null, nome: 'Todas' }, ...usadas.map((id) => ({ id, nome: nomeAreaCurto(id) }))];
  }

  // "71 min" → número grande e unidade pequena.
  function partesValor(texto) {
    const m = /^(-?[\d.,]+)\s*(.*)$/.exec(texto);
    return m ? { n: m[1], u: m[2] } : { n: texto, u: '' };
  }

  // Sparkline do cartão (12 meses), sem eixos.
  function sparkline(i) {
    const v = i.serieAtual && i.serieAtual.meses;
    if (!v || v.length < 2) return '';
    const L = 84; const A = 26; const m = 3;
    const min = Math.min(...v, i.metaAtual); const max = Math.max(...v, i.metaAtual);
    const x = (k) => m + (k * (L - 2 * m)) / (v.length - 1);
    const y = (n) => (max === min ? A / 2 : A - m - ((n - min) * (A - 2 * m)) / (max - min));
    const pts = v.map((n, k) => `${x(k).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    return `<svg class="ind-spark sit-${i.situacao}" viewBox="0 0 ${L} ${A}" aria-hidden="true" focusable="false">
      <line x1="${m}" x2="${L - m}" y1="${y(i.metaAtual).toFixed(1)}" y2="${y(i.metaAtual).toFixed(1)}" class="meta"/>
      <polyline points="${pts}"/><circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2.4"/></svg>`;
  }

  function tendencia(i) {
    const t = GC.tendenciaIndicador(i);
    if (!t || t.direcao === 'estavel') return t ? '<span class="ind-tend neutro">● estável</span>' : '';
    const seta = t.direcao === 'sobe' ? '▲' : '▼';
    const quanto = i.unidade === '%' ? `${num(Math.abs(t.delta))} p.p.` : fmt(Math.abs(t.delta), i.unidade);
    return `<span class="ind-tend ${t.melhorou ? 'melhor' : 'pior'}" title="${t.melhorou ? 'Melhorou' : 'Piorou'} em relação ao ponto anterior">${seta} ${esc(quanto)}</span>`;
  }

  // Barra até a meta: onde está o valor e onde fica a meta, numa escala comum.
  function barraMeta(i) {
    const v = i.valorAtual; const m = i.metaAtual;
    if (typeof v !== 'number' || typeof m !== 'number') return '';
    const escala = Math.max(v, m, 0.0001) * 1.15;
    const d = GC.distanciaMeta(i);
    const texto = d === null ? '' : d > 0 ? `${num(d)}% ${i.polaridade === 'menor' ? 'acima' : 'abaixo'} da meta` : d === 0 ? 'exatamente na meta' : `folga de ${num(-d)}%`;
    return `<span class="ind-ate-meta sit-${i.situacao}" title="${esc(texto)}"><span class="trilho"><i style="--v:${Math.min(100, (v / escala) * 100).toFixed(1)}%"></i><em style="--m:${Math.min(100, (m / escala) * 100).toFixed(1)}%"></em></span><small>${esc(texto)}</small></span>`;
  }

  // Série de 12 meses em SVG: área com gradiente, zona fora da meta, pontos com dica e rótulos no eixo.
  let idGraf = 0;
  function grafico(i) {
    const serie = i.serieAtual; const meta = i.metaAtual; const unidade = i.unidade;
    const v = serie.meses;
    const min = Math.min(...v, meta); const max = Math.max(...v, meta);
    const folga = (max - min) * 0.12 || 1;
    const lo = Math.max(0, min - folga); const hi = max + folga;
    const L = 340; const A = 130; const mx = 8; const topo = 10; const base = 22;
    const x = (k) => mx + (k * (L - 2 * mx)) / (v.length - 1);
    const y = (n) => topo + (A - topo - base) * (1 - (n - lo) / (hi - lo));
    const yMeta = y(meta);
    const pts = v.map((n, k) => `${x(k).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    const g = `g${++idGraf}`;
    // Zona ruim: acima da meta (menor é melhor) ou abaixo dela (maior é melhor).
    const zona = i.polaridade === 'menor'
      ? `<rect x="${mx}" y="${topo}" width="${L - 2 * mx}" height="${Math.max(0, yMeta - topo).toFixed(1)}" class="ind-zona"/>`
      : `<rect x="${mx}" y="${yMeta.toFixed(1)}" width="${L - 2 * mx}" height="${Math.max(0, A - base - yMeta).toFixed(1)}" class="ind-zona"/>`;
    const passo = Math.max(1, Math.round((v.length - 1) / 3));
    const rotulos = serie.rotulos.map((r, k) => ((k % passo === 0 || k === v.length - 1) && !(k !== v.length - 1 && v.length - 1 - k < passo / 2)
      ? `<text x="${x(k).toFixed(1)}" y="${A - 6}" text-anchor="${k === 0 ? 'start' : k === v.length - 1 ? 'end' : 'middle'}" class="ind-eixo">${esc(r)}</text>` : '')).join('');
    const pontos = v.map((n, k) => `<circle cx="${x(k).toFixed(1)}" cy="${y(n).toFixed(1)}" r="${k === v.length - 1 ? 4 : 2.6}" class="${k === v.length - 1 ? 'ind-ponto atual' : 'ind-ponto'}"><title>${esc(serie.rotulos[k] || '')}: ${esc(fmt(n, unidade))}</title></circle>`).join('');
    const area = `${x(0).toFixed(1)},${(A - base).toFixed(1)} ${pts} ${x(v.length - 1).toFixed(1)},${(A - base).toFixed(1)}`;
    return `<figure class="ind-grafico sit-${i.situacao}">
      <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="${serie.rotulos[serie.rotulos.length - 1] === 'agora' ? 'Últimos 12 meses e agora' : 'Últimos 12 meses'}: ${v.map((n) => fmt(n, unidade)).join(', ')}; meta ${fmt(meta, unidade)}">
        <defs><linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="ind-grad-a"/><stop offset="1" class="ind-grad-b"/></linearGradient></defs>
        ${zona}
        <polygon points="${area}" fill="url(#${g})"/>
        <line x1="${mx}" x2="${L - mx}" y1="${yMeta.toFixed(1)}" y2="${yMeta.toFixed(1)}" class="ind-meta-linha"/>
        <text x="${L - mx}" y="${(yMeta - 4).toFixed(1)}" text-anchor="end" class="ind-meta-rotulo">meta ${esc(fmt(meta, unidade))}</text>
        <polyline points="${pts}" class="ind-linha"/>
        ${pontos}
        ${rotulos}
      </svg>
      <figcaption class="sr-only">Zona sombreada: fora da meta.</figcaption>
    </figure>`;
  }

  GC.criarTelaIndicadores = function (el, cb) {
    let filtro = null;
    let sitFiltro = null; // 'critico' | 'atencao' | 'ok' (clique no placar)
    let aberto = null;
    let mostrado = null; // a ficha na tela: a escolhida ou, sem escolha, a sugerida
    let ordemAtual = []; // ids na ordem da lista (navegação ← →)
    let vista = guardar.ler('vd-ind-vista');
    let ultimoHtml = '';
    let ultimo = null;
    let animar = false;
    let mudancas = {};
    let fotoFeita = false;
    // Grupos por situação recolhíveis. Sem escolha da pessoa: no celular, "Na meta" começa fechado.
    const gruposEscolhidos = {};
    const grupoFechado = (s) => (s in gruposEscolhidos ? gruposEscolhidos[s] : (s === 'ok' && estreita()));

    // Antes/depois da última visita: compara com a foto guardada e guarda a de agora (uma vez por sessão).
    function fotografar(e) {
      if (fotoFeita) return;
      fotoFeita = true;
      const chave = `vd-ind-foto-${e.porte}`;
      mudancas = GC.mudancasIndicadores(e.indicadores, guardar.ler(chave));
      guardar.gravar(chave, GC.fotoIndicadores(e.indicadores));
    }

    function placar(p, antes) {
      const botao = (s, rotulo) => {
        const dif = p[s] - antes[s];
        const var_ = dif ? `<em class="${(s === 'ok') === (dif > 0) ? 'melhor' : 'pior'}" title="vs. mês passado">${dif > 0 ? '+' : ''}${dif}</em>` : '';
        return `<button type="button" class="ind-p ${s}${sitFiltro === s ? ' ativo' : ''}" data-sit="${s}" aria-pressed="${sitFiltro === s}" title="Mostrar só: ${rotulo}">
          <b data-contar="${p[s]}">${animar && !semMovimento() ? 0 : p[s]}</b> ${rotulo}${var_}</button>`;
      };
      return `<div class="ind-placar" role="group" aria-label="Filtrar pela situação">
        ${botao('critico', 'fora da meta')}${botao('atencao', 'perto da meta')}${botao('ok', 'na meta')}
        <small>de ${p.total} indicadores${sitFiltro ? ' · <button type="button" class="ind-limpar" data-sit="">mostrar todos</button>' : ''}</small>
      </div>`;
    }

    function selo(i) {
      const m = mudancas[i.id];
      return m ? `<span class="ind-mudou ${m.melhorou ? 'melhor' : 'pior'}" title="Desde a sua última visita: ${SIT[m.de]} → ${SIT[m.para]}">${m.melhorou ? 'melhorou' : 'piorou'} desde a última visita</span>` : '';
    }

    function cartao(i, k) {
      const ativo = aberto === i.id || mostrado === i.id;
      const v = partesValor(fmt(i.valorAtual, i.unidade));
      return `<button type="button" class="ind-cartao sit-${i.situacao}${ativo ? ' ativo' : ''}${animar ? ' entrar' : ''}" style="--i:${k}" data-ind="${esc(i.id)}" aria-pressed="${ativo}" title="${esc(i.id)}">
        <span class="ind-topo"><span class="ind-area-ic" title="${esc(nomeAreaCurto(areaDe(i)))}">${emojiArea(areaDe(i))}</span><span class="sec-status ${SIT_CLASSE[i.situacao]}">${SIT[i.situacao]}</span>${selo(i)}</span>
        <span class="ind-nome">${esc(i.nome)}</span>
        <span class="ind-linha-valor"><span class="ind-valor"><b>${esc(v.n)}</b>${v.u ? `<small>${esc(v.u)}</small>` : ''}</span>${sparkline(i)}</span>
        <span class="ind-linha-tend">${tendencia(i)}<span class="ind-meta">meta ${sinal(i)} ${esc(fmt(i.metaAtual, i.unidade))} · ${esc(i.frequenciaAtual.toLowerCase())}</span></span>
        ${barraMeta(i)}
        ${i.detalheAtual ? `<small class="ind-detalhe">${esc(i.detalheAtual)}</small>` : ''}
      </button>`;
    }

    function linha(i) {
      const ativo = aberto === i.id || mostrado === i.id;
      return `<button type="button" class="ind-linha-item sit-${i.situacao}${ativo ? ' ativo' : ''}" data-ind="${esc(i.id)}" aria-pressed="${ativo}">
        <span class="ind-area-ic">${emojiArea(areaDe(i))}</span>
        <span class="ind-nome">${esc(i.nome)}<small>meta ${sinal(i)} ${esc(fmt(i.metaAtual, i.unidade))}${mudancas[i.id] ? ` · ${mudancas[i.id].melhorou ? 'melhorou' : 'piorou'} desde a última visita` : ''}</small></span>
        ${sparkline(i)}
        <span class="ind-valor-curto">${esc(fmt(i.valorAtual, i.unidade))}${tendencia(i)}</span>
        <span class="ind-ponto-sit" title="${SIT[i.situacao]}"></span>
      </button>`;
    }

    // Mapa de calor: uma linha por secretaria, um quadrado por indicador, cor pela situação.
    function calor(lista, e) {
      const areas = [...new Set(e.indicadores.map(areaDe))];
      const linhas = areas.map((a) => {
        const daArea = lista.filter((i) => areaDe(i) === a);
        if (!daArea.length) return '';
        return `<div class="ind-calor-linha"><span class="ind-calor-area">${emojiArea(a)} ${esc(nomeAreaCurto(a))}</span>
          <span class="ind-calor-quadros">${daArea.map((i) => `<button type="button" class="ind-quadro sit-${i.situacao}${(aberto || mostrado) === i.id ? ' ativo' : ''}" data-ind="${esc(i.id)}" aria-label="${esc(i.nome)}: ${esc(fmt(i.valorAtual, i.unidade))}, ${SIT[i.situacao]}" title="${esc(i.nome)} · ${esc(fmt(i.valorAtual, i.unidade))} · ${SIT[i.situacao]}"><b>${esc(i.id)}</b><small>${esc(fmt(i.valorAtual, i.unidade))}</small></button>`).join('')}</span></div>`;
      }).join('');
      return `<div class="ind-calor">${linhas}<p class="w-legenda"><span><i style="background:var(--critica)"></i>fora da meta</span><span><i style="background:#ea580c"></i>perto da meta</span><span><i style="background:var(--positivo)"></i>na meta</span></p></div>`;
    }

    function listaAgrupada(lista, modo) {
      if (!lista.length) return `<p class="painel-vazio">${ic('confetti', 'ic-ok')} Nenhum indicador nesta seleção.</p>`;
      let k = 0;
      return ['critico', 'atencao', 'ok', 'sem_dado'].map((s) => {
        const doGrupo = lista.filter((i) => i.situacao === s);
        if (!doGrupo.length) return '';
        const fechado = grupoFechado(s);
        const itens = fechado ? '' : doGrupo.map((i) => (modo === 'lista' ? linha(i) : cartao(i, k++))).join('');
        return `<h4 class="ind-grupo sit-${s}"><button type="button" data-grupo="${s}" aria-expanded="${!fechado}"><span class="ind-grupo-ponto"></span>${GRUPO[s]} <small>${doGrupo.length}</small>${ic(fechado ? 'chevron-down' : 'chevron-up', 'ind-grupo-seta')}</button></h4>${itens}`;
      }).join('');
    }

    function ficha(i, e, padrao) {
      if (!i) return `<p class="painel-vazio">${ic('hand-finger-right')} Escolha um indicador para ver a ficha: fórmula, fonte, de onde veio e a meta em cada porte de cidade.</p>`;
      const nomeArea = i.area ? GC.data.areas.find((a) => a.id === i.area).secretaria.nome : (i.id.startsWith('SOC') ? 'Assistência Social × Saúde × Educação' : 'Gabinete do Prefeito');
      const pos = ordemAtual.indexOf(i.id);
      const nav = ordemAtual.length > 1 && pos >= 0 ? `<span class="ind-nav">
          <button type="button" class="gaveta-x" data-ficha="anterior" aria-label="Indicador anterior" title="Anterior (←)"${pos === 0 ? ' disabled' : ''}>${ic('chevron-left')}</button>
          <small>${pos + 1}/${ordemAtual.length}</small>
          <button type="button" class="gaveta-x" data-ficha="proximo" aria-label="Próximo indicador" title="Próximo (→)"${pos === ordemAtual.length - 1 ? ' disabled' : ''}>${ic('chevron-right')}</button></span>` : '';
      const ins = GC.insightIndicador(i);
      const portes = GC.portesAtendidos(i);
      const textoPortes = !portes.length ? 'Hoje não cumpre a meta de nenhum porte de cidade.'
        : portes.length === 3 ? 'Hoje cumpre a meta dos 3 portes de cidade.'
          : `Hoje cumpre a meta de ${portes.map((p) => PORTE_NOME[p].toLowerCase()).join(' e de ')}${portes.includes(i.porte) ? '' : ` (não a de ${PORTE_NOME[i.porte].toLowerCase()})`}.`;
      return `
        <div class="ind-puxador" data-ficha="puxar" aria-hidden="true"><span></span></div>
        <header class="ind-ficha-cab">
          <div><p class="ind-sobre"><code>${esc(i.id)}</code> · ${esc(nomeArea)}${e.publico ? '' : ` · <span class="ind-fase">${esc(i.fase)}</span>`}</p><h3>${esc(i.nome)}</h3>
            ${padrao ? '<span class="ind-padrao">sugestão: o mais urgente da seleção</span>' : ''}</div>
          <div class="ind-ficha-ctrl">${nav}${padrao ? '' : `<button type="button" class="gaveta-x" data-ficha="fechar" aria-label="Fechar a ficha">${ic('x')}</button>`}</div>
        </header>
        <div class="ind-ficha-corpo">
          <div class="ind-ficha-valor sit-${i.situacao}"><b>${esc(fmt(i.valorAtual, i.unidade))}</b>
            <span class="sec-status ${SIT_CLASSE[i.situacao]}">${SIT[i.situacao]}</span>${tendencia(i)}
            <small>meta ${sinal(i)} ${esc(fmt(i.metaAtual, i.unidade))} para ${esc(PORTE_NOME[i.porte].toLowerCase())}${i.detalheAtual ? ` · ${esc(i.detalheAtual)}` : ''}</small></div>
          ${ins ? `<p class="ind-insight ${ins.tom}">${ic(ins.tom === 'ok' ? 'trending-up' : ins.tom === 'info' ? 'minus' : 'trending-down')} ${esc(ins.texto)}</p>` : ''}
          ${i.serieAtual ? grafico(i) : '<p class="ind-nota">Sem série histórica para este indicador ainda.</p>'}
          <p class="ind-portes-resumo">${ic('building-community')} ${esc(textoPortes)}</p>
          ${(() => {
            const ref = GC.referenciaPorte(i);
            if (!ref) return '';
            const tom = ref.melhorQuePct >= 60 ? 'ok' : ref.melhorQuePct >= 35 ? 'atencao' : 'critico';
            return `<div class="ind-ref ${tom}" title="Distribuição de referência simulada em torno da meta do porte; ainda não há base nacional ligada ao painel.">
              <span class="ind-ref-txt">${ic('chart-histogram')} Melhor que <b>~${ref.melhorQuePct}%</b> das ${esc(PORTE_NOME[i.porte].toLowerCase().replace('cidade', 'cidades').replace('média', 'médias').replace('pequena', 'pequenas').replace('grande', 'grandes'))}</span>
              <span class="ind-ref-barra"><i style="--v:${ref.melhorQuePct}%"></i></span>
              <small>mediana do porte: ${esc(fmt(ref.mediana, i.unidade))} · referência simulada</small>
            </div>`;
          })()}
          <details class="ind-sobre-det">
            <summary>${ic('info-circle')} Sobre este indicador <small>fórmula, fonte e metas por porte</small></summary>
            <dl class="ind-def">
              <dt>Fórmula</dt><dd>${esc(i.formula)}</dd>
              <dt>Melhor quando</dt><dd>${i.polaridade === 'menor' ? 'menor (quanto mais baixo, melhor)' : 'maior (quanto mais alto, melhor)'}</dd>
              <dt>Fonte</dt><dd>${esc(i.fonte)}</dd>
              <dt>Recorte</dt><dd>${esc(i.granularidade)}</dd>
              ${e.publico ? '' : `<dt>Origem</dt><dd>${esc(i.origem)}</dd>`}
            </dl>
            <h4>Meta e atualização por porte de cidade</h4>
            <table class="sec-tabela ind-portes"><thead><tr><th>Porte</th><th>Meta</th><th>Atualização</th></tr></thead><tbody>
              ${GC.PORTES_INDICADOR.map((p) => `<tr class="${p === i.porte ? 'atual' : ''}"><td>${esc(PORTE_NOME[p])}${p === i.porte ? ` <small>(${esc(e.cidade)})</small>` : ''}</td>
                <td>${sinal(i)} ${esc(fmt(i.meta[p], i.unidade))} ${portes.includes(p) ? ic('circle-check', 'ic-ok') : ''}</td><td>${esc(i.frequencia[p])}</td></tr>`).join('')}
            </tbody></table>
            <p class="ind-nota">Por que muda: a cidade pequena costuma ter dados mensais em planilha e menos estrutura; a grande tem sistemas em tempo real e metas próprias de metrópole.</p>
          </details>
        </div>
        ${e.publico ? '' : `<footer class="ind-ficha-acoes">
          ${i.area ? `<button type="button" class="btn-sec" data-ficha="secretaria">${ic('building-bank')} Abrir a secretaria</button>` : ''}
          <button type="button" class="btn-sec principal" data-ficha="perguntar"><i class="ic-copiloto ic-ia" aria-hidden="true"></i> Perguntar à ${GC.agente()}</button>
        </footer>`}`;
    }

    function html(e) {
      const naArea = (i) => !filtro || (filtro === 'gabinete' ? i.area === null : i.area === filtro);
      const daArea = e.indicadores.filter(naArea);
      const lista = GC.ordenarPorUrgencia(daArea.filter((i) => !sitFiltro || i.situacao === sitFiltro));
      const modo = vista || (estreita() ? 'lista' : 'cartoes');
      // Sem ficha escolhida, numa tela larga, a ficha não fica vazia: mostra o mais urgente da seleção.
      const escolhido = e.indicadores.find((i) => i.id === aberto) || null;
      const padrao = !escolhido && !estreita() ? (lista[0] || null) : null;
      const sel = escolhido || padrao;
      mostrado = sel ? sel.id : null;
      ordemAtual = lista.map((i) => i.id);
      if (escolhido && !ordemAtual.includes(escolhido.id)) ordemAtual = GC.ordenarPorUrgencia(e.indicadores).map((i) => i.id);
      const placarAgora = GC.placarIndicadores(daArea);
      const placarAntes = GC.placarIndicadores(daArea.map((i) => ({ situacao: GC.situacaoAnterior(i) })));
      const foraPorArea = {};
      e.indicadores.forEach((i) => { if (i.situacao === 'critico') foraPorArea[areaDe(i)] = (foraPorArea[areaDe(i)] || 0) + 1; });
      const nMudou = Object.keys(mudancas).length;
      return `
        <div class="ind-barra">
          <div class="ind-barra-topo">
            ${placar(placarAgora, placarAntes)}
            <div class="ind-vistas" role="group" aria-label="Como mostrar">
              ${VISTAS.map((v) => `<button type="button" data-vista="${v.id}" class="${modo === v.id ? 'ativo' : ''}" aria-pressed="${modo === v.id}" title="${v.nome}">${ic(v.icone)}<span>${v.nome}</span></button>`).join('')}
            </div>
            <button type="button" class="ind-info" aria-label="Sobre esta tela" title="Cada número do painel com a sua ficha. Metas e frequência de atualização para ${esc(e.cidade)} (${esc(PORTE_NOME[e.porte].toLowerCase())}). A variação no placar compara com o mês passado.">${ic('info-circle')}</button>
          </div>
          <div class="ind-filtros" role="group" aria-label="Filtrar por secretaria">
            ${filtros(e.indicadores).map((f) => {
              const n = f.id ? foraPorArea[f.id] || 0 : Object.values(foraPorArea).reduce((a, b) => a + b, 0);
              return `<button type="button" class="chip-vista${f.id === filtro ? ' ativo' : ''}" data-filtro="${f.id || ''}" aria-pressed="${f.id === filtro}">${f.id ? emojiArea(f.id) : ''} ${esc(f.nome)}${n ? ` <span class="ind-n-fora" title="${n} fora da meta">${n}</span>` : ''}</button>`;
            }).join('')}
          </div>
          ${nMudou ? `<p class="ind-mudancas">${ic('history')} ${nMudou} indicador(es) mudaram de situação desde a sua última visita.</p>` : ''}
        </div>
        <div class="ind-grade">
          <div class="ind-cartoes modo-${modo}">${modo === 'calor' ? calor(lista, e) : listaAgrupada(lista, modo)}</div>
          <aside class="painel-card ind-ficha${sel ? '' : ' vazia'}${escolhido ? ' escolhida' : ''}" data-ficha-ind="${sel ? esc(sel.id) : ''}" aria-label="Ficha do indicador" tabindex="-1">${ficha(sel, e, !!padrao)}</aside>
        </div>`;
    }

    function navegar(passo) {
      const atual = aberto || mostrado;
      const k = ordemAtual.indexOf(atual);
      const j = k + passo;
      if (k < 0 || j < 0 || j >= ordemAtual.length) return;
      cb.aoAbrir(ordemAtual[j]);
    }

    // Folha da ficha no celular: arrastar o puxador para baixo fecha.
    function ligarPuxador() {
      const f = el.querySelector('.ind-ficha.escolhida');
      const p = f && f.querySelector('[data-ficha="puxar"]');
      if (!p || !estreita()) return;
      let y0 = null;
      p.onpointerdown = (ev) => { y0 = ev.clientY; p.setPointerCapture(ev.pointerId); f.style.transition = 'none'; };
      p.onpointermove = (ev) => { if (y0 !== null) f.style.transform = `translateY(${Math.max(0, ev.clientY - y0)}px)`; };
      const soltar = (ev) => {
        if (y0 === null) return;
        const dy = ev.clientY - y0; y0 = null;
        f.style.transition = ''; f.style.transform = '';
        if (dy > 90) cb.aoAbrir(null);
      };
      p.onpointerup = soltar; p.onpointercancel = soltar;
    }

    function contar() {
      if (semMovimento()) return;
      el.querySelectorAll('[data-contar]').forEach((b) => {
        const alvo = Number(b.dataset.contar); const t0 = performance.now(); const dur = 500;
        const passo = (t) => { const k = Math.min(1, (t - t0) / dur); b.textContent = Math.round(alvo * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(passo); };
        requestAnimationFrame(passo);
      });
    }

    function ligar(e) {
      el.querySelectorAll('[data-filtro]').forEach((b) => { b.onclick = () => { filtro = b.dataset.filtro || null; desenhar(); }; });
      el.querySelectorAll('[data-sit]').forEach((b) => { b.onclick = () => { const s = b.dataset.sit || null; sitFiltro = sitFiltro === s ? null : s; desenhar(); }; });
      el.querySelectorAll('[data-grupo]').forEach((b) => { b.onclick = () => { const s = b.dataset.grupo; gruposEscolhidos[s] = !grupoFechado(s); desenhar(); }; });
      el.querySelectorAll('[data-vista]').forEach((b) => { b.onclick = () => { vista = b.dataset.vista; guardar.gravar('vd-ind-vista', vista); desenhar(); }; });
      el.querySelectorAll('[data-ind]').forEach((b) => { b.onclick = () => cb.aoAbrir(b.dataset.ind === aberto ? null : b.dataset.ind); });
      const sel = e.indicadores.find((i) => i.id === (aberto || mostrado));
      const acao = (nome, fn) => { const b = el.querySelector(`[data-ficha="${nome}"]`); if (b) b.onclick = fn; };
      acao('fechar', () => cb.aoAbrir(null));
      acao('anterior', () => navegar(-1));
      acao('proximo', () => navegar(1));
      if (sel) {
        acao('secretaria', () => cb.aoSecretaria(sel.area));
        acao('perguntar', () => cb.aoPerguntar(sel));
      }
      ligarPuxador();
    }

    // ← → trocam de indicador (fora de campos de texto).
    el.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, textarea, select') || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (!el.querySelector('.ind-ficha:not(.vazia)')) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); navegar(1); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); navegar(-1); }
    });

    // Redesenha só quando algo muda (o relógio chama a cada passo).
    function desenhar(forcar) {
      if (!ultimo) return;
      const h = html(ultimo);
      if (!forcar && h === ultimoHtml) return;
      ultimoHtml = h;
      // Redesenhar não pode jogar a ficha (que rola por dentro) de volta ao topo, nem perder o foco.
      const fichaAntes = el.querySelector('.ind-ficha');
      const corpoAntes = el.querySelector('.ind-ficha-corpo');
      const rolagem = corpoAntes ? corpoAntes.scrollTop : 0;
      const mesmaFicha = fichaAntes && fichaAntes.dataset.fichaInd === (mostrado || '');
      const detAberto = !!(fichaAntes && fichaAntes.querySelector('details[open]'));
      const focoSel = document.activeElement && el.contains(document.activeElement) ? seletorDe(document.activeElement) : null;
      el.innerHTML = h;
      ligar(ultimo);
      const fichaDepois = el.querySelector('.ind-ficha');
      if (fichaDepois && mesmaFicha && fichaDepois.dataset.fichaInd === (mostrado || '')) {
        const corpo = fichaDepois.querySelector('.ind-ficha-corpo');
        if (corpo) corpo.scrollTop = rolagem;
        if (detAberto) { const d = fichaDepois.querySelector('details'); if (d) d.open = true; }
      }
      const barra = el.querySelector('.ind-barra');
      if (barra && barra.offsetHeight) el.style.setProperty('--barra-h', `${barra.offsetHeight}px`);
      if (focoSel) { const f = el.querySelector(focoSel); if (f) f.focus({ preventScroll: true }); }
      if (animar) { contar(); animar = false; }
    }
    function seletorDe(n) {
      for (const a of ['data-ind', 'data-filtro', 'data-sit', 'data-vista', 'data-ficha', 'data-grupo'])if (n.hasAttribute(a)) return `[${a}="${CSS.escape(n.getAttribute(a))}"]`;
      return null;
    }

    // A largura muda (girar o celular, redimensionar): a ficha sugerida aparece ou some.
    if (window.matchMedia) {
      const mq = window.matchMedia('(max-width: 900px)');
      const mudou = () => desenhar(true);
      if (mq.addEventListener) mq.addEventListener('change', mudou); else if (mq.addListener) mq.addListener(mudou);
    }

    // alvo: código de indicador (abre a ficha) ou id de secretaria / 'gabinete' (filtra).
    function mostrar(alvo, e) {
      if (!ultimo) animar = true;
      ultimo = e;
      fotografar(e);
      const ind = alvo && e.indicadores.find((i) => i.id === alvo);
      if (ind) {
        aberto = ind.id;
        if (filtro && filtro !== areaDe(ind)) filtro = null;
        if (sitFiltro && sitFiltro !== ind.situacao) sitFiltro = null;
      } else {
        aberto = null;
        if (alvo) filtro = alvo;
      }
      desenhar(true);
      // No celular a ficha abre como folha por cima da lista: o foco vai para o botão de fechar.
      const x = ind && el.querySelector('.ind-ficha [data-ficha="fechar"]');
      if (x && estreita()) x.focus({ preventScroll: true });
    }

    function atualizar(e) { ultimo = e; desenhar(); }

    // Ficha escolhida aberta (o Esc fecha ela antes de fechar a gaveta).
    const fichaAberta = () => !!aberto;

    return { mostrar, atualizar, fichaAberta };
  };
})(window.GC = window.GC || {});
