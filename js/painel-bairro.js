(function (GC) {
  // Painel do bairro (gaveta da direita ao clicar num bairro no mapa): quem mora, o que está aberto agora,
  // como a população avalia e o que a prefeitura tem ali. Puro: recebe os dados, devolve HTML.
  const esc = (t) => GC.escaparHtml(t);
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const ORDEM = { critica: 0, alta: 1, media: 2 };
  const num = (n) => Number(n).toLocaleString('pt-BR');

  // Junta o que existe sobre o bairro (cada fonte é opcional: cidade sem um dado não quebra o painel).
  GC.resumoBairro = function (id, { ocorrencias = [], data = GC.data, leitos, escolas, obras } = {}) {
    const b = data.bairros.find((x) => x.id === id);
    if (!b) return null;
    const abertas = ocorrencias.filter((o) => o.bairroId === id)
      .sort((x, y) => ORDEM[x.severidade] - ORDEM[y.severidade] || x.criadaEm - y.criadaEm);
    const sat = (data.satisfacaoPorBairro || {})[id];
    const satCidade = (data.indicadoresBase || {}).satisfacaoPct;
    const bo = data.seguranca && data.seguranca.porBairro30d ? data.seguranca.porBairro30d[id] : undefined;
    const daqui = (lista) => (lista || []).filter((x) => x.bairroId === id);
    return {
      id, nome: b.nome, populacao: b.populacao,
      abertas,
      criticas: abertas.filter((o) => o.severidade === 'critica').length,
      satisfacao: sat, satisfacaoCidade: satCidade,
      bo30d: bo, boPorMil: bo !== undefined && b.populacao ? Math.round((bo / b.populacao) * 10000) / 10 : undefined,
      leitos: daqui(leitos), escolas: daqui(escolas), obras: daqui(obras),
    };
  };

  // filtrado: o painel inteiro já está recortado neste bairro (o botão vira "Tirar o filtro").
  GC.htmlBairro = function (r, { filtrado = false } = {}) {
    if (!r) return '';
    const satCor = r.satisfacao === undefined ? '' : r.satisfacao >= (r.satisfacaoCidade || 0) ? 'bom' : 'ruim';
    const kpi = (valor, rotulo, classe = '') => `<li class="${classe}"><b>${valor}</b><small>${rotulo}</small></li>`;
    const kpis = [
      kpi(r.abertas.length, r.abertas.length === 1 ? 'ocorrência aberta' : 'ocorrências abertas', r.criticas ? 'ruim' : ''),
      kpi(r.criticas, r.criticas === 1 ? 'crítica' : 'críticas', r.criticas ? 'ruim' : ''),
      r.satisfacao !== undefined ? kpi(`${r.satisfacao}%`, `satisfação${r.satisfacaoCidade ? ` · cidade ${r.satisfacaoCidade}%` : ''}`, satCor) : '',
      r.bo30d !== undefined ? kpi(num(r.bo30d), `B.O.s em 30 dias${r.boPorMil !== undefined ? ` · ${num(r.boPorMil)} por mil hab.` : ''}`) : '',
    ].join('');
    const lista = r.abertas.length
      ? `<ul class="bairro-lista">${r.abertas.map((o) => `<li><button type="button" data-ocorrencia="${esc(o.id)}">
          <span class="sev-pt ${o.severidade}" title="${SEV[o.severidade]}"></span>
          <span class="bairro-item"><b>${esc(o.titulo)}</b><small>${SEV[o.severidade]} · ${esc(GC.situacao ? GC.situacao(o) : o.status)}</small></span>
          <i class="ti ti-chevron-right" aria-hidden="true"></i></button></li>`).join('')}</ul>`
      : '<p class="bairro-vazio">✅ Nenhuma ocorrência aberta no bairro agora.</p>';
    const equip = [];
    if (r.leitos.length) {
      const pior = r.leitos.reduce((m, u) => Math.max(m, u.pct || 0), 0);
      equip.push(`<li><i class="ti ti-building-hospital" aria-hidden="true"></i> ${r.leitos.length} ${r.leitos.length === 1 ? 'unidade de saúde' : 'unidades de saúde'} · até ${pior}% dos leitos ocupados</li>`);
    }
    if (r.escolas.length) {
      const crit = r.escolas.filter((x) => x.situacao === 'critica').length;
      equip.push(`<li><i class="ti ti-school" aria-hidden="true"></i> ${r.escolas.length} ${r.escolas.length === 1 ? 'escola' : 'escolas'}${crit ? ` · <b class="ruim">${crit} em situação crítica</b>` : ''}</li>`);
    }
    if (r.obras.length) {
      const atr = r.obras.filter((x) => x.situacao === 'atrasada' || x.situacao === 'paralisada').length;
      equip.push(`<li><i class="ti ti-crane" aria-hidden="true"></i> ${r.obras.length} ${r.obras.length === 1 ? 'obra' : 'obras'}${atr ? ` · <b class="ruim">${atr} atrasada${atr > 1 ? 's' : ''} ou parada${atr > 1 ? 's' : ''}</b>` : ''}</li>`);
    }
    return `<div class="painel-bairro">
      <span class="info-tag">Bairro</span>
      <h3>${esc(r.nome)}</h3>
      <p class="bairro-pop"><i class="ti ti-users" aria-hidden="true"></i> ${num(r.populacao)} moradores</p>
      <ul class="bairro-kpis">${kpis}</ul>
      <h4>Abertas agora</h4>
      ${lista}
      ${equip.length ? `<h4>Serviços no bairro</h4><ul class="bairro-equip">${equip.join('')}</ul>` : ''}
      <div class="bairro-acoes">
        <button type="button" class="btn-sec${filtrado ? '' : ' principal'}" data-acao-bairro="filtrar" aria-pressed="${filtrado}"><i class="ti ti-${filtrado ? 'filter-off' : 'filter'}" aria-hidden="true"></i> ${filtrado ? 'Tirar o filtro do bairro' : 'Filtrar o painel por este bairro'}</button>
        <button type="button" class="btn-sec" data-acao-bairro="perguntar"><i class="ic-copiloto ic-ia" aria-hidden="true"></i> Perguntar à ${GC.agente()}</button>
        <button type="button" class="btn-sec" data-acao-bairro="cidade"><i class="ti ti-focus-2" aria-hidden="true"></i> Ver a cidade inteira</button>
      </div>
    </div>`;
  };
})(window.GC = window.GC || {});
