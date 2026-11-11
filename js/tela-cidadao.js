(function (GC) {
  // Conteúdo do Portal do Cidadão (cidadao.html, js/portal-cidadao.js), a partir dos dados e sem DOM:
  // avisos da Prefeitura (comunicados dos gabinetes de crise, risco de chuva, ocorrências que pedem evitar
  // uma região), "meu bairro" (coleta, UBS, risco, escolas, obras, ônibus), o resumo "hoje no seu bairro",
  // perguntas frequentes respondidas com os dados de agora e os telefones úteis.
  // Nada interno: sem prazos de secretaria, regras, responsáveis, alertas ou números sensíveis (B.O., CadÚnico).
  const n = (v) => Number(v).toLocaleString('pt-BR');
  const bairroDe = (id) => GC.data.bairros.find((b) => b.id === id) || { nome: id };
  const DIA = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };
  const dias = (lista) => lista.map((d) => DIA[d] || d).join(', ');
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Ocorrências que o morador precisa saber para evitar a região (as outras são assunto interno).
  const TIPOS_AVISO = ['alagamento', 'deslizamento', 'queda de árvore', 'semáforo', 'congestionamento', 'queda de energia', 'vazamento de água'];
  const ORIENTA = {
    alagamento: 'Evite a região e não atravesse ruas alagadas.', deslizamento: 'Siga a orientação da Defesa Civil (199).',
    'queda de árvore': 'Evite a calçada e a rua próximas.', semáforo: 'Atenção redobrada no cruzamento.',
    congestionamento: 'Prefira outro caminho.', 'queda de energia': 'A concessionária já foi acionada.', 'vazamento de água': 'A companhia de saneamento já está no local.',
  };
  // Nome do grupo quando há mais de um ponto do mesmo tipo ("Alagamento em 3 pontos").
  const NOME_TIPO = {
    alagamento: 'Alagamento', deslizamento: 'Deslizamento', 'queda de árvore': 'Queda de árvore', semáforo: 'Semáforo apagado',
    congestionamento: 'Trânsito lento', 'queda de energia': 'Falta de energia', 'vazamento de água': 'Vazamento de água',
  };
  const STATUS_PUBLICO = { aberta: 'aguardando equipe', encaminhada: 'equipe a caminho', em_campo: 'equipe no local', priorizada: 'equipe a caminho' };
  // Gravidade para o morador, escrita (a cor não é o único sinal): urgente > atenção > informativo.
  GC.NIVEIS_AVISO = { urgente: 'Urgente', atencao: 'Atenção', informativo: 'Informativo' };
  const ORDEM_NIVEL = { urgente: 0, atencao: 1, informativo: 2 };

  GC.CONTATOS_CIDADAO = [
    { numero: '156', nome: 'Prefeitura', texto: 'Buraco, iluminação, poda, lixo e outros pedidos', icone: 'building-bank' },
    { numero: '199', nome: 'Defesa Civil', texto: 'Alagamento, deslizamento, risco na sua casa', icone: 'alert-triangle' },
    { numero: '192', nome: 'SAMU', texto: 'Emergência médica', icone: 'ambulance' },
    { numero: '193', nome: 'Bombeiros', texto: 'Incêndio, resgate, acidente', icone: 'flame' },
  ];
  GC.SERVICOS_CIDADAO = [
    { id: 'buraco', nome: 'Buraco na rua', icone: 'road' },
    { id: 'iluminacao', nome: 'Poste apagado', icone: 'bulb-off' },
    { id: 'poda', nome: 'Poda de árvore', icone: 'trees' },
    { id: 'lixo', nome: 'Lixo ou entulho', icone: 'trash' },
  ];

  const centro = (poligono) => {
    const s = poligono.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return { lat: s[0] / poligono.length, lng: s[1] / poligono.length };
  };
  const minutosDesde = (t, agora) => (t ? Math.max(0, Math.round((agora - t) / 60000)) : null);

  // "há 5 min", "há 2 h", "há 3 dias".
  GC.haQuanto = function (min) {
    if (min === null || min === undefined || Number.isNaN(min)) return '';
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
    const d = Math.round(min / (60 * 24));
    return `há ${d} dia${d > 1 ? 's' : ''}`;
  };

  // Avisos: comunicados primeiro (são a voz oficial); depois os do bairro do morador e, dentro disso, os mais graves.
  function montarAvisos(ctx, risco, bid) {
    const agora = ctx.agora || (GC.agora ? GC.agora() : Date.now());
    const comunicados = (ctx.comunicados || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0)).map((c, i) => ({
      id: `com-${c.t || i}`, tipo: 'comunicado', nivel: 'atencao', titulo: c.titulo, texto: c.texto,
      bairroId: c.bairroId || null, quando: minutosDesde(c.t, agora), pontos: [],
    }));
    const outros = [];
    if (risco && risco.preventivo) {
      const a = risco.preventivo;
      outros.push({ id: `risco-${a.id}`, tipo: 'risco', nivel: 'urgente', titulo: `Risco de ${a.tipo} em ${a.nome}`,
        texto: `A chuva prevista pode passar do limite em cerca de ${a.horasAte} h. Se você mora na área, fique atento aos avisos da Defesa Civil (199) e, se for preciso sair, vá ao abrigo indicado.`,
        bairroId: a.bairroId, quando: null, pontos: [Object.assign({ titulo: a.nome, bairroId: a.bairroId }, centro(a.poligono))], camada: ['risco', a.id] });
    }
    // Ocorrências que pedem evitar a região, agrupadas por tipo: três alagamentos viram um aviso com três pontos.
    const grupos = new Map();
    (ctx.ocorrencias || []).filter((o) => o.status !== 'resolvida' && TIPOS_AVISO.includes(o.tipo) && (o.severidade === 'critica' || o.severidade === 'alta'))
      .forEach((o) => { if (!grupos.has(o.tipo)) grupos.set(o.tipo, []); grupos.get(o.tipo).push(o); });
    grupos.forEach((lista, tipo) => {
      const pontos = lista.map((o) => ({ titulo: o.titulo, bairroId: o.bairroId, lat: o.lat, lng: o.lng, situacao: STATUS_PUBLICO[o.status] || 'em atendimento' }));
      const uma = lista.length === 1;
      outros.push({
        id: `evite-${tipo}`, tipo: 'evite', nivel: lista.some((o) => o.severidade === 'critica') ? 'urgente' : 'atencao',
        titulo: uma ? (lista[0].titulo.includes(bairroDe(lista[0].bairroId).nome) ? lista[0].titulo : `${lista[0].titulo} (${bairroDe(lista[0].bairroId).nome})`) : `${NOME_TIPO[tipo] || tipo} em ${lista.length} pontos`,
        texto: `${ORIENTA[tipo] || 'Evite a região.'}${uma ? ` Situação: ${pontos[0].situacao}.` : ''}`,
        bairroId: uma ? lista[0].bairroId : null, bairros: [...new Set(lista.map((o) => o.bairroId))],
        quando: Math.min(...lista.map((o) => o.abertaHaMin || 0)), pontos,
        locais: uma ? [] : pontos.map((p) => `${p.titulo} (${bairroDe(p.bairroId).nome}): ${p.situacao}`),
      });
    });
    // Sem bairro escolhido, nenhum aviso é "do seu bairro" (os agrupados têm bairroId null, e null === null).
    const doBairro = (a) => (bid && (a.bairroId === bid || (a.bairros || []).includes(bid)) ? 0 : 1);
    outros.sort((a, b) => doBairro(a) - doBairro(b) || ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel]);
    return comunicados.concat(outros).map((a) => Object.assign(a, { doMeuBairro: doBairro(a) === 0 }));
  }

  // Tudo o que o portal mostra. ctx: { ocorrencias, comunicados, bairro, busca, agora }.
  GC.conteudoCidadao = function (ctx = {}) {
    const ocorrencias = ctx.ocorrencias || [];
    const risco = GC.risco ? GC.risco.resumo(ocorrencias) : null;
    const escolhido = !!ctx.bairro && GC.data.bairros.some((b) => b.id === ctx.bairro);
    const bid = escolhido ? ctx.bairro : (GC.data.bairros.find((b) => b.id === 'centro') || GC.data.bairros[0]).id;
    // Sem bairro escolhido, nenhum aviso é "do seu bairro" (o Centro é só o exemplo de "Meu bairro").
    const avisos = montarAvisos(ctx, risco, escolhido ? bid : null);

    // ---- meu bairro ----
    const meu = { id: bid, nome: bairroDe(bid).nome, escolhido, itens: [] };
    const hoje = [];
    const cal = GC.coleta ? (GC.coleta.resumo().calendario || []).find((c) => c.id === bid) : null;
    if (cal) {
      const d = cal.domiciliar;
      const s = cal.seletiva;
      const linhas = [
        d.dias.length ? `Lixo comum: ${dias(d.dias)}, ${d.horario}` : 'Lixo comum: sem coleta cadastrada',
        s.dias.length ? `Recicláveis: ${dias(s.dias)}, ${s.horario}` : 'Recicláveis: leve ao ponto de entrega voluntária',
      ];
      if (cal.atrasada) linhas.push('A coleta está atrasada: o caminhão já foi substituído.');
      meu.itens.push({ icone: 'truck', titulo: 'Coleta de lixo', destaque: d.proxima ? `Próxima: ${d.proxima.texto}` : null, linhas, texto: linhas.join('. '), camada: ['coleta', null] });
      if (d.proxima) hoje.push({ icone: 'truck', texto: `Lixo comum: ${d.proxima.texto}${d.dias.length ? `, ${d.horario}` : ''}`, nivel: cal.atrasada ? 'atencao' : 'ok' });
    }
    const ubs = ((GC.data.secretarias || {}).saude || {}).unidades || [];
    const espera = (u) => (u.metricas.find((m) => m.rotulo === 'espera') || {}).valor;
    const minutos = (u) => parseInt(espera(u), 10);
    const ordenadas = ubs.slice().filter((u) => !Number.isNaN(minutos(u))).sort((a, b) => minutos(a) - minutos(b));
    const maisRapida = ordenadas[0];
    const ubsBairro = ubs.find((u) => u.bairroId === bid);
    if (ubsBairro) {
      const linhas = [`Espera média hoje: ${espera(ubsBairro) || 'sem dado'}`];
      const demorada = maisRapida && maisRapida !== ubsBairro && minutos(ubsBairro) - minutos(maisRapida) >= 30;
      if (demorada) linhas.push(`Mais rápida agora: ${maisRapida.nome} (${bairroDe(maisRapida.bairroId).nome}), ${espera(maisRapida)}`);
      meu.itens.push({ icone: 'stethoscope', titulo: ubsBairro.nome, linhas, texto: linhas.join('. '), camada: ['saude', null] });
      hoje.push({ icone: 'stethoscope', texto: `${ubsBairro.nome}: espera de ${espera(ubsBairro) || 'sem dado'}`, nivel: minutos(ubsBairro) >= 90 ? 'atencao' : 'ok' });
    } else if (maisRapida) {
      const linhas = ['O bairro não tem UBS própria.', `Menor espera hoje: ${maisRapida.nome} (${bairroDe(maisRapida.bairroId).nome}), ${espera(maisRapida)}`];
      meu.itens.push({ icone: 'stethoscope', titulo: 'Posto de saúde (UBS)', linhas, texto: linhas.join(' '), camada: ['saude', null] });
    }
    if (risco) {
      const doBairro = risco.areas.filter((a) => a.bairroId === bid);
      const NIVEL = { alto: 'alto', medio: 'médio', baixo: 'baixo' };
      meu.itens.push(doBairro.length
        ? { icone: 'alert-triangle', titulo: 'Áreas de risco', nivel: doBairro.some((a) => a.nivel === 'alto') ? 'atencao' : null,
          linhas: doBairro.map((a) => `${a.nome}: risco ${NIVEL[a.nivel] || a.nivel} de ${a.tipo}`).concat('Em caso de chuva forte, ligue 199.'),
          texto: `${doBairro.map((a) => `${a.nome}: risco ${NIVEL[a.nivel] || a.nivel} de ${a.tipo}`).join('; ')}. Em caso de chuva forte, ligue 199.`, camada: ['risco', doBairro[0].id] }
        : { icone: 'circle-check', titulo: 'Áreas de risco', linhas: ['Nenhuma área de risco mapeada no bairro.'], texto: 'Nenhuma área de risco mapeada no bairro.' });
      const alta = doBairro.find((a) => a.nivel === 'alto' || (risco.preventivo && risco.preventivo.id === a.id));
      hoje.push(alta
        ? { icone: 'cloud-rain', texto: `Chuva: atenção em ${alta.nome}`, nivel: 'urgente' }
        : { icone: 'cloud-rain', texto: 'Chuva: sem risco alto no bairro', nivel: 'ok' });
    }
    if (GC.educacao) {
      const TIPO_ESCOLA = { cmei: 'Creche e pré-escola', emef: 'Escola municipal (ensino fundamental)' };
      const escolas = GC.educacao.resumo().escolas.filter((e) => e.bairroId === bid);
      if (escolas.length) {
        const linhas = escolas.map((e) => `${e.nome} · ${TIPO_ESCOLA[e.tipo] || 'Escola'}${e.fila ? ` · fila de ${n(e.fila)} crianças` : ''}`);
        meu.itens.push({ icone: 'school', titulo: escolas.length > 1 ? 'Escolas' : 'Escola', linhas, texto: linhas.join('; '), camada: ['escolas', escolas[0].id] });
      }
    }
    if (GC.obras) {
      const mes = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      const ob = (GC.obras.resumo ? GC.obras.resumo() : GC.obras).obras.filter((o) => o.bairroId === bid && o.situacao !== 'concluida');
      if (ob.length) {
        const linhas = ob.map((o) => `${o.nome}: ${o.avancoPct}% feito, previsão ${mes(o.previsaoAtual)}`);
        meu.itens.push({ icone: 'crane', titulo: 'Obras', linhas, texto: linhas.join('; '), camada: ['obras', ob[0].id] });
      }
    }
    if (GC.frota) {
      const linhasOnibus = GC.frota.resumo().linhas.filter((l) => (l.bairros || []).includes(bid));
      if (linhasOnibus.length) {
        const linhas = linhasOnibus.map((l) => `${l.nome}: espera de ~${l.esperaMin} min no ponto`);
        meu.itens.push({ icone: 'bus', titulo: 'Ônibus', linhas, texto: linhas.join('; ') });
      }
    }
    const avisosBairro = avisos.filter((a) => a.doMeuBairro && a.tipo !== 'comunicado').length;
    hoje.unshift(avisosBairro
      ? { icone: 'speakerphone', texto: `${avisosBairro} aviso${avisosBairro > 1 ? 's' : ''} no seu bairro agora`, nivel: 'urgente', alvo: 'avisos' }
      : { icone: 'circle-check', texto: 'Nenhum aviso no seu bairro agora', nivel: 'ok' });

    // ---- perguntas frequentes (temas da "versão clara"), com a resposta de agora ----
    const faq = [];
    if (GC.leitos) {
      const u = GC.leitos.resumo().unidades;
      faq.push({ tema: 'Saúde', pergunta: 'Onde fica a UPA ou o hospital mais próximo?', resposta: `A cidade tem ${u.length} unidades de urgência: ${u.map((x) => `${x.nome} (${bairroDe(x.bairroId).nome})`).join(', ')}. Em emergência, ligue 192 (SAMU).`, camada: ['saude', null] });
    }
    if (ordenadas.length) {
      faq.push({ tema: 'Saúde', pergunta: 'Quanto tempo se espera hoje numa UBS?', resposta: `Menor espera agora: ${ordenadas.slice(0, 2).map((x) => `${x.nome} (${espera(x)})`).join(' e ')}. Maior: ${ordenadas[ordenadas.length - 1].nome} (${espera(ordenadas[ordenadas.length - 1])}). Para marcar ou remarcar consulta, procure a recepção da sua UBS ou ligue 156.` });
    }
    if (GC.frota) {
      const l = GC.frota.resumo().linhas;
      const pior = l.slice().sort((a, b) => b.razao - a.razao)[0];
      faq.push({ tema: 'Transporte', pergunta: 'Quais linhas de ônibus a cidade tem e qual a pontualidade?', resposta: `São ${l.length} linhas. ${l.filter((x) => x.situacao === 'ok').length} estão em dia. A que mais atrasa hoje é a ${pior.nome}: espera de ~${pior.esperaMin} min no ponto (programado: ${pior.intervaloMin} min). A Prefeitura já cobrou a concessionária.` });
    }
    if (risco) {
      faq.push({ tema: 'Defesa Civil', pergunta: 'Minha rua está em área de risco? O que fazer se chover forte?', resposta: `Há ${risco.areas.length} áreas de risco mapeadas; ${risco.altas.length} estão em risco alto com a chuva prevista (${risco.altas.map((a) => a.nome).join(', ') || 'nenhuma'}). Se chover forte: não atravesse água corrente, desligue a energia se a água entrar em casa e ligue 199. Cadastre seu celular para receber o SMS da Defesa Civil: mande o seu CEP por SMS para 40199.`, camada: ['risco', null] });
    }
    if (GC.educacao) {
      const creches = GC.educacao.resumo().escolas.filter((e) => e.tipo === 'cmei');
      const fila = creches.reduce((s, e) => s + (e.fila || 0), 0);
      faq.push({ tema: 'Educação', pergunta: 'Há vaga em creche ou pré-escola?', resposta: creches.length ? `${fila ? `Hoje há fila de ${n(fila)} crianças nas creches municipais` : 'Há vagas nas creches municipais'} (${creches.map((e) => e.nome).join(', ')}). Pré-escola (4 e 5 anos) é obrigatória e tem vaga garantida: faça a matrícula na escola mais perto de casa.` : 'A matrícula é feita na escola mais perto de casa.', camada: ['escolas', null] });
    }
    if (GC.coleta) faq.push({ tema: 'Limpeza urbana', pergunta: 'Quando passa o caminhão de lixo no meu bairro?', resposta: 'Veja em "Meu bairro": lá estão os dias e horários do lixo comum e dos recicláveis do seu bairro.', alvo: 'bairro' });
    if (GC.obras) {
      const o = GC.obras.resumo ? GC.obras.resumo() : GC.obras;
      faq.push({ tema: 'Obras', pergunta: 'Quais obras estão acontecendo na cidade?', resposta: `${o.emAndamento} obras em andamento (R$ ${o.contratoMi.toLocaleString('pt-BR')} mi contratados), ${o.atrasadas} com atraso. Cada obra no mapa mostra quanto já foi feito e a previsão de entrega.`, camada: ['obras', null] });
    }
    faq.push({ tema: 'Serviços', pergunta: 'Como peço conserto de buraco, iluminação ou poda de árvore?', resposta: 'Ligue 156 (a ligação é gratuita). Diga o endereço e, se puder, um ponto de referência. O pedido vai direto para a secretaria responsável e você recebe um número de protocolo para acompanhar.' });

    const q = normalizar(ctx.busca);
    const filtradas = q ? faq.filter((f) => normalizar(`${f.tema} ${f.pergunta} ${f.resposta}`).includes(q)) : faq;
    return { cidade: (GC.cidade && GC.cidade.nome) || 'Vila Dourada', avisos, meuBairro: meu, hoje, faq: filtradas, todasFaq: faq, totalFaq: faq.length, contatos: GC.CONTATOS_CIDADAO };
  };

  // Bairro de um ponto (localização do aparelho): o polígono que contém o ponto, ou null fora da cidade.
  GC.bairroDoPonto = function (lat, lng) {
    const dentro = (pol) => {
      let ok = false;
      for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
        const [yi, xi] = pol[i];
        const [yj, xj] = pol[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
      }
      return ok;
    };
    const b = GC.data.bairros.find((x) => dentro(x.poligono));
    return b ? b.id : null;
  };

  // Busca única do portal: bairros, avisos, perguntas, serviços e telefones. Sem termo (ou com 1 letra), nada.
  // Cada resultado diz para onde levar: { tipo, titulo, detalhe, alvo }.
  GC.buscaCidadao = function (conteudo, termo, { limite = 8 } = {}) {
    const q = normalizar(termo);
    if (q.length < 2) return [];
    const tem = (...t) => normalizar(t.join(' ')).includes(q);
    const r = [];
    GC.data.bairros.filter((b) => tem(b.nome)).slice(0, 3)
      .forEach((b) => r.push({ tipo: 'bairro', icone: 'map-pin', titulo: b.nome, detalhe: 'Bairro: avisos e serviços', alvo: b.id }));
    conteudo.avisos.filter((a) => tem(a.titulo, a.texto, ...(a.locais || [])))
      .forEach((a) => r.push({ tipo: 'aviso', icone: 'speakerphone', titulo: a.titulo, detalhe: `Aviso · ${GC.NIVEIS_AVISO[a.nivel]}`, alvo: a.id }));
    (conteudo.todasFaq || conteudo.faq).filter((f) => tem(f.tema, f.pergunta, f.resposta))
      .forEach((f) => r.push({ tipo: 'pergunta', icone: 'help-circle', titulo: f.pergunta, detalhe: `Pergunta frequente · ${f.tema}`, alvo: f.pergunta }));
    GC.SERVICOS_CIDADAO.filter((s) => tem(s.nome, 'pedir servico conserto'))
      .forEach((s) => r.push({ tipo: 'servico', icone: s.icone, titulo: s.nome, detalhe: 'Pedir pelo 156', alvo: '156' }));
    GC.CONTATOS_CIDADAO.filter((c) => tem(c.numero, c.nome, c.texto, 'telefone ligar'))
      .forEach((c) => r.push({ tipo: 'contato', icone: c.icone, titulo: `${c.numero} · ${c.nome}`, detalhe: c.texto, alvo: c.numero }));
    return r.slice(0, limite);
  };

  // Texto para mandar um aviso a alguém (WhatsApp, SMS): o essencial e o telefone de ajuda.
  GC.textoCompartilharAviso = function (a, cidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada') {
    const locais = a.locais && a.locais.length ? `\n${a.locais.map((l) => `• ${l}`).join('\n')}` : '';
    return `${GC.NIVEIS_AVISO[a.nivel].toUpperCase()} · Prefeitura de ${cidade}\n${a.titulo}\n${a.texto}${locais}\nEmergência: Defesa Civil 199 · Bombeiros 193 · SAMU 192`;
  };

  // Pontos públicos do mapa do cidadão: avisos (com local), saúde, escolas e obras. Sem ocorrências internas.
  GC.pontosMapaCidadao = function (conteudo) {
    const pontos = [];
    conteudo.avisos.forEach((a) => (a.pontos || []).forEach((p, i) => {
      if (p.lat !== undefined && p.lng !== undefined) pontos.push({ id: `${a.id}-${i}`, camada: 'avisos', nivel: a.nivel, icone: a.tipo === 'risco' ? 'alert-triangle' : 'barrier-block', titulo: p.titulo, texto: p.situacao ? `${a.texto.split('. Situação')[0]} Situação: ${p.situacao}.` : a.texto, bairroId: p.bairroId, lat: p.lat, lng: p.lng });
    }));
    if (GC.leitos) GC.leitos.resumo().unidades.forEach((u) => pontos.push({ id: `saude-${u.id}`, camada: 'saude', icone: u.tipo === 'upa' ? 'ambulance' : 'building-hospital', titulo: u.nome, texto: `${u.tipo === 'upa' ? 'UPA 24 horas' : 'Hospital'}. Em emergência, ligue 192.`, bairroId: u.bairroId, lat: u.lat, lng: u.lng }));
    if (GC.educacao) GC.educacao.resumo().escolas.forEach((e) => pontos.push({ id: `escolas-${e.id}`, camada: 'escolas', icone: 'school', titulo: e.nome, texto: e.tipo === 'cmei' ? 'Creche e pré-escola' : 'Escola municipal', bairroId: e.bairroId, lat: e.lat, lng: e.lng }));
    if (GC.obras) {
      const mes = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      (GC.obras.resumo ? GC.obras.resumo() : GC.obras).obras.filter((o) => o.situacao !== 'concluida')
        .forEach((o) => pontos.push({ id: `obras-${o.id}`, camada: 'obras', icone: 'crane', titulo: o.nome, texto: `${o.avancoPct}% feito, previsão ${mes(o.previsaoAtual)}.`, bairroId: o.bairroId, lat: o.lat, lng: o.lng }));
    }
    return pontos;
  };
})(window.GC = window.GC || {});
