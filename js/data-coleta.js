(function (GC) {
  // Coleta de lixo: rotas dos caminhões (domiciliar e seletiva), os bairros que cada uma atende, dias e horário,
  // a situação de hoje (com a posição do caminhão) e o calendário por bairro, que é o que o cidadão quer saber.
  // Pedidos do workshop de 04/11 (Victor, Felipe, Ana). Coerente com as unidades da Limpeza Urbana (Rota Porto
  // 61% no prazo e 3 dias de atraso = oc-22; Vila Nova 84%; Centro 96%) e com a série "Coleta no prazo" (87%).
  // Spec: docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md.
  const DATA_REF = GC.relogio.hoje; // escrito numa quinta; os dias das rotas giram junto (abaixo)
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const NOME_DIA = { dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado' };

  // hoje: só vale nos dias da rota. status: agendada | em_andamento | concluida | atrasada (caminhão parado).
  const r = (id, nome, tipo, caminhao, bairros, dias, horario, noPrazoPct, atrasoMedioDias, toneladasMes, hoje, ocorrenciaId = null) =>
    ({ id, nome, tipo, caminhao, bairros, dias, horario, noPrazoPct, atrasoMedioDias, toneladasMes, hoje, ocorrenciaId });
  const rotas = [
    r('rota-porto', 'Rota Porto e Parque Industrial', 'domiciliar', 'Caminhão C-14', ['porto_dourado', 'parque_industrial'], ['ter', 'qui', 'sab'], '07h–13h', 61, 3, 410,
      { status: 'atrasada', progressoPct: 15, motivo: 'Caminhão quebrado há 2 dias; sem coleta no Porto há 3 dias' }, 'oc-22'),
    r('rota-vila-nova', 'Rota Vila Nova e Jardim das Flores', 'domiciliar', 'Caminhão C-09', ['vila_nova', 'jardim_das_flores'], ['seg', 'qua', 'sex'], '07h–13h', 84, 1, 520, null),
    r('rota-bela-serra', 'Rota Bela Vista e Alto da Serra', 'domiciliar', 'Caminhão C-11', ['bela_vista', 'alto_da_serra'], ['ter', 'qui', 'sab'], '07h–13h', 96, 0, 380,
      { status: 'em_andamento', progressoPct: 65 }),
    r('rota-centro', 'Rota Centro (noturna)', 'domiciliar', 'Caminhão C-02', ['centro'], ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'], '19h–01h', 96, 0, 690,
      { status: 'agendada', progressoPct: 0 }),
    r('rota-lagoa', 'Rota Lagoa Azul', 'domiciliar', 'Caminhão C-05', ['lagoa_azul'], ['seg', 'qua', 'sex'], '13h–19h', 93, 0, 300, null),
    r('seletiva-norte', 'Coleta seletiva Norte', 'seletiva', 'Caminhão S-01', ['alto_da_serra', 'bela_vista', 'jardim_das_flores', 'parque_industrial'], ['ter'], '08h–14h', 92, 0, 85, null),
    r('seletiva-sul', 'Coleta seletiva Sul', 'seletiva', 'Caminhão S-02', ['lagoa_azul', 'centro', 'vila_nova', 'porto_dourado'], ['qui'], '08h–14h', 88, 1, 70,
      { status: 'em_andamento', progressoPct: 40 }),
  ];

  // Rotas escritas para uma quinta: os dias giram para que as "rotas de hoje" caiam no dia real.
  rotas.forEach((x) => { x.dias = x.dias.map(GC.relogio.diaSemana); });
  GC.data.coleta = { rotas, dataRef: DATA_REF, dias: DIAS, nomeDia: NOME_DIA };

  // ---- cálculos ----
  const diaDaSemana = (iso) => DIAS[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];
  const ORDEM = { atrasada: 0, em_andamento: 1, agendada: 2, concluida: 3, sem_coleta_hoje: 4 };

  // Trajeto desenhável: pelos centros dos bairros (levemente deslocado das linhas de ônibus); rota de um
  // bairro só vira uma volta dentro dele.
  function trajeto(rota, bairros = GC.data.bairros, i = 0) {
    const centro = (id) => (bairros.find((b) => b.id === id) || {}).centro;
    const pts = rota.bairros.map(centro).filter(Boolean);
    const d = -0.0025 - (i % 3) * 0.0008;
    if (pts.length === 1) {
      const [lat, lng] = pts[0];
      const k = 0.0035 + (i % 2) * 0.001;
      return [[lat + k, lng - k], [lat + k, lng + k], [lat - k, lng + k], [lat - k, lng - k], [lat + k, lng - k]];
    }
    return pts.map(([lat, lng]) => [lat + d, lng + d]);
  }
  // Ponto a uma fração do trajeto (posição do caminhão).
  function pontoNoTrajeto(pts, fracao) {
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    let resto = Math.max(0, Math.min(1, fracao)) * seg.reduce((s, n) => s + n, 0);
    for (let i = 0; i < seg.length; i++) {
      if (resto <= seg[i] || i === seg.length - 1) {
        const t = seg[i] ? Math.min(1, resto / seg[i]) : 0;
        return [+(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t).toFixed(5), +(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t).toFixed(5)];
      }
      resto -= seg[i];
    }
    return pts[0];
  }

  function avaliar(x, hoje = DATA_REF) {
    const dia = diaDaSemana(hoje);
    const passaHoje = x.dias.includes(dia);
    const status = passaHoje ? (x.hoje ? x.hoje.status : 'agendada') : 'sem_coleta_hoje';
    const situacao = status === 'atrasada' || x.noPrazoPct < 80 ? 'critica' : x.noPrazoPct < 90 || x.atrasoMedioDias > 0 ? 'atencao' : 'ok';
    return Object.assign({}, x, { passaHoje, status, progressoPct: passaHoje && x.hoje ? x.hoje.progressoPct : 0, motivo: x.hoje && x.hoje.motivo, situacao });
  }

  // Próximo dia de coleta a partir de hoje (hoje conta se a rota de hoje ainda não terminou).
  function proximoDia(dias, hoje = DATA_REF, contaHoje = true) {
    const i = DIAS.indexOf(diaDaSemana(hoje));
    for (let n = contaHoje ? 0 : 1; n <= 7; n++) {
      const d = DIAS[(i + n) % 7];
      if (dias.includes(d)) return { dia: d, emDias: n };
    }
    return null;
  }
  const quando = (p) => (!p ? '—' : p.emDias === 0 ? 'hoje' : p.emDias === 1 ? 'amanhã' : NOME_DIA[p.dia]);

  // Calendário por bairro: dias e horário da domiciliar e da seletiva, e a próxima passagem do caminhão.
  function calendario(avaliadas, bairros = GC.data.bairros, hoje = DATA_REF) {
    return bairros.map((b) => {
      const doBairro = avaliadas.filter((x) => x.bairros.includes(b.id));
      const dom = doBairro.filter((x) => x.tipo === 'domiciliar');
      const sel = doBairro.filter((x) => x.tipo === 'seletiva');
      const dias = (lista) => DIAS.filter((d) => lista.some((x) => x.dias.includes(d)));
      const proxima = (lista) => {
        const pendenteHoje = lista.some((x) => x.passaHoje && x.status !== 'concluida');
        const p = proximoDia(dias(lista), hoje, pendenteHoje);
        return p ? Object.assign(p, { texto: quando(p) }) : null;
      };
      return {
        id: b.id, nome: b.nome,
        domiciliar: { dias: dias(dom), horario: [...new Set(dom.map((x) => x.horario))].join(' / '), proxima: proxima(dom) },
        seletiva: { dias: dias(sel), horario: [...new Set(sel.map((x) => x.horario))].join(' / '), proxima: proxima(sel) },
        atrasada: dom.some((x) => x.status === 'atrasada'),
        rotas: doBairro.map((x) => x.id),
      };
    });
  }

  function resumo(d = GC.data.coleta, hoje = DATA_REF) {
    const avaliadas = d.rotas.map((x) => avaliar(x, hoje))
      .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.noPrazoPct - b.noPrazoPct);
    const deHoje = avaliadas.filter((x) => x.passaHoje);
    const ton = avaliadas.reduce((s, x) => s + x.toneladasMes, 0);
    const tonSeletiva = avaliadas.filter((x) => x.tipo === 'seletiva').reduce((s, x) => s + x.toneladasMes, 0);
    const dom = avaliadas.filter((x) => x.tipo === 'domiciliar');
    return {
      diaHoje: diaDaSemana(hoje),
      rotas: avaliadas,
      deHoje,
      emAndamento: deHoje.filter((x) => x.status === 'em_andamento'),
      atrasadas: avaliadas.filter((x) => x.status === 'atrasada'),
      // No prazo (30 dias) ponderado pelo lixo recolhido na rota domiciliar.
      noPrazoPct: Math.round(dom.reduce((s, x) => s + x.noPrazoPct * x.toneladasMes, 0) / dom.reduce((s, x) => s + x.toneladasMes, 0)),
      toneladasMes: ton,
      seletivaPct: Math.round((tonSeletiva / ton) * 100),
      calendario: calendario(avaliadas, GC.data.bairros, hoje),
    };
  }

  GC.coleta = { resumo, avaliar, calendario, trajeto, pontoNoTrajeto, proximoDia, diaDaSemana };
})(window.GC = window.GC || {});
