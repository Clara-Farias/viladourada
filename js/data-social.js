(function (GC) {
  // Assistência Social × Saúde × Escola: o cruzamento do Cadastro Único (CadÚnico) com a agenda das UBS e a
  // frequência escolar. Item do workshop de 04/11 (Ana): "criança faltando em consulta e escola" (ECA), e a
  // pergunta da proposta "versão clara": famílias vulneráveis faltando a consultas.
  // Privacidade: só números agregados por bairro. A lista nominal fica com o CRAS e a UBS do território.
  //
  // Escrito à mão, mas coerente com o que já existe: a vulnerabilidade de cada bairro sai da escolaridade da
  // população (data-educacao) e da satisfação (data.js), então vale nas 3 cidades sem tocar em cidade.js.
  // A série de faltas conta a história dos lembretes por WhatsApp (marco de jun. na Saúde): a média da cidade
  // caiu, a das famílias vulneráveis quase não mudou (muitas não têm celular atualizado no cadastro).

  const PESSOAS_POR_DOMICILIO = 3.1;
  // Faltas em consultas agendadas (% das consultas), últimos 12 meses (nov/25 a out/26). Lembretes em jun.
  const SERIE_FALTAS = {
    geral: [18, 18, 17, 18, 17, 17, 16, 11, 10, 11, 10, 11],
    vulneraveis: [25, 26, 25, 25, 24, 25, 24, 22, 22, 23, 22, 23],
  };
  const MES_LEMBRETE = 7; // índice do mês em que os lembretes por WhatsApp começaram

  // Número pseudo-aleatório estável por bairro (mesmo bairro, mesmo número em toda carga).
  const hash = (texto) => {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  };
  const limitar = (n, min, max) => Math.max(min, Math.min(max, n));

  // Índice de vulnerabilidade do bairro, de 0 (menos) a 1 (mais vulnerável).
  function vulnerabilidade(id) {
    const esc = ((GC.data.educacao || {}).populacao || {}).alfabetizados15 || {};
    const alfa = esc[id] ?? 95;
    const sat = (GC.data.satisfacaoPorBairro || {})[id] ?? 72;
    const v = 0.55 * ((98.5 - alfa) / 8.5) + 0.35 * ((84 - sat) / 28) + 0.1 * hash(id);
    return limitar(v, 0, 1);
  }

  function porBairro() {
    return GC.data.bairros.map((b) => {
      const v = vulnerabilidade(b.id);
      const domicilios = b.populacao / PESSOAS_POR_DOMICILIO;
      const familias = Math.round(domicilios * (0.16 + 0.3 * v));
      const vulneraveis = Math.round(familias * (0.34 + 0.36 * v));
      const faltando = Math.round(vulneraveis * (0.035 + 0.07 * v)); // 2+ faltas em consultas nos últimos 90 dias
      const semLembrete = Math.round(faltando * (0.4 + 0.3 * v)); // sem celular atualizado no CadÚnico
      const criancas = Math.round(faltando * (0.1 + 0.16 * v)); // 0 a 14 anos: falta em consulta E frequência < 75%
      const atualizadoPct = Math.round(limitar(89 - 22 * v + 4 * hash(`${b.id}·cad`), 55, 95));
      return { id: b.id, nome: b.nome, populacao: b.populacao, vulnerabilidade: Math.round(v * 100) / 100, familias, vulneraveis, faltando, semLembrete, criancas, atualizadoPct };
    });
  }

  // Situação do bairro, sempre em relação à própria cidade (vale nos 3 portes): crítico com taxa de faltas
  // 15% acima da média da cidade; atenção a partir da média.
  const taxa = (b) => (b.vulneraveis ? (b.faltando / b.vulneraveis) * 100 : 0);
  function situacao(b, mediaTaxa) {
    if (taxa(b) >= mediaTaxa * 1.15) return 'critica';
    if (taxa(b) >= mediaTaxa) return 'atencao';
    return 'ok';
  }

  function resumo() {
    const lista = porBairro();
    const soma = (campo) => lista.reduce((s, b) => s + b[campo], 0);
    const familias = soma('familias');
    const vulneraveis = soma('vulneraveis');
    const faltando = soma('faltando');
    const mediaTaxa = vulneraveis ? (faltando / vulneraveis) * 100 : 0;
    const bairros = lista.map((b) => Object.assign(b, { taxaPct: Math.round(taxa(b) * 10) / 10, situacao: situacao(b, mediaTaxa) }))
      .sort((x, y) => y.faltando - x.faltando || y.criancas - x.criancas);
    const ultimo = SERIE_FALTAS.geral.length - 1;
    return {
      familias,
      vulneraveis,
      faltando,
      faltandoPct: Math.round(mediaTaxa * 10) / 10,
      semLembrete: soma('semLembrete'),
      criancas: soma('criancas'),
      atualizadoPct: familias ? Math.round(lista.reduce((s, b) => s + b.atualizadoPct * b.familias, 0) / familias) : 0,
      bairros,
      criticos: bairros.filter((b) => b.situacao === 'critica'),
      serie: { rotulos: (GC.data.mesesSerie || []).slice(), geral: SERIE_FALTAS.geral.slice(), vulneraveis: SERIE_FALTAS.vulneraveis.slice(), marco: MES_LEMBRETE },
      // Efeito dos lembretes: antes (média dos 3 meses anteriores) × depois (média dos últimos 3).
      efeitoLembrete: {
        geralAntes: media(SERIE_FALTAS.geral.slice(MES_LEMBRETE - 3, MES_LEMBRETE)),
        geralDepois: media(SERIE_FALTAS.geral.slice(ultimo - 2)),
        vulneraveisAntes: media(SERIE_FALTAS.vulneraveis.slice(MES_LEMBRETE - 3, MES_LEMBRETE)),
        vulneraveisDepois: media(SERIE_FALTAS.vulneraveis.slice(ultimo - 2)),
      },
      fonte: 'CadÚnico (MDS) × e-SUS APS × diário de classe',
    };
  }
  function media(v) { return Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10; }

  GC.social = { resumo, vulnerabilidade };
})(window.GC = window.GC || {});
