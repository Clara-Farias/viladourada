(function (GC) {
  // Catálogo de indicadores: a ficha de cada número que o painel mostra, com a meta e a frequência de
  // atualização para cada porte de cidade (pequena, média, grande). A ideia veio da proposta "versão clara":
  // a mesma métrica não tem a mesma meta numa cidade de 22 mil e numa de 2,5 milhões, nem chega com a mesma
  // frequência (planilha mensal × sistema em tempo real). O valor atual sai dos módulos que já existem
  // (data-leitos, data-seguranca, data-risco, data-obras, data-educacao, data-frota, data-medicamentos…),
  // então é sempre o mesmo número que aparece no mapa, nos widgets e nas secretarias.
  // Só lógica: a tela fica em tela-indicadores.js.

  const PORTES = ['pequena', 'media', 'grande'];
  GC.PORTES_INDICADOR = PORTES;
  const por = (p, m, g) => ({ pequena: p, media: m, grande: g });
  const mesmo = (v) => por(v, v, v);
  const n = (v) => Number(v).toLocaleString('pt-BR');
  const umaCasa = (n) => Math.round(n * 10) / 10;
  const ultimo = (area) => {
    const s = ((GC.data.secretarias || {})[area] || {}).serie;
    return s ? s.meses[s.meses.length - 1] : null;
  };
  const serieDe = (area) => {
    const s = ((GC.data.secretarias || {})[area] || {}).serie;
    return s ? { meses: s.meses.slice(), rotulos: (GC.data.mesesSerie || []).slice() } : null;
  };
  // Série da ficha: os 12 meses fechados da secretaria e, quando o valor de agora é outro, um ponto "agora"
  // no fim. Assim o último ponto do gráfico é sempre o número do cartão.
  const serieComAgora = (area, valor) => {
    const s = serieDe(area);
    if (!s) return null;
    if (typeof valor === 'number' && Number.isFinite(valor) && valor !== s.meses[s.meses.length - 1]) {
      s.meses.push(valor);
      s.rotulos.push('agora');
    }
    return s;
  };

  // Campos de cada ficha:
  // polaridade: 'menor' (quanto menor melhor) ou 'maior'. tolerancia: quanto além da meta ainda é "atenção"
  // (mesma unidade; padrão 10% da meta). fase: 'MVP' (votado no workshop de 04/11) ou 'Complementar'.
  // origem: de onde veio o pedido. valor(ctx): número atual; detalhe(ctx): uma linha de contexto.
  GC.CATALOGO_INDICADORES = [
    // ---- Saúde (1ª prioridade do workshop) ----
    {
      id: 'SAU01', area: 'saude', nome: 'Ocupação de leitos da rede', unidade: '%', polaridade: 'menor',
      meta: mesmo(85), tolerancia: 5, frequencia: por('Diária', 'A cada hora', 'Tempo real'),
      fonte: 'Central de regulação de leitos', formula: 'Leitos ocupados ÷ leitos totais (hospitais e UPAs) × 100',
      granularidade: 'Unidade de saúde', fase: 'MVP', origem: 'Workshop 04/11 · 8 votos (o mais votado)',
      valor: (c) => c.leitos.pct, detalhe: (c) => `${n(c.leitos.livres)} leitos livres de ${n(c.leitos.total)}`,
    },
    {
      id: 'SAU02', area: 'saude', nome: 'Ocupação de UTI', unidade: '%', polaridade: 'menor',
      meta: mesmo(90), tolerancia: 5, frequencia: por('Diária', 'A cada hora', 'Tempo real'),
      fonte: 'Central de regulação de leitos', formula: 'Leitos de UTI ocupados ÷ leitos de UTI × 100',
      granularidade: 'Unidade de saúde', fase: 'MVP', origem: 'Workshop 04/11 · leitos (8 votos)',
      valor: (c) => c.leitos.utiPct, detalhe: (c) => `${c.leitos.utiLivres} vagas de UTI agora`,
    },
    {
      id: 'SAU03', area: 'saude', nome: 'Espera média nas UBS', unidade: 'min', polaridade: 'menor',
      meta: por(45, 60, 75), frequencia: por('Mensal', 'Diária', 'Tempo real'),
      fonte: 'e-SUS APS (agenda das UBS)', formula: 'Média do tempo entre a chegada e o atendimento nas UBS no mês',
      granularidade: 'UBS', fase: 'MVP', origem: 'Workshop 04/11 · "atraso em atendimento" (Francisco)',
      valor: () => ultimo('saude'), detalhe: () => 'lembretes por WhatsApp desde jun.', serieArea: 'saude',
    },
    {
      id: 'SAU04', area: 'saude', nome: 'Medicamentos em falta nas UBS', unidade: 'itens', polaridade: 'menor',
      meta: mesmo(0), tolerancia: 1, frequencia: por('Semanal', 'Diária', 'Diária'),
      fonte: 'Central de abastecimento farmacêutico (CAF)', formula: 'Itens da lista municipal com estoque zero em alguma UBS',
      granularidade: 'Farmácia da UBS', fase: 'Complementar', origem: 'Workshop 04/11 · estoque de medicamentos (Ana)',
      valor: (c) => c.medicamentos.rupturas, detalhe: (c) => `${c.medicamentos.ubsComRuptura.length} UBS com falta`,
    },
    {
      id: 'SAU05', area: 'saude', nome: 'Tempo de resposta do SAMU', unidade: 'min', polaridade: 'menor',
      meta: por(15, 12, 12), tolerancia: 2, frequencia: por('Mensal', 'Diária', 'Tempo real'),
      fonte: 'Central do SAMU 192', formula: 'Média do tempo entre o chamado e a chegada da ambulância',
      granularidade: 'Base do SAMU', fase: 'Complementar', origem: 'Workshop 04/11 · ambulâncias (Victor)',
      valor: (c) => c.frota.ambulancias.tempoRespostaMin, detalhe: (c) => `${n(c.frota.ambulancias.operando)} de ${n(c.frota.ambulancias.necessarios)} ambulâncias rodando`,
    },
    // ---- Segurança (1ª prioridade) ----
    {
      id: 'SEG01', area: 'seguranca', nome: 'Ocorrências por 10 mil habitantes', unidade: 'por 10 mil', polaridade: 'menor',
      meta: por(25, 20, 18), frequencia: por('Mensal', 'Diária', 'Tempo real'),
      fonte: 'Boletins da Guarda Municipal + B.O.s', formula: 'Ocorrências nos últimos 30 dias ÷ população × 10.000',
      granularidade: 'Bairro', fase: 'MVP', origem: 'Workshop 04/11 · 6 votos',
      valor: (c) => umaCasa((c.seguranca.total30d / c.populacao) * 10000), detalhe: (c) => `${c.seguranca.total30d.toLocaleString('pt-BR')} ocorrências em 30 dias`,
    },
    {
      id: 'SEG02', area: 'seguranca', nome: 'Violência contra mulheres e crianças', unidade: 'por 10 mil', polaridade: 'menor',
      meta: mesmo(4), tolerancia: 0.5, frequencia: por('Mensal', 'Mensal', 'Diária'),
      fonte: 'Delegacia da Mulher + Conselho Tutelar', formula: 'Casos no mês ÷ população × 10.000 (só agregado por bairro, nunca ponto)',
      granularidade: 'Bairro (agregado)', fase: 'MVP', origem: 'Workshop 04/11 · Felipe',
      valor: (c) => Math.round((c.seguranca.violencia.mes / c.populacao) * 1000000) / 100,
      detalhe: (c) => `${n(c.seguranca.violencia.mes)} casos no mês · ${c.seguranca.violencia.variacaoAnoPct > 0 ? '+' : ''}${c.seguranca.violencia.variacaoAnoPct}% no ano`,
    },
    // ---- Defesa Civil (2ª prioridade) ----
    {
      id: 'DEF01', area: 'defesa_civil', nome: 'Famílias em área de risco alto', unidade: 'famílias', polaridade: 'menor',
      meta: por(0, 50, 150), tolerancia: 0, frequencia: por('Diária', 'A cada 3 h', 'Tempo real'),
      fonte: 'Áreas de risco mapeadas × previsão INMET', formula: 'Famílias nas áreas onde a chuva prevista passa do limite em até 6 h',
      granularidade: 'Área de risco', fase: 'MVP', origem: 'Workshop 04/11 · 3 votos (risco climático)',
      valor: (c) => c.risco.familiasRiscoAlto, detalhe: (c) => `${c.risco.altas.length} área(s) com risco alto`,
    },
    {
      id: 'DEF02', area: 'defesa_civil', publico: false, nome: 'Áreas de risco alto sem ação preventiva', unidade: 'áreas', polaridade: 'menor',
      meta: mesmo(0), tolerancia: 0, frequencia: por('Diária', 'A cada 3 h', 'Tempo real'),
      fonte: 'Áreas de risco mapeadas × ocorrências abertas', formula: 'Áreas de risco alto ainda não atingidas e sem gabinete preventivo',
      granularidade: 'Área de risco', fase: 'Complementar', origem: 'Workshop 04/11 · "antes de acontecer" (Victor)',
      valor: (c) => c.risco.altas.filter((a) => !a.atingida && !(c.preventivos || []).includes(a.id)).length,
      detalhe: (c) => (c.risco.preventivo ? `${c.risco.preventivo.nome}: ~${c.risco.preventivo.horasAte} h` : 'nenhuma agora'),
    },
    // ---- Obras ----
    {
      id: 'OBR01', area: 'infraestrutura', nome: 'Obras em atraso', unidade: '%', polaridade: 'menor',
      meta: por(20, 15, 15), frequencia: por('Mensal', 'Semanal', 'Semanal'),
      fonte: 'Contratos de obras (medições)', formula: 'Obras em andamento atrasadas ÷ obras em andamento × 100',
      granularidade: 'Obra', fase: 'MVP', origem: 'Workshop 04/11 · obras atrasadas × no prazo',
      valor: (c) => Math.round((c.obras.atrasadas / Math.max(1, c.obras.emAndamento)) * 100), detalhe: (c) => `${n(c.obras.atrasadas)} de ${n(c.obras.emAndamento)} em andamento`,
    },
    {
      id: 'OBR02', area: 'infraestrutura', nome: 'Atraso médio das obras atrasadas', unidade: 'dias', polaridade: 'menor',
      meta: por(60, 45, 60), frequencia: por('Mensal', 'Semanal', 'Semanal'),
      fonte: 'Contratos de obras (cronograma)', formula: 'Média de dias entre a previsão original e a atual nas obras atrasadas',
      granularidade: 'Obra', fase: 'MVP', origem: 'Workshop 04/11 · "obras que nunca terminam" (Victor)',
      valor: (c) => c.obras.atrasoMedioDias, detalhe: (c) => `${c.obras.paralisadas.length} paralisada(s)`,
    },
    // ---- Mobilidade ----
    {
      id: 'MOB01', area: 'mobilidade', nome: 'Frota de ônibus disponível', unidade: '%', polaridade: 'maior',
      meta: mesmo(95), tolerancia: 3, frequencia: por('Mensal', 'Diária', 'Tempo real'),
      fonte: 'Concessionária (GPS e garagem)', formula: 'Ônibus rodando ÷ ônibus necessários na operação × 100',
      granularidade: 'Linha', fase: 'Complementar', origem: 'Workshop 04/11 · frota rodando × manutenção (Victor, Ana)',
      valor: (c) => c.frota.onibus.disponibilidadePct, detalhe: (c) => `${n(c.frota.onibus.operando)} de ${n(c.frota.onibus.necessarios)} ônibus rodando`,
    },
    {
      id: 'MOB02', area: 'mobilidade', nome: 'Tempo médio de deslocamento', unidade: 'min', polaridade: 'menor',
      meta: por(20, 30, 45), frequencia: por('Mensal', 'Mensal', 'Diária'),
      fonte: 'Bilhetagem eletrônica + GPS', formula: 'Média do tempo de viagem casa–trabalho no transporte público',
      granularidade: 'Região', fase: 'Complementar', origem: 'Indicador da Secretaria de Mobilidade',
      valor: () => ultimo('mobilidade'), detalhe: () => 'faixa exclusiva na Av. Dourada desde mai.', serieArea: 'mobilidade',
    },
    // ---- Educação ----
    {
      id: 'EDU01', area: 'educacao', nome: 'Frequência escolar', unidade: '%', polaridade: 'maior',
      meta: mesmo(95), tolerancia: 2, frequencia: por('Mensal', 'Semanal', 'Diária'),
      fonte: 'Diário de classe da rede municipal', formula: 'Presenças ÷ aulas dadas × 100, rede municipal',
      granularidade: 'Escola', fase: 'Complementar', origem: 'Workshop 04/11 · frequência por escola (Victor)',
      valor: (c) => c.educacao.frequenciaPct, detalhe: (c) => `${c.educacao.alunos.toLocaleString('pt-BR')} alunos`, serieArea: 'educacao',
    },
    {
      id: 'EDU02', area: 'educacao', nome: 'Evasão escolar', unidade: '%', polaridade: 'menor',
      meta: por(4, 3, 3), tolerancia: 1, frequencia: por('Semestral', 'Mensal', 'Mensal'),
      fonte: 'Censo escolar + matrícula', formula: 'Alunos que deixaram a escola no ano ÷ matriculados × 100',
      granularidade: 'Escola', fase: 'Complementar', origem: 'Workshop 04/11 · evasão (Victor)',
      valor: (c) => c.educacao.evasaoPct, detalhe: (c) => `${n(c.educacao.faltando)} professores faltando na rede`,
    },
    {
      id: 'EDU03', area: 'educacao', nome: 'Alfabetização no 3º ano', unidade: '%', polaridade: 'maior',
      meta: por(75, 80, 80), tolerancia: 5, frequencia: por('Anual', 'Semestral', 'Semestral'),
      fonte: 'Avaliação municipal de leitura', formula: 'Alunos do 3º ano alfabetizados ÷ avaliados × 100',
      granularidade: 'Escola', fase: 'Complementar', origem: 'Workshop 04/11 · alfabetização (Felipe)',
      valor: (c) => c.educacao.alfabetizacao3anoPct, detalhe: () => 'avaliação de leitura do 3º ano',
    },
    // ---- Limpeza Urbana ----
    {
      id: 'LIM01', area: 'limpeza', nome: 'Coleta no prazo', unidade: '%', polaridade: 'maior',
      meta: por(90, 95, 95), tolerancia: 3, frequencia: por('Semanal', 'Diária', 'Tempo real'),
      fonte: 'Rastreamento dos caminhões de coleta', formula: 'Coletas feitas no dia programado ÷ coletas programadas × 100 (30 dias)',
      granularidade: 'Rota de coleta', fase: 'Complementar', origem: 'Workshop 04/11 · "caminhão não passou" (Francisco)',
      valor: (c) => c.coleta.noPrazoPct, detalhe: (c) => `${c.coleta.atrasadas.length} rota(s) atrasada(s) hoje`, serieArea: 'limpeza',
    },
    // ---- Intersetorial: CadÚnico × Saúde × Escola ----
    {
      id: 'SOC01', area: null, publico: false, nome: 'Famílias vulneráveis faltando a consultas', unidade: '%', polaridade: 'menor',
      meta: mesmo(5), tolerancia: 1.5, frequencia: por('Mensal', 'Semanal', 'Diária'),
      fonte: 'CadÚnico × e-SUS APS (agenda das UBS)', formula: 'Famílias com renda até ½ salário mínimo por pessoa e 2+ faltas em 90 dias ÷ famílias nessa faixa × 100',
      granularidade: 'Bairro (agregado)', fase: 'Complementar', origem: 'Proposta "versão clara" + Workshop 04/11 (Ana: Saúde + Escola + ECA)',
      valor: (c) => (c.social ? c.social.faltandoPct : null), detalhe: (c) => (c.social ? `${n(c.social.faltando)} famílias · ${n(c.social.criancas)} crianças em busca ativa` : ''),
    },
    {
      id: 'SOC02', area: null, publico: false, nome: 'Cadastro Único atualizado', unidade: '%', polaridade: 'maior',
      meta: mesmo(80), tolerancia: 5, frequencia: por('Mensal', 'Mensal', 'Semanal'),
      fonte: 'CadÚnico (MDS)', formula: 'Cadastros revisados nos últimos 24 meses ÷ cadastros × 100',
      granularidade: 'Bairro', fase: 'Complementar', origem: 'Proposta "versão clara" (CadÚnico atualizado)',
      valor: (c) => (c.social ? c.social.atualizadoPct : null), detalhe: (c) => (c.social ? `${n(c.social.familias)} famílias no CadÚnico` : ''),
    },
    // ---- Gestão (Gabinete) ----
    {
      id: 'GAB01', area: null, publico: false, nome: 'Ocorrências resolvidas no prazo', unidade: '%', polaridade: 'maior',
      meta: mesmo(85), tolerancia: 5, frequencia: por('Diária', 'Tempo real', 'Tempo real'),
      fonte: 'Painel (todas as secretarias)', formula: 'Resolvidas dentro do prazo ÷ resolvidas × 100, últimos 30 dias',
      granularidade: 'Secretaria', fase: 'MVP', origem: 'Painel do prefeito',
      valor: (c) => c.desempenho.noPrazoPct, detalhe: (c) => `${n(c.desempenho.resolvidas)} resolvidas em 30 dias`,
    },
    {
      id: 'GAB02', area: null, nome: 'Satisfação do cidadão', unidade: '%', polaridade: 'maior',
      meta: por(75, 75, 70), tolerancia: 5, frequencia: por('Trimestral', 'Mensal', 'Mensal'),
      fonte: 'Pesquisa do 156 e do App Cidadão', formula: 'Avaliações 4 ou 5 ÷ avaliações × 100',
      granularidade: 'Bairro', fase: 'Complementar', origem: 'Painel do prefeito',
      valor: (c) => c.satisfacaoPct, detalhe: () => 'pesquisa após cada atendimento',
    },
  ];

  // Uma meta só em todas as telas: a série de 12 meses da secretaria (página da secretaria, pulsos, relatórios,
  // tabela de dados) passa a usar a meta do catálogo no porte da cidade atual. Antes cada lugar tinha a sua
  // (ex.: frequência escolar 96% na secretaria × 95% na ficha; na cidade pequena, a meta da média).
  GC.alinharMetasDasSeries = function (porte = (GC.cidade && GC.cidade.id) || 'media') {
    const secs = (GC.data && GC.data.secretarias) || {};
    GC.CATALOGO_INDICADORES.forEach((i) => {
      const s = i.serieArea && secs[i.serieArea] && secs[i.serieArea].serie;
      if (s) s.meta = i.meta[porte];
    });
  };
  GC.alinharMetasDasSeries();

  // Situação diante da meta: 'ok' (na meta), 'atencao' (até a tolerância), 'critico' (além dela).
  GC.situacaoIndicador = function (ind, valor, porte) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return 'sem_dado';
    const meta = ind.meta[porte];
    const tol = ind.tolerancia ?? Math.abs(meta) * 0.1;
    const distancia = ind.polaridade === 'menor' ? valor - meta : meta - valor; // > 0 = pior que a meta
    if (distancia <= 0) return 'ok';
    return distancia <= tol ? 'atencao' : 'critico';
  };

  const SINGULAR = { itens: 'item', 'áreas': 'área', 'famílias': 'família', dias: 'dia' };
  GC.formatarIndicador = function (valor, unidade) {
    if (valor === null || valor === undefined) return '—';
    const n = Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (unidade === '%') return `${n}%`;
    if (unidade === 'min') return `${n} min`;
    if (Number(valor) === 1 && SINGULAR[unidade]) return `1 ${SINGULAR[unidade]}`;
    return `${n} ${unidade}`;
  };

  // Contexto com os resumos dos módulos de dados (um por cálculo, para a lista toda).
  GC.contextoIndicadores = function (store, extra = {}) {
    const d = store ? store.desempenho().resumo : { noPrazoPct: null, resolvidas: 0 };
    return Object.assign({
      leitos: GC.leitos.resumo(),
      seguranca: GC.seguranca.resumo(),
      risco: GC.risco.resumo(store ? store.ocorrencias() : []),
      obras: GC.obras.resumo ? GC.obras.resumo() : GC.obras,
      educacao: GC.educacao.resumo(),
      frota: GC.frota.resumo(),
      coleta: GC.coleta.resumo(),
      medicamentos: GC.medicamentos.resumo(),
      social: GC.social ? GC.social.resumo() : null,
      desempenho: d,
      satisfacaoPct: GC.data.indicadoresBase.satisfacaoPct,
      populacao: (GC.cidade && GC.cidade.populacao) || 250000,
      preventivos: [],
    }, extra);
  };

  // Lista avaliada para o porte da cidade atual. area: filtra por secretaria ('gabinete' = sem área).
  // Indicador aberto ao cidadão (os internos têm publico: false).
  GC.indicadorPublico = (id) => { const i = GC.CATALOGO_INDICADORES.find((x) => x.id === id); return !!i && i.publico !== false; };

  GC.avaliarIndicadores = function (ctx, { porte = (GC.cidade && GC.cidade.id) || 'media', area = null, publico = false } = {}) {
    return GC.CATALOGO_INDICADORES
      .filter((i) => !area || (area === 'gabinete' ? i.area === null : i.area === area))
      .filter((i) => !publico || i.publico !== false)
      .map((i) => {
        let valor = null;
        let detalhe = '';
        try { valor = i.valor(ctx); detalhe = i.detalhe ? i.detalhe(ctx) : ''; } catch (e) { valor = null; }
        return Object.assign({}, i, {
          porte, valorAtual: valor, detalheAtual: detalhe, metaAtual: i.meta[porte], frequenciaAtual: i.frequencia[porte],
          situacao: GC.situacaoIndicador(i, valor, porte), serieAtual: i.serieArea ? serieComAgora(i.serieArea, valor) : null,
        });
      });
  };

  // Pergunta para o Copiloto sobre o indicador (um tema que o roteiro da IA já responde).
  const PERGUNTA = {
    SAU01: 'Como está a ocupação de leitos?', SAU02: 'Como está a ocupação de leitos?', SAU03: 'Como está a lotação das UBS?',
    SAU04: 'Quais medicamentos estão em falta?', SAU05: 'Como está a frota de ambulâncias?', SEG01: 'Como evoluiu a criminalidade?',
    SEG02: 'Como está a violência contra mulheres e crianças?', DEF01: 'Qual o risco de chuva nas próximas horas?',
    DEF02: 'Qual o risco de chuva nas próximas horas?', OBR01: 'Quais obras estão atrasadas?', OBR02: 'Quais obras estão atrasadas?',
    MOB01: 'Como está a frota de ônibus?', MOB02: 'Onde está o trânsito mais crítico?', EDU01: 'Como está a frequência nas escolas?',
    EDU02: 'Quais escolas têm evasão alta?', EDU03: 'Como está a alfabetização nas escolas?', LIM01: 'Onde a coleta de lixo está atrasada?',
    SOC01: 'Como evoluíram as faltas em consultas depois dos lembretes por WhatsApp?', SOC02: 'Como está o CadÚnico e a busca ativa?',
    GAB01: 'Qual secretaria está pior no prazo?', GAB02: 'Como está a satisfação por bairro?',
  };
  GC.perguntaIndicador = (ind) => PERGUNTA[ind.id] || `Como está o indicador ${ind.nome}?`;

  // Contagem por situação (o "X de N na meta" da tela).
  GC.placarIndicadores = function (lista) {
    const p = { total: lista.length, ok: 0, atencao: 0, critico: 0, sem_dado: 0 };
    lista.forEach((i) => { p[i.situacao]++; });
    return p;
  };

  // ---- Leitura dos indicadores avaliados (tela Metas e fichas e widgets) ----
  const ORDEM_SIT = { critico: 0, atencao: 1, ok: 2, sem_dado: 3 };
  // Quão longe da meta, em % da meta (> 0 = pior que a meta; < 0 = folga).
  GC.distanciaMeta = function (i) {
    const v = i.valorAtual; const m = i.metaAtual;
    if (typeof v !== 'number' || typeof m !== 'number' || !m) return null;
    const d = i.polaridade === 'menor' ? v - m : m - v;
    return Math.round((d / Math.abs(m)) * 1000) / 10;
  };
  // Da mais urgente à mais tranquila: situação e, dentro dela, a maior distância da meta primeiro.
  GC.ordenarPorUrgencia = (lista) => lista.slice().sort((a, b) => (ORDEM_SIT[a.situacao] - ORDEM_SIT[b.situacao])
    || ((GC.distanciaMeta(b) ?? -1e9) - (GC.distanciaMeta(a) ?? -1e9)));
  // Tendência: último ponto × o anterior da série. melhorou segue a polaridade (menor é melhor ou maior é melhor).
  GC.tendenciaIndicador = function (i) {
    const s = i.serieAtual && i.serieAtual.meses;
    if (!s || s.length < 2) return null;
    const ult = s[s.length - 1]; const ant = s[s.length - 2];
    const delta = Math.round((ult - ant) * 100) / 100;
    const pct = ant ? Math.round(((ult - ant) / Math.abs(ant)) * 1000) / 10 : null;
    return { delta, pct, direcao: delta > 0 ? 'sobe' : delta < 0 ? 'desce' : 'estavel', melhorou: delta === 0 ? null : (i.polaridade === 'menor' ? delta < 0 : delta > 0) };
  };
  // Uma frase sobre a série de 12 meses: sequência de piora/melhora, melhor ou pior valor do período.
  GC.insightIndicador = function (i) {
    const s = i.serieAtual && i.serieAtual.meses;
    if (!s || s.length < 3) return null;
    const melhor = (a, b) => (i.polaridade === 'menor' ? a < b : a > b);
    const ult = s[s.length - 1];
    let seq = 0; let sentido = null;
    for (let k = s.length - 1; k > 0; k--) {
      if (s[k] === s[k - 1]) break;
      const m = melhor(s[k], s[k - 1]);
      if (sentido === null) sentido = m;
      if (m !== sentido) break;
      seq++;
    }
    const anteriores = s.slice(0, -1);
    if (anteriores.every((v) => melhor(ult, v))) return { tom: 'ok', texto: `Melhor valor em ${s.length} pontos da série` };
    if (anteriores.every((v) => melhor(v, ult))) return { tom: 'critico', texto: `Pior valor em ${s.length} pontos da série` };
    if (seq >= 3) return { tom: sentido ? 'ok' : 'critico', texto: `${sentido ? 'Melhorou' : 'Piorou'} ${seq} vezes seguidas` };
    const t = GC.tendenciaIndicador(i);
    if (t && t.melhorou !== null) return { tom: t.melhorou ? 'ok' : 'atencao', texto: `${t.melhorou ? 'Melhorou' : 'Piorou'} em relação ao ponto anterior` };
    return { tom: 'info', texto: 'Estável em relação ao ponto anterior' };
  };
  // Situação um mês atrás (penúltimo ponto da série), para o "vs. mês passado" do placar.
  GC.situacaoAnterior = function (i) {
    const s = i.serieAtual && i.serieAtual.meses;
    if (!s || s.length < 2) return i.situacao;
    return GC.situacaoIndicador(i, s[s.length - 2], i.porte);
  };
  // Em quais portes de cidade o valor de hoje já cumpre a meta (compara com as metas da própria ficha).
  GC.portesAtendidos = (i) => (typeof i.valorAtual !== 'number' ? [] : PORTES.filter((p) => GC.situacaoIndicador(i, i.valorAtual, p) === 'ok'));
  // Comparação com cidades do mesmo porte. Ainda não há base nacional ligada ao painel: a distribuição é uma
  // REFERÊNCIA SIMULADA em torno da meta do porte (a maioria das cidades fica um pouco pior que a meta).
  // Devolve { melhorQuePct, mediana, simulada: true } — "melhor que X% das cidades médias".
  const QUANTIS = [[0, 0.45], [10, 0.62], [25, 0.85], [50, 1.08], [75, 1.35], [90, 1.7], [100, 2.4]]; // fator sobre a meta (menor é melhor)
  GC.referenciaPorte = function (i, porte = i.porte) {
    const meta = i.meta && i.meta[porte];
    const v = i.valorAtual;
    if (typeof v !== 'number' || typeof meta !== 'number' || meta <= 0) return null;
    // Valores em ordem crescente, com o percentil de cada um. "Maior é melhor": espelha os fatores (as cidades
    // típicas ficam um pouco abaixo da meta), com teto de 100 quando a unidade é %.
    const teto = i.unidade === '%' ? 100 : Infinity;
    const pontos = i.polaridade === 'menor'
      ? QUANTIS.map(([q, f]) => [q, meta * f])
      : QUANTIS.slice().reverse().map(([q, f]) => [100 - q, Math.min(teto, meta * (2 - Math.min(f, 1.9)))]);
    // Percentil do valor na distribuição (interpolação linear entre os quantis).
    const vals = pontos.map((p) => p[1]); const qs = pontos.map((p) => p[0]);
    let pct;
    if (v <= vals[0]) pct = 0; else if (v >= vals[vals.length - 1]) pct = 100;
    else {
      const k = vals.findIndex((x) => x >= v);
      pct = qs[k - 1] + ((v - vals[k - 1]) / (vals[k] - vals[k - 1] || 1)) * (qs[k] - qs[k - 1]);
    }
    // Menor é melhor: melhor que os que têm valor maior. Maior é melhor: melhor que os que têm valor menor.
    const melhorQuePct = Math.round(i.polaridade === 'menor' ? 100 - pct : pct);
    return { melhorQuePct: Math.max(0, Math.min(100, melhorQuePct)), mediana: Math.round(vals[3] * 10) / 10, simulada: true };
  };

  // Indicadores que mudaram de situação desde a última visita (anterior: { id: situacao }).
  GC.mudancasIndicadores = function (lista, anterior) {
    if (!anterior || typeof anterior !== 'object') return {};
    const r = {};
    lista.forEach((i) => {
      const a = anterior[i.id];
      if (a && a !== i.situacao && ORDEM_SIT[a] !== undefined) r[i.id] = { de: a, para: i.situacao, melhorou: ORDEM_SIT[i.situacao] > ORDEM_SIT[a] };
    });
    return r;
  };
  GC.fotoIndicadores = (lista) => Object.fromEntries(lista.map((i) => [i.id, i.situacao]));
})(window.GC = window.GC || {});
