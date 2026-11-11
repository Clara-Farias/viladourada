(function (GC) {
  // Resumo do dia: o cartão que abre o painel com o que o prefeito precisa saber em 10 segundos.
  // Quatro destaques (alertas que precisam dele, chuva prevista, o que melhorou, o que piorou),
  // as decisões mais urgentes e o gabinete de crise (o ativo, ou o preventivo sugerido pela chuva).
  const esc = (t) => GC.escaparHtml(t);
  const nomeArea = (id) => (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome;
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const MAX_DECISOES = 2;

  // Só dados → objeto pronto para a tela (testável sem DOM).
  // atencao: lista de store.atencao().todas; areas: secretarias filtradas (vazio = todas).
  GC.resumoDoDia = function ({ atencao = [], tendencias = [], risco = null, gabinetesAtivos = [], areas = [], bairros = [], agora = Date.now(), sugerirGabinete = true, criticasTotal = null }) {
    const naArea = (a) => !areas.length || areas.includes(a);
    const tend = tendencias.filter((t) => naArea(t.area));
    const maior = (lista) => lista.slice().sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao))[0] || null;
    const melhorou = maior(tend.filter((t) => t.positivo));
    const piorou = maior(tend.filter((t) => !t.positivo));
    const criticas = atencao.filter((o) => o.severidade === 'critica').length;

    const destaques = [{
      tipo: 'alertas', tom: atencao.length ? 'critico' : 'ok',
      rotulo: atencao.length ? `${atencao.length} ${atencao.length === 1 ? 'alerta precisa' : 'alertas precisam'} de você` : 'Nenhum alerta precisa de você',
      // "com gravidade crítica": a conta é só entre os que precisam de você (o topo conta todas as críticas abertas).
      detalhe: !atencao.length ? 'tudo encaminhado' : !criticas ? 'nenhum com gravidade crítica' : criticasTotal && criticasTotal > criticas ? `${criticas} das ${criticasTotal} críticas abertas` : `${criticas} com gravidade crítica`,
    }];
    if (risco) {
      const p = risco.previsao;
      const mm = p.janelas[p.janelas.length - 1].mm;
      const alvo = risco.preventivo || risco.altas[0] || null;
      destaques.push({
        tipo: 'chuva', tom: risco.altas.length ? 'atencao' : 'info', alvoRisco: alvo ? alvo.id : null,
        rotulo: `Chuva: ${mm} mm em 24 h`,
        detalhe: alvo ? `risco alto em ${alvo.nome}${alvo.horasAte ? ` em ~${alvo.horasAte} h` : ''}` : 'sem área em risco alto',
      });
    }
    if (melhorou) destaques.push({ tipo: 'melhorou', tom: 'ok', area: melhorou.area, rotulo: `Melhorou · ${melhorou.rotulo}`, detalhe: melhorou.valor });
    if (piorou) destaques.push({ tipo: 'piorou', tom: 'critico', area: piorou.area, rotulo: `Piorou · ${piorou.rotulo}`, detalhe: piorou.valor });

    const decisoes = atencao.slice(0, MAX_DECISOES).map((o) => ({
      id: o.id, titulo: o.titulo, severidade: o.severidade, bairro: nomeBairro(o.bairroId),
      motivo: (GC.motivosAtencao(o)[0] || {}).texto || '', acoes: GC.acoesDisponiveis(o), ocorrencia: o,
    }));

    // Gabinete: o ativo mais recente; sem nenhum, sugere o preventivo da área de risco alto ainda não atingida.
    let gabinete = null;
    const g = gabinetesAtivos[gabinetesAtivos.length - 1];
    if (g) {
      const feitas = g.tarefas.filter((t) => t.status === 'concluida').length;
      gabinete = { tipo: 'ativo', id: g.id, titulo: g.titulo, detalhe: `${feitas}/${g.tarefas.length} tarefas concluídas${gabinetesAtivos.length > 1 ? ` · ${gabinetesAtivos.length} gabinetes ativos` : ''}` };
    } else if (sugerirGabinete && risco && risco.preventivo) {
      const a = risco.preventivo;
      gabinete = { tipo: 'sugerido', areaRiscoId: a.id, titulo: `Risco de ${a.tipo} em ${a.nome}`, detalhe: `${a.familias} famílias · chuva passa do limite em ~${a.horasAte} h` };
    }

    const data = new Date(agora).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    return { data, destaques, decisoes, totalDecisoes: atencao.length, gabinete, escopo: [...areas.map(nomeArea), ...bairros.map(nomeBairro)].join(', ') || null };
  };

  // ---- cartão sobre o mapa: abre acima da doca (base do mapa), só no clique do botão "Resumo do dia" ----
  const ICONE = { alertas: '🔔', chuva: '🌧', melhorou: '📈', piorou: '📉' };
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' }; // gravidade da ocorrência: o mesmo rótulo em todo o painel

  // el: o cartão; botao: o botão da doca; contador: o número no botão. Começa sempre recolhido.
  GC.criarResumoDia = function (el, cb, { botao = null, contador = null } = {}) {
    let recolhido = true;
    let ultimo = null;
    let ultimoHtml = '';

    function corpo(r) {
      const destaques = r.destaques.map((d, i) => `
        <button type="button" class="rd-destaque tom-${d.tom}" data-destaque="${i}" title="${esc(d.rotulo)} · ${esc(d.detalhe)}">
          <span class="rd-ic">${ICONE[d.tipo]}</span><span><b>${esc(d.rotulo)}</b><small>${esc(d.detalhe)}</small></span></button>`).join('');
      const decisoes = r.decisoes.length ? `
        <div class="rd-sub"><h3>Exigem decisão agora</h3>${r.totalDecisoes > r.decisoes.length ? `<button type="button" class="rd-link" data-rd="alertas">ver todas (${r.totalDecisoes}) →</button>` : ''}</div>
        <ul class="rd-decisoes">${r.decisoes.map((d) => `
          <li data-id="${esc(d.id)}">
            <button type="button" class="rd-abrir" data-abrir="${esc(d.id)}" title="${esc(d.titulo)} · ${esc(d.bairro)}${d.motivo ? ` · ${esc(d.motivo)}` : ''}"><span class="sev-txt ${d.severidade}">${SEV[d.severidade]}</span> <b>${esc(d.titulo)}</b>
              <small>${esc(d.bairro)}${d.motivo ? ` · ${esc(d.motivo)}` : ''}</small></button>
            <span class="rd-acoes">${GC.botoesAcao(d.ocorrencia, { compacto: true })}</span>
          </li>`).join('')}</ul>` : '';
      const g = r.gabinete;
      const gabinete = !g ? '' : `
        <button type="button" class="rd-gabinete ${g.tipo}" data-rd="gabinete">
          <span class="rd-ic">🚨</span><span><b>${g.tipo === 'ativo' ? `Gabinete de crise ativo: ${esc(g.titulo)}` : `Sugestão: gabinete preventivo · ${esc(g.titulo)}`}</b>
          <small>${esc(g.detalhe)}</small></span><span class="rd-ir">${g.tipo === 'ativo' ? 'Abrir' : 'Abrir gabinete'} →</span></button>`;
      return `
        <header class="rd-cab"><h2>☀ Resumo do dia <small>${esc(r.data)}${r.escopo ? ` · ${esc(r.escopo)}` : ''}</small></h2>
          <button type="button" class="rd-x" data-rd="recolher" aria-label="Ocultar resumo do dia" title="Ocultar resumo do dia">−</button></header>
        <div class="rd-destaques">${destaques}</div>${gabinete}${decisoes}`;
    }

    function ligar(r) {
      const em = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = (ev) => fn(b, ev); });
      em('[data-rd="recolher"]', () => alternar(true));
      em('[data-rd="alertas"]', () => cb.aoVerAlertas());
      em('[data-rd="gabinete"]', () => cb.aoGabinete(r.gabinete));
      em('[data-destaque]', (b) => cb.aoDestaque(r.destaques[+b.dataset.destaque]));
      em('[data-abrir]', (b) => cb.aoAbrirAlerta(b.dataset.abrir));
      em('.rd-decisoes [data-acao]', (b, ev) => { ev.stopPropagation(); cb.aoAgir(b.closest('li').dataset.id, b.dataset.acao); });
    }

    function alternar(valor = !recolhido) {
      if (valor === recolhido) return;
      recolhido = valor;
      el.hidden = recolhido;
      if (botao) { botao.setAttribute('aria-expanded', String(!recolhido)); botao.classList.toggle('ativo', !recolhido); }
      if (cb.aoAlternar) cb.aoAlternar(!recolhido);
      if (!recolhido && ultimo) { ultimoHtml = ''; atualizar(ultimo); }
    }
    if (botao) botao.addEventListener('click', () => alternar());

    // O relógio chama a cada passo: só redesenha quando o conteúdo muda (o botão não some sob o clique).
    function atualizar(r) {
      ultimo = r;
      if (contador) { contador.textContent = r.totalDecisoes; contador.hidden = !r.totalDecisoes; }
      if (recolhido) return; // fechado: só o contador do botão acompanha
      const html = corpo(r);
      if (html === ultimoHtml) return;
      ultimoHtml = html;
      el.innerHTML = html;
      ligar(r);
    }

    return { atualizar, alternar, aberto: () => !recolhido };
  };
})(window.GC = window.GC || {});
