(function (GC) {
  // Linha do tempo: o que estava aberto em cada instante de um dia escolhido no calendário (até um ano atrás).
  // Duas fontes: as ocorrências desta sessão (criadas e resolvidas de verdade, com hora) e um histórico de
  // cada dia, simulado de forma determinística a partir do volume de 30 dias de cada bairro e secretaria
  // (cidade fictícia: não há registro real do dia anterior). Puro: sem DOM, testável em Node.
  const HORA = 3600000;
  const VOLUME_DIA = 22; // ocorrências que abrem e fecham num dia simulado (varia ±25% de um dia para outro)

  // Gerador pseudoaleatório com semente (mulberry32): o mesmo dia a cada carga.
  function sorteio(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Sorteia um par (secretaria, bairro) com peso pelo volume de 30 dias.
  const escolhedor = (rnd, validos, total) => () => {
    let r = rnd() * total;
    for (const p of validos) { r -= p.n; if (r <= 0) return p; }
    return validos[validos.length - 1];
  };

  // Dias da linha do tempo: o início (00:00) de hoje e dos dias anteriores, do mais recente ao mais antigo.
  GC.DIAS_LINHA_TEMPO = 7;
  GC.inicioDoDia = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  GC.diasLinhaTempo = function (agora, n = GC.DIAS_LINHA_TEMPO) {
    const d = new Date(agora);
    return Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime());
  };
  const dois = (n) => String(n).padStart(2, '0');
  GC.rotuloHora = (t) => { const d = new Date(t); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
  // "Hoje · 05/11", "Ontem · 04/11", "seg · 03/11"; de outro ano, com o ano: "ter · 30/12/25".
  GC.DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  GC.rotuloDia = function (inicio, agora) {
    const d = new Date(inicio);
    const ano = d.getFullYear() !== new Date(agora).getFullYear() ? `/${String(d.getFullYear()).slice(-2)}` : '';
    const dm = `${dois(d.getDate())}/${dois(d.getMonth() + 1)}${ano}`;
    const [hoje, ontem] = GC.diasLinhaTempo(agora, 2);
    if (GC.inicioDoDia(inicio) === hoje) return `Hoje · ${dm}`;
    if (GC.inicioDoDia(inicio) === ontem) return `Ontem · ${dm}`;
    return `${GC.DIAS_SEMANA[d.getDay()]} · ${dm}`;
  };

  // ---- Calendário do seletor de dia ----
  // Até onde dá para voltar: um ano (o histórico é simulado por dia, então qualquer dia tem dados; o limite
  // só evita um calendário sem fim). Devolve o início do dia mais antigo e o de hoje.
  GC.LIMITE_DIAS_LINHA_TEMPO = 365;
  GC.limitesLinhaTempo = function (agora, limite = GC.LIMITE_DIAS_LINHA_TEMPO) {
    const d = new Date(agora);
    return { min: new Date(d.getFullYear(), d.getMonth(), d.getDate() - (limite - 1)).getTime(), max: GC.inicioDoDia(agora) };
  };
  // Semanas do mês (domingo primeiro), cada uma com 7 inícios de dia; null nos dias de fora do mês.
  GC.gradeMes = function (ano, mes) {
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    const vazios = new Date(ano, mes, 1).getDay();
    const celulas = [...Array(vazios).fill(null), ...Array.from({ length: ultimo }, (_, i) => new Date(ano, mes, i + 1).getTime())];
    while (celulas.length % 7) celulas.push(null);
    return Array.from({ length: celulas.length / 7 }, (_, s) => celulas.slice(s * 7, s * 7 + 7));
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  GC.rotuloMes = (ano, mes) => `${MESES[mes]} de ${ano}`;
  // "quinta-feira, 5 de novembro de 2026" (para leitor de tela).
  GC.rotuloDiaLongo = function (inicio) {
    const d = new Date(inicio);
    const semana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d.getDay()];
    return `${semana}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  };
  // Mesmo dia n meses antes (31/03 menos 1 mês = 28 ou 29/02, não 03/03).
  GC.mesesAntes = function (inicio, n) {
    const d = new Date(inicio);
    const ultimo = new Date(d.getFullYear(), d.getMonth() - n + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth() - n, Math.min(d.getDate(), ultimo)).getTime();
  };

  // Base comum do histórico: pares (secretaria, bairro) com peso pelo volume de 30 dias e títulos por área.
  function preparar(data) {
    const pares = [];
    Object.entries(data.historico30d || {}).forEach(([area, porBairro]) => {
      Object.entries(porBairro).forEach(([bairroId, n]) => { if (n > 0) pares.push({ area, bairroId, n }); });
    });
    const bairros = Object.fromEntries(data.bairros.map((b) => [b.id, b]));
    const validos = pares.filter((p) => bairros[p.bairroId] && data.areas.some((a) => a.id === p.area));
    const total = validos.reduce((s, p) => s + p.n, 0);
    const titulos = {};
    [...(data.ocorrencias || []), ...(data.ocorrenciasExtras || []), ...(data.resolvidasRecentes || [])]
      .forEach((o) => { (titulos[o.area] = titulos[o.area] || []).push(o.titulo); });
    return { validos, total, bairros, titulos };
  }

  // Histórico de um dia do calendário, inteiro (00:00 → 24:00), sempre o mesmo para o mesmo dia: a semente
  // é a data e nada aqui depende da hora atual. Por isso fica em cache e não "mexe" enquanto o tempo passa
  // (antes, o histórico era sorteado uma vez com a hora daquele momento e ficava congelado: o dia seguinte
  // e as horas novas de hoje ficavam vazios). Quem corta o que ainda não aconteceu é historicoAte.
  // Devolve [{ o, abre, fecha, u }]: fecha "natural" (pode passar de agora) e u (0..1) fixo por evento.
  const cache = new WeakMap(); // data → Map(início do dia → eventos)
  GC.historicoDoDia = function (data, inicio) {
    let porDia = cache.get(data);
    if (!porDia) { porDia = new Map(); cache.set(data, porDia); }
    if (porDia.has(inicio)) return porDia.get(inicio);
    const { validos, total, bairros, titulos } = preparar(data);
    let eventos = [];
    if (total) {
      const d = new Date(inicio);
      const chave = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      const rnd = sorteio(chave);
      const escolher = escolhedor(rnd, validos, total);
      const n = Math.max(3, Math.round(VOLUME_DIA * (0.75 + rnd() * 0.5)));
      const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      eventos = gerarEventos({ rnd, escolher, bairros, titulos, n, prefixo: `hist-${chave}`, inicio, fim });
    }
    porDia.set(inicio, eventos);
    return eventos;
  };

  // O histórico visto de agora: só o que abriu até 30 min atrás, e nada aberto no presente (o ao vivo é o
  // store). Quem ainda estaria aberta fecha num instante entre a abertura e agora − 10 min, espalhado pelo u
  // de cada evento: a contagem desce aos poucos até o ao vivo, em vez de todas fecharem no mesmo minuto.
  GC.historicoAte = function (eventos, agora) {
    const corte = agora - 10 * 60000;
    return eventos.filter((e) => e.abre <= agora - 30 * 60000).map((e) => (e.fecha <= corte ? e
      : { o: e.o, u: e.u, abre: e.abre, fecha: e.abre + (corte - e.abre) * (0.25 + 0.75 * e.u) }));
  };

  // Histórico dos últimos dias (para a linha do tempo com seletor de dia), já cortado em agora. Barato a
  // cada chamada (os dias vêm do cache): pode ser chamado a cada passo da linha do tempo.
  GC.historicoDias = function (data, agora, dias = GC.DIAS_LINHA_TEMPO) {
    const eventos = [];
    GC.diasLinhaTempo(agora, dias).forEach((inicio) => eventos.push(...GC.historicoDoDia(data, inicio)));
    return GC.historicoAte(eventos, agora);
  };

  // Histórico que importa para o instante t (de qualquer dia do calendário): o dia de t e o anterior (quem
  // abriu na véspera ainda pode estar aberta depois da meia-noite), já cortado em agora.
  GC.historicoEm = function (data, t, agora) {
    const dia = GC.inicioDoDia(t);
    const d = new Date(dia);
    const vespera = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
    return GC.historicoAte([...GC.historicoDoDia(data, vespera), ...GC.historicoDoDia(data, dia)], agora);
  };

  function gerarEventos({ rnd, escolher, bairros, titulos, n, prefixo, inicio, fim }) {
    const eventos = [];
    for (let i = 0; i < n; i++) {
      const p = escolher();
      const b = bairros[p.bairroId];
      const s = rnd();
      const severidade = s < 0.15 ? 'critica' : s < 0.5 ? 'alta' : 'media';
      const abre = inicio + rnd() * (fim - inicio - 30 * 60000);
      const fecha = abre + (0.7 + rnd() * 6) * HORA;
      const lista = titulos[p.area] || ['Ocorrência atendida'];
      eventos.push({
        abre, fecha, u: rnd(),
        o: {
          id: `${prefixo}-${i}`, historico: true, area: p.area, bairroId: p.bairroId, severidade,
          titulo: lista[Math.floor(rnd() * lista.length)],
          // Perto do centro do bairro (os bairros têm folga de sobra para este deslocamento).
          lat: +(b.centro[0] + (rnd() - 0.5) * 0.007).toFixed(5), lng: +(b.centro[1] + (rnd() - 0.5) * 0.006).toFixed(5),
          status: 'encaminhada', criadaEm: abre, prazoMin: 1440, acaoPrefeito: 'historico', fonte: 'Histórico do dia', responsavel: '',
          areasEnvolvidas: [p.area], linhaTempo: [],
        },
      });
    }
    return eventos;
  }

  // O que estava aberto no instante t: ocorrências da sessão (criadas antes de t e não resolvidas até t)
  // mais as do histórico com t entre a abertura e o fechamento.
  GC.abertasEm = function (t, ocorrencias, historico = []) {
    const daSessao = ocorrencias.filter((o) => o.criadaEm <= t && (!o.resolvidaEm || o.resolvidaEm > t));
    const doDia = historico.filter((e) => e.abre <= t && e.fecha > t).map((e) => e.o);
    return [...daSessao, ...doDia];
  };

  // Recorte rápido (Críticas / Prazo estourado / Em andamento) no instante t: a mesma regra do store, mas
  // com a idade contada em t. "Em andamento" usa o status de hoje (a sessão não guarda o status de cada
  // instante). Recorte desconhecido ou vazio: passa tudo.
  GC.casaRecorteEm = function (o, recorte, t) {
    if (recorte === 'criticas') return o.severidade === 'critica';
    if (recorte === 'estourado') return o.status === 'encaminhada' && (t - o.criadaEm) / 60000 > o.prazoMin;
    if (recorte === 'andamento') return o.status === 'em_campo';
    return true;
  };
})(window.GC = window.GC || {});
