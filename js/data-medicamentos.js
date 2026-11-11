(function (GC) {
  // Medicamentos: estoque da central de abastecimento (CAF) e das farmácias das UBS, consumo diário, quantos
  // dias o estoque cobre, rupturas, previsão de consumo da IA (sazonalidade e surtos) e sugestões de compra e de
  // remanejamento entre UBS. Pedido da Ana no workshop de 04/11 ("gestão de medicações, estoque"; "a C&A usa IA
  // para manejar o estoque"). Coerente com a alta de dengue na Lagoa Azul (oc-27): paracetamol e soro sobem.
  // Spec: docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md.
  const LIMITE = { critico: 7, atencao: 15, excesso: 60 }; // dias de cobertura
  const DIAS_COMPRA = 45; // a compra cobre 30 dias + 15 de segurança

  // m(id, nome, apresentação, uso, consumo/dia na rede, estoque na central, pedido em aberto, chega em dias,
  //   fator de consumo previsto pela IA, motivo da previsão)
  const m = (id, nome, apresentacao, uso, consumoDia, central, pedido, chegaEmDias, fatorIA = 1, motivoIA = null) =>
    ({ id, nome, apresentacao, uso, consumoDia, central, pedido, chegaEmDias, fatorIA, motivoIA });
  const medicamentos = [
    m('losartana', 'Losartana 50 mg', 'comprimido', 'Hipertensão', 1200, 18000, 30000, 12),
    m('metformina', 'Metformina 850 mg', 'comprimido', 'Diabetes', 950, 40000, 0, 0),
    m('insulina', 'Insulina NPH', 'frasco', 'Diabetes', 40, 200, 1200, 20),
    m('amoxicilina', 'Amoxicilina 500 mg', 'cápsula', 'Antibiótico', 600, 9000, 0, 0),
    m('paracetamol', 'Paracetamol 500 mg', 'comprimido', 'Febre e dor', 1500, 30000, 0, 0, 1.6, 'casos suspeitos de dengue em alta na Lagoa Azul'),
    m('soro', 'Soro de reidratação oral', 'sachê', 'Desidratação', 300, 2400, 0, 0, 1.8, 'hidratação dos casos de dengue'),
    m('omeprazol', 'Omeprazol 20 mg', 'cápsula', 'Estômago', 700, 50000, 0, 0),
    m('sinvastatina', 'Sinvastatina 20 mg', 'comprimido', 'Colesterol', 800, 26000, 0, 0),
    m('fluoxetina', 'Fluoxetina 20 mg', 'cápsula', 'Saúde mental', 400, 5200, 6000, 9),
    m('salbutamol', 'Salbutamol spray', 'frasco', 'Asma', 25, 900, 0, 0),
  ];

  // Peso de cada UBS no consumo (proporcional à demanda) e onde fica a farmácia dentro do bairro.
  const UBS = {
    centro: { peso: 0.24, desloc: [-0.0035, -0.006] },
    vila_nova: { peso: 0.2, desloc: [0.0045, -0.0055] },
    porto_dourado: { peso: 0.15, desloc: [0.0055, -0.002] },
    lagoa_azul: { peso: 0.16, desloc: [-0.002, -0.006] },
    alto_da_serra: { peso: 0.12, desloc: [0.0005, 0.0065] },
    bela_vista: { peso: 0.13, desloc: [0.0055, 0.0035] },
  };
  // Dias de cobertura fora do padrão (rupturas e excessos), por UBS e medicamento.
  const EXCECOES = {
    centro: { losartana: 0, insulina: 2, fluoxetina: 5 },
    vila_nova: { amoxicilina: 0, paracetamol: 6 },
    lagoa_azul: { paracetamol: 1, soro: 0 },
    porto_dourado: { insulina: 4 },
    bela_vista: { losartana: 70, omeprazol: 90, paracetamol: 68, soro: 75 },
    alto_da_serra: { amoxicilina: 75 },
  };

  GC.data.medicamentos = { medicamentos, ubs: UBS, excecoes: EXCECOES, limite: LIMITE, diasCompra: DIAS_COMPRA };

  // ---- cálculos ----
  const situacao = (dias) => (dias <= 0 ? 'ruptura' : dias < LIMITE.critico ? 'critico' : dias < LIMITE.atencao ? 'atencao' : dias > LIMITE.excesso ? 'excesso' : 'ok');
  const um = (n) => Math.round(n * 10) / 10;

  // Farmácias das UBS que existem na cidade (a lista de UBS acompanha a cidade escolhida).
  function farmacias(d = GC.data.medicamentos, ubsLista = GC.data.series.lotacaoUbs, bairros = GC.data.bairros) {
    const lista = ubsLista.filter((u) => d.ubs[u.bairroId]);
    const pesoTotal = lista.reduce((s, u) => s + d.ubs[u.bairroId].peso, 0) || 1;
    return lista.map((u, ui) => {
      const cfg = d.ubs[u.bairroId];
      const b = bairros.find((x) => x.id === u.bairroId);
      const peso = cfg.peso / pesoTotal;
      const itens = d.medicamentos.map((med, mi) => {
        const consumo = med.consumoDia * peso;
        const exc = (d.excecoes[u.bairroId] || {})[med.id];
        const diasPadrao = 16 + ((ui * 7 + mi * 5) % 15); // 16 a 30 dias, sem aleatoriedade
        const estoque = Math.round(consumo * (exc === undefined ? diasPadrao : exc));
        const dias = consumo ? um(estoque / (consumo * med.fatorIA)) : 99;
        return { id: med.id, nome: med.nome, estoque, consumoDia: um(consumo), dias, situacao: situacao(dias) };
      });
      const rupturas = itens.filter((x) => x.situacao === 'ruptura');
      const criticos = itens.filter((x) => x.situacao === 'critico');
      return {
        id: `farmacia-${u.bairroId}`, nome: u.nome, bairroId: u.bairroId,
        lat: b ? +(b.centro[0] + cfg.desloc[0]).toFixed(5) : null, lng: b ? +(b.centro[1] + cfg.desloc[1]).toFixed(5) : null,
        itens, rupturas, criticos,
        situacao: rupturas.length ? 'critica' : criticos.length ? 'atencao' : 'ok',
      };
    });
  }

  function resumo(d = GC.data.medicamentos) {
    const fs = farmacias(d);
    const itens = d.medicamentos.map((med) => {
      const nasUbs = fs.reduce((s, f) => s + f.itens.find((x) => x.id === med.id).estoque, 0);
      const estoque = med.central + nasUbs;
      const previsto = med.consumoDia * med.fatorIA;
      const dias = um(estoque / previsto);
      // Falta na rede antes do pedido chegar? (pedido que chega depois do estoque acabar não salva)
      const faltaAntesDoPedido = med.pedido ? dias < med.chegaEmDias : dias < 30;
      const compra = Math.max(0, Math.round(previsto * DIAS_COMPRA - estoque - med.pedido));
      return Object.assign({}, med, {
        estoqueRede: estoque, estoqueUbs: nasUbs, consumoPrevistoDia: Math.round(previsto), dias,
        situacao: situacao(dias), faltaAntesDoPedido, compraSugerida: compra,
        ubsEmRuptura: fs.filter((f) => f.itens.find((x) => x.id === med.id).situacao === 'ruptura').map((f) => f.nome),
      });
    }).sort((a, b) => a.dias - b.dias);

    // Remanejamento: UBS com excesso (> 60 dias) manda para UBS em ruptura ou crítica o que cobre 15 dias dela,
    // sem baixar a origem de 30 dias.
    const remanejamentos = [];
    fs.forEach((destino) => destino.itens.filter((x) => x.situacao === 'ruptura' || x.situacao === 'critico').forEach((x) => {
      const origem = fs.filter((f) => f !== destino).map((f) => ({ f, i: f.itens.find((y) => y.id === x.id) }))
        .filter(({ i }) => i.dias > LIMITE.excesso).sort((a, b) => b.i.dias - a.i.dias)[0];
      if (!origem) return;
      const med = d.medicamentos.find((y) => y.id === x.id);
      const sobra = origem.i.estoque - Math.round(origem.i.consumoDia * med.fatorIA * 30);
      const precisa = Math.round(x.consumoDia * med.fatorIA * LIMITE.atencao) - x.estoque;
      const qtd = Math.min(sobra, precisa);
      if (qtd > 0) remanejamentos.push({ medicamento: med.nome, id: med.id, apresentacao: med.apresentacao, qtd, de: origem.f.nome, deId: origem.f.id, para: destino.nome, paraId: destino.id });
    }));

    return {
      itens,
      farmacias: fs,
      rupturas: fs.reduce((s, f) => s + f.rupturas.length, 0),
      ubsComRuptura: fs.filter((f) => f.rupturas.length),
      vaoFaltar: itens.filter((x) => x.faltaAntesDoPedido),
      comPrevisaoIA: itens.filter((x) => x.fatorIA !== 1),
      compras: itens.filter((x) => x.compraSugerida > 0),
      remanejamentos,
      excesso: itens.filter((x) => x.situacao === 'excesso'),
    };
  }

  GC.medicamentos = { resumo, farmacias, situacao };
})(window.GC = window.GC || {});
