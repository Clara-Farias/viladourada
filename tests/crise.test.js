const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./helpers/carregar');

const GC = carregar('data.js', 'data-risco.js', 'crise.js');
let relogio = 1_000_000;
GC.agora = () => relogio;
const oc = (id) => Object.assign({ linhaTempo: [] }, GC.data.ocorrencias.find((o) => o.id === id));

test('gabinete de alagamento chama as secretarias envolvidas e as de apoio, uma tarefa cada', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  assert.deepEqual([...g.areas.slice(0, 2)], ['defesa_civil', 'mobilidade']);
  assert.ok(g.areas.includes('limpeza') && g.areas.includes('saude'));
  assert.equal(new Set(g.areas).size, g.areas.length);
  assert.equal(g.tarefas.length, g.areas.length);
  assert.ok(g.tarefas.every((t) => t.status === 'a_fazer' && t.prazoMin > 0 && !/\{[bl]\}/.test(t.texto)));
  assert.equal(g.moradores, 1200);
  assert.equal(g.registro.length, 2);
});

test('convocar de novo a mesma ocorrência devolve o mesmo gabinete', () => {
  const gab = GC.criarGabinetes();
  const a = gab.abrirDeOcorrencia(oc('oc-06'));
  assert.equal(gab.abrirDeOcorrencia(oc('oc-06')), a);
  assert.equal(gab.ativos().length, 1);
  assert.equal(a.grupo, 'energia');
});

test('tarefa anda a_fazer → em_andamento → concluída e para; cada passo vai ao registro', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  assert.ok(gab.avancarTarefa(g.id, 't1'));
  assert.equal(g.tarefas[0].status, 'em_andamento');
  assert.ok(gab.avancarTarefa(g.id, 't1'));
  assert.equal(g.tarefas[0].status, 'concluida');
  assert.equal(gab.avancarTarefa(g.id, 't1'), false);
  assert.equal(gab.cobrarTarefa(g.id, 't1'), false, 'não se cobra tarefa concluída');
  assert.equal(g.registro.length, 4);
  assert.equal(gab.resumo(g.id).feitas, 1);
});

test('tarefa passa a atrasada quando o prazo vence sem conclusão', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  assert.equal(gab.resumo(g.id).atrasadas, 0);
  relogio += 200 * 60000;
  const r = gab.resumo(g.id);
  assert.equal(r.atrasadas, r.total);
  assert.ok(gab.cobrarTarefa(g.id, 't2'));
  assert.equal(g.tarefas[1].cobrancas, 1);
});

test('comunicado precisa de texto e canal; alcance não conta duas vezes o mesmo público', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  const texto = gab.rascunhoComunicado(g.id);
  assert.match(texto, /199/);
  assert.equal(gab.publicarComunicado(g.id, { texto, canais: [] }), null);
  assert.equal(gab.publicarComunicado(g.id, { texto: '  ', canais: ['sms'] }), null);
  const c = gab.publicarComunicado(g.id, { texto, canais: ['sms', 'whatsapp'] });
  assert.equal(c.alcance, 1200, 'SMS e WhatsApp chegam aos mesmos moradores: vale o maior');
  assert.equal(gab.resumo(g.id).ultimoComunicado, c);
  assert.equal(GC.alcanceComunicado(g, ['whatsapp', 'radio']), 720 + 25000);
  assert.equal(GC.alcanceComunicado(g, []), 0);
});

test('SMS: 160 caracteres no alfabeto GSM, 70 com acento fora dele', () => {
  assert.equal(GC.partesSms(''), 0);
  assert.equal(GC.partesSms('a'.repeat(160)), 1);
  assert.equal(GC.partesSms('a'.repeat(161)), 2);
  assert.equal(GC.partesSms('é'.repeat(160)), 1, 'é faz parte do alfabeto GSM');
  assert.equal(GC.partesSms('ã'.repeat(70)), 1);
  assert.equal(GC.partesSms('ã'.repeat(71)), 2);
  assert.equal(GC.partesSms('€'.repeat(80)), 1, '€ ocupa dois caracteres GSM');
  assert.equal(GC.partesSms('€'.repeat(81)), 2);
});

