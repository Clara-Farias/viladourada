(function (GC) {
  // Evolução de cada secretaria: série de 12 meses (nov/2025 a out/2026) com meta, projeção
  // e marco de ação, metas do plano de governo, orçamento e unidades. Escrito à mão, mas
  // coerente: a variação da série no período da tendência bate com GC.data.tendencias.
  const mesesSerie = GC.relogio.meses(12); // 12 meses fechados até o mês passado

  // Variação que a série mostra no período da tendência: p.p. para indicadores em %,
  // trimestre contra trimestre quando o rótulo diz "trimestre", senão mês contra mês em %.
  GC.variacaoSerie = function (serie, rotuloTendencia) {
    const m = serie.meses;
    if (serie.unidade === '%') return m[11] - m[10];
    if (/trimestre/i.test(rotuloTendencia)) {
      const soma = (a, b) => m.slice(a, b).reduce((s, n) => s + n, 0);
      return (soma(9, 12) / soma(6, 9) - 1) * 100;
    }
    return (m[11] / m[10] - 1) * 100;
  };

  const ubs = GC.data.series.lotacaoUbs;
  const ESPERA_UBS = { centro: 100, vila_nova: 82, porto_dourado: 68, lagoa_azul: 61, alto_da_serra: 55, bela_vista: 44 };
  const situacaoLotacao = (pct) => (pct >= 90 ? 'critica' : pct >= 80 ? 'atencao' : 'ok');

  // Segurança: os 6 primeiros meses da série são escritos aqui; os 6 últimos vêm de criminalidadeMensal, que
  // cidade.js escala com os B.O.s da cidade. O mesmo fator vale para os 6 primeiros (sem degrau no meio do gráfico).
  const K_SEG = (GC.cidade && GC.cidade.kSeguranca) || 1;
  const seg = (v) => Math.round(v * K_SEG);

  const secretarias = {
    infraestrutura: {
      titular: 'Secretário(a) de Obras e Infraestrutura',
      orcamento: { dotacaoMi: 140.2, executadoPct: 61 },
      tendencia: 'Quedas de energia (mês)',
      pulsoRotulo: 'Quedas de energia',
      serie: { rotulo: 'Quedas de energia por mês', unidade: 'ocorrências', meses: [9, 8, 10, 9, 11, 10, 12, 10, 11, 12, 11, 13], meta: 8, projecao: [12, 11] },
      indicadores: [
        { rotulo: 'Obras atrasadas', valor: `${GC.obras.resumo().atrasadas}`, variacao: `de ${GC.obras.resumo().emAndamento} em andamento · ${GC.obras.resumo().atrasoMedioDias} dias de atraso médio`, bom: false },
        { rotulo: 'Buracos tapados no mês', valor: '214', variacao: '+18%', bom: true },
        { rotulo: 'Iluminação funcionando', valor: '93%', variacao: '-1 p.p.', bom: false },
      ],
      metas: [
        { titulo: 'Trocar 100% da iluminação por LED', progressoPct: 64, prazo: 'dez/2026', status: 'em_dia' },
        { titulo: 'Recapear 40 km de vias', progressoPct: 38, prazo: 'jun/2026', status: 'critico' },
        { titulo: 'Rede subterrânea no Centro', progressoPct: 22, prazo: 'dez/2027', status: 'atencao' },
      ],
      unidades: [
        { nome: 'Galeria pluvial Rua XV', bairroId: 'centro', metricas: [{ rotulo: 'avanço', valor: '45%' }, { rotulo: 'atraso', valor: '38 dias' }], situacao: 'critica' },
        { nome: 'Recapeamento Av. Dourada', bairroId: 'bela_vista', metricas: [{ rotulo: 'avanço', valor: '72%' }, { rotulo: 'atraso', valor: '12 dias' }], situacao: 'atencao' },
        { nome: 'Subestação Vila Nova', bairroId: 'vila_nova', metricas: [{ rotulo: 'avanço', valor: '30%' }, { rotulo: 'atraso', valor: '21 dias' }], situacao: 'atencao' },
        { nome: 'Praça das Flores (LED)', bairroId: 'jardim_das_flores', metricas: [{ rotulo: 'avanço', valor: '100%' }, { rotulo: 'atraso', valor: '—' }], situacao: 'ok' },
      ],
    },
    defesa_civil: {
      titular: 'Coordenador(a) Municipal de Defesa Civil',
      orcamento: { dotacaoMi: 18.6, executadoPct: 79 },
      tendencia: 'Alagamentos (mês)',
      pulsoRotulo: 'Alagamentos',
      serie: { rotulo: 'Alagamentos por mês', unidade: 'casos', meses: [3, 5, 6, 4, 3, 2, 1, 1, 1, 2, 4, 5], meta: 3, projecao: [6, 5] },
      indicadores: [
        { rotulo: 'Áreas de risco monitoradas', valor: '14', variacao: '+2 no ano', bom: true },
        { rotulo: 'Tempo de resposta', valor: '22 min', variacao: '-4 min', bom: true },
        { rotulo: 'Famílias em risco alto (próximas 6 h)', valor: `${GC.risco.resumo(GC.data.ocorrencias).familiasRiscoAlto}`, variacao: `de 312 em área de risco · ${GC.data.risco.previsao.janelas[3].mm} mm previstos em 24 h`, bom: false },
      ],
      metas: [
        { titulo: 'Sirenes em todas as áreas de risco', progressoPct: 71, prazo: 'mar/2026', status: 'atencao' },
        { titulo: 'Limpar 100% das galerias antes das chuvas', progressoPct: 58, prazo: 'nov/2026', status: 'critico' },
        { titulo: 'Plano de contingência atualizado', progressoPct: 100, prazo: 'jul/2026', status: 'concluida' },
      ],
      unidades: [
        { nome: 'Encosta do Alto da Serra', bairroId: 'alto_da_serra', metricas: [{ rotulo: 'risco', valor: 'alto' }, { rotulo: 'famílias', valor: '86' }], situacao: 'critica' },
        { nome: 'Margem da lagoa', bairroId: 'lagoa_azul', metricas: [{ rotulo: 'risco', valor: 'médio' }, { rotulo: 'famílias', valor: '140' }], situacao: 'atencao' },
        { nome: 'Baixada da Rua XV', bairroId: 'centro', metricas: [{ rotulo: 'risco', valor: 'médio' }, { rotulo: 'famílias', valor: '62' }], situacao: 'atencao' },
        { nome: 'Base Porto Dourado', bairroId: 'porto_dourado', metricas: [{ rotulo: 'risco', valor: 'baixo' }, { rotulo: 'famílias', valor: '24' }], situacao: 'ok' },
      ],
    },
    saude: {
      titular: 'Secretário(a) de Saúde',
      orcamento: { dotacaoMi: 298.6, executadoPct: 74 },
      tendencia: 'Tempo de espera nas UBS',
      pulsoRotulo: 'Espera nas UBS',
      serie: { rotulo: 'Espera média nas UBS', unidade: 'min', meses: [82, 80, 79, 81, 78, 76, 74, 62, 60, 63, 65, 71], meta: 60, projecao: [68, 64], marco: { mes: 7, texto: 'Lembretes por WhatsApp ativados' } },
      indicadores: [
        { rotulo: 'Leitos ocupados (rede)', valor: `${GC.leitos.resumo().pct}%`, variacao: `UTI ${GC.leitos.resumo().utiPct}% · ${GC.leitos.resumo().utiLivres} vagas`, bom: false },
        { rotulo: 'Medicamentos em falta nas UBS', valor: `${GC.medicamentos.resumo().rupturas}`, variacao: `IA prevê mais ${GC.medicamentos.resumo().vaoFaltar.length} antes da reposição`, bom: false },
        { rotulo: 'Lotação média das UBS', valor: '70%', variacao: '+4 p.p.', bom: false },
      ],
      metas: [
        { titulo: 'Reduzir a espera nas UBS para 60 min', progressoPct: 55, prazo: 'dez/2026', status: 'atencao' },
        { titulo: 'Lembrete por WhatsApp em todas as UBS', progressoPct: 100, prazo: 'jun/2026', status: 'concluida' },
        { titulo: 'Inaugurar a UBS Bela Vista', progressoPct: 100, prazo: 'out/2026', status: 'concluida' },
      ],
      unidades: ubs.map((u) => ({
        nome: u.nome,
        bairroId: u.bairroId,
        metricas: [{ rotulo: 'lotação', valor: `${u.pct}%` }, { rotulo: 'espera', valor: `${ESPERA_UBS[u.bairroId]} min` }],
        situacao: situacaoLotacao(u.pct),
      })),
    },
    educacao: {
      titular: 'Secretário(a) de Educação',
      orcamento: { dotacaoMi: 331.9, executadoPct: 78 },
      tendencia: 'Frequência escolar',
      pulsoRotulo: 'Frequência escolar',
      serie: { rotulo: 'Frequência escolar média', unidade: '%', meses: [94, 95, 94, 92, 93, 94, 93, 92, 91, 92, 93, 95], meta: 96, projecao: [95, 96] },
      indicadores: [
        { rotulo: 'Fila de creche', valor: '312', variacao: '+24 no mês', bom: false },
        { rotulo: 'Professores faltando', valor: `${GC.educacao.resumo().faltando}`, variacao: `${GC.educacao.resumo().aulasPerdidasSemana} aulas perdidas por semana`, bom: false },
        { rotulo: 'Transporte escolar no horário', valor: '88%', variacao: '+2 p.p.', bom: true },
      ],
      metas: [
        { titulo: 'Abrir 300 vagas de creche', progressoPct: 40, prazo: 'dez/2026', status: 'critico' },
        { titulo: 'Matrícula 100% online', progressoPct: 100, prazo: 'fev/2026', status: 'concluida' },
        { titulo: 'Climatizar todas as escolas', progressoPct: 62, prazo: 'dez/2027', status: 'em_dia' },
      ],
      unidades: [
        { nome: 'Escola Lagoa Azul', bairroId: 'lagoa_azul', metricas: [{ rotulo: 'frequência', valor: '91%' }, { rotulo: 'ocupação', valor: '104%' }], situacao: 'critica' },
        { nome: 'Escola Alto da Serra', bairroId: 'alto_da_serra', metricas: [{ rotulo: 'frequência', valor: '93%' }, { rotulo: 'ocupação', valor: '96%' }], situacao: 'atencao' },
        { nome: 'CMEI Vila Nova', bairroId: 'vila_nova', metricas: [{ rotulo: 'frequência', valor: '94%' }, { rotulo: 'fila', valor: '88 crianças' }], situacao: 'critica' },
        { nome: 'Escola Centro', bairroId: 'centro', metricas: [{ rotulo: 'frequência', valor: '96%' }, { rotulo: 'ocupação', valor: '89%' }], situacao: 'ok' },
        { nome: 'Escola Parque Industrial', bairroId: 'parque_industrial', metricas: [{ rotulo: 'frequência', valor: '98%' }, { rotulo: 'ocupação', valor: '81%' }], situacao: 'ok' },
      ],
    },
    seguranca: {
      titular: 'Comandante da Guarda Municipal',
      orcamento: { dotacaoMi: 46.1, executadoPct: 81 },
      tendencia: 'Criminalidade (trimestre)',
      pulsoRotulo: 'Ocorrências',
      serie: { rotulo: 'Ocorrências de segurança por mês', unidade: 'ocorrências', meses: [...[430, 425, 418, 440, 428, 420].map(seg), ...GC.data.series.criminalidadeMensal.valores], meta: seg(340), projecao: [seg(355), seg(348)] },
      indicadores: [
        { rotulo: 'Câmeras funcionando', valor: '92%', variacao: '-3 p.p.', bom: false },
        { rotulo: 'Tempo de chegada da Guarda', valor: '11 min', variacao: '-2 min', bom: true },
        { rotulo: 'Violência contra mulheres e crianças', valor: `${GC.seguranca.resumo().violencia.mes} casos`, variacao: `${GC.seguranca.resumo().violencia.variacaoPct > 0 ? '+' : ''}${GC.seguranca.resumo().violencia.variacaoPct}% no mês`, bom: false },
      ],
      metas: [
        { titulo: 'Reduzir ocorrências em 20%', progressoPct: 45, prazo: 'dez/2026', status: 'atencao' },
        { titulo: 'Câmeras em todas as praças', progressoPct: 80, prazo: 'mar/2026', status: 'em_dia' },
        { titulo: 'Base da Guarda no Porto', progressoPct: 100, prazo: 'out/2026', status: 'concluida' },
      ],
      unidades: [
        { nome: 'Base Central', bairroId: 'centro', metricas: [{ rotulo: 'ocorrências/mês', valor: '118' }, { rotulo: 'chegada', valor: '9 min' }], situacao: 'atencao' },
        { nome: 'Base Porto Dourado', bairroId: 'porto_dourado', metricas: [{ rotulo: 'ocorrências/mês', valor: '42' }, { rotulo: 'chegada', valor: '12 min' }], situacao: 'ok' },
        { nome: 'Central de videomonitoramento', bairroId: 'parque_industrial', metricas: [{ rotulo: 'câmeras', valor: '146' }, { rotulo: 'offline', valor: '12' }], situacao: 'atencao' },
      ],
    },
    mobilidade: {
      titular: 'Secretário(a) de Mobilidade',
      orcamento: { dotacaoMi: 64.5, executadoPct: 70 },
      tendencia: 'Tempo médio de deslocamento',
      pulsoRotulo: 'Deslocamento médio',
      serie: { rotulo: 'Tempo médio de deslocamento', unidade: 'min', meses: [38, 37, 38, 39, 38, 36, 35, 35, 34, 35, 34, 32], meta: 30, projecao: [31, 30], marco: { mes: 5, texto: 'Faixa exclusiva na Av. Dourada' } },
      indicadores: [
        { rotulo: 'Frota de ônibus disponível', valor: `${GC.frota.resumo().onibus.disponibilidadePct}%`, variacao: `meta do contrato ${GC.frota.resumo().onibus.metaDisponibilidadePct}% · ${GC.frota.resumo().onibus.corretiva} em manutenção`, bom: GC.frota.resumo().onibus.disponibilidadePct >= GC.frota.resumo().onibus.metaDisponibilidadePct },
        { rotulo: 'Passageiros por dia', valor: '96 mil', variacao: '+5%', bom: true },
        { rotulo: 'Semáforos com falha', valor: '7', variacao: '+2', bom: false },
      ],
      metas: [
        { titulo: 'Faixas exclusivas em 3 avenidas', progressoPct: 67, prazo: 'dez/2026', status: 'em_dia' },
        { titulo: 'Semáforos inteligentes no Centro', progressoPct: 35, prazo: 'jun/2026', status: 'critico' },
        { titulo: 'Bilhete único digital', progressoPct: 100, prazo: 'ago/2026', status: 'concluida' },
      ],
      unidades: [
        { nome: 'Linha 102', bairroId: 'jardim_das_flores', metricas: [{ rotulo: 'pontualidade', valor: '72%' }, { rotulo: 'passageiros/dia', valor: '8,4 mil' }], situacao: 'atencao' },
        { nome: 'Linha 210', bairroId: 'bela_vista', metricas: [{ rotulo: 'pontualidade', valor: '89%' }, { rotulo: 'passageiros/dia', valor: '12,1 mil' }], situacao: 'ok' },
        { nome: 'Linha 330', bairroId: 'porto_dourado', metricas: [{ rotulo: 'pontualidade', valor: '64%' }, { rotulo: 'passageiros/dia', valor: '6,2 mil' }], situacao: 'critica' },
        { nome: 'Central de tráfego', bairroId: 'centro', metricas: [{ rotulo: 'semáforos', valor: '84' }, { rotulo: 'com falha', valor: '7' }], situacao: 'atencao' },
      ],
    },
    limpeza: {
      titular: 'Diretor(a) de Limpeza Urbana',
      orcamento: { dotacaoMi: 52.3, executadoPct: 77 },
      tendencia: 'Coleta no prazo',
      pulsoRotulo: 'Coleta no prazo',
      serie: { rotulo: 'Coleta realizada no prazo', unidade: '%', meses: [90, 91, 89, 90, 92, 93, 92, 91, 93, 92, 92, 87], meta: 95, projecao: [88, 90] },
      indicadores: [
        { rotulo: 'Coleta seletiva', valor: '18%', variacao: 'meta 30%', bom: false },
        { rotulo: 'Pontos de descarte irregular', valor: '27', variacao: '+4', bom: false },
        { rotulo: 'Rotas de coleta atrasadas hoje', valor: `${GC.coleta.resumo().atrasadas.length}`, variacao: `${GC.coleta.resumo().emAndamento.length} caminhão(ões) na rua agora`, bom: !GC.coleta.resumo().atrasadas.length },
      ],
      metas: [
        { titulo: 'Coleta seletiva em 30% dos domicílios', progressoPct: 60, prazo: 'dez/2026', status: 'atencao' },
        { titulo: 'Ecopontos em todos os bairros', progressoPct: 25, prazo: 'dez/2026', status: 'critico' },
        { titulo: 'Novo contrato de coleta', progressoPct: 100, prazo: 'mai/2026', status: 'concluida' },
      ],
      unidades: [
        { nome: 'Rota de coleta Porto', bairroId: 'porto_dourado', metricas: [{ rotulo: 'no prazo', valor: '61%' }, { rotulo: 'atraso médio', valor: '3 dias' }], situacao: 'critica' },
        { nome: 'Rota de coleta Vila Nova', bairroId: 'vila_nova', metricas: [{ rotulo: 'no prazo', valor: '84%' }, { rotulo: 'atraso médio', valor: '1 dia' }], situacao: 'atencao' },
        { nome: 'Rota de coleta Centro', bairroId: 'centro', metricas: [{ rotulo: 'no prazo', valor: '96%' }, { rotulo: 'atraso médio', valor: '—' }], situacao: 'ok' },
        { nome: 'Ecoponto Parque Industrial', bairroId: 'parque_industrial', metricas: [{ rotulo: 'toneladas/mês', valor: '48' }, { rotulo: 'ocupação', valor: '62%' }], situacao: 'ok' },
      ],
    },
  };

  // De onde vem cada indicador (aparece no cartão do Pulso e na página da secretaria).
  const FONTES = {
    infraestrutura: 'Concessionária de energia + sistema de obras (integração)',
    defesa_civil: 'Sensores pluviométricos + vistorias da Defesa Civil',
    saude: 'Sistema de regulação e prontuário das UBS',
    educacao: 'Diário de classe eletrônico da rede municipal',
    seguranca: 'Boletins de ocorrência (Polícia Civil) + Guarda Municipal',
    mobilidade: 'Central de tráfego + GPS dos ônibus',
    limpeza: 'GPS dos caminhões de coleta',
  };
  Object.entries(FONTES).forEach(([a, f]) => { secretarias[a].fonte = f; });

  // Séries de contagem (quedas de energia, alagamentos) crescem com os casos da cidade, como o histórico de 30 dias.
  const razao = (GC.cidade && GC.cidade.razaoCasos) || {};
  Object.entries(secretarias).forEach(([a, s]) => {
    const k = razao[a];
    if (!k || a === 'seguranca' || s.serie.unidade === '%' || s.serie.unidade === 'min') return;
    const esc = (v) => Math.max(1, Math.round(v * k));
    s.serie.meses = s.serie.meses.map(esc);
    s.serie.meta = esc(s.serie.meta);
    if (s.serie.projecao) s.serie.projecao = s.serie.projecao.map(esc);
  });

  // Tendências saem das séries: um número, uma fonte. O Pulso, o Resumo do dia e o Copiloto mostram o mesmo valor.
  Object.entries(secretarias).forEach(([area, s]) => {
    const t = GC.data.tendencias.find((x) => x.area === area && x.rotulo === s.tendencia);
    if (!t) return;
    const melhorSobe = (t.variacao > 0) === t.positivo; // a direção boa, lida do que foi escrito à mão
    const v = Math.round(GC.variacaoSerie(s.serie, t.rotulo));
    t.variacao = v;
    t.valor = s.serie.unidade === '%' ? `${s.serie.meses[11]}%` : `${v > 0 ? '+' : ''}${v}%`;
    t.positivo = v === 0 ? true : (v > 0) === melhorSobe;
  });

  Object.assign(GC.data, { secretarias, mesesSerie });
  if (GC.cidade) GC.cidade.ajustarSecretarias(); // cidade pequena: unidades de bairros que sumiram vão para o vizinho
})(window.GC = window.GC || {});
