(function (GC) {
  // Estúdio (#/estudio/<modelo>/<alvo>): imagens prontas para redes e apresentações, a partir de MODELOS fixos.
  // Nada é desenhado do zero a cada geração: o modelo (layout em SVG, 1080 × 1080) fica pronto; cada geração só
  // troca os dados (que vêm da base, os mesmos das telas) e a marca (cores, logo, nome em Personalizar).
  // Um modelo = { id, nome, alvos (o que escolher: secretaria, bairro, conquista…), dados(alvo) → campos, svg(campos) }.
  const W = 1080;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FONTE = "Inter, 'Segoe UI', Arial, sans-serif";

  // Quebra um texto em linhas de até n caracteres (SVG não quebra sozinho).
  function linhas(texto, n) {
    const out = [];
    String(texto).split(/\s+/).forEach((p) => {
      const ult = out[out.length - 1];
      if (ult && (ult + ' ' + p).length <= n) out[out.length - 1] = `${ult} ${p}`; else out.push(p);
    });
    return out;
  }
  const texto = (x, y, conteudo, { tam = 40, peso = 600, cor = '#fff', ancora = 'start', n = 40, entre = 1.18, max = 4, op = 1 } = {}) => {
    const ls = linhas(conteudo, n).slice(0, max);
    return `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${tam}" font-weight="${peso}" fill="${cor}" fill-opacity="${op}" text-anchor="${ancora}">${ls.map((l, i) => `<tspan x="${x}" dy="${i ? tam * entre : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  };

  // Moldura comum a todos os modelos: fundo da marca, faixa de destaque, logo + prefeitura em cima, fonte embaixo.
  function moldura(c, miolo, { fundoClaro = false } = {}) {
    const m = GC.coresMarca();
    const sobre = fundoClaro ? m.primaria : GC.cor.sobre(m.primaria);
    const fundo = fundoClaro
      ? `<rect width="${W}" height="${W}" fill="${GC.cor.misturar(m.primaria, '#ffffff', 0.06)}"/>`
      : `<defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.escura}"/><stop offset="1" stop-color="${m.primaria}"/></linearGradient></defs><rect width="${W}" height="${W}" fill="url(#fg)"/>
         <circle cx="${W - 60}" cy="70" r="300" fill="${m.destaque}" fill-opacity="0.10"/>`;
    const logo = GC.marca.logo
      ? `<image href="${GC.marca.logo}" x="72" y="64" width="84" height="84" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="72" y="64" width="84" height="84" rx="20" fill="${m.destaque}"/><text x="114" y="122" font-family="${FONTE}" font-size="36" font-weight="700" fill="${GC.cor.sobre(m.destaque)}" text-anchor="middle">${esc(GC.iniciaisMarca())}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">
      ${fundo}
      <rect x="0" y="0" width="${W}" height="10" fill="${m.destaque}"/>
      ${logo}
      ${texto(178, 100, 'Prefeitura de', { tam: 24, peso: 500, cor: sobre, op: 0.75 })}
      ${texto(178, 136, c.cidade, { tam: 34, peso: 700, cor: sobre })}
      ${miolo}
      <line x1="72" y1="952" x2="${W - 72}" y2="952" stroke="${sobre}" stroke-opacity="0.2" stroke-width="2"/>
      ${texto(72, 996, `Fonte: ${c.fonte}`, { tam: 22, peso: 500, cor: sobre, op: 0.75, n: 70, max: 1 })}
      ${texto(W - 72, 996, c.rodape || 'Dados de demonstração', { tam: 22, peso: 500, cor: sobre, op: 0.6, ancora: 'end', n: 40, max: 1 })}
    </svg>`;
  }

  // ---- os modelos ----
  const MODELOS = [
    {
      id: 'numero', nome: 'Número em destaque', descricao: 'Um indicador da secretaria, com a variação do mês.', alvoRotulo: 'Secretaria',
      alvos: (ctx) => ctx.store.pulsos().map((p) => ({ id: p.area, nome: GC.data.areas.find((a) => a.id === p.area).secretaria.nome })),
      dados(alvo, ctx) {
        const p = ctx.store.pulsos().find((x) => x.area === alvo) || ctx.store.pulsos()[0];
        const s = GC.data.secretarias[p.area];
        return {
          chamada: p.rotulo, numero: p.nivel, variacao: `${p.variacao} ${p.periodo}`, bom: p.positivo,
          frase: p.positivo ? `${p.rotulo}: resultado melhor que no período anterior.` : `${p.rotulo}: a prefeitura está agindo para melhorar este número.`,
          secretaria: GC.data.areas.find((a) => a.id === p.area).secretaria.nome, fonte: s.fonte, periodo: GC.relogio.ultimoMes(),
        };
      },
      svg(c) {
        const m = GC.coresMarca(); const sobre = GC.cor.sobre(m.primaria);
        return moldura(c, `
          ${texto(72, 300, c.secretaria.toUpperCase(), { tam: 26, peso: 700, cor: m.destaque, n: 60, max: 1 })}
          ${texto(72, 372, c.chamada, { tam: 56, peso: 700, cor: sobre, n: 26, max: 2 })}
          ${texto(72, 640, c.numero, { tam: 210, peso: 800, cor: sobre, n: 12, max: 1 })}
          <rect x="72" y="700" width="${Math.max(260, c.variacao.length * 21 + 90)}" height="70" rx="35" fill="${m.destaque}"/>
          ${texto(110, 748, `${String(c.variacao).trim().startsWith('-') ? '▼' : '▲'} ${c.variacao}`, { tam: 32, peso: 700, cor: GC.cor.sobre(m.destaque), n: 40, max: 1 })}
          ${texto(72, 850, c.frase, { tam: 34, peso: 500, cor: sobre, op: 0.88, n: 52, max: 2 })}`);
      },
    },
    {
      id: 'evolucao', nome: 'Evolução em 6 meses', descricao: 'Mini gráfico de barras da série da secretaria.', alvoRotulo: 'Secretaria',
      alvos: (ctx) => MODELOS[0].alvos(ctx),
      dados(alvo) {
        const area = GC.data.secretarias[alvo] ? alvo : GC.data.areas[0].id;
        const s = GC.data.secretarias[area];
        const meses = GC.data.mesesSerie.slice(6);
        const unidade = s.serie.unidade === '%' ? '%' : s.serie.unidade === 'min' ? ' min' : '';
        return { titulo: s.serie.rotulo, valores: s.serie.meses.slice(6), meses, unidade, meta: s.serie.meta, secretaria: GC.data.areas.find((a) => a.id === area).secretaria.nome, fonte: s.fonte };
      },
      svg(c) {
        const m = GC.coresMarca(); const tinta = m.primaria;
        const max = Math.max(...c.valores, c.meta || 0) * 1.12;
        const base = 840; const alt = 420; const larg = 120; const passo = 156; const x0 = 96;
        const barras = c.valores.map((v, i) => {
          const h = (v / max) * alt; const x = x0 + i * passo; const ult = i === c.valores.length - 1;
          return `<rect x="${x}" y="${base - h}" width="${larg}" height="${h}" rx="14" fill="${ult ? m.destaque : GC.cor.misturar(tinta, '#ffffff', 0.35)}"/>
            ${texto(x + larg / 2, base - h - 18, `${v.toLocaleString('pt-BR')}${c.unidade}`, { tam: 30, peso: 700, cor: tinta, ancora: 'middle', n: 12, max: 1 })}
            ${texto(x + larg / 2, base + 46, c.meses[i], { tam: 28, peso: 600, cor: tinta, ancora: 'middle', op: 0.7, n: 6, max: 1 })}`;
        }).join('');
        const yMeta = c.meta ? base - (c.meta / max) * alt : null;
        return moldura(c, `
          ${texto(72, 290, c.secretaria.toUpperCase(), { tam: 26, peso: 700, cor: GC.cor.escurecerAte(m.destaque, 3), n: 60, max: 1 })}
          ${texto(72, 352, c.titulo, { tam: 54, peso: 700, cor: tinta, n: 30, max: 2 })}
          ${yMeta ? `<line x1="80" x2="${W - 80}" y1="${yMeta}" y2="${yMeta}" stroke="${tinta}" stroke-dasharray="10 10" stroke-width="3" stroke-opacity="0.5"/>${texto(72, 404 + (linhas(c.titulo, 30).length > 1 ? 64 : 0), `- - -  meta: ${c.meta.toLocaleString('pt-BR')}${c.unidade}`, { tam: 26, peso: 600, cor: tinta, op: 0.7, n: 40, max: 1 })}` : ''}
          ${barras}`, { fundoClaro: true });
      },
    },
    {
      id: 'aviso', nome: 'Aviso à população', descricao: 'Alerta de chuva e risco, com a orientação e o telefone da Defesa Civil.', alvoRotulo: 'Área de risco',
      alvos: () => (GC.risco ? GC.risco.resumo(GC.data.ocorrencias).areas.slice(0, 8).map((a) => ({ id: a.id, nome: `${a.nome} (${a.nivel})` })) : []),
      dados(alvo) {
        const r = GC.risco.resumo(GC.data.ocorrencias);
        const a = r.areas.find((x) => x.id === alvo) || r.preventivo || r.areas[0];
        const prev = r.previsao.janelas[r.previsao.janelas.length - 1].mm;
        return {
          titulo: a.tipo === 'deslizamento' ? 'Risco de deslizamento' : 'Risco de alagamento', local: a.nome, nivel: a.nivel,
          quando: a.horasAte ? `nas próximas ${a.horasAte} horas` : 'nas próximas 24 horas', chuva: `${prev} mm previstos em 24 h`,
          orientacao: a.tipo === 'deslizamento' ? 'Se notar trincas, portas emperrando ou barulho no barranco, saia de casa e procure um local seguro.' : 'Evite passar por ruas alagadas e não deixe objetos na calçada. Desligue a energia se a água entrar em casa.',
          fonte: r.previsao.fonte,
        };
      },
      svg(c) {
        const m = GC.coresMarca(); const sobre = GC.cor.sobre(m.primaria);
        const corNivel = c.nivel === 'alto' ? '#dc2626' : c.nivel === 'medio' ? '#ea580c' : '#ca8a04';
        return moldura(c, `
          <rect x="72" y="232" width="300" height="64" rx="32" fill="${corNivel}"/>
          ${texto(222, 276, `⚠ RISCO ${String(c.nivel).toUpperCase()}`, { tam: 28, peso: 800, cor: '#ffffff', ancora: 'middle', n: 30, max: 1 })}
          ${texto(72, 400, c.titulo, { tam: 76, peso: 800, cor: sobre, n: 22, max: 2 })}
          ${texto(72, 520, `${c.local}, ${c.quando}`, { tam: 40, peso: 600, cor: m.destaque, n: 40, max: 2 })}
          ${texto(72, 630, c.chuva, { tam: 32, peso: 500, cor: sobre, op: 0.85, n: 50, max: 1 })}
          ${texto(72, 710, c.orientacao, { tam: 32, peso: 500, cor: sobre, n: 50, max: 3 })}
          <rect x="72" y="840" width="${W - 144}" height="80" rx="18" fill="${m.destaque}"/>
          ${texto(W / 2, 893, 'Em perigo, ligue 199 (Defesa Civil) ou 193 (Bombeiros)', { tam: 32, peso: 700, cor: GC.cor.sobre(m.destaque), ancora: 'middle', n: 70, max: 1 })}`);
      },
    },
    {
      id: 'entrega', nome: 'Entrega à população', descricao: 'Obra ou serviço entregue, com o bairro e a data.', alvoRotulo: 'Entrega',
      alvos: () => (GC.data.conquistas || []).map((q) => ({ id: q.id, nome: q.titulo })),
      dados(alvo) {
        const q = GC.data.conquistas.find((x) => x.id === alvo) || GC.data.conquistas[0];
        const b = GC.data.bairros.find((x) => x.id === q.bairroId);
        const a = GC.data.areas.find((x) => x.id === q.area);
        const data = new Date(`${q.data}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
        return { titulo: q.titulo, descricao: q.descricao, bairro: b ? b.nome : '', data, secretaria: a ? a.secretaria.nome : '', fonte: a ? a.secretaria.nome : 'Prefeitura' };
      },
      svg(c) {
        const m = GC.coresMarca(); const sobre = GC.cor.sobre(m.primaria);
        return moldura(c, `
          ${texto(72, 300, '✓ ENTREGUE', { tam: 30, peso: 800, cor: m.destaque, n: 30, max: 1 })}
          ${texto(72, 400, c.titulo, { tam: 76, peso: 800, cor: sobre, n: 22, max: 3 })}
          ${texto(72, 400 + Math.min(3, linhas(c.titulo, 22).length) * 90 + 40, c.descricao, { tam: 36, peso: 500, cor: sobre, op: 0.9, n: 46, max: 3 })}
          <rect x="72" y="830" width="${Math.max(320, (c.bairro.length + c.data.length) * 19 + 110)}" height="70" rx="35" fill="none" stroke="${m.destaque}" stroke-width="3"/>
          ${texto(110, 876, `${c.bairro} · ${c.data}`, { tam: 30, peso: 600, cor: sobre, n: 50, max: 1 })}`);
      },
    },
  ];
  GC.MODELOS_ESTUDIO = MODELOS;

  // Gera o SVG de um modelo para um alvo (o mesmo usado na tela, no PNG e nos testes).
  GC.gerarImagem = function (modeloId, alvo, ctx) {
    const md = MODELOS.find((x) => x.id === modeloId) || MODELOS[0];
    const c = Object.assign({ cidade: GC.cidade ? GC.cidade.nome : 'Vila Dourada' }, md.dados(alvo, ctx));
    return { modelo: md, campos: c, svg: md.svg(c) };
  };

  // SVG → PNG 1080 × 1080 (para baixar ou postar).
  GC.svgParaPng = (svg) => new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = W; cv.getContext('2d').drawImage(img, 0, 0, W, W); ok(cv.toDataURL('image/png')); };
    img.onerror = erro;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  // ---- a tela ----
  GC.criarTelaEstudio = function (el, { store, aoIr, aoPerguntar }) {
    const ctx = { store };
    let atual = { modelo: MODELOS[0].id, alvo: null };

    function desenhar() {
      const md = MODELOS.find((x) => x.id === atual.modelo) || MODELOS[0];
      const alvos = md.alvos(ctx);
      if (!alvos.some((a) => a.id === atual.alvo)) atual.alvo = alvos[0] ? alvos[0].id : null;
      const g = GC.gerarImagem(md.id, atual.alvo, ctx);
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🖼 Editor de cards</h2><p><a href="#/estudio">← Todos os modelos</a> · Imagens prontas a partir de modelos: escolha o modelo e o assunto; os números vêm da base e as cores e o logo, da marca.</p></div></header>
        <div class="es-grade">
          <section class="rel-cartao es-lado">
            <h3>Modelo</h3>
            <div class="es-modelos">${MODELOS.map((x) => `<button type="button" data-es-modelo="${x.id}" class="${x.id === md.id ? 'ativo' : ''}"><b>${esc(x.nome)}</b><small>${esc(x.descricao)}</small></button>`).join('')}</div>
            <label class="es-alvo">${esc(md.alvoRotulo)}<select data-es-alvo>${alvos.map((a) => `<option value="${esc(a.id)}"${a.id === atual.alvo ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
            <div class="es-acoes"><button type="button" class="btn-sec principal" data-es="png">⬇ Baixar PNG (1080 × 1080)</button><button type="button" class="btn-sec" data-es="svg">⬇ SVG editável</button></div>
            <p class="es-dica">O modelo não muda entre gerações: só os dados e a marca. Trocar a paleta ou o logo em Personalizar muda todas as imagens.</p>
          </section>
          <section class="rel-cartao es-previa"><div class="es-quadro">${g.svg}</div></section>
        </div>`;
      el.querySelectorAll('[data-es-modelo]').forEach((b) => { b.onclick = () => aoIr({ tela: 'estudio', modelo: b.dataset.esModelo }); });
      el.querySelector('[data-es-alvo]').onchange = (e) => aoIr({ tela: 'estudio', modelo: md.id, alvo: e.target.value });
      const nome = `${md.id}-${atual.alvo || 'cidade'}`;
      el.querySelector('[data-es="svg"]').onclick = () => baixar(`${nome}.svg`, URL.createObjectURL(new Blob([g.svg], { type: 'image/svg+xml' })));
      el.querySelector('[data-es="png"]').onclick = () => GC.svgParaPng(g.svg).then((url) => baixar(`${nome}.png`, url));
    }
    function baixar(nome, url) { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); }

    // Catálogo: tudo o que a assistente gera, com um pedido de exemplo para cada modelo.
    function catalogo() {
      const lista = GC.modelos ? GC.modelos.lista : [];
      const ag = GC.agente ? GC.agente() : 'assistente';
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🖼 Estúdio</h2><p>Peça à ${esc(ag)} com suas palavras: ela escolhe o modelo, preenche com os dados da base e devolve o arquivo pronto, na identidade da prefeitura.</p></div></header>
        <div class="es-catalogo">${lista.map((m) => `<article class="es-cartao">
          <div class="es-cartao-topo"><span class="es-ic" aria-hidden="true">${m.icone}</span><span class="es-formato">${esc(m.formato)}</span></div>
          <h3>${esc(m.nome)}</h3><p>${esc(m.descricao)}</p>
          <p class="es-exemplo">“${esc(m.exemplo)}”</p>
          <div class="es-cartao-acoes"><button type="button" class="btn-sec principal" data-es-pedir="${esc(m.exemplo)}">Pedir à ${esc(ag)}</button>
          ${m.id === 'card' ? '<button type="button" class="btn-sec" data-es-editor>Abrir editor de cards</button>' : ''}</div></article>`).join('')}</div>`;
      el.querySelectorAll('[data-es-pedir]').forEach((b) => { b.onclick = () => aoPerguntar && aoPerguntar(b.dataset.esPedir); });
      const ed = el.querySelector('[data-es-editor]'); if (ed) ed.onclick = () => aoIr({ tela: 'estudio', modelo: MODELOS[0].id });
    }

    return { mostrar(rota) {
      if (!rota.modelo || !MODELOS.some((x) => x.id === rota.modelo)) { catalogo(); return; }
      atual = { modelo: rota.modelo, alvo: rota.alvo || null }; desenhar();
    } };
  };
})(window.GC = window.GC || {});
