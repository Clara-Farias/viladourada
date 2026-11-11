(function (GC) {
  // Tela "Personalizar" (#/personalizar, só gestor geral): nome do produto, nome da assistente, cores e logo.
  // Enquanto edita, as cores já valem no painel inteiro (menu, botões, gráficos de CSS, mapa de calor das telas);
  // "Salvar" grava neste navegador e recarrega para gráficos, mapa e PDFs também usarem a marca nova.
  // Sair sem salvar devolve as cores salvas. Exportar/Importar leva a marca para outro computador, e
  // "Baixar como marca da instalação" gera o js/marca-config.js, que vale para todos que abrem a cópia.
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOGO_MAX = 400 * 1024;
  const CORES = [
    ['primaria', 'Principal', 'Menu, cabeçalhos, botões principais, linhas dos gráficos e bairros no mapa.'],
    ['escura', 'Principal escura', 'Passar o mouse, fundos fortes, tela de carregamento. Acompanha a principal sozinha.'],
    ['destaque', 'Destaque', 'Selo do logo, faixas e detalhes dourados, marcadores do tour.'],
    ['ia', 'Assistente de IA', 'Botão, conversa, gráficos e widgets da assistente.'],
  ];

  const baixar = (nome, conteudo, tipo) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  GC.criarTelaPersonalizar = function (el) {
    let rascunho = null;
    let escuraManual = false;
    let alterado = false;
    const C = GC.cor;

    const cores = () => rascunho.cores || GC.TEMAS_MARCA.find((t) => t.id === rascunho.tema) || GC.TEMAS_MARCA[0];
    const comCores = (mudanca) => { rascunho.cores = Object.assign({ id: 'personalizado', nome: 'Personalizado' }, cores(), mudanca); };

    // Leitura de cada cor: contraste do texto que vai por cima (e da IA como texto sobre branco).
    function leitura(c) {
      const avalia = (fundo, frente) => { const r = C.contraste(fundo, frente); return { r, ok: r >= 4.5, medio: r >= 3 && r < 4.5 }; };
      return {
        primaria: avalia(c.primaria, C.sobre(c.primaria)),
        escura: avalia(c.escura, C.sobre(c.escura)),
        destaque: avalia(c.destaque, C.sobre(c.destaque)),
        ia: avalia(c.ia, '#ffffff'),
      };
    }

    function marcarAlterado(v = true) {
      alterado = v;
      const s = el.querySelector('.pz-estado');
      if (s) { s.hidden = !alterado; }
    }

    // Aplica o rascunho no painel inteiro e na prévia.
    function aplicar() {
      const c = cores();
      GC.aplicarCores(c);
      const p = el.querySelector('.pz-previa');
      GC.aplicarCores(c, p);
      p.querySelector('[data-pz="logo"]').innerHTML = GC.htmlLogoMarca(rascunho, 'logo');
      p.querySelectorAll('[data-pz="produto"]').forEach((x) => { x.textContent = rascunho.produto || GC.MARCA_PADRAO.produto; });
      p.querySelectorAll('[data-pz="agente"]').forEach((x) => { x.textContent = rascunho.agente || GC.MARCA_PADRAO.agente; });
      el.querySelectorAll('[data-pz-tema]').forEach((b) => b.classList.toggle('ativo', !rascunho.cores && b.dataset.pzTema === rascunho.tema));
      const l = leitura(c);
      CORES.forEach(([k]) => {
        el.querySelector(`[data-pz-cor="${k}"]`).value = c[k];
        el.querySelector(`[data-pz-hex="${k}"]`).value = c[k];
        const s = el.querySelector(`[data-pz-leitura="${k}"]`);
        const r = l[k];
        s.className = `pz-leitura ${r.ok ? 'boa' : r.medio ? 'media' : 'ruim'}`;
        s.innerHTML = r.ok ? `✓ boa leitura (${r.r.toFixed(1).replace('.', ',')}:1)`
          : `${r.medio ? '⚠ leitura fraca' : '✕ difícil de ler'} (${r.r.toFixed(1).replace('.', ',')}:1) <button type="button" data-pz-corrigir="${k}">Corrigir</button>`;
      });
      el.querySelectorAll('[data-pz-corrigir]').forEach((b) => {
        b.onclick = () => {
          const k = b.dataset.pzCorrigir;
          const atual = cores()[k];
          comCores({ [k]: k === 'destaque' ? C.misturar(atual, '#000000', 0.8) : C.escurecerAte(atual, 4.5) });
          if (k === 'primaria' && !escuraManual) comCores({ escura: C.misturar(cores().primaria, '#000000', 0.72) });
          marcarAlterado(); aplicar();
        };
      });
    }

    function aviso(t, tipo = '') {
      const a = el.querySelector('.pz-aviso');
      a.textContent = t; a.hidden = !t; a.className = `pz-aviso ${tipo}`;
    }

    function desenhar() {
      const nomeCidade = GC.cidade ? GC.cidade.nome : 'Vila Dourada';
      el.innerHTML = `
        <header class="sec-topo"><div><h2>🎨 Personalizar</h2><p>Identidade do sistema para esta prefeitura. As cores mudam o painel inteiro na hora; salve para manter.</p></div>
          <span class="sec-acoes"><span class="pz-estado" hidden>Alterações não salvas</span>
          <button type="button" class="btn-sec" data-pz="descartar">Descartar</button>
          <button type="button" class="btn-sec principal" data-pz="salvar">Salvar e aplicar</button></span></header>
        <div class="pz-grade">
          <div class="pz-coluna">
            <section class="rel-cartao pz-campos">
              <h3>Nomes</h3>
              <label>Nome do produto<input type="text" maxlength="28" data-pz-campo="produto" value="${esc(rascunho.produto)}">
                <small>Menu, tela de login, título da aba e relatórios.</small></label>
              <label>Nome da assistente de IA<input type="text" maxlength="20" data-pz-campo="agente" value="${esc(rascunho.agente)}">
                <small>Botão do cabeçalho, conversa, “Pedir análise”, widgets e tour.</small></label>
            </section>
            <section class="rel-cartao pz-campos">
              <h3>Paletas prontas</h3>
              <div class="pz-temas">${GC.TEMAS_MARCA.map((t) => `<button type="button" data-pz-tema="${t.id}"><span class="pz-amostra"><i style="background:${t.primaria}"></i><i style="background:${t.destaque}"></i><i style="background:${t.ia}"></i></span>${esc(t.nome)}</button>`).join('')}</div>
              <h3>Cores</h3>
              <div class="pz-cores">
                ${CORES.map(([k, r, dica]) => `<div class="pz-cor">
                  <input type="color" data-pz-cor="${k}" aria-label="${r}">
                  <div><b>${r}</b><small>${dica}</small><span data-pz-leitura="${k}"></span></div>
                  <input type="text" class="pz-hex" data-pz-hex="${k}" maxlength="7" spellcheck="false" aria-label="${r} em hexadecimal">
                </div>`).join('')}
              </div>
              <p class="pz-dica">Vermelho, laranja e verde de gravidade e prazo não mudam com a marca: eles avisam, não decoram.</p>
            </section>
            <section class="rel-cartao pz-campos">
              <h3>Logo</h3>
              <div class="pz-logo">
                <span>${GC.htmlLogoMarca(rascunho, 'logo-grande')}</span>
                <label class="btn-sec">⬆ Enviar logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-pz="arquivo" hidden></label>
                <button type="button" class="btn-sec" data-pz="logo-padrao"${rascunho.logo === GC.LOGO_PADRAO ? ' hidden' : ''}>Usar o logo inicial (VD)</button>
                <button type="button" class="btn-sec" data-pz="sem-logo"${rascunho.logo ? '' : ' hidden'}>Usar as iniciais</button>
                <label class="pz-check"><input type="checkbox" data-pz="logo-fundo"${rascunho.logoFundo ? ' checked' : ''}> Fundo branco atrás do logo (para logos sem fundo próprio)</label>
                <small>PNG, JPG, SVG ou WEBP, até 400 KB. Vale para o menu, o login, o portal do cidadão e o ícone da aba. O logo inicial é o monograma VD; troque quando quiser.</small>
              </div>
            </section>
            <section class="rel-cartao pz-campos">
              <h3>Levar para outro computador</h3>
              <p class="pz-dica">A personalização fica salva neste navegador. Para usar a mesma marca em outra máquina, exporte e importe o arquivo. Para valer para todos que abrem esta cópia do sistema, baixe a marca da instalação e substitua o arquivo <code>js/marca-config.js</code>.</p>
              <div class="pz-arquivos">
                <button type="button" class="btn-sec" data-pz="exportar">⬇ Exportar marca (.json)</button>
                <label class="btn-sec">⬆ Importar marca<input type="file" accept="application/json,.json" data-pz="importar" hidden></label>
                <button type="button" class="btn-sec" data-pz="instalacao">⬇ Baixar como marca da instalação</button>
                <button type="button" class="btn-sec" data-pz="restaurar">↺ Voltar ao padrão Golden</button>
              </div>
            </section>
            <p class="pz-aviso" role="status" hidden></p>
          </div>

          <section class="rel-cartao pz-previa" aria-label="Prévia">
            <h3>Prévia</h3>
            <div class="pz-app">
              <aside class="pz-menu"><span data-pz="logo"></span><b data-pz="produto"></b>
                <span class="pz-item ativo">🗺 Mapa</span><span class="pz-item">🏛 Secretarias</span><span class="pz-item">🔀 Cruzamento</span></aside>
              <div class="pz-corpo">
                <div class="pz-topo"><b>${esc(nomeCidade)}</b><span class="pz-btn-alerta">🔔 Alertas <i>16</i></span><span class="pz-btn-ia">✨ <span data-pz="agente"></span></span></div>
                <div class="pz-kpis"><span><b class="crit">8</b> críticas</span><span><b class="pz-txt-marca">252</b> resolvidas</span><span><b class="pz-txt-marca">85%</b> no prazo</span></div>
                <div class="pz-grafico" aria-hidden="true">${[46, 62, 54, 78, 70, 88].map((v, i) => `<i style="height:${v}%"${i === 5 ? ' class="ultimo"' : ''}></i>`).join('')}<svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="4,30 21,24 38,27 55,15 72,18 96,8"/></svg></div>
                <div class="pz-mapa" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="pino"></span></div>
                <div class="pz-chat"><span class="pz-quem">✨ <span data-pz="agente"></span></span>Bom dia! Quer que eu cruze a ocupação hospitalar com a chuva dos últimos 3 meses?</div>
                <div class="pz-botoes"><span class="pz-primario">Cobrar secretaria</span><span class="pz-secundario">Ver no mapa</span><span class="pz-destaque">Novo</span></div>
              </div>
            </div>
            <div class="pz-login"><span data-pz="logo-login"></span><div><b data-pz="produto"></b><small>Tela de login</small></div><span class="pz-entrar">Entrar →</span></div>
          </section>
        </div>`;

      el.querySelector('[data-pz="logo-login"]').innerHTML = GC.htmlLogoMarca(rascunho, 'logo');
      el.querySelectorAll('[data-pz-campo]').forEach((i) => { i.oninput = () => { rascunho[i.dataset.pzCampo] = i.value.trim(); marcarAlterado(); aplicar(); }; });
      el.querySelectorAll('[data-pz-tema]').forEach((b) => { b.onclick = () => { rascunho.tema = b.dataset.pzTema; rascunho.cores = null; escuraManual = false; marcarAlterado(); aplicar(); }; });
      const mudarCor = (k, v) => {
        if (!/^#[0-9a-f]{6}$/i.test(v)) return;
        comCores({ [k]: v.toLowerCase() });
        if (k === 'escura') escuraManual = true;
        if (k === 'primaria' && !escuraManual) comCores({ escura: C.misturar(v, '#000000', 0.72) });
        marcarAlterado(); aplicar();
      };
      el.querySelectorAll('[data-pz-cor]').forEach((i) => { i.oninput = () => mudarCor(i.dataset.pzCor, i.value); });
      el.querySelectorAll('[data-pz-hex]').forEach((i) => { i.onchange = () => mudarCor(i.dataset.pzHex, i.value.startsWith('#') ? i.value : `#${i.value}`); });
      el.querySelector('[data-pz="arquivo"]').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > LOGO_MAX) { aviso(`O arquivo tem ${Math.round(f.size / 1024)} KB; o limite é 400 KB.`, 'erro'); return; }
        const leitor = new FileReader();
        leitor.onload = () => { rascunho.logo = leitor.result; marcarAlterado(); desenhar(); };
        leitor.readAsDataURL(f);
      };
      el.querySelector('[data-pz="sem-logo"]').onclick = () => { rascunho.logo = null; marcarAlterado(); desenhar(); };
      el.querySelector('[data-pz="logo-padrao"]').onclick = () => { rascunho.logo = GC.LOGO_PADRAO; rascunho.logoFundo = false; marcarAlterado(); desenhar(); };
      el.querySelector('[data-pz="logo-fundo"]').onchange = (e) => { rascunho.logoFundo = e.target.checked; marcarAlterado(); desenhar(); };
      el.querySelector('[data-pz="descartar"]').onclick = () => { carregar(); aviso('Alterações descartadas.'); };
      el.querySelector('[data-pz="restaurar"]').onclick = () => { alterado = false; GC.restaurarMarca(); window.location.reload(); };
      el.querySelector('[data-pz="exportar"]').onclick = () => {
        const nome = (rascunho.produto || 'marca').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        baixar(`marca-${nome}.json`, JSON.stringify(GC.exportarMarca(rascunho), null, 2), 'application/json');
      };
      el.querySelector('[data-pz="instalacao"]').onclick = () => {
        const corpo = JSON.stringify(GC.lerArquivoMarca(GC.exportarMarca(rascunho)), null, 2);
        baixar('marca-config.js', `// Marca desta instalação (gerada em Personalizar). Substitua js/marca-config.js por este arquivo.\nwindow.GC = window.GC || {};\nwindow.GC.MARCA_INSTALACAO = ${corpo};\n`, 'text/javascript');
      };
      el.querySelector('[data-pz="importar"]').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const leitor = new FileReader();
        leitor.onload = () => {
          let lida = null;
          try { lida = GC.lerArquivoMarca(JSON.parse(leitor.result)); } catch (err) { lida = null; }
          if (!lida) { aviso('Esse arquivo não é uma marca exportada daqui.', 'erro'); return; }
          rascunho = lida; escuraManual = true; marcarAlterado(); desenhar();
          aviso('Marca importada. Confira a prévia e salve para manter.');
        };
        leitor.readAsText(f);
      };
      el.querySelector('[data-pz="salvar"]').onclick = () => {
        if (!rascunho.produto || !rascunho.agente) { aviso('Preencha o nome do produto e o nome da assistente.', 'erro'); return; }
        if (!GC.salvarMarca(rascunho)) { aviso('Não deu para salvar neste navegador (janela anônima ou armazenamento bloqueado). Use “Exportar marca” para não perder.', 'erro'); return; }
        alterado = false;
        if (GC.registrar) GC.registrar('marca', `Marca salva: ${rascunho.produto} · assistente ${rascunho.agente}`);
        aviso('Salvo. Aplicando em gráficos, mapa e relatórios…');
        setTimeout(() => window.location.reload(), 400);
      };
      marcarAlterado(alterado);
      aplicar();
    }

    function carregar() {
      rascunho = JSON.parse(JSON.stringify(GC.marca));
      escuraManual = !!rascunho.cores;
      alterado = false;
      desenhar();
    }

    // Saiu da tela sem salvar: o painel volta às cores salvas.
    window.addEventListener('hashchange', () => {
      if (!/^#\/personalizar/.test(location.hash) && alterado) { GC.aplicarCores(GC.coresMarca()); alterado = false; }
    });
    window.addEventListener('beforeunload', (e) => { if (alterado && /^#\/personalizar/.test(location.hash)) { e.preventDefault(); e.returnValue = ''; } });

    return { mostrar: carregar };
  };
})(window.GC = window.GC || {});
