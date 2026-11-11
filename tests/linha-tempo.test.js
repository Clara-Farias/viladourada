const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-alertas.js', 'store.js', 'linha-tempo.js', 'painel-bairro.js');
GC.escaparHtml = GC.escaparHtml || ((t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
const AGORA = 1_700_000_000_000;
const HORA = 3600000;

// Testa ponto dentro de polígono [lat, lng] (raio cruzando arestas).
function dentro([y, x], poligono) {
  let d = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

test('historicoDoDia: o dia inteiro, o mesmo a cada carga, dentro do dia e dos bairros', () => {
  const inicio = new Date(2026, 10, 4).getTime();
  const a = GC.historicoDoDia(GC.data, inicio);
  assert.ok(a.length > 10);
  // Mesmo dia sorteado de novo (sem o cache: outro objeto de dados) dá o mesmo resultado.
  const b = GC.historicoDoDia(Object.assign({}, GC.data), inicio);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const porId = Object.fromEntries(GC.data.bairros.map((x) => [x.id, x]));
  a.forEach((e) => {
    assert.ok(e.abre >= inicio && e.abre < inicio + 24 * HORA && e.abre < e.fecha, e.o.id);
    assert.ok(e.u >= 0 && e.u < 1);
    assert.ok(dentro([e.o.lat, e.o.lng], porId[e.o.bairroId].poligono), `${e.o.id} fora de ${e.o.bairroId}`);
    assert.ok(e.o.acaoPrefeito && e.o.historico, 'histórico não pulsa como prazo estourado');
  });
});

test('historicoDias: não congela — horas novas de hoje e o dia seguinte ganham histórico', () => {
  const manha = new Date(2026, 10, 5, 9, 0).getTime();
  const noite = new Date(2026, 10, 5, 22, 0).getTime();
  const amanha = new Date(2026, 10, 6, 10, 0).getTime();
  const hoje = new Date(2026, 10, 5).getTime();
  const doDia = (lista, inicio) => lista.filter((e) => e.abre >= inicio && e.abre < inicio + 24 * HORA);
  const cedo = doDia(GC.historicoDias(GC.data, manha), hoje);
  const tarde = doDia(GC.historicoDias(GC.data, noite), hoje);
  assert.ok(tarde.length > cedo.length, 'mais eventos de hoje à noite do que de manhã');
  assert.ok(tarde.some((e) => e.abre > manha), 'horas depois da primeira consulta têm eventos');
  // O que já tinha acontecido de manhã continua no mesmo lugar à noite.
  const abreDe = Object.fromEntries(tarde.map((e) => [e.o.id, e.abre]));
  cedo.forEach((e) => assert.equal(abreDe[e.o.id], e.abre, e.o.id));
  assert.ok(doDia(GC.historicoDias(GC.data, amanha), new Date(2026, 10, 6).getTime()).length >= 3, 'o dia novo tem histórico');
});

test('historicoAte: nada aberto em agora e os fechamentos espalhados, sem queda num minuto só', () => {
  const agora = new Date(2026, 10, 5, 15, 30).getTime();
  const eventos = Array.from({ length: 20 }, (_, i) => ({
    abre: agora - 5 * HORA + i * 60000, fecha: agora + 3 * HORA, u: i / 20, o: { id: `e${i}` },
  }));
  eventos.push({ abre: agora - 10 * 60000, fecha: agora + HORA, u: 0.5, o: { id: 'recente' } });
  const r = GC.historicoAte(eventos, agora);
  assert.ok(!r.some((e) => e.o.id === 'recente'), 'abriu há menos de 30 min: ainda não entra');
  r.forEach((e) => assert.ok(e.fecha > e.abre && e.fecha <= agora - 10 * 60000, e.o.id));
  assert.ok(new Set(r.map((e) => Math.round(e.fecha / 60000))).size > 15, 'fechamentos em minutos diferentes');
  const fechado = { abre: agora - 5 * HORA, fecha: agora - 4 * HORA, u: 0.3, o: { id: 'f' } };
  assert.equal(GC.historicoAte([fechado], agora)[0], fechado, 'quem já fechou fica como está');
});

test('casaRecorteEm: crítica, prazo estourado contado no instante e em andamento', () => {
  const t = AGORA;
  const o = { severidade: 'alta', status: 'encaminhada', criadaEm: t - 3 * HORA, prazoMin: 120 };
  assert.equal(GC.casaRecorteEm(o, 'criticas', t), false);
  assert.equal(GC.casaRecorteEm({ ...o, severidade: 'critica' }, 'criticas', t), true);
  assert.equal(GC.casaRecorteEm(o, 'estourado', t), true);
  assert.equal(GC.casaRecorteEm(o, 'estourado', t - 2 * HORA), false, 'uma hora depois de abrir ainda estava no prazo');
  assert.equal(GC.casaRecorteEm(o, 'andamento', t), false);
  assert.equal(GC.casaRecorteEm({ ...o, status: 'em_campo' }, 'andamento', t), true);
  assert.equal(GC.casaRecorteEm(o, null, t), true);
});

test('abertasEm: criadas antes do instante e não resolvidas até ele, mais o histórico aberto', () => {
  const oc = (id, criadaEm, resolvidaEm = null) => ({ id, criadaEm, resolvidaEm });
  const lista = [oc('a', AGORA - 5 * HORA), oc('b', AGORA - HORA), oc('c', AGORA - 6 * HORA, AGORA - 2 * HORA)];
  const hist = [{ abre: AGORA - 10 * HORA, fecha: AGORA - 8 * HORA, o: { id: 'h' } }];
  const ids = (t) => [...GC.abertasEm(t, lista, hist).map((o) => o.id)].sort(); // array deste contexto (o vm tem outro protótipo)
  assert.deepEqual(ids(AGORA - 3 * HORA), ['a', 'c']);
  assert.deepEqual(ids(AGORA), ['a', 'b']);
  assert.deepEqual(ids(AGORA - 9 * HORA), ['h']);
});

test('resumoBairro e htmlBairro: abertas do bairro (críticas primeiro), satisfação e B.O.s', () => {
  const ocs = [
    { id: 'x1', bairroId: 'centro', severidade: 'media', criadaEm: 1, titulo: 'Buraco', status: 'encaminhada' },
    { id: 'x2', bairroId: 'centro', severidade: 'critica', criadaEm: 2, titulo: 'Alagamento <b>', status: 'encaminhada' },
    { id: 'x3', bairroId: 'vila_nova', severidade: 'alta', criadaEm: 3, titulo: 'Outro', status: 'encaminhada' },
  ];
  const r = GC.resumoBairro('centro', { ocorrencias: ocs });
  assert.deepEqual([...r.abertas.map((o) => o.id)], ['x2', 'x1']);
  assert.equal(r.criticas, 1);
  assert.equal(r.satisfacao, GC.data.satisfacaoPorBairro.centro);
  const h = GC.htmlBairro(r);
  assert.ok(h.includes('Centro') && h.includes('data-ocorrencia="x2"') && h.includes('Alagamento &#60;b&#62;'));
  assert.equal(GC.resumoBairro('nao_existe', {}), null);
  assert.ok(GC.htmlBairro(GC.resumoBairro('centro', { ocorrencias: [] })).includes('Nenhuma ocorrência aberta'));
});

test('diasLinhaTempo e rotuloDia: hoje, ontem e o dia da semana, começando à meia-noite', () => {
  const agora = new Date(2026, 10, 5, 15, 30).getTime(); // qui 05/11
  const dias = GC.diasLinhaTempo(agora, 4);
  assert.equal(dias.length, 4);
  assert.equal(dias[0], new Date(2026, 10, 5).getTime());
  assert.equal(dias[3], new Date(2026, 10, 2).getTime());
  assert.equal(GC.rotuloDia(dias[0], agora), 'Hoje · 05/11');
  assert.equal(GC.rotuloDia(dias[1], agora), 'Ontem · 04/11');
  assert.equal(GC.rotuloDia(dias[2], agora), 'ter · 03/11');
  assert.equal(GC.rotuloHora(new Date(2026, 10, 5, 9, 5).getTime()), '09:05');
  assert.equal(GC.inicioDoDia(agora), dias[0]);
});

test('calendário: grade do mês (domingo primeiro), limites de um ano e mês anterior sem pular de mês', () => {
  const nov = GC.gradeMes(2026, 10); // 01/11/2026 é domingo; 30 dias
  assert.equal(nov.length, 5);
  assert.equal(nov[0][0], new Date(2026, 10, 1).getTime());
  assert.equal(nov[4][1], new Date(2026, 10, 30).getTime());
  assert.deepEqual([...nov[4].slice(2)], [null, null, null, null, null]);
  assert.equal(GC.gradeMes(2026, 1).length, 4, 'fev/2026 começa no domingo e cabe em 4 semanas');
  const out = GC.gradeMes(2026, 9); // 01/10/2026 é quinta
  assert.deepEqual([...out[0].slice(0, 4)], [null, null, null, null]);
  assert.equal(out.flat().filter(Boolean).length, 31);

  const agora = new Date(2026, 10, 5, 15, 30).getTime();
  const { min, max } = GC.limitesLinhaTempo(agora);
  assert.equal(max, new Date(2026, 10, 5).getTime());
  assert.equal(min, new Date(2025, 10, 6).getTime(), '365 dias contando hoje');

  assert.equal(GC.mesesAntes(new Date(2026, 2, 31).getTime(), 1), new Date(2026, 1, 28).getTime());
  assert.equal(GC.mesesAntes(new Date(2026, 0, 31).getTime(), -1), new Date(2026, 1, 28).getTime());
  assert.equal(GC.mesesAntes(new Date(2026, 10, 5).getTime(), 12), new Date(2025, 10, 5).getTime());
  assert.equal(GC.rotuloMes(2026, 2), 'março de 2026');
  assert.equal(GC.rotuloDiaLongo(new Date(2026, 10, 5).getTime()), 'quinta-feira, 5 de novembro de 2026');
  assert.equal(GC.rotuloDia(new Date(2025, 11, 30).getTime(), agora), 'ter · 30/12/25', 'outro ano leva o ano');
});

test('historicoEm: um dia de meses atrás tem histórico (o dia e a véspera), igual ao do cache', () => {
  const agora = new Date(2026, 10, 5, 15, 30).getTime();
  const t = new Date(2026, 4, 12, 14, 0).getTime(); // 12/05, quase 6 meses antes
  const h = GC.historicoEm(GC.data, t, agora);
  const dia = new Date(2026, 4, 12).getTime();
  assert.ok(h.filter((e) => e.abre >= dia).length >= 3, 'o dia escolhido tem eventos');
  assert.ok(h.every((e) => e.abre >= dia - 24 * HORA && e.abre < dia + 24 * HORA), 'só o dia e a véspera');
  assert.ok(GC.abertasEm(t, [], h).length > 0, 'algo aberto às 14h');
  assert.deepEqual(h.map((e) => e.o.id).slice(-3), GC.historicoDoDia(GC.data, dia).map((e) => e.o.id).slice(-3));
});

test('historicoDias: cada dia tem o seu histórico, determinístico, dentro do dia e nunca no futuro', () => {
  const agora = new Date(2026, 10, 5, 15, 30).getTime();
  const a = GC.historicoDias(GC.data, agora, 7);
  const b = GC.historicoDias(GC.data, agora, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const dias = GC.diasLinhaTempo(agora, 7);
  dias.forEach((inicio) => {
    const doDia = a.filter((e) => e.abre >= inicio && e.abre < inicio + 24 * HORA);
    assert.ok(doDia.length >= 3, `dia ${new Date(inicio).toDateString()} sem histórico`);
  });
  a.forEach((e) => {
    assert.ok(e.abre >= dias[6] && e.abre < e.fecha && e.fecha <= agora, e.o.id);
  });
  assert.equal(new Set(a.map((e) => e.o.id)).size, a.length, 'ids únicos');
});
