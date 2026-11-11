(function (GC) {
  // Bloco "Atendimento · 30 dias" da visão geral das secretarias: números do mês, ranking
  // ordenável das secretarias, o que está ruim (clicável) e resolvidas recentemente.
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const horas = (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  const AMOSTRA_PEQUENA = 20; // abaixo disso, variação em número e não em %

  // Variação contra o mês anterior; "melhor" diz para que lado é bom.
  function variacaoTexto(atual, anterior, unidade, melhor) {
    const d = atual - anterior;
    if (Math.abs(d) < 0.05) return '<i class="igual">= mês anterior</i>';
    const subiu = d > 0;
    const bom = melhor === 'mais' ? subiu : !subiu;
    let valor;
    if (unidade === '%' && anterior < AMOSTRA_PEQUENA) valor = `${Math.abs(Math.round(d))}`;
    else if (unidade === '%') valor = `${Math.round(Math.abs((d / anterior) * 100))}%`;
    else if (unidade === 'p.p.') valor = `${Math.abs(Math.round(d))} p.p.`;
    else valor = horas(Math.abs(d));
    return `<i class="${bom ? 'melhor' : 'pior'}" title="Mês anterior: ${unidade === 'h' ? horas(anterior) : `${anterior}${unidade === 'p.p.' ? '%' : ''}`}">${subiu ? '▲' : '▼'} ${valor}</i>`;
  }

  GC.variacaoTexto = variacaoTexto;

  // Minigráfico dos 12 meses do indicador principal da secretaria (SVG inline).
  function sparkline(area) {
    const s = (GC.data.secretarias || {})[area];
    if (!s || !s.serie) return '';
    const v = s.serie.meses;
    const min = Math.min(...v, s.serie.meta);
    const max = Math.max(...v, s.serie.meta);
    const W = 64; const H = 18;
    const y = (n) => (max === min ? H / 2 : H - 2 - ((n - min) / (max - min)) * (H - 4));
    const pts = v.map((n, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.serie.rotulo)}: 12 meses">
      <line x1="0" x2="${W}" y1="${y(s.serie.meta).toFixed(1)}" y2="${y(s.serie.meta).toFixed(1)}" class="spark-meta"/>
      <polyline points="${pts}" class="spark-linha"/><circle cx="${W}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2" class="spark-fim"/></svg>`;
  }

  function metasEmDia(id) {
    const m = ((GC.data.secretarias || {})[id] || {}).metas || [];
    return {
      ok: m.filter((x) => x.status === 'em_dia' || x.status === 'concluida').length,
      total: m.length,
      critico: m.some((x) => x.status === 'critico'),
      status: m.map((x) => x.status),
    };
  }
  const STATUS_META = { concluida: 'concluída', em_dia: 'em dia', atencao: 'atenção', critico: 'crítica' };

  const COLUNAS = [
    { id: 'nome', rotulo: 'Secretaria', valor: (s) => area(s.area).nome, texto: true },
    { id: 'abertas', rotulo: 'Abertas', titulo: 'Ocorrências abertas agora', valor: (s) => s.abertas },
    { id: 'atrasadas', rotulo: 'Atrasadas', titulo: 'Com prazo estourado agora', valor: (s) => s.atrasadas },
    { id: 'resolvidas', rotulo: 'Resolvidas', titulo: 'Resolvidas em 30 dias', valor: (s) => s.resolvidas },
    { id: 'noPrazo', rotulo: 'No prazo', titulo: 'Resolvidas dentro do prazo (30 dias)', valor: (s) => s.noPrazoPct, cidade: true },
    { id: 'tempo', rotulo: 'Tempo médio', titulo: 'Tempo médio até resolver (30 dias)', valor: (s) => s.tempoMedioH, cidade: true, cls: 'col-tempo' },
    { id: 'metas', rotulo: 'Metas', titulo: 'Metas do plano de governo em dia', valor: (s) => metasEmDia(s.area).ok / (metasEmDia(s.area).total || 1), cls: 'col-metas' },
    { id: 'serie', rotulo: '12 meses', titulo: 'Indicador principal da secretaria; a linha clara é a meta', cls: 'col-serie', semOrdem: true },
  ];
  // Ordem padrão: pior "no prazo" primeiro (como vem do store).
  const ordens = new WeakMap();

  function ordenar(lista, ordem) {
    if (!ordem) return lista;
    const c = COLUNAS.find((x) => x.id === ordem.col);
    const fator = ordem.asc ? 1 : -1;
    return lista.slice().sort((a, b) => {
      const va = c.valor(a); const vb = c.valor(b);
      return (c.texto ? String(va).localeCompare(String(vb), 'pt-BR') : va - vb) * fator;
    });
  }

  function celula(s, c, d) {
    const meta = s.metaPrazoPct || 85;
    switch (c.id) {
      case 'nome': return `<td class="col-nome">${area(s.area).secretaria.emoji} ${esc(area(s.area).nome)}</td>`;
      case 'abertas': return `<td>${s.abertas}</td>`;
      case 'atrasadas': return `<td class="${s.atrasadas ? 'abaixo' : 'zero'}">${s.atrasadas ? `⏰ ${s.atrasadas}` : '0'}</td>`;
      case 'resolvidas': return `<td>${s.resolvidas}</td>`;
      case 'noPrazo': return `<td class="col-prazo"><span class="${s.noPrazoPct < meta ? 'abaixo' : ''}">${s.noPrazoPct}%</span>
        <span class="mini-barra" title="meta ${meta}%"><i class="${s.noPrazoPct < meta ? 'ruim' : 'bom'}" style="width:${s.noPrazoPct}%"></i><b style="left:${meta}%"></b></span></td>`;
      case 'tempo': return `<td class="col-tempo">${horas(s.tempoMedioH)}</td>`;
      case 'metas': {
        // Texto neutro; a cor fica nos quadradinhos (um por meta) e só vira alerta com meta crítica.
        const m = metasEmDia(s.area);
        const dica = m.status.map((x, i) => `meta ${i + 1}: ${STATUS_META[x] || x}`).join(' · ');
        return `<td class="col-metas${m.critico ? ' critico' : ''}" title="${esc(dica)}">${m.ok}/${m.total}
          <span class="metas-seg" aria-hidden="true">${m.status.map((x) => `<i class="st-${x}"></i>`).join('')}</span></td>`;
      }
      case 'serie': return `<td class="col-serie">${sparkline(s.area)}</td>`;
      default: return '<td></td>';
    }
  }

  function tabela(el, d, selecionada) {
    const ordem = ordens.get(el) || null;
    const lista = ordenar(d.secretarias, ordem);
    const cab = COLUNAS.map((c) => {
      const ativa = ordem && ordem.col === c.id;
      const seta = ativa ? (ordem.asc ? ' ▲' : ' ▼') : '';
      const extra = c.cidade && d.escopoCidade ? ' <small>(cidade)</small>' : '';
      const cls = [c.cls, c.texto ? 'col-nome' : ''].filter(Boolean).join(' ');
      if (c.semOrdem) return `<th class="${cls}" title="${esc(c.titulo || '')}">${c.rotulo}</th>`;
      return `<th class="${cls}" aria-sort="${ativa ? (ordem.asc ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ordem="${c.id}" title="${esc(c.titulo || 'Ordenar')}">${c.rotulo}${extra}${seta}</button></th>`;
    }).join('');
    const linhas = lista.map((s) => {
      const cls = [
        s.pior && !d.escopoCidade ? 'pior' : '',
        s.noFiltro ? '' : 'fora-filtro',
        selecionada === s.area ? 'selecionada' : '',
        d.escopoCidade && !s.resolvidas && !s.abertas ? 'sem-casos' : '',
      ].filter(Boolean).join(' ');
      return `<tr class="${cls}" data-area="${s.area}" tabindex="0" title="Abrir a página: ${esc(area(s.area).secretaria.nome)}">
        ${COLUNAS.map((c) => celula(s, c, d)).join('')}<td class="col-ir" aria-hidden="true">›</td></tr>`;
    }).join('');
    return `<div class="desemp-tabela-rolagem"><table class="desemp-tabela"><thead><tr>${cab}<th class="col-ir"></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  // semKpis: a visão geral já mostra esses números no painel da secretaria escolhida.
  GC.desenharDesempenho = function (el, d, { aoClicarArea, aoVerResolvida, aoAcaoRuim, selecionada = null, semKpis = false }) {
    const r = d.resumo;
    const meta = (d.secretarias[0] && d.secretarias[0].metaPrazoPct) || 85;
    const acoes = d.ruimAcoes || [];
    const ruim = d.ruim.map((f, i) => {
      const a = acoes[i];
      const dica = a && a.area ? 'Filtrar esta secretaria' : a && a.bairro ? 'Ver este bairro' : '';
      return a ? `<li><button type="button" data-ruim="${i}" title="${dica}">${esc(f)} <span aria-hidden="true">›</span></button></li>` : `<li>${esc(f)}</li>`;
    }).join('');
    el.innerHTML = `
      ${semKpis ? '' : `<div class="desemp-kpis">
        <div><b>${r.resolvidas}</b><small>resolvidas</small>${variacaoTexto(r.resolvidas, r.resolvidasAnt, '%', 'mais')}</div>
        <div><b>${r.noPrazoPct}%</b><small>no prazo${d.escopoCidade ? ' (cidade)' : ''} · meta ${meta}%</small>${variacaoTexto(r.noPrazoPct, r.noPrazoPctAnt, 'p.p.', 'mais')}</div>
        <div><b>${horas(r.tempoMedioH)}</b><small>tempo médio${d.escopoCidade ? ' (cidade)' : ''}</small>${variacaoTexto(r.tempoMedioH, r.tempoMedioHAnt, 'h', 'menos')}</div>
      </div>`}
      <div class="desemp-grade">
        <div class="painel-card desemp-ranking">
          <h3>Ranking das secretarias <small>clique no título da coluna para ordenar · na linha para abrir a página</small></h3>
          ${tabela(el, d, selecionada)}
        </div>
        <div class="desemp-lado">
          ${d.ruim.length ? `<div class="painel-card desemp-ruim"><h3>⚠️ O que está ruim</h3><ul>${ruim}</ul></div>`
            : '<div class="painel-card desemp-ok"><h3>✅ Nada fora da meta</h3><p class="painel-vazio">Sem prazos estourados nem indicadores piorando neste recorte.</p></div>'}
          <div class="painel-card">
            <h3>✅ Resolvidas recentemente</h3>
            ${d.recentes.length ? `<ul class="desemp-recentes">${d.recentes.map((x, i) => `<li><button type="button" data-recente="${i}">
              <b>${esc(x.titulo)}</b><small>${esc(area(x.area).nome)} · ${x.haMin < 1 ? 'agora' : `há ${GC.tempoTexto(x.haMin)}`} · ${x.atrasoMin ? `<span class="abaixo">⏰ ${GC.tempoTexto(x.atrasoMin)} atrasada</span>` : 'no prazo'}</small>
            </button></li>`).join('')}</ul>` : '<p class="painel-vazio">Nada resolvido neste recorte ainda.</p>'}
          </div>
        </div>
      </div>`;
    const abrir = (tr) => aoClicarArea(tr.dataset.area);
    el.querySelectorAll('tr[data-area]').forEach((tr) => {
      tr.onclick = () => abrir(tr);
      tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(tr); } };
    });
    el.querySelectorAll('[data-ordem]').forEach((b) => {
      b.onclick = () => {
        const atual = ordens.get(el);
        const col = b.dataset.ordem;
        // 1º clique: maior primeiro (nome: A→Z); 2º inverte; 3º volta à ordem padrão.
        const inicioAsc = col === 'nome';
        let prox;
        if (!atual || atual.col !== col) prox = { col, asc: inicioAsc };
        else if (atual.asc === inicioAsc) prox = { col, asc: !inicioAsc };
        else prox = null;
        if (prox) ordens.set(el, prox); else ordens.delete(el);
        GC.desenharDesempenho(el, d, { aoClicarArea, aoVerResolvida, aoAcaoRuim, selecionada, semKpis });
        const foco = el.querySelector(`[data-ordem="${col}"]`);
        if (foco) foco.focus();
      };
    });
    el.querySelectorAll('[data-ruim]').forEach((b) => { b.onclick = () => aoAcaoRuim && aoAcaoRuim(acoes[+b.dataset.ruim]); });
    el.querySelectorAll('[data-recente]').forEach((b) => { b.onclick = () => aoVerResolvida(d.recentes[+b.dataset.recente]); });
  };
})(window.GC = window.GC || {});
