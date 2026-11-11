(function (GC) {
  // Gabinete de crise: quando o prefeito convoca o gabinete (numa ocorrência que envolve várias
  // secretarias) ou abre um gabinete preventivo a partir da previsão de chuva, nasce uma sala com
  // tarefas por secretaria (com prazo, "Cobrar" e "Avançar"), o registro da crise em ordem
  // cronológica e o comunicado à população. Só lógica: a tela fica em tela-crise.js.
  GC.agora = GC.agora || (() => Date.now());
  GC.TAREFA_STATUS = ['a_fazer', 'em_andamento', 'concluida'];
  const TEXTO_STATUS = { em_andamento: 'iniciou', concluida: 'concluiu' };
  const MORADORES_POR_FAMILIA = 3.2;

  // Cada tipo de crise chama as secretarias de apoio; cada secretaria recebe uma tarefa típica.
  const GRUPO = {
    alagamento: 'chuva', deslizamento: 'chuva', 'queda de árvore': 'chuva', bueiro: 'chuva',
    'queda de energia': 'energia', 'iluminação pública': 'energia',
    lotação: 'saude', 'falta de médico': 'saude',
  };
  const APOIO = {
    chuva: ['defesa_civil', 'mobilidade', 'limpeza', 'saude'],
    energia: ['infraestrutura', 'saude', 'seguranca', 'mobilidade'],
    saude: ['saude', 'mobilidade'],
    geral: [],
  };
  // [texto, prazo em minutos]; {b} = bairro, {l} = local (área de risco ou título).
  const TAREFAS = {
    chuva: {
      defesa_civil: ['Vistoriar {l} e avisar as famílias da área de risco', 60],
      mobilidade: ['Interditar as vias alagadas e desviar as linhas de ônibus em {b}', 45],
      limpeza: ['Desobstruir bueiros e galerias em {b}', 90],
      saude: ['Deixar a UBS de {b} em plantão reforçado', 120],
      infraestrutura: ['Enviar equipe de drenagem para {l}', 90],
      educacao: ['Avaliar suspensão das aulas e liberar escola de {b} como abrigo', 120],
      seguranca: ['Apoiar a interdição e o isolamento da área em {b}', 60],
    },
    energia: {
      infraestrutura: ['Cobrar da concessionária o prazo de religação em {b}', 30],
      saude: ['Confirmar geradores das unidades de saúde de {b}', 30],
      seguranca: ['Reforçar o patrulhamento noturno nas ruas sem luz de {b}', 60],
      mobilidade: ['Agentes de trânsito nos cruzamentos sem semáforo em {b}', 30],
      defesa_civil: ['Mapear pacientes que dependem de aparelhos elétricos em {b}', 90],
    },
    saude: {
      saude: ['Abrir leitos de retaguarda e acionar a regulação para {l}', 60],
      mobilidade: ['Garantir ambulâncias e rota livre até {l}', 45],
    },
  };
  // Tipos que pedem tarefa diferente da do grupo (encosta não é rua alagada).
  const TAREFAS_DO_TIPO = {
    deslizamento: {
      defesa_civil: ['Acionar a sirene e levar as famílias de {l} ao abrigo', 30],
      mobilidade: ['Interditar as ruas abaixo da encosta em {b}', 45],
      limpeza: ['Limpar as canaletas de drenagem da encosta em {b}', 90],
    },
  };
  const TAREFA_PADRAO = ['Plano de ação da pasta para {l} em {b}', 120];

  const ORIENTACAO = {
    chuva: 'Evite as áreas alagadas, não atravesse ruas com correnteza e, se morar em área de risco, siga para o abrigo indicado pela Defesa Civil.',
    energia: 'Desligue aparelhos da tomada até a luz voltar, redobre a atenção nos cruzamentos sem semáforo e, se depender de aparelho elétrico de saúde, ligue 156.',
    saude: 'Procure primeiro a UBS mais próxima para casos sem urgência; em emergência ligue 192.',
    geral: 'Acompanhe as atualizações da Prefeitura e evite a região até a normalização.',
  };
  // publico: canais com o mesmo público alcançam as mesmas pessoas (SMS e WhatsApp chegam aos
  // moradores da área); no alcance total conta só o maior de cada público, sem somar gente repetida.
  GC.CANAIS_COMUNICADO = [
    { id: 'sms', nome: 'SMS Defesa Civil (40199)', publico: 'moradores', alcance: (g) => g.moradores },
    { id: 'whatsapp', nome: 'WhatsApp da Prefeitura', publico: 'moradores', alcance: (g) => Math.round(g.moradores * 0.6) },
    { id: 'redes', nome: 'Redes sociais e site', publico: 'redes', alcance: () => 18000 },
    { id: 'radio', nome: 'Rádios locais', publico: 'radio', alcance: () => 25000 },
  ];
  // Quantas mensagens um SMS vira: 160 caracteres (153 por parte) no alfabeto GSM; com acento fora
  // dele (á, ã, ç, õ...), o SMS vai em Unicode: 70 caracteres (67 por parte).
  const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM7_EXT = '^{}\\[~]|€';
  GC.partesSms = function (texto) {
    const t = String(texto || '');
    if (!t) return 0;
    const chars = [...t];
    if (chars.every((c) => GSM7.includes(c) || GSM7_EXT.includes(c))) {
      const n = chars.reduce((s, c) => s + (GSM7_EXT.includes(c) ? 2 : 1), 0);
      return n <= 160 ? 1 : Math.ceil(n / 153);
    }
    return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
  };

  GC.alcanceComunicado = function (g, ids) {
    const maior = {};
    GC.CANAIS_COMUNICADO.filter((c) => (ids || []).includes(c.id)).forEach((c) => {
      maior[c.publico] = Math.max(maior[c.publico] || 0, c.alcance(g));
    });
    return Object.values(maior).reduce((s, n) => s + n, 0);
  };

  const bairroNome = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;
  const secretaria = (area) => (GC.data.areas.find((a) => a.id === area) || { secretaria: { nome: 'Secretaria', emoji: '🏛' } }).secretaria;
  const preencher = (texto, b, l) => texto.replace(/\{b\}/g, b).replace(/\{l\}/g, l);
  const unicos = (lista) => [...new Set(lista)];

  // Secretarias que um gabinete aciona: as da origem + as de apoio do tipo de crise (só as que existem).
  // A tela de listagem usa para dizer, antes de abrir, quem será notificado.
  GC.areasDoGabinete = function (tipo, areasBase) {
    const grupo = GRUPO[tipo] || 'geral';
    return unicos([...(areasBase || []), ...APOIO[grupo]]).filter((a) => GC.data.areas.some((x) => x.id === a));
  };


  // Versão curta para SMS: sem acentos (o SMS fica no alfabeto GSM, 160 caracteres) e numa mensagem só.
  const ORIENTACAO_CURTA = {
    chuva: 'Evite areas alagadas; se morar em area de risco, va ao abrigo.',
    energia: 'Desligue aparelhos e redobre a atencao nos cruzamentos.',
    saude: 'Casos leves: procure a UBS. Urgencia: 192.',
    geral: 'Evite a regiao.',
  };
  const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·–—]/g, '-').replace(/[“”]/g, '"');
  // partes: a primeira é obrigatória; as outras saem do fim até o texto caber numa mensagem.
  function caberSms(partes) {
    const lista = partes.filter(Boolean).map(semAcento);
    while (lista.length > 1 && GC.partesSms(lista.join(' ')) > 1) lista.pop();
    let texto = lista.join(' ');
    while (GC.partesSms(texto) > 1) texto = `${texto.slice(0, -4).trim()}...`;
    return texto;
  }

  GC.FASES_COMUNICADO = [
    { id: 'alerta', nome: 'Alerta' },
    { id: 'atualizacao', nome: 'Atualização' },
    { id: 'normalizacao', nome: 'Normalização' },
  ];
  const STATUS_FIM = ['concluida', 'cancelada'];
  const DISPENSA_MIN = 6 * 60; // uma decisão dispensada volta a aparecer depois de 6 h

  // opcoes.armazenamento (opcional): { ler() → objeto salvo | null, gravar(objeto) }. Sem ele, só memória.
  GC.criarGabinetes = function (opcoes = {}) {
    const lista = [];
    let dispensas = [];
    let seq = 0;
    const arm = opcoes.armazenamento || null;

    // Salva tudo a cada mudança: recarregar a página não apaga a sala, o registro nem os comunicados.
    function persistir() {
      if (!arm) return;
      try { arm.gravar({ versao: 1, seq, gabinetes: lista, dispensas }); } catch (e) { /* sem espaço ou bloqueado: segue em memória */ }
    }
    if (arm) {
      try {
        const salvo = arm.ler();
        if (salvo && salvo.versao === 1 && Array.isArray(salvo.gabinetes)) {
          lista.push(...salvo.gabinetes);
          dispensas = Array.isArray(salvo.dispensas) ? salvo.dispensas : [];
          seq = Math.max(Number(salvo.seq) || 0, lista.length);
        }
      } catch (e) { /* salvo corrompido: começa vazio */ }
    }

    const buscar = (id) => lista.find((g) => g.id === id) || null;
    const registrar = (g, texto, quem = 'Gabinete do Prefeito') => g.registro.push({ t: GC.agora(), quem, texto });
    const aberta = (gid) => { const g = buscar(gid); return g && !g.encerradoEm ? g : null; };
    const tempo = (min) => (GC.tempoTexto ? GC.tempoTexto(min) : `${min} min`);

    function montar({ id, origem, ocorrenciaId, titulo, tipo, bairroId, local, areasBase, moradores, areaRiscoId }) {
      const grupo = GRUPO[tipo] || 'geral';
      const areas = GC.areasDoGabinete(tipo, areasBase);
      const agora = GC.agora();
      const b = bairroNome(bairroId);
      const tarefas = areas.map((area, i) => {
        const [texto, prazoMin] = (TAREFAS_DO_TIPO[tipo] || {})[area] || (TAREFAS[grupo] || {})[area] || TAREFA_PADRAO;
        return { id: `t${i + 1}`, area, texto: preencher(texto, b, local), prazoMin, status: 'a_fazer', criadaEm: agora, cobrancas: 0, concluidaEm: null };
      });
      const g = { id, origem, ocorrenciaId: ocorrenciaId || null, areaRiscoId: areaRiscoId || null, titulo, tipo, grupo, bairroId, local, areas, moradores: Math.round(moradores || 0), abertoEm: agora, encerradoEm: null, motivoEncerramento: null, tarefas, registro: [], comunicados: [] };
      registrar(g, origem === 'previsao'
        ? `Gabinete preventivo aberto a partir da previsão de chuva para ${local}`
        : `Gabinete de crise convocado para "${titulo}"`);
      registrar(g, `${areas.length} secretarias notificadas com tarefas e prazos: ${areas.map((a) => secretaria(a).nome).join(', ')}`);
      lista.push(g);
      persistir();
      return g;
    }

    // A partir de uma ocorrência (normalmente a que pediu "Gabinete de crise"). Uma sala por ocorrência.
    function abrirDeOcorrencia(o) {
      if (!o) return null;
      const existente = lista.find((g) => g.ocorrenciaId === o.id && !g.encerradoEm);
      if (existente) return existente;
      return montar({
        id: `g-${o.id}-${++seq}`, origem: 'ocorrencia', ocorrenciaId: o.id, titulo: o.titulo, tipo: o.tipo, bairroId: o.bairroId,
        local: o.titulo.replace(/^[A-ZÁÉÍÓÚ][^ ]* (na|no|em|da|do|de|próximo à) /i, '') || o.titulo,
        areasBase: o.areasEnvolvidas || [o.area], moradores: o.afetados,
      });
    }

    // Preventivo: uma área de risco avaliada por GC.risco (antes de a chuva chegar).
    function abrirPreventivo(a) {
      if (!a) return null;
      const existente = lista.find((g) => g.areaRiscoId === a.id && !g.encerradoEm);
      if (existente) return existente;
      return montar({
        id: `g-risco-${a.id}-${++seq}`, origem: 'previsao', areaRiscoId: a.id, titulo: `Risco de ${a.tipo}: ${a.nome}`, tipo: a.tipo,
        bairroId: a.bairroId, local: a.nome, areasBase: ['defesa_civil'], moradores: a.familias * MORADORES_POR_FAMILIA,
      });
    }

    function avancarTarefa(gid, tid) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      if (!t || STATUS_FIM.includes(t.status)) return false;
      t.status = GC.TAREFA_STATUS[GC.TAREFA_STATUS.indexOf(t.status) + 1];
      if (t.status === 'concluida') t.concluidaEm = GC.agora();
      registrar(g, `${TEXTO_STATUS[t.status]}: ${t.texto}`, secretaria(t.area).nome);
      persistir();
      return true;
    }

    function cobrarTarefa(gid, tid) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      if (!t || STATUS_FIM.includes(t.status)) return false;
      t.cobrancas++;
      registrar(g, `Prefeito cobrou a ${secretaria(t.area).nome}: ${t.texto}`);
      persistir();
      return true;
    }

    // Tarefa avulsa, criada na sala (a crise pediu algo que o modelo não previu).
    function adicionarTarefa(gid, { area, texto, prazoMin } = {}) {
      const g = aberta(gid);
      const limpo = String(texto || '').trim();
      const prazo = Math.round(Number(prazoMin));
      if (!g || !limpo || !GC.data.areas.some((a) => a.id === area) || !(prazo > 0)) return null;
      const n = g.tarefas.reduce((m, t) => Math.max(m, Number(String(t.id).slice(1)) || 0), 0) + 1;
      const t = { id: `t${n}`, area, texto: limpo, prazoMin: prazo, status: 'a_fazer', criadaEm: GC.agora(), cobrancas: 0, concluidaEm: null, avulsa: true };
      g.tarefas.push(t);
      if (!g.areas.includes(area)) g.areas.push(area);
      registrar(g, `Nova tarefa para a ${secretaria(area).nome} (prazo de ${tempo(prazo)}): ${limpo}`);
      persistir();
      return t;
    }

    // Mais tempo para uma tarefa (a secretaria pediu, ou o cenário mudou). Fica no registro.
    function estenderPrazo(gid, tid, minutos) {
      const g = aberta(gid);
      const t = g && g.tarefas.find((x) => x.id === tid);
      const m = Math.round(Number(minutos));
      if (!t || STATUS_FIM.includes(t.status) || !(m > 0)) return false;
      t.prazoMin += m;
      registrar(g, `Prazo estendido em ${tempo(m)} para a ${secretaria(t.area).nome}: ${t.texto}`);
      persistir();
      return true;
    }

    // Textos prontos para o prefeito revisar, por fase da crise: o completo (WhatsApp, redes, rádio)
    // e o curto para SMS (uma mensagem).
    function rascunho(gid, fase = 'alerta') {
      const g = buscar(gid);
      if (!g) return { texto: '', sms: '' };
      const cidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
      const bairro = bairroNome(g.bairroId);
      const prev = g.origem === 'previsao';
      const assunto = prev ? `o risco de ${g.tipo} em ${g.local}` : `${g.titulo.charAt(0).toLowerCase()}${g.titulo.slice(1)}`;
      const curto = prev ? `risco de ${g.tipo} em ${g.local}` : g.titulo;
      const ativas = g.tarefas.filter((t) => t.status !== 'cancelada');
      const feitas = ativas.filter((t) => t.status === 'concluida').length;
      const emergencias = 'Emergências: Defesa Civil 199 · Bombeiros 193 · SAMU 192.';
      if (fase === 'normalizacao') {
        return {
          texto: `A Prefeitura de ${cidade} informa que a situação sobre ${assunto} (${bairro}) está normalizada. Obrigada pela colaboração de todos. Em caso de emergência: Defesa Civil 199 · Bombeiros 193 · SAMU 192.`,
          sms: caberSms([`Prefeitura de ${cidade}: situacao normalizada em ${bairro}.`, 'Obrigada pela colaboracao.', 'Emergencia: 199.']),
        };
      }
      if (fase === 'atualizacao') {
        return {
          texto: `Atualização da Prefeitura de ${cidade} sobre ${assunto} (${bairro}): ${feitas} de ${ativas.length} ações concluídas e as equipes seguem em campo. ${ORIENTACAO[g.grupo]} ${emergencias}`,
          sms: caberSms([`Prefeitura de ${cidade}: ${curto} - equipes em campo, ${feitas}/${ativas.length} acoes concluidas.`, ORIENTACAO_CURTA[g.grupo], 'Emergencia: 199.']),
        };
      }
      const abertura = prev
        ? `A Prefeitura de ${cidade} alerta para risco de ${g.tipo} em ${g.local} (${bairro}) nas próximas horas.`
        : `A Prefeitura de ${cidade} informa: ${assunto} (${bairro}).`;
      return {
        texto: `${abertura} ${g.areas.length} secretarias já estão em campo. ${ORIENTACAO[g.grupo]} ${emergencias}`,
        sms: caberSms([`Prefeitura de ${cidade}: ${curto} (${bairro}).`, ORIENTACAO_CURTA[g.grupo], 'Emergencia: 199.']),
      };
    }
    const rascunhoComunicado = (gid) => rascunho(gid, 'alerta').texto;

    // textoSms (opcional): a versão curta que vai pelo SMS; os outros canais levam o texto completo.
    function publicarComunicado(gid, { texto, canais, textoSms, fase } = {}) {
      const g = aberta(gid);
      const escolhidos = GC.CANAIS_COMUNICADO.filter((c) => (canais || []).includes(c.id));
      if (!g || !String(texto || '').trim() || !escolhidos.length) return null;
      const sms = escolhidos.some((x) => x.id === 'sms') && String(textoSms || '').trim() ? String(textoSms).trim() : null;
      const c = { t: GC.agora(), texto: String(texto).trim(), textoSms: sms, fase: fase || null, canais: escolhidos.map((x) => x.id), alcance: GC.alcanceComunicado(g, escolhidos.map((x) => x.id)) };
      g.comunicados.push(c);
      registrar(g, `Comunicado publicado (${escolhidos.map((x) => x.nome).join(', ')}) · alcance estimado de ${c.alcance.toLocaleString('pt-BR')} pessoas`);
      persistir();
      return c;
    }

    // motivo (opcional) vai ao registro e ao balanço; cancelarPendentes marca o que sobrou como
    // "cancelada" (não fica "A fazer" para sempre numa sala fechada).
    function encerrar(gid, { motivo, cancelarPendentes } = {}) {
      const g = aberta(gid);
      if (!g) return false;
      const agora = GC.agora();
      g.encerradoEm = agora;
      g.motivoEncerramento = String(motivo || '').trim() || null;
      const pendentes = g.tarefas.filter((t) => !STATUS_FIM.includes(t.status));
      if (cancelarPendentes) pendentes.forEach((t) => { t.status = 'cancelada'; t.canceladaEm = agora; });
      const quando = pendentes.length
        ? `Gabinete encerrado com ${pendentes.length} tarefa(s) em aberto${cancelarPendentes ? ' (canceladas)' : ''}`
        : 'Gabinete encerrado: todas as tarefas concluídas';
      registrar(g, g.motivoEncerramento ? `${quando}. Motivo: ${g.motivoEncerramento}` : quando);
      persistir();
      return true;
    }

    // Balanço da sala: duração, tempo de resposta por secretaria, cobranças e comunicados.
    function balanco(g) {
      const fim = g.encerradoEm || GC.agora();
      const noPrazo = (t) => t.concluidaEm - t.criadaEm <= t.prazoMin * 60000;
      const porArea = g.areas.map((area) => {
        const ts = g.tarefas.filter((t) => t.area === area);
        const concluidas = ts.filter((t) => t.status === 'concluida');
        return {
          area, secretaria: secretaria(area), total: ts.length, concluidas: concluidas.length,
          canceladas: ts.filter((t) => t.status === 'cancelada').length,
          noPrazo: concluidas.filter(noPrazo).length,
          minutos: concluidas.length ? Math.round(concluidas.reduce((s, t) => s + (t.concluidaEm - t.criadaEm), 0) / concluidas.length / 60000) : null,
          cobrancas: ts.reduce((s, t) => s + t.cobrancas, 0),
        };
      }).filter((x) => x.total);
      const concluidas = g.tarefas.filter((t) => t.status === 'concluida');
      return {
        duracaoMin: Math.round((fim - g.abertoEm) / 60000),
        concluidas: concluidas.length,
        canceladas: g.tarefas.filter((t) => t.status === 'cancelada').length,
        total: g.tarefas.length,
        noPrazo: concluidas.filter(noPrazo).length,
        cobrancas: g.tarefas.reduce((s, t) => s + t.cobrancas, 0),
        comunicados: g.comunicados.length,
        alcance: g.comunicados.reduce((m, c) => Math.max(m, c.alcance), 0),
        motivo: g.motivoEncerramento || null,
        porArea,
      };
    }

    // Números e listas que a tela mostra. ocorrencia (opcional): a de origem, para somar a linha do tempo
    // dela e sugerir o encerramento quando ela é resolvida. areaRisco (opcional): a área do gabinete
    // preventivo, reavaliada; sem risco alto, sugere encerrar.
    function resumo(gid, ocorrencia, areaRisco) {
      const g = buscar(gid);
      if (!g) return null;
      // Encerrado, o relógio do gabinete para: prazos e atrasos ficam como estavam no encerramento.
      const agora = g.encerradoEm || GC.agora();
      const tarefas = g.tarefas.map((t) => Object.assign({}, t, {
        secretaria: secretaria(t.area),
        atrasada: !STATUS_FIM.includes(t.status) && agora - t.criadaEm > t.prazoMin * 60000,
        restanteMin: Math.round(t.prazoMin - (agora - t.criadaEm) / 60000),
      }));
      const validas = tarefas.filter((t) => t.status !== 'cancelada');
      const feitas = validas.filter((t) => t.status === 'concluida').length;
      const daOcorrencia = ocorrencia && ocorrencia.id === g.ocorrenciaId
        ? (ocorrencia.linhaTempo || []).map((x) => ({ t: x.t, quem: secretaria(ocorrencia.area).nome, texto: x.texto, ocorrencia: true }))
        : [];
      let sugestaoEncerrar = null;
      if (!g.encerradoEm) {
        if (ocorrencia && ocorrencia.id === g.ocorrenciaId && ocorrencia.status === 'resolvida') sugestaoEncerrar = 'A ocorrência de origem foi resolvida.';
        else if (areaRisco && areaRisco.id === g.areaRiscoId && areaRisco.nivel !== 'alto') sugestaoEncerrar = `A previsão baixou o risco de ${areaRisco.nome} para ${areaRisco.nivel === 'medio' ? 'médio' : areaRisco.nivel}.`;
        else if (validas.length && feitas === validas.length) sugestaoEncerrar = 'Todas as tarefas foram concluídas.';
      }
      return {
        gabinete: g,
        bairro: bairroNome(g.bairroId),
        tarefas,
        feitas,
        total: validas.length,
        canceladas: tarefas.length - validas.length,
        pct: validas.length ? Math.round((feitas / validas.length) * 100) : 0,
        atrasadas: tarefas.filter((t) => t.atrasada).length,
        abertoHaMin: Math.round((agora - g.abertoEm) / 60000),
        // Mais recente primeiro; empate (mesmo instante) mantém a ordem em que aconteceu, invertida.
        registro: [...daOcorrencia, ...g.registro].map((x, i) => Object.assign({ i }, x)).sort((a, b) => b.t - a.t || b.i - a.i),
        ultimoComunicado: g.comunicados[g.comunicados.length - 1] || null,
        sugestaoEncerrar,
        balanco: g.encerradoEm ? balanco(g) : null,
      };
    }

    // Decisões dispensadas na listagem ("Defesa Civil já em campo"): somem por 6 h, com o motivo guardado.
    const vigentes = () => dispensas.filter((d) => GC.agora() - d.t < DISPENSA_MIN * 60000);
    function dispensar(chave, motivo) {
      if (!chave) return false;
      dispensas = dispensas.filter((d) => d.chave !== chave);
      dispensas.push({ chave, motivo: String(motivo || '').trim() || 'Sem motivo informado', t: GC.agora() });
      persistir();
      return true;
    }
    function reativar(chave) {
      const antes = dispensas.length;
      dispensas = dispensas.filter((d) => d.chave !== chave);
      if (dispensas.length === antes) return false;
      persistir();
      return true;
    }

    return {
      abrirDeOcorrencia,
      abrirPreventivo,
      avancarTarefa,
      cobrarTarefa,
      adicionarTarefa,
      estenderPrazo,
      rascunho,
      rascunhoComunicado,
      publicarComunicado,
      encerrar,
      resumo,
      buscar,
      dispensar,
      reativar,
      dispensas: vigentes,
      todos: () => lista.slice(),
      ativos: () => lista.filter((g) => !g.encerradoEm),
    };
  };
})(window.GC = window.GC || {});
