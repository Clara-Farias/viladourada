(function (GC) {
  // Educação: rede de escolas (alunos, professores faltando, frequência, evasão, alfabetização no 3º ano) e
  // escolaridade da população por bairro (15+ alfabetizados, 25+ com ensino médio). Pedidos do workshop de
  // 04/11: falta de professor e evasão (amarelo); professores e alunos por escola, comparecimento,
  // alfabetizados e ensino médio (verde). Spec: docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md.
  // Escrito à mão, mas coerente: frequência e ocupação batem com as unidades da Secretaria de Educação e com
  // GC.data.series.frequenciaEscolar; a Escola Lagoa Azul é a que está sem água (oc-15).
  const AULAS_POR_PROFESSOR = 20; // aulas por semana que um professor faltando deixa de dar
  const LIMITE = { evasaoCritica: 6, evasaoAtencao: 4, freqCritica: 92, freqAtencao: 94, faltaCritica: 4, faltaAtencao: 1, filaCritica: 50 };

  const centroDe = (id) => GC.data.bairros.find((b) => b.id === id).centro;
  // e(id, nome, tipo, bairro, desloc, alunos, capacidade, professores, professoresNecessarios, frequência %, evasão %,
  //   alfabetizados no 3º ano %, fila de espera)
  const e = (id, nome, tipo, bairroId, [dLat, dLng], alunos, capacidade, professores, necessarios, frequenciaPct, evasaoPct, alfabetizacao3anoPct, fila = 0) => {
    const [lat, lng] = centroDe(bairroId);
    return { id, nome, tipo, bairroId, lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5), alunos, capacidade, professores, necessarios, frequenciaPct, evasaoPct, alfabetizacao3anoPct, fila };
  };

  const escolas = [
    e('emef-lagoa', 'Escola Lagoa Azul', 'emef', 'lagoa_azul', [0.006, -0.002], 780, 750, 33, 38, 91, 6.8, 64),
    e('emef-serra', 'Escola Alto da Serra', 'emef', 'alto_da_serra', [0.005, 0.003], 560, 585, 26, 29, 93, 5.4, 68),
    e('cmei-vila-nova', 'CMEI Vila Nova', 'cmei', 'vila_nova', [-0.0045, -0.0035], 240, 240, 18, 20, 94, null, null, 88),
    e('emef-vn', 'Escola Vila Nova', 'emef', 'vila_nova', [-0.006, 0.002], 860, 880, 40, 42, 94, 3.9, 74),
    e('emef-jardim', 'Escola Jardim das Flores', 'emef', 'jardim_das_flores', [0.005, -0.005], 590, 650, 28, 30, 96, 2.1, 79),
    e('emef-porto', 'Escola Porto Dourado', 'emef', 'porto_dourado', [0.0035, 0.0055], 520, 560, 25, 26, 95, 2.6, 77),
    e('emef-centro', 'Escola Centro', 'emef', 'centro', [-0.0025, 0.0055], 820, 920, 41, 41, 96, 1.8, 82),
    e('emef-bela', 'Escola Bela Vista', 'emef', 'bela_vista', [-0.005, 0.002], 640, 700, 32, 32, 97, 1.2, 88),
    e('emef-industrial', 'Escola Parque Industrial', 'emef', 'parque_industrial', [-0.0055, 0.005], 410, 505, 21, 21, 98, 1.0, 85),
  ];

  // Escolaridade da população por bairro (censo fictício): % de 15+ alfabetizados e % de 25+ com ensino médio.
  const populacao = {
    alfabetizados15: { centro: 97.1, bela_vista: 98.0, jardim_das_flores: 96.4, parque_industrial: 95.8, lagoa_azul: 91.2, alto_da_serra: 92.5, vila_nova: 94.0, porto_dourado: 95.1 },
    ensinoMedio25: { centro: 62, bela_vista: 68, jardim_das_flores: 57, parque_industrial: 49, lagoa_azul: 38, alto_da_serra: 41, vila_nova: 47, porto_dourado: 52 },
  };

  GC.data.educacao = { escolas, populacao, limite: LIMITE, aulasPorProfessor: AULAS_POR_PROFESSOR };

  // ---- cálculos ----
  const um = (n) => Math.round(n * 10) / 10;
  function avaliar(x) {
    const faltando = Math.max(0, x.necessarios - x.professores);
    const motivos = [];
    if (faltando) motivos.push({ tipo: 'professor', texto: `${faltando} professor${faltando > 1 ? 'es' : ''} faltando · ${faltando * AULAS_POR_PROFESSOR} aulas perdidas por semana`, critico: faltando >= LIMITE.faltaCritica, atencao: faltando >= LIMITE.faltaAtencao });
    if (x.evasaoPct !== null && x.evasaoPct >= LIMITE.evasaoAtencao) motivos.push({ tipo: 'evasao', texto: `Evasão de ${x.evasaoPct.toLocaleString('pt-BR')}% no ano · busca ativa`, critico: x.evasaoPct >= LIMITE.evasaoCritica, atencao: true });
    if (x.frequenciaPct < LIMITE.freqAtencao) motivos.push({ tipo: 'frequencia', texto: `Frequência de ${x.frequenciaPct}%`, critico: x.frequenciaPct < LIMITE.freqCritica, atencao: true });
    if (x.fila >= LIMITE.filaCritica) motivos.push({ tipo: 'fila', texto: `${x.fila} crianças na fila de espera`, critico: true, atencao: true });
    if (x.alunos > x.capacidade) motivos.push({ tipo: 'lotacao', texto: `Acima da capacidade (${Math.round((x.alunos / x.capacidade) * 100)}%)`, critico: false, atencao: true });
    const situacao = motivos.some((m) => m.critico) ? 'critica' : motivos.some((m) => m.atencao) ? 'atencao' : 'ok';
    return Object.assign({}, x, {
      faltando,
      aulasPerdidasSemana: faltando * AULAS_POR_PROFESSOR,
      alunosPorProfessor: um(x.alunos / x.professores),
      ocupacaoPct: Math.round((x.alunos / x.capacidade) * 100),
      motivos,
      situacao,
    });
  }

  const ORDEM = { critica: 0, atencao: 1, ok: 2 };
  // Média ponderada (por alunos ou por população) só sobre quem tem o dado.
  const ponderada = (lista, campo, peso) => {
    const com = lista.filter((x) => x[campo] !== null && x[campo] !== undefined);
    const p = com.reduce((s, x) => s + peso(x), 0);
    return p ? um(com.reduce((s, x) => s + x[campo] * peso(x), 0) / p) : null;
  };

  function resumo(lista = escolas, pop = populacao, bairros = GC.data.bairros) {
    const es = lista.map(avaliar).sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.faltando - a.faltando || b.motivos.length - a.motivos.length);
    const emef = es.filter((x) => x.tipo === 'emef');
    const porBairro = bairros.map((b) => ({ id: b.id, nome: b.nome, populacao: b.populacao, alfabetizados15: pop.alfabetizados15[b.id], ensinoMedio25: pop.ensinoMedio25[b.id] }))
      .filter((b) => typeof b.ensinoMedio25 === 'number');
    const faltando = es.reduce((s, x) => s + x.faltando, 0);
    return {
      escolas: es,
      alunos: es.reduce((s, x) => s + x.alunos, 0),
      professores: es.reduce((s, x) => s + x.professores, 0),
      faltando,
      aulasPerdidasSemana: faltando * AULAS_POR_PROFESSOR,
      escolasSemProfessor: es.filter((x) => x.faltando > 0).length,
      frequenciaPct: ponderada(es, 'frequenciaPct', (x) => x.alunos),
      evasaoPct: ponderada(emef, 'evasaoPct', (x) => x.alunos),
      alfabetizacao3anoPct: ponderada(emef, 'alfabetizacao3anoPct', (x) => x.alunos),
      alunosPorProfessor: um(es.reduce((s, x) => s + x.alunos, 0) / es.reduce((s, x) => s + x.professores, 0)),
      emAlerta: es.filter((x) => x.situacao !== 'ok'),
      evasaoAlta: emef.filter((x) => x.evasaoPct >= LIMITE.evasaoAtencao).sort((a, b) => b.evasaoPct - a.evasaoPct),
      cidade: {
        alfabetizados15: ponderada(porBairro, 'alfabetizados15', (b) => b.populacao),
        ensinoMedio25: ponderada(porBairro, 'ensinoMedio25', (b) => b.populacao),
      },
      // Bairros com menos adultos com ensino médio (onde EJA e cursinho fazem mais diferença).
      piorEscolaridade: porBairro.slice().sort((a, b) => a.ensinoMedio25 - b.ensinoMedio25).slice(0, 3),
    };
  }

  GC.educacao = { resumo, avaliar };
})(window.GC = window.GC || {});
