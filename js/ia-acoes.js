(function (GC) {
  // Ações pré-definidas do agente de IA (botões acima do campo de pergunta) e as intenções que faltavam no
  // roteiro: cruzar dados, gerar relatório, "qual bairro está pior" e "o que fazer primeiro".
  // Roda depois de ia-roteiro.js: envolve GC.ia.perguntar e devolve ao roteiro tudo o que não é daqui.
  if (!GC.ia) return;
  const original = GC.ia.perguntar;
  const norm = GC.ia.normalizar;
  const PESO = { critica: 3, alta: 2, media: 1 };
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const area = (id) => GC.data.areas.find((a) => a.id === id);
  const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

  // Botões do chat. Mudam com o perfil: o secretário vê o relatório e os cruzamentos da pasta dele.
  GC.ia.acoesRapidas = function (perfil = GC.perfil) {
    if (perfil && perfil.id === 'cidadao') return [];
    const pronto = GC.cruzamento ? GC.cruzamento.prontos(perfil)[0] : null;
    const setor = perfil && perfil.id === 'setor';
    return [
      { rotulo: '📄 Gerar relatório', texto: setor ? 'Gerar o relatório da minha secretaria' : 'Gerar o relatório executivo' },
      ...(pronto ? [{ rotulo: '🔀 Cruzar dados', texto: `Cruze ${GC.cruzamento.indicador(pronto.a).nome.toLowerCase()} com ${GC.cruzamento.indicador(pronto.b).nome.toLowerCase()} nos últimos 3 meses por região` }] : []),
      ...(GC.modelos && !setor ? [{ rotulo: '🗂 Gerar documento', texto: 'Quais modelos você gera?' }] : []),
      { rotulo: '⏱ O que fazer primeiro', texto: 'O que devo fazer primeiro?' },
      ...(setor ? [] : [{ rotulo: '📍 Bairro mais crítico', texto: 'Qual bairro está pior hoje?' }]),
      { rotulo: '🗓 Resumo da semana', texto: 'Resumo da semana' },
    ];
  };

  // Gráfico do chat: as duas séries em índice (1º mês = 100), porque têm unidades diferentes; o texto traz os valores.
  function graficoIndice(res) {
    const indice = (s) => { const base = s.find((v) => v != null && v !== 0); return s.map((v) => (v == null || !base ? null : Math.round((v / base) * 100))); };
    return {
      tipo: 'linha',
      titulo: `${res.a.curto} × ${res.b.curto} · ${res.recorteNome} (índice, ${res.rotulos[0]} = 100)`,
      rotulos: res.rotulos,
      series: [{ nome: res.a.nome, valores: indice(res.serieA) }, { nome: res.b.nome, valores: indice(res.serieB) }],
      unidade: 'índice',
    };
  }

  function cruzar(texto, contexto) {
    const p = GC.cruzamento.interpretar(texto);
    if (!p.a || !p.b) return { cenario: 'cruzamento', texto: 'Seu perfil não tem indicadores para cruzar.' };
    const res = GC.cruzamento.cruzar(p.a, p.b, p);
    const outros = GC.cruzamento.prontos().filter((x) => !(x.a === res.a.id && x.b === res.b.id)).slice(0, 2);
    const tabela = res.recorte === 'cidade'
      ? `\n\nPor região (${res.a.curto} / ${res.b.curto}): ${res.porRegiao.map((r) => `${r.nome.replace('Região ', '')} ${GC.cruzamento.formatar(res.a, r.a)} / ${GC.cruzamento.formatar(res.b, r.b)}`).join(' · ')}.`
      : '';
    return {
      cenario: 'cruzamento',
      texto: res.leitura.join('\n\n') + tabela,
      grafico: graficoIndice(res),
      acoes: [
        { rotulo: '🔀 Abrir no Cruzamento de dados', tipo: 'abrirTela', payload: { rota: { tela: 'cruzamento', a: res.a.id, b: res.b.id, meses: res.meses, recorte: res.recorte } } },
        ...outros.map((x) => ({ rotulo: `Cruzar ${x.rotulo.toLowerCase()}`, tipo: 'perguntar', payload: { texto: `Cruze ${GC.cruzamento.indicador(x.a).nome.toLowerCase()} com ${GC.cruzamento.indicador(x.b).nome.toLowerCase()} nos últimos ${res.meses} meses por região` } })),
      ],
    };
  }

  function relatorio(contexto) {
    const setor = GC.perfil && GC.perfil.id === 'setor';
    const ativas = (contexto.ocorrencias || []).filter((o) => !setor || o.area === GC.perfil.area);
    const criticas = ativas.filter((o) => o.severidade === 'critica').length;
    const d = contexto.desempenho || {};
    const res = Object.values(d).reduce((s, x) => s + ((x && x.resolvidas) || 0), 0);
    const rota = setor
      ? { tela: 'relatorios', tipo: 'secretaria', alvo: GC.perfil.area, periodo: '30' }
      : { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' };
    const nome = setor ? `da ${area(GC.perfil.area).secretaria.nome}` : 'executivo do Gabinete';
    return {
      cenario: 'relatorio',
      texto: `Relatório ${nome}, últimos 30 dias: ${plural(ativas.length, 'ocorrência aberta', 'ocorrências abertas')} (${plural(criticas, 'crítica', 'críticas')})${res ? ` e ${plural(res, 'resolvida', 'resolvidas')} no período` : ''}. Abra o relatório completo para ver o ranking das secretarias, o que fazer agora e baixar em PDF ou CSV.`,
      acoes: [
        { rotulo: '📄 Abrir o relatório completo', tipo: 'abrirTela', payload: { rota } },
        ...(setor ? [] : [{ rotulo: '🔀 Cruzar dados', tipo: 'abrirTela', payload: { rota: { tela: 'cruzamento' } } }]),
      ],
    };
  }

  // Gravidade das ocorrências abertas por bairro (crítica 3, alta 2, média 1) + quantas passaram do prazo.
  function piorBairro(contexto) {
    const pontos = {};
    (contexto.ocorrencias || []).forEach((o) => {
      const p = pontos[o.bairroId] || (pontos[o.bairroId] = { id: o.bairroId, pontos: 0, n: 0, criticas: 0 });
      p.pontos += PESO[o.severidade] || 1;
      p.n += 1;
      if (o.severidade === 'critica') p.criticas += 1;
    });
    const r = Object.values(pontos).sort((a, b) => b.pontos - a.pontos || b.criticas - a.criticas);
    if (!r.length) return { cenario: 'pior_bairro', texto: 'Nenhuma ocorrência aberta agora: nenhum bairro se destaca.' };
    const [p1, ...resto] = r;
    const sat = (GC.data.satisfacaoPorBairro || {})[p1.id];
    return {
      cenario: 'pior_bairro',
      texto: `${bairro(p1.id).nome} está pior hoje: ${plural(p1.n, 'ocorrência aberta', 'ocorrências abertas')}, ${plural(p1.criticas, 'crítica', 'críticas')}${sat ? `, satisfação de ${sat}%` : ''}. Depois vêm ${resto.slice(0, 2).map((x) => `${bairro(x.id).nome} (${x.n}, ${x.criticas} crít.)`).join(' e ')}. A conta soma a gravidade das ocorrências abertas (crítica 3, alta 2, média 1).`,
      grafico: { tipo: 'barra', titulo: 'Gravidade das ocorrências abertas por bairro', rotulos: r.slice(0, 6).map((x) => bairro(x.id).nome), series: [{ nome: 'Pontos de gravidade', valores: r.slice(0, 6).map((x) => x.pontos) }], unidade: 'pontos' },
      acoes: [{ rotulo: `Como está o bairro ${bairro(p1.id).nome}?`, tipo: 'perguntar', payload: { texto: `Como está o bairro ${bairro(p1.id).nome}?` } }],
    };
  }

  // A mais urgente: crítica antes de alta; entre iguais, a aberta há mais tempo.
  function primeiro(contexto) {
    const setor = GC.perfil && GC.perfil.id === 'setor';
    const lista = (contexto.ocorrencias || []).filter((o) => !setor || o.area === GC.perfil.area)
      .slice().sort((a, b) => (PESO[b.severidade] || 0) - (PESO[a.severidade] || 0) || (b.abertaHaMin || 0) - (a.abertaHaMin || 0));
    if (!lista.length) return { cenario: 'primeiro', texto: 'Nada em aberto agora. Bom momento para olhar as metas fora do prazo em Indicadores.' };
    const [o, o2] = lista;
    const h = Math.round((o.abertaHaMin || 0) / 60);
    const acoes = [{ rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } }];
    const pode = GC.acoesDisponiveis ? GC.acoesDisponiveis(o) : ['cobrar'];
    if (pode.includes('cobrar')) acoes.unshift({ rotulo: `📣 Cobrar ${area(o.area).secretaria.nome}`, tipo: 'agir', payload: { ocorrenciaId: o.id, acao: 'cobrar' } });
    else if (pode.includes('priorizar')) acoes.unshift({ rotulo: '⚡ Priorizar', tipo: 'agir', payload: { ocorrenciaId: o.id, acao: 'priorizar' } });
    return {
      cenario: 'primeiro',
      texto: `Comece por: ${o.titulo} (${bairro(o.bairroId).nome}). É ${o.severidade === 'critica' ? 'crítica' : o.severidade}, aberta há ${h >= 1 ? plural(h, 'hora', 'horas') : `${o.abertaHaMin} min`}, com cerca de ${(o.afetados || 0).toLocaleString('pt-BR')} pessoas afetadas, e está com a ${area(o.area).secretaria.nome}.${o2 ? ` Em seguida: ${o2.titulo} (${bairro(o2.bairroId).nome}).` : ''}`,
      acoes,
    };
  }

  // "Faça um card sobre a coleta", "imagem para redes do aviso de chuva" → modelo do Estúdio já preenchido.
  function imagem(texto) {
    const q = ` ${norm(texto)} `;
    const modelo = /chuva|aviso|alerta|alaga|desliza|risco/.test(q) ? 'aviso' : /entreg|inaugur|obra conclu|conquista/.test(q) ? 'entrega' : /evolu|grafico|meses|historico/.test(q) ? 'evolucao' : 'numero';
    const CHAVES = { saude: 'saude|ubs|hospital|vacina', infraestrutura: 'energia|obra|infra', educacao: 'escola|educa|aluno', defesa_civil: 'alaga|defesa', seguranca: 'seguran|crime|b\\.o', mobilidade: 'transito|onibus|mobilidade|desloc', limpeza: 'coleta|lixo|limpeza' };
    const area = Object.keys(CHAVES).find((a) => new RegExp(CHAVES[a]).test(q));
    const alvo = modelo === 'numero' || modelo === 'evolucao' ? (area || null) : null;
    const nomes = { numero: 'Número em destaque', evolucao: 'Evolução em 6 meses', aviso: 'Aviso à população', entrega: 'Entrega à população' };
    return {
      cenario: 'imagem',
      texto: `Preparei no Estúdio o modelo "${nomes[modelo]}"${alvo ? ` com os dados da ${GC.data.areas.find((a) => a.id === alvo).secretaria.nome}` : ''}. Os números vêm da base e as cores e o logo, da marca; é só conferir e baixar o PNG.`,
      acoes: [{ rotulo: '🖼 Abrir no Estúdio', tipo: 'abrirTela', payload: { rota: { tela: 'estudio', modelo, alvo } } }],
    };
  }

  const EH_CRUZAR = /\bcruz|correlac|relacao entre|versus|\bvs\b| x |compar(e|ar) .+ com/;
  GC.ia.perguntar = function (texto, contexto = {}) {
    const q = ` ${norm(texto)} `;
    // Modelos de documentos (briefing, prestação de contas, card, gráfico, slides, pauta, áudio, FAQ, Excel).
    const doc = GC.modelos && GC.storeAtual ? GC.modelos.responder(texto) : null;
    if (doc) return doc;
    if (GC.MODELOS_ESTUDIO && /\b(card|post|postagem|imagem|arte|banner)\b/.test(q)) return imagem(texto);
    if (GC.cruzamento && EH_CRUZAR.test(q)) return cruzar(texto, contexto);
    if (/\b(gerar|gere|montar|monte|fazer|faca)\b.*relatorio|^ relatorio /.test(q)) return relatorio(contexto);
    if (/bairro.*(pior|mais critic|mais grave|mais problema)|pior bairro/.test(q)) return piorBairro(contexto);
    if (/o que (eu )?(devo |preciso )?fazer primeiro|por onde (eu )?comec|mais urgente agora|prioridade agora/.test(q)) return primeiro(contexto);
    return original(texto, contexto);
  };
})(window.GC = window.GC || {});
