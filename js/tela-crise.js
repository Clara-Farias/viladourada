(function (GC) {
  // Tela do Gabinete de crise (#/crise/<id>): números da sala, ações por secretaria (Cobrar / Avançar),
  // chuva prevista, comunicado à população e o registro da crise. Sem gabinete aberto (ou em
  // #/crise/novo), mostra a listagem: as salas, o que pede gabinete agora e o contexto de risco.
  const esc = (t) => GC.escaparHtml(t);
  const STATUS = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
  const CLASSE = { a_fazer: 'st-atencao', em_andamento: 'st-andamento', concluida: 'st-concluida', cancelada: 'st-cancelada' };
  const FIM = (t) => t.status === 'concluida' || t.status === 'cancelada';
  const PROXIMO = { a_fazer: '▶ Iniciar', em_andamento: '✓ Concluir' };
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  GC.CRISE_NOVO = 'novo'; // #/crise/novo: a tela de abrir gabinete, mesmo com outro já aberto

  GC.criarTelaCrise = function (el, cb) {
    const pode = (acao, area) => (GC.podeNaCrise ? GC.podeNaCrise(acao, area) : true);
    let atualId = null;
    let encerradoAntes = null;
    // O relógio redesenha a tela a cada passo: só troca o HTML que mudou, senão um botão
    // some debaixo do clique do prefeito. Texto que muda todo minuto (prazos, "aberto há") fica em
    // pedaços separados dos botões; e, se ainda assim um botão com foco for trocado, o foco volta
    // para o botão equivalente (quem usa teclado não perde o lugar).
    const ultimo = new WeakMap();
    const escCss = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));
    function trocarEm(alvo, html) {
      if (!alvo || ultimo.get(alvo) === html) return;
      const foco = document.activeElement;
      const chave = foco && foco !== alvo && alvo.contains(foco)
        ? [...foco.attributes].find((a) => a.name.startsWith('data-')) : null;
      alvo.innerHTML = html;
      ultimo.set(alvo, html);
      if (chave) {
        const novo = alvo.querySelector(`[${chave.name}="${escCss(chave.value)}"]`);
        if (novo) novo.focus();
      }
    }
    const trocar = (sel, html) => trocarEm(el.querySelector(sel), html);

    function prazo(t) {
      if (t.status === 'concluida') return `concluída às ${hora(t.concluidaEm)}`;
      if (t.status === 'cancelada') return 'cancelada no encerramento';
      if (t.atrasada) return `<span class="cr-atrasada">⏰ atrasada há ${GC.tempoTexto(-t.restanteMin)}</span>`;
      return `prazo: faltam ${GC.tempoTexto(t.restanteMin)}`;
    }

    // "← Todos os gabinetes" (volta à listagem, de onde também se abre outro) e, com mais de um
    // gabinete, uma aba por gabinete para trocar de sala sem passar pela lista.
    function abas(e) {
      const outros = e.gabinetes.length > 1 ? `<span class="cr-abas-sep" aria-hidden="true"></span>${e.gabinetes.map((g) => `
        <button type="button" data-gabinete="${esc(g.id)}" class="${g.id === atualId ? 'ativo' : ''}"${g.id === atualId ? ' aria-current="page"' : ''}>
          ${g.encerradoEm ? '✅' : '🚨'} ${esc(g.titulo)}</button>`).join('')}` : '';
      return `<nav class="cr-abas" aria-label="Gabinetes">
        <button type="button" data-gabinete="${GC.CRISE_NOVO}" class="cr-voltar">← Todos os gabinetes</button>${outros}</nav>`;
    }

    // Cabeçalho em duas partes: o texto (muda todo minuto: "aberto há") e os botões (estáveis).
    function cabecalhoTexto(r) {
      const g = r.gabinete;
      const origem = g.origem === 'previsao' ? 'preventivo · previsão de chuva' : 'convocado pelo prefeito';
      return `
            <p class="cr-sobre">${g.encerradoEm ? '✅ Gabinete de crise · encerrado' : '<span class="cr-pulso" aria-hidden="true"></span>Gabinete de crise · ao vivo'}</p>
            <h2>${esc(g.titulo)}</h2>
            <p class="cr-fatos"><span>📍 ${esc(r.bairro)}</span><span>${origem}</span><span>${g.encerradoEm ? 'durou' : 'aberto há'} <b>${GC.tempoTexto(r.abertoHaMin)}</b></span></p>`;
    }

    function cabecalhoAcoes(r) {
      const g = r.gabinete;
      return `
            ${g.ocorrenciaId ? '<button type="button" class="btn-sec" data-cr="alerta">🔔 Alerta de origem</button>' : ''}
            <button type="button" class="btn-sec" data-cr="mapa">🗺 Ver no mapa</button>
            <button type="button" class="btn-sec" data-cr="afetados">✨ Quem será afetado?</button>
            ${g.encerradoEm || !pode('gerir') ? '' : '<button type="button" class="btn-primario" data-cr="encerrar">Encerrar gabinete</button>'}`;
    }

    function numeros(r) {
      const g = r.gabinete;
      const c = r.ultimoComunicado;
      // Cada número diz o estado pela cor da borda: vermelho pede ação, verde está resolvido.
      const pendenteComunicado = !c && !g.encerradoEm;
      return `<div class="sec-indicadores">
        <div class="sec-ind cr-kpi"><small>Secretarias acionadas</small><b>${g.areas.length}</b><span class="cr-kpi-icones">${g.areas.map((a) => (GC.data.areas.find((x) => x.id === a) || {}).emoji || '').join(' ')}</span></div>
        <div class="sec-ind cr-kpi ${r.total && r.feitas === r.total ? 'ok' : ''}"><small>Tarefas concluídas</small><b>${r.feitas}/${r.total} <em>${r.pct}%</em></b><div class="sec-barra"><i class="st-concluida" style="width:${r.pct}%"></i></div>${r.canceladas ? `<span class="cr-kpi-nota">${r.canceladas} ${r.canceladas === 1 ? 'cancelada' : 'canceladas'}</span>` : ''}</div>
        <div class="sec-ind cr-kpi ${r.atrasadas ? 'alerta' : 'ok'}"><small>Tarefas atrasadas</small><b>${r.atrasadas}</b><span class="${r.atrasadas ? 'pior' : 'melhor'}">${r.atrasadas ? 'cobre a secretaria' : 'tudo no prazo'}</span></div>
        <div class="sec-ind cr-kpi"><small>Moradores afetados</small><b>${num(g.moradores)}</b><span class="cr-kpi-nota">estimativa</span></div>
        <div class="sec-ind cr-kpi ${pendenteComunicado ? 'pendente' : c ? 'ok' : ''}"><small>Comunicado à população</small><b>${c ? num(c.alcance) : '—'}</b>${pendenteComunicado && pode('comunicar')
          ? '<button type="button" class="cr-kpi-acao" data-cr="ir-comunicado">Escrever comunicado →</button>'
          : `<span class="${c ? 'melhor' : 'pior'}">${c ? `pessoas · publicado às ${hora(c.t)}` : 'não publicado'}</span>`}</div>
      </div>`;
    }

    // Cada tarefa tem o texto que muda com o relógio (status e prazo) separado dos botões, que só
    // mudam quando a tarefa avança: o relógio nunca troca o botão debaixo do clique.
    // Barra do prazo: quanto do tempo da tarefa já passou (verde, âmbar a partir de 70%, vermelho estourado).
    function barraPrazo(t) {
      if (FIM(t) || !t.prazoMin) return '';
      const usado = Math.min(100, Math.max(0, Math.round(((t.prazoMin - t.restanteMin) / t.prazoMin) * 100)));
      const nivel = t.atrasada ? 'estourado' : usado >= 70 ? 'perto' : 'folga';
      return `<i class="cr-prazo-barra ${nivel}" aria-hidden="true"><b style="width:${usado}%"></b></i>`;
    }

    function tarefaMeta(t) {
      return `<span class="cr-meta-linha"><span class="sec-status ${CLASSE[t.status]}">${STATUS[t.status]}</span> ${prazo(t)}${t.cobrancas ? ` <span class="cr-cobrada">📣 cobrada ${t.cobrancas}×</span>` : ''}</span>${barraPrazo(t)}`;
    }

    const classeTarefa = (t) => `cr-t-${t.status}${t.atrasada ? ' atrasada' : ''}`;

    // Ordem de urgência: atrasadas primeiro, depois o prazo mais curto; concluídas no fim.
    const ordenadas = (r) => r.tarefas.slice().sort((a, b) =>
      FIM(a) - FIM(b) || (b.atrasada ? 1 : 0) - (a.atrasada ? 1 : 0) || a.restanteMin - b.restanteMin);

    function tarefaBotoes(t, fechado) {
      if (fechado || FIM(t) || !(pode('cobrar', t.area) || pode('avancar', t.area) || pode('gerir'))) return '';
      return `${pode('gerir') ? `<button type="button" class="btn-sec cr-mais-prazo" data-estender="${esc(t.id)}" title="Dar mais 30 minutos de prazo">+30 min</button>` : ''}
            ${pode('cobrar', t.area) ? `<button type="button" class="btn-sec" data-cobrar="${esc(t.id)}">📣 Cobrar</button>` : ''}
            ${pode('avancar', t.area) ? `<button type="button" class="btn-primario" data-avancar="${esc(t.id)}">${PROXIMO[t.status]}</button>` : ''}`;
    }

    const idsTarefas = (r) => ordenadas(r).map((t) => t.id).join(',');

    function tarefas(r) {
      const fechado = !!r.gabinete.encerradoEm;
      return `<ul class="cr-tarefas" data-ids="${esc(idsTarefas(r))}">${ordenadas(r).map((t) => `
        <li class="${classeTarefa(t)}" data-tarefa="${esc(t.id)}">
          <span class="cr-sec">${t.secretaria.emoji} ${esc(t.secretaria.nome)}</span>
          <span class="cr-texto">${esc(t.texto)}</span>
          <span class="cr-meta">${tarefaMeta(t)}</span>
          <span class="cr-botoes">${tarefaBotoes(t, fechado)}</span>
        </li>`).join('')}</ul>`;
    }

    // Mesma lista de tarefas: atualiza tarefa por tarefa (só o pedaço que mudou). Lista diferente: redesenha.
    function desenharTarefas(r) {
      const fechado = !!r.gabinete.encerradoEm;
      const ul = el.querySelector('.cr-tarefas');
      if (!ul || ul.dataset.ids !== idsTarefas(r)) {
        trocar('.cr-tarefas-wrap', tarefas(r));
        r.tarefas.forEach((t) => {
          const li = el.querySelector(`.cr-tarefas li[data-tarefa="${escCss(t.id)}"]`);
          if (!li) return;
          ultimo.set(li.querySelector('.cr-meta'), tarefaMeta(t));
          ultimo.set(li.querySelector('.cr-botoes'), tarefaBotoes(t, fechado));
        });
        return;
      }
      r.tarefas.forEach((t) => {
        const li = ul.querySelector(`li[data-tarefa="${escCss(t.id)}"]`);
        if (!li) return;
        if (li.className !== classeTarefa(t)) li.className = classeTarefa(t);
        trocarEm(li.querySelector('.cr-meta'), tarefaMeta(t));
        trocarEm(li.querySelector('.cr-botoes'), tarefaBotoes(t, fechado));
      });
    }

    // Barras da chuva prevista (acumulada por janela). Com uma área de risco escolhida, desenha a linha
    // do limite dela e pinta de vermelho as janelas que passam do limite. Deslizamento conta também o
    // que já choveu (solo encharcado): o limite que sobra para a chuva que vem é limiar − acumulado 72 h.
    function limiteDaArea(p, a) {
      if (!a || !Number.isFinite(a.limiarMm)) return null;
      return a.limiarMm - (a.tipo === 'deslizamento' ? p.acumulado72h : 0);
    }
    function barras(p, area) {
      const limite = limiteDaArea(p, area);
      const max = Math.max(...p.janelas.map((j) => j.mm), limite > 0 ? limite * 1.08 : 0, 1);
      const acima = (j) => limite !== null && j.mm >= limite;
      const rotulo = limite === null ? '' : limite <= 0 ? `; o limite de ${area.nome} já foi atingido` : `; limite de ${area.nome}: ${limite} mm`;
      return `<div class="cr-barras" role="img" aria-label="Chuva prevista acumulada: ${p.janelas.map((j) => `${j.mm} mm em ${j.horas} h`).join(', ')}${esc(rotulo)}">
          ${p.janelas.map((j) => `<div class="cr-barra${acima(j) ? ' acima' : ''}"><b>${j.mm} mm</b><i style="height:${Math.round((j.mm / max) * 100)}%"></i><small>${j.horas} h</small></div>`).join('')}
          ${limite === null ? '' : `<span class="cr-limite${limite <= 0 ? ' atingido' : ''}" style="bottom:${limite <= 0 ? 0 : Math.round((limite / max) * 100)}%" aria-hidden="true"><em>${limite <= 0 ? 'limite já atingido' : `limite ${limite} mm`}</em></span>`}
        </div>`;
    }
    // Legenda do gráfico: qual área, quando passa do limite e o porquê do número.
    function legendaLimite(p, a) {
      const limite = limiteDaArea(p, a);
      if (limite === null) return '';
      const passa = p.janelas.find((j) => j.mm >= limite);
      return `<p class="cr-limite-legenda"><i aria-hidden="true"></i><span><b>${esc(a.nome)}</b>: ${limite <= 0
        ? 'a chuva que já caiu passou do limite da encosta'
        : `aguenta ${limite} mm${a.tipo === 'deslizamento' ? ` (limite de ${a.limiarMm} mm menos os ${p.acumulado72h} mm que já caíram)` : ''}`} · ${passa ? `passa do limite em ~${passa.horas} h` : 'não passa do limite nas próximas 24 h'}</span></p>`;
    }
    const NIVEL_TEXTO = { alto: 'alto', medio: 'médio', baixo: 'baixo' };
    const seloRisco = (a) => `<span class="sec-status ${a.nivel === 'alto' ? 'st-critico' : a.nivel === 'medio' ? 'st-atencao' : 'st-em_dia'}">risco ${NIVEL_TEXTO[a.nivel] || a.nivel}</span>`;

    // Área cujo limite aparece no gráfico: a escolhida (clique ou passar o mouse na lista) ou a sugerida.
    let areaGrafico = null;
    const areaEscolhida = (areas, sugerida) => areas.find((a) => a.id === areaGrafico) || sugerida || areas[0] || null;

    function chuva(e) {
      const p = e.risco.previsao;
      const g = e.atual.gabinete;
      const doBairro = e.risco.areas.filter((a) => a.bairroId === g.bairroId || a.id === g.areaRiscoId);
      const area = areaEscolhida(doBairro, doBairro.find((a) => a.id === g.areaRiscoId));
      return `
        ${barras(p, area)}
        <p class="cr-nota">Já choveu ${p.acumulado72h} mm em 72 h · ${esc(p.fonte)}, atualizada há ${p.atualizadaHaMin} min</p>
        ${legendaLimite(p, area)}
        ${doBairro.length ? `<h4>Áreas de risco em ${esc(e.atual.bairro)}</h4><ul class="cr-riscos">${doBairro.map((a) => `
          <li class="${area && a.id === area.id ? 'no-grafico' : ''}"><button type="button" class="cr-risco-ver" data-area-grafico="${esc(a.id)}" aria-pressed="${!!area && a.id === area.id}">${seloRisco(a)}
          <b>${esc(a.nome)}</b> · ${a.familias} famílias${a.horasAte ? ` · limite em ~${a.horasAte} h` : ''}</button><small>${esc(a.acao)}</small></li>`).join('')}</ul>` : ''}`;
    }

    // Mini-mapa da sala (SVG, sem carregar outro mapa): o bairro do gabinete e os vizinhos, as áreas de
    // risco (a do gabinete em destaque) e as ocorrências abertas por perto; a de origem pulsa.
    const COR_SEV = { critica: '#dc2626', alta: '#ea580c', media: '#d97706' };
    const COR_RISCO = { alto: '#dc2626', medio: '#d97706', baixo: '#16a34a' };
    function miniMapa(e) {
      const g = e.atual.gabinete;
      const foco = GC.data.bairros.find((b) => b.id === g.bairroId);
      if (!foco || !Array.isArray(foco.poligono) || !foco.poligono.length) return '<p class="painel-vazio">Sem o contorno do bairro para desenhar o mapa.</p>';
      const areaG = e.risco.areas.find((a) => a.id === g.areaRiscoId);
      const origem = (e.pontos || []).find((o) => o.id === g.ocorrenciaId);
      const base = [...foco.poligono, ...(areaG ? areaG.poligono : []), ...(origem ? [[origem.lat, origem.lng]] : [])];
      const lats = base.map((x) => x[0]);
      const lngs = base.map((x) => x[1]);
      let [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
      const folgaLat = (maxLat - minLat) * 0.6 || 0.004;
      const folgaLng = (maxLng - minLng) * 0.6 || 0.004;
      minLat -= folgaLat; maxLat += folgaLat; minLng -= folgaLng; maxLng += folgaLng;
      const W = 320;
      const H = 200;
      const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
      const s = Math.min(W / ((maxLng - minLng) * k), H / (maxLat - minLat));
      const ox = (W - (maxLng - minLng) * k * s) / 2;
      const oy = (H - (maxLat - minLat) * s) / 2;
      const P = ([lat, lng]) => [ox + (lng - minLng) * k * s, oy + (maxLat - lat) * s];
      const caminho = (pts) => `M${pts.map((x) => P(x).map((n) => n.toFixed(1)).join(' ')).join('L')}Z`;
      const dentro = ([x, y]) => x > -20 && x < W + 20 && y > -20 && y < H + 20;
      const bairros = GC.data.bairros.filter((b) => Array.isArray(b.poligono) && b.poligono.some((x) => dentro(P(x))));
      const riscos = e.risco.areas.filter((a) => Array.isArray(a.poligono) && a.poligono.some((x) => dentro(P(x))));
      const pontos = (e.pontos || []).filter((o) => dentro(P([o.lat, o.lng])));
      const svg = `<svg class="cr-minimapa-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de ${esc(foco.nome)}: ${riscos.length} ${riscos.length === 1 ? 'área de risco' : 'áreas de risco'} e ${pontos.length} ${pontos.length === 1 ? 'ocorrência aberta' : 'ocorrências abertas'} por perto">
          ${bairros.map((b) => `<path d="${caminho(b.poligono)}" class="cr-mm-bairro${b.id === foco.id ? ' foco' : ''}"><title>${esc(b.nome)}</title></path>`).join('')}
          ${riscos.map((a) => `<path d="${caminho(a.poligono)}" class="cr-mm-risco${a.id === g.areaRiscoId ? ' do-gabinete' : ''}" style="--cor:${COR_RISCO[a.nivel] || '#64748b'}"><title>${esc(a.nome)} · risco ${NIVEL_TEXTO[a.nivel] || a.nivel}</title></path>`).join('')}
          ${bairros.filter((b) => b.centro && dentro(P(b.centro))).map((b) => { const [x, y] = P(b.centro); return `<text x="${x.toFixed(1)}" y="${(y + (b.id === foco.id ? 22 : 0)).toFixed(1)}" class="cr-mm-nome${b.id === foco.id ? ' foco' : ''}">${esc(b.nome)}</text>`; }).join('')}
          ${pontos.map((o) => { const [x, y] = P([o.lat, o.lng]); const eOrigem = o.id === g.ocorrenciaId; return `<g class="cr-mm-ponto${eOrigem ? ' origem' : ''}" data-ponto="${esc(o.id)}" tabindex="0" role="button" aria-label="${esc(o.titulo)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${eOrigem ? 7 : 5}" fill="${COR_SEV[o.severidade] || '#2563eb'}"><title>${esc(o.titulo)}</title></circle>${eOrigem ? `<circle class="cr-mm-anel" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>` : ''}</g>`; }).join('')}
        </svg>`;
      return `${svg}
        <ul class="cr-mm-legenda">
          <li><i class="bairro"></i>${esc(foco.nome)}</li>
          ${riscos.length ? '<li><i class="risco"></i>Área de risco</li>' : ''}
          ${origem ? '<li><i class="origem"></i>Ocorrência de origem</li>' : ''}
          ${pontos.length - (origem ? 1 : 0) > 0 ? `<li><i class="ponto"></i>${pontos.length - (origem ? 1 : 0)} ${pontos.length - (origem ? 1 : 0) === 1 ? 'outra ocorrência' : 'outras ocorrências'} aberta${pontos.length - (origem ? 1 : 0) === 1 ? '' : 's'}</li>` : ''}
        </ul>`;
    }

    // Fase sugerida: sem comunicado ainda é alerta; depois, atualização; com tudo feito, normalização.
    function faseSugerida(r) {
      if (!r.gabinete.comunicados.length) return 'alerta';
      return r.total && r.feitas === r.total ? 'normalizacao' : 'atualizacao';
    }

    function formulario(e) {
      const g = e.atual.gabinete;
      if (g.encerradoEm) return '<p class="painel-vazio">Gabinete encerrado: não há novos comunicados.</p>';
      if (!pode('comunicar')) return '<p class="painel-vazio">O comunicado à população é publicado pelo Gabinete do Prefeito.</p>';
      const fase = faseSugerida(e.atual);
      const r = (e.rascunhos || {})[fase] || { texto: '', sms: '' };
      return `<form class="cr-form">
        <div class="cr-fases" role="group" aria-label="Modelo do comunicado">${GC.FASES_COMUNICADO.map((f) => `
          <button type="button" data-fase="${f.id}" aria-pressed="${f.id === fase}">${esc(f.nome)}</button>`).join('')}
        </div>
        <label class="cr-rotulo" for="cr-texto">Texto completo · WhatsApp, redes e rádio (revise antes de publicar)</label>
        <textarea id="cr-texto" rows="5" aria-describedby="cr-contador">${esc(r.texto)}</textarea>
        <small class="cr-contador" id="cr-contador"></small>
        <div class="cr-sms-bloco">
          <label class="cr-rotulo" for="cr-sms">Versão SMS · sem acentos, para caber em uma mensagem</label>
          <textarea id="cr-sms" rows="2" aria-describedby="cr-contador-sms">${esc(r.sms)}</textarea>
          <small class="cr-contador" id="cr-contador-sms"></small>
        </div>
        <fieldset class="cr-canais"><legend>Canais</legend>${GC.CANAIS_COMUNICADO.map((c, i) => `
          <label class="cr-canal"><input type="checkbox" name="canal" value="${c.id}"${i < 2 ? ' checked' : ''}><span><b>${esc(c.nome)}</b><small>~${num(c.alcance(g))} pessoas</small></span></label>`).join('')}
        </fieldset>
        <p class="cr-erro" role="alert" hidden></p>
        <p class="cr-ok" role="status" hidden></p>
        <div class="cr-form-rodape">
          <span class="cr-alcance" aria-live="polite"></span>
          <button type="submit" class="btn-primario">📣 Publicar comunicado</button>
        </div>
      </form>`;
    }

    const NOME_FASE = Object.fromEntries((GC.FASES_COMUNICADO || []).map((f) => [f.id, f.nome]));
    function publicados(r) {
      const lista = r.gabinete.comunicados.slice().reverse();
      if (!lista.length) return '';
      return `<h4>Publicados</h4><ul class="cr-publicados">${lista.map((c) => `
        <li><small>${c.fase && NOME_FASE[c.fase] ? `<span class="cr-fase-tag">${esc(NOME_FASE[c.fase])}</span> ` : ''}${hora(c.t)} · ${c.canais.map((id) => esc((GC.CANAIS_COMUNICADO.find((x) => x.id === id) || { nome: id }).nome)).join(', ')} · ~${num(c.alcance)} pessoas</small><p>${esc(c.texto)}</p>${c.textoSms ? `<p class="cr-publicado-sms"><b>SMS:</b> ${esc(c.textoSms)}</p>` : ''}</li>`).join('')}</ul>`;
    }

    // Linha do tempo: a cor do ponto diz de onde veio o registro (gabinete, secretaria, cobrança,
    // comunicado, encerramento ou a ocorrência de origem).
    const tipoRegistro = (x) => (x.ocorrencia ? 'oc'
      : /^Comunicado publicado/.test(x.texto) ? 'com'
        : /cobrou/.test(x.texto) ? 'cob'
          : /^Gabinete encerrado/.test(x.texto) ? 'fim'
            : x.quem === 'Gabinete do Prefeito' ? 'gab' : 'sec');
    // Filtros do registro: cada tipo de linha cai num grupo.
    const FILTROS_REGISTRO = [
      { id: 'tudo', nome: 'Tudo', tipos: null },
      { id: 'gabinete', nome: 'Gabinete', tipos: ['gab', 'cob', 'fim'] },
      { id: 'secretarias', nome: 'Secretarias', tipos: ['sec'] },
      { id: 'comunicados', nome: 'Comunicados', tipos: ['com'] },
      { id: 'ocorrencia', nome: 'Ocorrência', tipos: ['oc'] },
    ];
    let filtroRegistro = 'tudo';

    function registro(r) {
      const f = FILTROS_REGISTRO.find((x) => x.id === filtroRegistro) || FILTROS_REGISTRO[0];
      const linhas = f.tipos ? r.registro.filter((x) => f.tipos.includes(tipoRegistro(x))) : r.registro;
      if (!linhas.length) return '<p class="painel-vazio">Nada deste tipo no registro.</p>';
      return `<ol class="cr-registro">${linhas.map((x) => `
        <li class="cr-reg-${tipoRegistro(x)}"><time>${hora(x.t)}</time><div><b>${esc(x.quem)}</b><span>${esc(x.texto)}</span></div></li>`).join('')}</ol>`;
    }

    function filtrosRegistro() {
      return `${FILTROS_REGISTRO.map((f) => `
        <button type="button" data-filtro="${f.id}" aria-pressed="${f.id === filtroRegistro}">${esc(f.nome)}</button>`).join('')}`;
    }

    // Registro em texto, para anexar ao relatório ou mandar por e-mail.
    function baixarRegistro(r) {
      const g = r.gabinete;
      const quando = (t) => new Date(t).toLocaleString('pt-BR');
      const linhas = r.registro.slice().reverse().map((x) => `${quando(x.t)} · ${x.quem} · ${x.texto}`);
      const cab = [`Gabinete de crise: ${g.titulo}`, `Bairro: ${r.bairro}`, `Aberto em ${quando(g.abertoEm)}${g.encerradoEm ? ` · encerrado em ${quando(g.encerradoEm)}` : ''}`, ''];
      const blob = new Blob([[...cab, ...linhas].join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `registro-${g.id}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    // Aviso para encerrar quando a crise parece resolvida (ocorrência resolvida, risco baixou, tudo feito).
    function sugestao(r) {
      if (!r.sugestaoEncerrar || r.gabinete.encerradoEm) return '';
      return `<div class="cr-sugestao" role="status"><span><b>Sugerimos encerrar este gabinete.</b> ${esc(r.sugestaoEncerrar)}</span>${pode('gerir') ? '<button type="button" class="btn-sec" data-cr="encerrar">Encerrar agora</button>' : ''}</div>`;
    }

    // Balanço do gabinete encerrado: o que foi feito, em quanto tempo, por secretaria.
    function balancoHtml(r) {
      const b = r.balanco;
      if (!b) return '';
      return `<section class="painel-card cr-balanco"><h3>Balanço da crise</h3>
        ${b.motivo ? `<p class="cr-balanco-motivo"><b>Motivo do encerramento:</b> ${esc(b.motivo)}</p>` : ''}
        <div class="cr-balanco-num">
          <div><b>${GC.tempoTexto(b.duracaoMin)}</b><small>de duração</small></div>
          <div><b>${b.concluidas}/${b.total}</b><small>tarefas concluídas${b.canceladas ? ` · ${b.canceladas} canceladas` : ''}</small></div>
          <div><b>${b.concluidas ? `${b.noPrazo}/${b.concluidas}` : '—'}</b><small>concluídas no prazo</small></div>
          <div><b>${b.cobrancas}</b><small>${b.cobrancas === 1 ? 'cobrança' : 'cobranças'} do prefeito</small></div>
          <div><b>${b.comunicados}</b><small>${b.comunicados === 1 ? 'comunicado' : 'comunicados'}${b.alcance ? ` · até ~${num(b.alcance)} pessoas` : ''}</small></div>
        </div>
        <div class="cr-balanco-tabela-wrap"><table class="cr-balanco-tabela"><thead><tr><th>Secretaria</th><th>Concluídas</th><th>Tempo médio</th><th>Cobranças</th></tr></thead><tbody>
          ${b.porArea.map((x) => `<tr><td>${x.secretaria.emoji} ${esc(x.secretaria.nome)}</td><td>${x.concluidas}/${x.total}${x.canceladas ? ` <small>(${x.canceladas} cancelada${x.canceladas > 1 ? 's' : ''})</small>` : ''}</td><td>${x.minutos === null ? '—' : GC.tempoTexto(x.minutos)}</td><td>${x.cobrancas}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
    }

    // Nova tarefa avulsa (só quem gere o gabinete, com a sala aberta).
    function formTarefa(e) {
      if (e.atual.gabinete.encerradoEm || !pode('gerir')) return '';
      return `<details class="cr-nova-tarefa"><summary>+ Nova tarefa</summary>
        <form class="cr-form-tarefa">
          <label><span>Secretaria</span><select name="area">${GC.data.areas.map((a) => `<option value="${esc(a.id)}">${esc(a.secretaria ? a.secretaria.nome : a.nome)}</option>`).join('')}</select></label>
          <label class="cr-form-tarefa-texto"><span>O que fazer</span><input name="texto" maxlength="160" placeholder="Ex.: Liberar a escola municipal como abrigo"></label>
          <label><span>Prazo</span><select name="prazo">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}"${m === 60 ? ' selected' : ''}>${GC.tempoTexto(m)}</option>`).join('')}</select></label>
          <button type="submit" class="btn-primario">Criar tarefa</button>
          <p class="cr-erro" role="alert" hidden></p>
        </form></details>`;
    }

    // ---------- Listagem (#/crise/novo, ou sem gabinete aberto) ----------
    // Ordem de leitura: como está a cidade (faixa de status) → as salas abertas → o que pede decisão
    // agora (abrir/convocar) → o contexto (chuva prevista e áreas de risco). Mesma linguagem visual do
    // detalhe: vermelho só no que está ao vivo ou pede ação.
    const bairroNome = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
    const areaDe = (id) => GC.data.areas.find((x) => x.id === id) || { nome: id, emoji: '' };
    const SEV = { critica: ['Crítica', 'st-critico'], alta: ['Alta', 'st-critico'], media: ['Média', 'st-atencao'] };
    const chipsSecretarias = (areas) => `<span class="cr-notifica"><small>Notifica</small>${areas.map((a) => `<span class="cr-chip">${areaDe(a).emoji} ${esc(areaDe(a).nome)}</span>`).join('')}</span>`;

    // O que pede gabinete agora: ocorrências com várias secretarias (já acontecendo) e áreas de risco
    // alto ainda não atingidas e sem gabinete preventivo aberto (dá para agir antes). Ordem de urgência:
    // ocorrência crítica primeiro, depois o que estoura antes (horas até o limite), depois quem afeta mais
    // gente. O gestor de setor vê só o que aciona a secretaria dele. Dispensadas saem da lista por 6 h.
    const URGENCIA_OC = { critica: 0, alta: 2, media: 8 };
    function todasDecisoes(e) {
      const comSala = new Set(e.gabinetes.filter((g) => !g.encerradoEm).map((g) => g.areaRiscoId).filter(Boolean));
      const ocorrencias = e.candidatas.map((o) => ({
        tipo: 'oc', chave: `oc:${o.id}`, id: o.id, titulo: o.titulo,
        tag: 'Ocorrência em andamento',
        selo: SEV[o.severidade] ? `<span class="sec-status ${SEV[o.severidade][1]}">${SEV[o.severidade][0]}</span>` : '',
        linha: `📍 ${esc(bairroNome(o.bairroId))}${o.afetados ? ` · ${num(o.afetados)} moradores afetados` : ''}`,
        areas: GC.areasDoGabinete(o.tipo, o.areasEnvolvidas || [o.area]),
        urgencia: URGENCIA_OC[o.severidade] ?? 8, pessoas: o.afetados || 0,
        botao: `<button type="button" class="btn-primario" data-convocar="${esc(o.id)}">🚨 Convocar gabinete</button>`,
      }));
      const preventivas = (e.risco.altas || []).filter((a) => !a.atingida && !comSala.has(a.id)).map((a) => ({
        tipo: 'prev', chave: `prev:${a.id}`, id: a.id, titulo: a.nome,
        tag: 'Preventivo · previsão de chuva',
        selo: seloRisco(a),
        linha: `📍 ${esc(bairroNome(a.bairroId))} · ${esc(a.tipo)} em ~${a.horasAte} h · ${a.familias} famílias`,
        passo: a.acao,
        areas: GC.areasDoGabinete(a.tipo, ['defesa_civil']),
        urgencia: a.horasAte || 24, pessoas: a.familias * 3.2,
        botao: `<button type="button" class="btn-primario" data-preventivo="${esc(a.id)}">🚨 Abrir gabinete preventivo</button>`,
      }));
      const doPerfil = GC.perfil && GC.perfil.id === 'setor' && GC.perfil.area
        ? (x) => x.areas.includes(GC.perfil.area) : () => true;
      return [...ocorrencias, ...preventivas].filter(doPerfil).sort((a, b) => a.urgencia - b.urgencia || b.pessoas - a.pessoas);
    }
    function decisoes(e) {
      const fora = new Set((e.dispensas || []).map((d) => d.chave));
      return todasDecisoes(e).filter((x) => !fora.has(x.chave));
    }

    function listaCabecalho(e) {
      const ativos = e.salas.filter((r) => !r.gabinete.encerradoEm).length;
      return `<div><p class="cr-sobre">🚨 Gabinete de crise</p><h2>Gabinetes de crise</h2>
        <p>${ativos ? `${ativos} ${ativos === 1 ? 'gabinete ativo' : 'gabinetes ativos'} agora.` : 'Nenhuma crise ativa agora.'} Abra um gabinete a partir de uma ocorrência que envolve várias secretarias ou da previsão de chuva.</p></div>`;
    }

    // Faixa de status: quatro números que dizem se é hora de agir.
    function listaStatus(e, d) {
      const ativos = e.salas.filter((r) => !r.gabinete.encerradoEm);
      const atrasadas = ativos.reduce((s, r) => s + r.atrasadas, 0);
      const prev = e.risco.previsao;
      const altas = e.risco.altas || [];
      const item = (classe, valor, rotulo) => `<div class="cr-status-item ${classe}"><b>${valor}</b><small>${rotulo}</small></div>`;
      return [
        item(ativos.length ? 'alerta' : 'ok', ativos.length || '0', ativos.length ? `${ativos.length === 1 ? 'gabinete ativo' : 'gabinetes ativos'}${atrasadas ? ` · ${atrasadas} ${atrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}` : ''}` : 'nenhuma crise ativa'),
        item(d.length ? 'pendente' : 'ok', d.length, d.length === 1 ? 'decisão pendente' : 'decisões pendentes'),
        item(altas.length ? 'pendente' : 'ok', altas.length, `${altas.length === 1 ? 'área' : 'áreas'} em risco alto · ${num(e.risco.familiasRiscoAlto || 0)} famílias`),
        item('', `${prev.janelas[prev.janelas.length - 1].mm} mm`, `previstos em 24 h · ${prev.acumulado72h} mm nas últimas 72 h`),
      ].join('');
    }

    // <details> que o usuário abriu continuam abertos quando o relógio redesenha a lista.
    const abertos = new Set();
    el.addEventListener('toggle', (ev) => {
      const d = ev.target;
      if (!d || !d.dataset || !d.dataset.grupo) return;
      if (d.open) abertos.add(d.dataset.grupo); else abertos.delete(d.dataset.grupo);
    }, true);
    const abertoSe = (grupo) => (abertos.has(grupo) ? ' open' : '');

    // Uma sala por cartão. Só dados estáveis (hora de abertura, não "há X min"): o relógio não troca o
    // cartão debaixo do clique.
    function cartaoSala(r) {
      const g = r.gabinete;
      const ativo = !g.encerradoEm;
      return `<button type="button" class="cr-sala ${ativo ? 'ativa' : 'encerrada'}" data-gabinete="${esc(g.id)}">
          <span class="cr-sala-topo"><span class="sec-status ${ativo ? 'st-critico' : 'st-concluida'}">${ativo ? 'Ao vivo' : 'Encerrado'}</span><small>${ativo ? (g.origem === 'previsao' ? 'preventivo' : 'convocado') : new Date(g.encerradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small></span>
          <span class="cr-sala-titulo">${esc(g.titulo)}</span>
          <small class="cr-sala-fatos">📍 ${esc(r.bairro)} · ${ativo ? `aberto às ${hora(g.abertoEm)}` : `durou ${GC.tempoTexto(r.abertoHaMin)}`}</small>
          <span class="cr-sala-prog"><span class="sec-barra"><i class="st-concluida" style="width:${r.pct}%"></i></span><small>${r.feitas}/${r.total} tarefas</small></span>
          <span class="cr-sala-alertas">${ativo && r.atrasadas ? `<span class="cr-atrasada">⏰ ${r.atrasadas} ${r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}${ativo && !r.ultimoComunicado ? '<span class="cr-sala-pend">comunicado pendente</span>' : ''}${!ativo && g.motivoEncerramento ? `<span class="cr-sala-motivo">${esc(g.motivoEncerramento)}</span>` : ''}</span>
          <span class="cr-sala-abrir">${ativo ? 'Abrir sala' : 'Ver balanço'} →</span>
        </button>`;
    }

    // Ativos à vista; encerrados num histórico recolhível (aberto quando não há nenhum ativo).
    function listaSalas(e) {
      const recentes = (a, b) => (b.gabinete.encerradoEm || b.gabinete.abertoEm) - (a.gabinete.encerradoEm || a.gabinete.abertoEm);
      const ativos = e.salas.filter((r) => !r.gabinete.encerradoEm).sort(recentes);
      const encerrados = e.salas.filter((r) => r.gabinete.encerradoEm).sort(recentes);
      // Sem nenhum ativo (a faixa de status já diz isso), a seção é só o histórico, aberto.
      if (!ativos.length) return `<h3>Histórico <span class="cr-conta">${encerrados.length}</span></h3><div class="cr-salas">${encerrados.map(cartaoSala).join('')}</div>`;
      const historico = encerrados.length ? `<details class="cr-historico" data-grupo="historico"${ativos.length ? abertoSe('historico') : ' open'}>
          <summary>Encerrados <span class="cr-conta">${encerrados.length}</span></summary>
          <div class="cr-salas">${encerrados.map(cartaoSala).join('')}</div>
        </details>` : '';
      return `<h3>Gabinetes ativos <span class="cr-conta ${ativos.length ? 'alerta' : ''}">${ativos.length}</span></h3>
        ${ativos.length ? `<div class="cr-salas">${ativos.map(cartaoSala).join('')}</div>` : '<p class="painel-vazio">Nenhum gabinete ativo agora.</p>'}
        ${historico}`;
    }

    const MOTIVOS_DISPENSA = ['Equipe já em campo', 'Situação sob controle', 'Tratada em outro gabinete', 'Alerta não confirmado'];
    let dispensando = null; // chave da decisão com o formulário "Dispensar" aberto

    function listaDecisoes(e, d) {
      const cab = `<h3>Pede decisão agora <span class="cr-conta ${d.length ? 'alerta' : ''}">${d.length}</span></h3>`;
      const titulos = new Map(todasDecisoes(e).map((x) => [x.chave, x.titulo]));
      const dispensadas = (e.dispensas || []).filter((x) => titulos.has(x.chave));
      const rodape = dispensadas.length ? `<details class="cr-dispensadas" data-grupo="dispensadas"${abertoSe('dispensadas')}>
          <summary>${dispensadas.length} ${dispensadas.length === 1 ? 'dispensada' : 'dispensadas'} nas últimas 6 h</summary>
          <ul>${dispensadas.map((x) => `<li><span><b>${esc(titulos.get(x.chave))}</b><small>${esc(x.motivo)} · às ${hora(x.t)}</small></span>${pode('abrir') ? `<button type="button" class="cr-link" data-reativar="${esc(x.chave)}">Trazer de volta</button>` : ''}</li>`).join('')}</ul>
        </details>` : '';
      if (!d.length) return `${cab}<p class="painel-vazio">Nada pede gabinete agora: nenhuma ocorrência envolve várias secretarias e as áreas de risco alto já têm gabinete ou atendimento.</p>${rodape}`;
      return `${cab}${pode('abrir') ? '' : '<p class="cr-nota-perfil">Quem abre ou convoca gabinete é o Gabinete do Prefeito.</p>'}
        <ul class="cr-decisoes">${d.map((x) => `
          <li class="cr-decisao cr-decisao-${x.tipo}">
            <div class="cr-decisao-info">
              <span class="cr-tag">${x.tag}</span>
              <span class="cr-decisao-titulo"><b>${esc(x.titulo)}</b>${x.selo}</span>
              <small>${x.linha}</small>
              ${x.passo ? `<small class="cr-passo"><b>Próximo passo:</b> ${esc(x.passo)}</small>` : ''}
              ${chipsSecretarias(x.areas)}
              ${dispensando === x.chave ? `<div class="cr-dispensa-form">
                <label><span>Por que dispensar?</span><select data-motivo>${MOTIVOS_DISPENSA.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
                <button type="button" class="btn-sec" data-confirmar-dispensa="${esc(x.chave)}">Dispensar por 6 h</button>
                <button type="button" class="cr-link" data-cancelar-dispensa>Cancelar</button>
              </div>` : ''}
            </div>
            ${pode('abrir') ? `<div class="cr-decisao-acoes">${x.botao}${dispensando === x.chave ? '' : `<button type="button" class="cr-link" data-dispensar="${esc(x.chave)}">Dispensar</button>`}</div>` : ''}
          </li>`).join('')}</ul>${rodape}`;
    }

    // Áreas de risco que o perfil acompanha (o gestor de setor, só as que acionam a pasta dele).
    const riscosDoPerfil = (e) => e.risco.areas.filter(GC.perfil && GC.perfil.id === 'setor' && GC.perfil.area
      ? (a) => GC.areasDoGabinete(a.tipo, ['defesa_civil']).includes(GC.perfil.area) : () => true);

    function listaChuva(e) {
      const prev = e.risco.previsao;
      const areas = riscosDoPerfil(e);
      const area = areaEscolhida(areas, areas.find((a) => a.nivel === 'alto' && !a.atingida) || areas.find((a) => a.nivel === 'alto'));
      return `<h3>🌧 Previsão de chuva</h3>
        <p class="cr-chuva-resumo"><b>${prev.janelas[prev.janelas.length - 1].mm} mm</b> previstos em 24 h · ${prev.janelas[1].mm} mm nas próximas ${prev.janelas[1].horas} h</p>
        ${barras(prev, area)}
        <p class="cr-nota">Já choveu ${prev.acumulado72h} mm em 72 h · ${esc(prev.fonte)}, atualizada há ${prev.atualizadaHaMin} min</p>
        ${legendaLimite(prev, area)}
        <p class="cr-dica">Escolha uma área de risco ao lado para ver o limite dela no gráfico.</p>`;
    }

    // Áreas de risco agrupadas por nível; o nível baixo vem recolhido. O gestor de setor vê as áreas
    // cujo gabinete acionaria a secretaria dele.
    function listaRiscos(e) {
      const ativas = new Map(e.gabinetes.filter((g) => !g.encerradoEm && g.areaRiscoId).map((g) => [g.areaRiscoId, g.id]));
      const areas = riscosDoPerfil(e);
      const noGrafico = areaEscolhida(areas, areas.find((a) => a.nivel === 'alto' && !a.atingida) || areas.find((a) => a.nivel === 'alto'));
      const linha = (a) => `
        <li class="${noGrafico && a.id === noGrafico.id ? 'no-grafico' : ''}">
          <span class="cr-risco-nome"><span class="cr-risco-linha"><button type="button" class="cr-risco-ver" data-area-grafico="${esc(a.id)}" aria-pressed="${!!noGrafico && a.id === noGrafico.id}" title="Ver o limite no gráfico"><b>${esc(a.nome)}</b></button>${ativas.has(a.id) ? `<button type="button" class="cr-link" data-gabinete="${esc(ativas.get(a.id))}">gabinete aberto →</button>` : a.atingida ? '<span class="cr-chip">já atingida</span>' : ''}</span><small>${esc(bairroNome(a.bairroId))} · ${esc(a.tipo)}</small></span>
          <span class="cr-risco-num"><b>${a.familias}</b><small>famílias</small></span>
          <span class="cr-risco-num"><b>${a.horasAte ? `~${a.horasAte} h` : '—'}</b><small>até o limite</small></span>
        </li>`;
      const grupos = ['alto', 'medio', 'baixo'].map((n) => [n, areas.filter((a) => a.nivel === n)]).filter(([, l]) => l.length);
      if (!grupos.length) return '<h3>⚠ Áreas de risco</h3><p class="painel-vazio">Nenhuma área de risco para acompanhar.</p>';
      return `<h3>⚠ Áreas de risco em observação</h3>${grupos.map(([n, l]) => {
        const corpo = `<ul class="cr-riscos-lista">${l.map(linha).join('')}</ul>`;
        const titulo = `${seloRisco({ nivel: n })} <span>${l.length} ${l.length === 1 ? 'área' : 'áreas'}</span>`;
        return n === 'baixo'
          ? `<details class="cr-risco-grupo" data-grupo="risco-baixo"${abertoSe('risco-baixo')}><summary>${titulo}</summary>${corpo}</details>`
          : `<div class="cr-risco-grupo"><div class="cr-risco-grupo-cab">${titulo}</div>${corpo}</div>`;
      }).join('')}`;
    }

    let ultimoEstado = null;
    function vazio(e) {
      ultimoEstado = e;
      const salas = e.salas || [];
      const ativos = salas.some((r) => !r.gabinete.encerradoEm);
      // Com sala ativa, as salas vêm antes das decisões; só com encerradas, o histórico vai depois.
      const chave = `${ativos ? 'a' : ''}${salas.length ? 's' : ''}`;
      let raiz = el.querySelector('[data-vazio]');
      if (!raiz || raiz.dataset.vazio !== chave) {
        const blocoSalas = salas.length ? '<section class="painel-card cr-lista-salas"></section>' : '';
        el.innerHTML = `<div data-vazio="${chave}">
          <header class="sec-topo cr-lista-cab"></header>
          <div class="cr-status"></div>
          ${ativos ? blocoSalas : ''}
          <section class="painel-card cr-lista-decisoes"></section>
          ${ativos ? '' : blocoSalas}
          <div class="cr-contexto">
            <section class="painel-card cr-lista-chuva"></section>
            <section class="painel-card cr-lista-riscos"></section>
          </div>
        </div>`;
        raiz = el.querySelector('[data-vazio]');
      }
      e.salas = salas;
      const d = decisoes(e);
      trocar('.cr-lista-cab', listaCabecalho(e));
      trocar('.cr-status', listaStatus(e, d));
      trocar('.cr-lista-salas', salas.length ? listaSalas(e) : '');
      trocar('.cr-lista-decisoes', listaDecisoes(e, d));
      trocar('.cr-lista-chuva', listaChuva(e));
      trocar('.cr-lista-riscos', listaRiscos(e));
      ligarLista();
    }

    function ligarLista() {
      el.querySelectorAll('[data-preventivo]').forEach((b) => { b.onclick = () => cb.aoPreventivo(b.dataset.preventivo); });
      el.querySelectorAll('[data-convocar]').forEach((b) => { b.onclick = () => cb.aoConvocar(b.dataset.convocar); });
      el.querySelectorAll('[data-dispensar]').forEach((b) => {
        b.onclick = () => {
          dispensando = b.dataset.dispensar;
          vazio(ultimoEstado);
          const sel = el.querySelector('[data-motivo]');
          if (sel) sel.focus();
        };
      });
      el.querySelectorAll('[data-cancelar-dispensa]').forEach((b) => { b.onclick = () => { dispensando = null; vazio(ultimoEstado); }; });
      el.querySelectorAll('[data-confirmar-dispensa]').forEach((b) => {
        b.onclick = () => {
          const motivo = (el.querySelector('[data-motivo]') || {}).value;
          dispensando = null;
          if (cb.aoDispensar) cb.aoDispensar(b.dataset.confirmarDispensa, motivo);
        };
      });
      el.querySelectorAll('[data-area-grafico]').forEach((b) => {
        const escolher = () => { if (areaGrafico === b.dataset.areaGrafico) return; areaGrafico = b.dataset.areaGrafico; vazio(ultimoEstado); };
        b.onclick = escolher;
        b.onmouseenter = escolher;
      });
      el.querySelectorAll('[data-reativar]').forEach((b) => { b.onclick = () => { if (cb.aoReativar) cb.aoReativar(b.dataset.reativar); }; });
      ligarAbas();
    }

    function ligarAbas() {
      el.querySelectorAll('[data-gabinete]').forEach((b) => { b.onclick = () => cb.aoAbrirGabinete(b.dataset.gabinete); });
    }

    // Janela de encerramento (no lugar do confirm do navegador): mostra o que ficou em aberto, deixa
    // cancelar as pendentes e pede o motivo, que vai para o registro e para o balanço.
    function abrirEncerrar(r) {
      const g = r.gabinete;
      const pend = r.tarefas.filter((t) => !FIM(t));
      const antigo = document.getElementById('cr-dialogo');
      if (antigo) antigo.remove();
      const dlg = document.createElement('dialog');
      dlg.id = 'cr-dialogo';
      dlg.className = 'cr-dialogo';
      dlg.setAttribute('aria-labelledby', 'cr-dialogo-titulo');
      dlg.innerHTML = `<form method="dialog" class="cr-dialogo-form">
        <h3 id="cr-dialogo-titulo">Encerrar o gabinete?</h3>
        <p class="cr-dialogo-sub">${esc(g.titulo)} · aberto há ${GC.tempoTexto(r.abertoHaMin)}</p>
        ${pend.length ? `<div class="cr-dialogo-pend"><b>${pend.length} ${pend.length === 1 ? 'tarefa ainda em aberto' : 'tarefas ainda em aberto'}</b>
          <ul>${pend.map((t) => `<li><span class="sec-status ${CLASSE[t.status]}">${STATUS[t.status]}</span> ${esc(t.secretaria.nome)}: ${esc(t.texto)}</li>`).join('')}</ul>
          <label class="cr-check"><input type="checkbox" name="cancelar" checked> Marcar as pendentes como canceladas</label></div>`
          : '<p class="cr-dialogo-ok">Todas as tarefas foram concluídas.</p>'}
        <label class="cr-rotulo" for="cr-motivo">Motivo do encerramento (vai para o registro e o balanço)</label>
        <textarea id="cr-motivo" rows="2" maxlength="200" placeholder="Ex.: Água baixou e as vias foram liberadas">${esc(r.sugestaoEncerrar || '')}</textarea>
        <div class="cr-dialogo-botoes">
          <button type="submit" value="voltar" class="btn-sec">Voltar</button>
          <button type="submit" value="ok" class="btn-primario cr-btn-encerrar">Encerrar gabinete</button>
        </div>
      </form>`;
      document.body.appendChild(dlg);
      // A decisão é tratada no envio do formulário, pelo botão clicado (síncrono): o evento "close" do
      // <dialog> chega depois e, em aba em segundo plano, pode nem chegar. Esc (cancel) só fecha.
      let decidido = false;
      dlg.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (decidido) return;
        decidido = true;
        const confirmou = ev.submitter && ev.submitter.value === 'ok';
        const cancelar = dlg.querySelector('[name="cancelar"]');
        const motivo = dlg.querySelector('#cr-motivo').value;
        dlg.close();
        dlg.remove();
        if (confirmou) cb.aoEncerrar(g.id, { motivo, cancelarPendentes: !!(cancelar && cancelar.checked) });
      });
      dlg.addEventListener('close', () => { if (dlg.isConnected) dlg.remove(); });
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else if (window.confirm('Encerrar o gabinete?')) { dlg.remove(); cb.aoEncerrar(g.id, { cancelarPendentes: true }); }
    }

    function ligar(e) {
      const g = e.atual.gabinete;
      ligarAbas();
      const acao = (nome, fn) => el.querySelectorAll(`[data-cr="${nome}"]`).forEach((b) => { b.onclick = fn; });
      acao('alerta', () => cb.aoAbrirAlerta(g.ocorrenciaId));
      acao('mapa', () => cb.aoVerNoMapa(g));
      acao('afetados', () => cb.aoPerguntar(g));
      acao('baixar', () => baixarRegistro(ultimoEstado.atual));
      acao('ir-comunicado', () => {
        const caixa = el.querySelector('#cr-texto');
        if (!caixa) return;
        caixa.scrollIntoView({ behavior: 'smooth', block: 'center' });
        caixa.focus({ preventScroll: true });
      });
      acao('encerrar', () => abrirEncerrar(ultimoEstado.atual));
      el.querySelectorAll('[data-avancar]').forEach((b) => { b.onclick = () => cb.aoAvancar(g.id, b.dataset.avancar); });
      el.querySelectorAll('[data-cobrar]').forEach((b) => { b.onclick = () => cb.aoCobrar(g.id, b.dataset.cobrar); });
      el.querySelectorAll('[data-area-grafico]').forEach((b) => {
        b.onclick = () => { areaGrafico = b.dataset.areaGrafico; trocar('.cr-chuva', chuva(ultimoEstado)); ligar(ultimoEstado); };
      });
      el.querySelectorAll('[data-ponto]').forEach((p) => {
        const abrir = () => cb.aoAbrirAlerta(p.dataset.ponto);
        p.onclick = abrir;
        p.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } };
      });
      el.querySelectorAll('[data-estender]').forEach((b) => { b.onclick = () => { if (cb.aoEstenderPrazo) cb.aoEstenderPrazo(g.id, b.dataset.estender, 30); }; });
      el.querySelectorAll('[data-filtro]').forEach((b) => {
        b.onclick = () => {
          filtroRegistro = b.dataset.filtro;
          trocar('.cr-filtros', filtrosRegistro());
          trocar('.cr-registro-wrap', registro(ultimoEstado.atual));
          ligar(ultimoEstado);
        };
      });
    }

    function ligarFormTarefa(e) {
      const form = el.querySelector('.cr-form-tarefa');
      if (!form) return;
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const erro = form.querySelector('.cr-erro');
        const dados = { area: form.area.value, texto: form.texto.value, prazoMin: Number(form.prazo.value) };
        if (!dados.texto.trim()) { erro.textContent = 'Diga o que a secretaria deve fazer.'; erro.hidden = false; form.texto.focus(); return; }
        erro.hidden = true;
        const t = cb.aoAdicionarTarefa ? cb.aoAdicionarTarefa(e.atual.gabinete.id, dados) : null;
        if (!t) { erro.textContent = 'Não foi possível criar a tarefa.'; erro.hidden = false; return; }
        form.texto.value = '';
        form.closest('details').open = false;
      };
    }

    function ligarFormulario(e) {
      const form = el.querySelector('.cr-form');
      if (!form) return;
      const caixa = form.querySelector('#cr-texto');
      const sms = form.querySelector('#cr-sms');
      const blocoSms = form.querySelector('.cr-sms-bloco');
      const erro = form.querySelector('.cr-erro');
      const ok = form.querySelector('.cr-ok');
      const contador = form.querySelector('#cr-contador');
      const contadorSms = form.querySelector('#cr-contador-sms');
      const alcance = form.querySelector('.cr-alcance');
      let fase = (form.querySelector('[data-fase][aria-pressed="true"]') || {}).dataset?.fase || 'alerta';
      const marcados = () => [...form.querySelectorAll('input[name="canal"]:checked')].map((i) => i.value);
      // O texto completo vai para WhatsApp, redes e rádio; o SMS tem versão própria, que precisa caber
      // em uma mensagem (a caixa só aparece com o canal SMS marcado).
      const contar = () => {
        contador.textContent = `${caixa.value.length} caracteres`;
        const comSms = marcados().includes('sms');
        blocoSms.hidden = !comSms;
        const partes = GC.partesSms(sms.value);
        const longo = partes > 1;
        contadorSms.textContent = sms.value.length ? `${sms.value.length} caracteres · ${partes} ${partes === 1 ? 'mensagem' : 'mensagens'}${longo ? ': encurte para chegar numa só' : ''}` : '';
        contadorSms.classList.toggle('longo', longo);
      };
      const somar = () => {
        const ids = marcados();
        alcance.innerHTML = ids.length ? `Alcance estimado <b>~${num(GC.alcanceComunicado(e.atual.gabinete, ids))}</b> pessoas` : 'Escolha ao menos um canal';
      };
      caixa.oninput = () => { ok.hidden = true; contar(); };
      sms.oninput = () => { ok.hidden = true; contar(); };
      form.querySelectorAll('input[name="canal"]').forEach((i) => { i.onchange = () => { somar(); contar(); }; });
      // Modelo por fase: preenche as duas caixas com o texto pronto (sempre do estado mais recente).
      form.querySelectorAll('[data-fase]').forEach((b) => {
        b.onclick = () => {
          fase = b.dataset.fase;
          form.querySelectorAll('[data-fase]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          const r = ((ultimoEstado && ultimoEstado.rascunhos) || e.rascunhos || {})[fase] || { texto: '', sms: '' };
          caixa.value = r.texto;
          sms.value = r.sms;
          ok.hidden = true;
          contar();
          caixa.focus();
        };
      });
      contar();
      somar();
      // Publicado: as caixas esvaziam e aparece a confirmação. Um segundo clique não republica o mesmo
      // texto sem querer; para um novo comunicado, escolhe-se um modelo ou escreve-se outro.
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const texto = caixa.value;
        const canais = marcados();
        const comSms = canais.includes('sms');
        const falta = !texto.trim() ? 'Escreva o texto do comunicado.'
          : !canais.length ? 'Escolha ao menos um canal.'
            : comSms && !sms.value.trim() ? 'Escreva a versão SMS (ou desmarque o canal SMS).' : '';
        if (falta) {
          erro.textContent = falta;
          erro.hidden = false;
          ok.hidden = true;
          return;
        }
        erro.hidden = true;
        const c = cb.aoPublicar(e.atual.gabinete.id, { texto, canais, textoSms: comSms ? sms.value : '', fase });
        if (!c) return;
        caixa.value = '';
        sms.value = '';
        contar();
        ok.textContent = `✓ Comunicado publicado às ${hora(c.t)} · alcance estimado de ~${num(c.alcance)} pessoas. Ele aparece em "Publicados".`;
        ok.hidden = false;
      };
    }

    // Tarefa que acabou de estourar o prazo: o leitor de tela anuncia e a linha pisca uma vez.
    const atrasadasVistas = new Map();
    function avisarAtrasos(r) {
      const g = r.gabinete;
      const agora = new Set(r.tarefas.filter((t) => t.atrasada).map((t) => t.id));
      const antes = atrasadasVistas.get(g.id);
      atrasadasVistas.set(g.id, agora);
      if (!antes || g.encerradoEm) return;
      const novas = r.tarefas.filter((t) => agora.has(t.id) && !antes.has(t.id));
      if (!novas.length) return;
      const aviso = el.querySelector('.cr-sr');
      if (aviso) aviso.textContent = `Prazo estourado: ${novas.map((t) => `${t.secretaria.nome}, ${t.texto}`).join('; ')}.`;
      novas.forEach((t) => {
        const li = el.querySelector(`.cr-tarefas li[data-tarefa="${escCss(t.id)}"]`);
        if (!li) return;
        li.classList.remove('cr-pisca');
        void li.offsetWidth; // reinicia a animação
        li.classList.add('cr-pisca');
      });
    }

    function mostrar(e) {
      ultimoEstado = e;
      if (!e.atual) {
        atualId = null;
        encerradoAntes = null;
        vazio(e);
        return;
      }
      const g = e.atual.gabinete;
      if (atualId !== g.id) areaGrafico = null;
      atualId = g.id;
      encerradoAntes = !!g.encerradoEm;
      // Ao lado das ações: o mini-mapa da área e, só em crise de chuva (alagamento, deslizamento...),
      // a chuva prevista com o limite da área de risco.
      const acoes = `<section class="painel-card"><h3>Ações por secretaria</h3><div class="cr-tarefas-wrap"></div>${formTarefa(e)}</section>`;
      el.innerHTML = `
        ${abas(e)}
        <p class="cr-sr" role="status" aria-live="polite"></p>
        <div class="cr-cab ${g.encerradoEm ? 'encerrado' : 'ativo'}"><header class="sec-topo cr-topo"><div class="cr-cab-texto"></div><span class="sec-acoes cr-cab-acoes"></span></header></div>
        <div class="cr-sugestao-wrap"></div>
        <div class="cr-balanco-wrap"></div>
        <div class="sec-ind-wrap cr-ind"></div>
        <div class="sec-grade">
          ${acoes}
          <div class="cr-coluna">
            <section class="painel-card"><div class="cr-registro-topo"><h3>📍 Área afetada</h3><button type="button" class="btn-sec" data-cr="mapa">Abrir no mapa</button></div><div class="cr-minimapa"></div></section>
            ${g.grupo === 'chuva' ? '<section class="painel-card"><h3>🌧 Chuva prevista (acumulada)</h3><div class="cr-chuva"></div></section>' : ''}
          </div>
        </div>
        <div class="sec-grade">
          <section class="painel-card"><h3>📣 Comunicado à população</h3><div class="cr-form-wrap">${formulario(e)}</div><div class="cr-publicados-wrap"></div></section>
          <section class="painel-card">
            <div class="cr-registro-topo"><h3>Registro da crise</h3><button type="button" class="btn-sec" data-cr="baixar">Baixar registro</button></div>
            <div class="cr-filtros" role="group" aria-label="Filtrar o registro"></div>
            <div class="cr-registro-wrap"></div>
          </section>
        </div>`;
      preencher(e);
      ligar(e);
      ligarFormulario(e);
      ligarFormTarefa(e);
    }

    // Preenche (ou atualiza) as partes que mudam; cada uma só é trocada se o HTML dela mudou.
    function preencher(e) {
      trocar('.cr-cab-texto', cabecalhoTexto(e.atual));
      trocar('.cr-cab-acoes', cabecalhoAcoes(e.atual));
      trocar('.cr-sugestao-wrap', sugestao(e.atual));
      trocar('.cr-balanco-wrap', balancoHtml(e.atual));
      trocar('.cr-ind', numeros(e.atual));
      desenharTarefas(e.atual);
      trocar('.cr-minimapa', miniMapa(e));
      if (el.querySelector('.cr-chuva')) trocar('.cr-chuva', chuva(e));
      trocar('.cr-publicados-wrap', publicados(e.atual));
      trocar('.cr-filtros', filtrosRegistro());
      trocar('.cr-registro-wrap', registro(e.atual));
      avisarAtrasos(e.atual);
    }

    // O relógio e as ações redesenham a tela; os formulários (comunicado, nova tarefa) ficam intactos
    // (o prefeito pode estar escrevendo), a não ser que o gabinete mude ou seja encerrado.
    function atualizar(e) {
      if (!e.atual || e.atual.gabinete.id !== atualId || !!e.atual.gabinete.encerradoEm !== encerradoAntes) return mostrar(e);
      if (!el.querySelector('.cr-cab-texto')) return mostrar(e);
      ultimoEstado = e;
      preencher(e);
      ligar(e);
    }

    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
