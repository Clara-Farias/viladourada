(function (GC) {
  // Defesa Civil: áreas de risco mapeadas × chuva prevista → risco ANTES de acontecer.
  // Fase 3 da spec docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md ("alerta de risco de regiões
  // específicas" + "zonas afetadas"). Escrito à mão, mas coerente: as áreas contêm os alagamentos e o
  // deslizamento que já estão abertos (oc-01, oc-03, oc-04).

  // Previsão (fictícia, no formato do INMET): chuva acumulada a partir de agora, em mm.
  const previsao = {
    fonte: 'INMET + radar meteorológico',
    atualizadaHaMin: 12,
    acumulado72h: 64, // o que já choveu: encharca o solo e pesa nas encostas
    janelas: [
      { horas: 3, mm: 8 },
      { horas: 6, mm: 22 },
      { horas: 12, mm: 35 },
      { horas: 24, mm: 48 },
    ],
  };

  const centroDe = (id) => GC.data.bairros.find((b) => b.id === id).centro;
  // Polígono irregular em volta de um ponto (centro do bairro + deslocamento); forma = raios em 8 direções.
  function contorno(bairroId, [dLat, dLng], raios) {
    const [lat, lng] = centroDe(bairroId);
    return raios.map((r, i) => {
      const ang = (i / raios.length) * Math.PI * 2;
      return [+(lat + dLat + Math.sin(ang) * r).toFixed(5), +(lng + dLng + Math.cos(ang) * r * 1.1).toFixed(5)];
    });
  }

  // limiarMm: chuva que dispara o problema. Deslizamento soma o que já choveu (solo encharcado);
  // alagamento olha só a chuva que vem.
  const area = (id, nome, tipo, bairroId, desloc, raios, familias, limiarMm) =>
    ({ id, nome, tipo, bairroId, poligono: contorno(bairroId, desloc, raios), familias, limiarMm });

  const areas = [
    area('encosta-serra', 'Encosta do Alto da Serra', 'deslizamento', 'alto_da_serra', [-0.003, -0.002], [0.003, 0.0025, 0.0032, 0.0028, 0.0024, 0.003, 0.0026, 0.0022], 48, 80),
    area('baixada-xv', 'Baixada da Rua XV', 'alagamento', 'centro', [0.0025, -0.0035], [0.0024, 0.002, 0.0026, 0.0022, 0.0019, 0.0023, 0.0021, 0.0018], 35, 20),
    area('margem-lagoa', 'Margem da Lagoa Azul', 'alagamento', 'lagoa_azul', [0.0025, 0.0035], [0.0032, 0.0026, 0.003, 0.0034, 0.0028, 0.0025, 0.0031, 0.0027], 62, 30),
    area('corrego-porto', 'Córrego do Porto', 'alagamento', 'porto_dourado', [-0.0025, 0.0025], [0.0026, 0.002, 0.0024, 0.0028, 0.0022, 0.0019, 0.0025, 0.0021], 41, 40),
    area('morro-vila-nova', 'Morro da Vila Nova', 'deslizamento', 'vila_nova', [0.0045, 0.003], [0.0022, 0.0026, 0.002, 0.0024, 0.0021, 0.0025, 0.0019, 0.0023], 54, 85),
    area('varzea-industrial', 'Várzea do Parque Industrial', 'alagamento', 'parque_industrial', [-0.003, 0], [0.0024, 0.0028, 0.0022, 0.0026, 0.003, 0.0024, 0.0021, 0.0027], 12, 60),
  ];

  GC.data.risco = { previsao, areas };

  // ---- cálculos ----
  const NIVEL = { alto: 3, medio: 2, baixo: 1 };
  const ACAO = {
    deslizamento: { alto: 'Acionar a sirene e avisar as famílias por SMS para irem ao abrigo', medio: 'Vistoriar a encosta e deixar o abrigo de prontidão' },
    alagamento: { alto: 'Desobstruir bueiros e preparar a interdição da via antes do pico', medio: 'Deixar equipe de prontidão e avisar os moradores' },
  };

  function dentro([y, x], poligono) {
    let inside = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i];
      const [yj, xj] = poligono[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Risco de uma área: em quantas horas a chuva prevista passa do limiar (null = não passa em 24 h).
  // Até 6 h = alto; até 24 h = médio; senão baixo. "Atingida" = já há ocorrência da Defesa Civil aberta lá dentro.
  function avaliar(a, prev = previsao, ocorrencias = []) {
    const base = a.tipo === 'deslizamento' ? prev.acumulado72h : 0;
    const janela = prev.janelas.find((j) => base + j.mm >= a.limiarMm);
    const horasAte = janela ? janela.horas : null;
    const nivel = horasAte === null ? 'baixo' : horasAte <= 6 ? 'alto' : 'medio';
    const atingidaPor = ocorrencias.filter((o) => o.area === 'defesa_civil' && o.status !== 'resolvida' && dentro([o.lat, o.lng], a.poligono)).map((o) => o.id);
    const previsto24h = prev.janelas[prev.janelas.length - 1].mm;
    return Object.assign({}, a, {
      nivel,
      horasAte,
      atingida: atingidaPor.length > 0,
      atingidaPor,
      chuvaConsiderada: base + previsto24h,
      acao: (ACAO[a.tipo] || {})[nivel] || 'Monitorar',
    });
  }

  function resumo(ocorrencias = [], prev = previsao, lista = areas) {
    const avaliadas = lista.map((a) => avaliar(a, prev, ocorrencias))
      .sort((x, y) => NIVEL[y.nivel] - NIVEL[x.nivel] || (x.horasAte ?? 99) - (y.horasAte ?? 99) || y.familias - x.familias);
    const altas = avaliadas.filter((a) => a.nivel === 'alto');
    return {
      previsao: prev,
      areas: avaliadas,
      altas,
      familiasRiscoAlto: altas.reduce((s, a) => s + a.familias, 0),
      atingidas: avaliadas.filter((a) => a.atingida),
      // Alerta preventivo: a área de risco alto que ainda NÃO foi atingida (é onde dá para agir antes).
      preventivo: altas.find((a) => !a.atingida) || null,
    };
  }

  GC.risco = { resumo, avaliar, dentro };
})(window.GC = window.GC || {});