test('encerrado, o relógio do gabinete para: atrasos e duração não crescem mais', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  relogio += 10 * 60000;
  gab.encerrar(g.id);
  const antes = gab.resumo(g.id);
  relogio += 500 * 60000;
  const depois = gab.resumo(g.id);
  assert.equal(depois.atrasadas, 0);
  assert.equal(depois.abertoHaMin, 10);
  assert.deepEqual(depois.tarefas.map((t) => t.restanteMin), antes.tarefas.map((t) => t.restanteMin));
});

test('gabinete preventivo nasce da área de risco da previsão', () => {
  const gab = GC.criarGabinetes();
  const prev = GC.risco.resumo([]).preventivo;
  assert.ok(prev, 'há uma área de risco alto ainda não atingida');
  const g = gab.abrirPreventivo(prev);
  assert.equal(g.origem, 'previsao');
  assert.equal(g.areas[0], 'defesa_civil');
  assert.equal(g.moradores, Math.round(prev.familias * 3.2));
  assert.equal(gab.abrirPreventivo(prev), g);
});

test('encerrar tira dos ativos, trava as tarefas e o registro vem do mais recente', () => {
  const gab = GC.criarGabinetes();
  const o = oc('oc-01');
  o.linhaTempo = [{ t: relogio - 60000, texto: 'Regra disparou automaticamente' }];
  const g = gab.abrirDeOcorrencia(o);
  relogio += 1000;
  assert.ok(gab.encerrar(g.id));
  assert.equal(gab.encerrar(g.id), false);
  assert.equal(gab.ativos().length, 0);
  assert.equal(gab.avancarTarefa(g.id, 't1'), false);
  const r = gab.resumo(g.id, o);
  assert.match(r.registro[0].texto, /encerrado/);
  assert.equal(r.registro[r.registro.length - 1].texto, 'Regra disparou automaticamente');
});

test('deslizamento tem tarefas próprias (não as de rua alagada)', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-04'));
  assert.ok(g.tarefas.every((t) => !/alagad/.test(t.texto)));
  assert.match(g.tarefas.find((t) => t.area === 'defesa_civil').texto, /sirene/);
});

test('gabinetes sobrevivem a recarregar a página (armazenamento) e ids não colidem', () => {
  let salvo = null;
  const armazenamento = { ler: () => (salvo ? JSON.parse(salvo) : null), gravar: (x) => { salvo = JSON.stringify(x); } };
  const a = GC.criarGabinetes({ armazenamento });
  const g = a.abrirDeOcorrencia(oc('oc-01'));
  a.avancarTarefa(g.id, 't1');
  a.dispensar('oc:oc-06', 'Equipe já em campo');
  const b = GC.criarGabinetes({ armazenamento });
  assert.equal(b.todos().length, 1);
  assert.equal(b.buscar(g.id).tarefas[0].status, 'em_andamento');
  assert.equal(b.dispensas()[0].motivo, 'Equipe já em campo');
  b.encerrar(g.id);
  const novo = b.abrirDeOcorrencia(oc('oc-01'));
  assert.notEqual(novo.id, g.id);
  const quebrado = GC.criarGabinetes({ armazenamento: { ler: () => { throw new Error('x'); }, gravar: () => {} } });
  assert.equal(quebrado.todos().length, 0, 'salvo corrompido: começa vazio');
});

test('encerrar com motivo e cancelando pendentes gera o balanço da crise', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  gab.avancarTarefa(g.id, 't1');
  relogio += 30 * 60000;
  gab.avancarTarefa(g.id, 't1');
  gab.cobrarTarefa(g.id, 't2');
  assert.ok(gab.encerrar(g.id, { motivo: 'Água baixou', cancelarPendentes: true }));
  const r = gab.resumo(g.id);
  assert.equal(r.canceladas, g.tarefas.length - 1);
  assert.equal(r.total, 1);
  assert.equal(r.pct, 100);
  assert.equal(r.atrasadas, 0, 'cancelada não conta como atrasada');
  assert.equal(r.balanco.motivo, 'Água baixou');
  assert.equal(r.balanco.concluidas, 1);
  assert.equal(r.balanco.noPrazo, 1);
  assert.equal(r.balanco.cobrancas, 1);
  assert.equal(r.balanco.porArea.find((x) => x.area === 'defesa_civil').minutos, 30);
  assert.match(r.registro[0].texto, /canceladas.*Motivo: Água baixou/);
});

