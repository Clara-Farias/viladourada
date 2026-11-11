(function (GC) {
  // IA roteirizada. Ponto de integração: troque este arquivo pela IA real mantendo
  // GC.ia.perguntar(texto, contexto) e GC.ia.aoEvento(evento, contexto) → Resposta (ver spec).

  const SEVERIDADE = { critica: 'crítica', alta: 'alta', media: 'média' };
  const PESO_SEVERIDADE = { critica: 0, alta: 1, media: 2 };

  // ---- utilidades ----
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const area = (id) => GC.data.areas.find((a) => a.id === id);

  function ranking(contagem) {
    return Object.entries(contagem).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }

  function barraPorBairro(contagem, titulo, nomeSerie, unidade) {
    const r = ranking(contagem);
    return { tipo: 'barra', titulo, rotulos: r.map(([id]) => bairro(id).nome), series: [{ nome: nomeSerie, valores: r.map(([, n]) => n) }], unidade };
  }

  // Pontos de calor: histórico espalhado em volta do centro de cada bairro + ocorrências ativas da área.
  function calor(areaId, contexto, legenda) {
    const pontos = [];
    ranking(GC.data.historico30d[areaId]).forEach(([id, n]) => {
      const [lat, lng] = bairro(id).centro;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + n;
        const raio = 0.0015 + (i % 3) * 0.0015;
        pontos.push({ lat: +(lat + Math.sin(ang) * raio).toFixed(5), lng: +(lng + Math.cos(ang) * raio).toFixed(5), peso: 0.6 });
      }
    });
    (contexto.ocorrencias || []).filter((o) => o.area === areaId).forEach((o) => pontos.push({ lat: o.lat, lng: o.lng, peso: 1 }));
    const topo = ranking(GC.data.historico30d[areaId])[0];
    const [lat, lng] = bairro(topo[0]).centro;
    return { tipo: 'calor', pontos, foco: { lat, lng, zoom: 14 }, legenda };
  }

  // Ocorrência ativa mais grave que passa no filtro (ou undefined).
  function maisGrave(contexto, filtro) {
    return (contexto.ocorrencias || []).filter(filtro).sort((a, b) => PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade])[0];
  }

  function focarPrimeira(contexto, filtro) {
    const o = maisGrave(contexto, filtro);
    return o ? [{ rotulo: `Ver no mapa: ${o.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } }] : [];
  }

  const agora = (o) => (o ? ` Agora, o ponto mais urgente é: ${o.titulo} (${bairro(o.bairroId).nome}).` : '');

  // Indicadores do workshop de 04/11 (leitos, B.O.s, risco, obras, escolas): a ação liga a camada no mapa.
  const camada = (rotulo, nome, id) => ({ rotulo, tipo: 'abrirCamada', payload: id ? { camada: nome, id } : { camada: nome } });
  const unicos = (lista) => [...new Set(lista)];
  const sinal = (n) => `${n > 0 ? '+' : ''}${n}%`;
  const pct = (n) => `${Number(n).toLocaleString('pt-BR')}%`;
  const nomes = (lista) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0] || '');
  const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  // Coleta com as rotas carregadas. Pergunta que cita um bairro ("quando passa o caminhão no Centro?")
  // responde o calendário daquele bairro; sem bairro, a situação das rotas de hoje.
  function coletaDasRotas(ctx, pergunta) {
    const r = GC.coleta.resumo();
    const nomeDia = GC.data.coleta.nomeDia;
    const dias = (lista) => (lista.length === 6 && !lista.includes('dom') ? 'de segunda a sábado' : nomes(lista.map((d) => nomeDia[d])));
    const q = normalizar(pergunta);
    const citado = r.calendario.slice().sort((a, b) => b.nome.length - a.nome.length).find((b) => q.includes(normalizar(b.nome)));
    if (citado) {
      const rota = r.rotas.find((x) => x.id === citado.rotas.find((id) => r.rotas.find((y) => y.id === id && y.tipo === 'domiciliar')));
      const sel = citado.seletiva.dias.length ? ` Os recicláveis passam ${dias(citado.seletiva.dias)} (${citado.seletiva.horario}).` : ' O bairro ainda não tem coleta seletiva.';
      return {
        texto: `No ${citado.nome}, o lixo comum é recolhido ${dias(citado.domiciliar.dias)}, das ${citado.domiciliar.horario.replace('–', ' às ')}.${sel} ${citado.atrasada ? `Atenção: a coleta está atrasada${rota && rota.motivo ? ` (${minuscula(rota.motivo)})` : ''}.` : `A próxima passagem é ${citado.domiciliar.proxima ? citado.domiciliar.proxima.texto : 'sem data'}.`}`,
        mapa: { tipo: 'destaque', bairros: [citado.id], legenda: `Coleta em ${citado.nome}` },
        acoes: [camada(`Ver a rota de ${citado.nome} no mapa`, 'coleta', citado.id)],
      };
    }
    const atrasada = r.atrasadas[0];
    const oc = atrasada && atrasada.ocorrenciaId && (ctx.ocorrencias || []).find((x) => x.id === atrasada.ocorrenciaId);
    return {
      texto: `Hoje (${nomeDia[r.diaHoje]}) ${r.deHoje.length} rotas têm coleta e ${r.emAndamento.length} caminhão(ões) estão na rua.${atrasada ? ` A ${atrasada.nome} está atrasada: ${minuscula(atrasada.motivo || 'sem motivo informado')}.` : ' Nenhuma rota atrasada.'} No mês, ${r.noPrazoPct}% das coletas saíram no prazo (meta 95%) e ${r.seletivaPct}% do lixo foi para a seletiva. Pergunte "quando passa o caminhão no Centro?" para ver o calendário de um bairro.`,
      grafico: { tipo: 'barra', titulo: 'Coletas no prazo por rota (30 dias)', rotulos: r.rotas.map((x) => x.nome), series: [{ nome: 'No prazo', valores: r.rotas.map((x) => x.noPrazoPct) }], unidade: '%' },
      ...(r.atrasadas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.atrasadas.flatMap((x) => x.bairros)), legenda: 'Bairros com coleta atrasada' } } : {}),
      acoes: [...(atrasada ? [camada(`Ver a ${atrasada.nome} no mapa`, 'coleta', atrasada.id)] : [camada('Ver as rotas no mapa', 'coleta')]), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
    };
  }

  // Educação com a rede escolar carregada: professores faltando, escola mais grave, evasão e escolaridade.
  function educacaoDaRede(ctx) {
    const r = GC.educacao.resumo();
    const top = r.escolas[0];
    const PROSA = {
      professor: () => `faltam ${top.faltando} professores`,
      evasao: () => `a evasão chegou a ${pct(top.evasaoPct)}`,
      frequencia: () => `a frequência caiu para ${top.frequenciaPct}%`,
      fila: () => `há ${top.fila} crianças na fila`,
      lotacao: () => `está com ${top.ocupacaoPct}% da capacidade`,
    };
    const motivos = top.motivos.filter((m) => m.critico).map((m) => PROSA[m.tipo]());
    const faltam = r.escolas.filter((x) => x.faltando > 0);
    const oc = maisGrave(ctx, (x) => x.area === 'educacao' && x.bairroId === top.bairroId);
    return {
      texto: `A rede tem ${r.alunos.toLocaleString('pt-BR')} alunos em ${r.escolas.length} escolas e faltam ${r.faltando} professores (${r.aulasPerdidasSemana.toLocaleString('pt-BR')} aulas perdidas por semana). A situação mais grave é na ${top.nome}${motivos.length ? `: ${nomes(motivos)}` : ''}.${oc ? ` Hoje há um agravante: ${oc.titulo}.` : ''} A evasão média está em ${pct(r.evasaoPct)}${r.evasaoAlta.length ? `, acima de 4% em ${nomes(r.evasaoAlta.map((x) => x.nome))}` : ''}, e a frequência em ${pct(r.frequenciaPct)}. ${pct(r.alfabetizacao3anoPct)} das crianças estão alfabetizadas no 3º ano; entre os adultos, ${pct(r.cidade.ensinoMedio25)} concluíram o ensino médio.`,
      ...(faltam.length ? { grafico: { tipo: 'barra', titulo: 'Professores faltando por escola', rotulos: faltam.map((x) => x.nome), series: [{ nome: 'Professores faltando', valores: faltam.map((x) => x.faltando) }], unidade: 'professores' } } : {}),
      mapa: { tipo: 'destaque', bairros: unicos(r.escolas.filter((x) => x.situacao === 'critica').map((x) => x.bairroId).concat(top.bairroId)), legenda: 'Bairros com escola em situação crítica' },
      acoes: [camada(`Ver ${top.nome} no mapa`, 'escolas', top.id), ...(oc ? [{ rotulo: `Ver no mapa: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
    };
  }

  // ---- roteiro ----
  // Empate de palavras-chave: vence o tema que vem primeiro (por isso "risco" antes de "alagamento":
  // "onde vai alagar?" é previsão; "onde mais alaga?" continua sendo histórico).
  const ROTEIRO = [
    {
      // CadÚnico × Saúde × Escola. Primeiro da lista: "crianças faltando à consulta e à escola" empata com
      // educação e violência, e o tema é este. Só números por bairro (a lista nominal fica com o CRAS e a UBS).
      id: 'social',
      chaves: ['cadunico', 'cad unico', 'vulnerav', 'busca ativa', 'bolsa familia', 'assistencia social', 'cras', 'lembrete', 'whatsapp', 'consulta', 'pobreza'],
      disponivel: () => !!GC.social,
      responder() {
        const r = GC.social.resumo();
        const e = r.efeitoLembrete;
        const n = (v) => v.toLocaleString('pt-BR');
        const alvo = (r.criticos.length ? r.criticos : r.bairros).slice(0, 3);
        return {
          texto: `${n(r.faltando)} famílias vulneráveis do CadÚnico faltaram a 2 ou mais consultas nos últimos 90 dias (${pct(r.faltandoPct)} das ${n(r.vulneraveis)}), e ${n(r.criancas)} crianças faltam à consulta e também à escola: são a lista de busca ativa. Os lembretes por WhatsApp derrubaram as faltas da cidade de ${pct(e.geralAntes)} para ${pct(e.geralDepois)}, mas nas famílias vulneráveis só de ${pct(e.vulneraveisAntes)} para ${pct(e.vulneraveisDepois)}: ${n(r.semLembrete)} das que faltam não têm celular atualizado no cadastro. Onde agir primeiro: ${nomes(alvo.map((b) => `${b.nome} (${pct(b.taxaPct)})`))}. Recomendo busca ativa do agente comunitário de saúde com o CRAS e atualizar o telefone no CadÚnico.`,
          grafico: { tipo: 'linha', titulo: 'Faltas em consultas: cidade × famílias vulneráveis', rotulos: r.serie.rotulos, series: [{ nome: 'Cidade', valores: r.serie.geral }, { nome: 'Famílias vulneráveis', valores: r.serie.vulneraveis }], unidade: '%' },
          mapa: { tipo: 'destaque', bairros: alvo.map((b) => b.id), legenda: 'Bairros com mais famílias vulneráveis faltando a consultas' },
        };
      },
    },
    {
      id: 'risco',
      chaves: ['risco', 'desliz', 'encosta', 'previs', 'vai alag', 'vai chover', 'sirene', 'proximas horas'],
      disponivel: () => !!GC.risco,
      responder(ctx) {
        const r = GC.risco.resumo(ctx.ocorrencias || []);
        const p = r.previsao;
        const alvo = r.preventivo || r.altas[0] || r.areas[0];
        const preventivo = r.preventivo
          ? ` Onde ainda dá para agir antes: ${r.preventivo.nome}, risco de ${r.preventivo.tipo} em ~${r.preventivo.horasAte} h (${r.preventivo.familias} famílias). Recomendo ${minuscula(r.preventivo.acao)}.`
          : (r.altas.length ? ' Todas as áreas de risco alto já foram atingidas: o foco agora é o atendimento.' : '');
        return {
          texto: `A previsão é de ${p.janelas[p.janelas.length - 1].mm} mm de chuva nas próximas 24 h (${p.janelas[1].mm} mm em 6 h), e já choveu ${p.acumulado72h} mm em 72 h. ${r.altas.length ? `${r.altas.length} área(s) com risco alto: ${nomes(r.altas.map((a) => a.nome))}.` : 'Nenhuma área com risco alto.'}${preventivo}${r.atingidas.length ? ` ${r.atingidas.length} área(s) já têm alagamento ou deslizamento aberto.` : ''}`,
          grafico: { tipo: 'linha', titulo: 'Chuva prevista (acumulada)', rotulos: p.janelas.map((j) => `${j.horas} h`), series: [{ nome: 'Chuva', valores: p.janelas.map((j) => j.mm) }], unidade: 'mm' },
          ...(r.altas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.altas.map((a) => a.bairroId)), legenda: 'Bairros com área de risco alto' } } : {}),
          acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'risco', alvo.id)] : [],
        };
      },
    },
    {
      id: 'leitos',
      chaves: ['leito', 'uti', 'internac', 'hospital', 'upa', 'vaga de'],
      disponivel: () => !!GC.leitos,
      responder(ctx) {
        const r = GC.leitos.resumo();
        const top = r.unidades[0];
        // Transferência só para o mesmo tipo de leito crítico: UTI adulto não vai para UTI neonatal nem para sala vermelha.
        const tipoUti = (top.grupos.find((g) => g.uti) || {}).rotulo;
        const vagasUti = (u) => u.grupos.filter((g) => g.uti && g.rotulo === tipoUti).reduce((s, g) => s + g.total - g.ocupados, 0);
        const folga = tipoUti && r.unidades.filter((u) => u.id !== top.id && vagasUti(u) > 0).sort((a, b) => vagasUti(b) - vagasUti(a))[0];
        const oc = top.ocorrenciaId && (ctx.ocorrencias || []).find((o) => o.id === top.ocorrenciaId);
        const apertadas = r.unidades.filter((u) => u.situacao !== 'ok');
        return {
          texto: `A rede está com ${r.pct}% dos leitos ocupados (${r.livres} livres de ${r.total}) e a UTI com ${r.utiPct}% (${r.utiLivres} vagas). O ponto crítico é ${top.nome}: ${top.utiPct !== null ? `UTI com ${top.utiPct}% e ` : ''}${top.pct}% no geral.${folga ? ` Dá para transferir pacientes para ${folga.nome}, que tem ${vagasUti(folga)} vaga(s) de ${tipoUti}.` : ''} Hoje foram ${r.atendimentosHoje.total.toLocaleString('pt-BR')} atendimentos na rede.`,
          grafico: { tipo: 'barra', titulo: 'Ocupação dos leitos por unidade', rotulos: r.unidades.map((u) => u.nome), series: [{ nome: 'Geral', valores: r.unidades.map((u) => u.pct) }, { nome: 'UTI', valores: r.unidades.map((u) => u.utiPct || 0) }], unidade: '%' },
          ...(apertadas.length ? { mapa: { tipo: 'destaque', bairros: unicos(apertadas.map((u) => u.bairroId)), legenda: 'Bairros com unidade de saúde acima de 80%' } } : {}),
          acoes: [camada(`Ver ${top.nome} no mapa`, 'leitos', top.id), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
        };
      },
    },
    {
      id: 'obras',
      chaves: ['obra', 'paralis', 'contrato', 'empreit', 'construc'],
      disponivel: () => !!GC.obras,
      responder() {
        const r = GC.obras.resumo();
        const atrasadas = r.obras.filter((o) => o.atrasada).sort((a, b) => b.diasAtraso - a.diasAtraso);
        const par = r.paralisadas[0];
        const g = r.gastoAFrente.sort((a, b) => (b.gastoPct - b.avancoPct) - (a.gastoPct - a.avancoPct))[0];
        const alvo = par || atrasadas[0];
        return {
          texto: `${r.atrasadas} de ${r.emAndamento} obras em andamento estão atrasadas, com atraso médio de ${r.atrasoMedioDias} dias.${par ? ` ${par.nome} está parada há ${par.semAvancoDias} dias (${par.diasAtraso} dias de atraso).` : ''}${g ? ` Atenção ao pagamento: em ${r.gastoAFrente.length} obra(s) já se pagou bem mais do que foi feito, como ${g.nome} (${g.gastoPct}% pago, ${g.avancoPct}% feito).` : ''} Do total contratado (R$ ${r.contratoMi.toLocaleString('pt-BR')} mi), ${r.gastoPct}% já foi pago.`,
          ...(atrasadas.length ? {
            grafico: { tipo: 'barra', titulo: 'Dias de atraso por obra', rotulos: atrasadas.slice(0, 8).map((o) => o.nome), series: [{ nome: 'Atraso', valores: atrasadas.slice(0, 8).map((o) => o.diasAtraso) }], unidade: 'dias' },
            mapa: { tipo: 'destaque', bairros: unicos(atrasadas.map((o) => o.bairroId)), legenda: 'Bairros com obra atrasada' },
          } : {}),
          acoes: alvo ? [camada(`Ver ${alvo.nome} no mapa`, 'obras', alvo.id)] : [],
        };
      },
    },
    {
      id: 'violencia',
      chaves: ['mulher', 'crianc', 'domestic', 'feminic', 'violencia contra', 'maria da penha'],
      disponivel: () => !!GC.seguranca,
      responder() {
        const v = GC.seguranca.resumo().violencia;
        const top = v.porBairro.slice(0, 3);
        return {
          texto: `Foram ${v.mes} casos de violência contra mulheres e crianças no último mês (${v.mulheres} contra mulheres e ${v.criancas} contra crianças e adolescentes): ${sinal(v.variacaoPct)} sobre o mês anterior e ${sinal(v.variacaoAnoPct)} em 12 meses. Os bairros com mais casos são ${nomes(top.map((b) => bairro(b.id).nome))}. Para proteger as vítimas, mostro só números por bairro, nunca endereços.`,
          grafico: { tipo: 'linha', titulo: 'Violência contra mulheres e crianças por mês', rotulos: v.serie.map((x) => x.mes), series: [{ nome: 'Casos', valores: v.serie.map((x) => x.total) }], unidade: 'casos' },
          mapa: { tipo: 'destaque', bairros: top.map((b) => b.id), legenda: 'Bairros com mais casos de violência contra mulheres e crianças' },
        };
      },
    },
    {
      // Antes de "saude" (que também casa com "medic"): estoque é tema próprio.
      id: 'medicamentos',
      chaves: ['medicament', 'remedio', 'estoque', 'farmacia', 'insulina', 'ruptura', 'falta de remed', 'paracetamol', 'losartana'],
      disponivel: () => !!GC.medicamentos,
      responder() {
        const r = GC.medicamentos.resumo();
        const n = (v) => v.toLocaleString('pt-BR');
        const faltas = r.farmacias.flatMap((f) => f.rupturas.map((x) => `${x.nome} na ${f.nome}`));
        const prev = r.vaoFaltar.map((x) => `${x.nome} (~${Math.floor(x.dias)} dias${x.motivoIA ? `, ${x.motivoIA}` : ''}${x.pedido ? `; o pedido só chega em ${x.chegaEmDias} dias` : ''})`);
        const rem = r.remanejamentos[0];
        const alvo = r.ubsComRuptura[0];
        return {
          texto: `${r.rupturas ? `Hoje faltam ${r.rupturas} itens nas UBS: ${nomes(faltas)}.` : 'Nenhuma UBS está com item em falta.'}${prev.length ? ` Pela previsão da IA, vão faltar na rede antes da reposição: ${nomes(prev)}.` : ''}${rem ? ` Antes de comprar, dá para remanejar ${n(rem.qtd)} de ${rem.medicamento} da ${rem.de} para a ${rem.para}${r.remanejamentos.length > 1 ? ` (e mais ${r.remanejamentos.length - 1} remanejamento(s))` : ''}.` : ''}${r.compras.length ? ` Compra sugerida: ${nomes(r.compras.slice(0, 3).map((x) => `${n(x.compraSugerida)} de ${x.nome}`))}.` : ''}`,
          grafico: { tipo: 'barra', titulo: 'Dias de estoque na rede (consumo previsto)', rotulos: r.itens.map((x) => x.nome), series: [{ nome: 'Dias', valores: r.itens.map((x) => Math.floor(x.dias)) }], unidade: 'dias' },
          ...(r.ubsComRuptura.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.ubsComRuptura.map((f) => f.bairroId)), legenda: 'Bairros com UBS sem algum medicamento' } } : {}),
          acoes: alvo ? [camada(`Ver a farmácia da ${alvo.nome} no mapa`, 'farmacias', alvo.id)] : [camada('Ver as farmácias no mapa', 'farmacias')],
        };
      },
    },
    {
      // Antes de "mobilidade": "quantos ônibus estão rodando?" é frota, não trânsito.
      id: 'frota',
      chaves: ['frota', 'ambulanc', 'samu', 'garagem', 'manutenc', 'rodando', 'concession', 'espera no ponto', 'ponto de onibus', 'linha'],
      disponivel: () => !!GC.frota,
      responder(ctx) {
        const r = GC.frota.resumo();
        const o = r.onibus;
        const a = r.ambulancias;
        const pior = r.linhas[0];
        const oc = pior && pior.ocorrenciaId && (ctx.ocorrencias || []).find((x) => x.id === pior.ocorrenciaId);
        const vencidas = o.preventivaVencida + a.preventivaVencida;
        return {
          texto: `Hoje rodam ${o.operando} de ${o.necessarios} ônibus necessários (${o.disponibilidadePct}%, meta do contrato ${o.metaDisponibilidadePct}%) e ${a.operando} de ${a.necessarios} ambulâncias (${a.disponibilidadePct}%). Em manutenção: ${o.corretiva} ônibus e ${a.corretiva} ambulância(s); ${vencidas} veículos rodam com a preventiva vencida.${o.foraDoContrato ? ` A ${o.operadora} está abaixo do contrato (${o.viagensPct}% das viagens, meta ${o.metaViagensPct}%): cabe notificar, com multa estimada de R$ ${o.multaEstimadaMil} mil no mês.` : ''}${pior && pior.situacao !== 'ok' ? ` A pior espera nos pontos é na ${pior.nome}: ${pior.esperaMin} min, para ${pior.intervaloMin} programados.` : ''} O SAMU está com tempo de resposta de ${a.tempoRespostaMin} min (meta ${a.metaTempoRespostaMin}).`,
          grafico: { tipo: 'barra', titulo: 'Espera nos pontos × intervalo programado', rotulos: r.linhas.map((x) => `Linha ${x.id}`), series: [{ nome: 'Espera real', valores: r.linhas.map((x) => x.esperaMin) }, { nome: 'Programado', valores: r.linhas.map((x) => x.intervaloMin) }], unidade: 'min' },
          ...(r.linhasCriticas.length ? { mapa: { tipo: 'destaque', bairros: unicos(r.linhasCriticas.flatMap((x) => x.bairros)), legenda: 'Bairros servidos por linha com espera crítica' } } : {}),
          acoes: [...(pior ? [camada(`Ver a ${pior.nome} no mapa`, 'frota', pior.id)] : []), ...(oc ? [{ rotulo: `Ver o alerta: ${oc.titulo}`, tipo: 'focarOcorrencia', payload: { ocorrenciaId: oc.id } }] : [])],
        };
      },
    },
    {
      id: 'alagamento',
      chaves: ['alag', 'enchent', 'chuva', 'inund'],
      responder(ctx) {
        const hist = GC.data.historico30d.defesa_civil;
        const total = Object.values(hist).reduce((s, n) => s + n, 0);
        const [topId, topN] = ranking(hist)[0];
        const ativos = (ctx.ocorrencias || []).filter((o) => o.tipo === 'alagamento');
        const mapa = calor('defesa_civil', ctx, 'Alagamentos — últimos 30 dias');
        return {
          texto: `${bairro(topId).nome} concentrou ${Math.round((topN / total) * 100)}% dos alagamentos nos últimos 30 dias (${topN} de ${total}). Agora há ${ativos.length} alagamentos ativos, ${ativos.filter((o) => o.severidade === 'critica').length} críticos. Destaquei as zonas de maior incidência no mapa.`,
          grafico: barraPorBairro(hist, 'Alagamentos por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
          mapa,
          acoes: [{ rotulo: 'Mostrar mapa de calor', tipo: 'mostrarMapa', payload: { mapa } }, ...focarPrimeira(ctx, (o) => o.tipo === 'alagamento')],
        };
      },
    },
    {
      id: 'energia',
      chaves: ['energia', 'luz', 'apagao', 'queda', 'eletric'],
      responder(ctx) {
        const hist = GC.data.historico30d.infraestrutura;
        const [topId, topN] = ranking(hist)[0];
        const ativos = (ctx.ocorrencias || []).filter((o) => o.tipo === 'queda de energia');
        const afetados = ativos.reduce((s, o) => s + o.afetados, 0);
        const mapa = calor('infraestrutura', ctx, 'Quedas de energia — últimos 30 dias');
        return {
          texto: `${bairro(topId).nome} lidera com ${topN} ocorrências de energia nos últimos 30 dias. Neste momento são ${ativos.length} quedas ativas afetando cerca de ${afetados.toLocaleString('pt-BR')} pessoas. Recomendo cobrar da concessionária um plano para a rede de ${bairro(topId).nome}.`,
          grafico: barraPorBairro(hist, 'Ocorrências de energia por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
          mapa,
          acoes: focarPrimeira(ctx, (o) => o.tipo === 'queda de energia'),
        };
      },
    },
    {
      id: 'saude',
      // "hospital" ficou com o tema dos leitos (quando ele existe); aqui é a lotação das UBS.
      chaves: ['ubs', 'saude', 'lotac', 'fila', 'medic', ...(GC.leitos ? [] : ['hospital'])],
      responder(ctx) {
        const ubs = GC.data.series.lotacaoUbs;
        const criticas = ubs.filter((u) => u.pct > 85);
        // A mais folgada (na Vila Dourada, a UBS Bela Vista, recém-inaugurada).
        const folgada = ubs.find((u) => u.bairroId === 'bela_vista') || ubs.reduce((a, b) => (b.pct < a.pct ? b : a));
        return {
          texto: `${criticas.length} unidades estão acima de 85% de lotação: ${criticas.map((u) => `${u.nome} (${u.pct}%)`).join(' e ')}. ${folgada.nome === 'UBS Bela Vista' ? 'A nova ' : 'A '}${folgada.nome} está com folga (${folgada.pct}%) — dá para redirecionar parte da demanda.`,
          grafico: { tipo: 'barra', titulo: 'Lotação das UBS agora', rotulos: ubs.map((u) => u.nome), series: [{ nome: 'Lotação', valores: ubs.map((u) => u.pct) }], unidade: '%' },
          mapa: { tipo: 'destaque', bairros: criticas.map((u) => u.bairroId), legenda: 'Bairros com UBS acima de 85%' },
          acoes: focarPrimeira(ctx, (o) => o.area === 'saude'),
        };
      },
    },
    {
      id: 'seguranca',
      chaves: ['crime', 'criminal', 'seguranc', 'violenc', 'roubo', 'assalto'],
      responder(ctx) {
        const s = GC.data.series.criminalidadeMensal;
        const variacao = Math.round(((s.valores[s.valores.length - 1] - s.valores[0]) / s.valores[0]) * 100);
        // Com os B.O.s carregados: bairro mais crítico, hoje × média e a camada fixa de calor.
        const bo = GC.seguranca && GC.seguranca.resumo();
        const critico = bo ? bairro(bo.bairroCritico.id).nome : bairro(ranking(GC.data.historico30d.seguranca)[0][0]).nome;
        return {
          texto: `A criminalidade caiu ${Math.abs(variacao)}% desde maio (${s.valores[0]} → ${s.valores[s.valores.length - 1]} ocorrências/mês), mas outubro teve leve alta. ${critico} concentra os registros do mês${bo ? ` (${bo.bairroCritico.pct}% dos B.O.s). Hoje já são ${bo.hoje} B.O.s até ${bo.ateHora}, ${sinal(bo.hojeVariacaoPct)} sobre a média de ${bo.mediaDia.toLocaleString('pt-BR')} por dia; o tipo mais comum é ${minuscula(bo.porTipo[0].tipo)}` : ''}.${agora(maisGrave(ctx, (o) => o.area === 'seguranca'))}`,
          grafico: { tipo: 'linha', titulo: 'Ocorrências de segurança por mês', rotulos: s.rotulos, series: [{ nome: 'Ocorrências', valores: s.valores }], unidade: 'ocorrências' },
          mapa: calor('seguranca', ctx, 'Ocorrências de segurança — últimos 30 dias'),
          acoes: [...focarPrimeira(ctx, (o) => o.area === 'seguranca'), ...(bo ? [camada('Ligar o mapa de calor dos B.O.s', 'calor-bo')] : [])],
        };
      },
    },
    {
      id: 'mobilidade',
      chaves: ['transito', 'trafego', 'congestion', 'mobilidade', 'onibus', 'semaforo'],
      responder(ctx) {
        const hist = GC.data.historico30d.mobilidade;
        const [[topId], [segId]] = ranking(hist);
        return {
          texto: `O trânsito crítico está concentrado nos bairros ${bairro(topId).nome} e ${bairro(segId).nome}, com pico entre ${GC.data.series.picoTransito}.${agora(maisGrave(ctx, (o) => o.area === 'mobilidade'))}`,
          grafico: barraPorBairro(hist, 'Ocorrências de trânsito por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
          mapa: calor('mobilidade', ctx, 'Pontos críticos de trânsito'),
          acoes: focarPrimeira(ctx, (o) => o.area === 'mobilidade'),
        };
      },
    },
    {
      id: 'educacao',
      chaves: ['escola', 'educa', 'evasao', 'matricula', 'aula', 'aluno', 'professor', 'alfabet', 'ensino medio'],
      responder(ctx) {
        if (GC.educacao) return educacaoDaRede(ctx);
        const f = GC.data.series.frequenciaEscolar;
        const ord = Object.entries(f).sort((a, b) => a[1] - b[1]);
        const media = Math.round(Object.values(f).reduce((s, n) => s + n, 0) / ord.length);
        return {
          texto: `A frequência escolar média da rede está em ${media}%. O ponto de atenção é ${bairro(ord[0][0]).nome} (${ord[0][1]}%).${(() => { const o = maisGrave(ctx, (x) => x.area === 'educacao' && x.bairroId === ord[0][0]); return o ? ` Hoje há um agravante: ${o.titulo}.` : ''; })()}`,
          grafico: { tipo: 'barra', titulo: 'Frequência escolar por bairro', rotulos: ord.map(([id]) => bairro(id).nome), series: [{ nome: 'Frequência', valores: ord.map(([, n]) => n) }], unidade: '%' },
          mapa: { tipo: 'destaque', bairros: [ord[0][0]], legenda: 'Menor frequência escolar' },
        };
      },
    },
    {
      id: 'limpeza',
      chaves: ['lixo', 'coleta', 'limpeza', 'entulho', 'bueiro', 'caminhao', 'reciclav', 'seletiva'],
      responder(ctx, pergunta) {
        if (GC.coleta) return coletaDasRotas(ctx, pergunta);
        const hist = GC.data.historico30d.limpeza;
        const piores = ranking(hist).filter(([, n]) => n >= 3).map(([id]) => id);
        return {
          texto: `${piores.map((id) => bairro(id).nome).join(' e ')} concentram os atrasos de coleta no mês. ${agora(maisGrave(ctx, (o) => o.area === 'limpeza'))}`,
          grafico: barraPorBairro(hist, 'Ocorrências de limpeza por bairro — 30 dias', 'Ocorrências', 'ocorrências'),
          mapa: { tipo: 'destaque', bairros: piores, legenda: 'Bairros com mais atrasos de coleta' },
          acoes: focarPrimeira(ctx, (o) => o.area === 'limpeza'),
        };
      },
    },
    {
      id: 'satisfacao',
      chaves: ['satisfa', 'avaliac', 'cidadao', 'opiniao'],
      responder() {
        const s = GC.data.satisfacaoPorBairro;
        const ord = Object.entries(s).sort((a, b) => a[1] - b[1]);
        const piores = ord.slice(0, 2).map(([id]) => id);
        return {
          texto: `A satisfação média da cidade está em ${GC.data.indicadoresBase.satisfacaoPct}%. Os pontos de atenção são ${bairro(ord[0][0]).nome} (${ord[0][1]}%) e ${bairro(ord[1][0]).nome} (${ord[1][1]}%), que também concentram ocorrências no mês. ${bairro(ord[ord.length - 1][0]).nome} lidera com ${ord[ord.length - 1][1]}%.`,
          grafico: { tipo: 'barra', titulo: 'Satisfação do cidadão por bairro', rotulos: ord.map(([id]) => bairro(id).nome), series: [{ nome: 'Satisfação', valores: ord.map(([, n]) => n) }], unidade: '%' },
          mapa: { tipo: 'destaque', bairros: piores, legenda: 'Bairros com menor satisfação' },
        };
      },
    },
    {
      id: 'desempenho',
      chaves: ['desempenh', 'prazo', 'atras', 'ranking', 'meta'],
      responder(contexto) {
        const d = contexto.desempenho;
        if (!d) return { texto: 'Ainda não tenho os números de desempenho.' };
        const pior = d.secretarias[0];
        const nome = area(pior.area).nome;
        const sobre = pior.pior
          ? `Quem mais atrasa é ${nome}: ${pior.noPrazoPct}% no prazo (meta 85%), tempo médio de ${pior.tempoMedioH.toLocaleString('pt-BR')} h.`
          : 'Todas as secretarias estão dentro da meta de 85% no prazo.';
        const agora = d.secretarias.filter((s) => s.atrasadas).map((s) => `${area(s.area).nome} (${s.atrasadas})`);
        return {
          texto: `Nos últimos 30 dias a cidade resolveu ${d.resumo.resolvidas} ocorrências, ${d.resumo.noPrazoPct}% no prazo. ${sobre}${agora.length ? ` Com prazo estourado agora: ${agora.join(', ')}.` : ''}`,
          grafico: { tipo: 'barra', titulo: '% resolvido no prazo — 30 dias', rotulos: d.secretarias.map((s) => area(s.area).nome), series: [{ nome: 'No prazo', valores: d.secretarias.map((s) => s.noPrazoPct) }], unidade: '%' },
        };
      },
    },
    {
      id: 'resumo',
      chaves: ['resumo', 'semana', 'melhorou', 'piorou', 'balanco'],
      responder() {
        const t = GC.data.tendencias;
        const bom = t.filter((x) => x.positivo).map((x) => `${x.rotulo} ${x.valor}`);
        const ruim = t.filter((x) => !x.positivo).map((x) => `${x.rotulo} ${x.valor}`);
        return {
          texto: `Resumo da semana em ${GC.cidade ? GC.cidade.nome : 'Vila Dourada'}. ✅ Melhorou: ${bom.join('; ')}. Também entregamos ${GC.data.conquistas.length} obras e serviços (veja a camada de conquistas). ⚠️ Piorou: ${ruim.join('; ')}.`,
          grafico: { tipo: 'barra', titulo: 'Variação dos indicadores (%)', rotulos: t.map((x) => x.rotulo), series: [{ nome: 'Variação', valores: t.map((x) => x.variacao) }], unidade: '%' },
        };
      },
    },
  ];

  // ---- de onde vem cada resposta (fontes, confiabilidade e consulta) ----
  const ORIGEM = {
    social: { areas: ['saude'], fontes: ['assistencia.cadunico_bairro', 'saude.agenda_ubs', 'educacao.frequencia'], consulta: "SELECT f.bairro, COUNT(DISTINCT f.familia) AS familias_faltando, COUNT(DISTINCT c.crianca) FILTER (WHERE c.frequencia_pct < 75) AS criancas_busca_ativa FROM assistencia.cadunico f JOIN saude.agenda_ubs a ON a.familia = f.familia AND a.situacao = 'falta' AND a.data >= hoje() - 90 LEFT JOIN educacao.frequencia c ON c.familia = f.familia WHERE f.renda_per_capita <= salario_minimo() / 2 GROUP BY f.bairro HAVING COUNT(a.*) >= 2 ORDER BY 2 DESC" },
    medicamentos: { areas: ['saude'], fontes: ['saude.estoque_caf', 'saude.dispensacao_ubs', 'saude.pedidos_compra'], consulta: 'SELECT item, unidade, estoque, consumo_medio_dia, estoque / consumo_medio_dia AS dias FROM saude.estoque_caf UNION ALL SELECT item, ubs, estoque, consumo_medio_dia, estoque / consumo_medio_dia FROM saude.dispensacao_ubs ORDER BY dias' },
    frota: { areas: ['mobilidade'], fontes: ['mobilidade.gps_onibus', 'concessao.disponibilidade_frota', 'samu.frota'], consulta: "SELECT frota, status, COUNT(*) FROM (SELECT 'onibus' AS frota, status FROM concessao.disponibilidade_frota UNION ALL SELECT 'ambulancia', status FROM samu.frota) f WHERE data = hoje() GROUP BY frota, status" },
    risco: { areas: ['defesa_civil'], fontes: ['defesa_civil.areas_risco', 'inmet.previsao_chuva', 'defesa_civil.ocorrencias'], consulta: 'SELECT a.area, a.limiar_mm, p.mm_acumulado, p.horas FROM defesa_civil.areas_risco a CROSS JOIN inmet.previsao_chuva p WHERE p.emitida_em = ultima_previsao() ORDER BY p.horas' },
    leitos: { areas: ['saude'], fontes: ['saude.central_leitos', 'saude.atendimentos', 'planejamento.bairros'], consulta: 'SELECT unidade, tipo_leito, SUM(total), SUM(ocupados) FROM saude.central_leitos WHERE atualizado_em >= agora() - 1h GROUP BY unidade, tipo_leito' },
    obras: { areas: ['infraestrutura'], fontes: ['obras.contratos', 'obras.medicoes', 'financas.pagamentos'], consulta: 'SELECT obra, previsao_original, previsao_atual, avanco_pct, SUM(pago) / valor_contrato AS pago_pct FROM obras.contratos JOIN obras.medicoes USING (obra) JOIN financas.pagamentos USING (obra) GROUP BY obra' },
    violencia: { areas: ['seguranca'], fontes: ['seguranca.boletins', 'assistencia.rede_protecao', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*) FROM seguranca.boletins WHERE natureza IN ('violencia_domestica', 'violencia_crianca_adolescente') AND data >= inicio_mes() GROUP BY bairro" },
    alagamento: { areas: ['defesa_civil'], fontes: ['defesa_civil.ocorrencias', 'defesa_civil.sensores_pluviometricos', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*) FROM defesa_civil.ocorrencias WHERE tipo = 'alagamento' AND data >= hoje() - 30 GROUP BY bairro ORDER BY 2 DESC" },
    energia: { areas: ['infraestrutura'], fontes: ['infraestrutura.ocorrencias', 'concessionaria.interrupcoes', 'planejamento.bairros'], consulta: "SELECT bairro, COUNT(*), SUM(imoveis_afetados) FROM infraestrutura.ocorrencias WHERE tipo = 'queda de energia' AND data >= hoje() - 30 GROUP BY bairro" },
    saude: { areas: ['saude'], fontes: ['saude.regulacao_ubs', 'saude.atendimentos_ubs', 'planejamento.bairros'], consulta: 'SELECT ubs, bairro, ocupacao_pct, AVG(espera_min) FROM saude.regulacao_ubs JOIN saude.atendimentos_ubs USING (ubs) WHERE data = hoje() GROUP BY ubs, bairro' },
    seguranca: { areas: ['seguranca'], fontes: ['seguranca.ocorrencias', 'seguranca.boletins'], consulta: "SELECT mes, COUNT(*) FROM seguranca.ocorrencias WHERE data >= '2026-05-01' GROUP BY mes ORDER BY mes" },
    mobilidade: { areas: ['mobilidade'], fontes: ['mobilidade.central_trafego', 'mobilidade.gps_onibus', 'planejamento.bairros'], consulta: 'SELECT bairro, COUNT(*) FROM mobilidade.central_trafego WHERE data >= hoje() - 30 GROUP BY bairro ORDER BY 2 DESC' },
    educacao: { areas: ['educacao'], fontes: ['educacao.frequencia', 'planejamento.bairros'], consulta: 'SELECT bairro, AVG(frequencia_pct) FROM educacao.frequencia WHERE mes = mes_atual() GROUP BY bairro ORDER BY 2' },
    limpeza: { areas: ['limpeza'], fontes: ['limpeza.rotas_coleta', 'ouvidoria.chamados_156'], consulta: 'SELECT bairro, COUNT(*) FROM limpeza.rotas_coleta WHERE atraso_h > 48 AND data >= hoje() - 30 GROUP BY bairro' },
    satisfacao: { areas: GC.data.areas.map((a) => a.id), fontes: ['ouvidoria.pesquisa_satisfacao', 'ouvidoria.chamados_156', 'planejamento.bairros'], consulta: 'SELECT bairro, AVG(nota) * 10 AS satisfacao_pct FROM ouvidoria.pesquisa_satisfacao WHERE data >= hoje() - 30 GROUP BY bairro ORDER BY 2' },
    desempenho: { areas: GC.data.areas.map((a) => a.id), fontes: ['gestao.ocorrencias', 'gestao.prazos_sla'], consulta: 'SELECT secretaria, COUNT(*) AS resolvidas, AVG(resolvida_no_prazo) * 100 AS no_prazo_pct, AVG(horas_ate_resolver) FROM gestao.ocorrencias JOIN gestao.prazos_sla USING (gravidade) WHERE resolvida_em >= hoje() - 30 GROUP BY secretaria ORDER BY 3' },
    resumo: { areas: GC.data.areas.map((a) => a.id), fontes: ['gabinete.indicadores', 'gabinete.conquistas'], consulta: 'SELECT indicador, valor, variacao_pct FROM gabinete.indicadores WHERE semana = semana_atual()' },
  };

  // Base consultada: quantos registros a consulta leu e o período que cobre. Contado dos mesmos dados que
  // montam a resposta (não é um número decorativo). Tema sem módulo carregado fica sem contagem.
  const soma = (o) => Object.values(o || {}).reduce((s, n) => s + n, 0);
  const casos30d = (areaId) => soma(GC.data.historico30d[areaId]);
  const BASE = {
    social: { periodo: 'últimos 90 dias', registros: () => GC.social.resumo().familias },
    medicamentos: { periodo: 'estoque de hoje', registros: () => { const m = GC.medicamentos.resumo(); return m.itens.length * (m.farmacias.length + 1); } },
    frota: { periodo: 'hoje', registros: () => { const f = GC.frota.resumo(); return f.onibus.total + f.ambulancias.total; } },
    risco: { periodo: 'últimas 72 h + próximas 24 h', registros: (c) => { const r = GC.risco.resumo(c.ocorrencias || []); return r.areas.length * r.previsao.janelas.length + (c.ocorrencias || []).filter((o) => o.area === 'defesa_civil').length; } },
    leitos: { periodo: 'última hora', registros: () => GC.leitos.resumo().unidades.reduce((s, u) => s + (u.grupos || []).length, 0) },
    obras: { periodo: 'contratos vigentes', registros: () => { const o = GC.obras.resumo ? GC.obras.resumo() : GC.obras; return (o.obras || []).length * 3; } },
    violencia: { periodo: 'mês atual', registros: () => GC.seguranca.resumo().violencia.mes },
    alagamento: { periodo: 'últimos 30 dias', registros: () => casos30d('defesa_civil') },
    energia: { periodo: 'últimos 30 dias', registros: () => casos30d('infraestrutura') },
    saude: { periodo: 'hoje', registros: () => GC.data.series.lotacaoUbs.length * 2 },
    seguranca: { periodo: 'mai a out/2026', registros: () => soma(GC.data.series.criminalidadeMensal.valores) },
    mobilidade: { periodo: 'últimos 30 dias', registros: () => casos30d('mobilidade') },
    educacao: { periodo: 'mês atual', registros: () => (GC.educacao ? GC.educacao.resumo().alunos : soma(GC.data.series.frequenciaEscolar)) },
    limpeza: { periodo: 'últimos 30 dias', registros: () => casos30d('limpeza') },
    satisfacao: { periodo: 'últimos 30 dias', registros: () => GC.data.bairros.length },
    desempenho: { periodo: 'últimos 30 dias', registros: () => soma(Object.fromEntries(Object.entries(GC.data.desempenho30d).map(([k, d]) => [k, d.resolvidas]))) },
    resumo: { periodo: 'semana atual', registros: () => GC.data.tendencias.length },
  };
  const referencia = () => new Date(GC.agora ? GC.agora() : Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function baseConsultada(id, contexto) {
    const b = BASE[id];
    if (!b) return null;
    let registros;
    try { registros = Math.max(0, Math.round(b.registros(contexto || {}))); } catch (e) { return null; }
    return Number.isFinite(registros) ? { registros, periodo: b.periodo, referencia: referencia() } : null;
  }
  GC.baseConsultada = baseConsultada;

  function confiabilidade(fontes, areas) {
    const min = Math.min(...areas.map((a) => GC.data.basesSecretarias[a].atualizadoHaMin));
    return { nivel: fontes.length >= 2 ? 'alta' : 'media', motivo: `${fontes.length} ${fontes.length === 1 ? 'fonte' : 'fontes'} · atualizadas há ${min} min` };
  }

  // Temas de uma secretaria viram regra de monitoramento pelo "🔔 Transformar em alerta".
  const EXPRESSAO_ALERTA = {
    social: 'familias_vulneraveis_com_2_faltas_90d_bairro > média_cidade × 1,15 OU crianca_falta_consulta_e_escola',
    risco: 'chuva_prevista_6h (+ acumulado_72h nas encostas) >= limiar_area',
    frota: 'disponibilidade_frota < meta_contrato OU espera_ponto > 1,8 × intervalo_programado',
    medicamentos: 'estoque_ubs = 0 OU dias_cobertura_previstos < prazo_reposicao',
    leitos: 'ocupacao_uti > 90% OU ocupacao_leitos > 85%',
    obras: 'obra.dias_atraso > 30 OU obra.dias_sem_avanco > 60',
    violencia: 'casos_violencia_mulher_crianca_mes > mes_anterior × 1,1',
    alagamento: 'casos_alagamento_bairro > média_30d × 1,3',
    energia: 'quedas_energia_bairro > média_30d × 1,3',
    saude: 'lotacao_ubs > 85% por 2 h',
    seguranca: 'ocorrencias_seguranca_bairro > média_4_semanas × 1,3',
    mobilidade: 'tempo_deslocamento > média_30d × 1,2',
    educacao: 'frequencia_escolar_bairro < 92%',
    limpeza: 'coleta_atrasada_bairro > 48 h',
  };

  function comOrigem(id, resposta, pergunta, contexto) {
    const o = ORIGEM[id];
    if (!o) return resposta;
    Object.assign(resposta, { fontes: o.fontes, confiabilidade: confiabilidade(o.fontes, o.areas), consulta: o.consulta });
    const base = baseConsultada(id, contexto);
    if (base) resposta.base = base;
    if (EXPRESSAO_ALERTA[id] && o.areas.length === 1 && pergunta) {
      const acao = { rotulo: '🔔 Transformar em alerta', tipo: 'criarAlerta', payload: { nome: `Pergunta: ${pergunta.trim()}`.slice(0, 120), expressao: EXPRESSAO_ALERTA[id], fontes: o.fontes, area: o.areas[0] } };
      resposta.acoes = [...(resposta.acoes || []), acao];
    }
    return resposta;
  }

  // Ações do prefeito sobre uma ocorrência (cobrar, priorizar, gabinete de crise).
  function agir(o, acao) {
    const rotulo = { cobrar: `📣 Cobrar ${area(o.area).secretaria.nome}`, priorizar: '⚡ Priorizar', gabinete: '🚨 Gabinete de crise' }[acao];
    return { rotulo, tipo: 'agir', payload: { ocorrenciaId: o.id, acao } };
  }

  // Pergunta feita a partir da gaveta de um alerta: resposta montada com os dados do próprio alerta.
  function sobreOcorrencia(o) {
    const d = GC.detalharOcorrencia(o);
    const fontes = [...d.regra.fontes.map((f) => `${o.area}.${normalizar(f).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`), 'planejamento.bairros'];
    const acoes = [...GC.acoesDisponiveis(o).map((tipo) => agir(o, tipo)), { rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } }];
    return {
      cenario: 'ocorrencia',
      texto: `"${o.titulo}" (${bairro(o.bairroId).nome}) disparou pela regra ${d.regra.expressao}. ${d.evidencias.join('. ')}. ${o.status === 'resolvida' ? 'Este alerta já foi resolvido; se voltar a acontecer, a recomendação continua: ' : 'Minha recomendação: '}${d.acaoRecomendada.charAt(0).toLowerCase()}${d.acaoRecomendada.slice(1)}.`,
      fontes,
      confiabilidade: confiabilidade(fontes, [o.area]),
      consulta: `SELECT * FROM ${fontes[0]} WHERE bairro = '${o.bairroId}' AND data >= hoje() - 30`,
      base: { registros: ((GC.data.historico30d[o.area] || {})[o.bairroId] || 0) + 1, periodo: 'últimos 30 dias no bairro', referencia: referencia() },
      acoes,
    };
  }

  // Sugestões: as dos indicadores do workshop primeiro (só se o módulo estiver carregado).
  const sugestoes = [
    ...(GC.leitos ? ['Como estão os leitos de UTI?'] : []),
    ...(GC.risco ? ['Onde vai alagar nas próximas horas?'] : []),
    ...(GC.obras ? ['Quais obras estão atrasadas?'] : []),
    ...(GC.educacao ? ['Onde faltam professores?'] : []),
    ...(GC.frota ? ['Quantos ônibus e ambulâncias estão rodando?'] : []),
    ...(GC.coleta ? ['Quando passa o caminhão de lixo no Centro?'] : []),
    ...(GC.medicamentos ? ['Vai faltar algum medicamento?'] : []),
    'Onde mais alaga este mês?',
    'Como evoluiu a criminalidade?',
    'Como está a lotação das UBS?',
    'Quem está atrasando os prazos?',
    ...(GC.leitos ? [] : ['Quais bairros têm mais falta de energia?', 'Onde está o trânsito mais crítico?']),
  ];

  // Cumprimento sem tema ("bom dia", "oi, tudo bem?"): responde com o quadro do momento.
  const CUMPRIMENTO = /^(oi|ola|ei|opa|bom dia|boa tarde|boa noite|tudo bem|tudo certo|e ai|salve)\b/;
  const saudacaoDoDia = () => {
    const h = new Date(GC.agora ? GC.agora() : Date.now()).getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  function perguntar(texto, contexto) {
    const foco = contexto && contexto.ocorrenciaFoco && (contexto.ocorrencias || []).find((o) => o.id === contexto.ocorrenciaFoco);
    if (foco) return sobreOcorrencia(foco);
    const q = normalizar(texto);
    let melhor = null;
    let pontos = 0;
    if (q) {
      for (const c of ROTEIRO) {
        if (c.disponivel && !c.disponivel()) continue; // tema de um módulo que não foi carregado
        const n = c.chaves.filter((k) => q.includes(k)).length;
        if (n > pontos) { melhor = c; pontos = n; }
      }
    }
    if (!melhor) {
      const sugerir = (lista) => lista.map((s) => ({ rotulo: s, tipo: 'perguntar', payload: { texto: s } }));
      if (CUMPRIMENTO.test(q)) {
        // Gestor de uma secretaria: o quadro é só da pasta dele.
        const dele = (o) => !contexto || !contexto.areasPerfil || contexto.areasPerfil.includes(o.area);
        const ativas = ((contexto && contexto.ocorrencias) || []).filter(dele);
        const criticas = ativas.filter((o) => o.severidade === 'critica').length;
        const urgente = maisGrave(contexto || {}, dele);
        const quadro = ativas.length
          ? `Há ${ativas.length} ${ativas.length === 1 ? 'ocorrência' : 'ocorrências'} em aberto, ${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}.${urgente ? ` A mais urgente: ${urgente.titulo} (${bairro(urgente.bairroId).nome}).` : ''}`
          : 'Nenhuma ocorrência em aberto agora.';
        return {
          cenario: 'saudacao',
          texto: `${saudacaoDoDia()}! ${quadro} Por onde quer começar?`,
          acoes: [...focarPrimeira(contexto || {}, dele), ...sugerir(sugestoes.slice(0, 2))],
        };
      }
      return {
        cenario: 'fallback',
        texto: 'Não encontrei isso nos dados da prefeitura. Experimente perguntar:',
        acoes: sugerir(sugestoes.slice(0, 3)),
      };
    }
    return comOrigem(melhor.id, Object.assign({ cenario: melhor.id }, melhor.responder(contexto || {}, q)), texto, contexto);
  }

  function aoEvento(evento, contexto) {
    const o = evento.ocorrencia;
    if (evento.tipo === 'acao') {
      const n = (GC.data.historico30d[o.area] || {})[o.bairroId] || 0;
      if (n < 2) return null;
      const mapa = calor(o.area, contexto || {}, `Histórico de ${area(o.area).nome} — 30 dias`);
      return {
        cenario: 'evento_acao',
        texto: `É o ${n}º caso de ${o.tipo} no bairro ${bairro(o.bairroId).nome} nos últimos 30 dias. Isso sugere um problema estrutural. Quer ver o histórico no mapa?`,
        acoes: [{ rotulo: 'Ver histórico no mapa', tipo: 'mostrarMapa', payload: { mapa } }],
      };
    }
    if (evento.tipo === 'nova') {
      return {
        cenario: 'evento_nova',
        texto: `🚨 Novo alerta: ${o.titulo} no bairro ${bairro(o.bairroId).nome} (severidade ${SEVERIDADE[o.severidade]}, ~${o.afetados.toLocaleString('pt-BR')} pessoas). Já encaminhado à ${area(o.area).secretaria.nome} (prazo ${GC.data.prazoMin[o.severidade] / 60} h).`,
        acoes: [
          agir(o, 'priorizar'),
          { rotulo: 'Ver no mapa', tipo: 'focarOcorrencia', payload: { ocorrenciaId: o.id } },
        ],
      };
    }
    return null;
  }

  // Secretarias de cada tema (o painel do gestor do setor só responde temas da pasta dele).
  const areasDoTema = (id) => (ORIGEM[id] ? ORIGEM[id].areas.slice() : null);

  GC.ia = { sugestoes, perguntar, aoEvento, normalizar, areasDoTema };
})(window.GC = window.GC || {});
