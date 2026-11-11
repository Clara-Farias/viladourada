(function (GC) {
  // Verificador de consistência: confere se o mesmo número bate em todas as telas e se as proporções por
  // habitante estão numa faixa plausível. Roda no painel (Administração → Consistência dos dados) e nos testes.
  // Serve sobretudo para quando a base mudar: aponta na hora o que deixou de bater.
  const soma = (a) => a.reduce((s, n) => s + n, 0);
  const fmt = (n, c = 0) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: c });

  GC.verificarConsistencia = function (store) {
    const D = GC.data;
    const checagens = [];
    // tipo: 'igual' (tem que bater) · 'limite' (a ≤ b) · 'definicao' (diferença esperada, só explicada)
    const add = (grupo, nome, a, b, ok, onde, nota = '') => checagens.push({ grupo, nome, a, b, ok, onde, nota });

    const k = store.kpis();
    const at = store.atencao().todas;
    const d = store.desempenho(null);
    const casos = soma(D.areas.map((a) => soma(Object.values(D.historico30d[a.id] || {}))));
    add('Ocorrências', 'Críticas: cabeçalho × Resumo do dia', `${k.criticas} críticas abertas`, `${at.filter((o) => o.severidade === 'critica').length} delas entre os alertas`, true,
      'Topo do painel · Resumo do dia', 'Definição: o Resumo mostra quantas das críticas precisam do prefeito.');
    if (GC.montarRelatorio) {
      const rel = GC.montarRelatorio(store, { tipo: 'executivo', alvo: '-', periodo: '30' });
      const kv = (rot) => (rel.kpis.find((x) => x.rotulo.startsWith(rot)) || {}).valor;
      const n = (v) => Number(String(v).replace(/[^\d]/g, ''));
      add('Ocorrências', 'Alertas: gaveta × relatório executivo', at.length, n(kv('Precisam')), at.length === n(kv('Precisam')), 'Alertas · Relatórios');
      add('Ocorrências', 'Resolvidas em 30 dias: desempenho × relatório', d.resumo.resolvidas, n(kv('Resolvidas')), d.resumo.resolvidas === n(kv('Resolvidas')), 'Secretarias · Relatórios');
      const dot = soma(D.areas.map((a) => D.secretarias[a.id].orcamento.dotacaoMi));
      add('Orçamento', 'Orçamento: soma das secretarias × relatório', `R$ ${fmt(dot, 1)} mi`, kv('Orçamento'), String(kv('Orçamento')).includes(fmt(dot, 1)), 'Secretarias · Relatórios');
    }
    add('Ocorrências', 'Resolvidas ≤ casos registrados em 30 dias', d.resumo.resolvidas, casos, d.resumo.resolvidas <= casos, 'Secretarias');
    if (GC.seguranca) {
      const bo = GC.seguranca.resumo();
      add('Segurança', 'B.O.s de 30 dias: mapa × Pulso', bo.total30d, D.secretarias.seguranca.serie.meses[11], bo.total30d === D.secretarias.seguranca.serie.meses[11], 'Widget Segurança · Pulso');
      if (D.cruzamento) add('Segurança', 'B.O.s de 30 dias: mapa × cruzamento', bo.total30d, D.cruzamento.cidade.bos[11], bo.total30d === D.cruzamento.cidade.bos[11], 'Widget Segurança · Cruzamento');
    }
    const pulsoOk = D.areas.every((a) => {
      const s = D.secretarias[a.id]; const t = D.tendencias.find((x) => x.area === a.id && x.rotulo === s.tendencia);
      return !t || Math.abs(Math.round(GC.variacaoSerie(s.serie, t.rotulo)) - t.variacao) <= 1;
    });
    add('Secretarias', 'Pulso: variação = série de 12 meses da secretaria', pulsoOk ? 'todas' : 'divergem', '7 secretarias', pulsoOk, 'Pulso · página da secretaria');
    if (D.cruzamento) {
      const X = D.cruzamento;
      const somaOk = ['alagamentos', 'quedas', 'bos'].every((ind) => X.cidade[ind].every((v, m) => v === soma(D.bairros.map((b) => X.porBairro[ind][b.id][m]))));
      add('Cruzamento', 'Soma dos bairros = total da cidade, mês a mês', somaOk ? 'sim' : 'não', '3 indicadores × 12 meses', somaOk, 'Cruzamento de dados');
      add('Cruzamento', 'Alagamentos: Defesa Civil × cruzamento', D.secretarias.defesa_civil.serie.meses[11], X.cidade.alagamentos[11], D.secretarias.defesa_civil.serie.meses[11] === X.cidade.alagamentos[11], 'Defesa Civil · Cruzamento');
      if (GC.leitos) add('Saúde', 'Ocupação hospitalar: leitos × cruzamento', `${GC.leitos.resumo().pct}%`, `${Math.round(X.cidade.ocupacao[11])}%`, GC.leitos.resumo().pct === Math.round(X.cidade.ocupacao[11]), 'Widget Leitos · Cruzamento');
    }
    if (GC.coleta) add('Limpeza', 'Coleta: mês fechado × últimos 30 dias', `${D.secretarias.limpeza.serie.meses[11]}%`, `${GC.coleta.resumo().noPrazoPct}%`, true, 'Pulso · widget Coleta', 'Definição: períodos diferentes, os dois rotulados.');
    const exced = D.ocorrencias.filter((o) => { const b = D.bairros.find((x) => x.id === o.bairroId); return b && o.afetados > b.populacao; }).length;
    add('Bairros', 'Pessoas afetadas ≤ população do bairro', `${exced} acima`, '0', exced === 0, 'Ocorrências');
    const semSat = D.bairros.filter((b) => D.satisfacaoPorBairro[b.id] == null).length;
    add('Bairros', 'Todo bairro tem satisfação', `${semSat} sem dado`, '0', semSat === 0, 'Satisfação por bairro');

    // ---- proporções por habitante (faixas de ordem de grandeza para uma demonstração crível) ----
    const pop = soma(D.bairros.map((b) => b.populacao));
    const prop = [];
    const faixa = (nome, valor, unidade, min, max, ref) => prop.push({ nome, valor, unidade, min, max, ok: valor >= min && valor <= max, ref });
    const dot = soma(D.areas.map((a) => D.secretarias[a.id].orcamento.dotacaoMi));
    faixa('Orçamento das secretarias por habitante', Math.round((dot * 1e6) / pop), 'R$', 2000, 6000, 'gasto municipal típico de alguns mil reais por habitante (conferir no Siconfi)');
    if (GC.leitos) faixa('Leitos por mil habitantes', +((GC.leitos.resumo().total / pop) * 1000).toFixed(2), 'por mil', 1.8, 3.5, 'parâmetro de planejamento: 2,5 a 3 por mil');
    if (GC.seguranca) faixa('B.O.s por mil habitantes por mês', +((GC.seguranca.resumo().total30d / pop) * 1000).toFixed(2), 'por mil', 1, 5, 'mesma taxa nos três portes');
    faixa('Casos registrados em 30 dias por 100 mil', Math.round((casos / pop) * 1e5), 'por 100 mil', 80, 180, 'mesma taxa nos três portes');
    if (D.educacao && D.educacao.escolas) faixa('População matriculada na rede municipal', +((soma(D.educacao.escolas.map((e) => e.alunos || 0)) / pop) * 100).toFixed(1), '%', 5, 15, 'conferir no Censo Escolar (INEP)');
    if (D.frota) {
      const onibus = soma(D.frota.garagens.map((g) => g.operando + g.reserva + g.corretiva + g.preventiva));
      faixa('Ônibus por mil habitantes', +((onibus / pop) * 1000).toFixed(2), 'por mil', 0.3, 1.2, 'frota urbana típica');
    }
    const erros = checagens.filter((c) => !c.ok).length + prop.filter((p) => !p.ok).length;
    return { checagens, proporcoes: prop, erros, populacao: pop, cidade: GC.cidade ? GC.cidade.nome : '' };
  };
})(window.GC = window.GC || {});
