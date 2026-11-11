(function (GC) {
  // Widgets novos do painel de Indicadores (catálogo em js/visualizacoes.js): gestão (metas, resumo da IA,
  // decisões, agenda), tempo real (feed, 24 h, bairros, gabinete, previsão), dinheiro (orçamento, contratos,
  // custos, arrecadação), cidadão (voz, resposta, bairro em foco), serviços (iluminação, meio ambiente,
  // assistência) e utilitários (indicador em destaque, comparar bairros, nota).
  // Cada widget é uma função (d, opcoes) → HTML; as ações usam data-atributos tratados em js/widgets.js.
  // As funções de cálculo ficam em GC.* (testáveis sem DOM).
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, classe) => (GC.icone ? GC.icone(nome, classe) : '');
  const n = (v, casas = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const mi = (v) => `R$ ${n(v, 1)} mi`;
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const nomeArea = (id) => (GC.data.areas.find((a) => a.id === id) || { nome: id || 'Gabinete' }).nome;
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const SIT = { ok: 'Na meta', atencao: 'Perto da meta', critico: 'Fora da meta', sem_dado: 'Sem dado' };
  const fmtInd = (i) => GC.formatarIndicador(i.valorAtual, i.unidade);
  const tempoRel = (min) => (min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`);
  const val = (f) => (typeof f === 'function' ? f() : f);

  // ---------------- cálculos (puros) ----------------
  // Mais recentes primeiro (a lista de ocorrências do store, com criadaEm).
  GC.feedOcorrencias = (lista, max = 8) => lista.slice().sort((a, b) => (b.criadaEm || 0) - (a.criadaEm || 0)).slice(0, max);

  // Ocorrências abertas nas últimas 24 h, por hora (índice 0 = há 23 h, 23 = a hora atual).
  GC.histograma24h = function (lista, agora = Date.now()) {
    const H = 3600000;
    const horas = Array.from({ length: 24 }, (_, k) => ({ inicio: agora - (23 - k) * H - (agora % H), n: 0, criticas: 0 }));
    lista.forEach((o) => {
      const t = o.criadaEm; if (!t || t > agora || t < horas[0].inicio) return;
      const k = Math.min(23, Math.floor((t - horas[0].inicio) / H));
      horas[k].n++; if (o.severidade === 'critica') horas[k].criticas++;
    });
    const pico = horas.reduce((m, h, k) => (h.n > horas[m].n ? k : m), 0);
    return { horas, pico: horas[pico].n ? pico : null, total: horas.reduce((s, h) => s + h.n, 0) };
  };

  // Bairros pela carga de ocorrências abertas: nível 0 (nenhuma) a 4 (mais carregado da cidade).
  GC.calorBairros = function (lista, bairros) {
    const abertas = lista.filter((o) => o.status !== 'resolvida');
    const r = bairros.map((b) => {
      const doBairro = abertas.filter((o) => o.bairroId === b.id);
      const peso = doBairro.reduce((s, o) => s + (o.severidade === 'critica' ? 3 : o.severidade === 'alta' ? 2 : 1), 0);
      return { id: b.id, nome: b.nome, n: doBairro.length, criticas: doBairro.filter((o) => o.severidade === 'critica').length, peso };
    });
    const max = Math.max(1, ...r.map((x) => x.peso));
    r.forEach((x) => { x.nivel = x.peso ? Math.max(1, Math.ceil((x.peso / max) * 4)) : 0; });
    return r;
  };

  // Widgets que valem a pena agora (e ainda não estão no painel), com o motivo.
  GC.sugerirWidgets = function ({ ativos = [], risco = null, gabinetes = [], indicadores = [], atencao = [], contratos = null } = {}) {
    const s = [];
    if (gabinetes.length) s.push({ id: 'crise', motivo: `${gabinetes.length} gabinete(s) de crise ativo(s)` });
    if (risco && (risco.preventivo || (risco.altas || []).length)) s.push({ id: 'previsao', motivo: 'chuva com risco alto nas próximas horas' });
    const fora = indicadores.filter((i) => i.situacao === 'critico').length;
    if (fora) s.push({ id: 'metas_risco', motivo: `${fora} indicador(es) fora da meta` });
    if (atencao.length) s.push({ id: 'decisoes', motivo: `${atencao.length} alerta(s) esperando decisão` });
    if (contratos && contratos.foraSla.length) s.push({ id: 'contratos', motivo: `${contratos.foraSla.length} contrato(s) fora do SLA` });
    s.push({ id: 'feed', motivo: 'acompanhar a cidade ao vivo' });
    return s.filter((x) => !ativos.includes(x.id)).slice(0, 3);
  };

  // ---------------- pedaços de HTML ----------------
  const num = (valor, rotulo, classe = '') => `<div class="w-num ${classe}"><b>${valor}</b><small>${rotulo}</small></div>`;
  const barra = (rotulo, pct, texto, classe = 'medio', extra = '') => `<li${extra}><span>${rotulo}</span><i style="--v:${Math.max(0, Math.min(100, pct))}%" class="${classe}"></i><b>${texto}</b></li>`;
  const tom = (bom) => (bom ? 'bom' : 'ruim');
  function spark(valores, { L = 120, A = 32, classe = '' } = {}) {
    if (!valores || valores.length < 2) return '';
    const min = Math.min(...valores); const max = Math.max(...valores);
    const x = (k) => 2 + (k * (L - 4)) / (valores.length - 1);
    const y = (v) => (max === min ? A / 2 : A - 3 - ((v - min) * (A - 6)) / (max - min));
    const p = valores.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg class="wx-spark ${classe}" viewBox="0 0 ${L} ${A}" aria-hidden="true"><polygon points="2,${A} ${p} ${L - 2},${A}" class="area"/><polyline points="${p}"/></svg>`;
  }
  const vazio = (texto, icone = 'circle-check') => `<p class="wx-vazio">${ic(icone, 'ic-ok')} ${esc(texto)}</p>`;

  // ---------------- os widgets ----------------
  const R = {};

  R.metas_risco = (d) => {
    const lista = GC.ordenarPorUrgencia(val(d.indicadores) || []).filter((i) => i.situacao === 'critico' || i.situacao === 'atencao').slice(0, 5);
    if (!lista.length) return vazio('Todos os indicadores estão na meta.');
    return `<ul class="wx-metas">${lista.map((i) => {
      const t = GC.tendenciaIndicador(i); const dist = GC.distanciaMeta(i);
      return `<li><button type="button" data-abrir-ind="${esc(i.id)}" class="sit-${i.situacao}">
        <span class="wx-metas-nome">${esc(i.nome)}<small>meta ${i.polaridade === 'menor' ? '≤' : '≥'} ${esc(GC.formatarIndicador(i.metaAtual, i.unidade))}${dist !== null && dist > 0 ? ` · ${Number(dist).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${i.polaridade === 'menor' ? 'acima' : 'abaixo'}` : ''}</small></span>
        ${spark(i.serieAtual ? i.serieAtual.meses : null, { L: 70, A: 24 }) || '<span></span>'}
        <span class="wx-metas-valor"><b>${esc(fmtInd(i))}</b>${t && t.melhorou !== null ? `<em class="${t.melhorou ? 'bom' : 'ruim'}">${t.direcao === 'sobe' ? '▲' : '▼'}</em>` : ''}</span>
      </button></li>`;
    }).join('')}</ul><a class="w-link" href="#/indicadores">Todas as metas e fichas →</a>`;
  };

  R.placar_metas = (d) => {
    const lista = val(d.indicadores) || [];
    const p = GC.placarIndicadores(lista);
    const antes = GC.placarIndicadores(lista.map((i) => ({ situacao: GC.situacaoAnterior(i) })));
    const total = p.total || 1;
    const fatias = [['ok', 'var(--positivo)'], ['atencao', '#ea580c'], ['critico', 'var(--critica)'], ['sem_dado', '#cbd5e1']];
    let acc = 0;
    const arcos = fatias.map(([s, cor]) => { const ini = acc; acc += (p[s] / total) * 100; return p[s] ? `${cor} ${ini}% ${acc}%` : ''; }).filter(Boolean).join(', ');
    const dif = (s) => { const x = p[s] - antes[s]; return x ? `<em class="${(s === 'ok') === (x > 0) ? 'bom' : 'ruim'}">${x > 0 ? '+' : ''}${x} vs. mês passado</em>` : '<em>igual ao mês passado</em>'; };
    return `<div class="wx-placar">
      <div class="wx-rosca" style="background: conic-gradient(${arcos})" role="img" aria-label="${p.ok} na meta, ${p.atencao} perto, ${p.critico} fora, de ${p.total}"><span><b>${Math.round((p.ok / total) * 100)}%</b><small>na meta</small></span></div>
      <ul class="wx-placar-lista">
        <li class="ok"><a href="#/indicadores"><b>${p.ok}</b> na meta</a>${dif('ok')}</li>
        <li class="atencao"><a href="#/indicadores"><b>${p.atencao}</b> perto da meta</a>${dif('atencao')}</li>
        <li class="critico"><a href="#/indicadores"><b>${p.critico}</b> fora da meta</a>${dif('critico')}</li>
      </ul>
    </div>`;
  };

  R.resumo = (d, o) => {
    const semana = o.periodo === 'semana';
    const chave = `<div class="wx-seg" role="group" aria-label="Período"><button type="button" data-opcao="resumo" data-valor="dia" class="${semana ? '' : 'ativo'}" aria-pressed="${!semana}">Hoje</button><button type="button" data-opcao="resumo" data-valor="semana" class="${semana ? 'ativo' : ''}" aria-pressed="${semana}">Semana</button></div>`;
    if (!semana) {
      const r = val(d.resumoDia);
      if (!r) return chave;
      return `${chave}<ul class="wx-resumo">${r.destaques.map((x) => `<li class="${x.tom}"><button type="button" data-resumo="${esc(x.tipo)}"${x.area ? ` data-area="${esc(x.area)}"` : ''}><b>${esc(x.rotulo)}</b><small>${esc(x.detalhe || '')}</small></button></li>`).join('')}</ul>
        ${r.gabinete ? `<p class="wx-nota-ia">${ic('urgent', 'ic-critica')} ${esc(r.gabinete.titulo)} · ${esc(r.gabinete.detalhe)}</p>` : ''}`;
    }
    const s = val(d.resumoSemana);
    if (!s) return chave;
    const linhas = [
      ...s.melhorou.slice(0, 2).map((x) => ({ tom: 'ok', t: `Melhorou · ${x.rotulo}`, v: `${x.secretaria} · ${x.valor}`, area: x.area })),
      ...s.piorou.slice(0, 2).map((x) => ({ tom: 'critico', t: `Piorou · ${x.rotulo}`, v: `${x.secretaria} · ${x.valor}`, area: x.area })),
      ...s.entregas.slice(0, 1).map((x) => ({ tom: 'info', t: `Entrega · ${x.titulo}`, v: x.bairro, area: x.area })),
    ];
    return `${chave}<p class="wx-sub">${esc(s.periodo)} · ${s.contagem.melhorou} melhoras, ${s.contagem.piorou} pioras, ${s.contagem.entregas} entregas</p>
      ${linhas.length ? `<ul class="wx-resumo">${linhas.map((x) => `<li class="${x.tom}"><button type="button" data-resumo="area" data-area="${esc(x.area || '')}"><b>${esc(x.t)}</b><small>${esc(x.v || '')}</small></button></li>`).join('')}</ul>` : ''}`;
  };

  R.decisoes = (d) => {
    const lista = (val(d.atencao) || []).slice(0, 5);
    if (!lista.length) return vazio('Nada esperando decisão do prefeito.');
    return `<ul class="wx-lista">${lista.map((o) => {
      const resta = GC.prazoRestanteMin ? GC.prazoRestanteMin(o) : null;
      const prazo = resta === null ? '' : resta < 0 ? `<em class="ruim">prazo estourado há ${tempoRel(-resta).replace('há ', '')}</em>` : `<em>${tempoRel(resta).replace('há ', 'faltam ')}</em>`;
      const motivo = (GC.motivosAtencao(o)[0] || {}).texto || '';
      return `<li><button type="button" data-abrir-alerta="${esc(o.id)}">
        <span class="sit ${o.severidade === 'critica' ? 'critica' : o.severidade === 'alta' ? 'atencao' : 'ok'}">${SEV[o.severidade]}</span>
        <span class="nome">${esc(o.titulo)}<small>${esc(nomeArea(o.area))} · ${esc(nomeBairro(o.bairroId))} · ${esc(GC.semEmoji ? GC.semEmoji(motivo) : motivo)}</small></span>
        ${prazo}
      </button></li>`;
    }).join('')}</ul>${(val(d.atencao) || []).length > 5 ? `<p class="w-legenda">e mais ${(val(d.atencao) || []).length - 5} na gaveta de Alertas.</p>` : ''}`;
  };

  const TIPO_AGENDA = { reuniao: ['users', 'Reunião'], audiencia: ['microphone', 'Audiência'], evento: ['calendar-heart', 'Evento'], prazo: ['alarm', 'Prazo'], contrato: ['file-certificate', 'Contrato'], obra: ['crane', 'Obra'] };
  R.agenda = (d) => {
    const itens = GC.gestao.agenda(d.agora, { obras: GC.obras && GC.obras.resumo ? GC.obras.resumo().obras : [] });
    if (!itens.length) return vazio('Nada marcado nos próximos 14 dias.', 'calendar');
    return `<ol class="wx-agenda">${itens.slice(0, 7).map((x) => {
      const dt = new Date(x.quando);
      const [icone, rotulo] = TIPO_AGENDA[x.tipo] || ['calendar', ''];
      return `<li class="${x.tipo}${x.emDias <= 2 ? ' perto' : ''}"><span class="wx-data"><b>${dt.getDate()}</b><small>${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></span>
        <span class="nome">${ic(icone)} ${esc(x.titulo)}<small>${rotulo} · ${x.emDias === 0 ? 'hoje' : x.emDias === 1 ? 'amanhã' : `em ${x.emDias} dias`}${x.tipo === 'contrato' || x.tipo === 'obra' ? '' : ` · ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`} · ${esc(x.local)}</small></span></li>`;
    }).join('')}</ol>`;
  };

  R.feed = (d) => {
    const lista = GC.feedOcorrencias(d.ocorrencias || [], 7);
    if (!lista.length) return vazio('Nenhuma ocorrência.');
    return `<p class="wx-ao-vivo"><i></i> ao vivo · ${(d.ocorrencias || []).filter((o) => o.status !== 'resolvida').length} abertas</p>
      <ul class="wx-feed">${lista.map((o) => `<li class="sev-${o.severidade}${o.status === 'resolvida' ? ' resolvida' : ''}"><button type="button" data-abrir-alerta="${esc(o.id)}">
        <span class="wx-sev"></span><span class="nome">${esc(o.titulo)}<small>${esc(nomeBairro(o.bairroId))} · ${esc(nomeArea(o.area))}${o.status === 'resolvida' ? ' · resolvida' : ''}</small></span>
        <time>${tempoRel(Math.max(0, Math.round((d.agora - (o.criadaEm || d.agora)) / 60000)))}</time></button></li>`).join('')}</ul>`;
  };

  R.linha24h = (d) => {
    const h = GC.histograma24h(d.ocorrencias || [], d.agora);
    const max = Math.max(1, ...h.horas.map((x) => x.n));
    const hora = (t) => `${String(new Date(t).getHours()).padStart(2, '0')}h`;
    return `<div class="w-numeros">${num(h.total, 'ocorrências abertas em 24 h')}${num(h.pico === null ? '—' : hora(h.horas[h.pico].inicio), h.pico === null ? 'sem pico' : `pico do dia · ${h.horas[h.pico].n} ocorrência(s)`, 'alerta')}</div>
      <div class="wx-24h" role="img" aria-label="Ocorrências por hora nas últimas 24 horas">${h.horas.map((x, k) => `<span class="${k === h.pico ? 'pico' : ''}${x.criticas ? ' critica' : ''}" style="--h:${Math.round((x.n / max) * 100)}%" title="${hora(x.inicio)}: ${x.n} ocorrência(s)${x.criticas ? `, ${x.criticas} crítica(s)` : ''}"></span>`).join('')}</div>
      <p class="wx-eixo"><span>${hora(h.horas[0].inicio)}</span><span>${hora(h.horas[12].inicio)}</span><span>agora</span></p>`;
  };

  R.calor_bairros = (d) => {
    const r = GC.calorBairros(d.ocorrencias || [], GC.data.bairros);
    const ord = r.slice().sort((a, b) => b.peso - a.peso || a.nome.localeCompare(b.nome));
    return `<div class="wx-calor">${ord.map((b) => `<button type="button" class="nivel-${b.nivel}" data-ver-bairro="${esc(b.id)}" title="${esc(b.nome)}: ${b.n} aberta(s)${b.criticas ? `, ${b.criticas} crítica(s)` : ''}"><span>${esc(b.nome)}</span><b>${b.n || ''}</b></button>`).join('')}</div>
      <p class="w-legenda"><span><i class="wx-n0"></i>nenhuma</span><span><i class="wx-n2"></i>algumas</span><span><i class="wx-n4"></i>mais carregado</span> · clique para ver o bairro</p>`;
  };

  R.crise = (d) => {
    const lista = val(d.gabinetes) || [];
    const risco = d.risco;
    if (!lista.length) {
      const pv = risco && risco.preventivo;
      // data-resumo-p: no tamanho Compacto, o aviso e a sugestão aparecem juntos (os dois são o resumo).
      return `<div data-resumo-p>${vazio('Nenhum gabinete de crise ativo.')}${pv ? `<div class="w-risco-alerta"><div><b>${ic('alert-triangle', 'ic-alerta')} Sugestão: gabinete preventivo · ${esc(pv.nome)}</b><small>${pv.familias} famílias · chuva passa do limite em ~${pv.horasAte} h</small></div><button type="button" class="btn-sec" data-risco="${esc(pv.id)}">Ver no mapa</button></div>` : ''}</div>`;
    }
    return `<ul class="wx-crise">${lista.map((g) => {
      const feitas = g.tarefas.filter((t) => t.status === 'concluida').length;
      const min = Math.round((d.agora - g.abertoEm) / 60000);
      return `<li><button type="button" data-ir-crise="${esc(g.id)}"><b>${ic('urgent', 'ic-critica')} ${esc(g.titulo)}</b>
        <span class="wx-progresso"><i style="--v:${g.tarefas.length ? Math.round((feitas / g.tarefas.length) * 100) : 0}%"></i></span>
        <small>${feitas}/${g.tarefas.length} tarefas · aberto ${tempoRel(min)} · ${(g.areas || []).length} secretaria(s)</small></button></li>`;
    }).join('')}</ul>`;
  };

  R.previsao = (d) => {
    const p = GC.gestao.previsao48h(d.risco && d.risco.previsao, d.agora);
    const limite = 10; // mm em 6 h: a partir daí a Defesa Civil fica em alerta
    return `<p class="wx-sub">${esc(p.fonte)} · ${p.total48h} mm previstos em 48 h</p>
      <div class="wx-prev">${p.blocos.map((b) => `<div class="${b.mm >= limite ? 'alerta' : ''}"><small>${b.inicioH === 0 ? 'agora' : `+${b.inicioH} h`}</small>
        ${ic(b.mm >= limite ? 'cloud-storm' : b.mm >= 2 ? 'cloud-rain' : b.hora >= 6 && b.hora < 18 ? 'sun' : 'moon')}
        <b>${b.tempC}°</b><span class="wx-chuva" style="--h:${Math.round((b.mm / p.maxMm) * 100)}%"></span><small>${n(b.mm, 1)} mm · ${b.chancePct}%</small></div>`).join('')}</div>
      <p class="w-legenda">Em destaque: mais de ${limite} mm em 6 h (alerta da Defesa Civil).</p>`;
  };

  R.orcamento = () => {
    const o = GC.gestao.orcamento({ mesDoAno: new Date().getMonth() + 1 });
    return `<div class="w-numeros">${num(mi(o.previstoMi), 'previsto no ano')}${num(`${n(o.empenhadoPct, 1)}%`, `empenhado · ${mi(o.empenhadoMi)}`)}${num(`${n(o.pagoPct, 1)}%`, `pago · esperado ~${o.esperadoPct}% até agora`, o.pagoPct < o.esperadoPct - 10 ? 'alerta' : 'bom')}</div>
      <ul class="wx-orc">${o.areas.map((a) => `<li class="${a.atrasada ? 'atrasada' : ''}"><span>${esc(a.nome)}<small>${mi(a.previstoMi)}</small></span>
        <span class="wx-orc-barra" title="Empenhado ${a.empenhadoPct}% · pago ${a.pagoPct}%"><i class="emp" style="--v:${a.empenhadoPct}%"></i><i class="pago" style="--v:${a.pagoPct}%"></i><em style="--m:${o.esperadoPct}%"></em></span><b>${a.pagoPct}%</b></li>`).join('')}</ul>
      <p class="w-legenda"><span><i style="background:#93c5fd"></i>empenhado</span><span><i style="background:var(--navy)"></i>pago</span><span><i style="background:var(--texto);width:2px"></i>esperado até o mês</span></p>`;
  };

  R.contratos = (d) => {
    const c = GC.gestao.contratos(d.agora);
    const onibus = d.frota && d.frota.onibus;
    const multa = c.multaMil + (onibus && onibus.foraDoContrato ? onibus.multaEstimadaMil : 0);
    const linhas = [...(onibus && onibus.foraDoContrato ? [{ id: 'onibus', nome: 'Concessão de ônibus', empresa: onibus.operadora, slaPct: onibus.disponibilidadePct, metaSlaPct: onibus.metaDisponibilidadePct, foraSla: true, venceDias: null, multaMil: onibus.multaEstimadaMil }] : []), ...c.lista];
    return `<div class="w-numeros">${num(c.foraSla.length + (onibus && onibus.foraDoContrato ? 1 : 0), 'fora do SLA', 'critica')}${num(c.vencendo.length, 'vencem em 60 dias', c.vencendo.length ? 'alerta' : '')}${num(`R$ ${n(multa)} mil`, 'multas estimadas no mês')}</div>
      <ul class="w-edu-lista">${linhas.slice(0, 6).map((x) => `<li><span class="w-linha-simples"><span class="sit ${x.foraSla ? 'critica' : x.venceDias !== null && x.venceDias <= 60 ? 'atencao' : 'ok'}">${x.foraSla ? 'Fora do SLA' : x.venceDias !== null && x.venceDias <= 60 ? `Vence em ${x.venceDias} d` : 'Em dia'}</span>
        <span class="nome">${esc(x.nome)}<small>${esc(x.empresa)} · SLA ${x.slaPct}% (meta ${x.metaSlaPct}%)${x.multaMil ? ` · multa ~R$ ${n(x.multaMil)} mil` : ''}</small></span></span></li>`).join('')}</ul>`;
  };

  R.custos = () => {
    const lista = GC.gestao.custos();
    return `<ul class="wx-custos">${lista.map((c) => `<li><span>${esc(c.nome)}<small>${esc(c.unidade)}</small></span>
      <b>R$ ${n(c.atual, c.atual < 10 ? 2 : 0)}</b><em class="${c.variacaoPct > 0 ? 'ruim' : 'bom'}">${c.variacaoPct > 0 ? '▲' : '▼'} ${n(Math.abs(c.variacaoPct), 1)}%</em></li>`).join('')}</ul>
      <p class="w-legenda">Variação em relação ao mês passado. Alta de custo em vermelho.</p>`;
  };

  R.arrecadacao = () => {
    const a = GC.gestao.arrecadacao();
    return `<div class="w-numeros">${num(mi(a.mesMi), `no mês · ${n(a.mesPct, 1)}% da meta`, a.mesPct >= 100 ? 'bom' : 'alerta')}${num(mi(a.anoMi), `no ano · ${n(a.anoPct, 1)}% da meta`, a.anoPct >= 100 ? 'bom' : 'alerta')}${num(`${n(a.inadimplenciaIptuPct, 1)}%`, 'inadimplência do IPTU')}</div>
      <ul class="w-barras">${a.tributos.map((t) => barra(`${esc(t.nome)} <small>${mi(t.mesMi)} de ${mi(t.metaMesMi)}</small>`, Math.min(100, t.mesPct), `${n(t.mesPct, 0)}%`, t.mesPct >= 100 ? 'bom' : t.mesPct >= 90 ? 'medio' : 'ruim')).join('')}</ul>`;
  };

  R.voz_cidadao = () => {
    const v = GC.gestao.vozCidadao();
    const s = v.sentimento;
    return `<div class="w-numeros">${num(n(v.total), 'pedidos em 30 dias')}${num(`${s.negativo}%`, `tom negativo · era ${s.negativoAntes}%`, s.negativo < s.negativoAntes ? 'bom' : 'alerta')}</div>
      <div class="wx-sentimento" role="img" aria-label="Sentimento: ${s.positivo}% positivo, ${s.neutro}% neutro, ${s.negativo}% negativo"><i class="pos" style="--v:${s.positivo}%"></i><i class="neu" style="--v:${s.neutro}%"></i><i class="neg" style="--v:${s.negativo}%"></i></div>
      <p class="w-legenda"><span><i style="background:var(--positivo)"></i>positivo ${s.positivo}%</span><span><i style="background:#cbd5e1"></i>neutro ${s.neutro}%</span><span><i style="background:var(--critica)"></i>negativo ${s.negativo}%</span></p>
      <div class="w-seg-colunas"><div><h4>Por canal</h4><ul class="w-barras">${v.canais.map((c) => barra(esc(c.nome), (c.n / v.canais[0].n) * 100, n(c.n), 'medio')).join('')}</ul></div>
      <div><h4>Temas mais citados</h4><ul class="wx-temas">${v.temas.map((t) => `<li><span>${esc(t.tema)}${t.sobe ? ' <em class="ruim">▲</em>' : ''}</span><b>${n(t.n)}</b><small>${t.negativo}% negativo</small></li>`).join('')}</ul></div></div>
      <p class="w-legenda">${spark(v.semanas, { L: 160, A: 26 })} pedidos por semana (12 semanas)</p>`;
  };

  R.resposta_cidadao = () => {
    const r = GC.gestao.respostaCidadao();
    return `<div class="w-numeros">${num(n(r.abertos), 'pedidos abertos')}${num(n(r.atrasados), 'atrasados', 'critica')}${num(`${n(r.noPrazoPct, 1)}%`, `respondidos no prazo · meta ${r.metaPct}%`, r.noPrazoPct >= r.metaPct ? 'bom' : 'alerta')}${num(`${r.tempoMedioH} h`, `tempo médio · meta ${r.metaH} h`, r.tempoMedioH <= r.metaH ? 'bom' : 'alerta')}</div>
      <ul class="w-barras">${r.porCanal.map((c) => barra(`${esc(c.nome)} <small>${c.tempoH} h</small>`, c.noPrazoPct, `${c.noPrazoPct}%`, c.noPrazoPct >= r.metaPct ? 'bom' : c.noPrazoPct >= 85 ? 'medio' : 'ruim')).join('')}</ul>
      <p class="w-legenda">% respondido no prazo, por canal (30 dias).</p>`;
  };

  function blocoBairro(r) {
    if (!r) return '';
    return `<div class="wx-bairro"><h4><button type="button" class="w-link-btn" data-ver-bairro="${esc(r.id)}">${ic('map-pin')} ${esc(r.nome)}</button> <small>${n(r.populacao)} moradores</small></h4>
      <div class="w-numeros">${num(r.abertas.length, 'ocorrências abertas', r.criticas ? 'critica' : '')}${r.satisfacao !== undefined ? num(`${r.satisfacao}%`, `satisfação · cidade ${r.satisfacaoCidade}%`, tom(r.satisfacao >= r.satisfacaoCidade)) : ''}${r.bo30d !== undefined ? num(n(r.bo30d), `B.O.s em 30 dias · ${n(r.boPorMil, 1)}/mil hab.`) : ''}${num(r.escolas.length + r.leitos.length + r.obras.length, `${r.escolas.length} escola(s) · ${r.leitos.length} unidade(s) de saúde · ${r.obras.length} obra(s)`)}</div>
      ${r.abertas.length ? `<ul class="wx-feed">${r.abertas.slice(0, 3).map((o) => `<li class="sev-${o.severidade}"><button type="button" data-abrir-alerta="${esc(o.id)}"><span class="wx-sev"></span><span class="nome">${esc(o.titulo)}<small>${SEV[o.severidade]} · ${esc(nomeArea(o.area))}</small></span></button></li>`).join('')}</ul>` : ''}</div>`;
  }
  const seletorBairro = (opcao, campo, atual, rotulo) => `<label class="wx-campo">${rotulo}<select data-opcao="${opcao}" data-campo="${campo}">${GC.data.bairros.map((b) => `<option value="${esc(b.id)}"${b.id === atual ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>`;

  R.bairro_foco = (d, o) => {
    const id = o.bairro || d.bairro || (GC.calorBairros(d.ocorrencias || [], GC.data.bairros).sort((a, b) => b.peso - a.peso)[0] || {}).id;
    return `${seletorBairro('bairro_foco', 'bairro', id, 'Bairro')}${blocoBairro(d.resumoBairro(id))}`;
  };

  R.comparativo = (d, o) => {
    const ranking = GC.calorBairros(d.ocorrencias || [], GC.data.bairros).sort((a, b) => b.peso - a.peso);
    const a = o.a || (ranking[0] || {}).id; const b = o.b && o.b !== a ? o.b : (ranking.find((x) => x.id !== a) || {}).id;
    const ra = d.resumoBairro(a); const rb = d.resumoBairro(b);
    if (!ra || !rb) return '';
    const linha = (rotulo, va, vb, menorMelhor, fmtV = (x) => n(x)) => {
      const ok = menorMelhor !== null && va !== undefined && vb !== undefined && va !== vb; // null: não há lado melhor
      const melhorA = ok && (menorMelhor ? va < vb : va > vb);
      return `<tr><th>${rotulo}</th><td class="${ok ? (melhorA ? 'bom' : 'ruim') : ''}">${va === undefined ? '—' : fmtV(va)}</td><td class="${ok ? (melhorA ? 'ruim' : 'bom') : ''}">${vb === undefined ? '—' : fmtV(vb)}</td></tr>`;
    };
    return `<div class="wx-comp-sel">${seletorBairro('comparativo', 'a', a, 'A')}<span>×</span>${seletorBairro('comparativo', 'b', b, 'B')}</div>
      <table class="wx-comp"><thead><tr><th></th><th><button type="button" class="w-link-btn" data-ver-bairro="${esc(a)}">${esc(ra.nome)}</button></th><th><button type="button" class="w-link-btn" data-ver-bairro="${esc(b)}">${esc(rb.nome)}</button></th></tr></thead><tbody>
        ${linha('Moradores', ra.populacao, rb.populacao, null)}
        ${linha('Ocorrências abertas', ra.abertas.length, rb.abertas.length, true)}
        ${linha('Críticas', ra.criticas, rb.criticas, true)}
        ${linha('Satisfação', ra.satisfacao, rb.satisfacao, false, (x) => `${x}%`)}
        ${linha('B.O.s por mil hab. (30 d)', ra.boPorMil, rb.boPorMil, true, (x) => n(x, 1))}
        ${linha('Escolas', ra.escolas.length, rb.escolas.length, false)}
        ${linha('Unidades de saúde', ra.leitos.length, rb.leitos.length, false)}
        ${linha('Obras', ra.obras.length, rb.obras.length, null)}
      </tbody></table>`;
  };

  R.iluminacao = () => {
    const l = GC.gestao.iluminacao();
    const max = Math.max(...l.bairros.map((b) => b.apagados));
    return `<div class="w-numeros">${num(n(l.apagados), `pontos apagados · ${n(l.apagadosPct, 1)}% de ${n(l.pontos)}`, 'alerta')}${num(`${l.reparoMedioH} h`, `reparo médio · meta ${l.metaH} h`, l.reparoMedioH <= l.metaH ? 'bom' : 'critica')}${num(`${l.ledPct}%`, `em LED · meta ${l.ledMetaPct}% em 2026`)}</div>
      <h4>Bairros com mais pontos apagados</h4><ul class="w-barras">${l.bairros.map((b) => barra(`<button type="button" class="w-link-btn" data-ver-bairro="${esc(b.id)}">${esc(b.nome)}</button>`, (b.apagados / max) * 100, n(b.apagados), 'medio')).join('')}</ul>`;
  };

  R.ambiente = () => {
    const a = GC.gestao.ambiente();
    return `<div class="w-numeros">${num(a.ar.iqa, `qualidade do ar · ${a.ar.categoria} (${a.ar.poluente})`, a.ar.iqa <= 40 ? 'bom' : a.ar.iqa <= 80 ? 'alerta' : 'critica')}${num(n(a.poda.pendentes), `podas pendentes · ${a.poda.prazoMedioDias} dias em média (meta ${a.poda.metaDias})`, a.poda.prazoMedioDias > a.poda.metaDias ? 'alerta' : '')}${num(`${n(a.verdeM2Hab, 1)} m²`, `de área verde por habitante · meta ${a.verdeMetaM2Hab}`)}${num(a.focosQueimada, 'focos de queimada no mês', a.focosQueimada ? 'alerta' : 'bom')}</div>
      <p class="w-legenda">${spark(a.ar.dias, { L: 140, A: 26 })} índice de qualidade do ar, 7 dias · ${esc(a.ar.estacao)} · ${n(a.arvoresPlantadasAno)} árvores plantadas no ano</p>`;
  };

  R.assistencia = () => {
    const s = GC.gestao.assistencia();
    const b = s.bolsaFamilia;
    return `<div class="w-numeros">${num(`${s.ocupadas}/${s.vagas}`, `vagas ocupadas nos abrigos · ${n(s.ocupacaoPct, 0)}%`, s.ocupacaoPct >= 90 ? 'critica' : 'alerta')}${num(n(b.familias), `famílias no Bolsa Família · +${n(b.novasNoMes)} / −${n(b.canceladasNoMes)} no mês`)}${num(n(s.cras.atendimentosMes), `atendimentos em ${s.cras.unidades} CRAS no mês`)}${num(n(s.populacaoRua), 'pessoas em situação de rua (estimativa)')}</div>
      <h4>Abrigos</h4><ul class="w-barras">${s.abrigos.map((a) => barra(esc(a.nome), a.pct, `${a.ocupadas}/${a.vagas}`, a.pct >= 95 ? 'ruim' : a.pct >= 80 ? 'medio' : 'bom')).join('')}</ul>`;
  };

  R.kpi = (d, o) => {
    const lista = val(d.indicadores) || [];
    const i = lista.find((x) => x.id === o.ind) || GC.ordenarPorUrgencia(lista)[0];
    if (!i) return '';
    const t = GC.tendenciaIndicador(i);
    const ins = GC.insightIndicador(i);
    return `<label class="wx-campo">Indicador<select data-opcao="kpi" data-campo="ind">${lista.map((x) => `<option value="${esc(x.id)}"${x.id === i.id ? ' selected' : ''}>${esc(x.id)} · ${esc(x.nome)}</option>`).join('')}</select></label>
      <button type="button" class="wx-kpi sit-${i.situacao}" data-abrir-ind="${esc(i.id)}">
        <span class="wx-kpi-valor"><b>${esc(fmtInd(i))}</b><span class="sec-status ${i.situacao === 'ok' ? 'st-em_dia' : i.situacao === 'atencao' ? 'st-atencao' : i.situacao === 'critico' ? 'st-critico' : ''}">${SIT[i.situacao]}</span></span>
        <small>meta ${i.polaridade === 'menor' ? '≤' : '≥'} ${esc(GC.formatarIndicador(i.metaAtual, i.unidade))} · ${esc(i.frequenciaAtual.toLowerCase())}${t && t.melhorou !== null ? ` · <em class="${t.melhorou ? 'bom' : 'ruim'}">${t.melhorou ? 'melhorou' : 'piorou'}</em>` : ''}</small>
        ${spark(i.serieAtual ? i.serieAtual.meses : null, { L: 300, A: 60, classe: 'grande' })}
        ${ins ? `<span class="wx-insight ${ins.tom}">${esc(ins.texto)}</span>` : ''}
      </button>`;
  };

  R.nota = (d, o) => `<textarea class="wx-nota" data-opcao="nota" data-campo="texto" rows="4" maxlength="500" placeholder="Escreva um lembrete para você ou para a equipe…" aria-label="Texto da nota">${esc(o.texto || '')}</textarea>
    <p class="w-legenda">Salva sozinha. Faz parte da visualização em uso.</p>`;

  GC.WIDGETS_EXTRA = R;
})(window.GC = window.GC || {});
