(function (GC) {
  // Tela de Relatórios: tipo, alvo e período no topo; o relatório montado como documento;
  // exportação em CSV (sempre) e PDF (jsPDF por CDN; sem internet o botão fica desabilitado).
  // Os números ficam congelados desde a abertura; dados novos só entram pelo botão "Atualizar".
  const esc = (t) => GC.escaparHtml(t);
  const TIPOS = [['executivo', 'Executivo'], ['secretaria', 'Secretaria'], ['bairro', 'Bairro'], ['alertas', 'Alertas']];
  const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['12m', '12 meses']];
  // A fonte padrão do jsPDF (WinAnsi) não tem emoji nem "≈": tira o emoji e troca o ≈ por "~".
  const semEmoji = (t) => String(t).replace(/\p{Extended_Pictographic}️?/gu, '').replace(/≈/g, '~').replace(/\s{2,}/g, ' ').trim();
  const hoje = () => new Date(GC.agora()).toISOString().slice(0, 10);
  const horaDe = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dataHoraDe = (t) => `${new Date(t).toLocaleDateString('pt-BR')} ${horaDe(t)}`;
  // Gestor do setor só vê o relatório da própria pasta: sem abas de outros tipos nem troca de secretaria.
  const pastaTravada = () => (GC.perfil && GC.perfil.id === 'setor' ? GC.perfil.area : null);

  function nomeArquivo(rel, ext) {
    return `relatorio-${rel.tipo}-${rel.alvo}-${rel.codigoPeriodo}-${hoje()}.${ext}`;
  }

  GC.baixarArquivo = baixar;

  // Redesenho ao vivo sem roubar o foco: guarda o elemento focado (por seus data-* e classe)
  // e a rolagem horizontal/vertical das áreas roláveis, e devolve tudo depois de redesenhar.
  GC.redesenharMantendo = function (raiz, rolaveis, redesenhar) {
    const ativo = document.activeElement;
    const dentro = ativo && raiz.contains(ativo) && ativo !== raiz;
    let seletor = null;
    if (dentro) {
      const linha = ativo.closest('[data-id]');
      const attrs = Object.keys(ativo.dataset).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(ativo.dataset[k])}"]`).join('');
      // Todas as classes, menos as de estado, que mudam a cada redesenho.
      const classe = [...ativo.classList].filter((c) => c !== 'ativo' && c !== 'principal').map((c) => `.${CSS.escape(c)}`).join('');
      seletor = `${linha && linha !== ativo ? `[data-id="${CSS.escape(linha.dataset.id)}"] ` : ''}${ativo.tagName.toLowerCase()}${classe}${attrs}`;
    }
    const rolagens = rolaveis.map((s) => { const e = raiz.querySelector(s); return e ? [e.scrollLeft, e.scrollTop] : null; });
    redesenhar();
    rolaveis.forEach((s, i) => {
      const e = raiz.querySelector(s);
      if (e && rolagens[i]) { e.scrollLeft = rolagens[i][0]; e.scrollTop = rolagens[i][1]; }
    });
    if (seletor) {
      const alvo = raiz.querySelector(seletor);
      if (alvo) alvo.focus({ preventScroll: true });
    }
  };
  function baixar(conteudo, nome, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const nomePrefeitura = () => (GC.cidade && GC.cidade.nome ? `Prefeitura Municipal de ${GC.cidade.nome}` : 'Prefeitura Municipal');
  // Iniciais da cidade para o selo do cabeçalho ("Vila Dourada" → "VD"); sem preposições.
  const iniciais = (nome) => String(nome || 'PM').split(/\s+/).filter((p) => !/^(d[aeo]s?|e)$/i.test(p)).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // PDF com jsPDF + autotable. A fonte padrão não desenha emoji: tiramos do texto.
  // Cabeçalho com selo da cidade, rodapé com página "i de n" em todas as páginas, e título de
  // seção nunca sozinho no pé da página.
  function exportarPdf(rel, geradoEm) {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margem = 40;
    const rodape = 36; // espaço reservado ao rodapé
    const altura = doc.internal.pageSize.getHeight();
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const limite = altura - margem - rodape;
    const novaPaginaSe = (precisa) => { if (y + precisa > limite) { doc.addPage(); y = margem; } };
    let y = margem;
    // Selo: quadrado azul com as iniciais da cidade.
    doc.setFillColor(...GC.rgbMarca('navy')).roundedRect(margem, y - 10, 28, 28, 5, 5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...GC.cor.hexRgb(GC.cor.sobre(GC.corMarca('navy')))).text(iniciais(GC.cidade && GC.cidade.nome), margem + 14, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...GC.rgbMarca('navy')).text(nomePrefeitura(), margem + 38, y);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120).text(`Dados simulados para demonstração · dados de ${dataHoraDe(geradoEm)}`, margem + 38, y + 12);
    y += 42;
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20).text(semEmoji(rel.titulo), margem, y);
    y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90).text(`${semEmoji(rel.subtitulo)} · ${rel.periodo.rotulo}`, margem, y);
    const tabelaPdf = (head, body) => {
      doc.autoTable({ startY: y + 14, head: head ? [head.map(semEmoji)] : undefined, body: body.map((l) => l.map(semEmoji)), margin: { left: margem, right: margem, top: margem, bottom: margem + rodape }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: GC.rgbMarca('navy') } });
      y = doc.lastAutoTable.finalY;
    };
    const ind = GC.tabelaIndicadores(rel);
    tabelaPdf(ind.colunas, ind.linhas);
    y += 20;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(30);
    (rel.topicos || [rel.resumo]).forEach((t) => {
      doc.splitTextToSize(`• ${semEmoji(t)}`, largura - 8).forEach((linha, i) => { novaPaginaSe(12); doc.text(linha, margem + (i ? 8 : 0), y); y += 12; });
      y += 2;
    });
    rel.secoes.forEach((s) => {
      // Título + umas 3 linhas da tabela precisam caber juntos; senão a seção começa na página seguinte.
      novaPaginaSe(16 + 70);
      y += 16;
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...GC.rgbMarca('navy')).text(semEmoji(s.titulo), margem, y);
      if (s.vazio) { y += 14; doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(s.vazio, margem, y); return; }
      if (s.tipo === 'tabela') tabelaPdf(s.colunas, s.linhas);
      else if (s.tipo === 'lista') tabelaPdf(null, s.itens.map((t, i) => [`${i + 1}. ${t}`]));
      else tabelaPdf(null, s.itens.map((b) => [b.rotulo, b.texto]));
    });
    y += 20;
    const fontes = doc.splitTextToSize(`Fontes: ${rel.fontes.map(GC.nomeFonte || ((f) => f)).join(', ')}`, largura);
    novaPaginaSe(fontes.length * 10);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110).text(fontes, margem, y);
    // Rodapé em todas as páginas.
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(220).setLineWidth(0.5).line(margem, altura - margem - 12, margem + largura, altura - margem - 12);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(130);
      doc.text(`${nomePrefeitura()} · ${semEmoji(rel.titulo)} · dados de ${dataHoraDe(geradoEm)}`, margem, altura - margem);
      doc.text(`Página ${i} de ${total}`, margem + largura, altura - margem, { align: 'right' });
    }
    doc.save(nomeArquivo(rel, 'pdf'));
  }

  function secao(s) {
    let corpo;
    if (s.vazio) corpo = `<p class="painel-vazio">${esc(s.vazio)}</p>`;
    else if (s.tipo === 'tabela') {
      corpo = `<div class="rel-tabela-wrap"><table class="sec-tabela"><thead><tr>${s.colunas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${s.linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else if (s.tipo === 'lista') {
      corpo = `<ol class="rel-lista">${s.itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
    } else {
      corpo = `<ul class="rel-barras">${s.itens.map((b) => `<li><span>${esc(b.rotulo)}</span><div class="rel-barra"><i style="width:${Math.max(0, Math.min(100, b.valor))}%"></i></div><small>${esc(b.texto)}</small></li>`).join('')}</ul>`;
    }
    return `<section class="rel-secao"><h3>${esc(s.titulo)}</h3>${corpo}</section>`;
  }

  // Linha de lista ou barra: com link vira botão (abre a ocorrência ou a secretaria), sem link é uma div.
  const LINK_DICA = { ocorrencia: 'Abrir a ocorrência', secretaria: 'Abrir a página da secretaria' };
  function linha(classe, item, miolo) {
    if (!item.link) return `<div class="${classe}">${miolo}</div>`;
    return `<button type="button" class="${classe} rel-clicavel" data-link-tipo="${esc(item.link.tipo)}" data-link-id="${esc(item.link.id)}" title="${LINK_DICA[item.link.tipo] || 'Abrir'}">${miolo}<span class="rel-seta" aria-hidden="true">›</span></button>`;
  }

  // Lista da esquerda (ações, metas, ocorrências, regras), com etiqueta colorida do número.
  function lista(l) {
    if (l.vazio) return `<p class="painel-vazio">${esc(l.vazio)}</p>`;
    return `<ol class="rel-acoes">${l.itens.map((i, n) => `<li>${linha('rel-acao', i, `<span class="rel-n">${n + 1}</span><span class="rel-acao-texto"${i.dica ? ` title="${esc(i.dica)}"` : ''}>${esc(i.texto)}${i.progresso !== undefined ? `<span class="rel-progresso"><i style="width:${i.progresso}%"></i></span>` : ''}</span>${i.etiqueta ? `<span class="rel-etq ${i.tom ? `t-${i.tom}` : ''}">${esc(i.etiqueta)}</span>` : ''}`)}</li>`).join('')}</ol>`;
  }

  // Barras da direita. Meta: marcador verde em todas as barras, com o rótulo "meta" só na primeira.
  // Marca: traço escuro de referência da própria barra (ex.: média por bairro). "Contexto": fora do período, esmaecida.
  function barrasHtml(d) {
    if (d.vazio) return `<p class="painel-vazio">${esc(d.vazio)}</p>`;
    const meta = (i) => (d.meta !== undefined ? `<span class="rel-meta${i === 0 ? ' com-rotulo' : ''}" style="left:${d.meta}%"></span>` : '');
    return `<ul class="rel-bars${d.meta !== undefined ? ' tem-meta' : ''}">${d.barras.map((b, i) => `<li${b.contexto ? ' class="contexto"' : ''}>${linha('rel-bars-linha', b, `<span class="rel-bars-rotulo"${b.dica ? ` title="${esc(b.dica)}"` : ''}>${esc(b.rotulo)}</span>
      <span class="rel-bars-trilho"><i class="${b.tom === 'ruim' ? 'ruim' : ''}" style="width:${b.valor}%"></i>${meta(i)}${b.marca !== undefined ? `<span class="rel-marca" style="left:${b.marca}%" title="média por bairro"></span>` : ''}</span>
      <b class="${b.tom === 'ruim' ? 'ruim' : ''}">${esc(b.texto)}</b>${b.etiqueta ? `<span class="rel-etq t-${b.etiquetaTom || ''}"${b.dica ? ` title="${esc(b.dica)}"` : ''}>${esc(b.etiqueta)}</span>` : ''}`)}</li>`).join('')}</ul>
      ${d.legenda ? `<p class="rel-legenda">${esc(d.legenda)}</p>` : ''}`;
  }

  // Números do resumo em negrito (valores, %, p.p., R$, horas): o olho acha o dado sem ler a frase toda.
  const NUMERO = /(?:≈ )?(?:R\$ )?\d[\d.,]*(?:\s?(?:%|p\.p\.|mi\b|h\b|min\b))?/g;
  const comNumeros = (t) => {
    let html = '';
    let ultimo = 0;
    String(t).replace(NUMERO, (m, pos) => { html += `${esc(t.slice(ultimo, pos))}<b>${esc(m)}</b>`; ultimo = pos + m.length; return m; });
    return html + esc(t.slice(ultimo));
  };

  // Cartão de número: valor, tendência (cor própria) e detalhe (cor da meta), em linhas separadas.
  const numero = (k) => `<div class="rel-numero"><small>${esc(k.rotulo)}</small><b>${esc(k.valor)}</b>`
    + `${k.tendencia ? `<span class="rel-tend ${k.tendencia.tom || ''}">${esc(k.tendencia.texto)}</span>` : ''}`
    + `${k.detalhe ? `<span class="${k.tom || ''}">${esc(k.detalhe)}</span>` : ''}</div>`;

  GC.criarTelaRelatorios = function (el, { aoMudar, aoAbrir }) {
    let rota = null;
    let rel = null;
    let geradoEm = 0; // hora dos dados que estão na tela (e no CSV/PDF)
    let chaveDesenhada = ''; // o relatório na tela, para não redesenhar à toa
    let pendente = null; // dados novos que chegaram depois de o relatório abrir (a tela não muda sozinha)
    let detalhesAbertos = false; // tabelas completas recolhidas: a tela mostra o painel; o resto está no PDF/CSV
    el.innerHTML = `
      <div class="rel-topo">
        <span class="rel-seg rel-tipos" role="tablist" aria-label="Tipo de relatório"></span>
        <span class="rel-alvo"></span>
        <span class="rel-periodo">Período <select aria-label="Período"></select><b class="rel-periodo-fixo" hidden>Últimos 30 dias</b><span class="rel-meses" hidden>de <select class="rel-mes-de" aria-label="Primeiro mês"></select> até <select class="rel-mes-ate" aria-label="Último mês"></select></span></span>
        <span class="rel-exportar"><span class="rel-aviso" aria-live="polite"><button type="button" class="rel-novos" hidden><span aria-hidden="true">●</span> Dados novos · Atualizar</button></span><button type="button" class="btn-sec rel-csv"><span aria-hidden="true">⬇</span> CSV</button><button type="button" class="btn-primario rel-pdf"><span aria-hidden="true">⬇</span> PDF</button></span>
      </div>
      <div class="rel-conteudo" id="rel-painel"></div>`;
    const tipos = el.querySelector('.rel-tipos');
    const periodo = el.querySelector('.rel-periodo select');
    const alvo = el.querySelector('.rel-alvo');
    const conteudo = el.querySelector('.rel-conteudo');
    const btnPdf = el.querySelector('.rel-pdf');
    const periodoFixo = el.querySelector('.rel-periodo-fixo');
    const meses = el.querySelector('.rel-meses');
    const mesDe = el.querySelector('.rel-mes-de');
    const mesAte = el.querySelector('.rel-mes-ate');
    const opcoesMes = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${GC.rotuloMesSerie ? GC.rotuloMesSerie(i) : i}</option>`).join('');
    mesDe.innerHTML = opcoesMes;
    mesAte.innerHTML = opcoesMes;
    // Intervalo de meses: a ordem é corrigida (de > até troca), e o código vai para a rota (#/.../m3-8).
    const irMeses = () => {
      const a = Number(mesDe.value);
      const b = Number(mesAte.value);
      ir({ periodo: `m${Math.min(a, b)}-${Math.max(a, b)}` });
    };
    mesDe.onchange = irMeses;
    mesAte.onchange = irMeses;
    const btnNovos = el.querySelector('.rel-novos');
    btnNovos.onclick = () => {
      if (!pendente) return;
      const novo = pendente;
      pendente = null;
      btnNovos.hidden = true;
      aplicar(novo);
      const wraps = [...conteudo.querySelectorAll('.rel-tabela-wrap')].map((w) => w.scrollLeft);
      desenhar();
      conteudo.querySelectorAll('.rel-tabela-wrap').forEach((w, i) => { if (wraps[i]) w.scrollLeft = wraps[i]; });
    };
    // Itens com link (ocorrência, secretaria) abrem o destino.
    conteudo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-link-tipo]');
      if (b && aoAbrir) aoAbrir({ tipo: b.dataset.linkTipo, id: b.dataset.linkId });
    });

    const travada = pastaTravada();
    tipos.innerHTML = travada ? '' : TIPOS.map(([id, nome]) => `<button type="button" role="tab" id="rel-aba-${id}" aria-controls="rel-painel" tabindex="-1" data-tipo="${id}">${nome}</button>`).join('');
    tipos.hidden = !!travada;
    if (!travada) conteudo.setAttribute('role', 'tabpanel');
    // Abas no padrão WAI-ARIA: só a ativa entra no Tab; setas, Home e End trocam de aba.
    tipos.addEventListener('keydown', (e) => {
      const abas = [...tipos.querySelectorAll('[role="tab"]')];
      const i = abas.indexOf(document.activeElement);
      if (i < 0) return;
      const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      const aba = abas[(destino + abas.length) % abas.length];
      aba.focus();
      aba.click();
    });
    const ir = (mudanca) => {
      const nova = Object.assign({}, rota, mudanca);
      nova.periodo = GC.periodoDoRelatorio ? GC.periodoDoRelatorio(nova.tipo, nova.periodo) : nova.periodo;
      aoMudar(nova);
    };
    tipos.querySelectorAll('[data-tipo]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.tipo;
        const primeiro = { secretaria: GC.data.areas[0].id, bairro: GC.data.bairros[0].id }[t] || '-';
        ir({ tipo: t, alvo: t === rota.tipo ? rota.alvo : primeiro });
      };
    });
    // "Escolher meses…" começa nos últimos 6 meses da série.
    periodo.onchange = () => ir({ periodo: periodo.value === 'meses' ? 'm6-11' : periodo.value });
    el.querySelector('.rel-csv').onclick = () => { if (rel) baixar(GC.relatorioCsv(rel), nomeArquivo(rel, 'csv'), 'text/csv;charset=utf-8'); };
    btnPdf.onclick = () => { if (rel && window.jspdf) exportarPdf(rel, geradoEm); };

    function barra() {
      tipos.querySelectorAll('[data-tipo]').forEach((b) => {
        b.classList.toggle('ativo', b.dataset.tipo === rota.tipo);
        b.setAttribute('aria-selected', String(b.dataset.tipo === rota.tipo));
        b.tabIndex = b.dataset.tipo === rota.tipo ? 0 : -1;
      });
      if (!travada) conteudo.setAttribute('aria-labelledby', `rel-aba-${rota.tipo}`);
      // Só os períodos que mudam este relatório; com um só (bairro), mostra o texto no lugar do select.
      const validos = GC.periodosDoRelatorio ? GC.periodosDoRelatorio(rota.tipo) : PERIODOS.map(([id]) => id);
      const aceitaMeses = !!(GC.aceitaMesesNoRelatorio && GC.aceitaMesesNoRelatorio(rota.tipo));
      const intervalo = /^m\d/.test(rota.periodo) && GC.periodoInfo ? GC.periodoInfo(rota.periodo) : null;
      periodo.innerHTML = PERIODOS.filter(([id]) => validos.includes(id)).map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')
        + (aceitaMeses ? '<option value="meses">Escolher meses…</option>' : '');
      periodo.value = intervalo ? 'meses' : rota.periodo;
      meses.hidden = !intervalo;
      if (intervalo) { mesDe.value = String(intervalo.de); mesAte.value = String(intervalo.ate); }
      periodo.hidden = validos.length < 2 && !aceitaMeses;
      periodoFixo.hidden = !periodo.hidden;
      periodoFixo.title = rota.tipo === 'bairro' ? 'Os dados por bairro existem só para os últimos 30 dias' : '';
      const opcoes = travada ? null : { secretaria: GC.data.areas.map((a) => [a.id, a.secretaria.nome]), bairro: GC.data.bairros.map((b) => [b.id, b.nome]) }[rota.tipo];
      alvo.innerHTML = opcoes ? `<select aria-label="${rota.tipo === 'bairro' ? 'Bairro' : 'Secretaria'}">${opcoes.map(([id, nome]) => `<option value="${id}"${id === rota.alvo ? ' selected' : ''}>${esc(nome)}</option>`).join('')}</select>` : '';
      const select = alvo.querySelector('select');
      if (select) select.onchange = () => ir({ alvo: select.value });
      const temPdf = !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable);
      btnPdf.disabled = !temPdf;
      btnPdf.title = temPdf ? 'Baixar em PDF (relatório completo)' : 'Exportar PDF precisa de internet';
    }

    function desenhar() {
      const p = rel.painel;
      // Nos detalhes da tela, só os indicadores que os cartões não mostram e sem as seções que repetem o painel.
      const ind = GC.tabelaIndicadores(rel);
      const indTela = Object.assign({}, ind, { titulo: 'Outros indicadores', linhas: ind.linhas.filter((_, i) => !rel.kpis[i].noCartao) });
      const secoesTela = [...(indTela.linhas.length ? [indTela] : []), ...rel.secoes.filter((s) => !s.soDocumento)];
      conteudo.innerHTML = `
        <header class="rel-cabecalho"><h2>${esc(rel.titulo)}</h2><p>${esc(rel.periodo.rotulo)} · ${esc(rel.subtitulo)} · <span class="rel-hora" title="Retrato dos dados neste horário: a tela não muda sozinha, e CSV e PDF saem com estes números">dados de ${esc(horaDe(geradoEm))}</span></p></header>
        <ul class="rel-resumo">${(rel.topicos || [rel.resumo]).map((t) => `<li>${comNumeros(t)}</li>`).join('')}</ul>
        <div class="rel-numeros">${p.kpis.map(numero).join('')}</div>
        <div class="rel-colunas">
          <section class="rel-cartao"><h3>${esc(p.esquerda.titulo)}</h3>${lista(p.esquerda)}</section>
          <section class="rel-cartao"><h3>${esc(p.direita.titulo)}${p.direita.nota ? ` <small>— ${esc(p.direita.nota)}</small>` : ''}</h3>${barrasHtml(p.direita)}</section>
        </div>
        <details class="rel-detalhes"${detalhesAbertos ? ' open' : ''}>
          <summary><span aria-hidden="true">📋</span> Ver dados detalhados <small>tabelas completas, as mesmas do PDF e do CSV</small></summary>
          <div class="rel-doc">${secoesTela.map(secao).join('')}<footer class="rel-fontes"><span aria-hidden="true">📚</span> Fontes: ${rel.fontes.map((f) => `<span title="${esc(f)}">${esc(GC.nomeFonte ? GC.nomeFonte(f) : f)}</span>`).join(' · ')}</footer></div>
        </details>`;
      conteudo.querySelector('.rel-detalhes').addEventListener('toggle', (e) => { detalhesAbertos = e.target.open; });
    }

    const chaveDe = (r) => JSON.stringify(r);
    function aplicar(novoRel) {
      rel = novoRel;
      chaveDesenhada = chaveDe(novoRel);
      geradoEm = GC.agora();
    }

    function mostrar(novaRota, novoRel) {
      rota = novaRota;
      pendente = null;
      btnNovos.hidden = true;
      aplicar(novoRel);
      barra();
      desenhar();
    }

    // Relatório é um retrato: a cidade segue mudando, mas a tela não se redesenha sozinha (número
    // que muda enquanto se lê, ou entre a tela e o PDF, tira a confiança). Só avisa que há dados novos.
    // O aviso só aparece depois de 1 minuto do retrato: a cidade muda a cada poucos segundos, e um
    // aviso sempre aceso deixa de ser notado.
    const IDADE_AVISO_MS = 60 * 1000;
    function atualizar(novoRel) {
      const igual = chaveDe(novoRel) === chaveDesenhada;
      pendente = igual ? null : novoRel;
      const mostrar = !igual && GC.agora() - geradoEm >= IDADE_AVISO_MS;
      btnNovos.hidden = !mostrar;
      btnNovos.title = mostrar ? `Os números mudaram desde ${horaDe(geradoEm)}. Clique para trazer os dados de agora.` : '';
    }

    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
