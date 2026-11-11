(function (GC) {
  // Busca rápida (lupa ao lado de Filtros): acha bairro, ocorrência, secretaria, hospital/UPA, escola,
  // obra, farmácia, linha de ônibus, rota da coleta, área de risco ou tela, e leva até ela.
  // GC.buscar é puro (testável em Node); GC.criarBuscaUI cuida do campo e da lista.
  const esc = (t) => GC.escaparHtml(t);
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

  // sinonimos: palavras que acham o tipo mesmo sem estar no nome ("hospital" acha a UPA).
  GC.TIPOS_BUSCA = {
    bairro: { nome: 'Bairro', icone: 'map-pin', sinonimos: 'bairro' },
    ocorrencia: { nome: 'Ocorrência', icone: 'alert-circle', sinonimos: 'ocorrencia problema chamado' },
    secretaria: { nome: 'Secretaria', icone: 'building', sinonimos: 'secretaria orgao' },
    leito: { nome: 'Saúde', icone: 'building-hospital', sinonimos: 'saude hospital posto pronto-socorro leito' },
    escola: { nome: 'Escola', icone: 'school', sinonimos: 'escola educacao ensino colegio creche' },
    obra: { nome: 'Obra', icone: 'crane', sinonimos: 'obra construcao reforma' },
    farmacia: { nome: 'Farmácia', icone: 'pill', sinonimos: 'farmacia ubs remedio medicamento' },
    linha: { nome: 'Linha de ônibus', icone: 'bus', sinonimos: 'linha onibus transporte' },
    coleta: { nome: 'Coleta', icone: 'truck', sinonimos: 'coleta lixo residuos' },
    risco: { nome: 'Área de risco', icone: 'alert-triangle', sinonimos: 'area risco' },
    tela: { nome: 'Tela', icone: 'layout', sinonimos: 'tela' },
  };

  // Junta tudo o que pode ser buscado: [{ tipo, id, rotulo, detalhe, termos, severidade? }].
  // Cada fonte é opcional (cidade sem um dado não quebra a busca).
  // termos = nome + sinônimos do tipo + palavras-chave (bairro, subtipo). O detalhe é só para exibir:
  // números e palavras como "moradores" ou "ocupado" não entram, senão casam com tudo de um tipo.
  GC.itensBusca = function ({ data = GC.data, ocorrencias = [], leitos = [], escolas = [], obras = [], farmacias = [], linhas = [], rotas = [], riscos = [] } = {}) {
    const nomeBairro = (id) => (data.bairros.find((b) => b.id === id) || {}).nome || '';
    const juntar = (...partes) => partes.filter(Boolean).join(' · ');
    const itens = [];
    const add = (tipo, id, rotulo, detalhe, chaves = [], extra = {}) => {
      const t = GC.TIPOS_BUSCA[tipo];
      itens.push(Object.assign({ tipo, id, rotulo, detalhe, termos: normalizar([rotulo, t.sinonimos, ...chaves].filter(Boolean).join(' ')) }, extra));
    };
    data.bairros.forEach((b) => add('bairro', b.id, b.nome, `Bairro · ${Number(b.populacao || 0).toLocaleString('pt-BR')} moradores`));
    ocorrencias.forEach((o) => {
      const bairro = nomeBairro(o.bairroId);
      add('ocorrencia', o.id, o.titulo, juntar(SEV[o.severidade], bairro), [SEV[o.severidade], bairro], { severidade: o.severidade, area: o.area, areas: o.areasEnvolvidas || [] });
    });
    data.areas.forEach((a) => add('secretaria', a.id, (a.secretaria && a.secretaria.nome) || a.nome, `Secretaria · ${a.nome}`, [a.nome]));
    leitos.forEach((u) => {
      const bairro = nomeBairro(u.bairroId);
      add('leito', u.id, u.nome, juntar(u.tipo || 'Unidade de saúde', bairro, typeof u.pct === 'number' && `${u.pct}% ocupado`), [u.tipo, bairro]);
    });
    escolas.forEach((e) => add('escola', e.id, e.nome, juntar('Escola', nomeBairro(e.bairroId)), [nomeBairro(e.bairroId)]));
    obras.forEach((o) => add('obra', o.id, o.nome, juntar('Obra', nomeBairro(o.bairroId), typeof o.avancoPct === 'number' && `${o.avancoPct}% pronta`), [nomeBairro(o.bairroId)]));
    farmacias.forEach((f) => add('farmacia', f.id, f.nome, juntar('Farmácia / UBS', nomeBairro(f.bairroId)), [nomeBairro(f.bairroId)]));
    linhas.forEach((l) => add('linha', l.id, l.nome, juntar('Linha de ônibus', l.esperaMin && `espera de ${l.esperaMin} min`)));
    rotas.forEach((r) => add('coleta', r.id, r.nome, juntar('Coleta de lixo', r.horario)));
    riscos.forEach((a) => add('risco', a.id, a.nome, juntar('Área de risco', nomeBairro(a.bairroId)), [nomeBairro(a.bairroId)]));
    [
      ['alertas', 'Central de alertas', { tela: 'alertas' }],
      ['secretarias', 'Secretarias', { tela: 'secretarias' }],
      ['relatorios', 'Relatórios', { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' }],
      ['dados', 'Dados', { tela: 'dados', tabela: null }],
    ].forEach(([id, nome, rota]) => add('tela', id, nome, 'Tela do painel', [], { rota }));
    return itens;
  };

  // Ordem: começa com o termo > alguma palavra começa com ele > contém. No empate, o tipo (bairro,
  // ocorrência, secretaria… na ordem de GC.TIPOS_BUSCA) e depois o nome. Várias palavras: todas precisam casar.
  const ORDEM_TIPO = Object.keys(GC.TIPOS_BUSCA);
  GC.buscar = function (termo, itens, limite = 8) {
    const q = normalizar(termo);
    if (!q) return [];
    const palavras = q.split(/\s+/);
    const pontuar = (it) => {
      if (!palavras.every((p) => it.termos.includes(p))) return -1;
      const rot = normalizar(it.rotulo);
      if (rot.startsWith(q)) return 3;
      if (rot.split(/[\s\-–·/]+/).some((w) => w.startsWith(palavras[0]))) return 2;
      return rot.includes(palavras[0]) ? 1 : 0;
    };
    return itens
      .map((it) => ({ it, p: pontuar(it) }))
      .filter((x) => x.p >= 0)
      .sort((a, b) => b.p - a.p || ORDEM_TIPO.indexOf(a.it.tipo) - ORDEM_TIPO.indexOf(b.it.tipo) || a.it.rotulo.localeCompare(b.it.rotulo, 'pt-BR'))
      .slice(0, limite)
      .map((x) => x.it);
  };

  // ---- interface: lupa que abre um campo com a lista de resultados ----
  // el: { raiz, botao, caixa, input, lista }; itens(): lista atual; aoEscolher(item).
  GC.criarBuscaUI = function (el, { itens, aoEscolher }) {
    let resultados = [];
    let ativo = -1;
    let cache = null; // itens montados ao abrir (a cidade muda pouco enquanto se digita)

    function desenhar() {
      const q = el.input.value;
      resultados = cache ? GC.buscar(q, cache) : [];
      if (ativo >= resultados.length) ativo = resultados.length - 1;
      if (!q.trim()) {
        el.lista.innerHTML = '<li class="busca-dica">Digite um bairro, ocorrência, escola, hospital, obra, linha de ônibus ou secretaria.</li>';
      } else if (!resultados.length) {
        el.lista.innerHTML = `<li class="busca-dica">Nada encontrado para “${esc(q.trim())}”.</li>`;
      } else {
        el.lista.innerHTML = resultados.map((r, i) => {
          const t = GC.TIPOS_BUSCA[r.tipo];
          return `<li role="option" id="busca-op-${i}" class="busca-item${i === ativo ? ' ativo' : ''}" aria-selected="${i === ativo}" data-i="${i}">
            <i class="ti ti-${t.icone} busca-ic${r.severidade ? ` ${r.severidade}` : ''}" aria-hidden="true"></i>
            <span class="busca-txt"><b>${esc(r.rotulo)}</b><small>${esc(r.detalhe)}</small></span>
            <span class="busca-tipo">${t.nome}</span></li>`;
        }).join('');
      }
      el.input.setAttribute('aria-activedescendant', ativo >= 0 ? `busca-op-${ativo}` : '');
      el.input.setAttribute('aria-expanded', String(resultados.length > 0));
    }

    function abrir() {
      cache = itens();
      el.raiz.classList.add('aberta');
      el.caixa.hidden = false;
      el.botao.setAttribute('aria-expanded', 'true');
      ativo = -1;
      desenhar();
      el.input.focus(); // já, sem setTimeout: a lupa some ao abrir e o foco não pode cair no vazio
    }
    function fechar() {
      el.raiz.classList.remove('aberta');
      el.caixa.hidden = true;
      el.botao.setAttribute('aria-expanded', 'false');
      el.input.value = '';
      cache = null;
    }
    const aberta = () => !el.caixa.hidden;
    function escolher(i) {
      const r = resultados[i];
      if (!r) return;
      fechar();
      aoEscolher(r);
    }

    el.botao.addEventListener('click', () => (aberta() ? fechar() : abrir()));
    el.input.addEventListener('input', () => { ativo = el.input.value.trim() ? 0 : -1; desenhar(); });
    el.lista.addEventListener('pointerdown', (e) => e.preventDefault()); // não tira o foco do campo
    el.lista.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) escolher(Number(li.dataset.i)); });
    el.lista.addEventListener('mousemove', (e) => {
      const li = e.target.closest('[data-i]');
      if (li && Number(li.dataset.i) !== ativo) { ativo = Number(li.dataset.i); desenhar(); }
    });
    // Teclas do campo na captura da janela: o Esc fecha a busca antes de fechar gaveta ou tela.
    window.addEventListener('keydown', (e) => {
      if (!aberta()) {
        const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
        if (e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey) { e.preventDefault(); abrir(); }
        return;
      }
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); fechar(); el.botao.focus(); return; }
      if (document.activeElement !== el.input) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!resultados.length) return;
        ativo = (ativo + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
        desenhar();
        const li = el.lista.querySelector('.ativo');
        if (li) li.scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); escolher(ativo >= 0 ? ativo : 0); }
    }, true);
    document.addEventListener('pointerdown', (e) => { if (aberta() && !el.raiz.contains(e.target)) fechar(); });
    // X do campo: no toque não há Esc e a lupa fica escondida enquanto a busca está aberta.
    if (el.fechar) el.fechar.addEventListener('click', () => { fechar(); el.botao.focus(); });
    // Sair pelo Tab fecha. Só quando o foco foi para outro controle: trocar de janela deixa o foco
    // no campo e um clique fora já fecha pelo pointerdown acima.
    el.raiz.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (aberta() && a && a !== document.body && !el.raiz.contains(a)) fechar();
      }, 0);
    });

    return { abrir, fechar, aberta };
  };
})(window.GC = window.GC || {});
