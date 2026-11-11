(function (GC) {
  // Tela "Dados": as tabelas que o painel realmente usa, montadas do store e dos dados,
  // para mostrar de onde vem cada número (prévia, CSV, base completa em JSON e dicionário).
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const col = (nome, descricao) => ({ nome, descricao });
  const rotuloMes = (i) => `${GC.data.mesesSerie[i]}/${i < 2 ? 2025 : 2026}`;
  const STATUS_META = { concluida: 'concluída', em_dia: 'em dia', atencao: 'atenção', critico: 'crítico' };

  GC.tabelasDados = function (store) {
    const d = GC.data;
    const desemp = store.desempenho(null).secretarias;
    return [
      {
        id: 'gestao.ocorrencias',
        nome: 'Ocorrências',
        descricao: 'Ocorrências registradas pelas secretarias integradas, com o status atual (inclui as resolvidas durante a demonstração).',
        colunas: [col('id', 'identificador da ocorrência'), col('secretaria', 'área responsável'), col('tipo', 'tipo de ocorrência (regra que disparou)'), col('titulo', 'descrição curta'), col('bairro', 'bairro onde ocorre'), col('gravidade', 'crítica, alta ou média'), col('status', 'encaminhada, em_campo ou resolvida'), col('prazo_min', 'prazo de atendimento em minutos'), col('afetados', 'pessoas afetadas (estimativa)'), col('fonte', 'origem do registro')],
        linhas: store.todas().map((o) => [o.id, area(o.area).nome, o.tipo, o.titulo, bairro(o.bairroId).nome, o.severidade, o.status, o.prazoMin, o.afetados, o.fonte]),
      },
      {
        id: 'monitoramento.regras',
        nome: 'Regras de monitoramento',
        descricao: 'Regras que disparam os alertas automaticamente, e as criadas a partir de perguntas ao ' + GC.agente() + '.',
        colunas: [col('regra', 'nome da regra'), col('expressao', 'condição que dispara o alerta'), col('fontes', 'bases cruzadas'), col('disparos_30d', 'vezes que disparou nos últimos 30 dias'), col('situacao', 'ativa ou pausada'), col('origem', 'automática ou ' + GC.agente() + '')],
        linhas: store.regras().map((r) => [r.nome, r.expressao, r.fontes.join(' × '), r.disparos30d, r.ativa ? 'ativa' : 'pausada', r.origem === 'copiloto' ? '' + GC.agente() + '' : 'automática']),
      },
      {
        id: 'monitoramento.alertas_mensais',
        nome: 'Alertas por mês',
        descricao: 'Total de alertas disparados pelas regras em cada mês (o último mês é a soma dos disparos de 30 dias).',
        colunas: [col('mes', 'mês de referência'), col('alertas', 'alertas disparados')],
        linhas: GC.alertasPorMes().map((v, i) => [rotuloMes(i), v]),
      },
      {
        id: 'historico.casos_30d',
        nome: 'Casos por área e bairro (30 dias)',
        descricao: 'Casos registrados nos últimos 30 dias, por secretaria e bairro.',
        colunas: [col('secretaria', 'área'), col('bairro', 'bairro'), col('casos', 'casos em 30 dias')],
        linhas: d.areas.flatMap((a) => d.bairros.map((b) => [a.nome, b.nome, (d.historico30d[a.id] || {})[b.id] || 0])),
      },
      {
        id: 'gestao.desempenho_30d',
        nome: 'Desempenho das secretarias (30 dias)',
        descricao: 'Resolvidas, % no prazo e tempo médio por secretaria nos últimos 30 dias (com as resoluções da demonstração).',
        colunas: [col('secretaria', 'área'), col('resolvidas', 'ocorrências resolvidas'), col('no_prazo_pct', '% resolvidas dentro do prazo'), col('tempo_medio_h', 'tempo médio até resolver, em horas'), col('atrasadas_agora', 'ocorrências com prazo estourado agora')],
        linhas: desemp.map((s) => [area(s.area).nome, s.resolvidas, s.noPrazoPct, s.tempoMedioH, s.atrasadas]),
      },
      {
        id: 'gabinete.orcamento_2026',
        nome: 'Orçamento 2026',
        descricao: 'Dotação e execução orçamentária de cada secretaria em 2026.',
        colunas: [col('secretaria', 'secretaria'), col('dotacao_mi', 'dotação em R$ milhões'), col('executado_pct', '% executado até outubro')],
        linhas: d.areas.map((a) => [a.secretaria.nome, d.secretarias[a.id].orcamento.dotacaoMi, d.secretarias[a.id].orcamento.executadoPct]),
      },
      {
        id: 'planejamento.metas_governo',
        nome: 'Metas do plano de governo',
        descricao: 'Metas de cada secretaria, com progresso, prazo e situação.',
        colunas: [col('secretaria', 'secretaria'), col('meta', 'descrição da meta'), col('progresso_pct', '% concluído'), col('prazo', 'prazo'), col('situacao', 'concluída, em dia, atenção ou crítico')],
        linhas: d.areas.flatMap((a) => d.secretarias[a.id].metas.map((m) => [a.secretaria.nome, m.titulo, m.progressoPct, m.prazo, STATUS_META[m.status]])),
      },
      {
        id: 'secretarias.series_12m',
        nome: 'Indicador principal · 12 meses',
        descricao: 'Série mensal do indicador principal de cada secretaria, com a meta.',
        colunas: [col('secretaria', 'secretaria'), col('indicador', 'indicador'), col('mes', 'mês'), col('valor', 'valor no mês'), col('meta', 'meta'), col('unidade', 'unidade')],
        linhas: d.areas.flatMap((a) => {
          const s = d.secretarias[a.id].serie;
          return s.meses.map((v, i) => [a.secretaria.nome, s.rotulo, rotuloMes(i), v, s.meta, s.unidade]);
        }),
      },
      {
        id: 'unidades',
        nome: 'Unidades das secretarias',
        descricao: 'Equipamentos e frentes de cada secretaria (UBS, escolas, bases, linhas, rotas…), com duas métricas e a situação.',
        colunas: [col('secretaria', 'secretaria'), col('unidade', 'nome da unidade'), col('bairro', 'bairro'), col('metrica_1', 'primeira métrica (rótulo: valor)'), col('metrica_2', 'segunda métrica (rótulo: valor)'), col('situacao', 'ok, atenção ou crítica')],
        linhas: d.areas.flatMap((a) => d.secretarias[a.id].unidades.map((u) => [a.secretaria.nome, u.nome, bairro(u.bairroId).nome, `${u.metricas[0].rotulo}: ${u.metricas[0].valor}`, `${u.metricas[1].rotulo}: ${u.metricas[1].valor}`, u.situacao])),
      },
      ...(GC.social ? [{
        id: 'assistencia.cadunico_bairro',
        nome: 'CadÚnico × Saúde × Escola por bairro',
        descricao: 'Famílias do Cadastro Único, vulneráveis, faltando a 2+ consultas em 90 dias e crianças faltando à consulta e à escola. Só números agregados: a lista nominal fica com o CRAS e a UBS.',
        colunas: [col('bairro', 'bairro'), col('familias_cadunico', 'famílias no CadÚnico'), col('vulneraveis', 'renda até meio salário mínimo por pessoa'), col('faltando_consultas', 'vulneráveis com 2+ faltas em 90 dias'), col('taxa_pct', '% das vulneráveis faltando'), col('sem_celular', 'das que faltam, sem celular atualizado'), col('criancas_busca_ativa', '0 a 14 anos faltando à consulta e à escola'), col('cadastro_atualizado_pct', '% de cadastros atualizados'), col('situacao', 'ok, atenção ou crítica')],
        linhas: GC.social.resumo().bairros.map((b) => [b.nome, b.familias, b.vulneraveis, b.faltando, b.taxaPct, b.semLembrete, b.criancas, b.atualizadoPct, b.situacao]),
      }] : []),
      {
        id: 'planejamento.bairros',
        nome: 'Bairros',
        descricao: 'Bairros da cidade e população.',
        colunas: [col('bairro', 'nome'), col('id', 'identificador'), col('populacao', 'habitantes')],
        linhas: d.bairros.map((b) => [b.nome, b.id, b.populacao]),
      },
      {
        id: 'ouvidoria.satisfacao_bairro',
        nome: 'Satisfação por bairro',
        descricao: 'Satisfação dos moradores com os serviços, por bairro (pesquisa da ouvidoria).',
        colunas: [col('bairro', 'bairro'), col('satisfacao_pct', '% de satisfeitos')],
        linhas: d.bairros.map((b) => [b.nome, d.satisfacaoPorBairro[b.id]]),
      },
    ];
  };

  GC.resumoDados = function (store) {
    const t = GC.tabelasDados(store);
    return {
      tabelas: t.length,
      registros: t.reduce((n, x) => n + x.linhas.length, 0),
      periodo: '12 meses',
      atualizadoHaMin: Math.min(...Object.values(GC.data.basesSecretarias).map((b) => b.atualizadoHaMin)),
    };
  };

  GC.csvTabela = (t) => `﻿${[t.colunas.map((c) => c.nome), ...t.linhas].map((l) => l.map(GC.campoCsv).join(';')).join('\r\n')}\r\n`;

  GC.baseJson = function (store) {
    const tabelas = {};
    GC.tabelasDados(store).forEach((t) => { tabelas[t.id] = { colunas: t.colunas.map((c) => c.nome), linhas: t.linhas }; });
    return JSON.stringify({ geradoEm: new Date(GC.agora()).toISOString(), aviso: 'Dados simulados para demonstração', tabelas }, null, 2);
  };

  GC.dicionarioMd = function (store) {
    return ['# Dicionário de dados · Vila Dourada', '', '_Dados simulados para demonstração._', '',
      ...GC.tabelasDados(store).flatMap((t) => [`## ${t.id}`, '', `**${t.nome}** — ${t.descricao}`, '', ...t.colunas.map((c) => `- \`${c.nome}\`: ${c.descricao}`), '']),
    ].join('\n');
  };
})(window.GC = window.GC || {});
