(function (GC) {
  // Montagem dos relatórios (executivo, secretaria, bairro, alertas): função pura sobre o store,
  // para a tela, o CSV e o PDF mostrarem exatamente os mesmos números.
  // Taxas e tempos = últimos 30 dias (store.desempenho). Contagens seguem o período pela curva
  // mensal de alertas (GC.alertasPorMes), cujo último mês é o total de 30 dias.
  const META = 85;
  const NADA = 'Nada a listar';
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const STATUS = { em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const STATUS_META = { concluida: 'Concluída', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const SITUACAO = { ok: 'Normal', atencao: 'Atenção', critica: 'Crítica' };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const num = (n) => n.toLocaleString('pt-BR');
  const mi = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  const horas = (h) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  const soma = (lista) => lista.reduce((s, n) => s + n, 0);

  function valorSerie(v, unidade) {
    if (unidade === 'min') return `${v} min`;
    if (unidade === '%') return `${v}%`;
    return num(v);
  }
  // Mês i da série (0 = nov/2025 ... 11 = out/2026).
  const rotuloMes = (i) => `${GC.data.mesesSerie[i]}/${i < 2 ? 2025 : 2026}`;

  // ---- período ----
  // Códigos: '7' e '30' (dias até agora), '90' e '12m' (meses fechados da série) e 'm<de>-<ate>',
  // um intervalo de meses escolhido (índices da série: 0 = nov/2025 ... 11 = out/2026).
  GC.periodoInfo = function (p) {
    if (p === '7' || p === '30') return { dias: Number(p) };
    if (p === '90') return { de: 9, ate: 11 };
    if (p === '12m') return { de: 0, ate: 11 };
    const m = /^m(\d{1,2})-(\d{1,2})$/.exec(String(p));
    if (m && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 11) return { de: Number(m[1]), ate: Number(m[2]) };
    return null;
  };
  GC.rotuloMesSerie = rotuloMes; // (GC.rotuloMes é o do calendário, em linha-tempo.js)
  const info = (p) => GC.periodoInfo(p) || { dias: 30 };
  const emMeses = (p) => info(p).de !== undefined;
  function periodoDe(p) {
    const i = info(p);
    if (i.de !== undefined) {
      return { rotulo: i.de === i.ate ? rotuloMes(i.de) : `${rotuloMes(i.de)} a ${rotuloMes(i.ate)}`, de: rotuloMes(i.de), ate: rotuloMes(i.ate) };
    }
    const data = (t) => new Date(t).toLocaleDateString('pt-BR');
    const ate = GC.agora();
    const de = ate - i.dias * 86400000;
    return { rotulo: `${data(de)} a ${data(ate)} (${i.dias} dias)`, de: data(de), ate: data(ate) };
  }

  // Quantas vezes o total de 30 dias cabe no período (pela curva mensal de alertas).
  function fator(p) {
    const i = info(p);
    if (i.de === undefined) return i.dias / 30;
    const m = GC.alertasPorMes();
    return soma(m.slice(i.de, i.ate + 1)) / m[11];
  }

  // Nomes legíveis das fontes (na tela e no PDF); o CSV leva o nome e o código técnico.
  const FONTES = {
    'gabinete.orcamento_2026': 'Orçamento 2026 (Gabinete)',
    'gestao.ocorrencias': 'Registro de ocorrências',
    'gestao.prazos_sla': 'Prazos de atendimento',
    'ouvidoria.pesquisa_satisfacao': 'Pesquisa de satisfação (Ouvidoria)',
    'planejamento.metas_governo': 'Metas do plano de governo',
    'planejamento.bairros': 'Cadastro de bairros',
    'monitoramento.regras': 'Regras de alerta',
    'monitoramento.alertas': 'Histórico de alertas',
  };
  GC.nomeFonte = (f) => FONTES[f] || f;
  const regraTexto = (r) => (GC.regraEmPalavras ? GC.regraEmPalavras(r) : r.expressao);
  const sufixo30 = (p) => (p === '30' ? '' : ' (30 dias)');
  // Contagens fora dos 30 dias são projeções, não registros: o valor leva "≈" e a nota diz como foi feita.
  const aprox = (p, n) => (p === '30' ? num(n) : `≈ ${num(n)}`);
  const notaEstimativa = (p) => (p === '30' ? null : p === '7' ? 'estimativa: 7/30 do total de 30 dias' : 'estimativa: ritmo de 30 dias × curva mensal de alertas');

  function tabela(titulo, colunas, linhas) {
    return linhas.length ? { titulo, tipo: 'tabela', colunas, linhas } : { titulo, tipo: 'tabela', colunas, linhas, vazio: NADA };
  }

  // ---- recomendações (executivo) ----
  // Cada recomendação: texto completo (PDF/CSV), texto curto + etiqueta com o número (tela).
  GC.recomendacoesDetalhadas = function (store) {
    const rec = [];
    store.ocorrencias(null, null, 'estourado')
      .sort((a, b) => GC.prazoRestanteMin(a) - GC.prazoRestanteMin(b))
      .forEach((o) => {
        const curto = `Cobrar a ${area(o.area).secretaria.nome} sobre ${o.titulo}`;
        const etiqueta = `estourado há ${GC.tempoTexto(-GC.prazoRestanteMin(o))}`;
        rec.push({ texto: `${curto} (${etiqueta})`, curto, etiqueta, tom: 'crit', link: { tipo: 'ocorrencia', id: o.id } });
      });
    store.desempenho(null).secretarias.filter((s) => s.noPrazoPct < META).forEach((s) => {
      const curto = `Pedir plano de ação à ${area(s.area).secretaria.nome}`;
      rec.push({ texto: `${curto}: ${s.noPrazoPct}% no prazo (meta ${META}%)`, curto, etiqueta: `${s.noPrazoPct}% no prazo`, tom: 'at', link: { tipo: 'secretaria', id: s.area } });
    });
    GC.data.areas.forEach((a) => ((GC.data.secretarias[a.id] || {}).metas || []).filter((m) => m.status === 'critico').forEach((m) => {
      rec.push({ texto: `Destravar a meta "${m.titulo}" (${a.secretaria.nome}, ${m.progressoPct}%, prazo ${m.prazo})`, curto: `Destravar a meta "${m.titulo}" (${a.nome})`, etiqueta: `${m.progressoPct}% · ${m.prazo}`, tom: 'at', link: { tipo: 'secretaria', id: a.id } });
    }));
    store.ocorrencias().filter((o) => o.areasEnvolvidas.length > 1 && o.acaoPrefeito !== 'gabinete').forEach((o) => {
      const secs = o.areasEnvolvidas.map((x) => area(x).secretaria.nome);
      rec.push({ texto: `Convocar gabinete de crise para ${o.titulo} (${secs.join(' + ')})`, curto: `Convocar gabinete de crise para ${o.titulo}`, etiqueta: `${secs.length} secretarias`, tom: 'at', link: { tipo: 'ocorrencia', id: o.id } });
    });
    return rec.slice(0, 5);
  };
  GC.recomendacoes = (store) => GC.recomendacoesDetalhadas(store).map((r) => r.texto);

  // ---- painel da tela: 4 números, lista à esquerda, barras à direita ----
  const lista = (titulo, itens) => (itens.length ? { titulo, itens } : { titulo, itens, vazio: NADA });
  const barras = (titulo, itens, extra) => Object.assign(itens.length ? { titulo, barras: itens } : { titulo, barras: itens, vazio: NADA }, extra || {});
  const pct = (v, max) => (max ? Math.max(0, Math.min(100, Math.round((v / max) * 100))) : 0);
  const variacaoTexto = (atual, anterior, sufixo) => {
    const d = atual - anterior;
    if (!anterior || Math.abs(d) < 0.5) return '= mês anterior';
    return `${d > 0 ? '▲' : '▼'} ${sufixo === 'p.p.' ? `${Math.abs(Math.round(d))} p.p.` : `${Math.round(Math.abs(d / anterior) * 100)}%`} vs mês anterior`;
  };
  // Tendência com cor própria (nos indicadores onde é usada, subir é bom), separada da cor da meta:
  // "▼ 2 p.p." nunca sai verde só porque o valor ainda está na meta.
  const tendencia = (atual, anterior, sufixo) => {
    const d = atual - anterior;
    return { texto: variacaoTexto(atual, anterior, sufixo), tom: !anterior || Math.abs(d) < 0.5 ? '' : d > 0 ? 'ok' : 'ruim' };
  };
  // Texto ao lado do % no prazo: diz se está na meta, em vez de só repetir o número dela.
  const metaTexto = (v) => (v >= META ? `na meta (${META}%)` : `abaixo da meta de ${META}%`);
  // Indicadores em % (frequência, coleta no prazo) melhoram subindo; tempos e contagens, descendo.
  // A série pode dizer o contrário com melhor: 'maior' | 'menor'.
  const menorMelhor = (serie) => (serie.melhor ? serie.melhor === 'menor' : serie.unidade !== '%');

  // ---- executivo ----
  function executivo(store, p) {
    const d = store.desempenho(null);
    const sec = GC.data.secretarias;
    const dotacao = soma(GC.data.areas.map((a) => sec[a.id].orcamento.dotacaoMi));
    const executado = Math.round(soma(GC.data.areas.map((a) => sec[a.id].orcamento.dotacaoMi * sec[a.id].orcamento.executadoPct)) / dotacao);
    const resolvidas = Math.round(d.resumo.resolvidas * fator(p));
    const atencao = store.atencao().todas;
    const pulsos = store.pulsos();
    const pior = d.secretarias.find((s) => s.pior);
    return {
      titulo: 'Relatório executivo do Gabinete',
      subtitulo: `Situação consolidada das ${GC.data.areas.length} secretarias`,
      kpis: [
        { rotulo: 'Orçamento 2026', valor: mi(dotacao) },
        { rotulo: 'Executado', valor: `${executado}%`, noCartao: true },
        Object.assign({ rotulo: 'Resolvidas no período', valor: aprox(p, resolvidas), noCartao: true }, notaEstimativa(p) ? { detalhe: notaEstimativa(p) } : {}),
        { rotulo: `No prazo${sufixo30(p)}`, valor: `${d.resumo.noPrazoPct}%`, detalhe: `meta ${META}%`, noCartao: true },
        { rotulo: 'Precisam de atenção agora', valor: num(atencao.length), noCartao: true },
        { rotulo: 'Satisfação', valor: `${GC.data.indicadoresBase.satisfacaoPct}%` },
      ],
      topicos: [
        `No período, a cidade resolveu ${p === '30' ? num(resolvidas) : `cerca de ${num(resolvidas)} (${notaEstimativa(p)})`} ocorrências.`,
        `${d.resumo.noPrazoPct}% das ocorrências resolvidas nos últimos 30 dias ficaram no prazo (meta ${META}%).`,
        `${atencao.length} situações precisam da atenção do prefeito agora${pior ? `, e a ${area(pior.area).secretaria.nome} é a mais atrasada (${pior.noPrazoPct}% no prazo)` : ''}.`,
        `O orçamento das secretarias soma ${mi(dotacao)}, com ${executado}% executado.`,
      ],
      secoes: [
        tabela('Painel das secretarias', ['Secretaria', 'Orçamento', 'Executado', `No prazo (30 dias)`, 'Status', 'Indicador principal'],
          GC.data.areas.map((a) => {
            const pu = pulsos.find((x) => x.area === a.id);
            const s = d.secretarias.find((x) => x.area === a.id);
            return [a.secretaria.nome, mi(sec[a.id].orcamento.dotacaoMi), `${sec[a.id].orcamento.executadoPct}%`, `${s.noPrazoPct}%`, STATUS[pu.status], `${pu.rotulo}: ${pu.nivel} (${pu.variacao} ${pu.periodo})`];
          })),
        { titulo: 'Execução orçamentária', tipo: 'barras', itens: GC.data.areas.map((a) => ({ rotulo: a.secretaria.nome, valor: sec[a.id].orcamento.executadoPct, texto: `${sec[a.id].orcamento.executadoPct}% de ${mi(sec[a.id].orcamento.dotacaoMi)}` })) },
        tabela('Precisam da sua atenção agora', ['Ocorrência', 'Bairro', 'Motivo', 'Situação'],
          atencao.map((o) => [o.titulo, bairro(o.bairroId).nome, GC.motivosAtencao(o).map((m) => m.texto).join(' · '), GC.situacao(o)])),
        // Na tela já aparece como "O que fazer agora": fica só no PDF e no CSV.
        Object.assign({ titulo: 'Recomendações', tipo: 'lista', soDocumento: true }, (() => { const itens = GC.recomendacoes(store); return itens.length ? { itens } : { itens, vazio: NADA }; })()),
      ],
      fontes: ['gabinete.orcamento_2026', 'gestao.ocorrencias', 'gestao.prazos_sla', 'ouvidoria.pesquisa_satisfacao'],
      painel: {
        kpis: [
          Object.assign({ rotulo: 'Resolvidas', valor: aprox(p, resolvidas) }, p === '30' ? { tendencia: tendencia(d.resumo.resolvidas, d.resumo.resolvidasAnt) } : { detalhe: notaEstimativa(p) }),
          // Duas leituras, duas cores: a tendência (vs mês anterior) e a situação frente à meta.
          { rotulo: `No prazo${sufixo30(p)}`, valor: `${d.resumo.noPrazoPct}%`, tendencia: tendencia(d.resumo.noPrazoPct, d.resumo.noPrazoPctAnt, 'p.p.'), detalhe: metaTexto(d.resumo.noPrazoPct), tom: d.resumo.noPrazoPct >= META ? 'ok' : 'ruim' },
          { rotulo: 'Precisam de atenção', valor: num(atencao.length), detalhe: `${store.kpis().estouradas} com prazo estourado`, tom: store.kpis().estouradas ? 'ruim' : 'ok' },
          { rotulo: 'Orçamento executado', valor: `${executado}%`, detalhe: `de ${mi(dotacao)}` },
        ],
        esquerda: lista('O que fazer agora', GC.recomendacoesDetalhadas(store).map((r) => ({ texto: r.curto, etiqueta: r.etiqueta, tom: r.tom, link: r.link }))),
        direita: barras('Secretarias · % no prazo', d.secretarias.map((s) => {
          const pu = pulsos.find((x) => x.area === s.area);
          // Sem a etiqueta do indicador-chave: ao lado do % no prazo ela parecia contradizê-lo
          // ("92% · Crítico"). O indicador-chave segue na tabela "Painel das secretarias" e na página da secretaria.
          return { rotulo: area(s.area).nome, valor: s.noPrazoPct, texto: `${s.noPrazoPct}%`, tom: s.noPrazoPct < META ? 'ruim' : '', link: { tipo: 'secretaria', id: s.area },
            dica: `${pu.rotulo}: ${pu.nivel} (${STATUS[pu.status]})` };
        }), { meta: META, nota: `linha verde = meta ${META}%`, legenda: 'Barra: % das ocorrências resolvidas no prazo nos últimos 30 dias (vermelha abaixo da meta). Clique numa secretaria para ver o detalhe.' }),
      },
    };
  }

  // ---- secretaria ----
  function secretaria(store, p, id) {
    const pg = store.paginaSecretaria(id);
    const s = store.desempenho(null).secretarias.find((x) => x.area === id);
    const serie = pg.serie;
    // Meses do período: em dias, os 2 últimos meses (a série é mensal); em meses, o intervalo escolhido.
    const pi = info(p);
    const inicio = pi.de !== undefined ? pi.de : 10;
    const fim = pi.de !== undefined ? pi.ate : 11;
    const criticas = pg.metas.filter((m) => m.status === 'critico');
    // Pasta sem unidades (ou com unidades sem métricas): a tabela sai só com nome, bairro e situação.
    const colunasUnid = ['Unidade', 'Bairro', ...((pg.unidades[0] || {}).metricas || []).map((m) => m.rotulo), 'Situação'];
    return {
      titulo: `Relatório da ${pg.secretaria.nome}`,
      subtitulo: 'Indicadores, evolução, metas, unidades e alertas da pasta',
      kpis: [
        { rotulo: 'Orçamento 2026', valor: mi(pg.orcamento.dotacaoMi) },
        { rotulo: 'Executado', valor: `${pg.orcamento.executadoPct}%`, noCartao: true },
        { rotulo: `No prazo${sufixo30(p)}`, valor: `${s.noPrazoPct}%`, detalhe: `meta ${META}%`, noCartao: true },
        { rotulo: `Tempo médio${sufixo30(p)}`, valor: horas(s.tempoMedioH) },
        { rotulo: 'Alertas ativos', valor: num(pg.alertas.length), noCartao: true },
        { rotulo: 'Status', valor: STATUS[pg.status] },
      ],
      topicos: [
        `${pg.pulso.rotulo}: ${pg.pulso.nivel} (${pg.pulso.variacao} ${pg.pulso.periodo}), com meta de ${valorSerie(serie.meta, serie.unidade)}.`,
        `Nos últimos 30 dias, ${s.noPrazoPct}% das ocorrências da pasta foram resolvidas no prazo (meta ${META}%).`,
        criticas.length ? `${criticas.length === 1 ? 'Uma meta do plano de governo está crítica' : `${criticas.length} metas do plano de governo estão críticas`}: ${criticas.map((m) => `"${m.titulo}" (${m.progressoPct}%)`).join(', ')}.` : 'Nenhuma meta do plano de governo está crítica.',
        `Há ${pg.alertas.length} ${pg.alertas.length === 1 ? 'alerta ativo' : 'alertas ativos'} na pasta.`,
      ],
      secoes: [
        tabela(`Evolução · ${serie.rotulo}`, ['Mês', 'Valor', 'Meta'],
          serie.meses.slice(inicio, fim + 1).map((v, i) => [rotuloMes(inicio + i), valorSerie(v, serie.unidade), valorSerie(serie.meta, serie.unidade)])),
        tabela('Metas do plano de governo', ['Meta', 'Progresso', 'Prazo', 'Situação'],
          pg.metas.map((m) => [m.titulo, `${m.progressoPct}%`, m.prazo, STATUS_META[m.status]])),
        tabela('Unidades', colunasUnid, pg.unidades.map((u) => [u.nome, bairro(u.bairroId).nome, ...(u.metricas || []).map((m) => m.valor), SITUACAO[u.situacao]])),
        tabela('Alertas ativos', ['Ocorrência', 'Bairro', 'Gravidade', 'Situação'],
          pg.alertas.map((o) => [o.titulo, bairro(o.bairroId).nome, SEV[o.severidade], GC.situacao(o)])),
      ],
      fontes: [pg.base.fonte, 'gestao.ocorrencias', 'gabinete.orcamento_2026', 'planejamento.metas_governo'],
      painel: (() => {
        // O gráfico mostra no mínimo 6 meses (2 barras não contam história); os meses fora do
        // período escolhido aparecem esmaecidos, como contexto.
        const iniGrafico = Math.min(inicio, Math.max(0, fim - 5));
        const janelaMeses = serie.meses.slice(iniGrafico, fim + 1);
        const max = Math.max(...janelaMeses, serie.meta);
        const menor = menorMelhor(serie);
        const pior = (v) => (menor ? v > serie.meta : v < serie.meta);
        const estouradas = pg.alertas.filter(GC.estourada).length;
        return {
          kpis: [
            { rotulo: pg.pulso.rotulo, valor: pg.pulso.nivel, detalhe: `${pg.pulso.variacao} ${pg.pulso.periodo}`, tom: pg.pulso.positivo ? 'ok' : 'ruim' },
            { rotulo: `No prazo${sufixo30(p)}`, valor: `${s.noPrazoPct}%`, detalhe: metaTexto(s.noPrazoPct), tom: s.noPrazoPct >= META ? 'ok' : 'ruim' },
            { rotulo: 'Alertas ativos', valor: num(pg.alertas.length), detalhe: estouradas ? `${estouradas} com prazo estourado` : 'nenhum com prazo estourado', tom: estouradas ? 'ruim' : 'ok' },
            { rotulo: 'Orçamento executado', valor: `${pg.orcamento.executadoPct}%`, detalhe: `de ${mi(pg.orcamento.dotacaoMi)}` },
          ],
          esquerda: lista('Metas do plano de governo', pg.metas.map((m) => ({ texto: m.titulo, etiqueta: `${m.progressoPct}% · ${m.prazo}`, tom: { critico: 'crit', atencao: 'at' }[m.status] || 'ok', progresso: m.progressoPct }))),
          direita: barras(`Evolução · ${serie.rotulo}`, janelaMeses.map((v, i) => Object.assign(
            { rotulo: rotuloMes(iniGrafico + i), valor: pct(v, max), texto: valorSerie(v, serie.unidade), tom: pior(v) ? 'ruim' : '' },
            iniGrafico + i < inicio ? { contexto: true } : {})),
          { meta: pct(serie.meta, max), nota: `linha verde = meta ${valorSerie(serie.meta, serie.unidade)}`,
            legenda: `${menor ? 'Menor' : 'Maior'} é melhor: barra vermelha = pior que a meta.${iniGrafico < inicio ? ' Meses esmaecidos ficam fora do período escolhido.' : ''}` }),
        };
      })(),
    };
  }

  // ---- bairro ----
  function relBairro(store, p, id) {
    const b = bairro(id);
    const ativas = store.ocorrencias(null, id);
    const estouradas = ativas.filter(GC.estourada).length;
    const sat = GC.data.satisfacaoPorBairro[id];
    const satCidade = GC.data.indicadoresBase.satisfacaoPct;
    const hist = GC.data.historico30d;
    const casosArea = GC.data.areas.map((a) => ({ a, n: (hist[a.id] || {})[id] || 0, total: soma(Object.values(hist[a.id] || {})) }));
    const casos = soma(casosArea.map((x) => x.n));
    const casosCidade = soma(casosArea.map((x) => x.total));
    const popCidade = soma(GC.data.bairros.map((x) => x.populacao));
    const maior = casosArea.slice().sort((x, y) => y.n - x.n)[0];
    const porMil = (n, pop) => (n * 1000 / pop).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const unidades = GC.data.areas.flatMap((a) => (GC.data.secretarias[a.id].unidades || []).filter((u) => u.bairroId === id)
      .map((u) => [u.nome, a.secretaria.nome, SITUACAO[u.situacao]]));
    return {
      titulo: `Relatório do bairro ${b.nome}`,
      subtitulo: 'Visão intersetorial: todas as secretarias no mesmo bairro',
      kpis: [
        { rotulo: 'População', valor: num(b.populacao) },
        { rotulo: 'Ocorrências ativas', valor: num(ativas.length), noCartao: true },
        { rotulo: 'Prazos estourados', valor: num(estouradas), noCartao: true },
        { rotulo: 'Satisfação', valor: `${sat}%`, detalhe: `cidade: ${satCidade}%`, noCartao: true },
        { rotulo: 'Casos registrados (30 dias)', valor: num(casos), noCartao: true },
      ],
      topicos: [
        `${b.nome} tem ${num(b.populacao)} moradores e ${ativas.length} ${ativas.length === 1 ? 'ocorrência ativa' : 'ocorrências ativas'} agora${estouradas ? `, ${estouradas} com prazo estourado` : ''}.`,
        `A satisfação é de ${sat}% (cidade: ${satCidade}%).`,
        maior.n ? `${maior.a.nome} concentra os casos do bairro nos últimos 30 dias (${maior.n}).` : 'Não houve casos registrados no bairro nos últimos 30 dias.',
      ],
      secoes: [
        tabela('Comparação com a média da cidade', ['Indicador', b.nome, 'Média por bairro'], [
          ...casosArea.map((x) => [`${x.a.nome}: casos em 30 dias`, num(x.n), (x.total / GC.data.bairros.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })]),
          ['Casos por mil habitantes (30 dias)', porMil(casos, b.populacao), porMil(casosCidade, popCidade)],
          ['Satisfação', `${sat}%`, `${satCidade}%`],
        ]),
        tabela('Unidades no bairro', ['Unidade', 'Secretaria', 'Situação'], unidades),
        tabela('Ocorrências ativas no bairro', ['Ocorrência', 'Secretaria', 'Gravidade', 'Situação'],
          ativas.map((o) => [o.titulo, area(o.area).secretaria.nome, SEV[o.severidade], GC.situacao(o)])),
      ],
      fontes: ['planejamento.bairros', 'gestao.ocorrencias', 'ouvidoria.pesquisa_satisfacao', 'unidades das secretarias'],
      painel: (() => {
        const nBairros = GC.data.bairros.length;
        const comCasos = casosArea.filter((x) => x.n > 0 || x.total > 0);
        const max = Math.max(1, ...comCasos.map((x) => Math.max(x.n, x.total / nBairros)));
        return {
          kpis: [
            { rotulo: 'Ocorrências ativas', valor: num(ativas.length) },
            { rotulo: 'Prazos estourados', valor: num(estouradas), tom: estouradas ? 'ruim' : 'ok' },
            { rotulo: 'Satisfação', valor: `${sat}%`, detalhe: `cidade: ${satCidade}%`, tom: sat >= satCidade ? 'ok' : 'ruim' },
            { rotulo: 'Casos registrados (30 dias)', valor: num(casos), detalhe: `${porMil(casos, b.populacao)} por mil hab.` },
          ],
          esquerda: lista('Ocorrências ativas no bairro', ativas.map((o) => {
            const m = GC.motivosAtencao(o)[0];
            return { texto: o.titulo, etiqueta: m ? m.texto : GC.situacao(o), tom: GC.estourada(o) ? 'crit' : m ? 'at' : '', link: { tipo: 'ocorrencia', id: o.id } };
          })),
          direita: barras('Casos por secretaria (30 dias)', comCasos.map((x) => {
            const media = x.total / nBairros;
            // Vermelho só quando passa bem da média (mais de 1,5×); a média aparece como traço na barra.
            return { rotulo: x.a.nome, valor: pct(x.n, max), marca: pct(media, max), texto: `${x.n} · média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, tom: x.n > media * 1.5 && x.n - media >= 1 ? 'ruim' : '', link: { tipo: 'secretaria', id: x.a.id } };
          }), { nota: 'traço = média por bairro', legenda: 'Barra: casos do bairro em 30 dias. Traço escuro: média por bairro. Vermelho: mais de 1,5× a média.' }),
        };
      })(),
    };
  }

  // Arredonda as partes sem perder a soma: maiores restos levam a unidade que sobra.
  function repartir(partes, total) {
    const base = partes.map(Math.floor);
    let falta = total - soma(base);
    partes.map((v, i) => [v - base[i], i]).sort((x, y) => y[0] - x[0])
      .forEach(([, i]) => { if (falta > 0) { base[i]++; falta--; } });
    return base;
  }

  // ---- alertas ----
  function alertas(store, p) {
    const f = fator(p);
    const d = store.desempenho(null).resumo;
    const regras = Object.entries(GC.data.regras).map(([tipo, r]) => ({ tipo, r, area: GC.areaDoTipo(tipo) }));
    const total = Math.round(GC.alertas30d() * f);
    const criticas = store.ocorrencias(null, null, 'criticas').length;
    const top = regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d)[0];
    const desemp = store.desempenho(null).secretarias;
    const grupos = GC.data.areas.map((a) => ({ id: a.id, curto: a.nome, nome: a.secretaria.nome, n: soma(regras.filter((x) => x.area === a.id).map((x) => x.r.disparos30d)), prazo: `${desemp.find((s) => s.area === a.id).noPrazoPct}%` }));
    const semArea = soma(regras.filter((x) => !x.area).map((x) => x.r.disparos30d));
    if (semArea) grupos.push({ curto: 'Outras', nome: 'Outras', n: semArea, prazo: '—' });
    const repartido = repartir(grupos.map((g) => g.n * f), total);
    const porArea = grupos.map((g, i) => [g.nome, String(repartido[i]), g.prazo]);
    const hist = GC.data.historico30d;
    const porBairro = GC.data.bairros.map((b) => [b.nome, soma(GC.data.areas.map((a) => (hist[a.id] || {})[b.id] || 0))]).sort((x, y) => y[1] - x[1]);
    const secoes = [
      tabela('Por secretaria', ['Secretaria', 'Disparos', 'No prazo (30 dias)'], porArea),
      tabela('Por regra', ['Tipo', 'Regra', 'Expressão técnica', 'Fontes', 'Disparos (30 dias)'],
        regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d).map((x) => [x.tipo, regraTexto(x.r), x.r.expressao, x.r.fontes.join(' × '), String(x.r.disparos30d)])),
      tabela('Casos registrados por bairro (30 dias)', ['Bairro', 'Casos'], porBairro.map(([n, c]) => [n, String(c)])),
    ];
    if (emMeses(p)) {
      const m = GC.alertasPorMes();
      const { de: ini, ate } = info(p);
      const max = Math.max(...m.slice(ini, ate + 1));
      secoes.push({ titulo: 'Por mês', tipo: 'barras', itens: m.slice(ini, ate + 1).map((v, i) => ({ rotulo: rotuloMes(ini + i), valor: Math.round((v / max) * 100), texto: `${v} alertas` })) });
    }
    return {
      titulo: 'Relatório de alertas e monitoramento',
      subtitulo: 'Desempenho das regras automáticas e da resposta das secretarias',
      kpis: [
        Object.assign({ rotulo: 'Alertas disparados', valor: p === '7' ? aprox(p, total) : num(total), noCartao: true }, p === '7' ? { detalhe: notaEstimativa(p) } : {}),
        { rotulo: 'Críticos agora', valor: num(criticas), noCartao: true },
        { rotulo: `Resolvidas no prazo${sufixo30(p)}`, valor: `${d.noPrazoPct}%`, detalhe: `meta ${META}%`, noCartao: true },
        { rotulo: `Tempo médio de resposta${sufixo30(p)}`, valor: horas(d.tempoMedioH), noCartao: true },
      ],
      topicos: [
        `No período, as regras automáticas dispararam ${p === '7' ? `cerca de ${num(total)} (${notaEstimativa(p)})` : num(total)} alertas.`,
        `Nos últimos 30 dias, ${d.noPrazoPct}% das ocorrências foram resolvidas no prazo, com tempo médio de ${horas(d.tempoMedioH)}.`,
        `A regra que mais disparou foi a de ${top.tipo} (${top.r.disparos30d} vezes em 30 dias).`,
      ],
      secoes,
      fontes: ['monitoramento.regras', 'monitoramento.alertas', 'gestao.ocorrencias', 'planejamento.bairros'],
      painel: (() => {
        const kpis = [
          { rotulo: 'Alertas disparados', valor: p === '7' ? aprox(p, total) : num(total), detalhe: p === '30' ? 'nos últimos 30 dias' : p === '7' ? notaEstimativa(p) : 'no período' },
          { rotulo: 'Críticos agora', valor: num(criticas), tom: criticas ? 'ruim' : 'ok' },
          { rotulo: `No prazo${sufixo30(p)}`, valor: `${d.noPrazoPct}%`, detalhe: metaTexto(d.noPrazoPct), tom: d.noPrazoPct >= META ? 'ok' : 'ruim' },
          { rotulo: `Tempo médio${sufixo30(p)}`, valor: horas(d.tempoMedioH) },
        ];
        const topo = regras.slice().sort((a, b) => b.r.disparos30d - a.r.disparos30d).slice(0, 5)
          .map((x) => ({ texto: `${x.tipo.charAt(0).toUpperCase()}${x.tipo.slice(1)}: ${regraTexto(x.r)}`, dica: `Regra técnica: ${x.r.expressao}`, etiqueta: `${x.r.disparos30d}× em 30 dias`, tom: '' }));
        let direita;
        if (emMeses(p)) {
          const m = GC.alertasPorMes();
          const { de: ini, ate } = info(p);
          const max = Math.max(...m.slice(ini, ate + 1));
          direita = barras('Disparos por mês', m.slice(ini, ate + 1).map((v, i) => ({ rotulo: rotuloMes(ini + i), valor: pct(v, max), texto: String(v) })));
        } else {
          const max = Math.max(1, ...repartido);
          // Nome curto ("Secretaria de ..." não cabe no rótulo) e do maior para o menor.
          direita = barras('Disparos por secretaria', grupos
            .map((g, i) => ({ g, n: repartido[i] }))
            .sort((x, y) => y.n - x.n)
            .map(({ g, n }) => Object.assign({ rotulo: g.curto, valor: pct(n, max), texto: String(n) }, g.id ? { link: { tipo: 'secretaria', id: g.id } } : {})));
        }
        return { kpis, esquerda: lista('Regras que mais dispararam', topo), direita };
      })(),
    };
  }

  // ---- CSV: BOM (Excel abre acentuado), separador ';', aspas quando preciso ----
  const campo = (v) => {
    const t = String(v ?? '');
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  GC.campoCsv = campo;
  // Todos os indicadores do relatório (o painel da tela mostra só 4): a mesma tabela na tela, no CSV e no PDF.
  // A observação leva a meta e o aviso de estimativa.
  GC.tabelaIndicadores = (rel) => ({ titulo: 'Indicadores', tipo: 'tabela', colunas: ['Indicador', 'Valor', 'Observação'], linhas: rel.kpis.map((k) => [k.rotulo, k.valor, k.detalhe || '']) });
  GC.relatorioCsv = function (rel) {
    const ind = GC.tabelaIndicadores(rel);
    const linhas = [[rel.titulo], [rel.periodo.rotulo], [], ind.colunas, ...ind.linhas, [], ['Resumo'], ...(rel.topicos || [rel.resumo]).map((t) => [t])];
    rel.secoes.forEach((s) => {
      linhas.push([], [s.titulo]);
      if (s.vazio) linhas.push([s.vazio]);
      else if (s.tipo === 'tabela') linhas.push(s.colunas, ...s.linhas);
      else if (s.tipo === 'lista') s.itens.forEach((t, i) => linhas.push([`${i + 1}. ${t}`]));
      else s.itens.forEach((b) => linhas.push([b.rotulo, b.texto]));
    });
    linhas.push([], ['Fontes', rel.fontes.map((f) => (GC.nomeFonte(f) === f ? f : `${GC.nomeFonte(f)} [${f}]`)).join(', ')]);
    return `﻿${linhas.map((l) => l.map(campo).join(';')).join('\r\n')}\r\n`;
  };

  GC.montarRelatorio = function (store, { tipo, alvo, periodo }) {
    let rel;
    if (tipo === 'secretaria') rel = secretaria(store, periodo, alvo);
    else if (tipo === 'bairro') rel = relBairro(store, periodo, alvo);
    else if (tipo === 'alertas') rel = alertas(store, periodo);
    else rel = executivo(store, periodo);
    // O resumo corrido (texto único) continua existindo; a tela e o PDF usam os tópicos.
    return Object.assign({ tipo, alvo, periodo: periodoDe(periodo), codigoPeriodo: periodo }, rel, { resumo: rel.topicos.join(' ') });
  };
})(window.GC = window.GC || {});
