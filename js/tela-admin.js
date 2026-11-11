(function (GC) {
  // Tela "Administração" (#/admin/<aba>, só gestor geral). Quatro abas:
  // - Consistência dos dados: o verificador (js/consistencia.js) ao vivo, com as proporções por habitante.
  // - Módulos contratados: liga e desliga secretarias (como o produto é vendido).
  // - Prazos e avisos: prazo de resposta da cobrança, contato e canais (SMS, WhatsApp, e-mail) por secretaria,
  //   e as cobranças em andamento (aguardando, vencida, respondida).
  // - Registro: quem fez o quê e quando (cobranças, priorizações, gabinetes, marca, módulos, login).
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ABAS = [
    ['consistencia', '🧪', 'Consistência dos dados'],
    ['modulos', '🧩', 'Módulos contratados'],
    ['prazos', '⏱', 'Prazos e avisos'],
    ['registro', '🗒', 'Registro de ações'],
  ];
  const NOME_ACAO = { cobrar: '📣 Cobrança', priorizar: '⚡ Priorização', gabinete: '🚨 Gabinete', login: '🔑 Entrada', logout: '🚪 Saída', marca: '🎨 Marca', modulos: '🧩 Módulos', prazos: '⏱ Prazos' };
  const hora = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const csv = (linhas) => '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const baixar = (nome, texto) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  GC.criarTelaAdmin = function (el, { store, aoIr }) {
    let aba = 'consistencia';
    const area = (id) => GC.data.areas.find((a) => a.id === id);

    function consistencia() {
      const r = GC.verificarConsistencia(store);
      const grupos = [...new Set(r.checagens.map((c) => c.grupo))];
      const linhas = r.checagens.map((c) => [c.grupo, c.nome, c.a, c.b, c.ok ? (c.nota ? 'definição' : 'ok') : 'diverge', c.onde, c.nota]);
      el.querySelector('.adm-corpo').innerHTML = `
        <div class="adm-resumo ${r.erros ? 'ruim' : 'bom'}">
          <b>${r.erros ? `⚠ ${r.erros} ${r.erros === 1 ? 'ponto precisa' : 'pontos precisam'} de atenção` : '✓ Tudo consistente'}</b>
          <span>${r.checagens.length} verificações entre telas e ${r.proporcoes.length} proporções por habitante · ${esc(r.cidade)}, ${r.populacao.toLocaleString('pt-BR')} habitantes · conferido agora</span>
          <span class="adm-acoes"><button type="button" class="btn-sec" data-adm="rodar">↻ Verificar de novo</button><button type="button" class="btn-sec" data-adm="csv">⬇ CSV</button></span>
        </div>
        <div class="adm-duas">
          <section class="rel-cartao">
            <h3>O mesmo número em todas as telas</h3>
            ${grupos.map((g) => `<h4>${esc(g)}</h4><ul class="adm-checks">${r.checagens.filter((c) => c.grupo === g).map((c) => `
              <li class="${c.ok ? (c.nota ? 'def' : 'ok') : 'erro'}"><i aria-hidden="true">${c.ok ? (c.nota ? 'ℹ' : '✓') : '⚠'}</i>
                <div><b>${esc(c.nome)}</b><span>${esc(c.a)} · ${esc(c.b)}</span><small>${esc(c.onde)}${c.nota ? ` · ${esc(c.nota)}` : ''}</small></div></li>`).join('')}</ul>`).join('')}
          </section>
          <section class="rel-cartao">
            <h3>Proporções por habitante</h3>
            <p class="adm-dica">Faixas de ordem de grandeza para a demonstração ficar crível nos três portes de cidade.</p>
            <table class="adm-tabela"><thead><tr><th>Indicador</th><th>Valor</th><th>Faixa</th><th></th></tr></thead><tbody>
              ${r.proporcoes.map((p) => `<tr class="${p.ok ? '' : 'erro'}"><td>${esc(p.nome)}<small>${esc(p.ref)}</small></td><td><b>${p.unidade === 'R$' ? `R$ ${p.valor.toLocaleString('pt-BR')}` : `${p.valor.toLocaleString('pt-BR')} ${esc(p.unidade)}`}</b></td>
                <td>${p.min.toLocaleString('pt-BR')} a ${p.max.toLocaleString('pt-BR')}</td><td>${p.ok ? '✓' : '⚠ fora'}</td></tr>`).join('')}
            </tbody></table>
          </section>
        </div>`;
      el.querySelector('[data-adm="rodar"]').onclick = () => desenhar();
      el.querySelector('[data-adm="csv"]').onclick = () => baixar('consistencia-dos-dados.csv', csv([['Grupo', 'Verificação', 'Valor A', 'Valor B', 'Situação', 'Onde aparece', 'Nota'], ...linhas]));
    }

    function modulos() {
      const ativos = new Set(GC.modulosAtivos());
      el.querySelector('.adm-corpo').innerHTML = `
        <p class="adm-dica">Cada secretaria é um módulo. O Gabinete (visão geral) está sempre incluído. Uma secretaria desligada sai do mapa, dos alertas, do Pulso, do ranking, do cruzamento de dados e da tela de login.</p>
        <div class="adm-modulos">${GC.MODULOS.map((m) => {
          const a = area(m.id);
          const abertas = store.ocorrencias(m.id).length;
          return `<label class="adm-modulo ${ativos.has(m.id) ? 'on' : ''}"><input type="checkbox" data-mod="${m.id}"${ativos.has(m.id) ? ' checked' : ''}>
            <span class="adm-mod-ic" aria-hidden="true">${a ? a.secretaria.emoji : '🏛'}</span><span><b>${esc(a ? a.secretaria.nome : m.nome)}</b><small>${abertas} ${abertas === 1 ? 'ocorrência aberta' : 'ocorrências abertas'}</small></span>
            <span class="adm-chave" aria-hidden="true"></span></label>`;
        }).join('')}</div>
        <div class="adm-rodape"><span data-adm-n></span><button type="button" class="btn-sec principal" data-adm="salvar-mod">Salvar e aplicar</button></div>`;
      const marcados = () => [...el.querySelectorAll('[data-mod]:checked')].map((i) => i.dataset.mod);
      const contar = () => { el.querySelector('[data-adm-n]').textContent = `${marcados().length} de ${GC.MODULOS.length} módulos ativos`; };
      el.querySelectorAll('[data-mod]').forEach((i) => { i.onchange = () => { i.closest('.adm-modulo').classList.toggle('on', i.checked); contar(); }; });
      contar();
      el.querySelector('[data-adm="salvar-mod"]').onclick = () => {
        const ids = marcados();
        if (!ids.length) { el.querySelector('[data-adm-n]').textContent = 'Deixe ao menos um módulo ativo.'; return; }
        GC.salvarModulos(ids);
        GC.registrar('modulos', `Módulos ativos: ${ids.map((id) => area(id).secretaria.nome).join(', ')}`);
        window.location.reload();
      };
    }

    function prazos() {
      const cobr = GC.cobrancas((id) => store.buscar(id));
      const SIT = { aguardando: ['⏳', 'aguardando resposta'], vencida: ['⚠', 'prazo vencido'], respondida: ['✓', 'respondida (equipe em campo ou resolvida)'] };
      el.querySelector('.adm-corpo').innerHTML = `
        <section class="rel-cartao">
          <h3>Prazo de resposta e avisos por secretaria</h3>
          <p class="adm-dica">Quando o prefeito cobra, o responsável recebe o aviso nos canais marcados e tem este prazo para responder. Passou do prazo, a cobrança aparece como vencida aqui e no registro.</p>
          <div class="adm-rolagem"><table class="adm-tabela adm-prazos"><thead><tr><th>Secretaria</th><th>Responde em</th><th>Responsável</th><th>Telefone</th><th>SMS</th><th>WhatsApp</th><th>E-mail</th></tr></thead><tbody>
            ${GC.MODULOS.filter((m) => GC.moduloAtivo(m.id)).map((m) => { const p = GC.prazoCobranca(m.id); return `<tr data-prazo="${m.id}">
              <td><b>${esc(area(m.id).secretaria.nome)}</b></td>
              <td><input type="number" min="1" max="72" value="${p.respostaH}" data-campo="respostaH"> h</td>
              <td><input type="text" value="${esc(p.contato)}" data-campo="contato"></td>
              <td><input type="tel" value="${esc(p.telefone)}" data-campo="telefone"></td>
              ${['sms', 'whatsapp', 'email'].map((c) => `<td><input type="checkbox" data-canal="${c}"${p.canais[c] ? ' checked' : ''} aria-label="${c}"></td>`).join('')}</tr>`; }).join('')}
          </tbody></table></div>
          <div class="adm-rodape"><span data-adm-ok></span><button type="button" class="btn-sec principal" data-adm="salvar-prazos">Salvar prazos e avisos</button></div>
        </section>
        <section class="rel-cartao">
          <h3>Cobranças <small>${cobr.length ? `${cobr.filter((c) => c.situacao === 'vencida').length} vencida(s) · ${cobr.filter((c) => c.situacao === 'aguardando').length} aguardando` : ''}</small></h3>
          ${cobr.length ? `<ul class="adm-cobrancas">${cobr.map((c) => `<li class="${c.situacao}"><i aria-hidden="true">${SIT[c.situacao][0]}</i>
            <div><b>${esc(c.detalhe)}</b><span>${esc(SIT[c.situacao][1])} · prazo ${hora(c.ate)} · aviso por ${esc((c.canais || []).join(', ') || 'painel')} para ${esc(c.contato || 'responsável')}</span><small>por ${esc(c.autor)} em ${hora(c.em)}</small></div>
            ${c.ocorrenciaId ? `<button type="button" class="btn-sec" data-ver="${esc(c.ocorrenciaId)}">Ver no mapa</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="adm-dica">Nenhuma cobrança ainda. Use “Cobrar” num alerta e ela aparece aqui com o prazo.</p>'}
        </section>`;
      el.querySelector('[data-adm="salvar-prazos"]').onclick = () => {
        const novo = {};
        el.querySelectorAll('[data-prazo]').forEach((tr) => {
          novo[tr.dataset.prazo] = {
            respostaH: Math.max(1, Math.min(72, Number(tr.querySelector('[data-campo="respostaH"]').value) || 4)),
            contato: tr.querySelector('[data-campo="contato"]').value.trim(),
            telefone: tr.querySelector('[data-campo="telefone"]').value.trim(),
            canais: Object.fromEntries(['sms', 'whatsapp', 'email'].map((c) => [c, tr.querySelector(`[data-canal="${c}"]`).checked])),
          };
        });
        GC.salvarPrazos(novo);
        GC.registrar('prazos', 'Prazos e canais de aviso atualizados');
        el.querySelector('[data-adm-ok]').textContent = '✓ Salvo';
      };
      el.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => aoIr({ tela: 'painel' }, b.dataset.ver); });
    }

    function registro() {
      const todos = GC.registro();
      const tipos = [...new Set(todos.map((r) => r.acao))];
      el.querySelector('.adm-corpo').innerHTML = `
        <div class="adm-filtros"><label>Tipo <select data-adm="tipo"><option value="">Todos (${todos.length})</option>${tipos.map((t) => `<option value="${t}">${esc(NOME_ACAO[t] || t)}</option>`).join('')}</select></label>
          <span class="adm-acoes"><button type="button" class="btn-sec" data-adm="csv-reg">⬇ CSV</button><button type="button" class="btn-sec" data-adm="limpar">Limpar registro</button></span></div>
        <section class="rel-cartao"><div class="adm-rolagem"><table class="adm-tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody data-adm-linhas></tbody></table></div>
          <p class="adm-dica" data-adm-vazio hidden>Nada registrado ainda. Entradas, cobranças, priorizações, gabinetes e mudanças de configuração aparecem aqui.</p></section>`;
      const pintar = () => {
        const t = el.querySelector('[data-adm="tipo"]').value;
        const lista = todos.filter((r) => !t || r.acao === t);
        el.querySelector('[data-adm-linhas]').innerHTML = lista.map((r) => `<tr><td>${hora(r.em)}</td><td>${esc(r.autor)}</td><td>${esc(NOME_ACAO[r.acao] || r.acao)}</td><td>${esc(r.detalhe)}</td></tr>`).join('');
        el.querySelector('[data-adm-vazio]').hidden = lista.length > 0;
      };
      el.querySelector('[data-adm="tipo"]').onchange = pintar;
      el.querySelector('[data-adm="csv-reg"]').onclick = () => baixar('registro-de-acoes.csv', csv([['Quando', 'Quem', 'Ação', 'Detalhe'], ...todos.map((r) => [hora(r.em), r.autor, NOME_ACAO[r.acao] || r.acao, r.detalhe])]));
      el.querySelector('[data-adm="limpar"]').onclick = (e) => {
        if (e.target.dataset.confirmar) { GC.limparRegistro(); desenhar(); return; }
        e.target.dataset.confirmar = '1'; e.target.textContent = 'Clique de novo para apagar tudo';
      };
      pintar();
    }

    function desenhar() {
      el.innerHTML = `
        <header class="sec-topo"><div><h2>⚙ Administração</h2><p>Qualidade dos dados, módulos, prazos de cobrança e registro de ações desta prefeitura.</p></div></header>
        <nav class="adm-abas" role="tablist">${ABAS.map(([id, ic, nome]) => `<button type="button" role="tab" aria-selected="${id === aba}" class="${id === aba ? 'ativo' : ''}" data-aba="${id}"><span aria-hidden="true">${ic}</span> ${nome}</button>`).join('')}</nav>
        <div class="adm-corpo"></div>`;
      el.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => aoIr({ tela: 'admin', aba: b.dataset.aba }); });
      ({ consistencia, modulos, prazos, registro })[aba]();
    }

    return { mostrar(rota) { aba = ABAS.some(([id]) => id === rota.aba) ? rota.aba : 'consistencia'; desenhar(); } };
  };
})(window.GC = window.GC || {});
