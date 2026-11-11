(function (GC) {
  // Tela "Cruzamento de dados" (#/cruzamento/<a>/<b>/<meses>/<recorte>): dois indicadores, mês a mês e por região.
  // O mesmo motor (js/cruzamento.js) responde ao agente de IA; a tela é o caminho manual.
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Gráfico de dois eixos: A em linha (eixo da esquerda), B em barras (eixo da direita).
  function grafico(res) {
    const W = 720; const H = 260; const ML = 52; const MR = 52; const MT = 16; const MB = 34;
    const n = res.rotulos.length;
    const larg = (W - ML - MR) / n;
    const escala = (vals, i, doZero) => {
      const v = vals.filter((x) => x != null);
      let lo = Math.min(...v); let hi = Math.max(...v);
      if (lo === hi) { lo -= 1; hi += 1; }
      const folga = (hi - lo) * 0.15;
      lo = doZero ? 0 : Math.max(i.unidade === '%' ? 0 : lo - folga < 0 ? 0 : -Infinity, lo - folga);
      hi += folga;
      return { lo, hi, y: (x) => MT + (H - MT - MB) * (1 - (x - lo) / (hi - lo)) };
    };
    const ea = escala(res.serieA, res.a, false);
    const eb = escala(res.serieB, res.b, true);
    // Eixos só com o número (a unidade está na legenda): rótulo curto não corta na borda.
    const fmtEixo = (i, v) => `${Math.round(v).toLocaleString('pt-BR')}${i.unidade === '%' ? '%' : ''}`;
    const ticks = (e) => [0, 1, 2, 3].map((k) => e.lo + ((e.hi - e.lo) * k) / 3);
    const barras = res.serieB.map((v, k) => (v == null ? '' : `<rect class="cz-barra" x="${ML + k * larg + larg * 0.22}" y="${eb.y(v)}" width="${larg * 0.56}" height="${Math.max(0, H - MB - eb.y(v))}" rx="3"><title>${esc(res.rotulos[k])}: ${esc(GC.cruzamento.formatar(res.b, v))}</title></rect>`)).join('');
    const pts = res.serieA.map((v, k) => (v == null ? null : [ML + k * larg + larg / 2, ea.y(v), v, k])).filter(Boolean);
    const linha = pts.length > 1 ? `<polyline class="cz-linha" points="${pts.map((p) => `${p[0]},${p[1]}`).join(' ')}"/>` : '';
    const marcas = pts.map((p) => `<circle class="cz-ponto" cx="${p[0]}" cy="${p[1]}" r="4.5"><title>${esc(res.rotulos[p[3]])}: ${esc(GC.cruzamento.formatar(res.a, p[2]))}</title></circle>`).join('');
    const eixoA = ticks(ea).map((t) => `<text class="cz-eixo a" x="${ML - 8}" y="${ea.y(t) + 4}" text-anchor="end">${esc(fmtEixo(res.a, t))}</text><line class="cz-grade" x1="${ML}" x2="${W - MR}" y1="${ea.y(t)}" y2="${ea.y(t)}"/>`).join('');
    const eixoB = ticks(eb).map((t) => `<text class="cz-eixo b" x="${W - MR + 8}" y="${eb.y(t) + 4}">${esc(fmtEixo(res.b, t))}</text>`).join('');
    const meses = res.rotulos.map((m, k) => `<text class="cz-mes" x="${ML + k * larg + larg / 2}" y="${H - 12}" text-anchor="middle">${esc(m)}</text>`).join('');
    return `<svg class="cz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(res.a.nome)} (linha) e ${esc(res.b.nome)} (barras) por mês">${eixoA}${barras}${linha}${marcas}${eixoB}${meses}</svg>`;
  }

  GC.criarTelaCruzamento = function (el, { aoIr, aoPerguntar }) {
    let rota = null;
    let res = null;

    function ir(mudanca) { aoIr(Object.assign({}, rota, mudanca, { tela: 'cruzamento' })); }

    function baixarCsv() {
      const linhas = [['Mês', `${res.a.nome} (${res.a.unidade})`, `${res.b.nome} (${res.b.unidade})`], ...GC.cruzamento.linhas(res)];
      linhas.push([], ['Região', res.a.nome, res.b.nome], ...res.porRegiao.map((r) => [r.nome, r.a == null ? '' : r.a, r.b == null ? '' : r.b]));
      const csv = '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `cruzamento-${res.a.id}-${res.b.id}-${res.meses}m-${res.recorte}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function desenhar() {
      const lista = GC.cruzamento.indicadores();
      const opc = (sel) => lista.map((i) => `<option value="${i.id}"${i.id === sel ? ' selected' : ''}>${esc(i.nome)}</option>`).join('');
      const regs = GC.data.cruzamento.regioes;
      const max = (k) => Math.max(...res.porRegiao.map((r) => r[k] || 0)) || 1;
      const nivel = res.forca.nivel;
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🔀 Cruzamento de dados</h2><p>Escolha dois indicadores e veja como andam juntos, mês a mês e por região.</p></div>
          <span class="sec-acoes"><button type="button" class="btn-sec" data-cz="csv">⬇ Baixar CSV</button>
          <button type="button" class="btn-sec principal" data-cz="perguntar"><i class="ic-copiloto ic-ia" aria-hidden="true"></i> Pedir análise à ${esc(GC.agente())}</button></span></header>
        <div class="cz-controles rel-cartao">
          <label>Indicador 1 (linha)<select data-cz="a">${opc(res.a.id)}</select></label>
          <span class="cz-x" aria-hidden="true">×</span>
          <label>Indicador 2 (barras)<select data-cz="b">${opc(res.b.id)}</select></label>
          <label>Período<span class="cz-segmentos">${[3, 6, 12].map((m) => `<button type="button" data-cz-meses="${m}" class="${m === res.meses ? 'ativo' : ''}">${m} meses</button>`).join('')}</span></label>
          <label>Recorte<select data-cz="recorte"><option value="cidade">Cidade inteira</option>${regs.map((r) => `<option value="${r.id}"${r.id === res.recorte ? ' selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
        </div>
        <div class="cz-prontos" aria-label="Cruzamentos prontos">${GC.cruzamento.prontos().map((p) => `<button type="button" data-cz-pronto="${p.a}|${p.b}" class="${p.a === res.a.id && p.b === res.b.id ? 'ativo' : ''}">${esc(p.rotulo)}</button>`).join('')}</div>
        <div class="alr-kpis cz-kpis">
          <div class="cz-kpi forca-${nivel}"><b>${res.r == null ? '—' : String(res.r).replace('.', ',')}</b><span>relação ${esc(res.forca.rotulo)}</span></div>
          <div class="cz-kpi"><b>${esc(GC.cruzamento.formatar(res.a, res.totalA))}</b><span>${esc(res.a.nome)} · ${res.a.agregacao === 'soma' ? 'total' : 'média'} em ${res.meses} meses</span></div>
          <div class="cz-kpi"><b>${esc(GC.cruzamento.formatar(res.b, res.totalB))}</b><span>${esc(res.b.nome)} · ${res.b.agregacao === 'soma' ? 'total' : 'média'} em ${res.meses} meses</span></div>
          <div class="cz-kpi"><b>${esc(res.recorteNome)}</b><span>recorte · ${regs.length} regiões na cidade</span></div>
        </div>
        <div class="cz-grade-principal">
          <section class="rel-cartao cz-grafico">
            <h3>Mês a mês <small>${esc(res.recorteNome)}</small></h3>
            <p class="cz-legenda"><span class="cz-leg-a"></span>${esc(res.a.nome)} (${esc(res.a.unidade)}, eixo da esquerda) <span class="cz-leg-b"></span>${esc(res.b.nome)} (${esc(res.b.unidade)}, eixo da direita)</p>
            ${grafico(res)}
          </section>
          <section class="rel-cartao cz-leitura">
            <h3>O que os números dizem</h3>
            <ul>${res.leitura.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
            <p class="cz-fontes">Fontes: ${esc(res.fontes.join(' · '))}. Base: ${esc(res.base)}.</p>
          </section>
        </div>
        <section class="rel-cartao cz-regioes">
          <h3>Por região <small>${res.a.agregacao === 'soma' ? 'total' : 'média'} / ${res.b.agregacao === 'soma' ? 'total' : 'média'} no período · clique para ver só a região</small></h3>
          <table><thead><tr><th>Região</th><th>${esc(res.a.nome)}</th><th>${esc(res.b.nome)}</th></tr></thead><tbody>
            ${res.porRegiao.map((r) => `<tr data-cz-regiao="${r.id}" class="${r.id === res.recorte ? 'ativo' : ''}"><td>${esc(r.nome)}</td>
              <td>${r.a == null ? '<span class="cz-sem">sem dado</span>' : `<i class="cz-mini a" style="--v:${Math.round((r.a / max('a')) * 100)}%"></i>${esc(GC.cruzamento.formatar(res.a, r.a))}`}</td>
              <td>${r.b == null ? '<span class="cz-sem">sem dado</span>' : `<i class="cz-mini b" style="--v:${Math.round((r.b / max('b')) * 100)}%"></i>${esc(GC.cruzamento.formatar(res.b, r.b))}`}</td></tr>`).join('')}
          </tbody></table>
        </section>`;

      el.querySelector('[data-cz="a"]').onchange = (e) => ir({ a: e.target.value });
      el.querySelector('[data-cz="b"]').onchange = (e) => ir({ b: e.target.value });
      el.querySelector('[data-cz="recorte"]').onchange = (e) => ir({ recorte: e.target.value });
      el.querySelectorAll('[data-cz-meses]').forEach((b) => { b.onclick = () => ir({ meses: Number(b.dataset.czMeses) }); });
      el.querySelectorAll('[data-cz-pronto]').forEach((b) => { b.onclick = () => { const [a, bb] = b.dataset.czPronto.split('|'); ir({ a, b: bb }); }; });
      el.querySelectorAll('[data-cz-regiao]').forEach((tr) => { tr.onclick = () => ir({ recorte: tr.dataset.czRegiao === res.recorte ? 'cidade' : tr.dataset.czRegiao }); });
      el.querySelector('[data-cz="csv"]').onclick = baixarCsv;
      el.querySelector('[data-cz="perguntar"]').onclick = () => aoPerguntar(`Cruze ${res.a.nome.toLowerCase()} com ${res.b.nome.toLowerCase()} nos últimos ${res.meses} meses${res.recorte === 'cidade' ? ' por região' : ` na ${res.recorteNome}`}`);
    }

    return {
      mostrar(r) {
        const ok = new Set(GC.cruzamento.indicadores().map((i) => i.id));
        const padrao = GC.cruzamento.prontos()[0] || { a: [...ok][0], b: 'chuva' };
        const a = ok.has(r.a) ? r.a : padrao.a;
        let b = ok.has(r.b) ? r.b : padrao.b;
        if (b === a) b = [...ok].find((x) => x !== a);
        rota = { tela: 'cruzamento', a, b, meses: [3, 6, 12].includes(Number(r.meses)) ? Number(r.meses) : 3, recorte: r.recorte || 'cidade' };
        res = GC.cruzamento.cruzar(rota.a, rota.b, rota);
        desenhar();
      },
    };
  };
})(window.GC = window.GC || {});
