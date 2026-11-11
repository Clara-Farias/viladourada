(function (GC) {
  // Dados de gestão para os widgets novos (demonstração): orçamento, arrecadação, contratos e SLA,
  // custo por serviço, voz do cidadão (156, app, WhatsApp, ouvidoria), iluminação pública, assistência
  // social, meio ambiente, agenda de prazos e a previsão de 48 h. Os números são simulados e escalam com
  // a população da cidade da demonstração (js/cidade.js), como os outros módulos data-*.
  // Só lógica: as telas ficam em js/widgets-extra.js.
  const BASE_POP = 250000;
  const fator = () => ((GC.cidade && GC.cidade.populacao) || BASE_POP) / BASE_POP;
  const inteiro = (n) => Math.max(0, Math.round(n * fator()));
  const mi = (n) => Math.round(n * fator() * 10) / 10;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const DIA = 86400000;
  const bairroN = (k) => { const b = (GC.data && GC.data.bairros) || []; return b.length ? b[k % b.length] : { id: `b${k}`, nome: `Bairro ${k + 1}` }; };

  // ---- Orçamento: previsto × empenhado × pago, por secretaria (R$ milhões, ano corrente) ----
  const ORC = [
    ['saude', 'Saúde', 310, 78, 64], ['educacao', 'Educação', 290, 81, 70], ['infraestrutura', 'Infraestrutura', 140, 66, 41],
    ['seguranca', 'Segurança', 62, 74, 61], ['mobilidade', 'Mobilidade', 58, 69, 52], ['limpeza', 'Limpeza Urbana', 74, 83, 72],
    ['defesa_civil', 'Defesa Civil', 18, 58, 37], ['assistencia', 'Assistência Social', 46, 76, 63],
  ];
  function orcamento({ mesDoAno = 10 } = {}) {
    const esperadoPct = Math.round((mesDoAno / 12) * 100);
    const areas = ORC.map(([id, nome, prev, emp, pago]) => {
      const previsto = mi(prev);
      return { id, nome, previstoMi: previsto, empenhadoPct: emp, pagoPct: pago, empenhadoMi: Math.round(previsto * emp) / 100, pagoMi: Math.round(previsto * pago) / 100, atrasada: pago < esperadoPct - 15 };
    });
    const previstoMi = Math.round(areas.reduce((s, a) => s + a.previstoMi, 0) * 10) / 10;
    const empenhadoMi = Math.round(areas.reduce((s, a) => s + a.empenhadoMi, 0) * 10) / 10;
    const pagoMi = Math.round(areas.reduce((s, a) => s + a.pagoMi, 0) * 10) / 10;
    return { previstoMi, empenhadoMi, pagoMi, empenhadoPct: pct(empenhadoMi, previstoMi), pagoPct: pct(pagoMi, previstoMi), esperadoPct, areas, atrasadas: areas.filter((a) => a.atrasada) };
  }

  // ---- Arrecadação própria: mês e ano × meta (R$ milhões) ----
  const TRIB = [['IPTU', 3.1, 3.4, 52, 54], ['ISS', 6.8, 6.5, 71, 76], ['ITBI', 1.2, 1.4, 14, 16], ['Taxas', 0.9, 1.0, 10, 11]];
  function arrecadacao() {
    const tributos = TRIB.map(([nome, mes, metaMes, ano, metaAno]) => ({ nome, mesMi: mi(mes), metaMesMi: mi(metaMes), anoMi: mi(ano), metaAnoMi: mi(metaAno), mesPct: pct(mes, metaMes), anoPct: pct(ano, metaAno) }));
    const soma = (k) => Math.round(tributos.reduce((s, t) => s + t[k], 0) * 10) / 10;
    const r = { tributos, mesMi: soma('mesMi'), metaMesMi: soma('metaMesMi'), anoMi: soma('anoMi'), metaAnoMi: soma('metaAnoMi') };
    r.mesPct = pct(r.mesMi, r.metaMesMi); r.anoPct = pct(r.anoMi, r.metaAnoMi);
    r.inadimplenciaIptuPct = 18.4;
    return r;
  }

  // ---- Contratos e SLA ----
  const CONTR = [
    { id: 'ct-lixo', nome: 'Coleta e destinação de resíduos', empresa: 'LimpaMais Ambiental', area: 'limpeza', valorMi: 38, venceDias: 74, slaPct: 93, metaSlaPct: 95, multaMil: 41 },
    { id: 'ct-luz', nome: 'Manutenção da iluminação pública', empresa: 'Luz da Cidade S.A.', area: 'infraestrutura', valorMi: 12, venceDias: 22, slaPct: 81, metaSlaPct: 90, multaMil: 18 },
    { id: 'ct-merenda', nome: 'Merenda escolar', empresa: 'Nutrir Alimentos', area: 'educacao', valorMi: 21, venceDias: 190, slaPct: 98, metaSlaPct: 97, multaMil: 0 },
    { id: 'ct-vigil', nome: 'Vigilância patrimonial', empresa: 'Guarda Forte', area: 'seguranca', valorMi: 9, venceDias: 48, slaPct: 96, metaSlaPct: 95, multaMil: 0 },
    { id: 'ct-ti', nome: 'Sistemas de gestão (ERP)', empresa: 'GovTech Brasil', area: null, valorMi: 6, venceDias: 12, slaPct: 99, metaSlaPct: 99, multaMil: 0 },
    { id: 'ct-poda', nome: 'Poda e roçada', empresa: 'Verde Vivo', area: 'infraestrutura', valorMi: 4, venceDias: 130, slaPct: 84, metaSlaPct: 90, multaMil: 9 },
  ];
  function contratos(agora = Date.now()) {
    const lista = CONTR.map((c) => Object.assign({}, c, {
      valorMi: mi(c.valorMi), multaMil: inteiro(c.multaMil), vence: new Date(agora + c.venceDias * DIA).toISOString().slice(0, 10),
      foraSla: c.slaPct < c.metaSlaPct, vencendo: c.venceDias <= 60,
    })).sort((a, b) => (b.foraSla - a.foraSla) || (a.venceDias - b.venceDias));
    return { lista, foraSla: lista.filter((c) => c.foraSla), vencendo: lista.filter((c) => c.vencendo), multaMil: lista.reduce((s, c) => s + c.multaMil, 0) };
  }

  // ---- Custo por serviço (R$, mês atual × anterior) ----
  const CUSTOS = [
    { id: 'consulta', nome: 'Consulta na UBS', area: 'saude', unidade: 'por consulta', atual: 92, anterior: 88 },
    { id: 'aluno', nome: 'Aluno na rede', area: 'educacao', unidade: 'por aluno/mês', atual: 610, anterior: 598 },
    { id: 'tonelada', nome: 'Coleta de lixo', area: 'limpeza', unidade: 'por tonelada', atual: 214, anterior: 221 },
    { id: 'buraco', nome: 'Tapa-buraco', area: 'infraestrutura', unidade: 'por m²', atual: 67, anterior: 58 },
    { id: 'ocorrencia', nome: 'Ocorrência resolvida', area: null, unidade: 'por ocorrência', atual: 1340, anterior: 1415 },
    { id: 'km', nome: 'Ônibus (subsídio)', area: 'mobilidade', unidade: 'por km rodado', atual: 3.9, anterior: 3.8 },
  ];
  function custos() {
    return CUSTOS.map((c) => Object.assign({}, c, { variacaoPct: Math.round(((c.atual - c.anterior) / c.anterior) * 1000) / 10 }))
      .sort((a, b) => b.variacaoPct - a.variacaoPct);
  }

  // ---- Voz do cidadão (30 dias) ----
  function vozCidadao() {
    const canais = [
      { id: '156', nome: 'Telefone 156', n: inteiro(4210) }, { id: 'app', nome: 'App Cidadão', n: inteiro(3380) },
      { id: 'whatsapp', nome: 'WhatsApp', n: inteiro(2950) }, { id: 'ouvidoria', nome: 'Ouvidoria', n: inteiro(410) },
    ];
    const total = canais.reduce((s, c) => s + c.n, 0);
    const temas = [
      { tema: 'Buraco na rua', n: inteiro(1840), positivo: 12, negativo: 71, sobe: true },
      { tema: 'Iluminação apagada', n: inteiro(1310), positivo: 18, negativo: 60, sobe: true },
      { tema: 'Espera na UBS', n: inteiro(1120), positivo: 9, negativo: 78, sobe: false },
      { tema: 'Coleta de lixo', n: inteiro(870), positivo: 31, negativo: 44, sobe: false },
      { tema: 'Poda de árvore', n: inteiro(640), positivo: 22, negativo: 41, sobe: true },
    ];
    const sentimento = { positivo: 24, neutro: 35, negativo: 41, negativoAntes: 45 };
    const semanas = [2380, 2510, 2440, 2620, 2790, 2650, 2580, 2710, 2890, 2760, 2640, 2700].map(inteiro);
    return { canais, total, temas, sentimento, semanas };
  }

  // ---- Tempo de resposta ao cidadão ----
  function respostaCidadao() {
    const abertos = inteiro(1260); const respondidos = inteiro(9240); const atrasados = inteiro(214);
    return {
      abertos, respondidos, atrasados, noPrazoPct: 91.2, metaPct: 95, tempoMedioH: 31, metaH: 48,
      porCanal: [
        { nome: '156', tempoH: 22, noPrazoPct: 95 }, { nome: 'App', tempoH: 27, noPrazoPct: 93 },
        { nome: 'WhatsApp', tempoH: 19, noPrazoPct: 96 }, { nome: 'Ouvidoria', tempoH: 96, noPrazoPct: 71 },
      ],
    };
  }

  // ---- Iluminação pública ----
  function iluminacao() {
    const pontos = inteiro(18400); const apagados = inteiro(312);
    const bairros = [0, 3, 5, 8, 11].map((k, j) => ({ id: bairroN(k).id, nome: bairroN(k).nome, apagados: Math.max(1, Math.round(apagados * [0.22, 0.17, 0.13, 0.1, 0.08][j])) }));
    return { pontos, apagados, apagadosPct: pct(apagados, pontos), reparoMedioH: 61, metaH: 48, ledPct: 46, ledMetaPct: 60, bairros };
  }

  // ---- Assistência social ----
  function assistencia() {
    const abrigos = [
      { nome: 'Casa de Passagem Centro', vagas: inteiro(60) || 8, ocupadas: inteiro(57) || 7 },
      { nome: 'Abrigo Familiar Esperança', vagas: inteiro(40) || 6, ocupadas: inteiro(31) || 4 },
      { nome: 'Acolhimento Infantil', vagas: inteiro(24) || 4, ocupadas: inteiro(23) || 4 },
    ].map((a) => Object.assign(a, { pct: pct(a.ocupadas, a.vagas) }));
    const vagas = abrigos.reduce((s, a) => s + a.vagas, 0); const ocupadas = abrigos.reduce((s, a) => s + a.ocupadas, 0);
    return {
      abrigos, vagas, ocupadas, ocupacaoPct: pct(ocupadas, vagas),
      bolsaFamilia: { familias: inteiro(14800), valorMedio: 682, novasNoMes: inteiro(212), canceladasNoMes: inteiro(96) },
      cras: { atendimentosMes: inteiro(5300), unidades: Math.max(1, inteiro(6)) },
      populacaoRua: inteiro(380),
    };
  }

  // ---- Meio ambiente ----
  function ambiente() {
    const iqa = 58;
    const categoria = iqa <= 40 ? 'Boa' : iqa <= 80 ? 'Moderada' : iqa <= 120 ? 'Ruim' : 'Muito ruim';
    return {
      ar: { iqa, categoria, poluente: 'PM2,5', estacao: 'Estação Centro (CETESB)', dias: [42, 47, 51, 63, 58, 55, 58] },
      poda: { pendentes: inteiro(486), atendidasMes: inteiro(372), prazoMedioDias: 23, metaDias: 15 },
      verdeM2Hab: 11.6, verdeMetaM2Hab: 12, focosQueimada: inteiro(7), arvoresPlantadasAno: inteiro(2140),
    };
  }

  // ---- Agenda e prazos (próximos 14 dias): reuniões, contratos vencendo e entregas de obra ----
  const dataISO = (t) => new Date(t).toISOString().slice(0, 10);
  function agenda(agora = Date.now(), { obras = [], dias = 14 } = {}) {
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
    const em = (d, h = 9) => hoje.getTime() + d * DIA + h * 3600000;
    const itens = [
      { tipo: 'reuniao', titulo: 'Reunião do secretariado', quando: em(1, 9), local: 'Gabinete' },
      { tipo: 'audiencia', titulo: 'Audiência pública · LOA 2027', quando: em(3, 19), local: 'Câmara Municipal' },
      { tipo: 'evento', titulo: 'Mutirão de saúde da mulher', quando: em(5, 8), local: 'UBS Bela Vista' },
      { tipo: 'prazo', titulo: 'Prestação de contas ao TCE', quando: em(9, 18), local: 'Controladoria' },
    ];
    contratos(agora).lista.filter((c) => c.venceDias <= dias).forEach((c) => itens.push({ tipo: 'contrato', titulo: `Vence: ${c.nome}`, quando: em(c.venceDias, 23), local: c.empresa, alvo: c.id }));
    obras.filter((o) => o.previsaoAtual && o.situacao !== 'concluida').forEach((o) => {
      const t = new Date(`${o.previsaoAtual}T12:00:00`).getTime();
      if (t >= hoje.getTime() && t <= hoje.getTime() + dias * DIA) itens.push({ tipo: 'obra', titulo: `Entrega: ${o.nome}`, quando: t, local: o.empresa || '', alvo: o.id });
    });
    return itens.filter((x) => x.quando >= hoje.getTime() && x.quando <= hoje.getTime() + dias * DIA)
      .sort((a, b) => a.quando - b.quando).map((x) => Object.assign(x, { data: dataISO(x.quando), emDias: Math.floor((x.quando - hoje.getTime()) / DIA) }));
  }

  // ---- Previsão de 48 h: chuva por janela de 6 h (a partir das janelas do risco), temperatura e chance ----
  function previsao48h(previsao, agora = Date.now()) {
    const j = (previsao && previsao.janelas) || [];
    const acumulado = (h) => { // mm acumulados até h horas (interpolação linear entre as janelas do radar)
      if (!j.length) return 0;
      let ant = { horas: 0, mm: 0 };
      for (const x of j) { if (h <= x.horas) return ant.mm + ((h - ant.horas) / (x.horas - ant.horas)) * (x.mm - ant.mm); ant = x; }
      const ult = j[j.length - 1]; return ult.mm + (h - ult.horas) * 0.4; // depois de 24 h: chuva fraca
    };
    const h0 = new Date(agora).getHours();
    const blocos = [];
    for (let k = 0; k < 8; k++) {
      const mm = Math.round((acumulado((k + 1) * 6) - acumulado(k * 6)) * 10) / 10;
      const hora = (h0 + k * 6) % 24;
      const temp = Math.round(22 + 6 * Math.sin(((hora - 9) / 24) * 2 * Math.PI) - Math.min(4, mm / 4));
      blocos.push({ inicioH: k * 6, hora, mm, chancePct: Math.min(95, Math.round(15 + mm * 4)), tempC: temp });
    }
    return { blocos, total48h: Math.round(acumulado(48)), fonte: previsao ? previsao.fonte : 'Previsão', maxMm: Math.max(...blocos.map((b) => b.mm), 1) };
  }

  GC.gestao = { orcamento, arrecadacao, contratos, custos, vozCidadao, respostaCidadao, iluminacao, assistencia, ambiente, agenda, previsao48h };
})(window.GC = window.GC || {});
