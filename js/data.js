(function (GC) {
  // ---- Geografia: grade 4x2 de bairros com vértices compartilhados (sem sobreposição) ----
  const LATS = [-22.88, -22.905, -22.93];
  const LNGS = [-47.1, -47.08, -47.06, -47.04, -47.02];
  const JITTER = [
    [[0, 0], [0.002, -0.001], [-0.001, 0.002], [0.002, 0.001], [0, 0]],
    [[0.001, 0], [-0.003, 0.002], [0.002, -0.002], [-0.002, 0.003], [0.001, 0]],
    [[0, 0], [-0.001, 0.002], [0.002, 0.001], [-0.002, -0.001], [0, 0]],
  ];
  const v = (r, c) => [LATS[r] + JITTER[r][c][0], LNGS[c] + JITTER[r][c][1]];

  const BAIRROS = [
    ['alto_da_serra', 'Alto da Serra', 0, 0, 18200],
    ['bela_vista', 'Bela Vista', 0, 1, 24500],
    ['jardim_das_flores', 'Jardim das Flores', 0, 2, 21300],
    ['parque_industrial', 'Parque Industrial', 0, 3, 9800],
    ['lagoa_azul', 'Lagoa Azul', 1, 0, 16700],
    ['centro', 'Centro', 1, 1, 32400],
    ['vila_nova', 'Vila Nova', 1, 2, 27900],
    ['porto_dourado', 'Porto Dourado', 1, 3, 19100],
  ];

  // ---- Bordas orgânicas ----
  // A grade dá bairros quadrados. Duas etapas tiram a cara de tabuleiro:
  // 1. Silhueta: os cantos da cidade entram (arredonda) e os vértices do meio da borda saem um pouco.
  // 2. Arestas: cada uma vira uma curva suave (soma de senoides que zera nas pontas), calculada a partir
  //    das duas pontas, então os dois bairros vizinhos recebem exatamente os mesmos pontos (sem buraco
  //    nem sobreposição). Na borda externa, a curva abaula para fora.
  // Sem aleatoriedade: o mesmo desenho a cada carga. Amplitudes pequenas o bastante para nada sair do
  // seu bairro (os testes de data e de cidades conferem ponto a ponto).
  const PONTOS_ARESTA = 20; // pontos intermediários por aresta
  const CURVA = { interna: 0.11, externa: 0.06 }; // fração do comprimento da aresta
  const CANTO_ENTRA = 0.38; // canto da cidade anda essa fração do caminho até o centro do bairro
  const BORDA_SAI = 0.07; // vértice do meio da borda sai essa fração do lado da célula
  // opcoes.silhueta = false pula a etapa 1: quem chama já desenhou o contorno (js/cidade.js faz assim).
  GC.bordasOrganicas = function (lista, opcoes = {}) {
    const chave = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    const arestaDe = (p, q) => [chave(p), chave(q)].sort().join('|');
    const aresta = (b, i) => [b.poligono[i], b.poligono[(i + 1) % b.poligono.length]];
    const contar = () => {
      const usos = new Map();
      lista.forEach((b) => b.poligono.forEach((_, i) => { const k = arestaDe(...aresta(b, i)); usos.set(k, (usos.get(k) || 0) + 1); }));
      return usos;
    };

    // ---- 1. silhueta ----
    let usos = contar();
    const naBorda = new Set(); // vértices que tocam uma aresta externa
    const donos = new Map(); // vértice → bairros que o usam
    lista.forEach((b) => b.poligono.forEach((p, i) => {
      const [, q] = aresta(b, i);
      if (usos.get(arestaDe(p, q)) === 1) { naBorda.add(chave(p)); naBorda.add(chave(q)); }
      if (!donos.has(chave(p))) donos.set(chave(p), []);
      donos.get(chave(p)).push(b);
    }));
    const todos = lista.flatMap((b) => b.poligono);
    const meioCidade = [todos.reduce((s, p) => s + p[0], 0) / todos.length, todos.reduce((s, p) => s + p[1], 0) / todos.length];
    const lado = Math.hypot(lista[0].poligono[0][0] - lista[0].poligono[1][0], lista[0].poligono[0][1] - lista[0].poligono[1][1]);
    const novoVertice = new Map();
    donos.forEach((bs, k) => {
      if (!naBorda.has(k)) return;
      const p = bs[0].poligono.find((x) => chave(x) === k);
      let n;
      if (bs.length === 1) { // canto da cidade: entra rumo ao centro do bairro
        const c = bs[0].centro;
        n = [p[0] + (c[0] - p[0]) * CANTO_ENTRA, p[1] + (c[1] - p[1]) * CANTO_ENTRA];
      } else { // meio da borda: sai, para longe do centro da cidade
        const d = [p[0] - meioCidade[0], p[1] - meioCidade[1]];
        const m = Math.hypot(d[0], d[1]) || 1;
        n = [p[0] + (d[0] / m) * lado * BORDA_SAI, p[1] + (d[1] / m) * lado * BORDA_SAI];
      }
      novoVertice.set(k, [+n[0].toFixed(5), +n[1].toFixed(5)]);
    });
    if (opcoes.silhueta === false) novoVertice.clear();
    lista.forEach((b) => { b.poligono = b.poligono.map((p) => novoVertice.get(chave(p)) || p); });

    // ---- 2. arestas curvas ----
    usos = contar();
    // Semente estável a partir do texto da aresta.
    const semente = (txt) => { let h = 2166136261; for (const ch of txt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
    const cache = new Map(); // aresta (sentido canônico) → pontos intermediários
    function meio(p, q, centro) {
      const [ka, kb] = [chave(p), chave(q)];
      const invertida = ka > kb;
      const k = invertida ? `${kb}|${ka}` : `${ka}|${kb}`;
      if (!cache.has(k)) {
        const [a, b] = invertida ? [q, p] : [p, q];
        const dLat = b[0] - a[0];
        const dLng = b[1] - a[1];
        const comp = Math.hypot(dLat, dLng);
        let normal = [-dLng / comp, dLat / comp];
        const externa = usos.get(k) === 1;
        const s = [semente(k), semente(`${k}#2`), semente(`${k}#3`)];
        const f1 = 1 + Math.floor(s[0] * 2); // 1 ou 2 ondas largas
        const f2 = 2 + Math.floor(s[1] * 2); // 2 ou 3 ondas menores
        if (externa) {
          // Normal apontando para fora do bairro (aresta externa só tem um dono).
          const mid = [(a[0] + b[0]) / 2 - centro[0], (a[1] + b[1]) / 2 - centro[1]];
          if (mid[0] * normal[0] + mid[1] * normal[1] < 0) normal = [-normal[0], -normal[1]];
        }
        const amp = comp * (externa ? CURVA.externa : CURVA.interna);
        const pts = [];
        for (let i = 1; i <= PONTOS_ARESTA; i++) {
          const t = i / (PONTOS_ARESTA + 1);
          const env = Math.sin(Math.PI * t);
          const onda = externa
            ? env * (0.65 + 0.35 * Math.sin(2 * Math.PI * f1 * t + s[2] * 6.283)) // abaula para fora, com leve ondulação
            : env * (0.8 * Math.sin(2 * Math.PI * f1 * t + s[2] * 6.283) + 0.2 * Math.sin(2 * Math.PI * f2 * t + s[0] * 6.283));
          pts.push([+(a[0] + dLat * t + normal[0] * amp * onda).toFixed(5), +(a[1] + dLng * t + normal[1] * amp * onda).toFixed(5)]);
        }
        cache.set(k, pts);
      }
      const pts = cache.get(k);
      return invertida ? [...pts].reverse() : pts;
    }
    lista.forEach((b) => {
      const cantos = b.poligono;
      b.poligono = cantos.flatMap((p, i) => [p, ...meio(p, cantos[(i + 1) % cantos.length], b.centro)]);
    });
    return lista;
  };

  const bairros = BAIRROS.map(([id, nome, r, c, populacao]) => {
    const poligono = [v(r, c), v(r, c + 1), v(r + 1, c + 1), v(r + 1, c)];
    const centro = [
      poligono.reduce((s, p) => s + p[0], 0) / 4,
      poligono.reduce((s, p) => s + p[1], 0) / 4,
    ];
    return { id, nome, centro, poligono, populacao };
  });
  GC.bordasOrganicas(bairros);
  const centroDe = Object.fromEntries(bairros.map((b) => [b.id, b.centro]));

  // Posição = centro do bairro + deslocamento pequeno (sempre dentro do polígono).
  function posicionar(item) {
    const [lat, lng] = centroDe[item.bairroId];
    const [dLat, dLng] = item.desloc || [0, 0];
    const out = Object.assign({}, item, { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) });
    delete out.desloc;
    return out;
  }

  // ---- Áreas e secretarias ----
  const areas = [
    { id: 'infraestrutura', nome: 'Infraestrutura', emoji: '🔧', secretaria: { id: 'infraestrutura', nome: 'Secretaria de Obras e Infraestrutura', emoji: '🛠' } },
    { id: 'defesa_civil', nome: 'Defesa Civil', emoji: '🌧', secretaria: { id: 'defesa_civil', nome: 'Defesa Civil', emoji: '🛰' } },
    { id: 'saude', nome: 'Saúde', emoji: '🏥', secretaria: { id: 'saude', nome: 'Secretaria de Saúde', emoji: '🩺' } },
    { id: 'educacao', nome: 'Educação', emoji: '🎓', secretaria: { id: 'educacao', nome: 'Secretaria de Educação', emoji: '📚' } },
    { id: 'seguranca', nome: 'Segurança', emoji: '🛡', secretaria: { id: 'seguranca', nome: 'Secretaria de Segurança', emoji: '🚓' } },
    { id: 'mobilidade', nome: 'Mobilidade', emoji: '🚦', secretaria: { id: 'mobilidade', nome: 'Secretaria de Mobilidade', emoji: '🚌' } },
    { id: 'limpeza', nome: 'Limpeza Urbana', emoji: '🧹', secretaria: { id: 'limpeza', nome: 'Limpeza Urbana', emoji: '🚛' } },
  ];

  // ---- Ocorrências ativas ----
  const oc = (id, area, tipo, titulo, bairroId, severidade, abertaHaMin, afetados, fonte, desloc) =>
    ({ id, area, tipo, titulo, bairroId, severidade, abertaHaMin, afetados, status: 'encaminhada', areasEnvolvidas: [area], fonte, desloc });

  const ocorrencias = [
    oc('oc-01', 'defesa_civil', 'alagamento', 'Alagamento na Rua XV de Novembro', 'centro', 'critica', 42, 1200, 'Sensor pluviométrico + 18 chamados 156', [0.003, -0.004]),
    oc('oc-02', 'defesa_civil', 'alagamento', 'Alagamento na Av. Brasil', 'centro', 'critica', 27, 850, 'Câmera de monitoramento + 9 chamados 156', [-0.004, 0.003]),
    oc('oc-03', 'defesa_civil', 'alagamento', 'Alagamento próximo à lagoa', 'lagoa_azul', 'alta', 65, 400, 'Sensor de nível da lagoa', [0.002, 0.004]),
    oc('oc-04', 'defesa_civil', 'deslizamento', 'Risco de deslizamento de encosta', 'alto_da_serra', 'alta', 95, 160, 'Vistoria da Defesa Civil', [-0.003, -0.002]),
    oc('oc-05', 'defesa_civil', 'queda de árvore', 'Árvore caída bloqueando calçada', 'porto_dourado', 'media', 30, 60, '4 chamados 156', [0.004, -0.003]),
    oc('oc-06', 'infraestrutura', 'queda de energia', 'Queda de energia em 14 quarteirões', 'vila_nova', 'critica', 80, 3100, 'Concessionária de energia (integração)', [0.002, -0.003]),
    oc('oc-07', 'infraestrutura', 'queda de energia', 'Queda de energia na Rua das Palmeiras', 'vila_nova', 'alta', 35, 640, '22 chamados 156', [-0.004, 0.004]),
    oc('oc-08', 'infraestrutura', 'queda de energia', 'Oscilação de energia no distrito industrial', 'parque_industrial', 'alta', 50, 300, 'Concessionária de energia (integração)', [0.003, 0.002]),
    oc('oc-09', 'infraestrutura', 'iluminação pública', 'Iluminação pública apagada na praça', 'jardim_das_flores', 'media', 300, 900, 'App Cidadão', [-0.002, -0.004]),
    oc('oc-10', 'infraestrutura', 'buraco', 'Buraco na Rua Aurora', 'bela_vista', 'media', 1440, 500, 'App Cidadão (31 fotos)', [0.004, 0.003]),
    oc('oc-11', 'infraestrutura', 'vazamento de água', 'Vazamento de água em adutora', 'centro', 'media', 55, 220, 'Companhia de saneamento', [0.005, 0.004]),
    oc('oc-12', 'saude', 'lotação', 'UBS Central com 94% de lotação', 'centro', 'alta', 120, 180, 'Sistema de regulação da Saúde', [-0.002, -0.005]),
    oc('oc-13', 'saude', 'lotação', 'Hospital Municipal: UTI 95% ocupada e fila de 4h', 'vila_nova', 'critica', 240, 260, 'Central de leitos + sistema hospitalar (integração)', [-0.005, -0.002]),
    oc('oc-14', 'saude', 'falta de médico', 'UBS Porto sem médico plantonista', 'porto_dourado', 'media', 180, 90, 'Escala da Secretaria de Saúde', [-0.003, 0.004]),
    oc('oc-15', 'educacao', 'falta de água', 'Escola Lagoa sem aula por falta de água', 'lagoa_azul', 'media', 150, 420, 'Diretoria da escola', [-0.004, -0.003]),
    oc('oc-16', 'educacao', 'transporte escolar', 'Transporte escolar com 40 min de atraso', 'alto_da_serra', 'media', 40, 75, 'GPS da frota escolar', [0.004, 0.003]),
    oc('oc-17', 'seguranca', 'roubo', 'Roubos em sequência na Praça Central', 'centro', 'alta', 90, 6, 'Guarda Municipal + 6 boletins', [0.001, 0.005]),
    oc('oc-18', 'seguranca', 'câmeras', 'Câmeras de monitoramento offline', 'parque_industrial', 'media', 210, 0, 'Central de videomonitoramento', [-0.004, -0.004]),
    oc('oc-19', 'mobilidade', 'semáforo', 'Semáforo apagado no cruzamento principal', 'centro', 'critica', 22, 5000, 'Central de tráfego (integração)', [-0.005, -0.001]),
    oc('oc-20', 'mobilidade', 'congestionamento', 'Congestionamento de 3 km na Av. Dourada', 'bela_vista', 'alta', 45, 4200, 'Central de tráfego (integração)', [-0.003, -0.004]),
    oc('oc-21', 'mobilidade', 'transporte público', 'Linha 102 com atraso de 25 min', 'jardim_das_flores', 'media', 25, 1300, 'GPS da frota de ônibus', [0.004, 0.003]),
    oc('oc-22', 'limpeza', 'coleta de lixo', 'Coleta de lixo atrasada há 3 dias', 'porto_dourado', 'alta', 4320, 2100, '37 chamados 156', [0.001, 0.001]),
    oc('oc-23', 'limpeza', 'entulho', 'Descarte irregular de entulho', 'vila_nova', 'media', 600, 150, 'App Cidadão', [0.005, 0.004]),
    oc('oc-24', 'limpeza', 'bueiro', 'Bueiro entupido agravando alagamento', 'lagoa_azul', 'media', 70, 300, 'Equipe de varrição', [0.005, -0.002]),
  ].map(posicionar);
  // Já com equipe em campo quando a demo abre.
  ['oc-05', 'oc-11', 'oc-14', 'oc-16', 'oc-21'].forEach((id) => { ocorrencias.find((o) => o.id === id).status = 'em_campo'; });
  // Ocorrências que envolvem mais de uma secretaria.
  ocorrencias.find((o) => o.id === 'oc-01').areasEnvolvidas = ['defesa_civil', 'mobilidade'];
  ocorrencias.find((o) => o.id === 'oc-06').areasEnvolvidas = ['infraestrutura', 'saude'];

  // ---- Ocorrências que "chegam" durante a apresentação ----
  const ocorrenciasExtras = [
    oc('oc-25', 'defesa_civil', 'queda de árvore', 'Árvore caída sobre a rede elétrica', 'jardim_das_flores', 'critica', 1, 700, 'Concessionária de energia + 12 chamados 156', [0.002, 0.002]),
    oc('oc-26', 'infraestrutura', 'queda de energia', 'Queda de energia no Bela Vista Shopping', 'bela_vista', 'alta', 1, 1500, 'Concessionária de energia (integração)', [-0.001, 0.001]),
    oc('oc-27', 'saude', 'surto', 'Aumento de casos suspeitos de dengue', 'lagoa_azul', 'alta', 1, 2400, 'Vigilância epidemiológica', [-0.001, 0.002]),
    oc('oc-28', 'mobilidade', 'acidente', 'Acidente bloqueia a Ponte do Porto', 'porto_dourado', 'critica', 1, 6000, 'Central de tráfego (integração)', [-0.004, -0.004]),
  ].map(posicionar);

  // ---- Coisas boas ----
  const conquistas = [
    { id: 'cq-01', titulo: 'UBS Bela Vista inaugurada', area: 'saude', bairroId: 'bela_vista', data: GC.relogio.data('2026-10-21'), descricao: 'Nova unidade com capacidade para 600 atendimentos/dia.', desloc: [-0.003, 0.004] },
    { id: 'cq-02', titulo: 'Praça das Flores revitalizada', area: 'infraestrutura', bairroId: 'jardim_das_flores', data: GC.relogio.data('2026-10-14'), descricao: 'Nova iluminação LED, academia ao ar livre e playground.', desloc: [0.003, 0.004] },
    { id: 'cq-03', titulo: 'Recapeamento da Av. Central concluído', area: 'mobilidade', bairroId: 'centro', data: GC.relogio.data('2026-10-09'), descricao: '4,2 km recapeados duas semanas antes do prazo.', desloc: [0.005, -0.001] },
    { id: 'cq-04', titulo: 'Escola Alto da Serra climatizada', area: 'educacao', bairroId: 'alto_da_serra', data: GC.relogio.data('2026-10-18'), descricao: '22 salas com ar-condicionado e energia solar.', desloc: [0.002, 0.004] },
    { id: 'cq-05', titulo: 'Base da Guarda no Porto', area: 'seguranca', bairroId: 'porto_dourado', data: GC.relogio.data('2026-10-02'), descricao: 'Nova base reduziu ocorrências na região em 18%.', desloc: [0.004, 0.004] },
    { id: 'cq-06', titulo: 'Ecoponto Parque Industrial', area: 'limpeza', bairroId: 'parque_industrial', data: GC.relogio.data('2026-10-25'), descricao: '12 toneladas de entulho recebidas na primeira semana.', desloc: [-0.002, 0.004] },
  ].map(posicionar);

  // ---- Histórico (ocorrências nos últimos 30 dias, por área e bairro) ----
  const historico30d = {
    defesa_civil: { centro: 4, lagoa_azul: 3, alto_da_serra: 2, porto_dourado: 1, vila_nova: 1, bela_vista: 0, jardim_das_flores: 0, parque_industrial: 0 },
    infraestrutura: { vila_nova: 6, parque_industrial: 3, centro: 2, bela_vista: 2, jardim_das_flores: 1, porto_dourado: 1, lagoa_azul: 0, alto_da_serra: 0 },
    saude: { centro: 5, vila_nova: 4, porto_dourado: 2, lagoa_azul: 1, bela_vista: 1, jardim_das_flores: 0, alto_da_serra: 0, parque_industrial: 0 },
    educacao: { lagoa_azul: 2, alto_da_serra: 2, vila_nova: 1, centro: 0, bela_vista: 0, jardim_das_flores: 0, porto_dourado: 0, parque_industrial: 0 },
    seguranca: { centro: 7, parque_industrial: 3, vila_nova: 3, porto_dourado: 2, bela_vista: 1, lagoa_azul: 1, jardim_das_flores: 0, alto_da_serra: 0 },
    mobilidade: { centro: 9, bela_vista: 6, jardim_das_flores: 3, porto_dourado: 2, vila_nova: 2, lagoa_azul: 0, alto_da_serra: 0, parque_industrial: 1 },
    limpeza: { porto_dourado: 5, vila_nova: 3, lagoa_azul: 2, centro: 1, bela_vista: 1, jardim_das_flores: 0, alto_da_serra: 0, parque_industrial: 0 },
  };

  // ---- Tendências (visão gerencial) ----
  const tendencias = [
    { area: 'seguranca', rotulo: 'Criminalidade (trimestre)', valor: '-9%', variacao: -9, positivo: true },
    { area: 'saude', rotulo: 'Cobertura vacinal', valor: '91%', variacao: 4, positivo: true },
    { area: 'saude', rotulo: 'Tempo de espera nas UBS', valor: '+9%', variacao: 9, positivo: false },
    { area: 'educacao', rotulo: 'Frequência escolar', valor: '95%', variacao: 2, positivo: true },
    { area: 'infraestrutura', rotulo: 'Quedas de energia (mês)', valor: '+18%', variacao: 18, positivo: false },
    { area: 'defesa_civil', rotulo: 'Alagamentos (mês)', valor: '+25%', variacao: 25, positivo: false },
    { area: 'mobilidade', rotulo: 'Tempo médio de deslocamento', valor: '-6%', variacao: -6, positivo: true },
    { area: 'limpeza', rotulo: 'Coleta no prazo', valor: '87%', variacao: -5, positivo: false },
  ];

  const indicadoresBase = {
    satisfacaoPct: 72,
    // De onde vem a satisfação (a primeira pergunta de quem lê o número).
    satisfacaoFonte: `Pesquisa trimestral por telefone e app · 1.840 respostas · ${GC.relogio.ultimoMes()}`,
  };

  // ---- Desempenho das secretarias (últimos 30 dias e mês anterior) ----
  // Resolvidas nunca passam dos casos da secretaria em historico30d.
  const desempenho30d = {
    infraestrutura: { resolvidas: 13, noPrazoPct: 62, tempoMedioH: 9.1, anterior: { resolvidas: 11, noPrazoPct: 71, tempoMedioH: 8.2 } },
    defesa_civil: { resolvidas: 10, noPrazoPct: 86, tempoMedioH: 3.4, anterior: { resolvidas: 8, noPrazoPct: 88, tempoMedioH: 3.9 } },
    saude: { resolvidas: 12, noPrazoPct: 88, tempoMedioH: 4.0, anterior: { resolvidas: 12, noPrazoPct: 84, tempoMedioH: 4.6 } },
    educacao: { resolvidas: 5, noPrazoPct: 100, tempoMedioH: 6.0, anterior: { resolvidas: 4, noPrazoPct: 100, tempoMedioH: 7.5 } },
    seguranca: { resolvidas: 15, noPrazoPct: 87, tempoMedioH: 1.6, anterior: { resolvidas: 14, noPrazoPct: 90, tempoMedioH: 1.5 } },
    mobilidade: { resolvidas: 21, noPrazoPct: 90, tempoMedioH: 2.8, anterior: { resolvidas: 18, noPrazoPct: 89, tempoMedioH: 3.1 } },
    limpeza: { resolvidas: 11, noPrazoPct: 91, tempoMedioH: 6.5, anterior: { resolvidas: 10, noPrazoPct: 93, tempoMedioH: 6.1 } },
  };

  // Resolvidas antes da demo começar (a lista "Resolvidas recentemente" começa com elas).
  const resolvidasRecentes = [
    { titulo: 'Vazamento na Rua 7 de Setembro', area: 'infraestrutura', bairroId: 'bela_vista', haMin: 20, atrasoMin: 0, desloc: [-0.004, -0.002] },
    { titulo: 'Semáforo apagado na Av. do Porto', area: 'mobilidade', bairroId: 'porto_dourado', haMin: 65, atrasoMin: 0, desloc: [0.003, -0.004] },
    { titulo: 'Lixo acumulado na feira', area: 'limpeza', bairroId: 'vila_nova', haMin: 130, atrasoMin: 180, desloc: [-0.004, 0.002] },
  ].map(posicionar);

  // ---- Séries usadas pela IA (gráficos que não saem do histórico) ----
  const series = {
    lotacaoUbs: [
      { nome: 'UBS Central', bairroId: 'centro', pct: 94 },
      { nome: 'UBS Vila Nova', bairroId: 'vila_nova', pct: 88 },
      { nome: 'UBS Porto', bairroId: 'porto_dourado', pct: 71 },
      { nome: 'UBS Lagoa', bairroId: 'lagoa_azul', pct: 66 },
      { nome: 'UBS Serra', bairroId: 'alto_da_serra', pct: 58 },
      { nome: 'UBS Bela Vista', bairroId: 'bela_vista', pct: 42 },
    ],
    criminalidadeMensal: { rotulos: GC.relogio.meses(6), valores: [412, 398, 381, 370, 352, 363] },
    frequenciaEscolar: { centro: 96, bela_vista: 97, jardim_das_flores: 96, alto_da_serra: 93, lagoa_azul: 91, vila_nova: 94, porto_dourado: 95, parque_industrial: 98 },
    picoTransito: '17h–19h',
  };

  const satisfacaoPorBairro = {
    alto_da_serra: 74, bela_vista: 81, jardim_das_flores: 77, parque_industrial: 69,
    lagoa_azul: 66, centro: 63, vila_nova: 58, porto_dourado: 71,
  };

  // Base de cada secretaria: qual indicador próprio ela publica e há quanto tempo sincronizou.
  const basesSecretarias = {
    infraestrutura: { metrica: 'Ocorrências de energia/obras em 30 dias', atualizadoHaMin: 2 },
    defesa_civil: { metrica: 'Alagamentos e riscos em 30 dias', atualizadoHaMin: 1 },
    saude: { metrica: 'Lotação da UBS', unidade: '%', atualizadoHaMin: 3 },
    educacao: { metrica: 'Frequência escolar', unidade: '%', atualizadoHaMin: 12 },
    seguranca: { metrica: 'Ocorrências de segurança em 30 dias', atualizadoHaMin: 4 },
    mobilidade: { metrica: 'Ocorrências de trânsito em 30 dias', atualizadoHaMin: 1 },
    limpeza: { metrica: 'Atrasos de coleta em 30 dias', atualizadoHaMin: 6 },
  };

  GC.data = { areas, bairros, ocorrencias, ocorrenciasExtras, conquistas, historico30d, tendencias, indicadoresBase, desempenho30d, resolvidasRecentes, series, satisfacaoPorBairro, basesSecretarias };
})(window.GC = window.GC || {});
