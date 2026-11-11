(function (GC) {
  // Resumo da semana: o cartão que abre na base do mapa, ao lado do Resumo do dia (mesma doca, um por vez).
  // O que melhorou e o que piorou (tendências), as entregas mais recentes e as secretarias que mais
  // ganharam e perderam no prazo de atendimento. A análise em texto fica com o Copiloto (botão no rodapé).
  const esc = (t) => GC.escaparHtml(t);
  const nomeArea = (id) => (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome;
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const DIA = 86400000;
  const MAX_ENTREGAS = 3;
  const MAX_LISTA = 4;

  // Só dados → objeto pronto para a tela (testável sem DOM). areas: secretarias filtradas (vazio = todas).
  GC.resumoDaSemana = function ({ tendencias = [], conquistas = [], desempenho = {}, areas = [], agora = Date.now() }) {
    const naArea = (a) => !areas.length || areas.includes(a);
    const porForca = (lista) => lista.slice().sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao));
    const tend = tendencias.filter((t) => naArea(t.area));
    const item = (t) => ({ area: t.area, secretaria: nomeArea(t.area), rotulo: t.rotulo, valor: t.valor });
    const melhorou = porForca(tend.filter((t) => t.positivo)).map(item);
    const piorou = porForca(tend.filter((t) => !t.positivo)).map(item);

    const entregas = conquistas.filter((c) => naArea(c.area)).slice()
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .map((c) => ({ id: c.id, titulo: c.titulo, area: c.area, bairro: nomeBairro(c.bairroId), data: c.data, descricao: c.descricao || '' }));

    // Prazo de atendimento: diferença (pontos percentuais) entre os últimos 30 dias e o período anterior.
    const prazos = Object.entries(desempenho).filter(([a, d]) => naArea(a) && d && d.anterior)
      .map(([a, d]) => ({ area: a, secretaria: nomeArea(a), noPrazoPct: d.noPrazoPct, variacaoPp: d.noPrazoPct - d.anterior.noPrazoPct }))
      .sort((x, y) => y.variacaoPp - x.variacaoPp);
    const ganhou = prazos.length && prazos[0].variacaoPp > 0 ? prazos[0] : null;
    const perdeu = prazos.length && prazos[prazos.length - 1].variacaoPp < 0 ? prazos[prazos.length - 1] : null;

    const fmt = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      periodo: `${fmt(agora - 6 * DIA)} a ${fmt(agora)}`,
      contagem: { melhorou: melhorou.length, piorou: piorou.length, entregas: entregas.length },
      melhorou: melhorou.slice(0, MAX_LISTA),
      piorou: piorou.slice(0, MAX_LISTA),
      entregas: entregas.slice(0, MAX_ENTREGAS),
      prazo: { ganhou, perdeu },
      escopo: areas.map(nomeArea).join(', ') || null,
    };
  };

  // ---- cartão sobre o mapa (mesmo lugar e mesmo visual do Resumo do dia) ----
  const dataCurta = (iso) => { const [, m, d] = String(iso).split('-'); return d && m ? `${d}/${m}` : ''; };
  const sinalPp = (n) => `${n > 0 ? '+' : ''}${n} p.p.`;

  GC.criarResumoSemana = function (el, cb, { botao = null } = {}) {
    let recolhido = true;
    let ultimo = null;
    let ultimoHtml = '';

    const linhaTend = (t, tom) => `<li><button type="button" class="rs-item tom-${tom}" data-area="${esc(t.area)}" title="Abrir ${esc(t.secretaria)}">
        <span><b>${esc(t.rotulo)}</b><small>${esc(t.secretaria)}</small></span><em>${esc(t.valor)}</em></button></li>`;

    function corpo(r) {
      const c = r.contagem;
      const contagem = `<div class="rd-destaques rs-numeros">
          <div class="rs-num tom-ok"><b>${c.melhorou}</b><small>${c.melhorou === 1 ? 'indicador melhorou' : 'indicadores melhoraram'}</small></div>
          <div class="rs-num tom-critico"><b>${c.piorou}</b><small>${c.piorou === 1 ? 'indicador piorou' : 'indicadores pioraram'}</small></div>
          <div class="rs-num tom-info"><b>${c.entregas}</b><small>${c.entregas === 1 ? 'entrega recente' : 'entregas recentes'}</small></div>
        </div>`;
      const colunas = `<div class="rs-colunas">
          <section><h3>📈 Melhorou</h3>${r.melhorou.length ? `<ul class="rs-lista">${r.melhorou.map((t) => linhaTend(t, 'ok')).join('')}</ul>` : '<p class="rs-vazio">Nada melhorou no recorte.</p>'}</section>
          <section><h3>📉 Piorou</h3>${r.piorou.length ? `<ul class="rs-lista">${r.piorou.map((t) => linhaTend(t, 'critico')).join('')}</ul>` : '<p class="rs-vazio">Nada piorou no recorte.</p>'}</section>
        </div>`;
      const { ganhou, perdeu } = r.prazo;
      const prazo = ganhou || perdeu ? `<div class="rd-sub"><h3>Prazo de atendimento · 30 dias × anterior</h3></div>
        <div class="rs-prazo">
          ${ganhou ? `<button type="button" class="rs-item tom-ok" data-area="${esc(ganhou.area)}"><span><b>${esc(ganhou.secretaria)}</b><small>${ganhou.noPrazoPct}% no prazo</small></span><em>${sinalPp(ganhou.variacaoPp)}</em></button>` : ''}
          ${perdeu ? `<button type="button" class="rs-item tom-critico" data-area="${esc(perdeu.area)}"><span><b>${esc(perdeu.secretaria)}</b><small>${perdeu.noPrazoPct}% no prazo</small></span><em>${sinalPp(perdeu.variacaoPp)}</em></button>` : ''}
        </div>` : '';
      const entregas = r.entregas.length ? `<div class="rd-sub"><h3>🏗 Entregas recentes</h3><button type="button" class="rd-link" data-rs="conquistas">ver no mapa →</button></div>
        <ul class="rs-entregas">${r.entregas.map((e) => `<li><button type="button" class="rs-entrega" data-conquista="${esc(e.id)}" title="${esc(e.descricao)}">
          <span class="rs-data">${dataCurta(e.data)}</span><span><b>${esc(e.titulo)}</b><small>${esc(e.bairro)}${e.descricao ? ` · ${esc(e.descricao)}` : ''}</small></span></button></li>`).join('')}</ul>` : '';
      return `
        <header class="rd-cab"><h2>📅 Resumo da semana <small>${esc(r.periodo)}${r.escopo ? ` · ${esc(r.escopo)}` : ''}</small></h2>
          <button type="button" class="rd-x" data-rs="recolher" aria-label="Ocultar resumo da semana" title="Ocultar resumo da semana">−</button></header>
        ${contagem}${colunas}${prazo}${entregas}
        ${cb.aoPerguntar ? '<button type="button" class="rs-copiloto" data-rs="copiloto">✨ Pedir a análise da semana ao ' + GC.agente() + '</button>' : ''}`;
    }

    function ligar() {
      const em = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = () => fn(b); });
      em('[data-rs="recolher"]', () => alternar(true));
      em('[data-rs="copiloto"]', () => cb.aoPerguntar('Resumo da semana'));
      em('[data-rs="conquistas"]', () => cb.aoVerEntregas(null));
      em('[data-conquista]', (b) => cb.aoVerEntregas(b.dataset.conquista));
      em('[data-area]', (b) => cb.aoAbrirSecretaria(b.dataset.area));
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

    function atualizar(r) {
      ultimo = r;
      if (recolhido) return;
      const html = corpo(r);
      if (html === ultimoHtml) return;
      ultimoHtml = html;
      el.innerHTML = html;
      ligar();
    }

    return { atualizar, alternar, aberto: () => !recolhido };
  };
})(window.GC = window.GC || {});
