(function (GC) {
  const TIPO_CHART = { barra: 'bar', linha: 'line', pizza: 'doughnut' };
  const PALETA = [GC.corMarca('navy'), GC.corMarca('ia'), '#0369a1', '#15803d', '#d97706', '#dc2626', '#64748b', '#0d9488'];
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  function renderGrafico(container, g) {
    if (typeof Chart === 'undefined') {
      const ul = document.createElement('ul');
      ul.className = 'grafico-texto';
      const esc = GC.escaparHtml;
      ul.innerHTML = `<li><strong>${esc(g.titulo)}</strong></li>` + g.rotulos.map((r, i) => `<li>${esc(r)}: ${esc(g.series[0].valores[i])}${g.unidade === '%' ? '%' : ''}</li>`).join('');
      container.appendChild(ul);
      return;
    }
    const box = document.createElement('div');
    box.className = 'grafico';
    const titulo = criar('div', 'grafico-titulo', g.titulo);
    box.appendChild(titulo);
    const area = criar('div', 'grafico-area');
    const canvas = document.createElement('canvas');
    area.appendChild(canvas);
    box.appendChild(area);
    container.appendChild(box);
    const pizza = g.tipo === 'pizza';
    const multi = g.series.length > 1;
    const varCss = (n, padrao) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || padrao;
    const corLinha = (i) => [varCss('--ia', '#6d28d9'), varCss('--navy', '#1e3a5f'), '#d97706'][i % 3];
    // Barras sempre deitadas: na gaveta de 420 px o nome fica inteiro à esquerda e o valor na ponta da barra.
    const deitado = g.tipo === 'barra';
    const sufixo = g.unidade === '%' ? '%' : '';
    if (deitado) area.style.height = `${Math.max(120, g.rotulos.length * (multi ? 34 : 26) + (multi ? 34 : 12))}px`;
    else area.style.height = pizza ? '200px' : '170px';
    const corta = (t) => (String(t).length > 22 ? `${String(t).slice(0, 21)}…` : t);
    // Valor escrito na ponta de cada barra (sem plugin externo).
    const valoresNaPonta = {
      id: 'valoresNaPonta',
      afterDatasetsDraw(chart) {
        if (!deitado) return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, i) => {
          chart.getDatasetMeta(i).data.forEach((barra, j) => {
            ctx.fillText(`${num(ds.data[j])}${sufixo}`, barra.x + 5, barra.y);
          });
        });
        ctx.restore();
      },
    };
    const destaque = (s, i) => {
      if (multi) return i === 0 ? GC.corMarca('ia') : GC.cor.misturar(GC.corMarca('ia'), '#ffffff', 0.4);
      const max = Math.max(...s.valores);
      return s.valores.map((v) => (v === max ? GC.corMarca('ia') : GC.cor.misturar(GC.corMarca('navy'), '#ffffff', 0.4)));
    };
    new Chart(canvas, {
      type: TIPO_CHART[g.tipo],
      data: {
        labels: g.rotulos,
        datasets: g.series.map((s, i) => ({
          label: s.nome,
          data: s.valores,
          backgroundColor: pizza ? PALETA : g.tipo === 'linha' ? (i ? 'transparent' : `${GC.corMarca('ia')}1a`) : destaque(s, i),
          borderColor: g.tipo === 'linha' ? corLinha(i) : undefined, // 2ª série em outra cor (cruzamento)
          borderRadius: deitado ? 4 : 0,
          barThickness: deitado ? (multi ? 11 : 16) : undefined,
          fill: g.tipo === 'linha',
          tension: 0.35,
          pointRadius: g.tipo === 'linha' ? 3 : undefined,
        })),
      },
      plugins: [valoresNaPonta],
      options: {
        indexAxis: deitado ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        layout: { padding: { right: deitado ? 40 : 4 } },
        plugins: {
          legend: { display: pizza || multi, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
          title: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}${g.unidade === '%' ? '%' : ` ${g.unidade || ''}`}` } },
        },
        scales: pizza ? {} : deitado ? {
          x: { display: false, beginAtZero: true, grace: '8%' },
          y: { ticks: { font: { size: 12 }, color: '#334155', callback(v) { return corta(this.getLabelForValue(v)); } }, grid: { display: false }, border: { display: false } },
        } : {
          x: { ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, grid: { display: false } },
          y: { ticks: { font: { size: 11 }, maxTicksLimit: 4 }, grid: { color: GC.cor.misturar(GC.corMarca('navy'), '#ffffff', 0.08) }, border: { display: false } },
        },
      },
    });
  }

  const NIVEL = { alta: 'alta', media: 'média', baixa: 'baixa' };
  const criar = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };

  const num = (n) => Number(n).toLocaleString('pt-BR');
  const semEmoji = (t) => String(t ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s{2,}/g, ' ').trim();

  // Resposta do Copiloto em PDF (jsPDF por CDN): pergunta, resposta, gráfico, base consultada, fontes e consulta.
  GC.exportarRespostaPdf = function ({ pergunta, resposta, canvas }) {
    if (!window.jspdf || !window.jspdf.jsPDF) return false;
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margem = 40;
    const largura = doc.internal.pageSize.getWidth() - margem * 2;
    const alturaPag = doc.internal.pageSize.getHeight();
    let y = margem;
    const bloco = (texto, { tam = 10, negrito = false, cor = 30, depois = 6, fonte = 'helvetica' } = {}) => {
      const linhas = doc.splitTextToSize(semEmoji(texto), largura);
      doc.setFont(fonte, negrito ? 'bold' : 'normal').setFontSize(tam).setTextColor(...(Array.isArray(cor) ? cor : [cor]));
      linhas.forEach((l) => { if (y > alturaPag - margem) { doc.addPage(); y = margem; } doc.text(l, margem, y); y += tam * 1.3; });
      y += depois;
    };
    bloco(`Prefeitura Municipal de ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'} · ${GC.agente()}`, { tam: 10, negrito: true, cor: GC.rgbMarca('navy'), depois: 0 });
    bloco('Dados simulados para demonstração', { tam: 8, cor: 120, depois: 14 });
    if (pergunta) bloco(pergunta, { tam: 15, negrito: true, cor: 20, depois: 8 });
    bloco(resposta.texto, { tam: 10.5 });
    if (canvas) {
      try {
        const img = canvas.toDataURL('image/png');
        const h = Math.min(220, (canvas.height / canvas.width) * largura);
        if (y + h > alturaPag - margem) { doc.addPage(); y = margem; }
        doc.addImage(img, 'PNG', margem, y, largura, h);
        y += h + 12;
      } catch (e) { /* gráfico fica de fora */ }
    }
    const b = resposta.base;
    if (b || resposta.fontes) {
      bloco('Base consultada', { tam: 11, negrito: true, cor: GC.rgbMarca('navy'), depois: 2 });
      if (b) bloco(`${resposta.fontes ? resposta.fontes.length : 0} tabela(s) · ${num(b.registros)} registros · período: ${b.periodo} · referência: ${b.referencia}`, { tam: 9.5, cor: 60, depois: 2 });
      if (resposta.fontes) bloco(`Tabelas: ${resposta.fontes.join(', ')}`, { tam: 9.5, cor: 60, depois: 2 });
      if (resposta.confiabilidade) bloco(`Confiabilidade ${NIVEL[resposta.confiabilidade.nivel]}${resposta.confiabilidade.motivo ? ` · ${resposta.confiabilidade.motivo}` : ''}`, { tam: 9.5, cor: 60 });
    }
    if (resposta.consulta) {
      bloco('Consulta executada', { tam: 11, negrito: true, cor: GC.rgbMarca('navy'), depois: 2 });
      bloco(resposta.consulta, { tam: 8.5, cor: 50, fonte: 'courier' });
    }
    doc.save(`copiloto-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`);
    return true;
  };

  // Rodapé "de onde veio isso", recolhido numa linha (confiabilidade · fontes · idade dos dados).
  // Aberto: base consultada, fontes (as que estão na tela Dados abrem a tabela) e a consulta.
  function renderFontes(container, r, extra = {}) {
    if (!r.fontes && !r.confiabilidade && !r.consulta && !r.base) return;
    const box = criar('details', 'fontes');
    const c = r.confiabilidade;
    const n = r.fontes ? r.fontes.length : 0;
    const resumo = c
      ? `Confiabilidade ${NIVEL[c.nivel]}${c.motivo ? ` · ${c.motivo}` : ''}`
      : `${n} ${n === 1 ? 'fonte' : 'fontes'}`;
    const sum = criar('summary', c ? `conf conf-${c.nivel}` : null);
    sum.appendChild(criar('span', 'fontes-ponto', '●'));
    sum.appendChild(criar('span', null, ` ${resumo}`));
    sum.title = 'De onde veio esta resposta';
    box.appendChild(sum);
    if (r.base) {
      const b = r.base;
      const n = r.fontes ? r.fontes.length : 0;
      const linha = criar('div', 'fontes-base');
      linha.appendChild(criar('b', null, '🗄 Base consultada: '));
      linha.appendChild(criar('span', null, `${n} ${n === 1 ? 'tabela' : 'tabelas'} · ${num(b.registros)} ${b.registros === 1 ? 'registro' : 'registros'} · ${b.periodo} · ref. ${b.referencia}`));
      box.appendChild(linha);
    }
    if (r.fontes) {
      const linha = criar('div', 'fontes-lista');
      linha.appendChild(criar('b', null, '📚 Fontes: '));
      r.fontes.forEach((f) => {
        if (extra.tabelaExiste && extra.tabelaExiste(f)) {
          const b = criar('button', 'chip-fonte link', f);
          b.type = 'button';
          b.title = 'Abrir esta tabela na tela Dados';
          b.onclick = () => extra.aoAbrirTabela(f);
          linha.appendChild(b);
        } else {
          const s = criar('span', 'chip-fonte', f);
          s.title = 'Tabela do sistema da secretaria';
          linha.appendChild(s);
        }
      });
      box.appendChild(linha);
    }
    if (r.consulta) {
      const det = criar('details', 'consulta');
      det.appendChild(criar('summary', null, 'Ver consulta'));
      det.appendChild(criar('pre', null, r.consulta));
      box.appendChild(det);
    }
    container.appendChild(box);
  }

  // "Exportar resposta (PDF)" vira um ícone discreto no canto do balão.
  function botaoPdf(msg, exportar) {
    if (!window.jspdf || !window.jspdf.jsPDF) return;
    const autor = msg.querySelector('.autor');
    if (!autor) return;
    const b = criar('button', 'btn-pdf-resposta');
    b.type = 'button';
    b.title = 'Exportar resposta (PDF)';
    b.setAttribute('aria-label', b.title);
    b.innerHTML = '<i class="ti ti-file-download" aria-hidden="true"></i> PDF';
    b.onclick = () => exportar(msg.querySelector('canvas'));
    autor.appendChild(b);
  }

  GC.criarChat = function (el, opcoes) {
    const { aoPerguntar, aoAcao, aoRecolher, tabelaExiste, aoAbrirTabela, aoFixarWidget, aoVerWidget } = opcoes;
    let ultimaPergunta = null; // a pergunta do prefeito que a próxima resposta da IA responde (vai no PDF)
    let fila = Promise.resolve();
    let recolhido = false;
    let naoLidas = 0;

    function contarNaoLida() {
      if (!recolhido || !el.naoLidas) return;
      naoLidas++;
      el.naoLidas.textContent = naoLidas;
      el.naoLidas.hidden = false;
    }

    function recolher(valor) {
      recolhido = valor;
      el.app.classList.toggle('chat-recolhido', recolhido);
      if (el.btnRecolher) {
        el.btnRecolher.title = recolhido ? 'Abrir o ' + GC.agente() + '' : 'Recolher o ' + GC.agente() + '';
        el.btnRecolher.setAttribute('aria-label', el.btnRecolher.title);
      }
      if (!recolhido) {
        naoLidas = 0;
        el.naoLidas.hidden = true;
        setTimeout(() => { el.mensagens.scrollTop = el.mensagens.scrollHeight; }, 50);
        // Gráfico criado com a gaveta fechada (ou abrindo) nasce minúsculo: redimensiona quando ela assenta.
        setTimeout(redimensionarGraficos, 320);
      }
      if (aoRecolher) aoRecolher(recolhido);
    }

    if (el.btnRecolher) el.btnRecolher.addEventListener('click', () => recolher(!recolhido));
    if (el.aba) el.aba.addEventListener('click', () => recolher(false));
    // Começa recolhido a cada carregamento: o mapa é o foco; as mensagens aparecem no contador da aba.
    recolher(true);

    const rolar = () => { el.mensagens.scrollTop = el.mensagens.scrollHeight; };
    function redimensionarGraficos() {
      if (typeof Chart === 'undefined') return;
      el.mensagens.querySelectorAll('.grafico-area canvas').forEach((c) => {
        const g = Chart.getChart(c);
        if (g) g.resize();
      });
    }
    // Rola só o necessário para o topo de `alvo` ficar visível (se tudo couber, vai até o fim).
    function mostrarDoInicio(alvo) {
      const caixa = el.mensagens;
      const topo = alvo.getBoundingClientRect().top - caixa.getBoundingClientRect().top + caixa.scrollTop - 8;
      caixa.scrollTop = Math.min(topo, caixa.scrollHeight - caixa.clientHeight);
    }
    const enfileirar = (fn) => (fila = fila.then(fn).catch((e) => console.error(e)));

    function balao(classe, autor) {
      const div = document.createElement('div');
      div.className = `msg ${classe}`;
      if (autor) {
        const a = document.createElement('div');
        a.className = 'autor';
        a.textContent = autor;
        div.appendChild(a);
      }
      el.mensagens.appendChild(div);
      rolar();
      return div;
    }

    function texto(div, t) {
      const p = document.createElement('div');
      p.textContent = t;
      div.appendChild(p);
    }

    // Aceita a Resposta ou uma Promise dela; "digitando" fica até as duas coisas chegarem.
    function ia(respostaOuPromessa, { atrasoMs = 900 } = {}) {
      const pergunta = ultimaPergunta;
      ultimaPergunta = null;
      return enfileirar(async () => {
        const msg = balao('ia', '✨ ' + GC.agente() + '');
        contarNaoLida();
        msg.insertAdjacentHTML('beforeend', '<div class="digitando"><span></span><span></span><span></span></div>');
        rolar();
        const [resposta] = await Promise.all([Promise.resolve(respostaOuPromessa), esperar(atrasoMs)]);
        msg.querySelector('.digitando').remove();
        texto(msg, resposta.texto);
        if (resposta.grafico) renderGrafico(msg, resposta.grafico);
        if (resposta.previa) renderPrevia(msg, resposta.previa);
        if (resposta.arquivos && resposta.arquivos.length) renderArquivos(msg, resposta.arquivos);
        if (resposta.fontes || resposta.grafico) botaoPdf(msg, (canvas) => GC.exportarRespostaPdf({ pergunta, resposta, canvas }));
        const fixavel = resposta.grafico && pergunta && aoFixarWidget;
        if ((resposta.acoes && resposta.acoes.length) || fixavel) {
          const box = document.createElement('div');
          box.className = 'acoes';
          (resposta.acoes || []).forEach((acao) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = acao.rotulo;
            b.onclick = () => aoAcao(acao);
            box.appendChild(b);
          });
          // Gráfico da resposta vira widget do dashboard ("Indicadores").
          if (fixavel) box.appendChild(botaoFixar(pergunta, resposta));
          msg.appendChild(box);
        }
        renderFontes(msg, resposta, { tabelaExiste, aoAbrirTabela });
        // Resposta longa: mostra do começo (com a pergunta logo acima), não do rodapé.
        const ancora = pergunta && msg.previousElementSibling && msg.previousElementSibling.classList.contains('prefeito') ? msg.previousElementSibling : msg;
        mostrarDoInicio(ancora);
        setTimeout(() => { redimensionarGraficos(); mostrarDoInicio(ancora); }, 750);
        return resposta;
      });
    }

    // Documentos gerados pelos modelos (js/modelos.js): prévia na própria conversa e botões de download.
    function renderPrevia(msg, p) {
      if (p.tipo === 'imagem') {
        const img = document.createElement('img'); img.className = 'previa-img'; img.src = p.src; img.alt = p.alt || '';
        msg.appendChild(img);
      } else if (p.tipo === 'texto') {
        msg.appendChild(criar('div', 'previa-texto', p.texto));
      } else if (p.tipo === 'audio') {
        const box = criar('div', 'previa-audio');
        const tocar = criar('button', 'btn-audio', '▶ Ouvir'); const parar = criar('button', 'btn-audio', '■ Parar');
        tocar.type = 'button'; parar.type = 'button';
        tocar.onclick = () => {
          if (!('speechSynthesis' in window)) { tocar.textContent = 'Este navegador não lê em voz alta'; return; }
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(p.texto); u.lang = 'pt-BR'; u.rate = 1.02;
          const voz = window.speechSynthesis.getVoices().find((v) => /pt[-_]BR/i.test(v.lang)); if (voz) u.voice = voz;
          window.speechSynthesis.speak(u);
        };
        parar.onclick = () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); };
        box.append(tocar, parar);
        msg.appendChild(box);
      }
    }
    function renderArquivos(msg, arquivos) {
      const box = criar('div', 'acoes arquivos');
      arquivos.forEach((a) => {
        const b = criar('button', 'btn-arquivo', a.rotulo); b.type = 'button';
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Gerando…';
          try {
            const blob = await a.criar();
            const url = URL.createObjectURL(blob); const l = document.createElement('a');
            l.href = url; l.download = a.nome; document.body.appendChild(l); l.click(); l.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            b.textContent = `✓ ${a.nome}`;
          } catch (e) { b.textContent = 'Não deu para gerar agora · tentar de novo'; }
          b.disabled = false;
        };
        box.appendChild(b);
      });
      msg.appendChild(box);
    }

    // "▦ Fixar como widget": cria (ou reencontra) o widget; depois o botão leva até ele no dashboard.
    function botaoFixar(pergunta, resposta) {
      const b = criar('button', 'btn-fixar-widget', '▦ Fixar como widget');
      b.type = 'button';
      b.title = 'Adicionar este gráfico aos widgets do dashboard (Indicadores)';
      let fixado = null;
      const marcar = (r) => {
        fixado = r.widget.id;
        b.textContent = r.criado ? '✓ Widget criado · ver no dashboard' : '✓ Já está nos widgets · ver';
        b.classList.add('feito');
      };
      b.onclick = () => {
        if (fixado) return aoVerWidget && aoVerWidget(fixado);
        const r = aoFixarWidget({ pergunta, resposta });
        if (r && r.widget) marcar(r);
      };
      return b;
    }

    function secretaria(areaId, t) {
      const sec = GC.data.areas.find((a) => a.id === areaId).secretaria;
      return enfileirar(async () => {
        texto(balao('secretaria', `${sec.emoji} ${sec.nome}`), t);
        contarNaoLida();
      });
    }

    function prefeito(t) {
      ultimaPergunta = t;
      return enfileirar(async () => texto(balao('prefeito'), t));
    }

    function sugestoes(lista) {
      el.sugestoes.innerHTML = '';
      lista.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s.rotulo || s;
        if (s.rotulo) b.title = s.texto;
        b.onclick = () => aoPerguntar(s.texto || s);
        el.sugestoes.appendChild(b);
      });
    }

    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = el.input.value.trim();
      if (!t) return;
      el.input.value = '';
      aoPerguntar(t);
    });
    // O "Resumo da semana" saiu do cabeçalho do Copiloto e foi para a doca (js/resumo-semana.js).
    if (el.btnResumo) el.btnResumo.addEventListener('click', () => aoPerguntar('Resumo da semana'));

    return { ia, secretaria, prefeito, sugestoes, recolher };
  };
})(window.GC = window.GC || {});
