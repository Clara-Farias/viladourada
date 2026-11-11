(function (GC) {
  // Central de alertas: todas as ocorrências numa tabela (filtros próprios da tela, ações na linha)
  // e, ao lado, as regras de monitoramento com a chave Ativa/Pausada.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const PESO = { critica: 0, alta: 1, media: 2 };
  const ORDEM_MOTIVO = { prazo: 0, conjunta: 1, recorrente: 2 };
  // Os nomes dos filtros são os mesmos dos números do topo (Abertas, Prazo estourado, Em campo).
  const SITUACOES = [['abertas', 'Abertas'], ['criticas', 'Críticas'], ['estourado', 'Prazo estourado'], ['em_campo', 'Em campo'], ['resolvidas', 'Resolvidas']];
  const FILTRO = {
    abertas: (o) => o.status !== 'resolvida',
    criticas: (o) => o.status !== 'resolvida' && o.severidade === 'critica',
    estourado: (o) => GC.estourada(o),
    em_campo: (o) => o.status === 'em_campo',
    resolvidas: (o) => o.status === 'resolvida',
  };
  // Situação curta: o prazo já tem coluna própria.
  const STATUS = { encaminhada: '📡 Encaminhada', em_campo: '🚧 Em campo', resolvida: '✅ Resolvida' };
  const ACAO = { cobrar: '📣 cobrada', priorizar: '⚡ priorizada', gabinete: '🚨 gabinete' };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  // Quando a equipe chegou: o registro "Equipe em campo" da linha do tempo (quem já nasce em campo, na criação).
  function chegadaEm(o) {
    const reg = (o.linhaTempo || []).find((x) => /em campo/i.test(x.texto));
    return reg ? reg.t : o.criadaEm;
  }

  // O prazo é para pôr equipe em campo. Depois disso, a coluna diz se ela chegou a tempo;
  // na resolvida, se fechou no prazo.
  GC.prazoAlerta = function (o) {
    if (o.status === 'resolvida') {
      return o.noPrazo === false ? { texto: 'resolvida fora do prazo', tom: 'ruim' } : { texto: 'resolvida no prazo', tom: 'ok' };
    }
    if (o.status === 'em_campo') {
      const atraso = (chegadaEm(o) - o.criadaEm) / 60000 - o.prazoMin;
      return atraso > 0 ? { texto: `equipe chegou ${GC.tempoTexto(atraso)} após o prazo`, tom: 'ruim' } : { texto: 'equipe chegou no prazo', tom: 'ok' };
    }
    const r = GC.prazoRestanteMin(o);
    return r < 0 ? { texto: `⏰ estourado há ${GC.tempoTexto(-r)}`, tom: 'estourado' } : { texto: `faltam ${GC.tempoTexto(r)}`, tom: '' };
  };

  // Números do topo: contados na mesma lista da tabela (perfil, secretaria e bairro da tela),
  // sem o filtro de situação, para não zerar ao clicar num chip.
  GC.resumoAlertas = function (lista) {
    const abertas = lista.filter((o) => o.status !== 'resolvida');
    return {
      abertas: abertas.length,
      estouradas: abertas.filter(GC.estourada).length,
      emCampo: abertas.filter((o) => o.status === 'em_campo').length,
    };
  };

  // Mesma prioridade da gaveta Alertas (gravidade, depois motivo); resolvidas por último, a mais recente primeiro.
  function ordenar(lista) {
    const chave = (o) => {
      const m = GC.motivosAtencao(o)[0];
      return m ? ORDEM_MOTIVO[m.tipo] : 3;
    };
    return lista.slice().sort((a, b) => (a.status === 'resolvida') - (b.status === 'resolvida')
      || (a.status === 'resolvida' ? b.resolvidaEm - a.resolvidaEm : 0)
      || PESO[a.severidade] - PESO[b.severidade]
      || chave(a) - chave(b)
      || GC.idadeMin(b) - GC.idadeMin(a));
  }

  function situacaoCurta(o) {
    if (o.status === 'resolvida') return `${STATUS.resolvida} há ${GC.tempoTexto((GC.agora() - o.resolvidaEm) / 60000)}`;
    return `${STATUS[o.status]}${o.acaoPrefeito ? ` · ${ACAO[o.acaoPrefeito]}` : ''}`;
  }

  function prazo(o) {
    const p = GC.prazoAlerta(o);
    const classe = p.tom === 'estourado' || p.tom === 'ruim' ? 'prazo-estourado' : p.tom === 'ok' ? 'suave' : '';
    return classe ? `<span class="${classe}">${esc(p.texto)}</span>` : esc(p.texto);
  }

  GC.criarTelaAlertas = function (el, { aoAgir, aoAbrir, aoVerNoMapa, aoAlternarRegra }) {
    const filtro = { situacao: 'abertas', area: '', bairro: '' };
    let ultimo = null;
    el.innerHTML = `
      <header class="sec-topo"><div><h2>📋 Central de alertas</h2><p>Todas as ocorrências da cidade e as regras que disparam os alertas.</p></div></header>
      <div class="alr-kpis"></div>
      <div class="filtros alr-filtros">
        <span class="alr-situacoes">${SITUACOES.map(([id, nome]) => `<button type="button" class="chip-filtro" data-situacao="${id}">${nome}</button>`).join('')}</span>
        <select class="alr-area" aria-label="Secretaria"><option value="">Todas as secretarias</option>${GC.data.areas.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select>
        <select class="alr-bairro" aria-label="Bairro"><option value="">Todos os bairros</option>${GC.data.bairros.map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join('')}</select>
      </div>
      <div class="alr-grade">
        <section class="rel-cartao alr-tabela-wrap"></section>
        <section class="rel-cartao alr-regras"><h3>Regras de monitoramento</h3><ul></ul></section>
      </div>`;
    el.querySelectorAll('[data-situacao]').forEach((b) => { b.onclick = () => { filtro.situacao = b.dataset.situacao; desenhar(); }; });
    el.querySelector('.alr-area').onchange = (e) => { filtro.area = e.target.value; desenhar(); };
    el.querySelector('.alr-bairro').onchange = (e) => { filtro.bairro = e.target.value; desenhar(); };

    const noRecorte = (o) => (!filtro.area || o.area === filtro.area || (o.areasEnvolvidas || []).includes(filtro.area))
      && (!filtro.bairro || o.bairroId === filtro.bairro);

    function linha(o) {
      // A regra técnica sai da linha (ruído para quem decide) e fica no title do título e no detalhe.
      const classe = o.status === 'resolvida' ? 'resolvida' : GC.estourada(o) && !o.acaoPrefeito ? 'estourada' : '';
      return `<tr data-id="${o.id}" data-abre-gaveta tabindex="0" class="${classe}">
          <td><span class="sev ${o.severidade}">${SEV[o.severidade]}</span></td>
          <td><b title="Regra: ${esc(GC.detalharOcorrencia(o).regra.expressao)}">${esc(o.titulo)}</b></td>
          <td>${esc(o.areasEnvolvidas.map((a) => area(a).nome).join(' + '))}</td>
          <td>${esc(bairro(o.bairroId).nome)}</td>
          <td>${prazo(o)}</td>
          <td class="alr-situacao">${esc(situacaoCurta(o))}</td>
          <td class="alr-acoes"><span class="alr-acao-principal">${GC.botoesAcao(o, { principal: true })}</span>${o.status !== 'resolvida' ? '<button type="button" class="btn-acao alr-mapa" title="Ver no mapa" aria-label="Ver no mapa">🗺</button>' : ''}</td>
        </tr>`;
    }

    // Resolvidas antes desta sessão: só o registro (sem gravidade nem regra), não abrem detalhe.
    function linhaHistorica(r) {
      return `<tr class="resolvida historica">
          <td><span class="suave">—</span></td>
          <td><b>${esc(r.titulo)}</b><small>registro do histórico</small></td>
          <td>${esc(area(r.area).nome)}</td>
          <td>${esc(bairro(r.bairroId).nome)}</td>
          <td>${r.atrasoMin ? `<span class="prazo-estourado">resolvida ${esc(GC.tempoTexto(r.atrasoMin))} após o prazo</span>` : '<span class="suave">resolvida no prazo</span>'}</td>
          <td class="alr-situacao">${esc(`${STATUS.resolvida} há ${GC.tempoTexto(r.haMin)}`)}</td>
          <td></td>
        </tr>`;
    }

    function tabela(lista, historico, total) {
      const visiveis = ordenar(lista.filter((o) => FILTRO[filtro.situacao](o) && noRecorte(o)));
      const resolvidas = filtro.situacao === 'resolvidas';
      const antigas = resolvidas ? historico.filter(noRecorte).slice().sort((a, b) => a.haMin - b.haMin) : [];
      const n = visiveis.length + antigas.length;
      // As resolvidas listadas são só as recentes; o total do mês vem do balanço de 30 dias.
      const rodape = resolvidas && total > n
        ? `<p class="alr-nota">Mostrando as ${n} mais recentes de ${total.toLocaleString('pt-BR')} resolvidas nos últimos 30 dias. <a href="${GC.hashDe({ tela: 'relatorios', tipo: 'alertas', alvo: '-', periodo: '30' })}">Ver o relatório de alertas</a></p>`
        : '';
      if (!n) {
        const nome = SITUACOES.find(([id]) => id === filtro.situacao)[1].toLowerCase();
        return `<p class="painel-vazio">Nenhuma ocorrência ${resolvidas ? 'resolvida recentemente' : `em “${esc(nome)}”`} neste recorte.</p>${rodape}`;
      }
      return `<table class="sec-tabela alr-tabela"><thead><tr><th>Gravidade</th><th>Alerta</th><th>Secretaria</th><th>Bairro</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>
        ${visiveis.map(linha).join('')}${antigas.map(linhaHistorica).join('')}</tbody></table>${rodape}`;
    }

    function regras(lista) {
      return lista.map((r) => `<li class="${r.ativa ? '' : 'pausada'}">
        <label class="alr-chave" title="${r.ativa ? 'Pausar esta regra' : 'Reativar esta regra'}"><input type="checkbox" data-regra="${esc(r.id)}"${r.ativa ? ' checked' : ''}><span></span></label>
        <div><b>${esc(r.nome)}</b>${r.nova ? ' <span class="rel-etq t-ok">nova</span>' : ''}${!r.ativa ? ` <span class="rel-etq t-at">pausada${r.retidas ? ` · ${r.retidas} retida${r.retidas > 1 ? 's' : ''}` : ' · nenhuma retida'}</span>` : ''}
          <code>${esc(r.expressao)}</code><small>${esc(r.fontes.join(' × '))} · ${r.disparos30d} disparos/30d${r.area ? ` · ${esc(area(r.area).nome)}` : ''}</small></div></li>`).join('');
    }

    function desenhar() {
      if (!ultimo) return;
      const { ocorrencias, historico, regras: lista, desempenho } = ultimo;
      const k = GC.resumoAlertas(ocorrencias.filter(noRecorte));
      const d = desempenho(filtro.area || null, filtro.bairro || null).resumo;
      // Por bairro não há tempo de resolução próprio: o número é o da cidade (ou da secretaria), e a nota diz isso.
      const notaTempo = filtro.bairro ? 'sem dado por bairro: média geral' : `${d.resolvidas.toLocaleString('pt-BR')} resolvidas · ${d.noPrazoPct}% no prazo`;
      el.querySelector('.alr-kpis').innerHTML = [
        ['Abertas', k.abertas, '', ''], ['Prazo estourado', k.estouradas, k.estouradas ? 'ruim' : '', ''],
        ['Em campo', k.emCampo, '', ''],
        ['Tempo médio de resolução · 30 dias', `${d.tempoMedioH.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`, '', notaTempo],
      ].map(([r, v, tom, nota]) => `<div class="rel-numero"><small>${r}</small><b class="${tom}">${esc(String(v))}</b>${nota ? `<small class="alr-kpi-nota">${esc(nota)}</small>` : ''}</div>`).join('');
      el.querySelectorAll('[data-situacao]').forEach((b) => {
        const ativo = b.dataset.situacao === filtro.situacao;
        b.classList.toggle('ativo', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      const wrap = el.querySelector('.alr-tabela-wrap');
      wrap.innerHTML = tabela(ocorrencias, historico || [], d.resolvidas);
      wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
        tr.onclick = () => aoAbrir(tr.dataset.id);
        tr.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); aoAbrir(tr.dataset.id); } };
        tr.querySelectorAll('[data-acao]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); aoAgir(tr.dataset.id, b.dataset.acao); }; });
        const mapa = tr.querySelector('.alr-mapa');
        if (mapa) mapa.onclick = (e) => { e.stopPropagation(); aoVerNoMapa(tr.dataset.id); };
      });
      const ul = el.querySelector('.alr-regras ul');
      ul.innerHTML = regras(lista);
      ul.querySelectorAll('[data-regra]').forEach((c) => { c.onchange = () => aoAlternarRegra(c.dataset.regra); });
    }

    function atualizar(estado) {
      ultimo = estado;
      GC.redesenharMantendo(el, ['.alr-tabela-wrap', '.alr-regras ul'], desenhar);
    }

    return { mostrar: atualizar, atualizar };
  };
})(window.GC = window.GC || {});