test('rascunho por fase: texto completo e SMS de uma mensagem só', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-01'));
  GC.FASES_COMUNICADO.forEach(({ id }) => {
    const r = gab.rascunho(g.id, id);
    assert.ok(r.texto.length > 40);
    assert.equal(GC.partesSms(r.sms), 1, `SMS da fase ${id} cabe em uma mensagem`);
  });
  assert.match(gab.rascunho(g.id, 'normalizacao').texto, /normalizada/);
  assert.match(gab.rascunho(g.id, 'atualizacao').texto, /0 de \d+ ações/);
  const c = gab.publicarComunicado(g.id, { texto: 'Completo', textoSms: 'Curto', canais: ['sms', 'redes'], fase: 'alerta' });
  assert.equal(c.textoSms, 'Curto');
  assert.equal(gab.publicarComunicado(g.id, { texto: 'Só redes', textoSms: 'x', canais: ['redes'] }).textoSms, null);
});

test('tarefa avulsa e prazo estendido entram no registro', () => {
  const gab = GC.criarGabinetes();
  const g = gab.abrirDeOcorrencia(oc('oc-06'));
  assert.equal(gab.adicionarTarefa(g.id, { area: 'educacao', texto: '  ', prazoMin: 30 }), null);
  assert.equal(gab.adicionarTarefa(g.id, { area: 'nao-existe', texto: 'x', prazoMin: 30 }), null);
  const t = gab.adicionarTarefa(g.id, { area: 'educacao', texto: 'Abrir escola como abrigo', prazoMin: 45 });
  assert.equal(t.id, `t${g.tarefas.length}`);
  assert.ok(g.areas.includes('educacao'));
  const antes = g.tarefas[0].prazoMin;
  assert.ok(gab.estenderPrazo(g.id, 't1', 30));
  assert.equal(g.tarefas[0].prazoMin, antes + 30);
  assert.equal(gab.estenderPrazo(g.id, 't1', 0), false);
  assert.match(g.registro[g.registro.length - 1].texto, /Prazo estendido/);
});

test('sugere encerrar quando a ocorrência é resolvida ou tudo foi concluído', () => {
  const gab = GC.criarGabinetes();
  const o = oc('oc-01');
  const g = gab.abrirDeOcorrencia(o);
  assert.equal(gab.resumo(g.id, o).sugestaoEncerrar, null);
  assert.match(gab.resumo(g.id, Object.assign({}, o, { status: 'resolvida' })).sugestaoEncerrar, /resolvida/);
  g.tarefas.forEach((t) => { gab.avancarTarefa(g.id, t.id); gab.avancarTarefa(g.id, t.id); });
  assert.match(gab.resumo(g.id, o).sugestaoEncerrar, /concluídas/);
  const p = gab.abrirPreventivo(GC.risco.resumo([]).preventivo);
  assert.match(gab.resumo(p.id, null, { id: p.areaRiscoId, nome: 'X', nivel: 'medio' }).sugestaoEncerrar, /médio/);
});

test('decisão dispensada some por 6 h e pode ser reativada', () => {
  const gab = GC.criarGabinetes();
  assert.ok(gab.dispensar('prev:morro', ''));
  assert.equal(gab.dispensas()[0].motivo, 'Sem motivo informado');
  assert.ok(gab.reativar('prev:morro'));
  assert.equal(gab.reativar('prev:morro'), false);
  gab.dispensar('prev:morro', 'ok');
  relogio += 6 * 3600000 + 1;
  assert.equal(gab.dispensas().length, 0);
});
