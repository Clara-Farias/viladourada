(function (GC) {
  // Segurança: boletins de ocorrência (B.O.) dos últimos 30 dias e violência contra mulheres e crianças.
  // Segundo indicador mais votado no workshop de 04/11 (Fase 2 da spec
  // docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md). Escrito à mão, mas coerente:
  // o total do mês (363) é o último ponto de GC.data.series.criminalidadeMensal.
  const LIMITE_ALTA_PCT = 10; // B.O.s de hoje acima da média diária: alerta a partir de +10%

  // B.O.s registrados por bairro nos últimos 30 dias (soma = 363).
  const porBairro30d = {
    centro: 92, vila_nova: 61, parque_industrial: 48, porto_dourado: 44,
    bela_vista: 39, lagoa_azul: 33, jardim_das_flores: 26, alto_da_serra: 20,
  };
  // Por tipo, nos mesmos 30 dias (soma = 363).
  const porTipo30d = {
    Roubo: 118, Furto: 104, 'Violência doméstica': 52, 'Lesão corporal': 41,
    'Violência contra criança/adolescente': 19, Outros: 29,
  };
  const hoje = { registrados: 16, ateHora: '11h' };

  // Violência contra mulheres e contra crianças/adolescentes: série de 12 meses (nov/2025 a out/2026)
  // e distribuição por bairro no último mês. Só agregado por bairro: endereço de vítima nunca vai ao mapa.
  const mesesSerie = GC.relogio.meses(12); // 12 meses fechados até o mês passado
  const violencia = {
    meses: mesesSerie,
    mulheres: [44, 47, 49, 46, 50, 48, 45, 47, 49, 51, 50, 52],
    criancas: [14, 15, 13, 16, 17, 15, 14, 16, 18, 17, 18, 19],
    // Último mês, mulheres + crianças (soma = 52 + 19 = 71).
    porBairro: {
      vila_nova: 19, centro: 15, lagoa_azul: 12, porto_dourado: 9,
      parque_industrial: 6, bela_vista: 4, jardim_das_flores: 3, alto_da_serra: 3,
    },
    canais: ['Delegacia da Mulher', 'Conselho Tutelar', 'Disque 180', 'Disque 100'],
  };

  GC.data.seguranca = { porBairro30d, porTipo30d, hoje, violencia, limiteAltaPct: LIMITE_ALTA_PCT };

  // ---- cálculos ----
  const ranking = (contagem) => Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  const soma = (lista) => lista.reduce((s, n) => s + n, 0);
  const variacaoPct = (atual, anterior) => (anterior ? Math.round(((atual - anterior) / anterior) * 100) : 0);

  // Pontos do mapa de calor: espiral em volta do centro de cada bairro, um ponto a cada 3 B.O.s.
  // Determinístico (sem Math.random): o mapa é o mesmo em toda apresentação.
  function pontosCalor(contagem = porBairro30d, bairros = GC.data.bairros) {
    const pontos = [];
    // Cidade grande: um ponto para mais B.O.s, para o calor não saturar (na média, 1 ponto a cada 3).
    const divisor = Math.max(3, Object.values(contagem).reduce((s, n) => s + n, 0) / 121);
    bairros.forEach((b) => {
      const n = Math.round((contagem[b.id] || 0) / divisor);
      const [lat, lng] = b.centro;
      for (let i = 0; i < n; i++) {
        const ang = i * 2.39996; // ângulo de ouro: espalha sem amontoar
        const raio = 0.0012 + 0.0065 * Math.sqrt(i / Math.max(n, 1));
        pontos.push({ lat: +(lat + Math.sin(ang) * raio).toFixed(5), lng: +(lng + Math.cos(ang) * raio * 0.9).toFixed(5), peso: 0.5 });
      }
    });
    return pontos;
  }

  const MIN_EXIBIR = 5;

  function resumo(d = GC.data.seguranca, serieMensal = GC.data.series.criminalidadeMensal.valores) {
    const total30d = soma(Object.values(d.porBairro30d));
    const mediaDia = Math.round((total30d / 30) * 10) / 10;
    const hojePct = variacaoPct(d.hoje.registrados, mediaDia);
    const [bairroTopo, bairroTopoN] = ranking(d.porBairro30d)[0];
    const v = d.violencia;
    const ult = v.meses.length - 1;
    const vmcMes = v.mulheres[ult] + v.criancas[ult];
    const vmcAnterior = v.mulheres[ult - 1] + v.criancas[ult - 1];
    const vmcAnoPassado = v.mulheres[0] + v.criancas[0];
    return {
      hoje: d.hoje.registrados,
      ateHora: d.hoje.ateHora,
      mediaDia,
      hojeVariacaoPct: hojePct,
      hojeAlto: hojePct >= d.limiteAltaPct,
      total30d,
      mesVariacaoPct: variacaoPct(serieMensal[serieMensal.length - 1], serieMensal[serieMensal.length - 2]),
      bairroCritico: { id: bairroTopo, total: bairroTopoN, pct: Math.round((bairroTopoN / total30d) * 100) },
      porBairro: ranking(d.porBairro30d).map(([id, n]) => ({ id, n })),
      porTipo: ranking(d.porTipo30d).map(([tipo, n]) => ({ tipo, n })),
      violencia: {
        mes: vmcMes,
        mulheres: v.mulheres[ult],
        criancas: v.criancas[ult],
        variacaoPct: variacaoPct(vmcMes, vmcAnterior),
        variacaoAnoPct: variacaoPct(vmcMes, vmcAnoPassado),
        subindo: vmcMes > vmcAnterior,
        // Contagens pequenas identificam a vítima num bairro pequeno (LGPD, ECA): abaixo de MIN_EXIBIR, só "menos de 5".
        porBairro: ranking(v.porBairro).map(([id, n]) => (n >= MIN_EXIBIR ? { id, n, texto: String(n) } : { id, n: null, texto: `menos de ${MIN_EXIBIR}` })),
        serie: v.meses.map((m, i) => ({ mes: m, total: v.mulheres[i] + v.criancas[i] })),
      },
    };
  }

  GC.seguranca = { resumo, pontosCalor };
})(window.GC = window.GC || {});
