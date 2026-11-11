(function (GC) {
  // Leitos da rede municipal (hospitais e UPAs): indicador mais votado no workshop de 04/11.
  // Escrito à mão, mas coerente: o Hospital Municipal está com a UTI cheia e é a ocorrência oc-13.
  // Spec: docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md (Fase 1).
  const LIMITE = { critico: 90, atencao: 80 }; // % de ocupação (UTI ou geral)

  const centroDe = (id) => GC.data.bairros.find((b) => b.id === id).centro;
  const g = (rotulo, total, ocupados, uti = false) => ({ rotulo, total, ocupados, uti });
  const unidade = (id, nome, tipo, bairroId, [dLat, dLng], grupos, atendimentosHoje, ocorrenciaId = null) => {
    const [lat, lng] = centroDe(bairroId);
    return { id, nome, tipo, bairroId, lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5), grupos, atendimentosHoje, ocorrenciaId };
  };

  const unidades = [
    unidade('hm', 'Hospital Municipal', 'hospital', 'vila_nova', [0.006, 0.006],
      [g('UTI adulto', 20, 19, true), g('Enfermaria', 140, 126), g('Pediatria', 24, 18)],
      { 'Clínica médica': 142, Trauma: 38, Pediatria: 51 }, 'oc-13'),
    unidade('hrl', 'Hospital Regional Lagoa Azul', 'hospital', 'lagoa_azul', [-0.006, 0.005],
      [g('UTI adulto', 10, 8, true), g('Enfermaria', 80, 61)],
      { 'Clínica médica': 64, Trauma: 12 }),
    unidade('mat', 'Maternidade Bela Vista', 'hospital', 'bela_vista', [0.006, -0.006],
      [g('UTI neonatal', 10, 6, true), g('Obstetrícia', 60, 38)],
      { Obstetrícia: 27, Pediatria: 18 }),
    unidade('upa-centro', 'UPA Centro', 'upa', 'centro', [0.006, 0.006],
      [g('Sala vermelha', 4, 3, true), g('Observação', 18, 15)],
      { 'Clínica médica': 186, Pediatria: 64, Trauma: 21 }),
    unidade('upa-porto', 'UPA Porto', 'upa', 'porto_dourado', [-0.006, -0.006],
      [g('Sala vermelha', 4, 2, true), g('Observação', 16, 10)],
      { 'Clínica médica': 97, Pediatria: 33 }),
  ];

  // Ocupação geral da rede, nov/2025 a out/2026 (mesma janela das séries das secretarias).
  const serie = { rotulo: 'Ocupação dos leitos da rede', unidade: '%', meses: [72, 74, 78, 81, 80, 76, 73, 71, 72, 74, 76, 79], meta: 85 };

  GC.data.leitos = { unidades, serie, limite: LIMITE };

  // ---- cálculos (puros: recebem a lista, para os testes e para cidades com outras redes) ----
  const soma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);
  const pct = (ocupados, total) => (total ? Math.round((ocupados / total) * 100) : 0);
  const situacao = (p) => (p >= LIMITE.critico ? 'critica' : p >= LIMITE.atencao ? 'atencao' : 'ok');

  function resumoUnidade(u) {
    const total = soma(u.grupos, 'total');
    const ocupados = soma(u.grupos, 'ocupados');
    const uti = u.grupos.filter((x) => x.uti);
    const utiPct = uti.length ? pct(soma(uti, 'ocupados'), soma(uti, 'total')) : null;
    const geralPct = pct(ocupados, total);
    // A pior das duas manda: UTI cheia é crítica mesmo com enfermaria folgada.
    const pior = Math.max(geralPct, utiPct || 0);
    const atendimentos = Object.values(u.atendimentosHoje).reduce((s, n) => s + n, 0);
    return Object.assign({}, u, { total, ocupados, livres: total - ocupados, pct: geralPct, utiPct, situacao: situacao(pior), atendimentos });
  }

  function resumo(lista = unidades) {
    const us = lista.map(resumoUnidade).sort((a, b) => Math.max(b.pct, b.utiPct || 0) - Math.max(a.pct, a.utiPct || 0));
    const grupos = lista.flatMap((u) => u.grupos);
    const uti = grupos.filter((x) => x.uti);
    const total = soma(grupos, 'total');
    const ocupados = soma(grupos, 'ocupados');
    const porTipo = {};
    lista.forEach((u) => Object.entries(u.atendimentosHoje).forEach(([t, n]) => { porTipo[t] = (porTipo[t] || 0) + n; }));
    return {
      total,
      ocupados,
      livres: total - ocupados,
      pct: pct(ocupados, total),
      utiTotal: soma(uti, 'total'),
      utiLivres: soma(uti, 'total') - soma(uti, 'ocupados'),
      utiPct: pct(soma(uti, 'ocupados'), soma(uti, 'total')),
      unidades: us,
      emAlerta: us.filter((u) => u.situacao === 'critica'),
      atendimentosHoje: { total: Object.values(porTipo).reduce((s, n) => s + n, 0), porTipo },
    };
  }

  GC.leitos = { resumo, resumoUnidade, situacao };
})(window.GC = window.GC || {});
