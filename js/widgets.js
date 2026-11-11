(function (GC) {
  // v3: dashboard abaixo do mapa (widgets ligados, na ordem escolhida) e a gaveta Widgets.
  const esc = (t) => GC.escaparHtml(t);
  const widget = (id) => GC.WIDGETS.find((w) => w.id === id);
  const horas = (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

  GC.criarWidgetsUI = function (el, { aoMudar, aoFechar, aoSalvarVista, aoAbrirSecretaria, aoVerResolvida, aoSelecionarBairro, aoVerLeito, aoVerCalorBO, aoVerViolencia, aoVerRisco, aoVerObra, aoFiltrarObras, aoVerEscola, aoVerFrota, aoVerColeta, aoVerFarmacia, aoVerSocial, widgetsIA, graficoAtualIA, aoPerguntarIA, aoExcluirIA, aoAbrirIndicador, aoAbrirAlerta, aoIrCrise, aoResumo, aoRestaurar, infoVista }) {
    let cfg = { ativos: (GC.WIDGETS_PADRAO || GC.WIDGETS.map((w) => w.id)).slice(), pulsos: null };
    const mudar = (parcial) => aoMudar(Object.assign({}, cfg, parcial));

    // ---- conteúdo de cada widget ----
    function numeros(k) {
      const itens = [
        ['critica', k.criticas, 'críticas ativas'],
        ['alerta', k.estouradas, 'com prazo estourado'],
        ['andamento', k.emAndamento, 'equipes em campo'],
        ['bom', `${k.satisfacaoPct}%`, 'satisfação'],
        ['', `${k.noPrazoPct}%`, 'resolvidas no prazo (30 dias)'],
        ['', horas(k.tempoMedioH), 'tempo médio de resolução'],
      ];
      return `<div class="w-numeros">${itens.map(([c, v, r]) => `<div class="w-num ${c}"><b>${v}</b><small>${r}</small></div>`).join('')}</div>`;
    }

    function satisfacao(porBairro, selecionado) {
      const todas = GC.data.bairros.map((b) => ({ b, v: porBairro[b.id] })).filter((x) => typeof x.v === 'number').sort((a, b) => a.v - b.v);
      // Cidade grande: só os 8 piores (e o bairro selecionado, se não estiver entre eles).
      const MAX = 8;
      const linhas = todas.length > 12 ? todas.filter((x, i) => i < MAX || x.b.id === selecionado) : todas;
      const nota = linhas.length < todas.length ? `<p class="w-legenda">Os ${MAX} bairros com menor satisfação, de ${todas.length}.</p>` : '';
      return `${nota}<ul class="w-satisf">${linhas.map(({ b, v }) => `
        <li><div class="w-satisf-linha${b.id === selecionado ? ' ativo' : ''}">
          <span>${esc(b.nome)}</span><i style="--v:${v}%" class="${v < 60 ? 'ruim' : v < 75 ? 'medio' : 'bom'}"></i><b>${v}%</b>
        </div></li>`).join('')}</ul>
        <p class="w-legenda" aria-label="Legenda das cores"><span><i style="background:var(--critica)"></i>abaixo de 60%</span><span><i style="background:var(--media)"></i>60% a 74%</span><span><i style="background:var(--positivo)"></i>75% ou mais</span></p>`;
    }

    // Leitos: números da rede, uma barra por unidade (da mais cheia à mais folgada) e atendimentos do dia.
    function leitos(r) {
      if (!r) return '';
      const sit = (p) => GC.leitos.situacao(p);
      const tipos = Object.entries(r.atendimentosHoje.porTipo).sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${esc(t)} <b>${n}</b>`).join(' · ');
      const lista = r.unidades.map((u) => {
        const pior = Math.max(u.pct, u.utiPct || 0);
        const cor = u.situacao === 'critica' ? 'ruim' : u.situacao === 'atencao' ? 'medio' : 'bom';
        const uti = u.utiPct !== null ? ` · UTI ${u.utiPct}%` : '';
        return `<li><button type="button" data-leito="${u.id}" title="Ver ${esc(u.nome)} no mapa">
          <span>${u.tipo === 'upa' ? '🚑' : '🏥'} ${esc(u.nome)}<small>${u.livres} livres${uti}</small></span><i style="--v:${pior}%" class="${cor}"></i><b>${pior}%</b>
        </button></li>`;
      }).join('');
      return `<div class="w-leitos">
        <div class="w-numeros">
          <div class="w-num ${sit(r.pct) === 'ok' ? '' : 'alerta'}"><b>${r.pct}%</b><small>leitos ocupados</small></div>
          <div class="w-num"><b>${r.livres}</b><small>leitos livres de ${r.total}</small></div>
          <div class="w-num ${sit(r.utiPct) === 'ok' ? '' : 'alerta'}"><b>${r.utiLivres}</b><small>vagas de UTI · ${r.utiPct}% ocupada</small></div>
          <div class="w-num ${r.emAlerta.length ? 'critica' : 'bom'}"><b>${r.emAlerta.length}</b><small>unidade(s) em situação crítica</small></div>
        </div>
        <ul class="w-satisf w-leitos-lista w-det">${lista}</ul>
        <p class="w-leitos-atend">🩺 <b>${r.atendimentosHoje.total}</b> atendimentos hoje · ${tipos}</p>
      </div>`;
    }

    // Segurança: B.O.s de hoje e do mês, bairro mais crítico, tipos e o bloco de violência contra
    // mulheres e crianças (sempre agregado por bairro).
    const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
    const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
    function seguranca(s) {
      if (!s) return '';
      const maxTipo = s.porTipo[0].n;
      const tipos = s.porTipo.map((t) => `<li><span>${esc(t.tipo)}</span><i style="--v:${Math.round((t.n / maxTipo) * 100)}%" class="medio"></i><b>${t.n}</b></li>`).join('');
      const v = s.violencia;
      const top = v.porBairro.slice(0, 3);
      return `<div class="w-seg">
        <div class="w-numeros">
          <div class="w-num ${s.hojeAlto ? 'alerta' : ''}"><b>${s.hoje}</b><small>B.O.s hoje até ${esc(s.ateHora)} · média ${s.mediaDia.toLocaleString('pt-BR')}/dia (${sinal(s.hojeVariacaoPct)})</small></div>
          <div class="w-num ${s.mesVariacaoPct > 0 ? 'alerta' : 'bom'}"><b>${s.total30d}</b><small>B.O.s em 30 dias · ${sinal(s.mesVariacaoPct)} no mês</small></div>
          <div class="w-num critica"><b>${esc(nomeBairro(s.bairroCritico.id))}</b><small>bairro com mais B.O.s · ${s.bairroCritico.total} (${s.bairroCritico.pct}% da cidade)</small></div>
        </div>
        <div class="w-seg-colunas">
          <div class="w-det">
            <h4>Por tipo · 30 dias <button type="button" class="btn-sec" data-calor-bo>🔥 Ver mapa de calor</button></h4>
            <ul class="w-barras">${tipos}</ul>
          </div>
          <div class="w-vmc ${v.subindo ? 'subindo' : ''}">
            <h4>Violência contra mulheres e crianças</h4>
            <p class="w-vmc-num"><b>${v.mes}</b> casos no mês <span class="${v.subindo ? 'ruim' : 'bom'}">${sinal(v.variacaoPct)} vs. mês anterior · ${sinal(v.variacaoAnoPct)} em 12 meses</span></p>
            <p class="w-vmc-detalhe">👤 ${v.mulheres} contra mulheres · ${v.criancas} contra crianças e adolescentes</p>
            <ul class="w-vmc-bairros">${top.map((b) => `<li><span>${esc(nomeBairro(b.id))}</span><b>${esc(b.texto)}</b></li>`).join('')}</ul>
            <button type="button" class="btn-sec" data-violencia="${top.map((b) => b.id).join(',')}">📍 Ver bairros no mapa</button>
            <small>Só números por bairro: o endereço das vítimas não aparece no painel.</small>
          </div>
        </div>
      </div>`;
    }

    // Risco climático: alerta preventivo (onde ainda dá para agir antes), chuva prevista e áreas por nível.
    const NIVEL = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
    function risco(r) {
      if (!r) return '';
      const p = r.previsao;
      const maxMm = Math.max(...p.janelas.map((j) => j.mm));
      const chuva = p.janelas.map((j) => `<li><i style="--h:${Math.round((j.mm / maxMm) * 100)}%"></i><b>${j.mm} mm</b><small>em ${j.horas} h</small></li>`).join('');
      const pv = r.preventivo;
      const alerta = pv ? `<div class="w-risco-alerta">
          <div><b>⚠ Risco alto de ${pv.tipo} em ~${pv.horasAte} h · ${esc(pv.nome)}</b>
          <small>${pv.familias} famílias na área · 👉 ${esc(pv.acao)}</small></div>
          <button type="button" class="btn-sec" data-risco="${pv.id}">📍 Ver no mapa</button>
        </div>` : '<p class="w-risco-ok">✅ Nenhuma área com risco alto ainda não atingida.</p>';
      const areas = r.areas.map((a) => `<li><button type="button" data-risco="${a.id}" title="Ver ${esc(a.nome)} no mapa">
          <span class="nivel ${a.nivel}">${NIVEL[a.nivel]}</span>
          <span class="nome">${a.tipo === 'deslizamento' ? '⛰' : '🌧'} ${esc(a.nome)}<small>${a.horasAte === null ? 'sem risco em 24 h' : `limiar em ~${a.horasAte} h`} · ${a.familias} famílias</small></span>
          ${a.atingida ? '<span class="atingida">🚨 atingida agora</span>' : ''}
        </button></li>`).join('');
      return `<div class="w-risco">
        ${alerta}
        <div class="w-risco-colunas">
          <div>
            <h4>Chuva prevista <small>${esc(p.fonte)} · há ${p.atualizadaHaMin} min · já choveu ${p.acumulado72h} mm em 72 h</small></h4>
            <ul class="w-chuva">${chuva}</ul>
            <p class="w-risco-resumo"><b>${r.familiasRiscoAlto}</b> famílias em áreas de risco alto · <b>${r.atingidas.length}</b> área(s) já atingida(s)</p>
          </div>
          <div class="w-det">
            <h4>Áreas de risco mapeadas</h4>
            <ul class="w-risco-areas">${areas}</ul>
          </div>
        </div>
      </div>`;
    }

    // Obras: números, chips de setor (filtram o widget e o mapa), alertas (paralisada, pago à frente do
    // feito) e a lista da mais atrasada à concluída, com obra feita × pago.
    let setorObras = null;
    let modObras = null;
    const SIT_OBRA = { paralisada: 'Paralisada', atrasada: 'Atrasada', em_dia: 'No prazo', concluida: 'Concluída' };
    const reais = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
    function obras(mod) {
      if (!mod) return '';
      modObras = mod;
      const r = mod.resumo(setorObras);
      const chips = [`<button type="button" class="chip ${setorObras ? '' : 'ativo'}" data-setor-obra="">Todas</button>`,
        ...r.porSetor.filter((s) => s.total).map((s) => `<button type="button" class="chip ${setorObras === s.id ? 'ativo' : ''}" data-setor-obra="${s.id}">${s.emoji} ${esc(s.nome)} <small>${s.total}${s.atrasadas ? ` · <em>${s.atrasadas} atras.</em>` : ''}</small></button>`)].join('');
      const alertas = [
        ...r.paralisadas.map((ob) => `<li data-obra="${ob.id}">⏸ <b>${esc(ob.nome)}</b> sem avanço há ${ob.semAvancoDias} dias · ${ob.diasAtraso} dias de atraso</li>`),
        ...r.gastoAFrente.map((ob) => `<li data-obra="${ob.id}">💰 <b>${esc(ob.nome)}</b>: pago ${ob.gastoPct}% do contrato com ${ob.avancoPct}% feito</li>`),
      ].join('');
      const lista = r.obras.map((ob) => `<li><button type="button" data-obra="${ob.id}" title="Ver no mapa">
          <span class="sit ${ob.situacao}">${SIT_OBRA[ob.situacao]}</span>
          <span class="nome">${esc(ob.nome)}<small>${reais(ob.contratoMi)} · ${ob.diasAtraso ? `<em>${ob.diasAtraso} dias de atraso</em>` : ob.situacao === 'concluida' ? 'entregue no prazo' : `${ob.diasEmAndamento} dias em andamento`}</small></span>
          <span class="duas-barras"><i style="--v:${ob.avancoPct}%" title="Obra feita: ${ob.avancoPct}%"></i><i class="pago" style="--v:${Math.min(ob.gastoPct, 100)}%" title="Pago: ${ob.gastoPct}%"></i></span>
          <b>${ob.avancoPct}%</b>
        </button></li>`).join('');
      return `<div class="w-obras">
        <div class="w-numeros">
          <div class="w-num"><b>${r.emAndamento}</b><small>obras em andamento · ${r.noPrazo} no prazo</small></div>
          <div class="w-num ${r.atrasadas ? 'critica' : 'bom'}"><b>${r.atrasadas}</b><small>atrasadas · ${r.atrasoMedioDias} dias de atraso médio</small></div>
          <div class="w-num"><b>${reais(r.contratoMi)}</b><small>contratado · ${r.gastoPct}% já pago</small></div>
          <div class="w-num bom"><b>${r.concluidas}</b><small>entregues no ano</small></div>
        </div>
        <div class="w-obras-setores w-det">${chips}</div>
        ${alertas ? `<ul class="w-obras-alertas">${alertas}</ul>` : ''}
        <div class="w-obras-legenda w-det"><span><i></i> obra feita</span><span><i class="pago"></i> pago</span></div>
        <ul class="w-obras-lista w-det">${lista}</ul>
      </div>`;
    }

    // Educação: rede (alunos, professores faltando, evasão, frequência), alertas por escola, lista de escolas e
    // a escolaridade da população (alfabetização no 3º ano, 15+ alfabetizados, 25+ com ensino médio).
    const SIT_ESCOLA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Em dia' };
    const pctBR = (n) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR')}%`);
    function educacao(r) {
      if (!r) return '';
      const alertas = r.emAlerta.flatMap((x) => x.motivos.filter((m) => m.critico).map((m) => `<li data-escola="${x.id}">⚠ <b>${esc(x.nome)}</b>: ${esc(m.texto)}</li>`)).join('');
      const lista = r.escolas.map((x) => `<li><button type="button" data-escola="${x.id}" title="Ver no mapa">
          <span class="sit ${x.situacao}">${SIT_ESCOLA[x.situacao]}</span>
          <span class="nome">${esc(x.nome)}<small>${x.alunos} ${x.tipo === 'cmei' ? 'crianças' : 'alunos'} · ${x.alunosPorProfessor.toLocaleString('pt-BR')} por professor · freq. ${x.frequenciaPct}%${x.evasaoPct !== null ? ` · evasão ${pctBR(x.evasaoPct)}` : ''}</small></span>
          <span class="prof ${x.faltando ? 'falta' : ''}">${x.faltando ? `faltam ${x.faltando}` : 'completa'}</span>
        </button></li>`).join('');
      const piores = r.piorEscolaridade.map((b) => `<li><span>${esc(b.nome)}</span><b>${pctBR(b.ensinoMedio25)}</b></li>`).join('');
      return `<div class="w-edu">
        <div class="w-numeros">
          <div class="w-num"><b>${r.alunos.toLocaleString('pt-BR')}</b><small>alunos em ${r.escolas.length} escolas · ${r.alunosPorProfessor.toLocaleString('pt-BR')} por professor</small></div>
          <div class="w-num ${r.faltando ? 'critica' : 'bom'}"><b>${r.faltando}</b><small>professores faltando · ${r.aulasPerdidasSemana.toLocaleString('pt-BR')} aulas perdidas por semana</small></div>
          <div class="w-num ${r.evasaoPct >= GC.data.educacao.limite.evasaoAtencao ? 'alerta' : ''}"><b>${pctBR(r.evasaoPct)}</b><small>evasão no ano · ${r.evasaoAlta.length} escola(s) acima de ${GC.data.educacao.limite.evasaoAtencao}%</small></div>
          <div class="w-num ${r.frequenciaPct < GC.data.educacao.limite.freqAtencao ? 'alerta' : 'bom'}"><b>${pctBR(r.frequenciaPct)}</b><small>frequência média</small></div>
        </div>
        ${alertas ? `<ul class="w-obras-alertas">${alertas}</ul>` : ''}
        <div class="w-seg-colunas w-det">
          <div>
            <h4>Escolas da rede</h4>
            <ul class="w-edu-lista">${lista}</ul>
          </div>
          <div class="w-edu-escolaridade">
            <h4>Alfabetização e escolaridade</h4>
            <p><b>${pctBR(r.alfabetizacao3anoPct)}</b> das crianças alfabetizadas no 3º ano (rede)</p>
            <p><b>${pctBR(r.cidade.alfabetizados15)}</b> da população com 15 anos ou mais sabe ler e escrever</p>
            <p><b>${pctBR(r.cidade.ensinoMedio25)}</b> dos adultos (25+) concluíram o ensino médio</p>
            <h4>Menos adultos com ensino médio</h4>
            <ul class="w-vmc-bairros">${piores}</ul>
            <small>Onde EJA e cursos preparatórios fazem mais diferença.</small>
          </div>
        </div>
      </div>`;
    }

    // Frota: ônibus (metas do contrato de concessão) e ambulâncias (SAMU) lado a lado, linhas com espera nos
    // pontos e a agenda de manutenção (vencidas, hoje, próximos dias).
    const SIT_LINHA = { critica: 'Crítica', atencao: 'Atenção', ok: 'Normal' };
    const SIT_AGENDA = { vencida: 'Vencida', hoje: 'Hoje', proxima: 'Agendada' };
    const dataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
    function frota(r) {
      if (!r) return '';
      const o = r.onibus;
      const a = r.ambulancias;
      const cartao = (titulo, f, linhasExtra, id) => `<div class="w-frota-cartao">
          <h4>${titulo}${id ? ` <button type="button" class="btn-sec" data-frota="${id}">📍 Ver no mapa</button>` : ''}</h4>
          <div class="w-frota-disp"><b>${f.operando}</b> de ${f.necessarios} rodando <span class="${f.disponibilidadePct >= (f.metaDisponibilidadePct || 95) ? 'bom' : 'ruim'}">${f.disponibilidadePct}% de disponibilidade</span></div>
          <ul class="w-frota-estados">
            <li><b>${f.corretiva}</b>em manutenção</li>
            <li><b>${f.preventiva}</b>em preventiva hoje</li>
            <li class="${f.preventivaVencida ? 'ruim' : ''}"><b>${f.preventivaVencida}</b>com preventiva vencida</li>
            <li><b>${f.reserva}</b>na reserva</li>
          </ul>
          ${linhasExtra}
        </div>`;
      const contrato = o.foraDoContrato
        ? `<p class="w-frota-cobrar">📣 Abaixo do contrato: disponibilidade ${o.disponibilidadePct}% (meta ${o.metaDisponibilidadePct}%) e viagens ${o.viagensPct}% (meta ${o.metaViagensPct}%). Cabe notificar a ${esc(o.operadora)}; multa estimada de R$ ${o.multaEstimadaMil} mil no mês.</p>`
        : '<p class="w-frota-ok">✅ Concessionária dentro das metas do contrato.</p>';
      const linhas = r.linhas.map((x) => `<li><button type="button" data-frota="${x.id}" title="Ver o trajeto no mapa">
          <span class="sit ${x.situacao}">${SIT_LINHA[x.situacao]}</span>
          <span class="nome">${esc(x.nome)}<small>espera ${x.esperaMin} min (programado ${x.intervaloMin}) · ${x.viagensPct}% das viagens</small></span>
        </button></li>`).join('');
      const agenda = r.agenda.map((x) => `<li class="${x.situacao}"><span class="quando">${SIT_AGENDA[x.situacao]} · ${dataCurta(x.data)}</span><span>${x.frota === 'onibus' ? '🚌' : '🚑'} <b>${esc(x.veiculo)}</b> · ${esc(x.motivo)}</span></li>`).join('');
      const garagem = r.garagens[0];
      const piorBase = r.bases.slice().sort((x, y) => x.disponibilidadePct - y.disponibilidadePct)[0];
      return `<div class="w-frota">
        <div class="w-seg-colunas">
          ${cartao(`🚌 Ônibus · ${esc(o.operadora)} (concessão)`, o, `<p class="w-frota-nota">${o.viagensRealizadas.toLocaleString('pt-BR')} de ${o.viagensProgramadas.toLocaleString('pt-BR')} viagens hoje (${o.viagensPct}%) · ${o.acimaIdade} ônibus acima de ${o.idadeMaxAnos} anos (troca)</p>${contrato}`, garagem && garagem.id)}
          ${cartao('🚑 Ambulâncias · SAMU', a, `<p class="w-frota-nota">⏱ Tempo de resposta <b class="${a.tempoRespostaMin > a.metaTempoRespostaMin ? 'ruim' : 'bom'}">${a.tempoRespostaMin} min</b> (meta ${a.metaTempoRespostaMin}) · ${a.chamadosHoje} chamados hoje</p>`, piorBase && piorBase.id)}
        </div>
        <div class="w-seg-colunas w-det">
          <div><h4>Linhas · espera nos pontos</h4><ul class="w-edu-lista w-frota-linhas">${linhas}</ul></div>
          <div><h4>Agenda de manutenção</h4><ul class="w-frota-agenda">${agenda}</ul></div>
        </div>
      </div>`;
    }

    // Coleta de lixo: rotas de hoje (com o caminhão), no prazo em 30 dias e o calendário por bairro
    // ("quando passa o caminhão no meu bairro?", o que o cidadão quer saber).
    const ST_COLETA = { atrasada: 'Atrasada', em_andamento: 'Na rua', agendada: 'Mais tarde', concluida: 'Concluída', sem_coleta_hoje: 'Não hoje' };
    const SIT_DE_STATUS = { atrasada: 'critica', em_andamento: 'atencao', agendada: 'ok', concluida: 'ok', sem_coleta_hoje: 'neutro' };
    function coleta(r) {
      if (!r) return '';
      const nomeDia = GC.data.coleta.nomeDia;
      const dias = (lista) => (lista.length === 6 && !lista.includes('dom') ? 'seg a sáb' : lista.join(', ')) || '—';
      const rotas = r.rotas.map((x) => `<li><button type="button" data-coleta="${x.id}" title="Ver a rota no mapa">
          <span class="sit ${SIT_DE_STATUS[x.status]}">${ST_COLETA[x.status]}</span>
          <span class="nome">${x.tipo === 'seletiva' ? '♻ ' : ''}${esc(x.nome)}<small>${esc(dias(x.dias))} · ${esc(x.horario)} · ${x.noPrazoPct}% no prazo${x.status === 'em_andamento' ? ` · ${x.progressoPct}% feito` : ''}${x.motivo ? ` · ${esc(x.motivo)}` : ''}</small></span>
        </button></li>`).join('');
      const cal = r.calendario.map((b) => `<tr class="${b.atrasada ? 'atrasada' : ''}">
          <th><button type="button" data-coleta="${b.id}" title="Ver no mapa">${esc(b.nome)}</button></th>
          <td>${esc(dias(b.domiciliar.dias))}<small>${esc(b.domiciliar.horario)}</small></td>
          <td>${esc(dias(b.seletiva.dias))}</td>
          <td class="prox">${b.atrasada ? '⚠ atrasada' : esc(b.domiciliar.proxima ? b.domiciliar.proxima.texto : '—')}</td>
        </tr>`).join('');
      return `<div class="w-coleta">
        <div class="w-numeros">
          <div class="w-num ${r.atrasadas.length ? 'critica' : 'bom'}"><b>${r.atrasadas.length}</b><small>rota(s) atrasada(s) hoje</small></div>
          <div class="w-num andamento"><b>${r.emAndamento.length} de ${r.deHoje.length}</b><small>rotas de hoje (${esc(nomeDia[r.diaHoje])}) com caminhão na rua</small></div>
          <div class="w-num ${r.noPrazoPct < 95 ? 'alerta' : 'bom'}"><b>${r.noPrazoPct}%</b><small>coletas no prazo (30 dias) · meta 95%</small></div>
          <div class="w-num"><b>${r.toneladasMes.toLocaleString('pt-BR')} t</b><small>recolhidas no mês · ${r.seletivaPct}% na seletiva</small></div>
        </div>
        <div class="w-seg-colunas w-det">
          <div><h4>Rotas · hoje</h4><ul class="w-edu-lista w-coleta-rotas">${rotas}</ul></div>
          <div>
            <h4>Quando passa o caminhão <small>o que o cidadão vê no app</small></h4>
            <table class="w-coleta-cal"><thead><tr><th>Bairro</th><th>Lixo comum</th><th>Recicláveis</th><th>Próxima</th></tr></thead><tbody>${cal}</tbody></table>
          </div>
        </div>
      </div>`;
    }

    // Medicamentos: faltas nas UBS, a previsão da IA (o que vai faltar e por quê), o que comprar e o que
    // remanejar entre UBS antes de comprar; a tabela mostra os dias de cobertura de cada item na rede.
    const ST_MED = { ruptura: 'Em falta', critico: 'Crítico', atencao: 'Atenção', ok: 'Em dia', excesso: 'Sobrando' };
    function medicamentos(r) {
      if (!r) return '';
      const n = (v) => v.toLocaleString('pt-BR');
      const previsao = r.vaoFaltar.map((x) => {
        const porque = x.motivoIA ? ` · consumo previsto +${Math.round((x.fatorIA - 1) * 100)}% (${esc(x.motivoIA)})` : '';
        const acao = x.pedido ? `pedido de ${n(x.pedido)} chega em ${x.chegaEmDias} dias: antecipar a entrega` : `comprar ${n(x.compraSugerida)} (${esc(x.apresentacao)})`;
        return `<li><b>${esc(x.nome)}</b> acaba em ~${n(Math.floor(x.dias))} dias${porque}. 👉 ${acao}</li>`;
      }).join('');
      const remanejar = r.remanejamentos.map((x) => `<li data-farmacia="${x.paraId}">🔄 ${n(x.qtd)} (${esc(x.apresentacao)}) de <b>${esc(x.medicamento)}</b>: ${esc(x.de)} → ${esc(x.para)}</li>`).join('');
      const maxDias = 90;
      const itens = r.itens.map((x) => `<li><span>${esc(x.nome)}<small>${esc(x.uso)} · ${n(x.consumoPrevistoDia)}/dia${x.ubsEmRuptura.length ? ` · <em>falta: ${esc(x.ubsEmRuptura.join(', '))}</em>` : ''}</small></span>
          <i style="--v:${Math.min(100, Math.round((x.dias / maxDias) * 100))}%" class="${x.dias < 15 ? 'ruim' : x.dias < 30 ? 'medio' : 'bom'}"></i><b>${n(Math.floor(x.dias))} d</b></li>`).join('');
      const ubs = r.farmacias.map((f) => `<li><button type="button" data-farmacia="${f.id}" title="Ver no mapa">
          <span class="sit ${f.situacao}">${f.rupturas.length ? `${f.rupturas.length} em falta` : f.criticos.length ? 'Baixo' : 'Em dia'}</span>
          <span class="nome">${esc(f.nome)}<small>${[...f.rupturas, ...f.criticos].map((x) => `${esc(x.nome)} (${x.situacao === 'ruptura' ? 'em falta' : `${n(Math.floor(x.dias))} d`})`).join(' · ') || 'todos os itens com mais de 7 dias'}</small></span>
        </button></li>`).join('');
      return `<div class="w-med">
        <div class="w-numeros">
          <div class="w-num ${r.rupturas ? 'critica' : 'bom'}"><b>${r.rupturas}</b><small>itens em falta em ${r.ubsComRuptura.length} UBS</small></div>
          <div class="w-num ${r.vaoFaltar.length ? 'alerta' : 'bom'}"><b>${r.vaoFaltar.length}</b><small>itens vão faltar na rede antes da reposição (previsão da IA)</small></div>
          <div class="w-num"><b>${r.remanejamentos.length}</b><small>remanejamentos sugeridos entre UBS</small></div>
          <div class="w-num"><b>${r.excesso.length}</b><small>itens sobrando (mais de 60 dias)</small></div>
        </div>
        <div class="w-med-ia">
          <h4>✨ Previsão da IA</h4>
          ${previsao ? `<ul>${previsao}</ul>` : '<p>Nenhum item deve faltar antes da reposição.</p>'}
          ${remanejar ? `<div class="w-det"><h4>Remanejar antes de comprar</h4><ul class="w-med-reman">${remanejar}</ul></div>` : ''}
        </div>
        <div class="w-seg-colunas w-det">
          <div><h4>Dias de estoque na rede <small>com o consumo previsto</small></h4><ul class="w-barras w-med-itens">${itens}</ul></div>
          <div><h4>Farmácias das UBS</h4><ul class="w-edu-lista w-med-ubs">${ubs}</ul></div>
        </div>
      </div>`;
    }

    // Busca ativa (CadÚnico × Saúde × Escola): famílias vulneráveis faltando a consultas, crianças que faltam
    // à consulta e à escola, o efeito (pequeno) dos lembretes nelas e os bairros, do que mais falta ao que menos.
    // Só números agregados por bairro: a lista nominal fica com o CRAS e a UBS.
    function social(r) {
      if (!r) return '';
      const n = (v) => v.toLocaleString('pt-BR');
      const e = r.efeitoLembrete;
      const SIT = { critica: 'ruim', atencao: 'medio', ok: 'bom' };
      const max = Math.max(...r.bairros.map((b) => b.taxaPct), 1);
      const MAX = 8;
      const lista = r.bairros.slice(0, MAX).map((b) => `<li><button type="button" data-social="${b.id}" title="Destacar ${esc(b.nome)} no mapa">
          <span>${esc(b.nome)}<small>${n(b.faltando)} famílias · ${n(b.criancas)} crianças · cadastro ${b.atualizadoPct}% atualizado</small></span>
          <i style="--v:${Math.round((b.taxaPct / max) * 100)}%" class="${SIT[b.situacao]}"></i><b>${b.taxaPct.toLocaleString('pt-BR')}%</b></button></li>`).join('');
      // Duas linhas (cidade × vulneráveis), 12 meses, com o marco dos lembretes.
      const L = 300; const A = 70; const m = 4;
      const todos = [...r.serie.geral, ...r.serie.vulneraveis];
      const lo = Math.min(...todos) - 1; const hi = Math.max(...todos) + 1;
      const x = (i) => m + (i * (L - 2 * m)) / (r.serie.geral.length - 1);
      const y = (v) => A - m - ((v - lo) * (A - 2 * m)) / (hi - lo);
      const linha = (v) => v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
      return `<div class="w-social">
        <div class="w-numeros">
          <div class="w-num"><b>${n(r.vulneraveis)}</b><small>famílias vulneráveis, de ${n(r.familias)} no CadÚnico</small></div>
          <div class="w-num ${r.criticos.length ? 'critica' : 'alerta'}"><b>${n(r.faltando)}</b><small>faltaram a 2+ consultas em 90 dias (${r.faltandoPct.toLocaleString('pt-BR')}%)</small></div>
          <div class="w-num alerta"><b>${n(r.criancas)}</b><small>crianças faltando à consulta e à escola: busca ativa</small></div>
          <div class="w-num ${r.atualizadoPct < 80 ? 'alerta' : ''}"><b>${r.atualizadoPct}%</b><small>cadastros atualizados (meta 80%)</small></div>
        </div>
        ${r.criticos.length ? `<button type="button" class="btn-sec w-social-criticos" data-social="${r.criticos.map((b) => b.id).join(',')}">🗺 Ver no mapa os ${r.criticos.length} bairros críticos</button>` : ''}
        <div class="w-social-lembrete w-det">
          <h4>Lembretes por WhatsApp (desde ${esc(r.serie.rotulos[r.serie.marco] || 'jun')})</h4>
          <p>Na cidade, as faltas caíram de <b>${e.geralAntes.toLocaleString('pt-BR')}%</b> para <b>${e.geralDepois.toLocaleString('pt-BR')}%</b>. Nas famílias vulneráveis, só de <b>${e.vulneraveisAntes.toLocaleString('pt-BR')}%</b> para <b>${e.vulneraveisDepois.toLocaleString('pt-BR')}%</b>: ${n(r.semLembrete)} das que faltam não têm celular atualizado no cadastro. 👉 Busca ativa do agente de saúde com o CRAS.</p>
          <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Faltas em consultas, 12 meses: cidade de ${r.serie.geral[0]}% para ${r.serie.geral[r.serie.geral.length - 1]}%; famílias vulneráveis de ${r.serie.vulneraveis[0]}% para ${r.serie.vulneraveis[r.serie.vulneraveis.length - 1]}%">
            <line x1="${x(r.serie.marco).toFixed(1)}" x2="${x(r.serie.marco).toFixed(1)}" y1="${m}" y2="${A - m}" class="w-social-marco"/>
            <polyline points="${linha(r.serie.vulneraveis)}" class="w-social-vul"/>
            <polyline points="${linha(r.serie.geral)}" class="w-social-geral"/>
          </svg>
          <p class="w-legenda"><span><i style="background:var(--critica)"></i>famílias vulneráveis</span><span><i style="background:var(--navy)"></i>cidade</span><span><i style="background:#94a3b8"></i>início dos lembretes</span></p>
        </div>
        <div class="w-det">
          <h4>Bairros · % das famílias vulneráveis faltando <small>${r.bairros.length > MAX ? `os ${MAX} com mais famílias, de ${r.bairros.length}` : ''}</small></h4>
          <ul class="w-satisf w-leitos-lista w-social-bairros">${lista}</ul>
          <p class="w-legenda">Só números por bairro. A lista com nomes fica com o CRAS e a UBS do território. Fonte: ${esc(r.fonte)}.</p>
        </div>
      </div>`;
    }

    // Conteúdo de um widget num elemento (o cartão no dashboard ou o corpo do modal de detalhes).
    function preencher(corpo, id, d) {
        if (id === 'numeros') corpo.innerHTML = numeros(d.kpis);
        if (id === 'pulsos') {
          const lista = GC.widgetsVisiveis(d.pulsos, cfg.pulsos);
          corpo.innerHTML = `<div class="pulsos">${lista.map((p) => GC.cartaoPulso(p)).join('')}</div><a class="w-link" href="#/secretarias">Ranking e detalhes na tela Secretarias →</a>`;
        }
        if (id === 'desempenho') GC.desenharDesempenho(corpo, d.desempenho, { aoClicarArea: aoAbrirSecretaria, aoVerResolvida });
        if (id === 'satisfacao') corpo.innerHTML = satisfacao(d.satisfacao, d.bairro);
        if (id === 'leitos') corpo.innerHTML = leitos(d.leitos);
        if (id === 'seguranca') corpo.innerHTML = seguranca(d.seguranca);
        if (id === 'risco') corpo.innerHTML = risco(d.risco);
        if (id === 'obras') corpo.innerHTML = obras(d.obras);
        if (id === 'educacao') corpo.innerHTML = educacao(d.educacao);
        if (id === 'frota') corpo.innerHTML = frota(d.frota);
        if (id === 'coleta') corpo.innerHTML = coleta(d.coleta);
        if (id === 'medicamentos') corpo.innerHTML = medicamentos(d.medicamentos);
        if (id === 'social') corpo.innerHTML = social(d.social);
        if (GC.WIDGETS_EXTRA && GC.WIDGETS_EXTRA[id]) {
          try { corpo.innerHTML = GC.WIDGETS_EXTRA[id](d, (cfg.opcoes || {})[id] || {}); } catch (e) { corpo.innerHTML = '<p class="wx-vazio">Não foi possível montar este widget agora.</p>'; if (window.console) console.error(e); }
        }
        if (GC.ehWidgetIA && GC.ehWidgetIA(id) && widgetsIA) {
          const w = widgetsIA.buscar(id);
          if (w) corpo.innerHTML = GC.htmlWidgetIA(w, graficoAtualIA ? graficoAtualIA(w) : null);
        }
    }

    // ---- encaixe (masonry): cada cartão ocupa tantas linhas finas da grade quanto a sua altura, então um
    // cartão baixo não deixa buraco ao lado de um alto. A ordem escolhida continua (esquerda → direita).
    const LINHA = 4;
    const VAO = 14;
    const spans = {}; // última altura conhecida: o redesenho já nasce encaixado, sem pulo
    function encaixar(w) {
      const h = w.getBoundingClientRect().height;
      if (!h) return;
      const n = Math.ceil((h + VAO) / LINHA);
      spans[w.dataset.widget] = n;
      w.style.gridRowEnd = `span ${n}`;
    }
    const observador = window.ResizeObserver ? new ResizeObserver((lista) => lista.forEach((x) => encaixar(x.target))) : null;
    if (observador) el.area.classList.add('encaixe');

    // ---- colunas: a grade tem sempre um número PAR de meias-colunas; o Médio ocupa 2, o Compacto 1, o Largo todas.
    // Assim o Compacto fica de fato mais estreito (antes ele só escondia o conteúdo e seguia com a largura do Médio).
    const LARGURA_MEDIO = 460;
    function medirColunas() {
      const w = el.area.clientWidth;
      if (!w) return;
      const medios = Math.max(1, Math.floor((w + VAO) / (LARGURA_MEDIO + VAO)));
      el.area.style.setProperty('--w-cols', String(medios * 2));
      // Estreito demais para meia coluna (celular, gaveta apertada): o Compacto ocupa a linha toda.
      el.area.classList.toggle('w-estreito', w < 620);
    }
    if (window.ResizeObserver) new ResizeObserver(medirColunas).observe(el.area);

    // ---- Compacto: mostra só o bloco-resumo do widget (números, placar, KPI…, ou o primeiro bloco do corpo)
    // e esconde os irmãos dele em cada nível. Antes era uma lista fixa de classes no CSS, e os widgets fora dela
    // ficavam só com o título.
    const RESUMO_P = '.w-numeros, .wx-compacto, .wx-placar, .wx-kpi, .pulsos, [data-resumo-p]';
    // Fora do resumo: detalhe, legendas, rótulos ("ao vivo") e os seletores do próprio cartão (no Compacto,
    // as opções ficam na gaveta Widgets).
    const NAO_RESUMO = '.w-det, .w-legenda, .wx-sub, .w-link, .w-mais, .wx-ao-vivo, .wx-comp-sel';
    function marcarCompacto(corpo) {
      let alvo = corpo.querySelector(RESUMO_P);
      if (!alvo) {
        let n = corpo;
        while (n.children.length === 1 && n.firstElementChild.tagName === 'DIV') n = n.firstElementChild;
        const blocos = [...n.children].filter((x) => !x.matches(NAO_RESUMO));
        // Um parágrafo solto (aviso curto) só é o resumo se não houver bloco de conteúdo ao lado.
        alvo = blocos.find((x) => x.tagName !== 'P') || blocos[0] || null;
      }
      if (!alvo) return; // corpo vazio ou só texto solto: fica como está
      alvo.classList.add('w-p-resumo');
      for (let n = alvo; n && n !== corpo; n = n.parentElement) {
        [...n.parentElement.children].forEach((irmao) => { if (irmao !== n) irmao.classList.add('w-p-oculto'); });
      }
    }

    // ---- modal de detalhes ----
    const modal = document.getElementById('w-modal');
    let modalId = null;
    let ultimoDados = null;
    function desenharModal() {
      const corpo = modal.querySelector('.w-modal-corpo');
      const rolagem = corpo.scrollTop;
      corpo.innerHTML = `<div class="widget widget-${modalId} w-no-modal"><div class="w-corpo"></div></div>`;
      preencher(corpo.querySelector('.w-corpo'), modalId, ultimoDados);
      corpo.scrollTop = rolagem;
    }
    function abrirModal(id) {
      if (!modal || !ultimoDados) return;
      modalId = id;
      modal.querySelector('#w-modal-titulo').innerHTML = `${iconeWidget(id)} ${esc(widget(id).nome)}`;
      modal.querySelector('.w-modal-corpo').scrollTop = 0;
      desenharModal();
      if (!modal.open) modal.showModal();
    }
    function fecharModal() { if (modal && modal.open) modal.close(); }
    if (modal) {
      modal.addEventListener('close', () => {
        const id = modalId;
        modalId = null;
        const b = id && el.area.querySelector(`[data-detalhes="${id}"]`);
        if (b) b.focus({ preventScroll: true });
      });
      modal.addEventListener('click', (e) => {
        // Clique no fundo escuro (fora da caixa) ou no X fecha.
        if (e.target === modal || e.target.closest('[data-fechar-modal]')) return fecharModal();
        const vaiAoMapa = e.target.closest('[data-leito],[data-calor-bo],[data-escola],[data-frota],[data-coleta],[data-farmacia],[data-obra],[data-risco],[data-social],[data-violencia],[data-pulso],[data-ver-bairro],[data-abrir-alerta],[data-abrir-ind],[data-ir-crise]')
          && !e.target.closest('[data-setor-obra]');
        clique(e);
        if (vaiAoMapa) fecharModal(); // a ação leva ao mapa: o modal sai da frente
      });
      modal.addEventListener('change', mudouCampo);
      modal.addEventListener('input', digitou);
    }

    // ---- ícone e categoria ----
    const categoria = (id) => (GC.CATEGORIAS_WIDGET || []).find((c) => c.id === (widget(id).ia ? 'ia' : widget(id).categoria)) || { id: 'util', nome: 'Outros', icone: 'tool', cor: '#64748b' };
    function iconeWidget(id) {
      const w = widget(id);
      if (w.icone && GC.icone) return GC.icone(w.icone);
      return w.emoji || '';
    }
    const ladrilho = (id) => `<span class="w-ladrilho" style="--cor:${categoria(id).cor}">${iconeWidget(id)}</span>`;

    // ---- modo edição (no próprio painel) e aviso de desfazer ----
    let editando = false;
    let arrastando = null; // id do widget (ou do catálogo, com "novo:")
    let desfazer = null;
    let toastTimer = null;
    const toast = document.createElement('div');
    toast.className = 'w-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.hidden = true;
    document.body.appendChild(toast); // no body: fica acima da gaveta de Indicadores e das gavetas da direita
    const anuncio = document.createElement('div');
    anuncio.className = 'sr-only';
    anuncio.setAttribute('aria-live', 'assertive');
    (el.area.parentElement || document.body).appendChild(anuncio);
    const anunciar = (t) => { anuncio.textContent = ''; setTimeout(() => { anuncio.textContent = t; }, 30); };

    function mostrarToast(texto, acao) {
      desfazer = acao;
      toast.innerHTML = `<span>${texto}</span>${acao ? '<button type="button" data-desfazer>Desfazer</button>' : ''}<button type="button" class="w-toast-x" data-toast-fechar aria-label="Fechar aviso">✕</button>`;
      toast.hidden = false;
      toast.classList.remove('saindo');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(esconderToast, 7000);
    }
    function esconderToast() { toast.classList.add('saindo'); setTimeout(() => { toast.hidden = true; desfazer = null; }, 200); }
    toast.addEventListener('click', (e) => {
      if (e.target.closest('[data-desfazer]') && desfazer) { const f = desfazer; desfazer = null; f(); esconderToast(); }
      if (e.target.closest('[data-toast-fechar]')) esconderToast();
    });

    function ocultar(id) {
      const i = cfg.ativos.indexOf(id);
      if (i < 0) return;
      mudar({ ativos: cfg.ativos.filter((x) => x !== id) });
      mostrarToast(`<b>${esc(widget(id).nome)}</b> saiu do painel.`, () => {
        const a = cfg.ativos.filter((x) => x !== id);
        a.splice(Math.min(i, a.length), 0, id);
        mudar({ ativos: a });
      });
    }
    function adicionar(id, pos) {
      if (cfg.ativos.includes(id)) return;
      const a = cfg.ativos.slice();
      a.splice(pos === undefined ? a.length : pos, 0, id);
      mudar({ ativos: a });
      anunciar(`${widget(id).nome} adicionado ao painel, posição ${a.indexOf(id) + 1} de ${a.length}.`);
      // Leva até o widget novo e dá um destaque rápido.
      setTimeout(() => {
        const alvo = el.area.querySelector(`[data-widget="${id}"]`);
        if (!alvo) return;
        if (el.area.offsetParent) alvo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        alvo.classList.add('w-recem');
        setTimeout(() => alvo.classList.remove('w-recem'), 1600);
      }, 60);
    }
    function moverPara(id, j) {
      const a = cfg.ativos.filter((x) => x !== id);
      const k = Math.max(0, Math.min(a.length, j));
      a.splice(k, 0, id);
      if (a.join() === cfg.ativos.join()) return;
      mudar({ ativos: a });
      anunciar(`${widget(id).nome}: posição ${k + 1} de ${a.length}.`);
    }
    function definirTamanho(id, t) {
      const tam = Object.assign({}, cfg.tamanhos || {});
      if (t === 'm') delete tam[id]; else tam[id] = t;
      mudar({ tamanhos: tam });
    }
    function definirOpcao(id, campo, valor) {
      const op = Object.assign({}, cfg.opcoes || {});
      op[id] = Object.assign({}, op[id] || {}, { [campo]: valor });
      if (id === 'resumo') op[id] = { periodo: valor };
      mudar({ opcoes: op });
    }
    function alternarEdicao(forcar) {
      editando = typeof forcar === 'boolean' ? forcar : !editando;
      el.area.classList.toggle('editando', editando);
      if (el.botaoEditar) {
        el.botaoEditar.setAttribute('aria-pressed', String(editando));
        // O mesmo botão sai da edição: o rótulo diz isso (antes só mudava a cor).
        const rot = el.botaoEditar.querySelector('.rot');
        if (rot) rot.textContent = editando ? 'Concluir edição' : 'Editar painel';
      }
      if (ultimoDados) desenharArea(ultimoDados);
      if (editando) mostrarToast('Modo edição: arraste pela alça, escolha P, M ou L ou oculte. Para sair: Concluir edição ou Esc.', null);
      else esconderToast();
    }

    // ---- desenho do painel ----
    const TAM_ROT = { p: 'Compacto', m: 'Médio', l: 'Largo' };
    function cabecalho(id, i) {
      const t = (cfg.tamanhos || {})[id] || 'm';
      const edicao = editando ? `
        <span class="w-edicao">
          <span class="w-tam" role="group" aria-label="Tamanho de ${esc(widget(id).nome)}">${['p', 'm', 'l'].map((x) => `<button type="button" data-tamanho="${x}" data-alvo="${id}" class="${t === x ? 'ativo' : ''}" aria-pressed="${t === x}" title="${TAM_ROT[x]}">${x.toUpperCase()}</button>`).join('')}</span>
        </span>` : '';
      return `<header>
          ${editando ? `<button type="button" class="w-alca" data-alca="${id}" aria-label="Mover ${esc(widget(id).nome)} (posição ${i + 1} de ${cfg.ativos.length}). Setas para mover." title="Arraste para mudar a ordem">${GC.icone ? GC.icone('grip-vertical') : '⋮⋮'}</button>` : ''}
          <h3 title="${esc(widget(id).nome)}">${ladrilho(id)} <span class="w-titulo">${esc(widget(id).nome)}</span></h3>
          ${edicao}
          <button type="button" class="w-ocultar" data-ocultar="${id}" title="Ocultar este widget" aria-label="Ocultar ${esc(widget(id).nome)}">✕</button>
        </header>`;
    }

    // Guarda o campo em foco (select/textarea de opção) para devolver depois do redesenho.
    function focoAtual(raiz) {
      const a = document.activeElement;
      if (!a || !raiz.contains(a)) return null;
      const w = a.closest('[data-widget]');
      const chave = ['data-opcao', 'data-alca', 'data-tamanho', 'data-ocultar'].find((k) => a.hasAttribute(k));
      if (!w || !chave) return null;
      return { w: w.dataset.widget, sel: `[${chave}="${a.getAttribute(chave)}"]${a.dataset.campo ? `[data-campo="${a.dataset.campo}"]` : ''}${a.dataset.tamanho ? `[data-alvo="${a.dataset.alvo}"]` : ''}`, ini: a.selectionStart, fim: a.selectionEnd };
    }
    function devolverFoco(f, raiz) {
      if (!f) return;
      const n = raiz.querySelector(`[data-widget="${f.w}"] ${f.sel}`);
      if (!n) return;
      n.focus({ preventScroll: true });
      if (typeof f.ini === 'number' && n.setSelectionRange) try { n.setSelectionRange(f.ini, f.fim); } catch (e) { /* select não tem seleção */ }
    }

    function desenharArea(d) {
      ultimoDados = d;
      el.escopo.textContent = d.escopo || '';
      if (observador) observador.disconnect();
      if (!cfg.ativos.length) {
        el.area.innerHTML = `<div class="w-vazio"><p>Nenhum widget no painel.</p><button type="button" class="btn-sec principal" data-configurar>▦ Escolher widgets</button></div>`;
        fecharModal();
        return;
      }
      // FLIP: onde cada cartão estava antes do redesenho (para deslizar até o lugar novo).
      const antes = {};
      if (!semMovimento()) el.area.querySelectorAll('.widget[data-widget]').forEach((w) => { antes[w.dataset.widget] = w.getBoundingClientRect(); });
      const foco = focoAtual(el.area);
      el.area.innerHTML = cfg.ativos.map((id, i) => {
        const t = (cfg.tamanhos || {})[id];
        return `<section class="widget widget-${id}${t ? ` tam-${t}` : ''}" data-widget="${id}" style="--cor:${categoria(id).cor}${spans[id] ? `;grid-row-end: span ${spans[id]}` : ''}"${editando ? ' draggable="true"' : ''}>
          ${cabecalho(id, i)}
          <div class="w-corpo"></div>
        </section>`;
      }).join('');
      cfg.ativos.forEach((id) => {
        const sec = el.area.querySelector(`[data-widget="${id}"]`);
        preencher(sec.querySelector('.w-corpo'), id, d);
        const compacto = (cfg.tamanhos || {})[id] === 'p';
        if (compacto) marcarCompacto(sec.querySelector('.w-corpo'));
        // Tem detalhe guardado para o modal (ou está Compacto, com parte escondida): o cartão ganha o "Ver detalhes".
        if (compacto || sec.querySelector('.w-det')) {
          sec.insertAdjacentHTML('beforeend', `<button type="button" class="w-mais" data-detalhes="${id}" aria-haspopup="dialog">Ver detalhes <i class="ti ti-arrow-up-right" aria-hidden="true"></i></button>`);
        }
        if (observador) observador.observe(sec);
      });
      // Já visível: encaixa agora (o observador cobre o resto: abrir a gaveta, gráfico que carrega depois, resize).
      medirColunas();
      if (observador && el.area.offsetParent) el.area.querySelectorAll('.widget').forEach(encaixar);
      devolverFoco(foco, el.area);
      // FLIP: desliza de onde estava (só os que mudaram de lugar).
      Object.keys(antes).forEach((id) => {
        const w = el.area.querySelector(`[data-widget="${id}"]`);
        if (!w) return;
        const b = antes[id]; const a = w.getBoundingClientRect();
        const dx = b.left - a.left; const dy = b.top - a.top;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        w.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      });
      // Modal aberto: acompanha os números novos (ou fecha, se o widget foi desligado).
      if (modal && modal.open && modalId) {
        if (cfg.ativos.includes(modalId)) desenharModal();
        else fecharModal();
      }
    }
    const semMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Cliques do cartão e do modal (as mesmas ações: ver no mapa, filtrar obras, abrir secretaria…).
    function clique(e) {
      const t = e.target;
      const det = t.closest('[data-detalhes]');
      if (det) return abrirModal(det.dataset.detalhes);
      const ocultarB = t.closest('[data-ocultar]');
      if (ocultarB) return ocultar(ocultarB.dataset.ocultar);
      const tam = t.closest('[data-tamanho]');
      if (tam) return definirTamanho(tam.dataset.alvo, tam.dataset.tamanho);
      const opc = t.closest('button[data-opcao]');
      if (opc) return definirOpcao(opc.dataset.opcao, opc.dataset.campo || 'periodo', opc.dataset.valor);
      const ind = t.closest('[data-abrir-ind]');
      if (ind) return aoAbrirIndicador && aoAbrirIndicador(ind.dataset.abrirInd);
      const al = t.closest('[data-abrir-alerta]');
      if (al) return aoAbrirAlerta && aoAbrirAlerta(al.dataset.abrirAlerta);
      const vb = t.closest('[data-ver-bairro]');
      if (vb) return aoSelecionarBairro && aoSelecionarBairro(vb.dataset.verBairro);
      const cr = t.closest('[data-ir-crise]');
      if (cr) return aoIrCrise && aoIrCrise(cr.dataset.irCrise);
      const rs = t.closest('[data-resumo]');
      if (rs) return aoResumo && aoResumo(rs.dataset.resumo, rs.dataset.area || null);
      const l = t.closest('[data-leito]');
      if (l) return aoVerLeito && aoVerLeito(l.dataset.leito);
      if (t.closest('[data-calor-bo]')) return aoVerCalorBO && aoVerCalorBO();
      const es = t.closest('[data-escola]');
      if (es) return aoVerEscola && aoVerEscola(es.dataset.escola);
      const fr = t.closest('[data-frota]');
      if (fr) return aoVerFrota && aoVerFrota(fr.dataset.frota);
      const co = t.closest('[data-coleta]');
      if (co) return aoVerColeta && aoVerColeta(co.dataset.coleta);
      const fa = t.closest('[data-farmacia]');
      if (fa) return aoVerFarmacia && aoVerFarmacia(fa.dataset.farmacia);
      const so = t.closest('[data-setor-obra]');
      if (so) {
        setorObras = so.dataset.setorObra || null;
        const corpo = el.area.querySelector('[data-widget="obras"] .w-corpo');
        if (corpo) corpo.innerHTML = obras(modObras);
        if (modalId === 'obras') desenharModal();
        return aoFiltrarObras && aoFiltrarObras(setorObras);
      }
      const ob = t.closest('[data-obra]');
      if (ob) return aoVerObra && aoVerObra(ob.dataset.obra);
      const ri = t.closest('[data-risco]');
      if (ri) return aoVerRisco && aoVerRisco(ri.dataset.risco);
      const sc = t.closest('[data-social]');
      if (sc) return aoVerSocial && aoVerSocial(sc.dataset.social.split(','));
      const vi = t.closest('[data-violencia]');
      if (vi) return aoVerViolencia && aoVerViolencia(vi.dataset.violencia.split(','));
      const p = t.closest('[data-pulso]');
      if (p) return aoAbrirSecretaria(p.dataset.pulso);
      const ip = t.closest('[data-ia-perguntar]');
      if (ip) return aoPerguntarIA && aoPerguntarIA(ip.dataset.iaPerguntar);
      // Satisfação só informa: filtrar por bairro é na gaveta Filtros (ou clicando no bairro no mapa).
      if (t.closest('[data-configurar]')) return el.aoConfigurar();
    }
    // Selects das opções (bairro, indicador, comparar) e a nota (salva ao parar de digitar).
    function mudouCampo(e) {
      const c = e.target.closest('select[data-opcao], textarea[data-opcao]');
      if (c) definirOpcao(c.dataset.opcao, c.dataset.campo, c.value);
    }
    let notaTimer = null;
    function digitou(e) {
      const c = e.target.closest('textarea[data-opcao]');
      if (!c) return;
      clearTimeout(notaTimer);
      notaTimer = setTimeout(() => definirOpcao(c.dataset.opcao, c.dataset.campo, c.value), 700);
    }
    el.area.addEventListener('click', clique);
    el.area.addEventListener('change', mudouCampo);
    el.area.addEventListener('input', digitou);

    // Teclado na alça: setas movem o widget (o foco acompanha).
    el.area.addEventListener('keydown', (e) => {
      const a = e.target.closest('[data-alca]');
      if (!a) return;
      const id = a.dataset.alca; const i = cfg.ativos.indexOf(id);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); moverPara(id, i - 1); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); moverPara(id, i + 1); }
      if (e.key === 'Home') { e.preventDefault(); moverPara(id, 0); }
      if (e.key === 'End') { e.preventDefault(); moverPara(id, cfg.ativos.length - 1); }
    });

    // Arrastar e soltar no painel (em edição) — e do catálogo da gaveta para o painel.
    function posicaoNoPainel(x, y) {
      const cartoes = [...el.area.querySelectorAll('.widget[data-widget]')].filter((w) => w.dataset.widget !== arrastando);
      // Ponteiro em cima de um cartão: antes dele na metade de cima (cartão largo) ou da esquerda; senão, depois.
      const largura = el.area.getBoundingClientRect().width;
      const sob = cartoes.findIndex((w) => { const r = w.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
      if (sob >= 0) {
        const r = cartoes[sob].getBoundingClientRect();
        const antes = r.width > largura * 0.75 ? y < r.top + Math.min(r.height, 200) / 2 : x < r.left + r.width / 2;
        return antes ? sob : sob + 1;
      }
      let melhor = cartoes.length; let dist = Infinity;
      cartoes.forEach((w, k) => {
        const r = w.getBoundingClientRect();
        const cx = r.left + r.width / 2; const cy = r.top + Math.min(r.height, 160) / 2;
        const dd = Math.hypot(x - cx, y - cy);
        if (dd < dist) { dist = dd; melhor = (x < cx || y < r.top + 40) ? k : k + 1; }
      });
      return melhor;
    }
    function marcarAlvo(k) {
      el.area.querySelectorAll('.w-alvo-antes, .w-alvo-depois').forEach((w) => w.classList.remove('w-alvo-antes', 'w-alvo-depois'));
      const cartoes = [...el.area.querySelectorAll('.widget[data-widget]')].filter((w) => w.dataset.widget !== arrastando);
      if (cartoes[k]) cartoes[k].classList.add('w-alvo-antes');
      else if (cartoes.length) cartoes[cartoes.length - 1].classList.add('w-alvo-depois');
    }
    el.area.addEventListener('dragstart', (e) => {
      const w = e.target.closest('.widget[data-widget]');
      if (!editando || !w) return;
      arrastando = w.dataset.widget;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastando);
      setTimeout(() => w.classList.add('w-arrastando'), 0);
    });
    el.area.addEventListener('dragover', (e) => {
      const tipos = [...(e.dataTransfer.types || [])];
      if (!arrastando && !tipos.includes('text/x-widget-novo')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = arrastando ? 'move' : 'copy';
      marcarAlvo(posicaoNoPainel(e.clientX, e.clientY));
    });
    el.area.addEventListener('dragleave', (e) => { if (!el.area.contains(e.relatedTarget)) marcarAlvo(-1); });
    el.area.addEventListener('drop', (e) => {
      e.preventDefault();
      const k = posicaoNoPainel(e.clientX, e.clientY);
      marcarAlvo(-1);
      const novo = e.dataTransfer.getData('text/x-widget-novo');
      if (novo) { arrastando = null; return adicionar(novo, k); }
      if (arrastando) { const id = arrastando; arrastando = null; moverPara(id, k); }
    });
    el.area.addEventListener('dragend', () => { arrastando = null; marcarAlvo(-1); el.area.querySelectorAll('.w-arrastando').forEach((w) => w.classList.remove('w-arrastando')); });

    // ---- gaveta Widgets: "No painel" (ordem, tamanho, opções) e o catálogo "Disponíveis" ----
    let busca = '';
    let categoriaFiltro = null;
    const opcoesAbertas = new Set();
    const previas = new Set();
    let confirmarExcluir = null;
    let ultimoHtmlGaveta = '';
    const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const casa = (id) => !busca || sem(`${widget(id).nome} ${widget(id).descricao} ${categoria(id).nome}`).includes(sem(busca));

    function opcoesHtml(id) {
      const op = (cfg.opcoes || {})[id] || {};
      if (id === 'pulsos') {
        const marcados = cfg.pulsos || GC.data.areas.map((a) => a.id);
        return `<fieldset class="w-sub"><legend>Secretarias no pulso</legend>${GC.data.areas.map((a) => `<label><input type="checkbox" data-pulso-area="${a.id}"${marcados.includes(a.id) ? ' checked' : ''}> ${a.secretaria.emoji} ${esc(a.nome)}</label>`).join('')}</fieldset>`;
      }
      const sel = (campo, lista, atual, rotulo) => `<label class="w-sub-campo">${rotulo}<select data-opcao="${id}" data-campo="${campo}"><option value="">Automático</option>${lista.map((x) => `<option value="${esc(x.id)}"${x.id === atual ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`;
      const bairros = GC.data.bairros.map((b) => ({ id: b.id, nome: b.nome }));
      if (id === 'bairro_foco') return `<div class="w-sub">${sel('bairro', bairros, op.bairro, 'Bairro')}</div>`;
      if (id === 'comparativo') return `<div class="w-sub">${sel('a', bairros, op.a, 'Bairro A')}${sel('b', bairros, op.b, 'Bairro B')}</div>`;
      if (id === 'kpi') return `<div class="w-sub">${sel('ind', (GC.CATALOGO_INDICADORES || []).map((i) => ({ id: i.id, nome: `${i.id} · ${i.nome}` })), op.ind, 'Indicador')}</div>`;
      if (id === 'resumo') return `<div class="w-sub"><label class="w-sub-campo">Período<select data-opcao="resumo" data-campo="periodo"><option value="dia">Hoje</option><option value="semana"${op.periodo === 'semana' ? ' selected' : ''}>Semana</option></select></label></div>`;
      if (id === 'nota') return '<p class="w-sub w-sub-dica">O texto da nota é escrito direto no cartão.</p>';
      return '';
    }

    function itemNoPainel(id, i) {
      const t = (cfg.tamanhos || {})[id] || 'm';
      const temOpcoes = !!widget(id).opcoes;
      const aberto = opcoesAbertas.has(id);
      const ia = widget(id).ia;
      const w = ia && widgetsIA ? widgetsIA.buscar(id) : null;
      return `<li class="w-item ligado" data-item="${id}" draggable="true">
        <button type="button" class="w-alca" data-alca-lista="${id}" aria-label="Mover ${esc(widget(id).nome)} (posição ${i + 1} de ${cfg.ativos.length}). Setas para mover." title="Arraste para mudar a ordem">${GC.icone ? GC.icone('grip-vertical') : '⋮⋮'}</button>
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${esc(widget(id).nome)}</b><small title="${esc(widget(id).descricao)}">${ia && w ? `“${esc(w.pergunta || widget(id).nome)}”` : esc(widget(id).descricao)}</small><em class="w-pos">${i + 1}º de ${cfg.ativos.length}</em></span>
        <span class="w-item-acoes">
          <span class="w-tam" role="group" aria-label="Tamanho">${['p', 'm', 'l'].map((x) => `<button type="button" data-tamanho="${x}" data-alvo="${id}" class="${t === x ? 'ativo' : ''}" aria-pressed="${t === x}" title="${TAM_ROT[x]}">${x.toUpperCase()}</button>`).join('')}</span>
          ${temOpcoes ? `<button type="button" class="icone${aberto ? ' ativo' : ''}" data-opcoes="${id}" aria-expanded="${aberto}" title="Opções de ${esc(widget(id).nome)}" aria-label="Opções de ${esc(widget(id).nome)}">${GC.icone ? GC.icone('settings') : '⚙'}</button>` : ''}
          <button type="button" class="icone" data-subir="${id}"${i === 0 ? ' disabled' : ''} aria-label="Subir ${esc(widget(id).nome)}">↑</button>
          <button type="button" class="icone" data-descer="${id}"${i === cfg.ativos.length - 1 ? ' disabled' : ''} aria-label="Descer ${esc(widget(id).nome)}">↓</button>
          <button type="button" class="icone" data-remover="${id}" title="Tirar do painel" aria-label="Tirar ${esc(widget(id).nome)} do painel">${GC.icone ? GC.icone('eye-off') : '✕'}</button>
        </span>
        ${temOpcoes && aberto ? `<div class="w-item-opcoes">${opcoesHtml(id)}</div>` : ''}
      </li>`;
    }

    function itemCatalogo(id) {
      const ia = widget(id).ia;
      const w = ia && widgetsIA ? widgetsIA.buscar(id) : null;
      const quando = w && w.criadoEm ? new Date(w.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
      const confirmando = confirmarExcluir === id;
      return `<li class="w-item" data-item="${id}" draggable="true" data-catalogo="${id}">
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${esc(widget(id).nome)}</b><small title="${esc(widget(id).descricao)}">${ia && w ? `“${esc(w.pergunta || '')}”${quando ? ` · criado em ${quando}` : ''}` : esc(widget(id).descricao)}</small></span>
        <span class="w-item-acoes">
          <button type="button" class="icone${previas.has(id) ? ' ativo' : ''}" data-previa="${id}" aria-expanded="${previas.has(id)}" title="Prévia com os dados de agora" aria-label="Prévia de ${esc(widget(id).nome)}">${GC.icone ? GC.icone('eye') : '👁'}</button>
          ${ia ? `<button type="button" class="icone${confirmando ? ' perigo' : ''}" data-excluir-ia="${id}" title="${confirmando ? 'Clique de novo para excluir' : 'Excluir este widget do ' + GC.agente() + ''}" aria-label="${confirmando ? 'Confirmar exclusão de' : 'Excluir'} ${esc(widget(id).nome)}">${confirmando ? 'Excluir?' : (GC.icone ? GC.icone('trash') : '🗑')}</button>` : ''}
          <button type="button" class="btn-sec w-add" data-ligar-btn="${id}" aria-label="Adicionar ${esc(widget(id).nome)} ao painel">${GC.icone ? GC.icone('plus') : '+'} Adicionar</button>
        </span>
        ${previas.has(id) ? `<div class="w-previa" aria-hidden="true"><div class="widget widget-${id} w-no-previa"><div class="w-corpo" data-previa-corpo="${id}"></div></div></div>` : ''}
      </li>`;
    }

    // Widget do Copiloto: pergunta de origem, data, se está no painel, e excluir com confirmação.
    function itemIA(id) {
      const w = widgetsIA ? widgetsIA.buscar(id) : null;
      const quando = w && w.criadoEm ? new Date(w.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      const ligado = cfg.ativos.includes(id);
      const confirmando = confirmarExcluir === id;
      return `<li class="w-item w-item-ia" data-item-ia="${id}">
        ${ladrilho(id)}
        <span class="w-item-txt"><b>${esc(widget(id).nome)}</b><small title="${esc(w ? w.pergunta : '')}">“${esc(w ? w.pergunta : widget(id).nome)}”</small>
          <em class="w-pos">${quando ? `criado em ${quando}` : 'do ' + GC.agente() + ''} · ${ligado ? `no painel (${cfg.ativos.indexOf(id) + 1}º)` : 'fora do painel'}</em></span>
        <span class="w-item-acoes">
          <button type="button" class="icone" data-ia-perguntar-gaveta="${id}" title="Refazer a pergunta no " + GC.agente() + "" aria-label="Perguntar de novo: ${esc(w ? w.pergunta : '')}">${GC.icone ? GC.icone('message-circle') : '💬'}</button>
          <button type="button" class="icone${confirmando ? ' perigo' : ''}" data-excluir-ia="${id}" title="${confirmando ? 'Clique de novo para excluir' : 'Excluir este widget do " + GC.agente() + "'}" aria-label="${confirmando ? 'Confirmar exclusão de' : 'Excluir'} ${esc(widget(id).nome)}">${confirmando ? 'Excluir?' : (GC.icone ? GC.icone('trash') : '🗑')}</button>
          ${ligado ? `<button type="button" class="btn-sec w-add" data-remover="${id}">${GC.icone ? GC.icone('eye-off') : ''} Tirar do painel</button>`
            : `<button type="button" class="btn-sec w-add" data-ligar-btn="${id}">${GC.icone ? GC.icone('plus') : '+'} Adicionar</button>`}
        </span>
      </li>`;
    }

    function desenharGaveta() {
      const d = ultimoDados || {};
      // Os do Copiloto têm seção própria (pergunta de origem e data), fora do catálogo "Disponíveis".
      const doCopiloto = GC.WIDGETS.filter((w) => w.ia).map((w) => w.id);
      const disponiveis = GC.WIDGETS.map((w) => w.id).filter((id) => !cfg.ativos.includes(id) && !widget(id).ia);
      // O chip de categoria filtra todas as seções (No painel, Copiloto e Disponíveis), não só o catálogo:
      // filtrando só o catálogo, que fica no fim da gaveta, o clique parecia não fazer nada.
      const todos = GC.WIDGETS.map((w) => w.id);
      const cats = (GC.CATEGORIAS_WIDGET || []).filter((c) => todos.some((id) => categoria(id).id === c.id));
      if (categoriaFiltro && !cats.some((c) => c.id === categoriaFiltro)) categoriaFiltro = null;
      const passa = (id) => casa(id) && (!categoriaFiltro || categoria(id).id === categoriaFiltro);
      const filtrados = disponiveis.filter(passa);
      const noPainel = cfg.ativos.filter(passa);
      const iaVisiveis = doCopiloto.filter(passa);
      const nomeFiltro = categoriaFiltro ? (cats.find((c) => c.id === categoriaFiltro) || {}).nome : '';
      let sugestoes = [];
      try {
        sugestoes = GC.sugerirWidgets ? GC.sugerirWidgets({
          ativos: cfg.ativos, risco: d.risco, gabinetes: typeof d.gabinetes === 'function' ? d.gabinetes() : [],
          indicadores: typeof d.indicadores === 'function' ? d.indicadores() : [], atencao: typeof d.atencao === 'function' ? d.atencao() : [],
          contratos: GC.gestao ? GC.gestao.contratos(d.agora) : null,
        }).filter((s) => GC.WIDGETS.some((w) => w.id === s.id)) : [];
      } catch (e) { sugestoes = []; }
      const vista = infoVista ? infoVista() : null;
      const grupos = (GC.CATEGORIAS_WIDGET || []).map((c) => {
        const ids = filtrados.filter((id) => categoria(id).id === c.id);
        return ids.length ? `<li class="w-grupo"><h4>${GC.icone ? GC.icone(c.icone) : ''} ${esc(c.nome)} <small>${ids.length}</small></h4><ul class="w-lista">${ids.map(itemCatalogo).join('')}</ul></li>` : '';
      }).join('');
      const html = `
        <header class="gaveta-cab">
          <div><h2>▦ Widgets</h2><p>O que aparece na aba Painel de Indicadores, em que ordem e em que tamanho.</p></div>
          <button type="button" class="gaveta-x" data-fechar aria-label="Fechar">✕</button>
        </header>
        <div class="w-busca">
          <label class="w-busca-campo">${GC.icone ? GC.icone('search') : ''}<input type="search" data-busca-widget placeholder="Buscar widget…" value="${esc(busca)}" aria-label="Buscar widget"></label>
          <div class="w-cats" role="group" aria-label="Categoria">
            <button type="button" class="chip${categoriaFiltro ? '' : ' ativo'}" data-cat="" aria-pressed="${!categoriaFiltro}">Todas</button>
            ${cats.map((c) => `<button type="button" class="chip${categoriaFiltro === c.id ? ' ativo' : ''}" data-cat="${c.id}" aria-pressed="${categoriaFiltro === c.id}">${esc(c.nome)}</button>`).join('')}
          </div>
        </div>
        <div class="gaveta-corpo">
          ${sugestoes.length && !busca && !categoriaFiltro ? `<section class="w-sugestoes"><h3>${GC.icone ? GC.icone('sparkles', 'ic-ia') : ''} Sugerido agora</h3><ul>${sugestoes.map((s) => `<li>${ladrilho(s.id)}<span><b>${esc(widget(s.id).nome)}</b><small>${esc(s.motivo)}</small></span><button type="button" class="btn-sec w-add" data-ligar-btn="${s.id}">${GC.icone ? GC.icone('plus') : '+'} Adicionar</button></li>`).join('')}</ul></section>` : ''}
          <section class="w-secao">
            <h3>No painel <small>${cfg.ativos.length}</small>${editando ? '' : ' <button type="button" class="w-link-btn" data-editar-painel>Editar no painel</button>'}</h3>
            ${noPainel.length ? `<ul class="w-lista w-lista-painel" data-lista-painel>${noPainel.map((id) => itemNoPainel(id, cfg.ativos.indexOf(id))).join('')}</ul>` : `<p class="w-vazio-lista">${!cfg.ativos.length ? 'O painel está vazio: adicione widgets abaixo.' : categoriaFiltro ? `Nenhum widget de ${esc(nomeFiltro)} no painel.` : 'Nenhum widget do painel com esse nome.'}</p>`}
          </section>
          ${categoriaFiltro && !iaVisiveis.length ? '' : `<section class="w-secao w-secao-ia">
            <h3>${GC.icone ? GC.icone('sparkles', 'ic-ia') : '✨'} Criados pela ${GC.agente()} <small>${doCopiloto.length}</small></h3>
            ${iaVisiveis.length ? `<ul class="w-lista">${iaVisiveis.map(itemIA).join('')}</ul>`
              : `<p class="w-vazio-lista">${doCopiloto.length ? 'Nenhum widget do ' + GC.agente() + ' com esse nome.' : 'Pergunte ao ' + GC.agente() + ' e use “Fixar como widget” num gráfico da resposta: ele aparece aqui, com a pergunta e a data.'}</p>`}
          </section>`}
          ${categoriaFiltro === 'ia' ? '' : `<section class="w-secao">
            <h3>Disponíveis <small>${disponiveis.length}</small></h3>
            ${filtrados.length ? `<ul class="w-grupos">${grupos}</ul>` : `<p class="w-vazio-lista">${categoriaFiltro && !busca ? `Todos os widgets de ${esc(nomeFiltro)} já estão no painel.` : 'Nenhum widget encontrado.'}</p>`}
          </section>`}
        </div>
        <footer class="gaveta-pe">
          <div class="w-pe-txt">${vista && vista.alterada ? `<small class="w-alterada">${GC.icone ? GC.icone('point-filled', 'ic-alerta') : '●'} Alterações não salvas em <b>${esc(vista.nome)}</b></small>` : `<small>Visualização em uso: <b>${esc(vista ? vista.nome : '')}</b></small>`}
            <button type="button" class="w-link-btn" data-restaurar>Restaurar padrão</button></div>
          <button type="button" class="btn-sec principal" data-salvar-vista>💾 Salvar como visualização</button>
        </footer>`;
      if (html === ultimoHtmlGaveta) return;
      ultimoHtmlGaveta = html;
      const corpo = el.gaveta.querySelector('.gaveta-corpo');
      const rolagem = corpo ? corpo.scrollTop : 0;
      const a = document.activeElement;
      const naBusca = a && a.hasAttribute && a.hasAttribute('data-busca-widget');
      const pos = naBusca ? a.selectionStart : null;
      const focoSel = !naBusca && a && el.gaveta.contains(a) ? ['data-ligar-btn', 'data-subir', 'data-descer', 'data-remover', 'data-opcoes', 'data-previa', 'data-tamanho', 'data-cat', 'data-alca-lista', 'data-excluir-ia'].find((k) => a.hasAttribute(k)) : null;
      const focoVal = focoSel ? a.getAttribute(focoSel) : null;
      const focoAlvo = focoSel === 'data-tamanho' ? a.dataset.alvo : null;
      el.gaveta.innerHTML = html;
      const corpoNovo = el.gaveta.querySelector('.gaveta-corpo');
      if (corpoNovo) corpoNovo.scrollTop = rolagem;
      el.gaveta.querySelectorAll('[data-previa-corpo]').forEach((c) => { if (ultimoDados) preencher(c, c.dataset.previaCorpo, ultimoDados); });
      if (naBusca) { const i = el.gaveta.querySelector('[data-busca-widget]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* ok */ } }
      if (focoSel) {
        let n = el.gaveta.querySelector(`[${focoSel}="${CSS.escape(focoVal)}"]${focoAlvo ? `[data-alvo="${focoAlvo}"]` : ''}`);
        // Adicionou: o foco vai para o item no painel.
        if (!n && focoSel === 'data-ligar-btn') n = el.gaveta.querySelector(`[data-alca-lista="${CSS.escape(focoVal)}"]`);
        if (n) n.focus({ preventScroll: true });
      }
    }

    function mover(id, passo) {
      const i = cfg.ativos.indexOf(id);
      if (i < 0) return;
      moverPara(id, i + passo);
    }

    el.gaveta.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-fechar]')) return aoFechar();
      if (t.closest('[data-salvar-vista]')) return aoSalvarVista();
      if (t.closest('[data-restaurar]')) {
        const antes = { ativos: cfg.ativos.slice(), pulsos: cfg.pulsos, tamanhos: cfg.tamanhos, opcoes: cfg.opcoes };
        if (aoRestaurar) aoRestaurar();
        return mostrarToast('Painel restaurado para o padrão da visualização.', () => mudar(antes));
      }
      if (t.closest('[data-editar-painel]')) { aoFechar(); return alternarEdicao(true); }
      const cat = t.closest('[data-cat]');
      if (cat) { categoriaFiltro = cat.dataset.cat || null; return desenharGaveta(); }
      const s = t.closest('[data-subir]');
      if (s) return mover(s.dataset.subir, -1);
      const d = t.closest('[data-descer]');
      if (d) return mover(d.dataset.descer, 1);
      const r = t.closest('[data-remover]');
      if (r) return ocultar(r.dataset.remover);
      const add = t.closest('[data-ligar-btn]');
      if (add) return adicionar(add.dataset.ligarBtn);
      const tam = t.closest('[data-tamanho]');
      if (tam) return definirTamanho(tam.dataset.alvo, tam.dataset.tamanho);
      const op = t.closest('[data-opcoes]');
      if (op) { const id = op.dataset.opcoes; if (opcoesAbertas.has(id)) opcoesAbertas.delete(id); else opcoesAbertas.add(id); return desenharGaveta(); }
      const ip = t.closest('[data-ia-perguntar-gaveta]');
      if (ip) return aoPerguntarIA && aoPerguntarIA(ip.dataset.iaPerguntarGaveta);
      const pv = t.closest('[data-previa]');
      if (pv) { const id = pv.dataset.previa; if (previas.has(id)) previas.delete(id); else previas.add(id); return desenharGaveta(); }
      const x = t.closest('[data-excluir-ia]');
      if (x) {
        const id = x.dataset.excluirIa;
        if (confirmarExcluir !== id) { confirmarExcluir = id; setTimeout(() => { if (confirmarExcluir === id) { confirmarExcluir = null; desenharGaveta(); } }, 4000); return desenharGaveta(); }
        confirmarExcluir = null;
        return aoExcluirIA && aoExcluirIA(id);
      }
    });
    el.gaveta.addEventListener('input', (e) => {
      if (e.target.hasAttribute('data-busca-widget')) { busca = e.target.value; desenharGaveta(); }
    });
    el.gaveta.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.pulsoArea) {
        const marcados = [...el.gaveta.querySelectorAll('[data-pulso-area]:checked')].map((c) => c.dataset.pulsoArea);
        // Todas marcadas (ou nenhuma) = sem escolha: o widget mostra as 7.
        mudar({ pulsos: marcados.length && marcados.length < GC.data.areas.length ? marcados : null });
      }
      if (t.matches('select[data-opcao]')) definirOpcao(t.dataset.opcao, t.dataset.campo, t.value || undefined);
    });
    // Teclado na alça da lista: setas movem.
    el.gaveta.addEventListener('keydown', (e) => {
      const a = e.target.closest('[data-alca-lista]');
      if (!a) return;
      const id = a.dataset.alcaLista; const i = cfg.ativos.indexOf(id);
      if (e.key === 'ArrowUp') { e.preventDefault(); moverPara(id, i - 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); moverPara(id, i + 1); }
    });
    // Arrastar na lista "No painel" (reordenar) e do catálogo (para a lista ou direto para o painel).
    let arrastoLista = null;
    el.gaveta.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-item]');
      if (!it) return;
      arrastoLista = it.dataset.item;
      if (it.dataset.catalogo) e.dataTransfer.setData('text/x-widget-novo', arrastoLista);
      e.dataTransfer.setData('text/plain', arrastoLista);
      e.dataTransfer.effectAllowed = 'copyMove';
      setTimeout(() => it.classList.add('w-arrastando'), 0);
    });
    const alvoLista = (y) => {
      const itens = [...el.gaveta.querySelectorAll('[data-lista-painel] > [data-item]')].filter((x) => x.dataset.item !== arrastoLista);
      const k = itens.findIndex((x) => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
      return { itens, k: k < 0 ? itens.length : k };
    };
    el.gaveta.addEventListener('dragover', (e) => {
      if (!arrastoLista || !e.target.closest('[data-lista-painel], .w-secao')) return;
      e.preventDefault();
      const { itens, k } = alvoLista(e.clientY);
      el.gaveta.querySelectorAll('.w-alvo-antes, .w-alvo-depois').forEach((x) => x.classList.remove('w-alvo-antes', 'w-alvo-depois'));
      if (itens[k]) itens[k].classList.add('w-alvo-antes'); else if (itens.length) itens[itens.length - 1].classList.add('w-alvo-depois');
    });
    el.gaveta.addEventListener('drop', (e) => {
      if (!arrastoLista) return;
      e.preventDefault();
      const id = arrastoLista; arrastoLista = null;
      const { itens, k } = alvoLista(e.clientY);
      const destino = itens[k] ? cfg.ativos.indexOf(itens[k].dataset.item) : cfg.ativos.length;
      if (cfg.ativos.includes(id)) moverPara(id, destino > cfg.ativos.indexOf(id) ? destino - 1 : destino);
      else adicionar(id, destino);
    });
    el.gaveta.addEventListener('dragend', () => {
      arrastoLista = null;
      el.gaveta.querySelectorAll('.w-arrastando, .w-alvo-antes, .w-alvo-depois').forEach((x) => x.classList.remove('w-arrastando', 'w-alvo-antes', 'w-alvo-depois'));
    });

    if (el.botaoEditar) el.botaoEditar.addEventListener('click', () => alternarEdicao());

    function atualizar(novoCfg, dados) {
      cfg = GC.normalizarEstado({ widgets: novoCfg }).widgets;
      desenharArea(dados);
      desenharGaveta();
    }

    return { atualizar, alternarEdicao, editando: () => editando };
  };
})(window.GC = window.GC || {});
