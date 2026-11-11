(function (GC) {
  // Cruzamento de dados: séries mensais (12 meses) por bairro, por região e da cidade, para cruzar dois
  // indicadores (ex.: ocupação hospitalar × chuva por região). Roda depois de cidade.js e data-secretarias.js.
  //
  // Regra de consistência (testada em tests/cruzamento.test.js, nas três cidades):
  // - Indicadores de SOMA (alagamentos, quedas de energia, B.O.s, dengue): a soma dos bairros é, mês a mês,
  //   exatamente o total da cidade, e o total da cidade é a série da secretaria (a mesma do Pulso e da página).
  //   B.O.s do último mês por bairro = os B.O.s de 30 dias do mapa de segurança.
  // - Indicadores de MÉDIA (chuva, ocupação, espera, coleta): a média das regiões, ponderada (por bairros,
  //   leitos ou população), é o valor da cidade. Ocupação do último mês = ocupação atual da central de leitos;
  //   espera e coleta do último mês = último mês das séries da Saúde e da Limpeza Urbana.
  const D = GC.data;
  const M = 12;
  const r1 = (n) => Math.round(n * 10) / 10;
  const somaArr = (a) => a.reduce((s, n) => s + n, 0);
  // Número estável (sem aleatoriedade): o mesmo desenho a cada carga.
  const hash = (...ns) => {
    let h = 2166136261;
    ns.forEach((n) => { h = Math.imul(h ^ (n + 0x9e37), 16777619); h ^= h >>> 13; });
    return (h >>> 0) / 4294967296;
  };
  const cod = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const ruido = (id, m, amp) => (hash(cod(id), m) - 0.5) * 2 * amp;

  // Reparte um total inteiro por pesos, somando exatamente o total (maior resto).
  function repartir(total, pesos) {
    const ids = Object.keys(pesos);
    const sw = somaArr(ids.map((id) => pesos[id])) || 1;
    const bruto = ids.map((id) => ({ id, v: (total * pesos[id]) / sw }));
    const out = Object.fromEntries(bruto.map((x) => [x.id, Math.floor(x.v)]));
    let falta = total - somaArr(Object.values(out));
    bruto.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || a.id.localeCompare(b.id));
    for (let i = 0; falta > 0; i = (i + 1) % bruto.length, falta--) out[bruto[i].id] += 1;
    return out;
  }

  // ---- regiões: Centro + pontos cardeais, pela posição do bairro em relação ao centro da cidade ----
  const bairros = D.bairros;
  const popTotal = somaArr(bairros.map((b) => b.populacao));
  const cy = somaArr(bairros.map((b) => b.centro[0] * b.populacao)) / popTotal;
  const cx = somaArr(bairros.map((b) => b.centro[1] * b.populacao)) / popTotal;
  const kx = Math.cos((cy * Math.PI) / 180);
  const pos = Object.fromEntries(bairros.map((b) => [b.id, { dx: (b.centro[1] - cx) * kx, dy: b.centro[0] - cy }]));
  const raioMax = Math.max(...bairros.map((b) => Math.hypot(pos[b.id].dx, pos[b.id].dy))) || 1;
  const NOMES_REGIAO = { centro: 'Região Central', norte: 'Região Norte', sul: 'Região Sul', leste: 'Região Leste', oeste: 'Região Oeste' };
  const regiaoDe = {};
  bairros.forEach((b) => {
    const { dx, dy } = pos[b.id];
    if (Math.hypot(dx, dy) < raioMax * 0.32) regiaoDe[b.id] = 'centro';
    else if (Math.abs(dy) >= Math.abs(dx)) regiaoDe[b.id] = dy > 0 ? 'norte' : 'sul';
    else regiaoDe[b.id] = dx > 0 ? 'leste' : 'oeste';
  });
  const unidades = (D.leitos && D.leitos.unidades) || [];
  const regioes = Object.keys(NOMES_REGIAO)
    .map((id) => {
      const bs = bairros.filter((b) => regiaoDe[b.id] === id);
      const us = unidades.filter((u) => regiaoDe[u.bairroId] === id);
      const leitos = somaArr(us.flatMap((u) => u.grupos.map((g) => g.total)));
      const ocupados = somaArr(us.flatMap((u) => u.grupos.map((g) => g.ocupados)));
      return { id, nome: NOMES_REGIAO[id], bairros: bs.map((b) => b.id), populacao: somaArr(bs.map((b) => b.populacao)), leitos, ocupados, hospitais: us.map((u) => u.nome) };
    })
    .filter((r) => r.bairros.length);

  // ---- chuva (mm/mês, média das estações) ----
  // Escrita na mesma ordem das séries das secretarias (12 meses fechados): o pico de chuva coincide com o pico de
  // alagamentos da Defesa Civil, como na vida real.
  const CHUVA_CIDADE = [165, 215, 255, 205, 165, 85, 60, 45, 35, 55, 105, 150];
  const FATOR_CHUVA = { centro: 1, norte: 1.09, sul: 0.93, leste: 1.04, oeste: 0.95 };
  const chuvaReg = {};
  regioes.forEach((r) => { chuvaReg[r.id] = CHUVA_CIDADE.map((v, m) => Math.round(v * FATOR_CHUVA[r.id] * (1 + ruido(r.id, m, 0.05)))); });
  const pesoChuva = (rid) => regioes.find((r) => r.id === rid).bairros.length;
  const chuvaCidade = CHUVA_CIDADE.map((_, m) => r1(somaArr(regioes.map((r) => chuvaReg[r.id][m] * pesoChuva(r.id))) / bairros.length));
  const chuvaRel = (bid, m) => chuvaReg[regiaoDe[bid]][m] / (chuvaCidade[m] || 1);

  const sec = D.secretarias;
  const hist = D.historico30d;
  const porBairro = {};

  // ---- indicadores de soma: total da cidade = série da secretaria; bairros repartem por peso ----
  const repartirMeses = (totais, peso) => {
    const out = Object.fromEntries(bairros.map((b) => [b.id, []]));
    totais.forEach((t, m) => {
      const pesos = Object.fromEntries(bairros.map((b) => [b.id, Math.max(0.0001, peso(b, m))]));
      const r = repartir(t, pesos);
      bairros.forEach((b) => out[b.id].push(r[b.id]));
    });
    return out;
  };
  const areasRisco = new Set(((D.risco && D.risco.areas) || []).map((a) => a.bairroId));
  porBairro.alagamentos = repartirMeses(sec.defesa_civil.serie.meses, (b, m) =>
    (1 + ((hist.defesa_civil || {})[b.id] || 0)) * (areasRisco.has(b.id) ? 1.6 : 1) * chuvaRel(b.id, m) ** 2);
  porBairro.quedas = repartirMeses(sec.infraestrutura.serie.meses, (b, m) =>
    (1 + ((hist.infraestrutura || {})[b.id] || 0)) * (0.7 + 0.3 * chuvaRel(b.id, m)));
  // B.O.s: o último mês é exatamente o mapa de 30 dias da segurança; os anteriores seguem o mesmo perfil.
  const bo30 = D.seguranca.porBairro30d;
  porBairro.bos = repartirMeses(sec.seguranca.serie.meses, (b) => bo30[b.id] || 0.5);
  const ultBo = repartir(sec.seguranca.serie.meses[M - 1], Object.fromEntries(bairros.map((b) => [b.id, bo30[b.id] || 0])));
  bairros.forEach((b) => { porBairro.bos[b.id][M - 1] = ultBo[b.id]; });
  // Dengue: segue a chuva do mês anterior (o mosquito vem depois da água parada).
  const focoDengue = new Set(D.ocorrencias.filter((o) => o.tipo === 'surto').map((o) => o.bairroId));
  const chuvaAnterior = (m) => (m === 0 ? CHUVA_CIDADE[M - 1] : CHUVA_CIDADE[m - 1]);
  const dengueCidade = CHUVA_CIDADE.map((_, m) => Math.round((popTotal / 1000) * (0.04 + 0.0026 * chuvaAnterior(m))));
  porBairro.dengue = repartirMeses(dengueCidade, (b, m) => b.populacao * (focoDengue.has(b.id) ? 2.2 : 1) * (m ? chuvaRel(b.id, m - 1) : 1));

  // ---- indicadores de média por região, centrados no valor da cidade ----
  function centrar(porReg, cidade, peso) {
    regioes.forEach((r) => { porReg[r.id] = porReg[r.id].slice(); });
    cidade.forEach((v, m) => {
      const ws = regioes.filter((r) => porReg[r.id][m] != null && peso(r) > 0);
      const sw = somaArr(ws.map(peso));
      if (!sw) return;
      const media = somaArr(ws.map((r) => porReg[r.id][m] * peso(r))) / sw;
      ws.forEach((r) => { porReg[r.id][m] = r1(porReg[r.id][m] + (v - media)); });
    });
    return porReg;
  }
  const porRegiao = { chuva: chuvaReg };
  const cidade = { chuva: chuvaCidade };

  // Ocupação hospitalar: só regiões com hospital. O último mês é a ocupação atual de cada região (central de
  // leitos); os anteriores sobem com a chuva (dengue, quedas, acidentes de trânsito no período chuvoso).
  const comLeito = regioes.filter((r) => r.leitos > 0);
  const totalLeitos = somaArr(comLeito.map((r) => r.leitos));
  porRegiao.ocupacao = {};
  regioes.forEach((r) => {
    if (!r.leitos) { porRegiao.ocupacao[r.id] = Array(M).fill(null); return; }
    const atual = (r.ocupados / r.leitos) * 100;
    porRegiao.ocupacao[r.id] = chuvaReg[r.id].map((c, m) => (m === M - 1 ? r1(atual)
      : r1(Math.min(99, Math.max(50, atual + 0.045 * (c - chuvaReg[r.id][M - 1]) + ruido(`oc-${r.id}`, m, 2.2))))));
  });
  cidade.ocupacao = Array.from({ length: M }, (_, m) => r1(somaArr(comLeito.map((r) => porRegiao.ocupacao[r.id][m] * r.leitos)) / (totalLeitos || 1)));
  // Último mês: exatamente ocupados/total da rede (o mesmo número do widget de leitos).
  if (totalLeitos) cidade.ocupacao[M - 1] = r1((somaArr(comLeito.map((r) => r.ocupados)) / totalLeitos) * 100);

  // Espera nas UBS: série da Saúde; regiões com UBS mais lotadas esperam mais.
  const ubs = (D.series.lotacaoUbs || []);
  const lotReg = (rid) => { const us = ubs.filter((u) => regiaoDe[u.bairroId] === rid); return us.length ? somaArr(us.map((u) => u.pct)) / us.length : null; };
  const lotMedia = ubs.length ? somaArr(ubs.map((u) => u.pct)) / ubs.length : 0;
  cidade.espera = sec.saude.serie.meses.slice();
  porRegiao.espera = Object.fromEntries(regioes.map((r) => {
    const l = lotReg(r.id);
    const off = l == null ? 0 : (l - lotMedia) * 0.6;
    return [r.id, cidade.espera.map((v, m) => r1(v + off + ruido(`es-${r.id}`, m, 2)))];
  }));
  centrar(porRegiao.espera, cidade.espera, (r) => r.populacao);

  // Coleta no prazo: série da Limpeza Urbana; regiões das rotas mais atrasadas ficam abaixo.
  const rotas = (D.coleta && D.coleta.rotas) || [];
  const prazoReg = (rid) => { const rs = rotas.filter((x) => x.bairros.some((b) => regiaoDe[b] === rid)); return rs.length ? somaArr(rs.map((x) => x.noPrazoPct)) / rs.length : null; };
  const prazoMedia = rotas.length ? somaArr(rotas.map((x) => x.noPrazoPct)) / rotas.length : 0;
  cidade.coleta = sec.limpeza.serie.meses.slice();
  porRegiao.coleta = Object.fromEntries(regioes.map((r) => {
    const p = prazoReg(r.id);
    const off = p == null ? 0 : (p - prazoMedia) * 0.4;
    return [r.id, cidade.coleta.map((v, m) => r1(Math.min(100, v + off + ruido(`co-${r.id}`, m, 1))))];
  }));
  centrar(porRegiao.coleta, cidade.coleta, (r) => r.populacao);

  // Somas: regiões e cidade saem dos bairros (a cidade confere com a série da secretaria).
  ['alagamentos', 'quedas', 'bos', 'dengue'].forEach((ind) => {
    porRegiao[ind] = Object.fromEntries(regioes.map((r) => [r.id, Array.from({ length: M }, (_, m) => somaArr(r.bairros.map((b) => porBairro[ind][b][m])))]));
    cidade[ind] = Array.from({ length: M }, (_, m) => somaArr(bairros.map((b) => porBairro[ind][b.id][m])));
  });

  const INDICADORES = [
    { id: 'chuva', nome: 'Chuva acumulada', curto: 'Chuva', unidade: 'mm', agregacao: 'media', area: null, fonte: 'Estações pluviométricas da Defesa Civil', chaves: ['chuva', 'chov', 'pluvio', 'precipita'] },
    { id: 'ocupacao', nome: 'Ocupação hospitalar', curto: 'Ocupação', unidade: '%', agregacao: 'media', area: 'saude', fonte: 'Central de leitos (regulação da Saúde)', chaves: ['ocupa', 'leito', 'hospita', 'internac'] },
    { id: 'dengue', nome: 'Casos suspeitos de dengue', curto: 'Dengue', unidade: 'casos', agregacao: 'soma', area: 'saude', fonte: 'Vigilância epidemiológica', chaves: ['dengue', 'arbovir', 'mosquito'] },
    { id: 'espera', nome: 'Espera média nas UBS', curto: 'Espera UBS', unidade: 'min', agregacao: 'media', area: 'saude', fonte: 'Sistema de regulação e prontuário das UBS', chaves: ['espera', 'ubs', 'posto de saude', 'fila'] },
    { id: 'alagamentos', nome: 'Alagamentos', curto: 'Alagamentos', unidade: 'casos', agregacao: 'soma', area: 'defesa_civil', fonte: 'Sensores pluviométricos + vistorias da Defesa Civil', chaves: ['alaga', 'enchente', 'inunda'] },
    { id: 'quedas', nome: 'Quedas de energia', curto: 'Quedas de energia', unidade: 'ocorrências', agregacao: 'soma', area: 'infraestrutura', fonte: 'Concessionária de energia (integração)', chaves: ['energia', 'queda de luz', 'apagao', 'falta de luz'] },
    { id: 'bos', nome: 'B.O.s registrados', curto: 'B.O.s', unidade: 'B.O.s', agregacao: 'soma', area: 'seguranca', fonte: 'Boletins de ocorrência (Polícia Civil) + Guarda Municipal', chaves: ['b.o', 'bo ', 'boletim', 'crime', 'criminal', 'violencia', 'seguranca', 'roubo', 'furto'] },
    { id: 'coleta', nome: 'Coleta no prazo', curto: 'Coleta', unidade: '%', agregacao: 'media', area: 'limpeza', fonte: 'GPS dos caminhões de coleta', chaves: ['coleta', 'lixo', 'limpeza'] },
  ];

  D.cruzamento = { indicadores: INDICADORES, regioes, regiaoDe, meses: D.mesesSerie.slice(), porBairro, porRegiao, cidade };
})(window.GC = window.GC || {});
