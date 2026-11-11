(function (GC) {
  GC.STATUS = ['encaminhada', 'em_campo', 'resolvida'];
  GC.agora = GC.agora || (() => Date.now());
  const PESO = { critica: 0, alta: 1, media: 2 };
  const ORDEM_MOTIVO = { prazo: 0, conjunta: 1, recorrente: 2 };
  const TEXTO_AVANCO = { em_campo: '🚧 Equipe em campo', resolvida: '✅ Resolvida' };
  const RECORRENTE_MIN = 6; // casos da mesma área no bairro em 30 dias
  const MAX_AUTOMATICO = 15; // a cidade sozinha não esvazia o mapa abaixo disso
  const META_PRAZO = 85; // % de ocorrências resolvidas no prazo

  function tempo(min) {
    if (min < 60) return `${Math.round(min)} min`;
    if (min < 2880) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} dias`;
  }
  GC.tempoTexto = tempo;

  // ---- Prazo: conta desde que a ocorrência nasceu ----
  GC.idadeMin = (o) => (GC.agora() - o.criadaEm) / 60000;
  GC.prazoRestanteMin = (o) => o.prazoMin - GC.idadeMin(o);
  // Estourada = ainda sem equipe em campo e já passou do prazo (única regra usada no painel).
  GC.estourada = (o) => o.status === 'encaminhada' && GC.prazoRestanteMin(o) < 0;

  // Por que a ocorrência precisa do prefeito: prazo estourado, mais de uma secretaria, caso repetido.
  GC.motivosAtencao = function (o) {
    if (o.status === 'resolvida') return [];
    const motivos = [];
    // curto: rótulo visível dos motivos extras no cartão (o emoji sozinho não diz nada no toque).
    if (GC.estourada(o)) motivos.push({ tipo: 'prazo', texto: `⏰ Prazo estourado há ${tempo(-GC.prazoRestanteMin(o))}`, curto: '⏰ prazo estourado' });
    if ((o.areasEnvolvidas || []).length > 1) motivos.push({ tipo: 'conjunta', texto: `🤝 Envolve ${o.areasEnvolvidas.length} secretarias`, curto: `🤝 ${o.areasEnvolvidas.length} secretarias` });
    // O histórico é por secretaria e bairro, não por tipo de problema: o texto diz isso, para
    // "7º chamado" não ser lido como "a energia caiu 7 vezes aqui".
    const n = ((GC.data.historico30d || {})[o.area] || {})[o.bairroId] || 0;
    if ((o.severidade === 'critica' || o.severidade === 'alta') && n >= RECORRENTE_MIN) {
      const nomeArea = (GC.data.areas.find((a) => a.id === o.area) || { nome: 'da secretaria' }).nome;
      motivos.push({ tipo: 'recorrente', texto: `🔁 ${n + 1}º chamado de ${nomeArea} no bairro em 30 dias`, curto: '🔁 bairro recorrente' });
    }
    return motivos;
  };

  // Uma ação do prefeito por ocorrência: cobrar (estourada), gabinete (conjunta), priorizar (sempre).
  GC.acoesDisponiveis = function (o) {
    if (!o || o.status === 'resolvida' || o.acaoPrefeito) return [];
    const acoes = [];
    if (GC.estourada(o)) acoes.push('cobrar');
    if ((o.areasEnvolvidas || []).length > 1) acoes.push('gabinete');
    acoes.push('priorizar');
    return acoes;
  };

  // Situação em uma linha (cartões, gaveta, resumo do ponto no mapa).
  const ACAO_FEITA = { cobrar: '📣 Cobrada · equipe a caminho', priorizar: '⚡ Priorizada · equipe a caminho', gabinete: '🚨 Gabinete convocado' };
  const ACAO_CURTA = { cobrar: '📣 cobrada', priorizar: '⚡ priorizada', gabinete: '🚨 gabinete' };
  GC.situacao = function (o) {
    if (o.status === 'resolvida') return '✅ Resolvida';
    if (o.status === 'em_campo') return `🚧 Equipe em campo${o.acaoPrefeito ? ` · ${ACAO_CURTA[o.acaoPrefeito]}` : ''}`;
    if (o.acaoPrefeito) return ACAO_FEITA[o.acaoPrefeito];
    if (GC.estourada(o)) return `📡 Encaminhada há ${tempo(GC.idadeMin(o))} · prazo era ${tempo(o.prazoMin)} · sem equipe em campo`;
    return `📡 Encaminhada · faltam ${tempo(GC.prazoRestanteMin(o))}`;
  };

  // Botões das ações disponíveis; as telas delegam o clique por [data-acao].
  // compacto (cartões estreitos): só a ação principal leva texto, as outras só o ícone.
  const NOME_ACAO = { cobrar: 'Cobrar', priorizar: 'Priorizar', gabinete: 'Gabinete de crise' };
  const ICONE_ACAO = { cobrar: '📣', priorizar: '⚡', gabinete: '🚨' };
  // principal (listas): só a primeira ação, com verbo e destino ("Cobrar Limpeza Urbana"); as outras ficam no detalhe.
  const NOME_PRINCIPAL = { cobrar: (o) => `Cobrar ${(GC.data.areas.find((a) => a.id === o.area) || { nome: '' }).nome}`.trim(), priorizar: () => 'Priorizar', gabinete: () => 'Abrir gabinete' };
  GC.botoesAcao = function (o, { completo, compacto, principal } = {}) {
    if (principal) {
      const acao = GC.acoesDisponiveis(o)[0];
      return acao ? `<button type="button" class="btn-acao principal" data-acao="${acao}">${ICONE_ACAO[acao]} ${GC.escaparHtml ? GC.escaparHtml(NOME_PRINCIPAL[acao](o)) : NOME_PRINCIPAL[acao](o)}</button>` : '';
    }
    return GC.acoesDisponiveis(o).map((acao, i) => {
      const nome = acao === 'cobrar' && completo ? `Cobrar ${secretariaDe(o.area).nome}` : NOME_ACAO[acao];
      const classe = `btn-acao${i === 0 ? ' principal' : ''}`;
      if (compacto && i > 0) return `<button type="button" class="${classe}" data-acao="${acao}" title="${nome}" aria-label="${nome}">${ICONE_ACAO[acao]}</button>`;
      return `<button type="button" class="${classe}" data-acao="${acao}">${ICONE_ACAO[acao]} ${nome}</button>`;
    }).join('');
  };

  function secretariaDe(area) {
    const a = GC.data.areas.find((x) => x.id === area);
    return a ? a.secretaria : { nome: 'Secretaria', emoji: '🏛' };
  }

  function nomeBairro(id) {
    const b = GC.data.bairros.find((x) => x.id === id);
    return b ? b.nome : id;
  }

  // Fala simulada da secretaria integrada, por etapa do atendimento ou resposta ao prefeito.
  GC.textoSecretaria = function (ocorrencia, status, areaId) {
    const sec = secretariaDe(ocorrencia.area).nome;
    const bairro = nomeBairro(ocorrencia.bairroId);
    const eta = 8 + (parseInt(ocorrencia.id.replace(/\D/g, ''), 10) % 10);
    if (status === 'cobrada') return `${sec}: recebemos a cobrança sobre "${ocorrencia.titulo}" (${bairro}). Equipe sai agora, chegada estimada em ${eta} min.`;
    if (status === 'priorizada') return `${sec}: "${ocorrencia.titulo}" (${bairro}) passou para prioridade máxima. Equipe deslocada agora.`;
    if (status === 'gabinete') return `${secretariaDe(areaId).nome} confirmou presença no gabinete de crise sobre "${ocorrencia.titulo}" (${bairro}).`;
    if (status === 'em_campo') return `Equipe da ${sec} chegou ao local (${bairro}) e iniciou o atendimento.`;
    if (status === 'resolvida') return `${sec}: ocorrência resolvida no bairro ${bairro} — ${ocorrencia.titulo}. Área liberada.`;
    return `${sec} recebeu atualização sobre ${ocorrencia.titulo} (${bairro}).`;
  };

  // Toda ocorrência nasce encaminhada à secretaria, com responsável, prazo e linha do tempo.
  function preparar(ocorrencia) {
    const responsavel = ((GC.data.responsaveis || {})[ocorrencia.area] || [])[0] || 'Secretário(a) da pasta';
    const t = GC.agora() - (ocorrencia.abertaHaMin || 0) * 60000;
    const o = Object.assign({}, ocorrencia, {
      status: ocorrencia.status === 'em_campo' ? 'em_campo' : 'encaminhada',
      areasEnvolvidas: (ocorrencia.areasEnvolvidas || [ocorrencia.area]).slice(),
      responsavel,
      criadaEm: t,
      prazoMin: (GC.data.prazoMin || {})[ocorrencia.severidade] || 1440,
      acaoPrefeito: null,
      resolvidaEm: null,
      noPrazo: null,
    });
    o.linhaTempo = [
      { t, texto: 'Regra disparou automaticamente' },
      { t, texto: `Encaminhada à ${secretariaDe(o.area).nome} · responsável: ${responsavel}` },
    ];
    if (o.status === 'em_campo') o.linhaTempo.push({ t, texto: TEXTO_AVANCO.em_campo });
    return o;
  }

  GC.criarStore = function (data) {
    const lista = data.ocorrencias.map(preparar);
    const ouvintes = new Set();
    const base = data.indicadoresBase;
    const resolvidasDemo = []; // { o, atrasoMin, idadeMin } na ordem em que resolveram
    // Regras de monitoramento: as automáticas (GC.data.regras, uma por tipo) podem ser pausadas,
    // e então ocorrências novas daquele tipo ficam retidas até reativar. As criadas pelo Copiloto
    // são só registro (0 disparos, não entram em GC.alertas30d).
    const pausadas = new Set();
    const retidas = new Map(); // tipo → ocorrências que chegaram com a regra pausada
    const regrasCriadas = [];

    const emitir = (tipo, ocorrencia) => ouvintes.forEach((fn) => fn({ tipo, ocorrencia }));
    const buscar = (id) => lista.find((o) => o.id === id);
    // area: id, lista de ids ou nada (lista vazia = sem filtro).
    const casaArea = (area, o) => {
      if (Array.isArray(area)) return !area.length || area.includes(o.area);
      return !area || o.area === area;
    };
    // Recorte rápido pelos números da faixa (mesma regra das contagens de kpis).
    const RECORTES = {
      criticas: (o) => o.severidade === 'critica',
      estourado: (o) => GC.estourada(o),
      andamento: (o) => o.status === 'em_campo',
    };
    // bairro: id, lista de ids ou nada (lista vazia = cidade inteira).
    const bairrosDe = (bairro) => {
      if (Array.isArray(bairro)) return bairro.length ? bairro : null;
      return bairro ? [bairro] : null;
    };
    const casaBairro = (bairro, id) => { const bs = bairrosDe(bairro); return !bs || bs.includes(id); };
    // Soma (ou média) de um valor por bairro sobre os bairros escolhidos.
    const somaBairros = (porBairro, bs) => bs.reduce((s, id) => s + (porBairro[id] || 0), 0);
    const mediaBairros = (porBairro, bs) => {
      const v = bs.map((id) => porBairro[id]).filter((x) => typeof x === 'number');
      return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : undefined;
    };
    // Módulos contratados (js/gestao-config.js): secretaria fora do contrato some de ocorrências, alertas, pulso e ranking.
    const contratada = (id) => !GC.moduloAtivo || GC.moduloAtivo(id);
    const ativas = (area, bairro, recorte) => lista.filter((o) => o.status !== 'resolvida' && contratada(o.area) && casaArea(area, o) && casaBairro(bairro, o.bairroId)
      && (!RECORTES[recorte] || RECORTES[recorte](o)));
    const media = (valores) => Math.round(valores.reduce((s, n) => s + n, 0) / valores.length);

    // Indicador próprio que cada secretaria publica, para a cidade (bairro null) ou um bairro.
    function metrica(area, bairroOuLista) {
      const def = data.basesSecretarias[area];
      const bs = bairrosDe(bairroOuLista);
      let valor;
      if (area === 'saude') {
        const ubs = data.series.lotacaoUbs.filter((u) => casaBairro(bs, u.bairroId));
        valor = ubs.length ? media(ubs.map((u) => u.pct)) : null;
      } else if (area === 'educacao') {
        const f = data.series.frequenciaEscolar;
        valor = bs ? mediaBairros(f, bs) : media(Object.values(f));
      } else {
        const h = data.historico30d[area];
        valor = bs ? somaBairros(h, bs) : Object.values(h).reduce((s, n) => s + n, 0);
      }
      return { rotulo: area === 'saude' && !bs ? 'Lotação média das UBS' : def.metrica, valor, unidade: def.unidade || '' };
    }

    const soma = (valores) => valores.reduce((s, n) => s + n, 0);
    const umaCasa = (n) => Math.round(n * 10) / 10;
    const nomeArea = (id) => data.areas.find((a) => a.id === id).nome;
    // Média ponderada pelas resolvidas; sem resolvidas (bairro sem histórico), média simples.
    const pesoMedio = (lista, campo, arredondar) => {
      const n = soma(lista.map((x) => x.resolvidas));
      return arredondar(n ? soma(lista.map((x) => x.resolvidas * x[campo])) / n : soma(lista.map((x) => x[campo])) / lista.length);
    };

    // Balanço de 30 dias: dados do mês + o que foi resolvido durante a demo.
    // Com bairro, as resolvidas são proporcionais ao histórico do bairro; % e tempo ficam os da cidade.
    // Com secretarias filtradas, resumo, frases e recentes são só delas; o ranking continua com
    // todas (noFiltro marca as escolhidas), para clicar numa linha não esvaziar a tabela.
    function desempenho(bairroOuLista, areas) {
      const bairro = bairrosDe(bairroOuLista); // null = cidade inteira
      const noFiltro = (id) => !areas || !areas.length || areas.includes(id);
      const demo = resolvidasDemo.filter((r) => casaBairro(bairro, r.o.bairroId) && noFiltro(r.o.area));
      const estouradasAgora = ativas(areas, bairro).filter(GC.estourada);
      const abertasPorArea = ativas(null, bairro);
      const atrasadasPorArea = abertasPorArea.filter(GC.estourada);
      const secretarias = data.areas.filter((a) => contratada(a.id)).map((a) => {
        const d = data.desempenho30d[a.id];
        const hist = data.historico30d[a.id] || {};
        const total = soma(Object.values(hist));
        const base = bairro ? (total ? Math.round((d.resolvidas * somaBairros(hist, bairro)) / total) : 0) : d.resolvidas;
        const daDemo = resolvidasDemo.filter((r) => casaBairro(bairro, r.o.bairroId) && r.o.area === a.id);
        const resolvidas = base + daDemo.length;
        const noPrazo = (d.resolvidas * d.noPrazoPct) / 100 + daDemo.filter((r) => r.o.noPrazo).length;
        const horas = d.resolvidas * d.tempoMedioH + soma(daDemo.map((r) => r.idadeMin / 60));
        const n = d.resolvidas + daDemo.length;
        return {
          area: a.id,
          resolvidas,
          noPrazoPct: Math.round((noPrazo / n) * 100),
          tempoMedioH: umaCasa(horas / n),
          atrasadas: atrasadasPorArea.filter((o) => o.area === a.id).length,
          abertas: abertasPorArea.filter((o) => o.area === a.id).length,
          metaPrazoPct: META_PRAZO,
          pior: false,
          noFiltro: noFiltro(a.id),
          _noPrazo: noPrazo,
          _horas: horas,
          _n: n,
        };
      }).sort((x, y) => x.noPrazoPct - y.noPrazoPct);
      const escolhidas = secretarias.filter((s) => s.noFiltro);
      const pior = escolhidas[0];
      if (pior.noPrazoPct < META_PRAZO) pior.pior = true;

      // Mês anterior na mesma escala: com bairro, a mesma proporção do histórico do bairro.
      // % no prazo e tempo médio continuam os da cidade (pesos da cidade), como os do mês atual.
      const antCidade = data.areas.filter((a) => noFiltro(a.id)).map((a) => data.desempenho30d[a.id].anterior);
      const ant = data.areas.filter((a) => noFiltro(a.id)).map((a) => {
        const x = data.desempenho30d[a.id].anterior;
        if (!bairro) return x;
        const hist = data.historico30d[a.id] || {};
        const total = soma(Object.values(hist));
        return Object.assign({}, x, { resolvidas: total ? Math.round((x.resolvidas * somaBairros(hist, bairro)) / total) : 0 });
      });
      const nTotal = soma(escolhidas.map((s) => s._n));
      const resumo = {
        resolvidas: soma(escolhidas.map((s) => s.resolvidas)),
        resolvidasAnt: soma(ant.map((x) => x.resolvidas)),
        noPrazoPct: Math.round((soma(escolhidas.map((s) => s._noPrazo)) / nTotal) * 100),
        noPrazoPctAnt: pesoMedio(antCidade, 'noPrazoPct', Math.round),
        tempoMedioH: umaCasa(soma(escolhidas.map((s) => s._horas)) / nTotal),
        tempoMedioHAnt: pesoMedio(antCidade, 'tempoMedioH', umaCasa),
      };
      secretarias.forEach((s) => { delete s._noPrazo; delete s._horas; delete s._n; });

      const plural = (n) => (n === 1 ? '1 prazo estourado' : `${n} prazos estourados`);
      // Cada frase leva para onde agir: { area } filtra a secretaria, { bairro } escolhe o bairro.
      const frases = [];
      const ruim = { push: (texto, acao = null) => frases.push({ texto, acao }) };
      if (!bairro) {
        if (pior.pior) ruim.push(`${nomeArea(pior.area)}: só ${pior.noPrazoPct}% no prazo (meta ${META_PRAZO}%)`, { area: pior.area });
        // Bairro com mais prazos estourados; empate vai para o mais atrasado.
        const porBairro = {};
        estouradasAgora.forEach((o) => {
          const b = porBairro[o.bairroId] || (porBairro[o.bairroId] = { n: 0, atraso: 0 });
          b.n++;
          b.atraso += -GC.prazoRestanteMin(o);
        });
        const piorBairro = Object.entries(porBairro).sort((x, y) => y[1].n - x[1].n || y[1].atraso - x[1].atraso)[0];
        if (piorBairro) ruim.push(`${nomeBairro(piorBairro[0])}: ${plural(piorBairro[1].n)} agora`, { bairro: piorBairro[0] });
        const t = data.tendencias.filter((x) => !x.positivo && noFiltro(x.area)).sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao))[0];
        if (t) ruim.push(`${t.rotulo}: ${t.valor}`, { area: t.area });
      } else {
        const noBairro = bairro.length === 1 ? 'no bairro' : `nos ${bairro.length} bairros`;
        if (estouradasAgora.length) ruim.push(`${plural(estouradasAgora.length)} agora ${noBairro}`);
        const casos = data.areas.filter((a) => noFiltro(a.id)).map((a) => ({ id: a.id, n: somaBairros(data.historico30d[a.id] || {}, bairro) })).sort((x, y) => y.n - x.n)[0];
        if (casos.n) ruim.push(`${nomeArea(casos.id)}: ${casos.n} casos ${noBairro} em 30 dias`, { area: casos.id });
        const sat = mediaBairros(data.satisfacaoPorBairro, bairro);
        if (sat !== undefined && sat < base.satisfacaoPct) ruim.push(`Satisfação de ${sat}% (cidade: ${base.satisfacaoPct}%)`);
      }

      const recentes = [
        ...demo.slice().reverse().map((r) => ({
          id: r.o.id, titulo: r.o.titulo, area: r.o.area, bairroId: r.o.bairroId,
          haMin: Math.round((GC.agora() - r.o.resolvidaEm) / 60000), atrasoMin: r.atrasoMin, lat: r.o.lat, lng: r.o.lng,
        })),
        ...(data.resolvidasRecentes || []).filter((r) => casaBairro(bairro, r.bairroId) && noFiltro(r.area)).map((r) => Object.assign({ id: null }, r)),
      ].slice(0, 5);

      const tres = frases.slice(0, 3);
      return { resumo, ruim: tres.map((x) => x.texto), ruimAcoes: tres.map((x) => x.acao), secretarias, recentes, escopoCidade: !!bairro };
    }

    // ---- Secretarias: status, cartões de pulso e página de cada uma ----
    const noPrazoDe = (area) => (desempenho(null).secretarias.find((s) => s.area === area) || { noPrazoPct: 100 }).noPrazoPct;

    // Crítico: prazo estourado agora ou abaixo de 70% no prazo. Atenção: abaixo da meta ou meta crítica.
    function statusSecretaria(area) {
      const pct = noPrazoDe(area);
      if (ativas(area).some(GC.estourada) || pct < 70) return 'critico';
      const metas = ((data.secretarias || {})[area] || {}).metas || [];
      if (pct < META_PRAZO || metas.some((m) => m.status === 'critico')) return 'atencao';
      return 'em_dia';
    }

    function formatarNivel(valor, unidade) {
      if (unidade === 'min') return `${valor} min`;
      if (unidade === '%') return `${valor}%`;
      return valor.toLocaleString('pt-BR');
    }

    function pulsoDe(area) {
      const s = data.secretarias[area];
      const t = data.tendencias.find((x) => x.area === area && x.rotulo === s.tendencia);
      return {
        area,
        rotulo: s.pulsoRotulo,
        nivel: formatarNivel(s.serie.meses[11], s.serie.unidade),
        // Em indicadores de %, a variação é em pontos percentuais (tendencias guarda o nível em valor).
        variacao: `${t.variacao > 0 ? '+' : ''}${t.variacao}${s.serie.unidade === '%' ? ' p.p.' : '%'}`,
        periodo: /trimestre/i.test(t.rotulo) ? 'no trimestre' : 'no mês',
        positivo: t.positivo,
        fonte: s.fonte,
        status: statusSecretaria(area),
      };
    }

    // Com bairro, o cartão mostra o indicador da secretaria no bairro (30 dias) contra a referência:
    // em % a média da cidade; em contagens, a média por bairro (na mesma quantidade de bairros).
    const ROTULO_BAIRRO = {
      infraestrutura: 'Casos de energia/obras', defesa_civil: 'Alagamentos e riscos', saude: 'Lotação das UBS',
      educacao: 'Frequência escolar', seguranca: 'Casos de segurança', mobilidade: 'Casos de trânsito', limpeza: 'Atrasos de coleta',
    };
    function pulsoNoBairro(area, bs) {
      const p = pulsoDe(area);
      const noBairro = metrica(area, bs);
      const cidade = metrica(area, null);
      const unidade = noBairro.unidade;
      const emPct = unidade === '%';
      const ref = emPct ? cidade.valor : Math.round((cidade.valor * bs.length) / data.bairros.length);
      const base = Object.assign({}, p, { rotulo: ROTULO_BAIRRO[area] || p.rotulo, periodo: '', escopo: 'bairro' });
      if (typeof noBairro.valor !== 'number') return Object.assign(base, { nivel: '—', variacao: 'sem dado no bairro', positivo: true, neutro: true });
      const maisEhMelhor = area === 'educacao';
      const v = noBairro.valor;
      return Object.assign(base, {
        nivel: formatarNivel(v, unidade),
        variacao: `${emPct ? 'cidade' : 'média'} ${formatarNivel(ref, unidade)}`,
        positivo: maisEhMelhor ? v >= ref : v <= ref,
      });
    }

    function pulsos(bairroOuLista) {
      const bs = bairrosDe(bairroOuLista);
      return data.areas.filter((a) => contratada(a.id)).map((a) => (bs ? pulsoNoBairro(a.id, bs) : pulsoDe(a.id)));
    }

    // Onde uma secretaria mais trabalha: bairros com mais casos em 30 dias e o que está aberto agora.
    function bairrosDaSecretaria(area, limite = 5) {
      const hist = data.historico30d[area] || {};
      return data.bairros.map((b) => ({ bairroId: b.id, nome: b.nome, casos: hist[b.id] || 0, abertas: ativas(area, b.id).length }))
        .filter((x) => x.casos || x.abertas)
        .sort((x, y) => y.casos - x.casos || y.abertas - x.abertas)
        .slice(0, limite);
    }

    // Tudo o que a página de uma secretaria mostra; área inválida devolve null.
    function paginaSecretaria(area) {
      const a = data.areas.find((x) => x.id === area);
      const s = (data.secretarias || {})[area];
      if (!a || !s) return null;
      const pct = noPrazoDe(area);
      const alertas = ativas(area).slice().sort((x, y) =>
        (GC.motivosAtencao(y).length > 0) - (GC.motivosAtencao(x).length > 0)
        || PESO[x.severidade] - PESO[y.severidade]
        || GC.idadeMin(y) - GC.idadeMin(x));
      return {
        area,
        secretaria: a.secretaria,
        titular: s.titular,
        orcamento: s.orcamento,
        status: statusSecretaria(area),
        base: { fonte: `Base da ${a.secretaria.nome}`, atualizadoHaMin: data.basesSecretarias[area].atualizadoHaMin },
        pulso: pulsoDe(area),
        indicadores: [...s.indicadores, { rotulo: '% no prazo (30 dias)', valor: `${pct}%`, variacao: `meta ${META_PRAZO}%`, bom: pct >= META_PRAZO }],
        serie: s.serie,
        meses: data.mesesSerie,
        metas: s.metas,
        unidades: s.unidades,
        alertas,
      };
    }

    return {
      buscar,
      desempenho,
      statusSecretaria,
      pulsos,
      bairrosDaSecretaria,
      paginaSecretaria,
      ocorrencias: ativas,

      // Ação do prefeito numa exceção: cobrar, priorizar ou gabinete de crise (uma por ocorrência).
      agir(id, tipo) {
        const o = buscar(id);
        if (!o || !GC.acoesDisponiveis(o).includes(tipo)) return false;
        o.acaoPrefeito = tipo;
        o.acaoEm = GC.agora();
        let texto;
        if (tipo === 'cobrar') texto = `📣 Prefeito cobrou a ${secretariaDe(o.area).nome}`;
        else if (tipo === 'priorizar') {
          // O tempo que ainda falta cai pela metade (cortar o prazo inteiro faria estourar na hora).
          o.prazoMin = Math.round(GC.idadeMin(o) + Math.max(0, GC.prazoRestanteMin(o)) / 2);
          texto = '⚡ Prefeito priorizou';
        } else texto = `🚨 Gabinete de crise: ${o.areasEnvolvidas.map((a) => secretariaDe(a).nome).join(' + ')}`;
        o.linhaTempo.push({ t: GC.agora(), texto });
        emitir('acao', o);
        return true;
      },

      avancar(id) {
        const o = buscar(id);
        if (!o || o.status === 'resolvida') return false;
        o.status = GC.STATUS[GC.STATUS.indexOf(o.status) + 1];
        if (o.status === 'resolvida') {
          const restante = GC.prazoRestanteMin(o);
          o.resolvidaEm = GC.agora();
          o.noPrazo = restante >= 0;
          resolvidasDemo.push({ o, atrasoMin: Math.max(0, Math.round(-restante)), idadeMin: GC.idadeMin(o) });
        }
        o.linhaTempo.push({ t: GC.agora(), texto: TEXTO_AVANCO[o.status] });
        emitir('status', o);
        return true;
      },

      // A cidade anda sozinha: avança a ocorrência comum mais antiga (nunca uma exceção
      // nem uma que o prefeito já tocou) e para quando restam poucas ativas.
      passoAutomatico() {
        const at = ativas();
        if (at.length <= MAX_AUTOMATICO) return null;
        const alvo = at
          .filter((o) => !o.acaoPrefeito && !GC.motivosAtencao(o).length)
          .sort((a, b) => GC.idadeMin(b) - GC.idadeMin(a))[0];
        if (!alvo) return null;
        this.avancar(alvo.id);
        return alvo.id;
      },

      // Devolve false quando a regra do tipo está pausada: a ocorrência fica retida, sem evento.
      adicionar(ocorrencia) {
        if (pausadas.has(ocorrencia.tipo)) {
          if (!retidas.has(ocorrencia.tipo)) retidas.set(ocorrencia.tipo, []);
          retidas.get(ocorrencia.tipo).push(ocorrencia);
          return false;
        }
        const o = preparar(Object.assign({}, ocorrencia, { status: 'encaminhada' }));
        lista.push(o);
        emitir('nova', o);
        return true;
      },

      todas: () => lista.slice(),

      regras() {
        const automaticas = Object.entries(data.regras || {}).map(([tipo, r]) => ({
          id: tipo,
          nome: tipo.charAt(0).toUpperCase() + tipo.slice(1),
          expressao: r.expressao,
          fontes: r.fontes,
          disparos30d: r.disparos30d,
          area: GC.areaDoTipo ? GC.areaDoTipo(tipo) : null,
          origem: 'automatica',
          ativa: !pausadas.has(tipo),
          retidas: (retidas.get(tipo) || []).length,
          nova: false,
        }));
        return [...automaticas, ...regrasCriadas.map((r) => Object.assign({}, r, { ativa: !pausadas.has(r.id), retidas: 0 }))];
      },

      // Pausa/reativa; ao reativar uma automática, as retidas entram na ordem em que chegaram.
      alternarRegra(id) {
        const existe = (data.regras || {})[id] || regrasCriadas.some((r) => r.id === id);
        if (!existe) return false;
        if (pausadas.has(id)) {
          pausadas.delete(id);
          emitir('regra', null);
          const fila = retidas.get(id) || [];
          retidas.delete(id);
          fila.forEach((oc) => this.adicionar(oc));
        } else {
          pausadas.add(id);
          emitir('regra', null);
        }
        return true;
      },

      criarRegra({ nome, expressao, fontes, area }) {
        const igual = regrasCriadas.find((r) => r.nome === nome);
        if (igual) return { id: igual.id, criada: false };
        const r = { id: `copiloto-${regrasCriadas.length + 1}`, nome, expressao, fontes: fontes.slice(), disparos30d: 0, area, origem: 'copiloto', nova: true };
        regrasCriadas.push(r);
        emitir('regra', null);
        return { id: r.id, criada: true };
      },

      // "Precisam da sua atenção": só exceções. Ordem: o que o prefeito ainda não tocou primeiro;
      // depois a gravidade (UTI lotada antes de lixo atrasado, mesmo que o lixo esteja mais atrasado),
      // o motivo (prazo, conjunta, recorrente), o mais estourado e a mais antiga.
      atencao(areas, bairro, recorte) {
        const todas = ativas(areas, bairro, recorte)
          .map((o) => ({ o, m: GC.motivosAtencao(o) }))
          .filter((x) => x.m.length)
          .sort((a, b) => (!!a.o.acaoPrefeito - !!b.o.acaoPrefeito)
            || PESO[a.o.severidade] - PESO[b.o.severidade]
            || ORDEM_MOTIVO[a.m[0].tipo] - ORDEM_MOTIVO[b.m[0].tipo]
            || (a.m[0].tipo === 'prazo' ? GC.prazoRestanteMin(a.o) - GC.prazoRestanteMin(b.o) : 0)
            || GC.idadeMin(b.o) - GC.idadeMin(a.o))
          .map((x) => x.o);
        return { cartoes: todas.slice(0, 3), todas };
      },

      kpis(area, bairro) {
        const at = ativas(area, bairro);
        return {
          criticas: at.filter((o) => o.severidade === 'critica').length,
          estouradas: at.filter(GC.estourada).length,
          emAndamento: at.filter((o) => o.status === 'em_campo').length,
          satisfacaoPct: bairrosDe(bairro) ? mediaBairros(data.satisfacaoPorBairro, bairrosDe(bairro)) : base.satisfacaoPct,
          noPrazoPct: desempenho(bairro).resumo.noPrazoPct,
          tempoMedioH: desempenho(bairro).resumo.tempoMedioH,
        };
      },

      // Um bloco por secretaria: ocorrências ativas dela + indicador da base dela.
      porSecretaria(bairro, areas) {
        return data.areas.filter((a) => contratada(a.id) && (!areas || !areas.length || areas.includes(a.id))).map((a) => {
          const at = ativas(a.id, bairro);
          return {
            area: a.id,
            secretaria: a.secretaria,
            ativas: at.length,
            criticas: at.filter((o) => o.severidade === 'critica').length,
            metrica: metrica(a.id, bairro),
            fonte: `Base da ${a.secretaria.nome}`,
            atualizadoHaMin: data.basesSecretarias[a.id].atualizadoHaMin,
          };
        });
      },

      assinar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
      },
    };
  };
})(window.GC = window.GC || {});
