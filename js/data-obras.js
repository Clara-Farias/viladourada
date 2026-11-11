(function (GC) {
  // Obras públicas: no prazo × atrasadas, por setor, com contrato, gasto, avanço e tempo em andamento.
  // Fase 4 da spec docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md ("obras que nunca terminam",
  // "mapa de obras com filtro por setor", "valores gastos e previsão", "alerta de obra atrasada").
  // Escrito à mão, mas coerente: 6 atrasadas (o indicador da Infraestrutura), as obras das unidades da
  // Infraestrutura, a nova ala de UTI do Hospital Municipal (leitos) e a contenção da encosta (risco).
  const DATA_REF = GC.relogio.hoje; // "hoje" da demo: prazos e dias calculados contra esta data
  const PARADA_DIAS = 60; // sem avanço há mais que isso = paralisada
  const GASTO_A_FRENTE_PP = 15; // pago acima do feito (pontos percentuais) = alerta

  const setores = [
    { id: 'infraestrutura', nome: 'Infraestrutura', emoji: '🔧' },
    { id: 'mobilidade', nome: 'Mobilidade', emoji: '🚦' },
    { id: 'saude', nome: 'Saúde', emoji: '🏥' },
    { id: 'educacao', nome: 'Educação', emoji: '🎓' },
    { id: 'defesa_civil', nome: 'Defesa Civil', emoji: '🌧' },
    { id: 'cultura', nome: 'Cultura', emoji: '🎭' },
    { id: 'esporte', nome: 'Esporte e lazer', emoji: '⚽' },
  ];

  const centroDe = (id) => GC.data.bairros.find((b) => b.id === id).centro;
  // o(id, nome, setor, bairro, desloc, contrato R$ mi, gasto R$ mi, avanço %, início, previsão original,
  //   previsão atual, último avanço, empresa)
  const o = (id, nome, setor, bairroId, [dLat, dLng], contratoMi, gastoMi, avancoPct, inicio, previsaoOriginal, previsaoAtual, ultimoAvanco, empresa) => {
    const [lat, lng] = centroDe(bairroId);
    return { id, nome, setor, bairroId, lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5), contratoMi, gastoMi, avancoPct, inicio, previsaoOriginal, previsaoAtual, ultimoAvanco, empresa };
  };

  const obras = [
    o('galeria-xv', 'Galeria pluvial da Rua XV', 'infraestrutura', 'centro', [0.0045, 0.001], 8.4, 5.9, 45, GC.relogio.data('2026-03-02'), GC.relogio.data('2026-09-30'), GC.relogio.data('2026-11-07'), GC.relogio.data('2026-10-28'), 'Construtora Serra Alta'),
    o('recape-dourada', 'Recapeamento da Av. Dourada', 'mobilidade', 'bela_vista', [-0.001, -0.006], 12.6, 8.8, 72, GC.relogio.data('2026-05-04'), GC.relogio.data('2026-10-24'), GC.relogio.data('2026-11-05'), GC.relogio.data('2026-11-03'), 'Pavimenta Sul'),
    o('subestacao-vn', 'Subestação Vila Nova', 'infraestrutura', 'vila_nova', [-0.002, 0.006], 21.0, 7.1, 30, GC.relogio.data('2026-04-01'), GC.relogio.data('2027-01-15'), GC.relogio.data('2027-02-05'), GC.relogio.data('2026-10-30'), 'Energética Paulista'),
    o('hm-uti', 'Hospital Municipal · nova ala de UTI (+10 leitos)', 'saude', 'vila_nova', [0.0025, 0.0065], 15.2, 9.5, 48, GC.relogio.data('2026-01-12'), GC.relogio.data('2026-10-01'), GC.relogio.data('2027-01-30'), GC.relogio.data('2026-10-22'), 'Construtora Serra Alta'),
    o('cmei-vn', 'CMEI Vila Nova · ampliação (120 vagas)', 'educacao', 'vila_nova', [-0.005, -0.001], 3.6, 2.9, 55, GC.relogio.data('2025-11-10'), GC.relogio.data('2026-07-31'), GC.relogio.data('2027-03-31'), GC.relogio.data('2026-08-20'), 'Obras Horizonte'),
    o('contencao-serra', 'Contenção da encosta do Alto da Serra', 'defesa_civil', 'alto_da_serra', [-0.0055, -0.003], 3.1, 1.0, 30, GC.relogio.data('2026-07-01'), GC.relogio.data('2026-11-30'), GC.relogio.data('2027-01-15'), GC.relogio.data('2026-10-25'), 'Geotec Engenharia'),
    o('teatro-centro', 'Teatro Municipal · restauro', 'cultura', 'centro', [-0.0055, 0.004], 6.8, 3.0, 40, GC.relogio.data('2026-02-01'), GC.relogio.data('2026-12-15'), GC.relogio.data('2026-12-15'), GC.relogio.data('2026-11-02'), 'Restauro Brasil'),
    o('escola-lagoa', 'Escola Lagoa · reforma hidráulica', 'educacao', 'lagoa_azul', [-0.0015, -0.006], 0.9, 0.5, 60, GC.relogio.data('2026-09-01'), GC.relogio.data('2026-11-20'), GC.relogio.data('2026-11-20'), GC.relogio.data('2026-11-04'), 'Obras Horizonte'),
    o('ginasio-porto', 'Ginásio do Porto', 'esporte', 'porto_dourado', [0.0055, 0.002], 5.3, 1.2, 25, GC.relogio.data('2026-06-01'), GC.relogio.data('2027-06-30'), GC.relogio.data('2027-06-30'), GC.relogio.data('2026-10-31'), 'Pavimenta Sul'),
    o('ciclovia-industrial', 'Ciclovia do Parque Industrial', 'mobilidade', 'parque_industrial', [0.005, -0.004], 2.4, 1.8, 80, GC.relogio.data('2026-04-15'), GC.relogio.data('2026-12-10'), GC.relogio.data('2026-12-10'), GC.relogio.data('2026-11-01'), 'Pavimenta Sul'),
    o('praca-flores', 'Praça das Flores · LED e playground', 'esporte', 'jardim_das_flores', [-0.005, 0.004], 1.9, 1.9, 100, GC.relogio.data('2026-06-10'), GC.relogio.data('2026-10-31'), GC.relogio.data('2026-10-14'), GC.relogio.data('2026-10-14'), 'Lumen Urbano'),
    o('ubs-bela-vista', 'UBS Bela Vista', 'saude', 'bela_vista', [0.0035, 0.0065], 4.2, 4.1, 100, GC.relogio.data('2025-12-01'), GC.relogio.data('2026-10-30'), GC.relogio.data('2026-10-21'), GC.relogio.data('2026-10-21'), 'Obras Horizonte'),
  ];

  GC.data.obras = { obras, setores, dataRef: DATA_REF, paradaDias: PARADA_DIAS, gastoAFrentePp: GASTO_A_FRENTE_PP };

  // ---- cálculos ----
  const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const dias = (de, ate) => Math.round(dia(ate) - dia(de));

  // situacao: concluida | paralisada (atrasada e sem avanço há > 60 dias) | atrasada | em_dia
  function avaliar(ob, hoje = DATA_REF) {
    const concluida = ob.avancoPct >= 100;
    const diasAtraso = Math.max(0, dias(ob.previsaoOriginal, ob.previsaoAtual), concluida ? 0 : dias(ob.previsaoOriginal, hoje));
    const semAvancoDias = concluida ? 0 : dias(ob.ultimoAvanco, hoje);
    const gastoPct = Math.round((ob.gastoMi / ob.contratoMi) * 100);
    let situacao = 'em_dia';
    if (concluida) situacao = 'concluida';
    else if (diasAtraso > 0 && semAvancoDias > PARADA_DIAS) situacao = 'paralisada';
    else if (diasAtraso > 0) situacao = 'atrasada';
    return Object.assign({}, ob, {
      situacao,
      atrasada: situacao === 'atrasada' || situacao === 'paralisada',
      diasAtraso,
      diasEmAndamento: dias(ob.inicio, concluida ? ob.previsaoAtual : hoje),
      semAvancoDias,
      gastoPct,
      gastoAFrente: !concluida && gastoPct - ob.avancoPct >= GASTO_A_FRENTE_PP,
    });
  }

  const ORDEM = { paralisada: 0, atrasada: 1, em_dia: 2, concluida: 3 };
  function resumo(setor = null, hoje = DATA_REF, lista = obras) {
    const todas = lista.map((ob) => avaliar(ob, hoje));
    const vis = todas.filter((ob) => !setor || ob.setor === setor)
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.diasAtraso - a.diasAtraso);
    const andamento = vis.filter((ob) => ob.situacao !== 'concluida');
    const atrasadas = vis.filter((ob) => ob.atrasada);
    const contratoMi = vis.reduce((s, ob) => s + ob.contratoMi, 0);
    const gastoMi = vis.reduce((s, ob) => s + ob.gastoMi, 0);
    return {
      setor,
      obras: vis,
      emAndamento: andamento.length,
      atrasadas: atrasadas.length,
      noPrazo: andamento.length - atrasadas.length,
      concluidas: vis.length - andamento.length,
      atrasoMedioDias: atrasadas.length ? Math.round(atrasadas.reduce((s, ob) => s + ob.diasAtraso, 0) / atrasadas.length) : 0,
      contratoMi: Math.round(contratoMi * 10) / 10,
      gastoMi: Math.round(gastoMi * 10) / 10,
      gastoPct: contratoMi ? Math.round((gastoMi / contratoMi) * 100) : 0,
      paralisadas: vis.filter((ob) => ob.situacao === 'paralisada'),
      gastoAFrente: vis.filter((ob) => ob.gastoAFrente),
      // Quantas obras cada setor tem (sempre da cidade toda, para os chips do filtro).
      porSetor: setores.map((s) => ({ ...s, total: todas.filter((ob) => ob.setor === s.id).length, atrasadas: todas.filter((ob) => ob.setor === s.id && ob.atrasada).length })),
    };
  }

  GC.obras = { resumo, avaliar, dias };
})(window.GC = window.GC || {});
