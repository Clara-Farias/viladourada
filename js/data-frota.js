(function (GC) {
  // Frota: ônibus (concessão) e ambulâncias (SAMU) — quantos rodam hoje, quantos estão em manutenção, quais
  // estão com a preventiva vencida e o dia marcado de cada manutenção; e as linhas de ônibus com o tempo de
  // espera nos pontos. Pedidos do workshop de 04/11 (Victor, Ana, Francisco): a manutenção dos ônibus é da
  // concessionária, então a prefeitura acompanha as metas do contrato e cobra a empresa.
  // Spec: docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md. Coerente com oc-21 (Linha 102 atrasada).
  const DATA_REF = GC.relogio.hoje;

  const centroDe = (id) => GC.data.bairros.find((b) => b.id === id).centro;
  const ponto = (bairroId, [dLat, dLng]) => { const [lat, lng] = centroDe(bairroId); return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) }; };

  // Garagem dos ônibus: contagem por situação hoje. necessarios = frota que a programação do dia exige.
  const garagens = [
    Object.assign({ id: 'garagem-dourada', nome: 'Garagem Viação Dourada', tipo: 'garagem', bairroId: 'parque_industrial',
      operando: 96, reserva: 6, corretiva: 11, preventiva: 7, necessarios: 104, preventivaVencida: 9 }, ponto('parque_industrial', [0.004, 0.005])),
  ];
  // Bases do SAMU: ambulâncias por situação e tempo de resposta médio da base.
  const base = (id, nome, bairroId, desloc, operando, reserva, corretiva, preventiva, necessarios, preventivaVencida, tempoRespostaMin, chamadosHoje) =>
    Object.assign({ id, nome, tipo: 'samu', bairroId, operando, reserva, corretiva, preventiva, necessarios, preventivaVencida, tempoRespostaMin, chamadosHoje }, ponto(bairroId, desloc));
  const bases = [
    base('samu-centro', 'Base SAMU Centro', 'centro', [0.0055, 0.0005], 4, 0, 1, 0, 4, 1, 11, 24),
    base('samu-vn', 'Base SAMU Vila Nova', 'vila_nova', [0.0005, -0.0065], 2, 0, 1, 1, 3, 1, 17, 18),
    base('samu-lagoa', 'Base SAMU Lagoa Azul', 'lagoa_azul', [-0.0055, 0.0005], 2, 1, 0, 0, 3, 0, 15, 12),
    base('samu-porto', 'Base SAMU Porto', 'porto_dourado', [-0.001, 0.0065], 2, 0, 0, 0, 2, 0, 13, 9),
  ];

  const contrato = {
    operadora: 'Viação Dourada', metaDisponibilidadePct: 95, metaViagensPct: 98, idadeMaxAnos: 10,
    acimaIdade: 14, idadeMediaAnos: 6.8, viagensProgramadasHoje: 1840, viagensRealizadasHoje: 1748,
    multaPorPontoMil: 12, // R$ mil por ponto percentual abaixo da meta, por mês (cláusula fictícia)
  };
  const samu = { metaTempoRespostaMin: 12 };

  // Manutenções: dia marcado (as vencidas ficaram para trás sem ser feitas).
  const m = (veiculo, frota, local, motivo, data) => ({ veiculo, frota, local, motivo, data });
  const agenda = [
    m('Ônibus 1042', 'onibus', 'garagem-dourada', 'Preventiva de freios e suspensão', GC.relogio.data('2026-10-22')),
    m('Ônibus 1117', 'onibus', 'garagem-dourada', 'Troca de óleo e filtros', GC.relogio.data('2026-10-28')),
    m('Ambulância USA-03', 'ambulancia', 'samu-vn', 'Revisão dos 60 mil km', GC.relogio.data('2026-10-30')),
    m('Ônibus 1008', 'onibus', 'garagem-dourada', 'Preventiva do ar-condicionado', GC.relogio.data('2026-11-05')),
    m('Ambulância USB-07', 'ambulancia', 'samu-vn', 'Preventiva de freios', GC.relogio.data('2026-11-05')),
    m('Ônibus 1093', 'onibus', 'garagem-dourada', 'Inspeção semestral (Detran)', GC.relogio.data('2026-11-06')),
    m('Ambulância USB-02', 'ambulancia', 'samu-centro', 'Calibração do desfibrilador e revisão', GC.relogio.data('2026-11-08')),
    m('Ônibus 1120', 'onibus', 'garagem-dourada', 'Troca de pneus', GC.relogio.data('2026-11-10')),
    m('Ambulância USA-01', 'ambulancia', 'samu-lagoa', 'Revisão dos 40 mil km', GC.relogio.data('2026-11-12')),
  ];

  // Linhas: intervalo programado × espera média real nos pontos e % das viagens cumpridas hoje.
  const l = (id, nome, bairros, intervaloMin, esperaMin, viagensPct, ocorrenciaId = null) => ({ id, nome, bairros, intervaloMin, esperaMin, viagensPct, ocorrenciaId });
  const linhas = [
    l('102', 'Linha 102 · Jardim das Flores – Centro', ['jardim_das_flores', 'vila_nova', 'centro'], 12, 27, 84, 'oc-21'),
    l('103', 'Linha 103 · Lagoa Azul – Porto', ['lagoa_azul', 'centro', 'vila_nova', 'porto_dourado'], 15, 19, 91),
    l('104', 'Linha 104 · Alto da Serra – Jardim', ['alto_da_serra', 'bela_vista', 'jardim_das_flores'], 20, 22, 95),
    l('101', 'Linha 101 · Centro – Bela Vista', ['centro', 'bela_vista'], 10, 12, 97),
    l('105', 'Linha 105 · Parque Industrial – Porto', ['parque_industrial', 'porto_dourado'], 15, 16, 98),
    l('106', 'Linha 106 · Circular Centro', ['centro', 'bela_vista', 'jardim_das_flores', 'vila_nova', 'centro'], 8, 9, 99),
  ];

  GC.data.frota = { garagens, bases, contrato, samu, agenda, linhas, dataRef: DATA_REF };

  // ---- cálculos ----
  const soma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

  function frotaDe(lista) {
    const operando = soma(lista, 'operando');
    const necessarios = soma(lista, 'necessarios');
    return {
      total: operando + soma(lista, 'reserva') + soma(lista, 'corretiva') + soma(lista, 'preventiva'),
      operando, necessarios, reserva: soma(lista, 'reserva'), corretiva: soma(lista, 'corretiva'), preventiva: soma(lista, 'preventiva'),
      preventivaVencida: soma(lista, 'preventivaVencida'),
      disponibilidadePct: pct(operando, necessarios),
    };
  }

  // Linha: crítica se a espera passa de 1,8× o intervalo ou cumpre menos de 88% das viagens; atenção a partir
  // de 1,25× ou abaixo de 95%.
  function avaliarLinha(x) {
    const razao = x.esperaMin / x.intervaloMin;
    const situacao = razao >= 1.8 || x.viagensPct < 88 ? 'critica' : razao >= 1.25 || x.viagensPct < 95 ? 'atencao' : 'ok';
    return Object.assign({}, x, { razao: Math.round(razao * 10) / 10, situacao });
  }
  const ORDEM = { critica: 0, atencao: 1, ok: 2 };

  function resumo(d = GC.data.frota, hoje = DATA_REF) {
    const onibus = frotaDe(d.garagens);
    const ambulancias = frotaDe(d.bases);
    const c = d.contrato;
    const viagensPct = pct(c.viagensRealizadasHoje, c.viagensProgramadasHoje);
    const abaixo = Math.max(0, c.metaDisponibilidadePct - onibus.disponibilidadePct) + Math.max(0, c.metaViagensPct - viagensPct);
    const chamados = soma(d.bases, 'chamadosHoje');
    const agenda = d.agenda.map((x) => {
      const dias = dia(x.data) - dia(hoje);
      return Object.assign({}, x, { dias, situacao: dias < 0 ? 'vencida' : dias === 0 ? 'hoje' : 'proxima' });
    }).sort((a, b) => a.dias - b.dias);
    const linhas = d.linhas.map(avaliarLinha).sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || b.razao - a.razao);
    return {
      onibus: Object.assign(onibus, {
        operadora: c.operadora, metaDisponibilidadePct: c.metaDisponibilidadePct, metaViagensPct: c.metaViagensPct,
        viagensPct, viagensRealizadas: c.viagensRealizadasHoje, viagensProgramadas: c.viagensProgramadasHoje,
        acimaIdade: c.acimaIdade, idadeMaxAnos: c.idadeMaxAnos, idadeMediaAnos: c.idadeMediaAnos,
        // Descumprimento do contrato: pontos abaixo da meta (disponibilidade + viagens) e multa estimada no mês.
        foraDoContrato: abaixo > 0, pontosAbaixo: abaixo, multaEstimadaMil: abaixo * c.multaPorPontoMil,
      }),
      ambulancias: Object.assign(ambulancias, {
        chamadosHoje: chamados,
        tempoRespostaMin: chamados ? Math.round(d.bases.reduce((s, b) => s + b.tempoRespostaMin * b.chamadosHoje, 0) / chamados) : 0,
        metaTempoRespostaMin: d.samu.metaTempoRespostaMin,
      }),
      bases: d.bases.map((b) => Object.assign({}, b, frotaDe([b]))),
      garagens: d.garagens.map((g) => Object.assign({}, g, frotaDe([g]))),
      agenda,
      vencidas: agenda.filter((x) => x.situacao === 'vencida'),
      linhas,
      linhasCriticas: linhas.filter((x) => x.situacao === 'critica'),
    };
  }

  GC.frota = { resumo, avaliarLinha };
})(window.GC = window.GC || {});
