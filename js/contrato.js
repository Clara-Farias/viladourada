(function (GC) {
  // Contrato da IA (ver spec, "Contrato da IA"). Fica fora de ia-roteiro.js porque
  // continua valendo quando a IA roteirizada for trocada pela IA real.

  const TIPOS_GRAFICO = ['barra', 'linha', 'pizza'];
  const TIPOS_MAPA = ['calor', 'destaque'];
  const NIVEIS = ['alta', 'media', 'baixa'];
  const textoAte = (t, max) => typeof t === 'string' && t.trim().length > 0 && t.length <= max;
  const TIPOS_ACAO = ['mostrarMapa', 'agir', 'focarOcorrencia', 'perguntar', 'criarAlerta', 'abrirCamada'];
  // Camadas fixas do mapa que uma resposta pode ligar (e, com id, focar num ponto delas).
  const CAMADAS = ['leitos', 'risco', 'obras', 'escolas', 'calor-bo', 'frota', 'coleta', 'farmacias'];
  const ACOES_PREFEITO = ['cobrar', 'priorizar', 'gabinete'];
  const TEXTO_ERRO = 'Não consegui montar essa resposta agora. Tente perguntar de outro jeito.';

  GC.escaparHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // "Transformar em alerta": nome e expressão curtos, 1 a 8 fontes, área existente.
  const alertaValido = (p) => textoAte(p.nome, 120) && textoAte(p.expressao, 200)
    && Array.isArray(p.fontes) && p.fontes.length >= 1 && p.fontes.length <= 8 && p.fontes.every((f) => textoAte(f, 80))
    && ((GC.data && GC.data.areas) || []).some((x) => x.id === p.area);

  GC.validarResposta = function (r) {
    const erros = [];
    if (!r || typeof r.texto !== 'string' || !r.texto.trim()) erros.push('texto vazio');
    if (!r || typeof r !== 'object') return erros;
    const g = r.grafico;
    if (g) {
      if (!TIPOS_GRAFICO.includes(g.tipo)) erros.push(`grafico.tipo inválido: ${g.tipo}`);
      if (!g.titulo) erros.push('grafico.titulo vazio');
      if (!Array.isArray(g.rotulos) || !Array.isArray(g.series) || !g.series.length) erros.push('grafico sem rotulos/series');
      else g.series.forEach((s, i) => {
        if (!s || !s.nome || !Array.isArray(s.valores) || s.valores.length !== g.rotulos.length) erros.push(`grafico.series[${i}] inconsistente`);
      });
    }
    const m = r.mapa;
    if (m) {
      if (!TIPOS_MAPA.includes(m.tipo)) erros.push(`mapa.tipo inválido: ${m.tipo}`);
      if (m.tipo === 'calor' && (!Array.isArray(m.pontos) || !m.pontos.length || m.pontos.some((p) => !p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || typeof p.peso !== 'number'))) erros.push('mapa.pontos inválidos');
      if (m.tipo === 'destaque') {
        const ids = GC.data.bairros.map((b) => b.id);
        if (!Array.isArray(m.bairros) || !m.bairros.length || m.bairros.some((b) => !ids.includes(b))) erros.push('mapa.bairros inválidos (use ids de bairro)');
      }
      if (m.foco && (typeof m.foco.lat !== 'number' || typeof m.foco.lng !== 'number' || typeof m.foco.zoom !== 'number')) erros.push('mapa.foco inválido');
    }
    if (r.fontes !== undefined && !(Array.isArray(r.fontes) && r.fontes.length >= 1 && r.fontes.length <= 8 && r.fontes.every((f) => textoAte(f, 80)))) erros.push('fontes inválidas');
    const c = r.confiabilidade;
    if (c !== undefined && !(c && NIVEIS.includes(c.nivel) && (c.motivo === undefined || textoAte(c.motivo, 120)))) erros.push('confiabilidade inválida');
    if (r.consulta !== undefined && !textoAte(r.consulta, 2000)) erros.push('consulta inválida');
    // Base consultada: registros lidos, período coberto e hora de referência.
    const b = r.base;
    if (b !== undefined && !(b && Number.isInteger(b.registros) && b.registros >= 0 && textoAte(b.periodo, 60) && textoAte(b.referencia, 40))) erros.push('base inválida');
    if (r.acoes !== undefined && !Array.isArray(r.acoes)) erros.push('acoes não é lista');
    (Array.isArray(r.acoes) ? r.acoes : []).forEach((a, i) => {
      if (!a || !a.rotulo || !TIPOS_ACAO.includes(a.tipo) || !a.payload || typeof a.payload !== 'object') erros.push(`acoes[${i}] inválida`);
      else if (a.tipo === 'agir' && (typeof a.payload.ocorrenciaId !== 'string' || !ACOES_PREFEITO.includes(a.payload.acao))) erros.push(`acoes[${i}] agir inválida`);
      else if (a.tipo === 'criarAlerta' && !alertaValido(a.payload)) erros.push(`acoes[${i}] criarAlerta inválida`);
      else if (a.tipo === 'abrirCamada' && (!CAMADAS.includes(a.payload.camada) || (a.payload.id !== undefined && !textoAte(a.payload.id, 120)))) erros.push(`acoes[${i}] abrirCamada inválida`);
    });
    return erros;
  };

  // Deixa qualquer resposta segura para exibir: mantém o que é válido, descarta o resto.
  // mostrarMapa sem payload.mapa usa o mapa da própria resposta.
  GC.sanearResposta = function (r) {
    if (!r || typeof r !== 'object' || typeof r.texto !== 'string' || !r.texto.trim()) return { texto: TEXTO_ERRO };
    const out = { texto: r.texto };
    if (r.cenario) out.cenario = r.cenario;
    if (r.grafico && !GC.validarResposta({ texto: 'x', grafico: r.grafico }).length) out.grafico = r.grafico;
    if (r.mapa && !GC.validarResposta({ texto: 'x', mapa: r.mapa }).length) out.mapa = r.mapa;
    ['fontes', 'confiabilidade', 'consulta', 'base'].forEach((campo) => {
      if (r[campo] !== undefined && !GC.validarResposta({ texto: 'x', [campo]: r[campo] }).length) out[campo] = r[campo];
    });
    const acoes = (Array.isArray(r.acoes) ? r.acoes : []).map((a) => {
      if (!a || typeof a !== 'object') return null;
      let payload = a.payload && typeof a.payload === 'object' ? a.payload : {};
      if (a.tipo === 'mostrarMapa' && !payload.mapa && out.mapa) payload = Object.assign({}, payload, { mapa: out.mapa });
      return Object.assign({}, a, { payload });
    }).filter((a) => a && !GC.validarResposta({ texto: 'x', acoes: [a] }).length)
      .filter((a) => a.tipo !== 'mostrarMapa' || (a.payload.mapa && !GC.validarResposta({ texto: 'x', mapa: a.payload.mapa }).length));
    if (acoes.length) out.acoes = acoes;
    return out;
  };
})(window.GC = window.GC || {});
