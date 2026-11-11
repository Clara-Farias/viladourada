(function (GC) {
  // Visualizações: um conjunto nomeado de filtros + widgets. As prontas são fixas; as do prefeito
  // ficam no navegador. Lógica pura (sem DOM): o armazenamento é injetado.
  const SEVERIDADES = ['critica', 'alta', 'media'];
  const RECORTES = ['criticas', 'estourado', 'andamento'];

  // categoria: agrupa o catálogo na gaveta Widgets; icone: Tabler (o emoji fica para textos antigos e a IA).
  GC.CATEGORIAS_WIDGET = [
    { id: 'gestao', nome: 'Gestão', icone: 'building-bank', cor: GC.corMarca('navy') },
    { id: 'tempo_real', nome: 'Tempo real', icone: 'activity', cor: '#dc2626' },
    { id: 'saude', nome: 'Saúde', icone: 'stethoscope', cor: '#0891b2' },
    { id: 'seguranca', nome: 'Segurança', icone: 'shield', cor: '#4f46e5' },
    { id: 'cidade', nome: 'Infraestrutura e serviços', icone: 'building-community', cor: '#d97706' },
    { id: 'social', nome: 'Social e educação', icone: 'users-group', cor: '#db2777' },
    { id: 'financas', nome: 'Dinheiro e contratos', icone: 'coin', cor: '#15803d' },
    { id: 'cidadao', nome: 'Cidadão', icone: 'message-circle', cor: '#0d9488' },
    { id: 'util', nome: 'Utilitários', icone: 'tool', cor: '#64748b' },
    { id: 'ia', nome: 'Criados pelo ' + GC.agente() + '', icone: 'sparkles', cor: GC.corMarca('ia') },
  ];
  GC.WIDGETS = [
    { id: 'numeros', nome: 'Números-chave', emoji: '🔢', icone: 'numbers', categoria: 'gestao', descricao: 'Críticas, prazos, atendimento, satisfação e tempo médio' },
    { id: 'pulsos', nome: 'Pulso das secretarias', emoji: '📊', icone: 'chart-bar', categoria: 'gestao', opcoes: true, descricao: 'O indicador principal de cada secretaria' },
    { id: 'desempenho', nome: 'Desempenho · 30 dias', emoji: '🏁', icone: 'flag', categoria: 'gestao', descricao: 'Resolvidas, prazo, ranking e resolvidas recentes' },
    { id: 'satisfacao', nome: 'Satisfação por bairro', emoji: '🙂', icone: 'mood-smile', categoria: 'cidadao', descricao: 'Satisfação dos moradores, do pior ao melhor bairro' },
    { id: 'coleta', nome: 'Coleta de lixo', emoji: '🚛', icone: 'truck', categoria: 'cidade', descricao: 'Rotas de hoje com o caminhão, coleta no prazo e quando passa em cada bairro' },
    { id: 'frota', nome: 'Frota e linhas', emoji: '🚌', icone: 'bus', categoria: 'cidade', descricao: 'Ônibus e ambulâncias rodando, em manutenção e com preventiva vencida; espera nos pontos' },
    { id: 'educacao', nome: 'Educação', emoji: '🎓', icone: 'school', categoria: 'social', descricao: 'Professores faltando, evasão, frequência, escolas e escolaridade da população' },
    { id: 'obras', nome: 'Obras públicas', emoji: '🏗', icone: 'crane', categoria: 'cidade', descricao: 'No prazo × atrasadas, por setor, com contrato, valor pago e avanço' },
    { id: 'risco', nome: 'Risco climático', emoji: '⚠', icone: 'alert-triangle', categoria: 'tempo_real', descricao: 'Áreas de risco × chuva prevista: onde agir antes de alagar ou deslizar' },
    { id: 'seguranca', nome: 'Segurança', emoji: '🛡', icone: 'shield', categoria: 'seguranca', descricao: 'B.O.s de hoje e do mês, tipos, bairro mais crítico e violência contra mulheres e crianças' },
    { id: 'leitos', nome: 'Leitos da rede', emoji: '🛏', icone: 'bed', categoria: 'saude', descricao: 'Ocupação de hospitais e UPAs, vagas de UTI e atendimentos do dia' },
    { id: 'medicamentos', nome: 'Medicamentos', emoji: '💊', icone: 'pill', categoria: 'saude', descricao: 'Faltas nas UBS, previsão da IA, compras e remanejamentos sugeridos' },
    { id: 'social', nome: 'Busca ativa · CadÚnico', emoji: '🤝', icone: 'users-group', categoria: 'social', descricao: 'Famílias vulneráveis faltando a consultas e crianças faltando à consulta e à escola, por bairro' },
    // ---- novos (js/widgets-extra.js) ----
    { id: 'metas_risco', nome: 'Metas em risco', emoji: '🎯', icone: 'target-arrow', categoria: 'gestao', descricao: 'Os indicadores mais longe da meta, com tendência e atalho para a ficha' },
    { id: 'placar_metas', nome: 'Placar de metas', emoji: '🎯', icone: 'chart-donut', categoria: 'gestao', descricao: 'Quantos indicadores estão na meta, perto ou fora, e a variação desde o mês passado' },
    { id: 'resumo', nome: 'Resumo da IA', emoji: '✨', icone: 'sparkles', categoria: 'gestao', opcoes: true, descricao: 'O que mudou hoje ou na semana em três frases, com atalhos' },
    { id: 'decisoes', nome: 'Decisões pendentes', emoji: '⏳', icone: 'gavel', categoria: 'gestao', descricao: 'O que espera o prefeito: prazo, secretaria que pediu e o motivo' },
    { id: 'agenda', nome: 'Agenda e prazos', emoji: '📅', icone: 'calendar-event', categoria: 'gestao', descricao: 'Próximos 14 dias: reuniões, audiências, contratos vencendo e entregas de obra' },
    { id: 'feed', nome: 'Ocorrências ao vivo', emoji: '📡', icone: 'broadcast', categoria: 'tempo_real', descricao: 'As últimas ocorrências da cidade, com gravidade e bairro (bom para o telão)' },
    { id: 'linha24h', nome: 'Últimas 24 horas', emoji: '🕒', icone: 'clock-hour-4', categoria: 'tempo_real', descricao: 'Ocorrências abertas por hora, com o pico do dia' },
    { id: 'calor_bairros', nome: 'Bairros em calor', emoji: '🔥', icone: 'grid-pattern', categoria: 'tempo_real', descricao: 'Grade dos bairros colorida pelas ocorrências abertas; clique para ver no mapa' },
    { id: 'crise', nome: 'Gabinete de crise', emoji: '🚨', icone: 'urgent', categoria: 'tempo_real', descricao: 'Gabinetes ativos: tarefas, tempo decorrido e o preventivo sugerido pela chuva' },
    { id: 'previsao', nome: 'Previsão 48 h', emoji: '🌧', icone: 'cloud-rain', categoria: 'tempo_real', descricao: 'Chuva, chance e temperatura a cada 6 horas, com o limite de alerta' },
    { id: 'orcamento', nome: 'Execução orçamentária', emoji: '💰', icone: 'report-money', categoria: 'financas', descricao: 'Previsto × empenhado × pago, por secretaria' },
    { id: 'contratos', nome: 'Contratos e SLA', emoji: '📑', icone: 'file-certificate', categoria: 'financas', descricao: 'Concessionárias fora do SLA, multas estimadas e contratos vencendo' },
    { id: 'custos', nome: 'Custo por serviço', emoji: '🧾', icone: 'receipt', categoria: 'financas', descricao: 'Quanto custa cada serviço e quanto variou desde o mês passado' },
    { id: 'arrecadacao', nome: 'Arrecadação', emoji: '🏦', icone: 'building-bank', categoria: 'financas', descricao: 'IPTU, ISS, ITBI e taxas: mês e ano × meta' },
    { id: 'voz_cidadao', nome: 'Voz do cidadão', emoji: '💬', icone: 'messages', categoria: 'cidadao', descricao: 'Pedidos por canal (156, app, WhatsApp, ouvidoria), temas e sentimento' },
    { id: 'resposta_cidadao', nome: 'Resposta ao cidadão', emoji: '⏱', icone: 'clock-check', categoria: 'cidadao', descricao: 'Pedidos abertos, respondidos e atrasados, e o tempo por canal' },
    { id: 'bairro_foco', nome: 'Bairro em foco', emoji: '📍', icone: 'map-pin', categoria: 'cidadao', opcoes: true, descricao: 'Um bairro escolhido: ocorrências, satisfação, segurança e serviços' },
    { id: 'iluminacao', nome: 'Iluminação pública', emoji: '💡', icone: 'bulb', categoria: 'cidade', descricao: 'Pontos apagados, tempo de reparo e troca por LED' },
    { id: 'ambiente', nome: 'Meio ambiente', emoji: '🌳', icone: 'trees', categoria: 'cidade', descricao: 'Qualidade do ar, poda pendente, áreas verdes e focos de queimada' },
    { id: 'assistencia', nome: 'Assistência social', emoji: '🏠', icone: 'home-heart', categoria: 'social', descricao: 'Abrigos e vagas, Bolsa Família, atendimentos nos CRAS' },
    { id: 'kpi', nome: 'Indicador em destaque', emoji: '📈', icone: 'chart-line', categoria: 'util', opcoes: true, descricao: 'Qualquer indicador do catálogo em um cartão grande com a série' },
    { id: 'comparativo', nome: 'Comparar bairros', emoji: '⚖', icone: 'scale', categoria: 'util', opcoes: true, descricao: 'Dois bairros lado a lado: ocorrências, satisfação, B.O.s e serviços' },
    { id: 'nota', nome: 'Nota fixada', emoji: '📝', icone: 'note', categoria: 'util', opcoes: true, descricao: 'Um lembrete do gestor, escrito direto no cartão' },
  ];
  const TODOS_WIDGETS = GC.WIDGETS.map((w) => w.id);
  // Ligados na visão "Cidade inteira": todos, menos os que repetem outro lugar (Números-chave = cabeçalho;
  // Desempenho = ranking da tela Secretarias). Continuam disponíveis em Configurar widgets.
  const REPETEM = ['numeros', 'desempenho'];
  // Os widgets novos (js/widgets-extra.js) começam fora do painel padrão: entram pela gaveta ou pelas sugestões.
  const NOVOS = new Set((['metas_risco', 'placar_metas', 'resumo', 'decisoes', 'agenda', 'feed', 'linha24h',
    'calor_bairros', 'crise', 'previsao', 'orcamento', 'contratos', 'custos', 'arrecadacao', 'voz_cidadao', 'resposta_cidadao', 'bairro_foco',
    'iluminacao', 'ambiente', 'assistencia', 'kpi', 'comparativo', 'nota']));
  GC.WIDGETS_PADRAO = TODOS_WIDGETS.filter((id) => !REPETEM.includes(id) && !NOVOS.has(id));

  GC.VISTAS_PRONTAS = [
    { id: 'cidade', nome: 'Cidade inteira', emoji: '🏙', fixa: true, filtros: {}, widgets: { ativos: GC.WIDGETS_PADRAO } },
    { id: 'criticas', nome: 'Críticas agora', emoji: '🔴', fixa: true, filtros: { severidades: ['critica'] }, widgets: { ativos: ['numeros', 'desempenho'] } },
    { id: 'chuva', nome: 'Chuva e obras', emoji: '🌧', fixa: true, filtros: { areas: ['defesa_civil', 'infraestrutura'] }, widgets: { ativos: ['risco', 'obras', 'pulsos', 'numeros'], pulsos: ['defesa_civil', 'infraestrutura'] } },
    { id: 'saude', nome: 'Saúde', emoji: '🏥', fixa: true, filtros: { areas: ['saude'] }, widgets: { ativos: ['leitos', 'social', 'medicamentos', 'pulsos', 'desempenho', 'satisfacao'], pulsos: ['saude'] } },
    { id: 'seguranca', nome: 'Segurança', emoji: '🛡', fixa: true, filtros: { areas: ['seguranca'] }, widgets: { ativos: ['seguranca', 'pulsos', 'desempenho'], pulsos: ['seguranca'] } },
    { id: 'educacao', nome: 'Educação', emoji: '🎓', fixa: true, filtros: { areas: ['educacao'] }, widgets: { ativos: ['educacao', 'social', 'pulsos', 'desempenho'], pulsos: ['educacao'] } },
    { id: 'frota', nome: 'Frota e transporte', emoji: '🚌', fixa: true, filtros: { areas: ['mobilidade'] }, widgets: { ativos: ['frota', 'pulsos', 'desempenho'], pulsos: ['mobilidade', 'saude'] } },
    { id: 'limpeza', nome: 'Limpeza Urbana', emoji: '🚛', fixa: true, filtros: { areas: ['limpeza'] }, widgets: { ativos: ['coleta', 'pulsos', 'desempenho'], pulsos: ['limpeza'] } },
  ];

  const lista = (v) => (Array.isArray(v) ? v : []);
  const unicos = (v) => [...new Set(v)];
  const idsAreas = () => GC.data.areas.map((a) => a.id);
  const idsBairros = () => GC.data.bairros.map((b) => b.id);

  // ---- filtros por atributo da ocorrência (além de secretaria, bairro e situação) ----
  // Pessoas afetadas: o que atinge mais gente (a gravidade sozinha não diz isso).
  GC.FAIXAS_AFETADOS = [
    { id: 'ate100', nome: 'Até 100', curto: 'até 100 afetados', casa: (n) => n <= 100 },
    { id: 'ate1000', nome: '101 a 1.000', curto: '101 a 1.000 afetados', casa: (n) => n > 100 && n <= 1000 },
    { id: 'mais1000', nome: 'Mais de 1.000', curto: '+1.000 afetados', casa: (n) => n > 1000 },
  ];
  // Tempo aberta: o que acabou de chegar × o que está parado há dias.
  GC.FAIXAS_TEMPO = [
    { id: 'recentes', nome: 'Menos de 1 h', curto: 'aberta há < 1 h', casa: (m) => m < 60 },
    { id: 'horas', nome: '1 a 24 h', curto: 'aberta há 1–24 h', casa: (m) => m >= 60 && m < 1440 },
    { id: 'dias', nome: 'Mais de 1 dia', curto: 'aberta há +1 dia', casa: (m) => m >= 1440 },
  ];
  // Origem do aviso: quem avisou. Uma ocorrência pode ter mais de uma (ex.: sensor + chamados 156).
  GC.ORIGENS = [
    { id: 'cidadao', nome: 'Cidadão (156 / App)', curto: 'aviso do cidadão', padrao: /156|app cidad/i },
    { id: 'sistemas', nome: 'Sensores e sistemas', curto: 'sensores e sistemas', padrao: /sensor|c[âa]mera|integra|gps|sistema|concession|companhia|central/i },
    { id: 'equipes', nome: 'Equipes da prefeitura', curto: 'equipes da prefeitura', padrao: /vistoria|escala|diretoria|equipe|guarda|vigil[âa]ncia|boletin/i },
  ];
  const ids = (l) => l.map((x) => x.id);
  GC.origensDe = function (o) {
    if (Array.isArray(o.origens) && o.origens.length) return o.origens;
    const fonte = String(o.fonte || '');
    const achadas = GC.ORIGENS.filter((x) => x.padrao.test(fonte)).map((x) => x.id);
    return achadas.length ? achadas : ['equipes']; // sem pista: registro interno da prefeitura
  };
  const minutosAberta = (o) => (GC.idadeMin && typeof o.criadaEm === 'number' ? GC.idadeMin(o) : o.abertaHaMin || 0);
  const faixa = (faixas, escolhidas, valor) => !escolhidas.length || faixas.some((x) => escolhidas.includes(x.id) && x.casa(valor));

  // Aplica gravidade, afetados, tempo, origem e "várias secretarias" (secretaria, bairro e situação ficam no store).
  GC.filtrarPorAtributos = function (ocorrencias, filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    return ocorrencias.filter((o) => (!f.severidades.length || f.severidades.includes(o.severidade))
      && faixa(GC.FAIXAS_AFETADOS, f.afetados, o.afetados || 0)
      && faixa(GC.FAIXAS_TEMPO, f.tempos, minutosAberta(o))
      && (!f.origens.length || GC.origensDe(o).some((x) => f.origens.includes(x)))
      && (!f.multi || (o.areasEnvolvidas || []).length > 1));
  };

  // Forma canônica: descarta o que for inválido e ordena o que não tem ordem (para comparar).
  GC.normalizarEstado = function (e) {
    const f = (e && e.filtros) || {};
    const w = (e && e.widgets) || {};
    const areas = idsAreas();
    const pulsos = unicos(lista(w.pulsos).filter((a) => areas.includes(a)));
    return {
      filtros: {
        recorte: RECORTES.includes(f.recorte) ? f.recorte : null,
        severidades: SEVERIDADES.filter((s) => lista(f.severidades).includes(s)),
        areas: areas.filter((a) => lista(f.areas).includes(a)),
        // Vários bairros (na ordem da cidade). Visualização salva antes da seleção múltipla traz "bairro".
        bairros: (() => { const escolhidos = [...lista(f.bairros), ...(f.bairro ? [f.bairro] : [])]; return idsBairros().filter((b) => escolhidos.includes(b)); })(),
        afetados: ids(GC.FAIXAS_AFETADOS).filter((x) => lista(f.afetados).includes(x)),
        tempos: ids(GC.FAIXAS_TEMPO).filter((x) => lista(f.tempos).includes(x)),
        origens: ids(GC.ORIGENS).filter((x) => lista(f.origens).includes(x)),
        multi: f.multi === true,
      },
      widgets: {
        // A ordem dos widgets importa (é a ordem no dashboard).
        // Catálogo lido na hora: widgets do Copiloto (js/widgets-ia.js) entram nele depois do carregamento.
        ativos: (() => { const todos = GC.WIDGETS.map((x) => x.id); return Array.isArray(w.ativos) ? unicos(w.ativos.filter((id) => todos.includes(id))) : TODOS_WIDGETS.slice(); })(),
        pulsos: pulsos.length ? areas.filter((a) => pulsos.includes(a)) : null,
        // Tamanho e opções por widget só entram quando alguém mudou algo (o estado padrão continua enxuto).
        ...(() => { const t = tamanhosValidos(w.tamanhos); return Object.keys(t).length ? { tamanhos: t } : {}; })(),
        ...(() => { const o = opcoesValidas(w.opcoes); return Object.keys(o).length ? { opcoes: o } : {}; })(),
      },
    };
  };

  // 'p' = compacto (só os números), 'l' = largo (linha inteira); o médio é o padrão e não se guarda.
  GC.TAMANHOS_WIDGET = [{ id: 'p', nome: 'Compacto' }, { id: 'm', nome: 'Médio' }, { id: 'l', nome: 'Largo' }];
  function tamanhosValidos(t) {
    const r = {};
    if (!t || typeof t !== 'object') return r;
    const todos = GC.WIDGETS.map((x) => x.id);
    Object.keys(t).sort().forEach((id) => { if (todos.includes(id) && (t[id] === 'p' || t[id] === 'l')) r[id] = t[id]; });
    return r;
  }
  function opcoesValidas(o) {
    const r = {};
    if (!o || typeof o !== 'object') return r;
    const bairros = idsBairros();
    const ehBairro = (b) => typeof b === 'string' && bairros.includes(b);
    if (o.bairro_foco && ehBairro(o.bairro_foco.bairro)) r.bairro_foco = { bairro: o.bairro_foco.bairro };
    if (o.comparativo && ehBairro(o.comparativo.a) && ehBairro(o.comparativo.b) && o.comparativo.a !== o.comparativo.b) r.comparativo = { a: o.comparativo.a, b: o.comparativo.b };
    if (o.kpi && typeof o.kpi.ind === 'string' && /^[A-Z]{3}\d{2}$/.test(o.kpi.ind)) r.kpi = { ind: o.kpi.ind };
    if (o.nota && typeof o.nota.texto === 'string' && o.nota.texto.trim()) r.nota = { texto: o.nota.texto.slice(0, 500) };
    if (o.resumo && o.resumo.periodo === 'semana') r.resumo = { periodo: 'semana' };
    return r;
  }

  GC.estadosIguais = (a, b) => JSON.stringify(GC.normalizarEstado(a)) === JSON.stringify(GC.normalizarEstado(b));

  // Quantos filtros estão ligados (cada opção marcada conta 1).
  GC.contarFiltrosEstado = function (filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    return f.areas.length + f.severidades.length + f.bairros.length + (f.recorte ? 1 : 0)
      + f.afetados.length + f.tempos.length + f.origens.length + (f.multi ? 1 : 0);
  };

  // O que uma visualização mostra, em poucas palavras (ex.: "Saúde · Crítica · 2 bairros").
  const NOMES_RECORTE = { criticas: 'Só críticas', estourado: 'Prazo estourado', andamento: 'Em atendimento' };
  const NOMES_SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };
  const nomesDe = (faixas, escolhidas) => faixas.filter((x) => escolhidas.includes(x.id)).map((x) => x.curto).join(' ou ');
  GC.resumoFiltros = function (filtros) {
    const f = GC.normalizarEstado({ filtros }).filtros;
    const partes = [];
    if (f.areas.length) partes.push(f.areas.length > 2 ? `${f.areas.length} secretarias` : f.areas.map((a) => GC.data.areas.find((x) => x.id === a).nome).join(' + '));
    if (f.recorte) partes.push(NOMES_RECORTE[f.recorte]);
    if (f.severidades.length) partes.push(f.severidades.map((s) => NOMES_SEV[s]).join(' + '));
    if (f.bairros.length) partes.push(f.bairros.length > 1 ? `${f.bairros.length} bairros` : GC.data.bairros.find((b) => b.id === f.bairros[0]).nome);
    if (f.afetados.length) partes.push(nomesDe(GC.FAIXAS_AFETADOS, f.afetados));
    if (f.tempos.length) partes.push(nomesDe(GC.FAIXAS_TEMPO, f.tempos));
    if (f.origens.length) partes.push(nomesDe(GC.ORIGENS, f.origens));
    if (f.multi) partes.push('várias secretarias');
    return partes;
  };

  // armazenamento: { ler() → objeto | null, gravar(objeto) }. Falhas de leitura/gravação não quebram nada.
  // opcoes.prontas: ids das visualizações prontas que este perfil pode escolher (sem: todas).
  GC.criarVistas = function (armazenamento, opcoes = {}) {
    // Na ordem pedida: a primeira é a padrão do perfil.
    const prontas = Array.isArray(opcoes.prontas)
      ? opcoes.prontas.map((id) => GC.VISTAS_PRONTAS.find((v) => v.id === id)).filter(Boolean) : GC.VISTAS_PRONTAS;
    let salvas = [];
    let atualId = 'cidade';
    let seq = 0;
    try {
      const lido = armazenamento && armazenamento.ler();
      if (lido && Array.isArray(lido.salvas)) {
        salvas = lido.salvas
          .filter((v) => v && typeof v.id === 'string' && typeof v.nome === 'string' && v.nome.trim())
          .map((v) => Object.assign({ id: v.id, nome: v.nome.trim().slice(0, 40), emoji: '⭐' }, GC.normalizarEstado(v)));
      }
      if (lido && typeof lido.atual === 'string') atualId = lido.atual;
    } catch (e) { /* armazenamento ilegível: começa do zero */ }

    const todas = () => [...prontas, ...salvas];
    const buscar = (id) => todas().find((v) => v.id === id) || null;
    if (!buscar(atualId)) atualId = (todas()[0] || { id: 'cidade' }).id;

    function gravar() {
      try { if (armazenamento) armazenamento.gravar({ salvas, atual: atualId }); } catch (e) { /* sem armazenamento */ }
    }
    const nomeValido = (nome) => (typeof nome === 'string' ? nome.trim().slice(0, 40) : '');
    const estadoDe = (v) => GC.normalizarEstado(v);

    return {
      lista: todas,
      buscar,
      atual: () => buscar(atualId),
      // Devolve o estado (filtros + widgets) da visualização escolhida.
      selecionar(id) {
        const v = buscar(id);
        if (!v) return null;
        atualId = id;
        gravar();
        return estadoDe(v);
      },
      // O estado atual é diferente do que a visualização escolhida guarda?
      alterada: (estado) => !GC.estadosIguais(buscar(atualId), estado),
      salvarComo(nome, estado) {
        const n = nomeValido(nome);
        if (!n) return null;
        const v = Object.assign({ id: `v-${Date.now().toString(36)}-${++seq}`, nome: n, emoji: '⭐' }, estadoDe(estado));
        salvas.push(v);
        atualId = v.id;
        gravar();
        return v;
      },
      sobrescrever(id, estado) {
        const i = salvas.findIndex((v) => v.id === id);
        if (i < 0) return false;
        salvas[i] = Object.assign({}, salvas[i], estadoDe(estado));
        gravar();
        return true;
      },
      renomear(id, nome) {
        const n = nomeValido(nome);
        const v = salvas.find((x) => x.id === id);
        if (!v || !n) return false;
        v.nome = n;
        gravar();
        return true;
      },
      // Cópia editável (também das prontas). Não troca a visualização em uso.
      duplicar(id) {
        const v = buscar(id);
        if (!v) return null;
        const nome = `${v.nome} (cópia)`.slice(0, 40);
        const copia = Object.assign({ id: `v-${Date.now().toString(36)}-${++seq}`, nome, emoji: '⭐' }, estadoDe(v));
        const i = salvas.findIndex((x) => x.id === id);
        salvas.splice(i < 0 ? salvas.length : i + 1, 0, copia);
        gravar();
        return copia;
      },
      // Sobe (-1) ou desce (+1) uma visualização salva na lista.
      mover(id, delta) {
        const i = salvas.findIndex((v) => v.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= salvas.length) return false;
        [salvas[i], salvas[j]] = [salvas[j], salvas[i]];
        gravar();
        return true;
      },
      remover(id) {
        const antes = salvas.length;
        salvas = salvas.filter((v) => v.id !== id);
        if (salvas.length === antes) return false;
        if (atualId === id) atualId = (prontas[0] || { id: 'cidade' }).id;
        gravar();
        return true;
      },
    };
  };
})(window.GC = window.GC || {});
