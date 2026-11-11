(function (GC) {
  // As 3 cidades fictícias da demonstração (Fase 5 da spec
  // docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md): pequena, média e grande.
  // As três têm a cara de uma cidade de verdade, só que de outro tamanho: contorno irregular, bairros menores no
  // miolo e maiores na periferia. A pequena tem 7 bairros (4 da Vila Dourada + 3 novos). A média é a Vila Dourada
  // escrita à mão (data*.js): os 8 bairros dela ficam iguais, com tudo o que acontece neles, e a cidade ganha 17
  // bairros em volta (25 no total, 250 mil hab.). A grande, do porte de Fortaleza, tem 123 bairros gerados, com
  // litoral ao norte e o Centro perto da praia.
  // Cada bairro novo copia o perfil de um bairro da Vila Dourada ("molde": o mais próximo dele no mapa, então
  // a cidade tem regiões, como os morros a sudoeste) e recebe parte do que acontece no molde: ocorrências,
  // escola, área de risco, e só alguns ganham hospital, obra ou base do SAMU. Contagens escalam com a população.
  // Roda depois de data.js, data-alertas, data-leitos, data-seguranca, data-risco e data-obras, e antes de
  // data-secretarias (que calcula indicadores com o resultado). GC.cidade.ajustarSecretarias() roda depois dela.
  // Escolha: ?cidade=pequena|media|grande na URL, senão a última escolhida (navegador), senão a média.

  const PERFIS = {
    pequena: {
      id: 'pequena', nome: 'Arraial do Sol', porte: 'Cidade pequena', populacao: 22000,
      escala: 0.8, // tamanho do quarteirão-base em relação ao bairro da Vila Dourada
      // Núcleo pequeno ao longo da estrada; '.' fica fora da cidade.
      mapa: [
        ['.', 'alto_da_serra', 'sao_benedito'],
        ['lagoa_azul', 'centro', 'vila_nova'],
        ['beira_rio', 'sitio_novo', '.'],
      ],
      novos: { sao_benedito: ['São Benedito', 'vila_nova'], beira_rio: ['Beira Rio', 'lagoa_azul'], sitio_novo: ['Sítio Novo', 'alto_da_serra'] },
      // Bairros que somem: o que "chega" durante a demo vai para o vizinho.
      destino: { bela_vista: 'centro', jardim_das_flores: 'vila_nova', parque_industrial: 'alto_da_serra', porto_dourado: 'lagoa_azul' },
      // Bairro novo recebe 1 a cada N do que acontece no molde (0 = nada). Cidade pequena: nada de hospital ou obra nova.
      copias: { ocorrencias: 2, leitos: 0, risco: 1, obras: 0, samu: 0 }, coletaPor: 3,
      // Leitos por habitante perto da referência de planejamento (2,5 a 3 por mil): antes eram 5,4 por mil.
      fatorLeitos: 0.2, fatorObras: 0.25, fatorFamilias: 0.35, fatorAfetados: 0.3, fatorEscolas: 0.35,
    },
    media: {
      id: 'media', nome: 'Vila Dourada', porte: 'Cidade média', populacao: 250000,
      // Os 8 bairros escritos à mão (data*.js) continuam iguais, com tudo o que acontece neles: são o miolo
      // (núcleo 4x2, na mesma disposição de data.js). Em volta, a cidade cresceu: bairros novos, mais calmos.
      preservar: true,
      escala: 1,
      gerar: { linhas: 8, colunas: 10, semente: 5, nomes: 'media' },
      nucleo: { r: 3, c: 3, grade: [['alto_da_serra', 'bela_vista', 'jardim_das_flores', 'parque_industrial'], ['lagoa_azul', 'centro', 'vila_nova', 'porto_dourado']] },
      // Bairro novo: nenhuma cópia de ocorrência do molde (as ocorrências dele são escritas à mão em
      // ocorrenciasProprias); escola em 1 a cada 2.
      // Escola em todo bairro novo. Leitos: dois hospitais escritos à mão na periferia (abaixo).
      copias: { ocorrencias: 0, leitos: 0, risco: 4, obras: 0, samu: 0, escolas: 1 }, coletaPor: 3, toneladasRota: 300,
      // Os bairros em volta têm ocorrências próprias (abaixo), em vez de cópias do molde.
      ocorrenciasProprias: null,
    },
    grande: {
      id: 'grande', nome: 'Nova Aurora', porte: 'Cidade grande', populacao: 2500000,
      escala: 0.8,
      gerar: { linhas: 19, colunas: 21, litoral: true, centroY: -0.2 },
      // Onde ficam os bairros da Vila Dourada (x e y de -1 a 1; y cresce para o sul). Bairro novo copia o mais próximo.
      ancoras: {
        centro: [-0.05, -0.5], bela_vista: [-0.45, -0.45], porto_dourado: [0.45, -0.5], vila_nova: [0.2, -0.05],
        jardim_das_flores: [-0.3, 0.05], lagoa_azul: [0.55, 0.3], alto_da_serra: [-0.6, 0.5], parque_industrial: [0.1, 0.7],
      },
      copias: { ocorrencias: 3, leitos: 6, risco: 3, obras: 3, samu: 8 }, coletaPor: 2,
      // Polo regional: mais leitos por habitante que as menores (antes 0,9 por mil). Escolas maiores (3 turnos).
      fatorLeitos: 4.2, fatorObras: 2.5, fatorFamilias: 1.5, fatorAfetados: 3, fatorEscolas: 2.2,
    },
  };
  // Ocorrências dos bairros que cresceram em volta da Vila Dourada (cidade média).
  // [id, bairro, área, tipo, título, gravidade, aberta há (min), afetados, fonte, deslocamento do centro, extra]
  // extra: emCampo (equipe já no local), areas (mais de uma secretaria), detalhe [evidências, impacto, ação].
  PERFIS.media.ocorrenciasProprias = [
    ['oc-41', 'sao_jose', 'mobilidade', 'acidente', 'Colisão entre ônibus e caminhão na Av. São José', 'critica', 150, 2800, 'Central de tráfego (integração) + 7 chamados 156', [0.002, -0.003],
      { areas: ['mobilidade', 'saude'], detalhe: [['Câmera mostra as duas faixas bloqueadas', 'SAMU acionado para 3 feridos leves'], '~2.800 motoristas · 5 linhas de ônibus desviadas', 'Desviar o trânsito pela Rua Santa Luzia e manter o SAMU no local até a remoção'] }],
    ['oc-42', 'sao_jose', 'limpeza', 'coleta de lixo', 'Coleta atrasada na Rua das Acácias', 'media', 900, 650, '14 chamados 156', [-0.004, 0.004]],
    ['oc-43', 'santa_luzia', 'saude', 'lotação', 'UBS Santa Luzia com 89% de lotação', 'alta', 95, 140, 'Sistema de regulação da Saúde', [0.003, 0.002],
      { detalhe: [['Ocupação acima de 85% há 1h30', 'Espera média de 1h40 na triagem'], '~140 pacientes aguardando', 'Abrir o terceiro consultório e chamar o médico de sobreaviso'] }],
    ['oc-44', 'jardim_primavera', 'defesa_civil', 'alagamento', 'Alagamento no córrego da Primavera', 'alta', 50, 520, 'Sensor de nível do córrego', [-0.003, 0.003],
      { areas: ['defesa_civil', 'infraestrutura'], detalhe: [['Córrego 60 cm acima do normal', 'Previsão de mais 15 mm até a noite'], '~520 moradores na margem · 1 creche', 'Limpar a grade do córrego e avisar as famílias da margem'] }],
    ['oc-45', 'cidade_nova', 'seguranca', 'roubo', 'Furtos de fios na iluminação da Cidade Nova', 'media', 400, 380, 'Guarda Municipal + 3 boletins', [0.002, 0.003], { emCampo: true }],
    ['oc-46', 'boa_esperanca', 'educacao', 'transporte escolar', 'Ônibus escolar quebrado na estrada da Boa Esperança', 'alta', 35, 48, 'GPS da frota escolar', [0.003, -0.004],
      { areas: ['educacao', 'mobilidade'], detalhe: [['Ônibus parado há 35 min', 'Motorista acionou a manutenção pelo rádio'], '~48 alunos a caminho da escola', 'Enviar o ônibus reserva da garagem central'] }],
    ['oc-47', 'boa_esperanca', 'infraestrutura', 'buraco', 'Cratera na Rua Boa Esperança após a chuva', 'media', 1300, 420, 'App Cidadão (12 fotos)', [-0.004, 0.003]],
    ['oc-48', 'vila_operaria', 'infraestrutura', 'queda de energia', 'Queda de energia em 6 quarteirões da Vila Operária', 'critica', 75, 1100, 'Concessionária de energia (integração)', [-0.003, -0.003], { areas: ['infraestrutura', 'saude'] }],
    ['oc-49', 'recanto_verde', 'defesa_civil', 'queda de árvore', 'Árvore caída na estrada do Recanto Verde', 'media', 45, 90, '3 chamados 156', [0.003, 0.002]],
    ['oc-50', 'morada_do_sol', 'limpeza', 'entulho', 'Descarte de entulho em terreno baldio', 'media', 2100, 200, 'App Cidadão', [0.004, 0.004]],
    ['oc-51', 'morada_do_sol', 'mobilidade', 'transporte público', 'Linha 214 com atraso de 30 min', 'media', 30, 900, 'GPS da frota de ônibus', [-0.004, -0.004], { emCampo: true }],
    ['oc-52', 'nova_esperanca', 'infraestrutura', 'vazamento de água', 'Vazamento em rede de água na Nova Esperança', 'alta', 1600, 780, 'Companhia de saneamento + 9 chamados 156', [0.004, -0.003],
      { detalhe: [['Vazamento aberto há mais de 1 dia', 'Pressão da rede em 60% no bairro'], '~780 moradores com pouca água', 'Cobrar da companhia o reparo hoje e mandar caminhão-pipa'] }],
    ['oc-53', 'parque_das_aguas', 'limpeza', 'bueiro', 'Bueiros entupidos no Parque das Águas', 'media', 180, 260, 'Equipe de varrição', [-0.003, 0.002]],
    ['oc-54', 'jardim_america', 'saude', 'surto', 'Foco de dengue em terrenos do Jardim América', 'alta', 240, 1500, 'Vigilância epidemiológica', [0.003, 0.004],
      { areas: ['saude', 'limpeza'], detalhe: [['19 casos suspeitos em 2 semanas', '6 focos encontrados na vistoria'], '~1.500 moradores no raio de 300 m', 'Mutirão de limpeza dos terrenos e fumacê à noite'] }],
    ['oc-55', 'planalto', 'educacao', 'falta de água', 'Escola do Planalto sem água desde cedo', 'media', 210, 310, 'Diretoria da escola', [0.004, -0.002], { emCampo: true }],
    ['oc-56', 'cidade_alta', 'seguranca', 'câmeras', 'Câmeras da Praça da Cidade Alta offline', 'media', 320, 0, 'Central de videomonitoramento', [-0.003, 0.004]],
    ['oc-57', 'santo_antonio', 'infraestrutura', 'iluminação pública', 'Rua Santo Antônio às escuras', 'media', 600, 380, 'App Cidadão', [0.003, -0.004]],
    ['oc-58', 'bom_jesus', 'defesa_civil', 'deslizamento', 'Barranco cedendo na encosta do Bom Jesus', 'critica', 165, 70, 'Vistoria da Defesa Civil', [-0.004, 0.003],
      { detalhe: [['Trinca de 8 m no barranco', '42 mm de chuva nas últimas 24 h'], '~70 moradores em 18 casas', 'Interditar as 4 casas mais próximas e cobrir o barranco com lona'] }],
    ['oc-59', 'novo_horizonte', 'mobilidade', 'semáforo', 'Semáforo piscando na entrada do Novo Horizonte', 'media', 40, 1200, 'Central de tráfego (integração)', [0.004, -0.004]],
    ['oc-60', 'conjunto_palmeiras', 'limpeza', 'coleta de lixo', 'Coleta não passou no Conjunto Palmeiras', 'alta', 1700, 900, '11 chamados 156', [-0.004, 0.003]],
  ];
  GC.CIDADES = [PERFIS.pequena, PERFIS.media, PERFIS.grande];

  // Nomes dos bairros gerados da cidade grande (na ordem: do Centro para a periferia).
  const NOMES = [
    'Praia do Farol', 'Cais Velho', 'São Pedro', 'Santa Cruz', 'Jardim Aurora', 'Monte Castelo', 'São Francisco', 'Bom Jesus',
    'Largo da Matriz', 'Vila Velha', 'Coqueiral', 'Parque Universitário', 'Santo Antônio', 'Nossa Senhora de Fátima',
    'Cidade Nova', 'Novo Horizonte', 'Jardim Primavera', 'Vila Esperança', 'Parque São João', 'Alto Alegre', 'Água Fria',
    'Areia Branca', 'Dunas', 'Barra do Sol', 'Maré Alta', 'Praia Mansa', 'Farol Novo', 'Mirante do Mar', 'Bonsucesso',
    'Jardim Guanabara', 'Vila União', 'Serrinha', 'Jóquei Clube', 'Bela Aurora', 'Cajazeiras', 'Lagoa Redonda', 'Boa Vista',
    'Alto da Balança', 'Jardim das Oliveiras', 'Cidade 2000', 'Salinas', 'Vila Peri', 'Bom Jardim', 'Parque Santa Rosa',
    'Parque Dois Irmãos', 'Conjunto Esperança', 'Floresta', 'Cristo Redentor', 'São Gerardo', 'Monte Sião', 'Santa Luzia',
    'Recanto Verde', 'Morada do Sol', 'Nova Esperança', 'Vila Operária', 'Parque das Águas', 'Jardim América', 'Planalto',
    'Cidade Alta', 'São José', 'Boa Esperança', 'Jardim Paulista', 'Vila Rica', 'Parque Imperial', 'Jardim Tropical',
    'Vila Militar', 'Santa Teresa', 'São Cristóvão', 'Alto do Cruzeiro', 'Jardim Bandeirantes', 'Parque dos Coqueiros',
    'Vila Progresso', 'Conjunto Palmeiras', 'Lagoa Seca', 'Riacho Doce', 'Pedra Branca', 'Sítio Alegre', 'Chácara das Flores',
    'Jardim Brasília', 'Vila Nazaré', 'São Vicente', 'Santa Rita', 'Parque Ipê', 'Jardim Europa', 'Vila Mariana', 'Mangueiral',
    'Cajueiro', 'Carnaúbas', 'Juazeiro', 'Alto do Bonfim', 'Bonfim', 'Liberdade', 'Esperança', 'Vila Galvão', 'Três Lagoas',
    'Parque Ecológico', 'Jardim Vitória', 'Vitória', 'Paraíso', 'Jardim Paraíso', 'Vila Verde', 'Campo Belo', 'Campo Grande',
    'Vale do Sol', 'Vale Verde', 'Vila Formosa', 'Primavera', 'Jardim Ipanema', 'Pôr do Sol', 'Aeroporto', 'Rodoviária',
    'Distrito Industrial', 'Polo Têxtil', 'Ponte Nova', 'Ponte Alta', 'Cachoeirinha', 'Brejo Grande', 'Tabuleiro',
    'Mata Fresca', 'Canaã', 'Nova Canaã', 'Sol Nascente', 'Engenho Velho', 'Serra Azul', 'Alto Bonito', 'Morro Verde',
    'Lagoinha', 'Lagoa Funda', 'Santa Fé', 'São Miguel', 'Novo Oriente', 'Jardim Iguaçu', 'Vila Rosa', 'Rosário',
  ];
  // Bairros que cresceram em volta da Vila Dourada (do miolo para fora).
  const NOMES_MEDIA = [
    'São José', 'Santa Luzia', 'Jardim Primavera', 'Cidade Nova', 'Boa Esperança', 'Vila Operária', 'Recanto Verde',
    'Morada do Sol', 'Nova Esperança', 'Parque das Águas', 'Jardim América', 'Planalto', 'Cidade Alta', 'Santo Antônio',
    'Bom Jesus', 'Novo Horizonte', 'Conjunto Palmeiras', 'Sítio Alegre', 'Alto Alegre', 'Vila Esperança', 'Cajueiro',
    'Lagoa Seca', 'Riacho Doce', 'Pedra Branca', 'Vale do Sol', 'Distrito Industrial', 'Santa Rita', 'São Miguel',
    'Chácara das Flores', 'Serra Azul', 'Vila Rica', 'Campo Belo', 'Pôr do Sol', 'Bonfim',
  ];

  function escolher() {
    if (GC.cidadeForcada) return GC.cidadeForcada;
    try {
      const url = new URLSearchParams(window.location.search).get('cidade');
      if (url && PERFIS[url]) return url;
      const salva = window.localStorage.getItem('vd-cidade');
      if (salva && PERFIS[salva]) return salva;
    } catch (e) { /* sem location/localStorage (testes, modo privado): média */ }
    return 'media';
  }
  GC.escolherCidade = function (id) {
    try { window.localStorage.setItem('vd-cidade', id); } catch (e) { /* segue pela URL */ }
    const u = new URL(window.location.href);
    u.searchParams.set('cidade', id);
    window.location.href = u.toString();
  };

  const perfil = PERFIS[escolher()];
  GC.cidade = { id: perfil.id, nome: perfil.nome, porte: perfil.porte, populacao: perfil.populacao, ajustarSecretarias() {} };
  // Preservar (média): o que já existe nos bairros escritos à mão não muda de tamanho; só os bairros novos são criados.
  const preservar = !!perfil.preservar;
  const fator = (nome) => (preservar ? 1 : perfil[nome]);

  const D = GC.data;
  const original = Object.fromEntries(D.bairros.map((b) => [b.id, b]));
  const r1 = (n) => Math.round(n);
  // Número estável a partir de inteiros (sem aleatoriedade: o mesmo desenho a cada carga).
  const hash = (...ns) => { let h = 2166136261; ns.forEach((n) => { h = Math.imul(h ^ (n + 0x9e37), 16777619); h ^= h >>> 13; }); return (h >>> 0) / 4294967296; };

  // ---- geografia ----
  // Grade de quarteirões-base; cada bairro é um retângulo de 1x1, 1x2, 2x1 ou 2x2 quarteirões. Vértices
  // compartilhados (sem buraco nem sobreposição), contorno da cidade arredondado aqui e arestas curvas em
  // GC.bordasOrganicas (data.js).
  const LAT0 = -22.86;
  const LNG0 = -47.12;
  const PL = 0.025 * perfil.escala; // passo em latitude
  const PG = 0.02 * perfil.escala; // passo em longitude
  let celulas; // [linha][coluna] → dentro da cidade?
  let blocos; // { id, r, c, h, w }
  let moldeDe = {}; // id do bairro → bairro da Vila Dourada que serve de molde
  let nomeDe = {};

  if (perfil.mapa) {
    celulas = perfil.mapa.map((linha) => linha.map((id) => id !== '.'));
    blocos = [];
    perfil.mapa.forEach((linha, r) => linha.forEach((id, c) => { if (id !== '.') blocos.push({ id, r, c, h: 1, w: 1 }); }));
    blocos.forEach((b) => {
      moldeDe[b.id] = original[b.id] ? b.id : perfil.novos[b.id][1];
      nomeDe[b.id] = original[b.id] ? original[b.id].nome : perfil.novos[b.id][0];
    });
  } else {
    const { linhas, colunas, litoral = false, centroY = 0, semente = 0, nomes = 'grande' } = perfil.gerar;
    const listaNomes = nomes === 'media' ? NOMES_MEDIA : NOMES;
    const xy = (r, c) => [((c + 0.5) / colunas) * 2 - 1, ((r + 0.5) / linhas) * 2 - 1];
    // Silhueta: um "círculo" deformado por ondas; na cidade grande, cortado ao norte por um litoral recortado.
    const fase = semente * 1.7;
    celulas = Array.from({ length: linhas }, (_, r) => Array.from({ length: colunas }, (_, c) => {
      const [x, y] = xy(r, c);
      const ang = Math.atan2(y, x);
      const raio = 0.84 + 0.14 * Math.sin(2 * ang + 1.3 + fase) + 0.1 * Math.sin(3 * ang + 0.4 + fase) + 0.06 * Math.sin(5 * ang + 2.1);
      const mar = litoral && y < -0.6 + 0.16 * Math.sin(2.3 * x + 0.9) + 0.06 * Math.sin(7 * x);
      return Math.hypot(x, y) < raio && !mar;
    }));
    // Núcleo fixo (média): os bairros escritos à mão, um quarteirão cada, na disposição de data.js.
    const nucleo = [];
    if (perfil.nucleo) {
      perfil.nucleo.grade.forEach((linha, i) => linha.forEach((id, j) => {
        const [r, c] = [perfil.nucleo.r + i, perfil.nucleo.c + j];
        celulas[r][c] = true;
        nucleo.push({ id, r, c, h: 1, w: 1 });
      }));
    }
    const dentro = (r, c) => r >= 0 && c >= 0 && r < linhas && c < colunas && celulas[r][c];
    // Limpeza: sem quarteirão ligado só pela quina (o contorno da cidade precisa ser um anel só).
    for (let mudou = true; mudou;) {
      mudou = false;
      for (let r = 0; r < linhas - 1; r++) for (let c = 0; c < colunas - 1; c++) {
        const [a, b, d, e] = [dentro(r, c), dentro(r, c + 1), dentro(r + 1, c), dentro(r + 1, c + 1)];
        if (a && e && !b && !d) { celulas[r][c + 1] = true; mudou = true; }
        if (b && d && !a && !e) { celulas[r][c] = true; mudou = true; }
      }
    }
    // Bairros: miolo com quarteirões soltos (bairros pequenos), periferia com bairros de 2 e de 4 quarteirões.
    const dono = celulas.map((l) => l.map(() => false));
    nucleo.forEach((b) => { dono[b.r][b.c] = true; });
    const livre = (r, c) => dentro(r, c) && !dono[r][c];
    const dist = (r, c) => { const [x, y] = xy(r, c); return Math.hypot(x, (y - centroY) * 1.1); };
    blocos = [...nucleo];
    for (let r = 0; r < linhas; r++) for (let c = 0; c < colunas; c++) {
      if (!livre(r, c)) continue;
      const d = dist(r, c);
      const s = hash(r, c, 1 + semente);
      const opcoes = d > 0.7 ? (s < 0.45 ? [[2, 2], [1, 2], [2, 1]] : s < 0.8 ? [[1, 2], [2, 1]] : [[2, 1], [1, 2]])
        : d > 0.4 ? (s < 0.45 ? [[1, 2]] : s < 0.75 ? [[2, 1]] : []) : [];
      let forma = [1, 1];
      for (const [h, w] of opcoes) {
        let cabe = true;
        for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (!livre(r + i, c + j)) cabe = false;
        if (cabe) { forma = [h, w]; break; }
      }
      for (let i = 0; i < forma[0]; i++) for (let j = 0; j < forma[1]; j++) dono[r + i][c + j] = true;
      blocos.push({ r, c, h: forma[0], w: forma[1] });
    }
    // Bairros da Vila Dourada nos seus lugares; os novos, do Centro para fora, com o molde mais próximo.
    const meio = (b) => xy(b.r + (b.h - 1) / 2, b.c + (b.w - 1) / 2);
    const ancoras = perfil.ancoras || Object.fromEntries(nucleo.map((b) => [b.id, meio(b)]));
    const perto = (b, [x, y]) => { const [bx, by] = meio(b); return Math.hypot(bx - x, by - y); };
    Object.entries(ancoras).forEach(([id, p]) => {
      if (blocos.some((x) => x.id === id)) return;
      const b = blocos.filter((x) => !x.id).sort((a, z) => perto(a, p) - perto(z, p))[0];
      b.id = id;
    });
    const ordem = blocos.filter((b) => !b.id).sort((a, z) => perto(a, ancoras.centro) - perto(z, ancoras.centro));
    if (ordem.length > listaNomes.length) throw new Error(`cidade.js: faltam nomes (${ordem.length} bairros novos)`);
    const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    ordem.forEach((b, i) => { b.id = slug(listaNomes[i]); nomeDe[b.id] = listaNomes[i]; });
    blocos.forEach((b) => {
      if (original[b.id]) { moldeDe[b.id] = b.id; nomeDe[b.id] = original[b.id].nome; return; }
      moldeDe[b.id] = Object.keys(ancoras).sort((a, z) => perto(b, ancoras[a]) - perto(b, ancoras[z]))[0];
    });
    blocos.sort((a, z) => a.r - z.r || a.c - z.c);
  }

  // Vértice (r, c) da grade, já com o contorno arredondado e um pouco de irregularidade.
  const dentroCel = (r, c) => r >= 0 && c >= 0 && r < celulas.length && c < celulas[0].length && celulas[r][c];
  const meioCel = (r, c) => [LAT0 - (r + 0.5) * PL, LNG0 + (c + 0.5) * PG];
  const vertices = new Map();
  function vert(r, c) {
    const k = `${r},${c}`;
    if (vertices.has(k)) return vertices.get(k);
    const em = [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]];
    const dentroDe = em.filter(([a, b]) => dentroCel(a, b));
    let lat = LAT0 - r * PL;
    let lng = LNG0 + c * PG;
    const rumo = ([a, b], f) => { const [y, x] = meioCel(a, b); lat += (y - lat) * f; lng += (x - lng) * f; };
    if (dentroDe.length === 4) { // miolo: ruas tortas
      lat += (hash(r, c, 2) - 0.5) * 0.22 * PL;
      lng += (hash(r, c, 3) - 0.5) * 0.22 * PG;
    } else if (dentroDe.length === 1) rumo(dentroDe[0], 0.32); // quina da cidade: arredonda
    else if (dentroDe.length === 3) rumo(em.find(([a, b]) => !dentroCel(a, b)), 0.2); // canto para dentro: suaviza
    else { // trecho reto do limite: ondula para fora e para dentro
      const m = [(meioCel(...dentroDe[0])[0] + meioCel(...dentroDe[1])[0]) / 2, (meioCel(...dentroDe[0])[1] + meioCel(...dentroDe[1])[1]) / 2];
      const f = (hash(r, c, 4) - 0.35) * 0.5;
      lat += (lat - m[0]) * f;
      lng += (lng - m[1]) * f;
    }
    const p = [+lat.toFixed(5), +lng.toFixed(5)];
    vertices.set(k, p);
    return p;
  }
  // Contorno do retângulo de quarteirões, passando por todos os vértices da grade (os vizinhos usam os mesmos).
  function contorno({ r, c, h, w }) {
    const pts = [];
    for (let j = 0; j < w; j++) pts.push(vert(r, c + j));
    for (let i = 0; i < h; i++) pts.push(vert(r + i, c + w));
    for (let j = w; j > 0; j--) pts.push(vert(r + h, c + j));
    for (let i = h; i > 0; i--) pts.push(vert(r + i, c));
    return pts;
  }

  const ids = blocos.map((b) => b.id);
  const ehNovo = (id) => !original[id];
  const molde = (id) => moldeDe[id];
  const novosIds = ids.filter(ehNovo);
  // População: a do molde, maior para bairro de mais quarteirões, ajustada para fechar a da cidade.
  // Preservar: os bairros escritos à mão mantêm a população e os novos dividem o que falta para fechar a da cidade.
  const popOriginal = D.bairros.reduce((s, b) => s + b.populacao, 0);
  const bruta = Object.fromEntries(blocos.map((b) => [b.id, original[molde(b.id)].populacao * (b.h * b.w) ** 0.7 * (0.85 + 0.3 * hash(b.r, b.c, 5))]));
  const calcula = (id) => !preservar || ehNovo(id);
  const fatorPop = (perfil.populacao - (preservar ? popOriginal : 0)) / ids.filter(calcula).reduce((s, id) => s + bruta[id], 0);
  const populacaoDe = (id) => (calcula(id) ? Math.max(100, Math.round((bruta[id] * fatorPop) / 100) * 100) : original[id].populacao);
  // Quanto cada contagem por bairro cresce/encolhe: população média por bairro, nova ÷ original.
  const fc = preservar ? 1 : (perfil.populacao / ids.length) / (popOriginal / D.bairros.length);
  GC.cidade.fatorContagem = fc;

  const novosBairros = blocos.map((b) => {
    const poligono = contorno(b);
    const cantos = [vert(b.r, b.c), vert(b.r, b.c + b.w), vert(b.r + b.h, b.c + b.w), vert(b.r + b.h, b.c)];
    const centro = [+(cantos.reduce((s, p) => s + p[0], 0) / 4).toFixed(5), +(cantos.reduce((s, p) => s + p[1], 0) / 4).toFixed(5)];
    return { id: b.id, nome: nomeDe[b.id], centro, poligono, populacao: populacaoDe(b.id) };
  });
  if (GC.bordasOrganicas) GC.bordasOrganicas(novosBairros, { silhueta: false });
  const centroNovo = Object.fromEntries(novosBairros.map((b) => [b.id, b.centro]));
  const bairroNovo = Object.fromEntries(novosBairros.map((b) => [b.id, b]));
  const nomeNovo = (id) => nomeDe[id];

  // Leva um ponto do bairro de origem (geografia antiga) para o bairro de destino (geografia nova),
  // mantendo o deslocamento em relação ao centro (na escala do quarteirão novo).
  const mover = (lat, lng, de, para) => {
    const [la, lo] = original[de].centro;
    const [na, no] = centroNovo[para];
    return [+(na + (lat - la) * perfil.escala).toFixed(5), +(no + (lng - lo) * perfil.escala).toFixed(5)];
  };
  function moverItem(item, para = item.bairroId) {
    const [lat, lng] = mover(item.lat, item.lng, item.bairroId, para);
    return Object.assign(item, { lat, lng, bairroId: para });
  }
  // Cópia de um item do molde (já na geografia nova) para o bairro novo, no mesmo lugar relativo ao centro.
  const transpor = (x, id) => ({ lat: +(x.lat - centroNovo[x.bairroId][0] + centroNovo[id][0]).toFixed(5), lng: +(x.lng - centroNovo[x.bairroId][1] + centroNovo[id][1]).toFixed(5) });
  const moverPoligono = (pol, de, para) => pol.map(([lat, lng]) => mover(lat, lng, de, para));
  const filtrarNoLugar = (lista, manter) => { const fica = lista.filter(manter); lista.length = 0; lista.push(...fica); };
  const existe = (id) => !!centroNovo[id];
  const destino = (id) => (existe(id) ? id : (perfil.destino || {})[id]);
  // Bairros novos que recebem cópias de um tipo: 1 a cada N (0 = nenhum), cada tipo começando num ponto diferente.
  const recebe = (tipo, desloc = 0) => { const n = perfil.copias[tipo]; return n ? novosIds.filter((_, i) => (i + desloc) % n === 0) : []; };

  // Mapas "bairro → valor": tira bairros que sumiram e cria os novos a partir do molde.
  function porBairro(mapa, valor = (v) => v) {
    Object.keys(mapa).forEach((id) => { if (!existe(id)) delete mapa[id]; });
    ids.forEach((id) => { if (ehNovo(id)) mapa[id] = mapa[molde(id)] === undefined ? undefined : valor(mapa[molde(id)], id); });
    return mapa;
  }
  const variar = (v, id) => v + ((id.length % 5) - 2); // novo bairro não é cópia exata do molde

  // ---- ocorrências ----
  const TITULO = {
    alagamento: 'Alagamento em', deslizamento: 'Risco de deslizamento em', 'queda de árvore': 'Árvore caída em',
    'queda de energia': 'Queda de energia em', 'iluminação pública': 'Iluminação pública apagada em',
    buraco: 'Buracos na via principal de', 'vazamento de água': 'Vazamento de água em', 'lotação': 'UBS lotada em',
    'falta de médico': 'UBS sem médico plantonista em', 'falta de água': 'Escola sem água em',
    'transporte escolar': 'Transporte escolar atrasado em', roubo: 'Roubos em sequência em', 'câmeras': 'Câmeras offline em',
    'semáforo': 'Semáforo apagado em', congestionamento: 'Congestionamento em', 'transporte público': 'Ônibus atrasados em',
    'coleta de lixo': 'Coleta de lixo atrasada em', entulho: 'Descarte irregular de entulho em', bueiro: 'Bueiro entupido em',
    surto: 'Casos suspeitos de dengue em', acidente: 'Acidente bloqueia via em',
  };
  const ajustarAfetados = (o) => { o.afetados = r1(o.afetados * fator('fatorAfetados')); return o; };
  filtrarNoLugar(D.ocorrencias, (o) => existe(o.bairroId));
  D.ocorrencias.forEach((o) => ajustarAfetados(moverItem(o)));
  D.ocorrenciasExtras.forEach((o) => ajustarAfetados(moverItem(o, destino(o.bairroId))));
  // Cada bairro novo recebe 1 a cada N ocorrências do molde (N = copias.ocorrencias).
  if (perfil.copias.ocorrencias) novosIds.forEach((id, n) => {
    D.ocorrencias.filter((o) => o.bairroId === molde(id) && !o.id.includes('·')).forEach((o, i) => {
      if ((i + n) % perfil.copias.ocorrencias) return;
      D.ocorrencias.push(Object.assign({}, o, transpor(o, id), {
        id: `${o.id}·${id}`, titulo: `${TITULO[o.tipo] || 'Ocorrência em'} ${nomeNovo(id)}`, areasEnvolvidas: [...o.areasEnvolvidas], bairroId: id,
      }));
    });
  });
  // Média: os bairros que cresceram em volta não são cópias do molde, têm ocorrências escritas à mão
  // (o painel mostra que a cidade toda está sendo acompanhada, não só o miolo).
  if (perfil.ocorrenciasProprias) {
    const detalhes = D.detalhes || (D.detalhes = {});
    perfil.ocorrenciasProprias.forEach(([id, bairroId, area, tipo, titulo, severidade, abertaHaMin, afetados, fonte, desloc, extra = {}]) => {
      if (!existe(bairroId)) return;
      const [lat, lng] = centroNovo[bairroId];
      D.ocorrencias.push({
        id, area, tipo, titulo, bairroId, severidade, abertaHaMin, afetados, fonte,
        status: extra.emCampo ? 'em_campo' : 'encaminhada', areasEnvolvidas: extra.areas || [area],
        lat: +(lat + desloc[0]).toFixed(5), lng: +(lng + desloc[1]).toFixed(5),
      });
      if (extra.detalhe) detalhes[id] = { evidencias: extra.detalhe[0], impacto: extra.detalhe[1], acaoRecomendada: extra.detalhe[2] };
    });
  }
  [D.conquistas, D.resolvidasRecentes].forEach((lista) => lista.forEach((x) => moverItem(x, destino(x.bairroId))));

  // ---- históricos e séries por bairro ----
  const somaDe = (h) => Object.values(h).reduce((s, n) => s + n, 0);
  const casosAntes = Object.fromEntries(Object.entries(D.historico30d).map(([a, h]) => [a, somaDe(h)]));
  Object.values(D.historico30d).forEach((h) => porBairro(h));
  // Casos registrados por habitante iguais nos três portes (a média, escrita à mão, é a referência: ~119 por
  // 100 mil em 30 dias). Antes a pequena tinha 425 e a grande 57 por 100 mil.
  if (!preservar) {
    const TAXA_CASOS = 119;
    const alvo = (TAXA_CASOS * perfil.populacao) / 100000;
    const agora = Object.values(D.historico30d).reduce((t, h) => t + Object.values(h).reduce((x, n) => x + n, 0), 0);
    const k = agora ? alvo / agora : 1;
    Object.values(D.historico30d).forEach((h) => Object.keys(h).forEach((id) => { h[id] = Math.round(h[id] * k); }));
  }
  // Resolvidas em 30 dias acompanham os casos da cidade (antes eram 87 em qualquer porte, de 22 mil a 2,5 milhões).
  GC.cidade.razaoCasos = {};
  Object.entries(D.historico30d).forEach(([a, h]) => {
    const casos = somaDe(h);
    const k = casosAntes[a] ? casos / casosAntes[a] : 1;
    GC.cidade.razaoCasos[a] = k;
    const d = D.desempenho30d[a];
    if (!d) return;
    d.resolvidas = Math.min(casos, Math.max(1, r1(d.resolvidas * k)));
    d.anterior.resolvidas = Math.max(1, r1(d.anterior.resolvidas * k));
  });
  porBairro(D.satisfacaoPorBairro, variar);
  porBairro(D.series.frequenciaEscolar, (v, id) => Math.min(99, variar(v, id)));
  filtrarNoLugar(D.series.lotacaoUbs, (u) => existe(u.bairroId));

  // ---- segurança: B.O.s escalam com a população por bairro ----
  const S = D.seguranca;
  const totalAntes = Object.values(S.porBairro30d).reduce((s, n) => s + n, 0);
  porBairro(S.porBairro30d);
  // Cada bairro na proporção da sua população (o molde dá o perfil: Centro tem mais B.O. por habitante).
  const popDe = Object.fromEntries(novosBairros.map((b) => [b.id, b.populacao]));
  const mediaPop = perfil.populacao / ids.length;
  // Preservar: bairro escrito à mão fica como está; o novo tem os B.O.s do molde na proporção da sua população.
  const proporcional = (mapa, id) => r1(mapa[id] * popDe[id] / original[molde(id)].populacao);
  Object.keys(S.porBairro30d).forEach((id) => {
    if (preservar) { if (ehNovo(id)) S.porBairro30d[id] = Math.max(1, proporcional(S.porBairro30d, id)); return; }
    S.porBairro30d[id] = Math.max(1, r1(S.porBairro30d[id] * fc * (popDe[id] / mediaPop) ** 0.5));
  });
  const total = Object.values(S.porBairro30d).reduce((s, n) => s + n, 0);
  const k = total / totalAntes;
  GC.cidade.kSeguranca = k; // data-secretarias escala com ele os meses da série que ela mesma escreve
  const serie = D.series.criminalidadeMensal.valores;
  serie.forEach((v, i) => { serie[i] = r1(v * k); });
  serie[serie.length - 1] = total;
  const tipos = Object.keys(S.porTipo30d);
  tipos.forEach((t) => { S.porTipo30d[t] = r1(S.porTipo30d[t] * k); });
  S.porTipo30d[tipos[0]] += total - tipos.reduce((s, t) => s + S.porTipo30d[t], 0);
  S.hoje.registrados = Math.max(1, r1(S.hoje.registrados * k));
  const V = S.violencia;
  porBairro(V.porBairro);
  Object.keys(V.porBairro).forEach((id) => { if (!preservar) V.porBairro[id] = r1(V.porBairro[id] * fc); else if (ehNovo(id)) V.porBairro[id] = proporcional(V.porBairro, id); });
  const vTotal = Object.values(V.porBairro).reduce((s, n) => s + n, 0);
  const ult = V.meses.length - 1;
  const kv = vTotal / (V.mulheres[ult] + V.criancas[ult]);
  V.mulheres.forEach((v, i) => { V.mulheres[i] = r1(v * kv); });
  V.criancas.forEach((v, i) => { V.criancas[i] = r1(v * kv); });
  V.criancas[ult] = vTotal - V.mulheres[ult];

  // ---- leitos: unidades dos bairros que ficam (+ cópias em alguns novos), leitos escalados ----
  const L = D.leitos.unidades;
  const escalaGrupo = (g) => {
    if (preservar) return Object.assign({}, g);
    const total2 = Math.max(2, r1(g.total * perfil.fatorLeitos));
    return Object.assign({}, g, { total: total2, ocupados: Math.min(total2, r1(total2 * (g.ocupados / g.total))) });
  };
  const escalaAtend = (a) => Object.fromEntries(Object.entries(a).map(([t, n]) => [t, preservar ? n : Math.max(1, r1(n * perfil.fatorLeitos))]));
  filtrarNoLugar(L, (u) => existe(u.bairroId));
  L.forEach((u) => { moverItem(u); u.grupos = u.grupos.map(escalaGrupo); u.atendimentosHoje = escalaAtend(u.atendimentosHoje); });
  // Média: a cidade cresceu em volta do miolo e ganhou dois hospitais clínicos (sem UTI, que fica no Municipal e no
  // Regional). Leva a rede a ~2,6 leitos por mil habitantes, perto da referência de planejamento (antes 1,5).
  // Ocupação na média da rede (79%), para não mudar o quadro da demonstração.
  if (perfil.id === 'media') {
    const novo = (id, nome, bairroId, desloc, grupos, atend) => {
      if (!existe(bairroId)) return;
      const [la, lo] = centroNovo[bairroId];
      L.push({ id, nome, tipo: 'hospital', bairroId, lat: +(la + desloc[0]).toFixed(5), lng: +(lo + desloc[1]).toFixed(5),
        grupos: grupos.map(([rotulo, total, ocupados]) => ({ rotulo, total, ocupados, uti: false })), atendimentosHoje: atend, ocorrenciaId: null });
    };
    novo('hzn', 'Hospital Zona Norte', 'novo_horizonte', [0.002, -0.002], [['Enfermaria', 100, 79], ['Pediatria', 20, 16]], { 'Clínica médica': 96, Pediatria: 34 });
    novo('hzs', 'Hospital Zona Sul', 'jardim_america', [-0.002, 0.002], [['Enfermaria', 110, 87], ['Obstetrícia', 24, 19]], { 'Clínica médica': 104, Obstetrícia: 22 });
  }
  recebe('leitos', 2).forEach((id) => {
    L.filter((u) => u.bairroId === molde(id) && !u.id.includes('·')).forEach((u) => {
      L.push(Object.assign({}, u, transpor(u, id), {
        id: `${u.id}·${id}`, nome: `${u.tipo === 'upa' ? 'UPA' : 'Hospital'} ${nomeNovo(id)}`, bairroId: id, ocorrenciaId: null,
        // Cópia um pouco mais folgada que o molde: nem toda unidade da cidade grande está no limite.
        grupos: u.grupos.map((g) => Object.assign({}, g, { ocupados: Math.max(0, g.ocupados - Math.ceil(g.total * 0.12)) })),
      }));
    });
  });

  // ---- áreas de risco ----
  const A = D.risco.areas;
  filtrarNoLugar(A, (a) => existe(a.bairroId));
  A.forEach((a) => { a.poligono = moverPoligono(a.poligono, a.bairroId, a.bairroId); if (!preservar) a.familias = Math.max(3, r1(a.familias * perfil.fatorFamilias)); });
  recebe('risco', 1).forEach((id) => {
    A.filter((a) => a.bairroId === molde(id) && !a.id.includes('·')).forEach((a) => {
      const dLat = centroNovo[id][0] - centroNovo[a.bairroId][0];
      const dLng = centroNovo[id][1] - centroNovo[a.bairroId][1];
      A.push(Object.assign({}, a, {
        id: `${a.id}·${id}`, nome: `${a.tipo === 'deslizamento' ? 'Encosta de' : 'Baixada de'} ${nomeNovo(id)}`, bairroId: id,
        poligono: a.poligono.map(([la, lo]) => [+(la + dLat).toFixed(5), +(lo + dLng).toFixed(5)]),
        limiarMm: a.limiarMm + 10, // terreno um pouco menos sensível que o do molde
      }));
    });
  });

  // ---- obras ----
  const O = D.obras.obras;
  const BASE_OBRA = {
    'galeria-xv': 'Galeria pluvial', 'recape-dourada': 'Recapeamento viário', 'subestacao-vn': 'Subestação de energia',
    'hm-uti': 'Hospital · nova ala de UTI', 'cmei-vn': 'CMEI · ampliação', 'contencao-serra': 'Contenção de encosta',
    'teatro-centro': 'Centro cultural', 'escola-lagoa': 'Escola · reforma', 'ginasio-porto': 'Ginásio',
    'ciclovia-industrial': 'Ciclovia', 'praca-flores': 'Praça', 'ubs-bela-vista': 'UBS',
  };
  const mi = (v) => (preservar ? v : Math.round(v * perfil.fatorObras * 10) / 10);
  filtrarNoLugar(O, (ob) => existe(ob.bairroId));
  O.forEach((ob) => { moverItem(ob); ob.contratoMi = mi(ob.contratoMi); ob.gastoMi = Math.min(ob.contratoMi, mi(ob.gastoMi)); });
  recebe('obras', 0).forEach((id) => {
    O.filter((ob) => ob.bairroId === molde(id) && !ob.id.includes('·')).forEach((ob) => {
      O.push(Object.assign({}, ob, transpor(ob, id), { id: `${ob.id}·${id}`, nome: `${BASE_OBRA[ob.id] || ob.nome} ${nomeNovo(id)}`, bairroId: id }));
    });
  });

  // ---- escolas e escolaridade: toda bairro novo ganha a sua escola de ensino fundamental ----
  if (D.educacao) {
    const E = D.educacao.escolas;
    const fe = perfil.fatorEscolas;
    const escalaEscola = (x) => {
      if (preservar) return x;
      const falta = x.necessarios - x.professores;
      const professores = Math.max(2, r1(x.professores * fe));
      return Object.assign(x, {
        alunos: r1(x.alunos * fe), capacidade: r1(x.capacidade * fe), professores,
        necessarios: professores + (falta ? Math.max(1, r1(falta * fe)) : 0), fila: r1(x.fila * fe),
      });
    };
    filtrarNoLugar(E, (x) => existe(x.bairroId));
    E.forEach((x) => escalaEscola(moverItem(x)));
    (perfil.copias.escolas ? recebe('escolas') : novosIds).forEach((id) => {
      const m = E.find((x) => x.bairroId === molde(id) && x.tipo === 'emef' && !x.id.includes('·'));
      if (!m) return;
      E.push(Object.assign({}, m, transpor(m, id), { id: `${m.id}·${id}`, nome: `Escola ${nomeNovo(id)}`, bairroId: id, motivos: undefined },
        // Preservar: a escola nova do bairro da periferia está em dia; os problemas da rede seguem os do roteiro.
        preservar ? {
          alunos: m.capacidade, necessarios: m.professores, fila: 0,
          frequenciaPct: Math.max(m.frequenciaPct, 94), evasaoPct: Math.min(m.evasaoPct, 3), alfabetizacao3anoPct: Math.max(m.alfabetizacao3anoPct, 72),
        } : {}));
    });
    const P = D.educacao.populacao;
    porBairro(P.alfabetizados15, (v, id) => Math.min(99.5, +(v + ((id.length % 5) - 2) * 0.4).toFixed(1)));
    porBairro(P.ensinoMedio25, (v, id) => Math.max(20, variar(v, id)));
  }

  // ---- frota: ônibus escalam com a população; bases do SAMU ficam nos bairros que existem (+ algumas novas na grande) ----
  if (D.frota) {
    const F = D.frota;
    const fp = preservar ? 1 : perfil.populacao / popOriginal;
    const CONTAS = ['operando', 'reserva', 'corretiva', 'preventiva', 'necessarios', 'preventivaVencida'];
    const escalar = (x, k2, min = 0) => CONTAS.forEach((c) => { x[c] = Math.max(c === 'operando' || c === 'necessarios' ? 1 : min, r1(x[c] * k2)); });
    F.garagens.forEach((g) => { moverItem(g, destino(g.bairroId)); escalar(g, fp); });
    // Concessionária com o nome da cidade (a cidade grande não herda a "Viação Dourada").
    if (perfil.id !== 'media') {
      const op = `Viação ${perfil.nome}`;
      F.garagens.forEach((g) => { g.nome = g.nome.replace('Viação Dourada', op); });
      F.contrato.operadora = op;
    }
    ['viagensProgramadasHoje', 'viagensRealizadasHoje', 'acimaIdade'].forEach((c) => { F.contrato[c] = Math.max(1, r1(F.contrato[c] * fp)); });
    if (perfil.id === 'pequena') {
      // Cidade pequena: uma base do SAMU só, com metade das ambulâncias.
      filtrarNoLugar(F.bases, (b) => b.id === 'samu-centro');
      F.bases.forEach((b) => { moverItem(b); escalar(b, 0.5); b.chamadosHoje = r1(b.chamadosHoje * 0.3); });
    } else {
      filtrarNoLugar(F.bases, (b) => existe(b.bairroId));
      F.bases.forEach((b) => { moverItem(b); if (!preservar) { escalar(b, 2); b.chamadosHoje *= 2; } });
      recebe('samu', 4).forEach((id) => {
        const m = F.bases.find((b) => b.bairroId === molde(id) && !b.id.includes('·')) || F.bases.find((b) => !b.id.includes('·'));
        F.bases.push(Object.assign({}, m, transpor(m, id), { id: `${m.id}·${id}`, nome: `Base SAMU ${nomeNovo(id)}`, bairroId: id }));
        // A base copiada pode ser de outro bairro: refaz a posição a partir do centro do bairro novo.
        if (m.bairroId !== molde(id)) Object.assign(F.bases[F.bases.length - 1], { lat: centroNovo[id][0], lng: centroNovo[id][1] });
      });
    }
    const locais = new Set([...F.garagens, ...F.bases].map((x) => x.id));
    filtrarNoLugar(F.agenda, (x) => locais.has(x.local));
    // Linhas: bairros que sumiram viram o vizinho; repetições seguidas saem; linha com um bairro só deixa de existir.
    F.linhas.forEach((l) => {
      l.bairros = l.bairros.map(destino).filter((b, i, a) => b && b !== a[i - 1]);
    });
    filtrarNoLugar(F.linhas, (l) => new Set(l.bairros).size >= 2);
    if (perfil.gerar) {
      // Cidade grande: linhas que cruzam a cidade de leste a oeste e de norte a sul, pelos bairros do caminho.
      const { linhas, colunas } = perfil.gerar;
      const blocoDe = Object.fromEntries(blocos.map((b) => [b.id, b]));
      const percurso = (eixo, v) => blocos.filter((b) => (eixo === 'r' ? b.r <= v && v < b.r + b.h : b.c <= v && v < b.c + b.w))
        .sort((a, z) => (eixo === 'r' ? a.c - z.c : a.r - z.r)).map((b) => b.id);
      const trechos = [];
      for (let r = 2; r < linhas - 1; r += 3) trechos.push(percurso('r', r));
      for (let c = 2; c < colunas - 1; c += 4) trechos.push(percurso('c', c));
      let n = 0;
      trechos.forEach((t) => {
        // Linha comprida demais vira duas, que se encontram no meio.
        const partes = t.length > 9 ? [t.slice(0, Math.ceil(t.length / 2) + 1), t.slice(Math.ceil(t.length / 2))] : [t];
        partes.filter((p) => p.length >= 3).forEach((p) => {
          const id = String(201 + n);
          F.linhas.push({
            id, nome: `Linha ${id} · ${nomeNovo(p[0])} – ${nomeNovo(p[p.length - 1])}`, bairros: p,
            intervaloMin: [10, 12, 15, 8, 20, 12][n % 6], esperaMin: [14, 19, 11, 9, 24, 16, 13][n % 7], viagensPct: [93, 89, 97, 91, 86, 95, 98][n % 7], ocorrenciaId: null,
          });
          n++;
        });
      });
      if (!blocoDe.centro) throw new Error('cidade.js: cidade grande sem Centro');
    }
  }

  // ---- coleta de lixo: rotas seguem os bairros; toneladas escalam com a população ----
  if (D.coleta) {
    const C = D.coleta.rotas;
    const fp = perfil.populacao / popOriginal;
    // Bairro herdado (de um bairro que sumiu) só entra se nenhuma rota do mesmo tipo já o atende:
    // senão o Centro da cidade pequena teria duas coletas de lixo comum com horários diferentes.
    const atendidos = (tipo) => new Set(C.filter((x) => x.tipo === tipo).flatMap((x) => x.bairros.filter(existe)));
    const jaAtendidos = { domiciliar: atendidos('domiciliar'), seletiva: atendidos('seletiva') };
    C.forEach((x) => {
      const antes = x.bairros.join();
      x.bairros = x.bairros.map((b) => (existe(b) ? b : (jaAtendidos[x.tipo].has(destino(b)) ? null : destino(b))))
        .filter((b, i, a) => b && !a.slice(0, i).includes(b));
      // Rota domiciliar que mudou de bairros ganha o nome dos que atende agora.
      if (x.tipo === 'domiciliar' && x.bairros.join() !== antes && x.bairros.length) {
        x.nome = `Rota ${x.bairros.map(nomeNovo).join(' e ')}`;
      }
      if (!preservar) x.toneladasMes = Math.max(5, r1(x.toneladasMes * (perfil.id === 'grande' ? 1.6 : fp)));
    });
    filtrarNoLugar(C, (x) => x.bairros.length >= 1);
    // Bairros novos: uma rota domiciliar a cada `coletaPor` bairros vizinhos (dias alternados).
    const porPosicao = [...novosIds].sort((a, z) => { const [p, q] = [blocos.find((b) => b.id === a), blocos.find((b) => b.id === z)]; return p.r - q.r || p.c - q.c; });
    const toneladas = perfil.toneladasRota || (perfil.id === 'grande' ? 900 : 60);
    for (let i = 0; i < porPosicao.length; i += perfil.coletaPor) {
      const grupo = porPosicao.slice(i, i + perfil.coletaPor);
      const n = i / perfil.coletaPor;
      C.push({
        id: `rota-nova-${n + 1}`, nome: `Rota ${grupo.map(nomeNovo).join(' e ')}`, tipo: 'domiciliar', caminhao: `Caminhão C-${20 + n}`,
        bairros: grupo, dias: n % 2 ? ['seg', 'qua', 'sex'] : ['ter', 'qui', 'sab'], horario: n % 3 === 2 ? '13h–19h' : '07h–13h',
        noPrazoPct: [92, 88, 95, 90, 94, 86][n % 6], atrasoMedioDias: n % 7 === 5 ? 1 : 0, toneladasMes: toneladas + (n % 8) * 70,
        hoje: n % 2 ? null : { status: n % 4 === 0 ? 'concluida' : 'em_andamento', progressoPct: n % 4 === 0 ? 100 : 30 + (n % 5) * 10 }, ocorrenciaId: null,
      });
    }
    if (perfil.id === 'grande') {
      // Coleta seletiva por regional: os bairros novos, de oeste a leste, em 4 regionais.
      const oesteLeste = [...novosIds].sort((a, z) => centroNovo[a][1] - centroNovo[z][1]);
      const tam = Math.ceil(oesteLeste.length / 4);
      ['I', 'II', 'III', 'IV'].forEach((rom, i) => C.push({
        id: `seletiva-regional-${i + 1}`, nome: `Coleta seletiva Regional ${rom}`, tipo: 'seletiva', caminhao: `Caminhão S-0${3 + i}`,
        bairros: oesteLeste.slice(i * tam, (i + 1) * tam), dias: [['qua'], ['sex'], ['ter'], ['qui']][i], horario: '08h–14h',
        noPrazoPct: [90, 87, 93, 85][i], atrasoMedioDias: i % 2, toneladasMes: [160, 140, 175, 150][i], hoje: null, ocorrenciaId: null,
      }));
    }
  }

  // ---- tudo dentro do seu bairro ----
  // A cópia mantém o deslocamento do molde; se a borda curva do bairro novo o deixou de fora, puxa para o centro.
  function dentroDoPoligono([y, x], pol) {
    let d = false;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [yi, xi] = pol[i];
      const [yj, xj] = pol[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
    }
    return d;
  }
  const acomodarPonto = (x) => {
    const b = bairroNovo[x.bairroId];
    if (!b || typeof x.lat !== 'number') return;
    const [cl, cg] = b.centro;
    for (let i = 0; i < 8 && !dentroDoPoligono([x.lat, x.lng], b.poligono); i++) {
      x.lat = +(cl + (x.lat - cl) * 0.7).toFixed(5);
      x.lng = +(cg + (x.lng - cg) * 0.7).toFixed(5);
    }
  };
  [D.ocorrencias, D.ocorrenciasExtras, D.conquistas, D.resolvidasRecentes, L, O, D.educacao ? D.educacao.escolas : [],
    D.frota ? D.frota.bases : [], D.frota ? D.frota.garagens : []].forEach((lista) => lista.forEach(acomodarPonto));
  A.forEach((a) => {
    const b = bairroNovo[a.bairroId];
    const [cl, cg] = b.centro;
    for (let i = 0; i < 8 && a.poligono.some((p) => !dentroDoPoligono(p, b.poligono)); i++) {
      a.poligono = a.poligono.map(([la, lo]) => [+(cl + (la - cl) * 0.8).toFixed(5), +(cg + (lo - cg) * 0.8).toFixed(5)]);
    }
  });

  // ---- por fim, a nova geografia (no mesmo array: quem guardou a referência enxerga a troca) ----
  D.bairros.length = 0;
  D.bairros.push(...novosBairros);
  GC.cidade.bairros = novosBairros.length;

  // Unidades escritas à mão nas secretarias: as de bairros que sumiram vão para o vizinho.
  GC.cidade.ajustarSecretarias = function () {
    if (!D.secretarias) return;
    Object.values(D.secretarias).forEach((s) => (s.unidades || []).forEach((u) => { if (!existe(u.bairroId)) u.bairroId = destino(u.bairroId); }));
    // Orçamento proporcional à população (antes era o mesmo valor em todos os portes).
    const kOrc = perfil.populacao / PERFIS.media.populacao;
    Object.values(D.secretarias).forEach((s) => { if (s.orcamento) s.orcamento.dotacaoMi = Math.round(s.orcamento.dotacaoMi * kOrc * 10) / 10; });
  };
})(window.GC = window.GC || {});
