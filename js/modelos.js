(function (GC) {
  // Modelos de documentos que a assistente gera a partir de um pedido em linguagem natural
  // ("gere o briefing de visita ao Centro", "planilha Excel das ocorrências", "slides para o secretariado").
  // Cada modelo tem: quando(pedido) → é este?; params(pedido) → bairro, secretaria, período…; montar(params) → os
  // DADOS (sempre da base, os mesmos das telas); saida(dados) → texto do chat + prévia + arquivos para baixar.
  // O layout de cada formato é fixo (nada é desenhado do zero a cada pedido); muda o conteúdo e a marca.
  const norm = (t) => ` ${String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()} `;
  const D = () => GC.data;
  const st = () => GC.storeAtual;
  const area = (id) => D().areas.find((a) => a.id === id);
  const bairroDe = (id) => D().bairros.find((b) => b.id === id);
  const num = (n, c = 0) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: c });
  const hoje = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const soma = (a) => a.reduce((s, n) => s + n, 0);
  const cidade = () => (GC.cidade ? GC.cidade.nome : 'Vila Dourada');
  const pad = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---- leitura do pedido ----
  const AREAS_CHAVES = { saude: 'saude|ubs|hospital|leito|vacina|dengue', infraestrutura: 'obra|infraestrutura|energia|ilumina', educacao: 'escola|educa|aluno|professor|creche',
    defesa_civil: 'defesa civil|alaga|chuva|desliza', seguranca: 'seguranca|crime|b\\.o|policia|guarda', mobilidade: 'mobilidade|transito|onibus|transporte', limpeza: 'coleta|lixo|limpeza' };
  function acharBairro(q) {
    return D().bairros.slice().sort((a, b) => b.nome.length - a.nome.length).find((b) => q.includes(norm(b.nome).trim())) || null;
  }
  const acharArea = (q) => Object.keys(AREAS_CHAVES).find((a) => new RegExp(AREAS_CHAVES[a]).test(q)) || null;
  const acharMeses = (q, padrao) => (/12 meses|\bano\b|anual/.test(q) ? 12 : /6 meses|semestre/.test(q) ? 6 : /3 meses|trimestre/.test(q) ? 3 : padrao);
  const acharPeriodo = (q) => (/12 meses|\bano\b|anual/.test(q) ? '12m' : /90 dias|trimestre|3 meses/.test(q) ? '90' : /7 dias|semana/.test(q) ? '7' : '30');
  // Bairro mais pesado agora (crítica 3, alta 2, média 1): padrão quando o pedido não diz qual.
  function piorBairro() {
    const P = { critica: 3, alta: 2, media: 1 }; const pts = {};
    st().ocorrencias().forEach((o) => { pts[o.bairroId] = (pts[o.bairroId] || 0) + (P[o.severidade] || 1); });
    const id = Object.keys(pts).sort((a, b) => pts[b] - pts[a])[0];
    return bairroDe(id) || D().bairros[0];
  }

  // ---- arquivos ----
  const scripts = {};
  const carregarScript = (url) => scripts[url] || (scripts[url] = new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => { delete scripts[url]; erro(new Error(`Não carregou ${url}`)); }; document.head.appendChild(s);
  }));
  const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const csvDe = (linhas) => '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blobTexto = (t, tipo) => new Blob([t], { type: tipo });
  // PDF (jsPDF + autotable, já carregados pelo painel). Fontes padrão do PDF: sem emoji nem setas.
  const limpo = (s) => String(s == null ? '' : s).replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\u0000-\u00ff]/g, '').replace(/\s{2,}/g, ' ').trim();
  function novoPdf(orientacao = 'portrait') {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'pt', format: 'a4', orientation: orientacao });
  }
  function cabecalho(doc, titulo, subtitulo) {
    const L = doc.internal.pageSize.getWidth();
    doc.setFillColor(...GC.rgbMarca('navy')).rect(0, 0, L, 74, 'F');
    doc.setFillColor(...GC.rgbMarca('ouro')).rect(0, 74, L, 4, 'F');
    const sobre = GC.cor.hexRgb(GC.cor.sobre(GC.corMarca('navy')));
    doc.setTextColor(...sobre).setFont('helvetica', 'normal').setFontSize(9).text(limpo(`Prefeitura de ${cidade()} · ${GC.produto ? GC.produto() : ''}`), 36, 26);
    doc.setFont('helvetica', 'bold').setFontSize(17).text(limpo(titulo), 36, 48);
    doc.setFont('helvetica', 'normal').setFontSize(9.5).text(limpo(subtitulo), 36, 64);
    return 100;
  }
  function rodape(doc, fontes) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const L = doc.internal.pageSize.getWidth(); const A = doc.internal.pageSize.getHeight();
      doc.setTextColor(120).setFont('helvetica', 'normal').setFontSize(7.5)
        .text(limpo(`Fontes: ${fontes} · Gerado em ${hoje()} · Dados de demonstração`), 36, A - 18, { maxWidth: L - 110 })
        .text(`${i}/${n}`, L - 36, A - 18, { align: 'right' });
    }
  }
  function secao(doc, y, titulo) {
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50; }
    doc.setTextColor(...GC.cor.hexRgb(GC.cor.escurecerAte(GC.corMarca('navy'), 4.5))).setFont('helvetica', 'bold').setFontSize(11.5).text(limpo(titulo), 36, y);
    return y + 8;
  }
  function tabela(doc, y, cabeca, corpo, extra = {}) {
    doc.autoTable(Object.assign({
      startY: y, head: [cabeca.map(limpo)], body: corpo.map((l) => l.map(limpo)), margin: { left: 36, right: 36 },
      styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: GC.rgbMarca('navy'), textColor: GC.cor.hexRgb(GC.cor.sobre(GC.corMarca('navy'))) },
      alternateRowStyles: { fillColor: GC.cor.hexRgb(GC.cor.misturar(GC.corMarca('navy'), '#ffffff', 0.05)) },
    }, extra));
    return doc.lastAutoTable.finalY + 18;
  }
  function paragrafos(doc, y, linhas, { tam = 9.5, recuo = 36 } = {}) {
    const L = doc.internal.pageSize.getWidth();
    doc.setTextColor(40).setFont('helvetica', 'normal').setFontSize(tam);
    linhas.forEach((t) => {
      const ls = doc.splitTextToSize(limpo(t), L - recuo - 36);
      if (y + ls.length * tam * 1.35 > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 50; }
      doc.text(ls, recuo, y); y += ls.length * tam * 1.35 + 4;
    });
    return y + 6;
  }
  function caixas(doc, y, itens) {
    const L = doc.internal.pageSize.getWidth(); const g = 10; const w = (L - 72 - g * (itens.length - 1)) / itens.length;
    itens.forEach(([valor, rotulo], i) => {
      const x = 36 + i * (w + g);
      doc.setDrawColor(220).setFillColor(248, 250, 252).roundedRect(x, y, w, 52, 6, 6, 'FD');
      doc.setTextColor(...GC.cor.hexRgb(GC.cor.escurecerAte(GC.corMarca('navy'), 4.5))).setFont('helvetica', 'bold').setFontSize(16).text(limpo(valor), x + 10, y + 24);
      doc.setTextColor(90).setFont('helvetica', 'normal').setFontSize(8).text(doc.splitTextToSize(limpo(rotulo), w - 20), x + 10, y + 38);
    });
    return y + 70;
  }
  const pdfBlob = (doc) => doc.output('blob');
  // Gráfico em SVG com a marca (vira PNG): linha ou barras.
  function svgGrafico({ titulo, subtitulo, rotulos, valores, unidade, tipo, fonte }) {
    const W = 1200; const H = 675; const m = GC.coresMarca(); const tinta = GC.cor.escurecerAte(m.primaria, 4.5);
    const vs = valores.map((v) => (v == null ? 0 : v));
    const max = Math.max(...vs) * 1.15 || 1; const x0 = 90; const x1 = W - 60; const y0 = 560; const y1 = 190;
    const passo = (x1 - x0) / vs.length; const y = (v) => y0 - (v / max) * (y0 - y1);
    const fmt = (v) => `${num(v, unidade === '%' || unidade === 'min' ? 1 : 0)}${unidade === '%' ? '%' : unidade ? ` ${unidade}` : ''}`;
    const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const corpo = tipo === 'barra'
      ? vs.map((v, i) => `<rect x="${x0 + i * passo + passo * 0.18}" y="${y(v)}" width="${passo * 0.64}" height="${y0 - y(v)}" rx="8" fill="${i === vs.length - 1 ? m.destaque : GC.cor.misturar(m.primaria, '#ffffff', 0.55)}"/><text x="${x0 + i * passo + passo / 2}" y="${y(v) - 12}" font-size="22" font-weight="700" fill="${tinta}" text-anchor="middle">${e(fmt(v))}</text>`).join('')
      : `<polyline points="${vs.map((v, i) => `${x0 + i * passo + passo / 2},${y(v)}`).join(' ')}" fill="none" stroke="${m.primaria}" stroke-width="6" stroke-linejoin="round"/>${vs.map((v, i) => `<circle cx="${x0 + i * passo + passo / 2}" cy="${y(v)}" r="9" fill="${i === vs.length - 1 ? m.destaque : '#fff'}" stroke="${m.primaria}" stroke-width="4"/>${vs.length <= 12 ? `<text x="${x0 + i * passo + passo / 2}" y="${y(v) - 20}" font-size="20" font-weight="700" fill="${tinta}" text-anchor="middle">${e(fmt(v))}</text>` : ''}`).join('')}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Arial, sans-serif">
      <rect width="${W}" height="${H}" fill="#ffffff"/><rect width="${W}" height="10" fill="${m.destaque}"/>
      <text x="60" y="80" font-size="22" font-weight="600" fill="${tinta}" fill-opacity="0.7">Prefeitura de ${e(cidade())}</text>
      <text x="60" y="124" font-size="40" font-weight="800" fill="${tinta}">${e(titulo)}</text>
      <text x="60" y="160" font-size="22" fill="#475569">${e(subtitulo)}</text>
      <line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="#cbd5e1" stroke-width="2"/>
      ${corpo}
      ${rotulos.map((r, i) => `<text x="${x0 + i * passo + passo / 2}" y="${y0 + 34}" font-size="${rotulos.length > 8 ? 18 : 22}" fill="#475569" text-anchor="middle">${e(r)}</text>`).join('')}
      <text x="60" y="${H - 26}" font-size="18" fill="#64748b">Fonte: ${e(fonte)} · dados de demonstração</text>
    </svg>`;
  }
  const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  function pngDe(svg, W, H) {
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H); cv.toBlob(ok, 'image/png'); };
      img.onerror = erro; img.src = svgUrl(svg);
    });
  }

  // ---- os modelos ----
  const MODELOS = [
    {
      id: 'briefing', nome: 'Briefing de visita ao bairro', formato: 'PDF de 1 página', icone: '📍',
      descricao: 'O que está aberto, obras, serviços, satisfação e o que já foi resolvido no bairro.',
      exemplo: 'Gere o briefing de visita ao bairro Centro',
      quando: (q) => /briefing|visita ao bairro|vou (ao|a|no) bairro/.test(q),
      params: (q) => ({ bairro: (acharBairro(q) || piorBairro()).id }),
      montar({ bairro }) {
        const b = bairroDe(bairro); const s = st();
        const abertas = s.ocorrencias(null, b.id).slice().sort((x, y) => ({ critica: 0, alta: 1, media: 2 }[x.severidade] - { critica: 0, alta: 1, media: 2 }[y.severidade]));
        const obras = GC.obras ? GC.obras.resumo().obras.filter((o) => o.bairroId === b.id) : [];
        const risco = GC.risco ? GC.risco.resumo(D().ocorrencias).areas.filter((a) => a.bairroId === b.id && a.nivel !== 'baixo') : [];
        const sat = D().satisfacaoPorBairro[b.id]; const satCidade = D().indicadoresBase.satisfacaoPct;
        const bo = (D().seguranca.porBairro30d || {})[b.id] || 0;
        const casos = soma(D().areas.map((a) => ((D().historico30d[a.id] || {})[b.id] || 0)));
        const escolas = ((D().educacao || {}).escolas || []).filter((e) => e.bairroId === b.id);
        const saude = (D().leitos.unidades || []).filter((u) => u.bairroId === b.id).map((u) => u.nome).concat((D().series.lotacaoUbs || []).filter((u) => u.bairroId === b.id).map((u) => `${u.nome} (${u.pct}% de lotação)`));
        const coleta = ((D().coleta || {}).rotas || []).filter((r) => r.bairros.includes(b.id)).map((r) => `${r.nome}: ${r.dias.map((d) => D().coleta.nomeDia[d]).join(', ')}`);
        const entregas = (D().conquistas || []).filter((q) => q.bairroId === b.id).map((q) => q.titulo);
        const resolvidas = (D().resolvidasRecentes || []).filter((r) => r.bairroId === b.id).map((r) => r.titulo);
        const atencao = [];
        if (sat != null && sat < satCidade) atencao.push(`Satisfação de ${sat}%, abaixo da média da cidade (${satCidade}%).`);
        abertas.filter((o) => o.severidade === 'critica').forEach((o) => atencao.push(`Crítica em aberto: ${o.titulo}.`));
        obras.filter((o) => o.atrasada).forEach((o) => atencao.push(`Obra atrasada: ${o.nome} (${o.diasAtraso} dias).`));
        risco.forEach((a) => atencao.push(`Área de risco ${a.nivel}: ${a.nome} (${a.familias} famílias).`));
        if (!atencao.length) atencao.push('Nenhum ponto crítico agora: boa ocasião para anunciar entregas e ouvir os moradores.');
        return { b, abertas, obras, risco, sat, satCidade, bo, casos, escolas, saude, coleta, entregas, resolvidas, atencao };
      },
      saida(d) {
        const criticas = d.abertas.filter((o) => o.severidade === 'critica').length;
        return {
          texto: `Briefing de visita ao bairro ${d.b.nome}: ${d.abertas.length} ocorrências abertas (${criticas} críticas), satisfação de ${d.sat ?? '—'}% e ${d.obras.length} obra(s) no bairro. Pontos para a conversa: ${d.atencao.slice(0, 2).join(' ')}`,
          arquivos: [{ rotulo: '⬇ Baixar briefing (PDF)', nome: `briefing-${pad(d.b.nome)}.pdf`, criar: () => {
            const doc = novoPdf();
            let y = cabecalho(doc, `Briefing de visita · ${d.b.nome}`, `${num(d.b.populacao)} moradores · ${hoje()}`);
            y = caixas(doc, y, [[`${d.abertas.length}`, `ocorrências abertas (${criticas} críticas)`], [`${d.sat ?? '—'}%`, `satisfação (cidade ${d.satCidade}%)`], [num(d.bo), 'B.O.s em 30 dias'], [num(d.casos), 'casos registrados em 30 dias']]);
            y = secao(doc, y, 'Pontos de atenção para a conversa'); y = paragrafos(doc, y + 8, d.atencao.slice(0, 5).map((t) => `- ${t}`));
            y = secao(doc, y, 'Em aberto agora'); y = d.abertas.length ? tabela(doc, y, ['Ocorrência', 'Gravidade', 'Secretaria'], d.abertas.slice(0, 6).map((o) => [o.titulo, o.severidade === 'critica' ? 'crítica' : o.severidade === 'media' ? 'média' : 'alta', area(o.area).secretaria.nome])) : paragrafos(doc, y + 8, ['Nenhuma ocorrência aberta.']);
            if (d.obras.length) { y = secao(doc, y, 'Obras no bairro'); y = tabela(doc, y, ['Obra', 'Avanço', 'Situação'], d.obras.slice(0, 4).map((o) => [o.nome, `${o.avancoPct}%`, o.atrasada ? `atrasada ${o.diasAtraso} dias` : o.situacao === 'concluida' ? 'concluída' : 'em dia'])); }
            y = secao(doc, y, 'Serviços e entregas'); y = paragrafos(doc, y + 8, [
              `Saúde: ${d.saude.join('; ') || 'atendido por unidades de bairros vizinhos'}.`, `Escolas: ${d.escolas.map((e) => `${e.nome} (${num(e.alunos)} alunos)`).join('; ') || 'nenhuma escola municipal no bairro'}.`,
              `Coleta de lixo: ${d.coleta.join('; ') || 'rota de bairro vizinho'}.`, `Entregas e resolvidas recentes: ${[...d.entregas, ...d.resolvidas].join('; ') || 'nenhuma no período'}.`]);
            rodape(doc, 'ocorrências, obras, leitos, educação, coleta, segurança, pesquisa de satisfação');
            return pdfBlob(doc);
          } }],
        };
      },
    },
    {
      id: 'prestacao', nome: 'Prestação de contas', formato: 'PDF ou Word', icone: '🏛',
      descricao: 'Resultados do período por secretaria, orçamento e o que ficou pendente, para a Câmara ou a imprensa.',
      exemplo: 'Gere a prestação de contas dos últimos 90 dias em Word',
      quando: (q) => /presta(c|ç)(a|ã)o de contas|camara municipal|para a camara|para a imprensa|balanco/.test(q),
      params: (q) => ({ periodo: acharPeriodo(q), word: /\bword\b|docx|\.doc\b/.test(q) }),
      montar: ({ periodo }) => ({ rel: GC.montarRelatorio(st(), { tipo: 'executivo', alvo: '-', periodo }), periodo }),
      saida({ rel }, p) {
        const titulo = `Prestação de contas · ${rel.periodo.rotulo}`;
        const secoes = rel.secoes.filter((s) => s.tipo === 'tabela' || s.tipo === 'lista');
        const pdf = { rotulo: '⬇ Baixar PDF', nome: `prestacao-de-contas-${p.periodo}.pdf`, criar: () => {
          const doc = novoPdf();
          let y = cabecalho(doc, titulo, `${cidade()} · ${rel.subtitulo}`);
          y = caixas(doc, y, rel.kpis.filter((k) => k.noCartao).slice(0, 4).map((k) => [k.valor, k.rotulo]));
          y = secao(doc, y, 'Resumo'); y = paragrafos(doc, y + 8, rel.topicos.map((t) => `- ${t}`));
          secoes.forEach((s) => { y = secao(doc, y, s.titulo); y = s.tipo === 'tabela' && s.linhas.length ? tabela(doc, y, s.colunas, s.linhas) : paragrafos(doc, y + 8, (s.itens || []).map((i) => `- ${i.texto || i}`).concat(s.linhas && !s.linhas.length ? ['Nada no período.'] : [])); });
          rodape(doc, rel.fontes.join(', '));
          return pdfBlob(doc);
        } };
        const word = { rotulo: '⬇ Baixar Word', nome: `prestacao-de-contas-${p.periodo}.doc`, criar: () => {
          const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
          const cor = GC.corMarca('navy');
          const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${e(titulo)}</title>
            <style>body{font-family:Calibri,Arial;font-size:11pt}h1{color:${cor};font-size:20pt}h2{color:${cor};font-size:13pt;border-bottom:1px solid ${cor}}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px;font-size:9.5pt}th{background:${cor};color:#fff}</style></head><body>
            <p>Prefeitura de ${e(cidade())}</p><h1>${e(titulo)}</h1><p>${e(rel.subtitulo)} · gerado em ${e(hoje())}</p>
            <h2>Números do período</h2><table><tr>${rel.kpis.map((k) => `<th>${e(k.rotulo)}</th>`).join('')}</tr><tr>${rel.kpis.map((k) => `<td>${e(k.valor)}</td>`).join('')}</tr></table>
            <h2>Resumo</h2><ul>${rel.topicos.map((t) => `<li>${e(t)}</li>`).join('')}</ul>
            ${secoes.map((s) => `<h2>${e(s.titulo)}</h2>${s.tipo === 'tabela' ? `<table><tr>${s.colunas.map((c) => `<th>${e(c)}</th>`).join('')}</tr>${s.linhas.map((l) => `<tr>${l.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</table>` : `<ul>${(s.itens || []).map((i) => `<li>${e(i.texto || i)}</li>`).join('')}</ul>`}`).join('')}
            <p style="color:#777;font-size:8pt">Fontes: ${e(rel.fontes.join(', '))}. Dados de demonstração.</p></body></html>`;
          return blobTexto('\ufeff' + html, 'application/msword');
        } };
        return { texto: `Prestação de contas (${rel.periodo.rotulo}): ${rel.topicos.slice(0, 2).join(' ')}`, arquivos: p.word ? [word, pdf] : [pdf, word] };
      },
    },
    {
      id: 'card', nome: 'Card para redes sociais', formato: 'PNG', icone: '🖼',
      descricao: 'Imagem 1080 × 1080 com um número de destaque, um aviso ou uma entrega, na identidade da prefeitura.',
      exemplo: 'Faça um card para as redes sobre a coleta de lixo',
      quando: (q) => /\b(card|post|postagem|arte|banner)\b|imagem para (as )?redes|instagram/.test(q),
      params(q) {
        const modelo = /chuva|aviso|alerta|alaga|desliza|risco/.test(q) ? 'aviso' : /entreg|inaugur|conclu|conquista/.test(q) ? 'entrega' : /evolu|grafico|meses|historico/.test(q) ? 'evolucao' : 'numero';
        return { modelo, alvo: modelo === 'numero' || modelo === 'evolucao' ? acharArea(q) : null };
      },
      montar: ({ modelo, alvo }) => GC.gerarImagem(modelo, alvo, { store: st() }),
      saida(g) {
        return {
          texto: `Card "${g.modelo.nome}" pronto, com os números da base e a marca da prefeitura. Para ajustar o assunto, use o editor do Estúdio.`,
          previa: { tipo: 'imagem', src: svgUrl(g.svg), alt: g.modelo.nome },
          arquivos: [{ rotulo: '⬇ Baixar PNG', nome: `card-${g.modelo.id}.png`, criar: () => pngDe(g.svg, 1080, 1080) }],
          acoes: [{ rotulo: '🖼 Abrir no editor', tipo: 'abrirTela', payload: { rota: { tela: 'estudio', modelo: g.modelo.id } } }],
        };
      },
    },
    {
      id: 'grafico', nome: 'Gráfico sob medida', formato: 'PNG e CSV', icone: '📈',
      descricao: 'O indicador, o período, a região e o tipo de gráfico que você pedir.',
      exemplo: 'Faça um gráfico de barras dos casos de dengue nos últimos 6 meses',
      quando: (q) => /grafico|chart/.test(q),
      params(q) {
        const p = GC.cruzamento ? GC.cruzamento.interpretar(q) : { a: 'ocupacao', recorte: 'cidade' };
        return { ind: p.a, meses: acharMeses(q, 12), tipo: /barra|coluna/.test(q) ? 'barra' : 'linha', recorte: p.recorte };
      },
      montar({ ind, meses, tipo, recorte }) {
        const i = GC.cruzamento.indicador(ind);
        const serie = GC.cruzamento.serie(ind, recorte).slice(-meses);
        const rotulos = D().cruzamento.meses.slice(-meses);
        const onde = recorte === 'cidade' ? cidade() : GC.cruzamento.regiao(recorte).nome;
        return { i, serie, rotulos, tipo, onde, meses };
      },
      saida(d) {
        const svg = svgGrafico({ titulo: d.i.nome, subtitulo: `${d.onde} · últimos ${d.meses} meses (${d.i.unidade})`, rotulos: d.rotulos, valores: d.serie, unidade: d.i.unidade, tipo: d.tipo, fonte: d.i.fonte });
        return {
          texto: `${d.i.nome} em ${d.onde}, últimos ${d.meses} meses: de ${GC.cruzamento.formatar(d.i, d.serie[0])} (${d.rotulos[0]}) para ${GC.cruzamento.formatar(d.i, d.serie[d.serie.length - 1])} (${d.rotulos[d.rotulos.length - 1]}).`,
          previa: { tipo: 'imagem', src: svgUrl(svg), alt: d.i.nome },
          arquivos: [
            { rotulo: '⬇ Baixar PNG', nome: `grafico-${d.i.id}-${d.meses}m.png`, criar: () => pngDe(svg, 1200, 675) },
            { rotulo: '⬇ Baixar CSV', nome: `grafico-${d.i.id}-${d.meses}m.csv`, criar: () => blobTexto(csvDe([['Mês', `${d.i.nome} (${d.i.unidade})`], ...d.rotulos.map((m, k) => [m, d.serie[k]])]), 'text/csv;charset=utf-8') },
          ],
        };
      },
    },
    {
      id: 'apresentacao', nome: 'Apresentação rápida', formato: 'PDF (5 slides)', icone: '🎞',
      descricao: 'Capa, números do mês, decisões pendentes, secretarias e próximos passos.',
      exemplo: 'Monte uma apresentação de 5 slides para a reunião do secretariado',
      quando: (q) => /apresenta(c|ç)(a|ã)o|\bslides?\b/.test(q),
      params: () => ({}),
      montar() {
        const s = st();
        return { pulsos: s.pulsos(), atencao: s.atencao().todas.slice(0, 6), desemp: s.desempenho(null), kpis: s.kpis(),
          recs: (GC.recomendacoes ? GC.recomendacoes(s) : []).slice(0, 5).map((r) => r.texto || r) };
      },
      saida(d) {
        return {
          texto: `Apresentação de 5 slides: capa, números do mês (${d.pulsos.length} secretarias), ${d.atencao.length} decisões pendentes, desempenho das secretarias e ${d.recs.length} próximos passos.`,
          arquivos: [{ rotulo: '⬇ Baixar apresentação (PDF)', nome: 'apresentacao-secretariado.pdf', criar: () => {
            const doc = novoPdf('landscape'); const L = doc.internal.pageSize.getWidth(); const A = doc.internal.pageSize.getHeight();
            const sobre = GC.cor.hexRgb(GC.cor.sobre(GC.corMarca('navy')));
            // 1 capa
            doc.setFillColor(...GC.rgbMarca('navy')).rect(0, 0, L, A, 'F'); doc.setFillColor(...GC.rgbMarca('ouro')).rect(0, A - 14, L, 14, 'F');
            doc.setTextColor(...sobre).setFont('helvetica', 'normal').setFontSize(16).text(limpo(`Prefeitura de ${cidade()}`), 60, 200);
            doc.setFont('helvetica', 'bold').setFontSize(40).text('Reunião do secretariado', 60, 250);
            doc.setFont('helvetica', 'normal').setFontSize(16).text(limpo(hoje()), 60, 285);
            // 2 números
            doc.addPage(); let y = cabecalho(doc, 'Números do mês', 'Pulso das secretarias');
            y = caixas(doc, y + 10, d.pulsos.slice(0, 4).map((p) => [p.nivel, `${p.rotulo} · ${p.variacao} ${p.periodo}`]));
            caixas(doc, y, d.pulsos.slice(4, 8).map((p) => [p.nivel, `${p.rotulo} · ${p.variacao} ${p.periodo}`]));
            // 3 decisões
            doc.addPage(); y = cabecalho(doc, 'Pede decisão', `${d.kpis.criticas} críticas abertas · ${d.kpis.estouradas} com prazo estourado`);
            tabela(doc, y, ['Ocorrência', 'Bairro', 'Secretaria', 'Motivo'], d.atencao.map((o) => [o.titulo, (bairroDe(o.bairroId) || {}).nome, area(o.area).secretaria.nome, GC.motivosAtencao ? GC.motivosAtencao(o).map((m) => m.texto).join(', ') : '']));
            // 4 secretarias
            doc.addPage(); y = cabecalho(doc, 'Secretarias', `No prazo nos últimos 30 dias · meta 85%`);
            d.desemp.secretarias.slice().sort((a, b) => a.noPrazoPct - b.noPrazoPct).forEach((s, i) => {
              const yy = y + 10 + i * 42; const larg = (L - 300) * (s.noPrazoPct / 100);
              doc.setTextColor(40).setFont('helvetica', 'bold').setFontSize(12).text(limpo(area(s.area).secretaria.nome), 60, yy + 16);
              doc.setFillColor(...(s.noPrazoPct < 85 ? [220, 38, 38] : GC.rgbMarca('navy'))).roundedRect(260, yy + 4, larg, 18, 4, 4, 'F');
              doc.setTextColor(40).setFont('helvetica', 'normal').text(`${s.noPrazoPct}%`, 268 + larg, yy + 18);
            });
            // 5 próximos passos
            doc.addPage(); y = cabecalho(doc, 'Próximos passos', 'Recomendações a partir dos dados');
            paragrafos(doc, y + 10, d.recs.map((t, i) => `${i + 1}. ${t}`), { tam: 14 });
            rodape(doc, 'ocorrências, desempenho das secretarias, indicadores');
            return pdfBlob(doc);
          } }],
        };
      },
    },
    {
      id: 'pauta', nome: 'Pauta do secretariado', formato: 'PDF', icone: '🗂',
      descricao: 'O que está fora da meta, cobranças vencidas e alertas, com responsável e prazo.',
      exemplo: 'Prepare a pauta da reunião do secretariado',
      quando: (q) => /\bpauta\b|reuniao do secretariado|reuniao de secretarios/.test(q),
      params: () => ({}),
      montar() {
        const s = st();
        const lista = GC.avaliarIndicadores ? GC.avaliarIndicadores(GC.contextoIndicadores(s)) : [];
        const fora = lista.filter((i) => i.situacao === 'fora' || i.situacao === 'critico' || i.situacao === 'ruim');
        const prazo = new Date(Date.now() + 7 * 864e5).toLocaleDateString('pt-BR');
        const resp = (a) => (area(a) && GC.prazoCobranca ? GC.prazoCobranca(a).contato : '') || (area(a) ? area(a).secretaria.nome : 'Gabinete do Prefeito');
        const metas = fora.map((i) => [area(i.area) ? area(i.area).secretaria.nome : i.area, i.nome, `${num(i.valorAtual, 1)} (meta ${num(i.metaAtual, 1)})`, resp(i.area), prazo]);
        const cobr = GC.cobrancas ? GC.cobrancas((id) => s.buscar(id)).filter((c) => c.situacao === 'vencida') : [];
        const alertas = s.atencao().todas.filter((o) => o.severidade === 'critica').slice(0, 6).map((o) => [o.titulo, area(o.area).secretaria.nome, resp(o.area)]);
        return { metas, cobr, alertas, prazo };
      },
      saida(d) {
        return {
          texto: `Pauta pronta: ${d.metas.length} indicadores fora da meta, ${d.alertas.length} alertas críticos e ${d.cobr.length} cobranças vencidas, cada item com responsável e prazo até ${d.prazo}.`,
          arquivos: [{ rotulo: '⬇ Baixar pauta (PDF)', nome: 'pauta-secretariado.pdf', criar: () => {
            const doc = novoPdf();
            let y = cabecalho(doc, 'Pauta da reunião do secretariado', `${cidade()} · ${hoje()}`);
            y = secao(doc, y, '1. Indicadores fora da meta'); y = d.metas.length ? tabela(doc, y, ['Secretaria', 'Indicador', 'Agora', 'Responsável', 'Prazo'], d.metas) : paragrafos(doc, y + 8, ['Nenhum indicador fora da meta.']);
            y = secao(doc, y, '2. Alertas críticos'); y = d.alertas.length ? tabela(doc, y, ['Ocorrência', 'Secretaria', 'Responsável'], d.alertas) : paragrafos(doc, y + 8, ['Nenhum alerta crítico.']);
            y = secao(doc, y, '3. Cobranças sem resposta no prazo'); y = d.cobr.length ? tabela(doc, y, ['Cobrança', 'Responsável', 'Venceu em'], d.cobr.map((c) => [c.detalhe, c.contato || '', new Date(c.ate).toLocaleString('pt-BR')])) : paragrafos(doc, y + 8, ['Nenhuma cobrança vencida.']);
            y = secao(doc, y, '4. Compromissos desta reunião'); paragrafos(doc, y + 8, ['Responsável · o que entrega · até quando (preencher na reunião)', '_____________________________________________', '_____________________________________________']);
            rodape(doc, 'catálogo de indicadores, alertas, registro de cobranças');
            return pdfBlob(doc);
          } }],
        };
      },
    },
    {
      id: 'audio', nome: 'Resumo em áudio', formato: 'Áudio no navegador', icone: '🔊',
      descricao: 'O resumo da semana lido em voz alta, para ouvir no carro.',
      exemplo: 'Leia o resumo da semana em voz alta',
      quando: (q) => /\baudio\b|em voz alta|para ouvir|podcast|leia (o|a|pra|para)/.test(q),
      params: () => ({}),
      montar() {
        const s = st(); const k = s.kpis(); const ps = s.pulsos();
        const bons = ps.filter((p) => p.positivo).slice(0, 3); const ruins = ps.filter((p) => !p.positivo).slice(0, 3);
        const ent = (D().conquistas || []).slice(0, 2);
        const fala = (v) => String(v).replace('%', ' por cento').replace('p.p.', 'pontos').replace('-', 'menos ').replace('+', 'mais ');
        const texto = [`Resumo da semana de ${cidade()}.`,
          `Há ${k.criticas} ocorrências críticas abertas e ${k.estouradas} com prazo estourado.`,
          bons.length ? `Melhoraram: ${bons.map((p) => `${p.rotulo}, ${fala(p.variacao)}`).join('; ')}.` : '',
          ruins.length ? `Pedem atenção: ${ruins.map((p) => `${p.rotulo}, ${fala(p.variacao)}`).join('; ')}.` : '',
          ent.length ? `Entregas recentes: ${ent.map((q) => q.titulo).join(' e ')}.` : '',
          `${s.desempenho(null).resumo.noPrazoPct} por cento das ocorrências foram resolvidas no prazo nos últimos 30 dias. Fim do resumo.`].filter(Boolean).join(' ');
        return { texto };
      },
      saida(d) {
        return {
          texto: 'Resumo da semana pronto para ouvir. Toque em ▶ Ouvir (a voz é a do próprio aparelho, em português).',
          previa: { tipo: 'audio', texto: d.texto },
          arquivos: [{ rotulo: '⬇ Baixar roteiro (.txt)', nome: 'resumo-da-semana.txt', criar: () => blobTexto(d.texto, 'text/plain;charset=utf-8') }],
        };
      },
    },
    {
      id: 'faq', nome: 'Perguntas frequentes', formato: 'Texto', icone: '❓',
      descricao: 'Respostas para o portal do cidadão, a partir dos dados do bairro.',
      exemplo: 'Gere as perguntas frequentes para os moradores do bairro Vila Nova',
      quando: (q) => /perguntas frequentes|\bfaq\b|duvidas (dos|de) moradores/.test(q),
      params: (q) => ({ bairro: (acharBairro(q) || {}).id || null }),
      montar({ bairro }) {
        const c = GC.conteudoCidadao ? GC.conteudoCidadao({ ocorrencias: st().ocorrencias(), comunicados: [], bairro }) : { todasFaq: [] };
        return { faq: (c.todasFaq || c.faq || []).slice(0, 10), bairro: bairro ? bairroDe(bairro).nome : null };
      },
      saida(d) {
        const txt = d.faq.map((f, i) => `${i + 1}. ${f.pergunta}\n${f.resposta}`).join('\n\n');
        return {
          texto: `${d.faq.length} perguntas frequentes${d.bairro ? ` para os moradores do bairro ${d.bairro}` : ''}, com respostas montadas a partir dos dados de hoje.`,
          previa: { tipo: 'texto', texto: txt },
          arquivos: [{ rotulo: '⬇ Baixar texto', nome: `perguntas-frequentes${d.bairro ? `-${pad(d.bairro)}` : ''}.txt`, criar: () => blobTexto(txt, 'text/plain;charset=utf-8') }],
        };
      },
    },
    {
      id: 'excel', nome: 'Planilha Excel', formato: 'Excel (.xlsx)', icone: '📊',
      descricao: 'As tabelas da base: ocorrências, secretarias, indicadores de 12 meses, bairros e cruzamento.',
      exemplo: 'Gere uma planilha Excel com as ocorrências abertas e os indicadores',
      quando: (q) => /excel|planilha|xlsx/.test(q),
      params: (q) => ({ foco: /ocorrencia|alerta/.test(q) ? 'Ocorrências' : /secretaria|orcamento/.test(q) ? 'Secretarias' : /bairro/.test(q) ? 'Bairros' : /indicador|serie|meses/.test(q) ? 'Indicadores 12 meses' : /cruza|chuva|regiao/.test(q) ? 'Cruzamento' : null }),
      montar({ foco }) {
        const s = st(); const meses = D().mesesSerie;
        const abas = {
          Ocorrências: [['Ocorrência', 'Bairro', 'Secretaria', 'Gravidade', 'Situação', 'Aberta há (h)', 'Pessoas afetadas', 'Fonte'],
            ...s.ocorrencias().map((o) => [o.titulo, (bairroDe(o.bairroId) || {}).nome, area(o.area).secretaria.nome, o.severidade, o.status, Math.round((o.abertaHaMin || 0) / 6) / 10, o.afetados, o.fonte])],
          Secretarias: [['Secretaria', 'Orçamento (R$ mi)', 'Executado (%)', 'Resolvidas 30 dias', 'No prazo (%)', 'Tempo médio (h)', 'Indicador do Pulso', 'Valor', 'Variação'],
            ...s.desempenho(null).secretarias.map((x) => { const sec = D().secretarias[x.area]; const p = s.pulsos().find((y) => y.area === x.area) || {};
              return [area(x.area).secretaria.nome, sec.orcamento.dotacaoMi, sec.orcamento.executadoPct, x.resolvidas, x.noPrazoPct, x.tempoMedioH, p.rotulo, p.nivel, p.variacao]; })],
          'Indicadores 12 meses': [['Secretaria', 'Indicador', 'Unidade', ...meses, 'Meta'],
            ...D().areas.map((a) => { const sr = D().secretarias[a.id].serie; return [a.secretaria.nome, sr.rotulo, sr.unidade, ...sr.meses, sr.meta]; })],
          Bairros: [['Bairro', 'População', 'Satisfação (%)', 'Ocorrências abertas', 'B.O.s 30 dias', 'Casos 30 dias'],
            ...D().bairros.map((b) => [b.nome, b.populacao, D().satisfacaoPorBairro[b.id], s.ocorrencias(null, b.id).length, (D().seguranca.porBairro30d || {})[b.id] || 0, soma(D().areas.map((a) => ((D().historico30d[a.id] || {})[b.id] || 0)))])],
        };
        if (D().cruzamento) abas.Cruzamento = [['Indicador', 'Unidade', ...D().cruzamento.meses], ...D().cruzamento.indicadores.map((i) => [i.nome, i.unidade, ...D().cruzamento.cidade[i.id]])];
        const ordem = foco ? [foco, ...Object.keys(abas).filter((k) => k !== foco)] : Object.keys(abas);
        return { abas, ordem, foco };
      },
      saida(d) {
        return {
          texto: `Planilha com ${d.ordem.length} abas (${d.ordem.join(', ')}), com os mesmos números das telas${d.foco ? `; a primeira é ${d.foco}` : ''}.`,
          arquivos: [{ rotulo: '⬇ Baixar Excel', nome: `${pad(cidade())}-${d.foco ? pad(d.foco) : 'base'}.xlsx`, criar: async () => {
            await carregarScript(SHEETJS);
            const X = window.XLSX; const wb = X.utils.book_new();
            X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Base de dados', `${cidade()} · ${GC.produto ? GC.produto() : ''}`], ['Gerado em', hoje()], ['Observação', 'Dados de demonstração (cidade fictícia).']]), 'Leia-me');
            d.ordem.forEach((nome) => {
              const ws = X.utils.aoa_to_sheet(d.abas[nome]);
              ws['!cols'] = d.abas[nome][0].map((c, j) => ({ wch: Math.min(48, Math.max(10, ...d.abas[nome].map((l) => String(l[j] == null ? '' : l[j]).length))) }));
              X.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
            });
            return new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          } }],
        };
      },
    },
  ];

  const identificar = (texto) => { const q = norm(texto); return MODELOS.find((m) => m.quando(q)) || null; };
  // Resposta completa para o chat. Também atende "quais modelos você gera?".
  function responder(texto) {
    const q = norm(texto);
    if (/quais (sao os )?modelos|o que voce (gera|faz)|lista de modelos|modelos disponiveis/.test(q)) {
      return {
        cenario: 'modelos',
        texto: `Gero ${MODELOS.length} tipos de material a partir dos dados: ${MODELOS.map((m) => `${m.nome} (${m.formato})`).join('; ')}. Peça com suas palavras, por exemplo: "${MODELOS[0].exemplo}".`,
        acoes: MODELOS.slice(0, 4).map((m) => ({ rotulo: `${m.icone} ${m.nome}`, tipo: 'perguntar', payload: { texto: m.exemplo } })),
      };
    }
    const m = identificar(texto);
    if (!m) return null;
    const p = m.params(q);
    return Object.assign({ cenario: `modelo_${m.id}`, modelo: m.id }, m.saida(m.montar(p), p));
  }
  GC.modelos = { lista: MODELOS, identificar, responder, _norm: norm };
})(window.GC = window.GC || {});
