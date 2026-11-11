(function (GC) {
  // Dois modos do mapa que não mexem nos filtros nem nos dados: a linha do tempo (qualquer dia do último
  // ano) e o modo telão. Cada um devolve um controle pequeno; o app liga os botões e decide o que desenhar.

  // ======================= Linha do tempo =======================
  // Barra flutuante na base do mapa: ▶/❚❚, o dia (botão que abre um calendário, até um ano atrás), a régua
  // do dia com as horas (00h → 24h, com um balão na hora escolhida), o instante e "Ao vivo".
  // aoMudar(t) recebe o instante escolhido (null = ao vivo). Tocar um dia leva ~24 s (1 h por segundo).
  GC.criarLinhaTempoUI = function (palco, { agora, aoMudar, limiteDias = GC.LIMITE_DIAS_LINHA_TEMPO }) {
    const DIA = 24 * 3600000;
    const PASSO = 5 * 60000; // de 5 em 5 minutos
    const PASSOS = DIA / PASSO; // 288
    const HORAS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    const el = document.createElement('div');
    el.className = 'linha-tempo vidro';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Linha do tempo');
    el.hidden = true;
    el.innerHTML = `
      <button type="button" class="lt-tocar" aria-label="Tocar o dia" title="Tocar o dia (1 h por segundo)"><i class="ti ti-player-play" aria-hidden="true"></i></button>
      <div class="lt-dia-rot">
        <button type="button" class="lt-dia" aria-haspopup="dialog" aria-expanded="false">
          <i class="ti ti-calendar" aria-hidden="true"></i><span class="lt-dia-txt"></span><i class="ti ti-chevron-down lt-dia-seta" aria-hidden="true"></i>
        </button>
        <div class="lt-cal" role="dialog" aria-label="Escolher o dia" hidden>
          <div class="lt-cal-topo">
            <button type="button" class="lt-cal-nav" data-mes="-1" aria-label="Mês anterior"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
            <b class="lt-cal-mes" aria-live="polite"></b>
            <button type="button" class="lt-cal-nav" data-mes="1" aria-label="Próximo mês"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="lt-cal-grade" role="grid"></div>
          <div class="lt-cal-atalhos">
            <button type="button" data-atalho="hoje">Hoje</button>
            <button type="button" data-atalho="ontem">Ontem</button>
            <button type="button" data-atalho="semana">−1 semana</button>
            <button type="button" data-atalho="mes">−1 mês</button>
          </div>
        </div>
      </div>
      <div class="lt-regua">
        <div class="lt-trilho">
          <span class="lt-balao" aria-hidden="true"></span>
          <input type="range" min="0" max="${PASSOS}" step="1" value="${PASSOS}" aria-label="Hora">
        </div>
        <div class="lt-marcas" aria-hidden="true">${HORAS.map((h) => `<span>${String(h).padStart(2, '0')}h</span>`).join('')}</div>
      </div>
      <div class="lt-info"><b class="lt-quando">agora</b><small class="lt-quantas"></small></div>
      <button type="button" class="lt-ao-vivo" title="Voltar ao vivo" aria-label="Voltar ao vivo"><span class="ponto" aria-hidden="true"></span><span class="lt-ao-vivo-txt">Ao vivo</span></button>
      <button type="button" class="lt-fechar gaveta-x" aria-label="Fechar a linha do tempo"><i class="ti ti-x" aria-hidden="true"></i></button>`;
    palco.appendChild(el);
    const faixa = el.querySelector('input');
    const btnDia = el.querySelector('.lt-dia');
    const cal = el.querySelector('.lt-cal');
    const calGrade = el.querySelector('.lt-cal-grade');
    const balao = el.querySelector('.lt-balao');
    const btnTocar = el.querySelector('.lt-tocar');
    let tocando = null;
    let instante = null;
    let inicioDia = GC.inicioDoDia(agora());
    let diaRotulado = null; // o "hoje" com que o rótulo do dia foi escrito (Hoje/Ontem mudam à meia-noite)
    let mesVisto = null; // { ano, mes } do calendário aberto

    const ehHoje = () => inicioDia === GC.inicioDoDia(agora());
    // Até onde a régua anda: hoje, só até agora; um dia passado, o dia inteiro.
    const passoLimite = () => (ehHoje() ? Math.min(PASSOS, Math.floor((agora() - inicioDia) / PASSO)) : PASSOS);
    // Instante do passo (o fim de um dia passado é 23:59, não a meia-noite do dia seguinte).
    const tDe = (passo) => inicioDia + passo * PASSO - (passo >= PASSOS ? 60000 : 0);

    function rotularDia() {
      diaRotulado = GC.inicioDoDia(agora());
      const rotulo = GC.rotuloDia(inicioDia, agora());
      el.querySelector('.lt-dia-txt').textContent = rotulo;
      btnDia.setAttribute('aria-label', `Dia: ${GC.rotuloDiaLongo(inicioDia)}. Escolher outro dia`);
      btnDia.title = 'Escolher o dia (até um ano atrás)';
    }

    // ---- Calendário ----
    // Grade do mês com foco "itinerante" (um só dia com tabindex 0): setas andam um dia ou uma semana,
    // PageUp/PageDown um mês, Home/End o começo e o fim da semana, Enter/Espaço escolhe, Esc fecha.
    const calAberto = () => !cal.hidden;
    const dentroDoLimite = (d) => { const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias); return Math.min(max, Math.max(min, d)); };
    function desenharCalendario(foco) {
      const { min, max } = GC.limitesLinhaTempo(agora(), limiteDias);
      const { ano, mes } = mesVisto;
      const hoje = GC.inicioDoDia(agora());
      el.querySelector('.lt-cal-mes').textContent = GC.rotuloMes(ano, mes);
      const [ant, prox] = el.querySelectorAll('.lt-cal-nav');
      ant.disabled = new Date(ano, mes, 1).getTime() <= min;
      prox.disabled = new Date(ano, mes + 1, 0).getTime() >= max;
      const cab = `<div role="row" class="lt-cal-sem">${GC.DIAS_SEMANA.map((s) => `<span role="columnheader" aria-label="${s}">${s[0].toUpperCase()}</span>`).join('')}</div>`;
      calGrade.innerHTML = cab + GC.gradeMes(ano, mes).map((semana) => `<div role="row">${semana.map((d) => {
        if (d === null) return '<span role="gridcell"></span>';
        const fora = d < min || d > max;
        const classes = ['lt-cal-d', d === hoje ? 'hoje' : '', d === inicioDia ? 'escolhido' : ''].filter(Boolean).join(' ');
        return `<span role="gridcell" aria-selected="${d === inicioDia}"><button type="button" class="${classes}" data-dia="${d}"`
          + ` tabindex="${d === foco ? 0 : -1}"${fora ? ' disabled' : ''} aria-label="${GC.rotuloDiaLongo(d)}${d === hoje ? ' (hoje)' : ''}"`
          + `${d === inicioDia ? ' aria-current="date"' : ''}>${new Date(d).getDate()}</button></span>`;
      }).join('')}</div>`).join('');
    }
    // Põe o foco num dia (trocando de mês se preciso).
    function focarDia(d) {
      const alvo = dentroDoLimite(d);
      const dt = new Date(alvo);
      if (!mesVisto || mesVisto.ano !== dt.getFullYear() || mesVisto.mes !== dt.getMonth()) mesVisto = { ano: dt.getFullYear(), mes: dt.getMonth() };
      desenharCalendario(alvo);
      const b = calGrade.querySelector(`[data-dia="${alvo}"]`);
      if (b) b.focus();
    }
    function abrirCalendario() {
      cal.hidden = false;
      btnDia.setAttribute('aria-expanded', 'true');
      el.classList.add('com-calendario');
      mesVisto = null;
      focarDia(inicioDia);
      document.addEventListener('pointerdown', foraDoCalendario, true);
    }
    // Devolve true se estava aberto (o Esc do app fecha primeiro o calendário, depois a barra).
    function fecharCalendario(devolverFoco = true) {
      if (!calAberto()) return false;
      cal.hidden = true;
      btnDia.setAttribute('aria-expanded', 'false');
      el.classList.remove('com-calendario');
      document.removeEventListener('pointerdown', foraDoCalendario, true);
      if (devolverFoco) btnDia.focus();
      return true;
    }
    function foraDoCalendario(ev) {
      if (!el.querySelector('.lt-dia-rot').contains(ev.target)) fecharCalendario(false);
    }
    function escolherDia(d) {
      fecharCalendario();
      trocarDia(dentroDoLimite(d));
    }
    btnDia.addEventListener('click', () => (calAberto() ? fecharCalendario() : abrirCalendario()));
    el.querySelectorAll('.lt-cal-nav').forEach((b) => b.addEventListener('click', () => {
      const { ano, mes } = mesVisto;
      const novo = new Date(ano, mes + Number(b.dataset.mes), 1);
      mesVisto = { ano: novo.getFullYear(), mes: novo.getMonth() };
      // O foco fica no mesmo dia do mês novo (ou no limite), sem tirar o foco do botão de navegação.
      const ultimo = new Date(mesVisto.ano, mesVisto.mes + 1, 0).getDate();
      const dia = Math.min(new Date(inicioDia).getDate(), ultimo);
      desenharCalendario(dentroDoLimite(new Date(mesVisto.ano, mesVisto.mes, dia).getTime()));
    }));
    calGrade.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dia]');
      if (b && !b.disabled) escolherDia(Number(b.dataset.dia));
    });
    calGrade.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('[data-dia]');
      if (!b) return;
      const d = new Date(Number(b.dataset.dia));
      const mais = (n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
      const passos = {
        ArrowLeft: () => mais(-1), ArrowRight: () => mais(1), ArrowUp: () => mais(-7), ArrowDown: () => mais(7),
        Home: () => mais(-d.getDay()), End: () => mais(6 - d.getDay()),
        PageUp: () => GC.mesesAntes(d.getTime(), ev.shiftKey ? 12 : 1), PageDown: () => GC.mesesAntes(d.getTime(), ev.shiftKey ? -12 : -1),
      };
      if (passos[ev.key]) { ev.preventDefault(); focarDia(passos[ev.key]()); }
    });
    el.querySelector('.lt-cal-atalhos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-atalho]');
      if (!b) return;
      const hoje = GC.inicioDoDia(agora());
      const h = new Date(hoje);
      const dias = (n) => new Date(h.getFullYear(), h.getMonth(), h.getDate() - n).getTime();
      escolherDia({ hoje, ontem: dias(1), semana: dias(7), mes: GC.mesesAntes(hoje, 1) }[b.dataset.atalho]);
    });

    // Ao vivo, a régua acompanha o relógio (o app chama marcar a cada render): o polegar anda junto com o
    // fim do trecho riscado e, passada a meia-noite, a régua passa para o dia novo. Virou o dia num dia
    // passado: só o rótulo (Hoje/Ontem) muda.
    function acompanharRelogio() {
      const hoje = GC.inicioDoDia(agora());
      const virouDia = instante === null && inicioDia !== hoje;
      if (instante === null) {
        inicioDia = hoje;
        faixa.value = passoLimite();
      }
      if (virouDia || diaRotulado !== hoje) rotularDia();
    }
    function marcar(quantas) {
      acompanharRelogio();
      const hora = instante === null ? 'agora' : GC.rotuloHora(instante);
      el.querySelector('.lt-quando').textContent = hora;
      el.querySelector('.lt-quantas').textContent = quantas === undefined ? '' : `${quantas} ${quantas === 1 ? 'aberta' : 'abertas'}`;
      el.classList.toggle('no-agora', instante === null); // não usar "ao-vivo": já é a bolinha verde do cabeçalho (styles.css)
      const p = (Number(faixa.value) / PASSOS) * 100;
      faixa.style.setProperty('--p', `${p}%`);
      el.style.setProperty('--p', `${p}%`);
      // Hoje: o trecho depois de agora fica apagado (ainda não aconteceu).
      el.style.setProperty('--limite', `${(passoLimite() / PASSOS) * 100}%`);
      el.classList.toggle('dia-passado', !ehHoje());
      balao.textContent = instante === null ? GC.rotuloHora(agora()) : GC.rotuloHora(instante);
      faixa.setAttribute('aria-valuetext', `${GC.rotuloDia(inicioDia, agora())}, ${hora}`);
    }
    function irPara(passo) {
      const p = Math.max(0, Math.min(Number(passo), passoLimite()));
      faixa.value = p;
      instante = ehHoje() && p >= passoLimite() ? null : tDe(p);
      marcar(); // antes do aoMudar: o app chama marcar(quantas) com a contagem do instante
      aoMudar(instante);
    }
    function trocarDia(inicio) {
      parar();
      inicioDia = inicio;
      rotularDia();
      // Hoje: volta ao vivo. Outro dia: começa ao meio-dia (arraste ou ▶ para percorrer as horas).
      irPara(ehHoje() ? PASSOS : PASSOS / 2);
    }
    function parar() {
      clearInterval(tocando);
      tocando = null;
      btnTocar.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i>';
      btnTocar.setAttribute('aria-label', 'Tocar o dia');
    }
    function tocar() {
      if (tocando) return parar();
      if (Number(faixa.value) >= passoLimite()) irPara(0);
      btnTocar.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
      btnTocar.setAttribute('aria-label', 'Pausar');
      tocando = setInterval(() => {
        const p = Number(faixa.value) + 1;
        irPara(p);
        if (p >= passoLimite()) parar();
      }, 1000 / 12); // 12 passos de 5 min por segundo = 1 h/s
    }
    faixa.addEventListener('input', () => { parar(); irPara(faixa.value); });
    btnTocar.onclick = tocar;
    el.querySelector('.lt-ao-vivo').onclick = () => trocarDia(GC.inicioDoDia(agora()));
    el.querySelector('.lt-fechar').onclick = () => fechar();

    function abrir() {
      el.hidden = false;
      document.body.classList.add('com-linha-tempo');
      marcar(); // acompanharRelogio escreve o dia e, ao vivo, põe a régua em agora (no dia novo, se virou)
    }
    function fechar() {
      parar();
      fecharCalendario(false);
      el.hidden = true;
      document.body.classList.remove('com-linha-tempo');
      if (instante !== null) trocarDia(GC.inicioDoDia(agora()));
    }
    return {
      abrir, fechar,
      alternar: () => (el.hidden ? abrir() : fechar()),
      aberta: () => !el.hidden,
      instante: () => instante,
      fecharCalendario,
      marcar, // o app informa quantas estão abertas no instante
    };
  };

  // ======================= Modo telão =======================
  // Para a TV da sala de situação: tela cheia, só o mapa e os números. A câmera não para: voa de um
  // alerta ao outro e, parada em cada um, gira devagar em volta dele; no fim da fila passa pela cidade
  // inteira e recomeça. Um alerta novo interrompe a fila, aparece como "Nova" e a câmera vai até ele.
  // "Pausar câmera" (ou Espaço) congela o movimento e libera o mapa para mexer à mão; "Retomar" volta.
  // Sai com Esc, com o botão "Sair" ou saindo da tela cheia.
  // lista() → { itens, total, criterio: 'atencao' | 'criticas' }; buscar(id) → a ocorrência ativa ou null.
  GC.criarTelao = function ({ mapa, lista, buscar, descrever, aoMudar, filtro }) {
    const NA_CIDADE_MS = 6000;
    const NO_PONTO_MS = 8000;
    const GIRO_PONTO = 18; // graus que a câmera gira em volta do alerta enquanto está nele
    const GIRO_CIDADE = 10;
    const el = document.createElement('div');
    el.className = 'telao';
    el.hidden = true;
    el.innerHTML = `
      <div class="telao-faixa" role="status" hidden></div>
      <div class="telao-cartao" aria-live="polite"></div>
      <div class="telao-canto"><span class="telao-filtro" hidden></span><span class="telao-relogio"></span><span class="telao-vivo"><span class="ponto"></span> Ao vivo</span></div>
      <div class="telao-botoes">
        <button type="button" class="telao-pausar" aria-pressed="false"></button>
        <button type="button" class="telao-sair"><i class="ti ti-x" aria-hidden="true"></i> Sair do telão <kbd>Esc</kbd></button>
      </div>`;
    document.body.appendChild(el);
    const cartao = el.querySelector('.telao-cartao');
    const btnPausar = el.querySelector('.telao-pausar');
    const faixa = el.querySelector('.telao-faixa');
    // Na TV ninguém mexe no mouse: sem movimento por 3 s, somem os botões e o cursor (menos pausado,
    // quando o botão "Retomar" precisa estar à vista).
    let ocioso = null;
    function acordar() {
      if (!ativo) return;
      document.body.classList.remove('telao-ocioso');
      clearTimeout(ocioso);
      ocioso = setTimeout(() => { if (ativo && !pausado) document.body.classList.add('telao-ocioso'); }, 3000);
    }
    document.addEventListener('mousemove', acordar, { passive: true });
    let ativo = false;
    let pausado = false;
    let passo = null;
    let giro = null;
    let fila = []; // ids, não objetos: cada passo busca o estado atual da ocorrência
    let indice = -1;
    let novas = new Set(); // ids que entraram na fila por novidade() (o cartão diz "Nova")
    let relogio = null;
    // Cada passo ganha um número; um voo que termina depois de outro passo começar é ignorado.
    let geracao = 0;
    const semMovimento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const esperar = (ms, fn) => { clearTimeout(passo); passo = setTimeout(fn, ms); };
    function pararTudo() {
      geracao++;
      clearTimeout(passo);
      clearTimeout(giro);
      mapa.pararCamera();
    }
    // Giro lento em volta do centro atual, até o próximo passo (que interrompe o giro ao voar).
    function girar(graus, ms) {
      if (!semMovimento()) mapa.girarDevagar(graus, ms);
    }
    function textoCidade({ total, criterio }) {
      if (!total) return 'Nenhuma ocorrência pede atenção agora';
      if (criterio === 'criticas') return `${total} ${total === 1 ? 'ocorrência crítica ativa' : 'ocorrências críticas ativas'}`;
      return `${total} ${total === 1 ? 'ocorrência precisa' : 'ocorrências precisam'} de atenção`;
    }
    // Filtro ativo no mapa (o telão segue ele): à vista no canto, para não parecer que sumiu ocorrência.
    function marcarFiltro() {
      const f = filtro ? filtro() : '';
      const alvo = el.querySelector('.telao-filtro');
      alvo.hidden = !f;
      alvo.textContent = f ? `Filtro: ${f}` : '';
    }
    function novaFila() {
      marcarFiltro();
      const r = lista();
      fila = r.itens.map((o) => o.id);
      indice = -1;
      novas = new Set();
      return r;
    }
    function mostrarCidade() {
      if (!ativo || pausado) return;
      pararTudo();
      const meu = geracao;
      mapa.acender(null);
      mapa.visaoGeral(2.2);
      const r = novaFila();
      const mostrando = r.total > r.itens.length ? ` · a seguir, as ${r.itens.length} mais urgentes` : '';
      cartao.className = 'telao-cartao cidade';
      cartao.innerHTML = `<div class="tc-topo"><span class="tc-sev">Visão geral</span>${mostrando ? `<span class="tc-area">A seguir, as ${r.itens.length} mais urgentes</span>` : ''}</div>
        <b class="tc-titulo">${textoCidade(r)}</b>`;
      // Chegando à cidade inteira, segue girando devagar até o próximo alerta.
      giro = setTimeout(() => { if (meu === geracao) girar(GIRO_CIDADE, NA_CIDADE_MS - 2300); }, 2300);
      esperar(NA_CIDADE_MS, proximo);
    }
    // Próximo da fila que ainda está ativo (para o "A seguir").
    function seguinte() {
      for (let i = indice + 1; i < fila.length; i++) {
        const o = buscar(fila[i]);
        if (o) return o;
      }
      return null;
    }
    // Bloco do prazo: o que a equipe tem de fazer e até quando, com a barra do prazo já consumido.
    function htmlPrazo(p) {
      if (p.estado === 'campo') return `<div class="tc-prazo campo"><small>Situação</small><strong>🚧 ${esc(p.texto)}</strong></div>`;
      if (p.estado === 'atrasada') {
        return `<div class="tc-prazo atrasada"><small>⏰ ${esc(p.rotulo)}</small><strong>${esc(p.tempo)}</strong><span>${esc(p.detalhe)}</span></div>`;
      }
      const nivel = p.usadoPct >= 85 ? 'quase' : p.usadoPct >= 60 ? 'meio' : '';
      return `<div class="tc-prazo correndo ${nivel}" style="--usado:${p.usadoPct.toFixed(0)}%"><small>${esc(p.rotulo)}</small><strong>${esc(p.tempo)}</strong>
        <i class="tc-prazo-barra" aria-hidden="true"></i></div>`;
    }
    const esc = (t) => GC.escaparHtml(String(t));
    function desenharCartao(o, nova, extra = '') {
      const d = descrever(o);
      cartao.className = `telao-cartao ${o.severidade}${nova ? ' nova' : ''}`;
      // Bolinhas da fila (a atual cheia); a nova leva a etiqueta no lugar.
      const pontos = fila.length > 1 && fila.length <= 10
        ? `<span class="tc-fila" aria-label="${indice + 1} de ${fila.length}">${fila.map((_, i) => `<i class="${i === indice ? 'atual' : i < indice ? 'visto' : ''}"></i>`).join('')}</span>` : '';
      const topo = `<span class="tc-sev">${nova ? 'Nova · ' : ''}${esc(d.gravidade)}</span><span class="tc-area">${esc(d.area)}</span>${nova ? '' : pontos}`;
      const meta = [`📍 ${esc(d.onde)}`, d.afetados ? `👥 ${d.afetados.toLocaleString('pt-BR')} pessoas afetadas` : '', ...d.motivos.map(esc)]
        .filter(Boolean).map((t) => `<span>${t}</span>`).join('');
      const prox = seguinte();
      cartao.innerHTML = `<div class="tc-topo">${topo}</div>
        <b class="tc-titulo">${esc(o.titulo)}</b>
        <div class="tc-meta">${meta}</div>
        ${htmlPrazo(d.prazo)}
        ${d.acao ? `<div class="tc-acao">${esc(d.acao)}</div>` : ''}
        ${extra}
        ${prox && prox.id !== o.id ? `<div class="tc-seguir"><small>A seguir</small> ${esc(prox.titulo)}</div>` : ''}
        <i class="telao-progresso" style="--dur:${NO_PONTO_MS}ms"></i>`;
      if (nova) anunciar(o, d);
    }
    // Faixa no alto da tela quando chega uma ocorrência nova (some sozinha).
    let fimFaixa = null;
    function anunciar(o, d) {
      faixa.className = `telao-faixa ${o.severidade}`;
      faixa.innerHTML = `<span class="ponto"></span><b>Nova ocorrência</b> · ${esc(d.gravidade)} · ${esc(o.titulo)}`;
      faixa.hidden = false;
      clearTimeout(fimFaixa);
      fimFaixa = setTimeout(() => { faixa.hidden = true; }, 6000);
    }
    // Vai ao próximo item da fila que ainda está ativo e no mapa; o tempo no ponto só começa a contar
    // quando a câmera chega (abrir grupos e voar pode levar alguns segundos).
    async function proximo() {
      if (!ativo || pausado) return;
      pararTudo();
      const meu = geracao;
      let o = null;
      while (!o && ++indice < fila.length) o = buscar(fila[indice]);
      if (!o) return mostrarCidade();
      const nova = novas.has(o.id);
      const chegou = await mapa.sobrevoar(o.id, {
        aoComecar: () => { if (meu === geracao) desenharCartao(o, nova); },
        // O alerta fica no centro da área à direita do cartão (que está no canto inferior esquerdo).
        // Tela estreita (o cartão ocupa quase tudo): centro normal.
        espacoEsquerda: () => {
          const direita = cartao.getBoundingClientRect().right;
          return direita > window.innerWidth * 0.6 ? 0 : Math.round(direita);
        },
      });
      if (!ativo || meu !== geracao) return; // saiu, pausou, ou outro passo (uma nova) passou na frente
      if (!chegou) return proximo(); // resolvida ou filtrada enquanto esperava: pula sem mostrar
      const barra = cartao.querySelector('.telao-progresso');
      if (barra) barra.classList.add('andando');
      girar(GIRO_PONTO * (indice % 2 ? -1 : 1), NO_PONTO_MS);
      esperar(NO_PONTO_MS, proximo);
    }
    // Ocorrência nova: entra logo depois do item atual (sem repetir se já estava na fila) e a câmera
    // vai até ela na hora. Com a câmera pausada, só avisa; ela é a próxima ao retomar.
    function novidade(o) {
      if (!ativo || !o || !buscar(o.id)) return; // fora do filtro do mapa: não tem pino para mostrar
      const resto = fila.slice(indice + 1).filter((id) => id !== o.id);
      fila = [...fila.slice(0, Math.max(0, indice + 1)), o.id, ...resto];
      novas.add(o.id);
      if (!pausado) return proximo();
      desenharCartao(o, true, '<div class="tc-pausa">▶ Retome a câmera para ir até ela</div>');
    }

    function marcarPausa() {
      btnPausar.setAttribute('aria-pressed', String(pausado));
      btnPausar.innerHTML = pausado
        ? '<i class="ti ti-player-play" aria-hidden="true"></i> Retomar câmera <kbd>Espaço</kbd>'
        : '<i class="ti ti-player-pause" aria-hidden="true"></i> Pausar câmera <kbd>Espaço</kbd>';
      el.classList.toggle('pausado', pausado);
    }
    function pausar(valor = !pausado) {
      if (!ativo || valor === pausado) return;
      pausado = valor;
      marcarPausa();
      if (pausado) {
        document.body.classList.remove('telao-ocioso');
        pararTudo();
        const barra = cartao.querySelector('.telao-progresso');
        if (barra) barra.classList.remove('andando');
      } else {
        // Retoma do item seguinte (ou da nova que chegou durante a pausa).
        acordar();
        proximo();
      }
    }
    btnPausar.onclick = () => pausar();

    const marcarRelogio = () => {
      el.querySelector('.telao-relogio').textContent = new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    function entrar() {
      if (ativo) return;
      ativo = true;
      pausado = false;
      marcarPausa();
      el.hidden = false;
      document.body.classList.add('telao-ativo');
      if (GC.fecharDashboard) GC.fecharDashboard();
      marcarRelogio();
      relogio = setInterval(marcarRelogio, 30000);
      const raiz = document.documentElement;
      if (raiz.requestFullscreen && !document.fullscreenElement) raiz.requestFullscreen().catch(() => {});
      if (aoMudar) aoMudar(true);
      // Começa direto no primeiro alerta (sem alerta nenhum, na cidade inteira girando).
      const r = novaFila();
      cartao.className = 'telao-cartao cidade';
      cartao.innerHTML = `<div class="tc-topo"><span class="tc-sev">Modo telão</span></div><b class="tc-titulo">${textoCidade(r)}</b>`;
      acordar();
      esperar(400, proximo); // depois do layout sem os painéis
    }
    function sair() {
      if (!ativo) return;
      ativo = false;
      pausado = false;
      pararTudo();
      clearInterval(relogio);
      clearTimeout(ocioso);
      clearTimeout(fimFaixa);
      faixa.hidden = true;
      document.body.classList.remove('telao-ocioso');
      el.hidden = true;
      document.body.classList.remove('telao-ativo');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      mapa.acender(null);
      mapa.visaoGeral();
      if (aoMudar) aoMudar(false);
    }
    el.querySelector('.telao-sair').onclick = sair;
    document.addEventListener('keydown', (ev) => {
      if (!ativo) return;
      if (ev.key === 'Escape') { ev.stopImmediatePropagation(); sair(); return; }
      const a = document.activeElement;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable;
      // Espaço pausa/retoma (sem deixar o botão focado "clicar" de novo).
      if (ev.key === ' ' && !digitando && !ev.repeat) { ev.preventDefault(); ev.stopImmediatePropagation(); pausar(); }
    }, true);
    // Saiu da tela cheia pelo navegador (F11, Esc do sistema): sai do telão também.
    document.addEventListener('fullscreenchange', () => { if (ativo && !document.fullscreenElement) sair(); });
    return { entrar, sair, novidade, pausar, ativo: () => ativo, pausado: () => pausado };
  };
})(window.GC = window.GC || {});
