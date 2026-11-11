(function (GC) {
  // Motor do cruzamento de dados (puro: sem DOM). Usado pela tela "Cruzamento de dados" e pelo agente de IA.
  // GC.cruzamento.cruzar('ocupacao', 'chuva', { meses: 3, recorte: 'cidade' | <regiao> }) → séries, correlação,
  // tabela por região e a leitura em frases curtas.
  const C = () => GC.data.cruzamento;
  const r1 = (n) => Math.round(n * 10) / 10;
  const soma = (a) => a.reduce((s, n) => s + n, 0);
  const media = (a) => (a.length ? soma(a) / a.length : 0);

  const ind = (id) => C().indicadores.find((i) => i.id === id);
  const regiao = (id) => C().regioes.find((r) => r.id === id);

  // Indicadores que o perfil pode cruzar: prefeito, todos; secretário, os da pasta + chuva (dado aberto).
  function indicadores(perfil = GC.perfil) {
    const todos = C().indicadores.filter((i) => !i.area || !GC.moduloAtivo || GC.moduloAtivo(i.area));
    if (!perfil || perfil.id === 'prefeito') return todos;
    if (perfil.id === 'cidadao') return [];
    return todos.filter((i) => !i.area || i.area === perfil.area);
  }

  // Série de 12 meses de um indicador num recorte (cidade ou região). null = sem dado (ex.: região sem hospital).
  function serie(id, recorte = 'cidade') {
    const c = C();
    return recorte === 'cidade' ? c.cidade[id].slice() : (c.porRegiao[id][recorte] || Array(12).fill(null)).slice();
  }

  // Valor de um período: soma para contagens, média para taxas.
  const doPeriodo = (i, valores) => {
    const v = valores.filter((x) => x != null);
    if (!v.length) return null;
    return i.agregacao === 'soma' ? soma(v) : r1(media(v));
  };

  function pearson(xs, ys) {
    const pares = xs.map((x, k) => [x, ys[k]]).filter(([x, y]) => x != null && y != null);
    if (pares.length < 3) return null;
    const mx = media(pares.map((p) => p[0]));
    const my = media(pares.map((p) => p[1]));
    let sxy = 0; let sxx = 0; let syy = 0;
    pares.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
    if (!sxx || !syy) return null;
    return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
  }

  function forca(r) {
    if (r == null) return { rotulo: 'dados insuficientes', nivel: 'nd' };
    const a = Math.abs(r);
    const sentido = r > 0 ? 'positiva' : 'negativa';
    if (a >= 0.7) return { rotulo: `forte e ${sentido}`, nivel: 'forte', sentido };
    if (a >= 0.4) return { rotulo: `moderada e ${sentido}`, nivel: 'moderada', sentido };
    if (a >= 0.2) return { rotulo: `fraca e ${sentido}`, nivel: 'fraca', sentido };
    return { rotulo: 'sem relação clara', nivel: 'nenhuma', sentido: null };
  }

  const fmt = (i, v) => {
    if (v == null) return '—';
    const n = Number(v).toLocaleString('pt-BR', { maximumFractionDigits: i.unidade === '%' || i.unidade === 'min' ? 1 : 0 });
    if (i.unidade === '%') return `${n}%`;
    if (i.unidade === 'mm') return `${n} mm`;
    if (i.unidade === 'min') return `${n} min`;
    return `${n} ${i.unidade}`;
  };
  const rNum = (r) => String(r).replace('.', ',');

  function cruzar(aId, bId, { meses = 3, recorte = 'cidade' } = {}) {
    const c = C();
    const A = ind(aId);
    const B = ind(bId);
    if (!A || !B) return null;
    const n = [3, 6, 12].includes(Number(meses)) ? Number(meses) : 3;
    const rec = recorte !== 'cidade' && regiao(recorte) ? recorte : 'cidade';
    const de = 12 - n;
    const rotulos = c.meses.slice(de);
    const serieA = serie(aId, rec).slice(de);
    const serieB = serie(bId, rec).slice(de);

    // Por região, no período (tabela) e mês a mês (pontos para a correlação entre regiões).
    const porRegiao = c.regioes.map((r) => {
      const a = serie(aId, r.id).slice(de);
      const b = serie(bId, r.id).slice(de);
      return { id: r.id, nome: r.nome, a: doPeriodo(A, a), b: doPeriodo(B, b), serieA: a, serieB: b };
    });
    // Cidade: cada região é comparada com ela mesma (variação mês a mês, padronizada) e os pontos se somam.
    // Assim uma região grande ou mais lotada não mascara o movimento conjunto; a diferença entre regiões
    // aparece na tabela.
    const padronizar = (s) => {
      const v = s.filter((x) => x != null);
      const m = media(v);
      const dp = Math.sqrt(media(v.map((x) => (x - m) ** 2)));
      return dp ? s.map((x) => (x == null ? null : (x - m) / dp)) : null;
    };
    const pontos = rec === 'cidade'
      ? porRegiao.flatMap((r) => {
        const za = padronizar(r.serieA);
        const zb = padronizar(r.serieB);
        return za && zb ? za.map((x, k) => [x, zb[k]]) : [];
      }).filter(([x, y]) => x != null && y != null)
      : serieA.map((x, k) => [x, serieB[k]]).filter(([x, y]) => x != null && y != null);
    // Com poucas regiões ou poucos meses, a correlação usa os 12 meses (diz isso na leitura).
    let base = rec === 'cidade' ? `a variação mês a mês em ${porRegiao.filter((r) => r.a != null && r.b != null).length} regiões × ${n} meses` : `${n} meses`;
    let r = pontos.length >= 6 ? pearson(pontos.map((p) => p[0]), pontos.map((p) => p[1])) : null;
    if (r == null) {
      r = pearson(serie(aId, rec), serie(bId, rec));
      base = '12 meses (o período escolhido tem poucos pontos)';
    }
    const f = forca(r);

    const leitura = [];
    const ini = (s) => s.find((v) => v != null);
    const fim = (s) => [...s].reverse().find((v) => v != null);
    const onde = rec === 'cidade' ? 'na cidade' : `na ${regiao(rec).nome}`;
    leitura.push(`Nos últimos ${n} meses ${onde}, ${A.nome.toLowerCase()} foi de ${fmt(A, ini(serieA))} (${rotulos[0]}) para ${fmt(A, fim(serieA))} (${rotulos[n - 1]}), e ${B.nome.toLowerCase()} de ${fmt(B, ini(serieB))} para ${fmt(B, fim(serieB))}.`);
    if (f.nivel === 'nd') leitura.push('Não há pontos suficientes para medir a relação entre os dois.');
    else if (f.nivel === 'nenhuma') leitura.push(`Considerando ${base}, os dois não andam juntos (r = ${rNum(r)}).`);
    else leitura.push(`Considerando ${base}, a relação é ${f.rotulo} (r = ${rNum(r)}): ${f.sentido === 'positiva' ? `${A.curto.toLowerCase()} e ${B.curto.toLowerCase()} sobem e descem juntos` : `quando ${A.curto.toLowerCase()} sobe, ${B.curto.toLowerCase()} tende a cair`}.`);
    const comDado = porRegiao.filter((x) => x.a != null && x.b != null);
    if (rec === 'cidade' && comDado.length > 1) {
      const topoB = comDado.slice().sort((x, y) => y.b - x.b)[0];
      const topoA = comDado.slice().sort((x, y) => y.a - x.a)[0];
      leitura.push(topoA.id === topoB.id
        ? `Entre as regiões com os dois dados, ${topoB.nome} lidera nos dois: ${fmt(A, topoA.a)} e ${fmt(B, topoB.b)} no período.`
        : `Maior ${B.curto.toLowerCase()} no período: ${topoB.nome} (${fmt(B, topoB.b)}). Maior ${A.curto.toLowerCase()}: ${topoA.nome} (${fmt(A, topoA.a)}).`);
    }
    const semDado = porRegiao.filter((x) => x.a == null || x.b == null);
    if (rec === 'cidade' && semDado.length) leitura.push(`Sem dado em ${semDado.map((x) => x.nome).join(', ')} (${[A, B].some((i) => i.id === 'ocupacao') ? 'não há hospital na região' : 'sem medição'}).`);
    leitura.push('Correlação mostra que os números andam juntos; não prova que um causa o outro.');

    return {
      a: A, b: B, meses: n, recorte: rec, recorteNome: rec === 'cidade' ? 'Cidade inteira' : regiao(rec).nome,
      rotulos, serieA, serieB, totalA: doPeriodo(A, serieA), totalB: doPeriodo(B, serieB),
      r, forca: f, base, porRegiao, leitura, fontes: [A.fonte, B.fonte].filter((x, k, l) => l.indexOf(x) === k),
    };
  }

  // Tabela do cruzamento (para CSV e para o "Dados").
  function linhas(res) {
    return res.rotulos.map((m, k) => [m, res.serieA[k], res.serieB[k]]);
  }

  // Pares prontos (atalhos da tela e ações do agente).
  const PRONTOS = [
    ['ocupacao', 'chuva', 'Ocupação hospitalar × chuva'],
    ['dengue', 'chuva', 'Dengue × chuva'],
    ['alagamentos', 'chuva', 'Alagamentos × chuva'],
    ['espera', 'dengue', 'Espera nas UBS × dengue'],
    ['bos', 'quedas', 'B.O.s × quedas de energia'],
  ];
  const prontos = (perfil = GC.perfil) => {
    const ok = new Set(indicadores(perfil).map((i) => i.id));
    return PRONTOS.filter(([a, b]) => ok.has(a) && ok.has(b)).map(([a, b, rotulo]) => ({ a, b, rotulo }));
  };

  // Lê "cruze ocupação hospitalar com chuva nos últimos 3 meses na região norte" → { a, b, meses, recorte }.
  function interpretar(texto, perfil = GC.perfil) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = ` ${norm(texto)} `;
    const lista = indicadores(perfil);
    const achados = lista
      .map((i) => ({ i, pos: Math.min(...i.chaves.map((k) => { const p = q.indexOf(k); return p < 0 ? Infinity : p; })) }))
      .filter((x) => x.pos !== Infinity)
      .sort((x, y) => x.pos - y.pos)
      .map((x) => x.i.id);
    let [a, b] = achados;
    if (!a) [a, b] = prontos(perfil)[0] ? [prontos(perfil)[0].a, prontos(perfil)[0].b] : [lista[0] && lista[0].id, 'chuva'];
    if (!b) b = a === 'chuva' ? (lista.find((i) => i.id !== 'chuva') || {}).id : 'chuva';
    const meses = /12 meses|ano|anual/.test(q) ? 12 : /6 meses|semestre/.test(q) ? 6 : 3;
    const reg = C().regioes.find((r) => q.includes(norm(r.nome)) || q.includes(` ${r.id} `) || q.includes(`regiao ${r.id}`) || q.includes(`zona ${r.id}`));
    return { a, b, meses, recorte: reg ? reg.id : 'cidade' };
  }

  GC.cruzamento = { indicadores, serie, cruzar, pearson, linhas, prontos, interpretar, formatar: fmt, indicador: ind, regiao };
})(window.GC = window.GC || {});
