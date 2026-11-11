(function (GC) {
  // Configurações de gestão (tela Administração): módulos contratados, prazos e canais de cobrança, e o registro
  // de quem fez o quê. Tudo neste navegador (sem servidor), com exportação em arquivo na própria tela.
  const ler = (k, padrao) => { try { const v = JSON.parse(window.localStorage.getItem(k) || 'null'); return v == null ? padrao : v; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const cidadeId = () => (GC.cidade ? GC.cidade.id : 'media');

  // ---- módulos: cada secretaria é um módulo; o gabinete (visão geral) sempre existe ----
  GC.MODULOS = [
    { id: 'saude', nome: 'Saúde' }, { id: 'infraestrutura', nome: 'Obras e Infraestrutura' }, { id: 'educacao', nome: 'Educação' },
    { id: 'defesa_civil', nome: 'Defesa Civil' }, { id: 'seguranca', nome: 'Segurança' }, { id: 'mobilidade', nome: 'Mobilidade' },
    { id: 'limpeza', nome: 'Limpeza Urbana' },
  ];
  let modulos = ler('gc.modulos', null);
  GC.moduloAtivo = (area) => !modulos || modulos.includes(area);
  GC.modulosAtivos = () => (modulos ? modulos.slice() : GC.MODULOS.map((m) => m.id));
  GC.salvarModulos = (ids) => {
    const todos = GC.MODULOS.map((m) => m.id);
    modulos = ids.length === todos.length ? null : todos.filter((id) => ids.includes(id));
    return modulos ? gravar('gc.modulos', modulos) : (window.localStorage.removeItem('gc.modulos'), true);
  };

  // ---- prazos e canais de cobrança por secretaria ----
  const PRAZOS_PADRAO = {
    saude: { respostaH: 2, contato: 'Dra. Helena Prado', telefone: '(85) 98811-2040' },
    infraestrutura: { respostaH: 6, contato: 'Eng. Marcos Teixeira', telefone: '(85) 98822-3151' },
    educacao: { respostaH: 24, contato: 'Profa. Lúcia Andrade', telefone: '(85) 98833-4262' },
    defesa_civil: { respostaH: 1, contato: 'Cel. Roberto Lima', telefone: '(85) 98844-5373' },
    seguranca: { respostaH: 2, contato: 'Insp. Carla Nunes', telefone: '(85) 98855-6484' },
    mobilidade: { respostaH: 4, contato: 'Rafael Moura', telefone: '(85) 98866-7595' },
    limpeza: { respostaH: 12, contato: 'Sandra Rocha', telefone: '(85) 98877-8606' },
  };
  const CANAIS_PADRAO = { sms: true, whatsapp: true, email: false };
  let prazos = ler('gc.prazos', {});
  GC.prazoCobranca = (area) => Object.assign({ canais: Object.assign({}, CANAIS_PADRAO) }, PRAZOS_PADRAO[area] || { respostaH: 4, contato: '', telefone: '' }, prazos[area] || {});
  GC.salvarPrazos = (novo) => { prazos = novo; return gravar('gc.prazos', prazos); };

  // ---- registro (auditoria): quem fez o quê, quando ----
  const CHAVE_REG = () => `gc.registro.${cidadeId()}`;
  let registro = ler(CHAVE_REG(), []);
  const autor = () => (GC.sessao ? `${GC.sessao.nome} (${GC.sessao.email})` : 'Sem login (desenvolvimento)');
  GC.registrar = function (acao, detalhe, extra = {}) {
    const item = Object.assign({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, em: Date.now(), autor: autor(), acao, detalhe }, extra);
    registro.unshift(item);
    if (registro.length > 500) registro.length = 500;
    gravar(CHAVE_REG(), registro);
    return item;
  };
  GC.registro = () => registro.slice();
  GC.limparRegistro = () => { registro = []; gravar(CHAVE_REG(), registro); };

  // Cobranças: cada "cobrar" do registro, com o prazo de resposta da secretaria e o aviso que saiu (SMS/WhatsApp).
  GC.cobrancas = function (buscar = () => null, agora = Date.now()) {
    return registro.filter((r) => r.acao === 'cobrar').map((r) => {
      const o = buscar(r.ocorrenciaId);
      const respondida = o && (o.status === 'resolvida' || o.status === 'em_campo');
      const ate = r.em + r.respostaH * 3600000;
      return Object.assign({}, r, { ate, situacao: respondida ? 'respondida' : agora > ate ? 'vencida' : 'aguardando', ocorrencia: o });
    });
  };
  // Monta o aviso da cobrança (o envio de verdade fica com o integrador de SMS/WhatsApp da prefeitura).
  GC.avisoCobranca = function (o, areaNome) {
    const p = GC.prazoCobranca(o.area);
    const canais = Object.entries(p.canais).filter(([, v]) => v).map(([k]) => ({ sms: 'SMS', whatsapp: 'WhatsApp', email: 'e-mail' }[k]));
    return {
      respostaH: p.respostaH, canais, contato: p.contato, telefone: p.telefone,
      texto: `${GC.produto ? GC.produto() : 'Painel'}: o Gabinete cobra "${o.titulo}" (${areaNome}). Responda em até ${p.respostaH} h.`,
    };
  };
})(window.GC = window.GC || {});
