(function (GC) {
  // Gaveta sobre o mapa com tudo que justifica a decisão sobre um alerta:
  // regra, evidências, impacto, responsável, ação recomendada e linha do tempo.
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const STATUS = { encaminhada: '📡 Encaminhada', em_campo: '🚧 Equipe em campo', resolvida: '✅ Resolvida' };
  const NOME_SEV = { critica: 'crítica', alta: 'alta', media: 'média' };
  const esc = (t) => GC.escaparHtml(t);
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);

  function tempo(min) {
    if (min < 60) return `${min} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  }

  function relativo(t) {
    const min = Math.round((GC.agora() - t) / 60000);
    return min < 1 ? 'agora' : `há ${tempo(min)}`;
  }

  GC.criarGaveta = function (el, opcoes) {
    const { aoAgir, aoPerguntar, aoFechar } = opcoes;
    let atual = null;
    let esconder = null;
    let voltar = null; // veio da gaveta Alertas: "← Alertas" volta para a lista

    // Desliza para fora e só então some.
    function fechar() {
      if (!atual) return;
      atual = null;
      el.classList.remove('aberta');
      clearTimeout(esconder);
      esconder = setTimeout(() => { if (!atual) el.hidden = true; }, 300);
      if (aoFechar) aoFechar();
    }

    function desenhar(o) {
      const d = GC.detalharOcorrencia(o);
      const sec = area(o.area).secretaria;
      const estourada = GC.estourada(o);
      const pendente = GC.estourada(o) && !o.acaoPrefeito
        ? '<li class="pendente"><span>agora</span>⏰ Prazo estourado, sem equipe em campo</li>'
        : '';
      const passos = o.linhaTempo.map((p) => `<li class="feito"><span>${relativo(p.t)}</span>${esc(p.texto)}</li>`).join('') + pendente;
      const responsavel = `<b>👤 ${esc(o.responsavel || '—')}</b>`;
      const restante = GC.prazoRestanteMin(o);
      const pct = Math.max(0, Math.min(100, (GC.idadeMin(o) / o.prazoMin) * 100));
      // Depois de uma ação do prefeito, a faixa mostra o que foi feito (não mais o alarme).
      const alarme = estourada && !o.acaoPrefeito;
      const prazo = o.status === 'resolvida'
        ? `<span>${o.noPrazo ? '✅ Resolvida no prazo' : '⏰ Resolvida fora do prazo'}</span>`
        : o.status === 'em_campo' || o.acaoPrefeito
          ? `<span>${esc(GC.situacao(o))}</span>`
          : estourada
            ? `<span>⏰ Estourado há <b>${tempo(Math.round(-restante))}</b> (prazo de ${NOME_SEV[o.severidade]}: ${tempo(o.prazoMin)})</span>`
            : `<span>⏳ Faltam <b>${tempo(Math.round(restante))}</b> (prazo de ${NOME_SEV[o.severidade]}: ${tempo(o.prazoMin)})</span>`;
      el.innerHTML = `
        ${voltar ? '<button type="button" class="gaveta-voltar" data-abre-gaveta>← Alertas</button>' : ''}
        <button type="button" class="gaveta-fechar" aria-label="Fechar">✕</button>
        <div class="gaveta-topo">
          <span class="sev ${o.severidade}">${SEV[o.severidade]}</span>
          <span class="gaveta-meta">${sec.emoji} ${esc(sec.nome)} · ${esc(bairro(o.bairroId).nome)} · há ${tempo(Math.round(GC.idadeMin(o)))}</span>
          ${STATUS[o.status] ? `<span class="gaveta-status ${o.status}">${STATUS[o.status]}</span>` : ''}
        </div>
        <h2>${area(o.area).emoji} ${esc(o.titulo)}</h2>
        <div class="gaveta-prazo${alarme ? ' estourada' : ''}">
          <div class="gaveta-prazo-linha">${prazo}<span>${responsavel}</span></div>
          ${o.status === 'encaminhada' ? `<div class="gaveta-barra"><i style="width:${pct.toFixed(0)}%"></i></div>` : ''}
        </div>
        <h3>Por que este alerta disparou</h3>
        <p class="gaveta-regra-texto">${esc(GC.regraEmPalavras(d.regra))}</p>
        <p class="gaveta-nota">Cruza <b>${d.regra.fontes.map(esc).join(' e ')}</b> · aconteceu ${d.regra.disparos30d}× nos últimos 30 dias</p>
        <details class="gaveta-tecnica"><summary>Ver regra técnica</summary><code class="gaveta-regra">${esc(d.regra.expressao)}</code></details>
        <h3>Evidências nos dados</h3>
        <ul class="gaveta-evidencias">${d.evidencias.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <h3>Impacto e responsável</h3>
        <div class="gaveta-duo">
          <div><small>Impacto</small><b>${esc(d.impacto)}</b></div>
          <div><small>Responsável</small>${responsavel}</div>
        </div>
        <h3>Ação recomendada pela IA</h3>
        <div class="gaveta-ia">✨ ${esc(d.acaoRecomendada)}</div>
        <h3>Linha do tempo</h3>
        <ul class="gaveta-tempo">${passos}</ul>
        <div class="gaveta-botoes">
          ${GC.botoesAcao(o, { completo: true })}
          <button type="button" class="btn-detalhes gaveta-perguntar">✨ Perguntar à ${GC.agente()}</button>
        </div>`;
      el.querySelector('.gaveta-fechar').onclick = fechar;
      const bv = el.querySelector('.gaveta-voltar');
      if (bv) bv.onclick = () => { const v = voltar; if (v) v(); };
      el.querySelector('.gaveta-perguntar').onclick = () => aoPerguntar(o.id);
      el.querySelectorAll('[data-acao]').forEach((b) => { b.onclick = () => aoAgir(o.id, b.dataset.acao); });
    }

    function abrir(o, opcoesAbrir = {}) {
      if (!o) return;
      atual = o.id;
      voltar = opcoesAbrir.voltar || null;
      desenhar(o);
      clearTimeout(esconder);
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('aberta'));
      el.scrollTop = 0;
    }

    // Só redesenha se for a ocorrência aberta (mantém a rolagem).
    function atualizar(o) {
      if (!o || o.id !== atual) return;
      const rolagem = el.scrollTop;
      desenhar(o);
      el.scrollTop = rolagem;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    // Clique fora recolhe a gaveta (no mapa, num bairro, no chat...). Quem abre outro
    // alerta (cartões, "Ver detalhes") é marcado com data-abre-gaveta e só troca o conteúdo.
    document.addEventListener('pointerdown', (e) => {
      if (!atual || el.contains(e.target) || (e.target.closest && e.target.closest('[data-abre-gaveta]'))) return;
      fechar();
    });
    // Cliques e rolagem na gaveta não chegam ao mapa: ela fica fora de #mapa (é irmã dele no palco).

    return { abrir, atualizar, fechar, abertaId: () => atual };
  };
})(window.GC = window.GC || {});
