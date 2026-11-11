(function (GC) {
  // Perfis de acesso (da proposta "versão clara": GMX, GST e CID):
  // - prefeito (gestor geral): Prefeito(a), Gabinete, Planejamento. Vê e age em tudo.
  // - setor (gestor setorial): secretário(a) de uma pasta. Tudo travado na pasta dele; não cobra outras
  //   secretarias nem convoca gabinete (isso é do prefeito); prioriza o que é da pasta e avança as tarefas
  //   dela no gabinete de crise.
  // - cidadao: interface aberta. Avisos, "meu bairro", perguntas frequentes e indicadores públicos; nada
  //   interno (alertas, Copiloto, dashboard, dados, camadas sensíveis).
  // Escolha: ?perfil=prefeito|setor|cidadao (&area=<secretaria> no setor), senão o último escolhido, senão prefeito.
  // Trocar recarrega a página (como a troca de cidade): cada perfil abre limpo.
  // Roda depois de store.js (filtra GC.acoesDisponiveis) e antes da interface.

  GC.PERFIS = [
    { id: 'prefeito', nome: 'Gestor geral', quem: 'Prefeito(a), Gabinete e Planejamento', emoji: '🏛', descricao: 'Todas as secretarias, alertas, gabinete de crise, ' + GC.agente() + ' e dados.' },
    { id: 'setor', nome: 'Gestor do setor', quem: 'Secretário(a) e coordenadores de uma pasta', emoji: '👤', descricao: 'Só a própria secretaria: alertas, indicadores, relatórios e as tarefas dela nos gabinetes de crise.' },
    { id: 'cidadao', nome: 'Cidadão', quem: 'Qualquer pessoa (interface aberta)', emoji: '👥', descricao: 'Avisos da Prefeitura, serviços do bairro, perguntas frequentes e indicadores públicos.' },
  ];

  const CHAVE = 'vd-perfil';
  const valido = (id) => GC.PERFIS.some((p) => p.id === id);
  const areaValida = (a) => ((GC.data && GC.data.areas) || []).some((x) => x.id === a);

  // Perfil a partir dos dados de entrada (testável): { id, area }. Setor sem área válida cai na primeira pasta.
  GC.resolverPerfil = function (id, area) {
    const pid = valido(id) ? id : 'prefeito';
    if (pid !== 'setor') return { id: pid, area: null };
    return { id: 'setor', area: areaValida(area) ? area : GC.data.areas[0].id };
  };

  function escolher() {
    if (GC.perfilForcado) return GC.resolverPerfil(GC.perfilForcado.id, GC.perfilForcado.area);
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('perfil')) return GC.resolverPerfil(q.get('perfil'), q.get('area'));
      const salvo = JSON.parse(window.localStorage.getItem(CHAVE) || 'null');
      if (salvo) return GC.resolverPerfil(salvo.id, salvo.area);
    } catch (e) { /* sem location/localStorage (testes, modo privado) */ }
    return GC.resolverPerfil('prefeito');
  }

  // Cada perfil tem a sua página: o cidadão, o Portal do Cidadão (cidadao.html), sem nada do painel do
  // gestor carregado; os gestores, o painel (index.html). A cidade da demonstração vai junto.
  GC.paginaDoPerfil = (id) => (id === 'cidadao' ? 'cidadao.html' : 'index.html');
  GC.urlDoPerfil = function (id, area, base = window.location.href) {
    const p = GC.resolverPerfil(id, area);
    const atual = new URL(base);
    const u = new URL(GC.paginaDoPerfil(p.id), atual);
    u.search = atual.search;
    u.searchParams.set('perfil', p.id);
    if (p.area) u.searchParams.set('area', p.area); else u.searchParams.delete('area');
    u.hash = '';
    return u.toString();
  };

  GC.escolherPerfil = function (id, area) {
    const p = GC.resolverPerfil(id, area);
    try { window.localStorage.setItem(CHAVE, JSON.stringify(p)); } catch (e) { /* segue pela URL */ }
    window.location.href = GC.urlDoPerfil(p.id, p.area);
  };

  GC.perfil = escolher();
  // O painel do gestor nunca abre no perfil Cidadão: vai direto para o portal (antes de montar qualquer coisa).
  if (GC.perfil.id === 'cidadao' && typeof document !== 'undefined' && document.body && document.body.dataset.pagina === 'gestor') {
    GC.redirecionando = true;
    window.location.replace(GC.urlDoPerfil('cidadao'));
  }
  const nomeArea = (a) => (GC.data.areas.find((x) => x.id === a) || { secretaria: { nome: a } }).secretaria.nome;
  GC.perfilRotulo = (p = GC.perfil) => (p.id === 'setor' ? nomeArea(p.area) : p.id === 'cidadao' ? 'Visão do cidadão' : 'Gestor geral');

  // ---- telas: o que cada perfil abre (o resto é redirecionado) ----
  // Devolve a própria rota quando pode; senão a rota equivalente permitida.
  GC.rotaDoPerfil = function (rota, p = GC.perfil) {
    if (p.id === 'prefeito') return rota;
    if (p.id === 'cidadao') {
      if (rota.tela === 'cidadao' || rota.tela === 'painel') return rota;
      if (rota.tela === 'indicadores') return Object.assign({}, rota, { alvo: rota.alvo && GC.indicadorPublico && !GC.indicadorPublico(rota.alvo) ? null : rota.alvo });
      return { tela: 'cidadao' };
    }
    // setor
    const a = p.area;
    if (rota.tela === 'painel' || rota.tela === 'alertas' || rota.tela === 'crise') return rota;
    if (rota.tela === 'secretaria' || rota.tela === 'secretarias') return rota.area === a ? rota : { tela: 'secretaria', area: a };
    const daPasta = (id) => ((GC.CATALOGO_INDICADORES || []).find((i) => i.id === id) || {}).area === a;
    if (rota.tela === 'cruzamento') return rota; // a tela só oferece os indicadores da pasta (+ chuva)
    if (rota.tela === 'personalizar' || rota.tela === 'admin') return { tela: 'painel' }; // marca e administração: só o gestor geral
    if (rota.tela === 'indicadores') return rota.alvo === a || daPasta(rota.alvo) ? rota : { tela: 'indicadores', alvo: a };
    if (rota.tela === 'relatorios') return rota.tipo === 'secretaria' && rota.alvo === a ? rota : { tela: 'relatorios', tipo: 'secretaria', alvo: a, periodo: GC.periodoDoRelatorio ? GC.periodoDoRelatorio('secretaria', rota.periodo) : '30' };
    return { tela: 'secretaria', area: a }; // dados, cidadão: fora do perfil
  };

  GC.rotaInicialDoPerfil = (p = GC.perfil) => (p.id === 'cidadao' ? { tela: 'cidadao' } : { tela: 'painel' });

  // ---- menu ----
  GC.menuDoPerfil = function (itens, p = GC.perfil) {
    if (p.id === 'prefeito') return itens;
    if (p.id === 'cidadao') {
      return [
        { rota: { tela: 'cidadao' }, emoji: '👥', nome: 'Para você' },
        { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
        // Indicadores públicos: pela doca da base do mapa (a gaveta de Indicadores), como nos outros perfis.
      ];
    }
    const a = GC.data.areas.find((x) => x.id === p.area);
    return [
      { rota: { tela: 'painel' }, emoji: '🗺', nome: 'Mapa' },
      { rota: { tela: 'secretaria', area: p.area }, emoji: a.secretaria.emoji, nome: 'Minha secretaria', area: null },
      { rota: { tela: 'crise', id: null }, emoji: '🚨', nome: 'Gabinete de crise' },
      { rota: { tela: 'relatorios', tipo: 'secretaria', alvo: p.area, periodo: '30' }, emoji: '📄', nome: 'Relatório da pasta' },
      { rota: { tela: 'cruzamento' }, emoji: '🔀', nome: 'Cruzamento de dados' },
    ];
  };

  // ---- ações sobre ocorrências ----
  // Setor: só "priorizar", e só no que é da pasta. Cidadão: nenhuma. A store usa GC.acoesDisponiveis
  // para validar store.agir, então a regra vale para todo botão e para o Copiloto.
  GC.filtrarAcoesDoPerfil = function (acoes, o, p = GC.perfil) {
    if (p.id === 'prefeito') return acoes;
    if (p.id === 'cidadao') return [];
    return o && o.area === p.area ? acoes.filter((x) => x === 'priorizar') : [];
  };
  if (GC.acoesDisponiveis && !GC.acoesDisponiveis.doPerfil) {
    const base = GC.acoesDisponiveis;
    GC.acoesDisponiveis = (o) => GC.filtrarAcoesDoPerfil(base(o), o);
    GC.acoesDisponiveis.doPerfil = true;
  }

  // Gabinete de crise: o prefeito faz tudo; o setor só avança as tarefas da pasta dele.
  GC.podeNaCrise = function (acao, areaTarefa, p = GC.perfil) {
    if (p.id === 'prefeito') return true;
    if (p.id === 'setor') return acao === 'avancar' && areaTarefa === p.area;
    return false;
  };

  // Widgets do gestor do setor: os gerais (já filtrados pela pasta) + os temas da pasta. Visualização inicial dele.
  const WIDGETS_DA_AREA = {
    saude: ['leitos', 'medicamentos', 'social'], seguranca: ['seguranca'], educacao: ['educacao', 'social'], mobilidade: ['frota'],
    limpeza: ['coleta'], defesa_civil: ['risco'], infraestrutura: ['obras'],
  };
  const WIDGETS_GERAIS = ['numeros', 'pulsos', 'desempenho', 'satisfacao'];
  GC.widgetsDoPerfil = function (ativos, p = GC.perfil) {
    if (p.id !== 'setor') return ativos;
    const pode = [...WIDGETS_GERAIS, ...(WIDGETS_DA_AREA[p.area] || [])];
    // Widgets fixados do Copiloto: o gestor do setor só consegue criá-los com temas da pasta dele.
    const filtrados = ativos.filter((id) => pode.includes(id) || (GC.ehWidgetIA && GC.ehWidgetIA(id)));
    return filtrados.length ? filtrados : pode.filter((id) => (GC.WIDGETS || []).some((w) => w.id === id));
  };
  const VISTA_DA_AREA = { saude: 'saude', seguranca: 'seguranca', educacao: 'educacao', mobilidade: 'frota', limpeza: 'limpeza', defesa_civil: 'chuva', infraestrutura: 'chuva' };
  GC.vistaDoSetor = (area) => VISTA_DA_AREA[area] || null;

  // Áreas que o perfil enxerga (null = todas). Usado para travar o filtro do gestor do setor.
  GC.areasDoPerfil = (p = GC.perfil) => (p.id === 'setor' ? [p.area] : null);

  // Camadas do mapa abertas ao cidadão (B.O.s, leitos, estoque de remédios e frota interna ficam de fora).
  GC.CAMADAS_PUBLICAS = ['toggle-risco', 'toggle-obras', 'toggle-escolas', 'toggle-coleta', 'toggle-conquistas'];

  // Camadas do gestor do setor: as públicas (contexto da cidade) + as internas da própria pasta.
  // B.O.s só para a Segurança; leitos e estoque de remédios só para a Saúde; a frota inclui o SAMU.
  const CAMADAS_DA_AREA = { saude: ['toggle-leitos', 'toggle-farmacias', 'toggle-frota'], seguranca: ['toggle-calor-bo'], mobilidade: ['toggle-frota'] };
  GC.camadasDoPerfil = (p = GC.perfil) => (p.id === 'setor' ? [...GC.CAMADAS_PUBLICAS, ...(CAMADAS_DA_AREA[p.area] || [])] : null);
  GC.podeCamada = (toggleId, p = GC.perfil) => { const c = GC.camadasDoPerfil(p); return !c || c.includes(toggleId); };

  // Visualizações prontas que o perfil pode escolher (null = todas): o setor fica com a da pasta e "Críticas agora".
  GC.vistasProntasDoPerfil = (p = GC.perfil) => (p.id === 'setor' ? [GC.vistaDoSetor(p.area), 'criticas'].filter(Boolean) : null);

  // Ocorrência (sozinha ou com várias secretarias) que diz respeito à pasta do perfil. Prefeito: todas.
  GC.ocorrenciaDoPerfil = function (o, p = GC.perfil) {
    if (p.id !== 'setor') return true;
    return !!o && (o.area === p.area || (o.areasEnvolvidas || []).includes(p.area));
  };

  // Busca rápida: o setor acha os bairros, as ocorrências da pasta, a própria secretaria e as camadas que pode ver.
  const CAMADA_DO_ITEM = { leito: 'toggle-leitos', escola: 'toggle-escolas', obra: 'toggle-obras', farmacia: 'toggle-farmacias', linha: 'toggle-frota', coleta: 'toggle-coleta', risco: 'toggle-risco' };
  const TELAS_DO_SETOR = ['alertas', 'relatorios'];
  GC.filtrarBuscaDoPerfil = function (itens, p = GC.perfil) {
    if (p.id !== 'setor') return itens;
    return itens.filter((it) => {
      if (it.tipo === 'secretaria') return it.id === p.area;
      if (it.tipo === 'tela') return TELAS_DO_SETOR.includes(it.id);
      if (it.tipo === 'ocorrencia') return it.area === p.area || (it.areas || []).includes(p.area);
      if (CAMADA_DO_ITEM[it.tipo]) return GC.podeCamada(CAMADA_DO_ITEM[it.tipo], p);
      return true;
    });
  };
})(window.GC = window.GC || {});
