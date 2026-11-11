(function (GC) {
  // Cálculos do layout com o mapa no centro (sem DOM): legenda do que está no mapa, contadores
  // dos títulos recolhidos (filtros, atenção, secretarias), widgets escolhidos e urgência dos grupos de pinos.
  const SEVERIDADES = ['critica', 'alta', 'media'];

  GC.resumoLegenda = function (lista) {
    const severidades = SEVERIDADES
      .map((chave) => ({ chave, n: lista.filter((o) => o.severidade === chave).length }))
      .filter((s) => s.n > 0);
    // sort é estável: no empate fica a ordem de GC.data.areas.
    const tipos = GC.data.areas
      .map((a) => ({ area: a.id, emoji: a.emoji, nome: a.nome, n: lista.filter((o) => o.area === a.id).length }))
      .filter((t) => t.n > 0)
      .sort((x, y) => y.n - x.n);
    return { severidades, tipos, total: lista.length };
  };

  const NOME_SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média' };

  // HTML da legenda fixa: só o que está no mapa (contagens de GC.resumoLegenda, sem linhas zeradas) e
  // uma seção por camada ligada. filtros: { severidades, areas } marcam o que está filtrado.
  // camadas: { risco, calorBO, conquistas, destaqueIA, calorIA } (o mapa avisa quando mudam).
  GC.htmlLegendaMapa = function (lista, filtros = {}, camadas = {}) {
    const esc = (t) => GC.escaparHtml(t);
    const ML = GC.mapaLogica;
    const sevs = filtros.severidades || [];
    const areas = filtros.areas || [];
    const r = GC.resumoLegenda(lista);
    const linha = (rotulo, n, filtrado) => `<li class="leg-linha${filtrado ? ' filtrado' : ''}">${rotulo}<small>${n}</small></li>`;
    const amostra = (cor, borda) => `<i class="leg-amostra" style="background:${cor}${borda ? `;border-color:${borda}` : ''}" aria-hidden="true"></i>`;
    const secao = (titulo, corpo) => `<hr><div class="leg-secao"><strong>${titulo}</strong>${corpo}</div>`;

    const total = r.total === 1 ? '1 ocorrência' : `${r.total} ocorrências`;
    let html = `<p class="leg-dica">No mapa agora: ${total} · para filtrar, use Filtros</p>`;
    if (!r.total) {
      html += '<p class="leg-vazio">Nenhuma ocorrência no mapa com os filtros atuais.</p>';
    } else {
      html += `<ul class="leg-lista" aria-label="Por gravidade">${r.severidades.map((s) => linha(`<i class="bola ${s.chave}" aria-hidden="true"></i>${NOME_SEV[s.chave]}`, s.n, sevs.includes(s.chave))).join('')}</ul>`;
      html += `<hr><ul class="leg-lista" aria-label="Por secretaria">${r.tipos.map((t) => linha(`<span class="leg-emoji" aria-hidden="true">${t.emoji}</span>${esc(t.nome)}`, t.n, areas.includes(t.area))).join('')}</ul>`;
      // Mini-pinos com as mesmas classes do mapa (.marcador, .grupo-pinos): o desenho acompanha o do mapa.
      const pino = (classes) => `<span class="leg-pino" aria-hidden="true"><span class="marcador ${classes}"></span></span>`;
      const anel = ML.anelGrupo({ critica: 1, alta: 2, media: 2 });
      const grupo = `<span class="leg-pino" aria-hidden="true"><span class="grupo-pinos critica" style="background:${anel}"><span class="critica">5</span></span></span>`;
      html += `<hr><ul class="leg-lista leg-simbolos" aria-label="Como ler os pinos">
        <li class="leg-item">${pino('alta em_campo')}Contorno azul: equipe em campo</li>
        <li class="leg-item">${pino('critica pulsar')}Pulsando: prazo estourado</li>
        <li class="leg-item">${grupo}Círculo com número: pinos próximos (cor do mais grave, o anel mostra a mistura)</li>
      </ul>`;
    }

    if (camadas.destaqueIA) html += secao('Camada da IA', `<div class="leg-item">${amostra(ML.COR_DESTAQUE)}Bairro destacado pela IA</div>`);
    if (camadas.calorIA) html += secao('Calor da IA', ML.htmlBarraCalor());
    if (camadas.risco) {
      html += secao('Áreas de risco', ['alto', 'medio', 'baixo'].map((n) => `<div class="leg-item">${amostra(ML.COR_RISCO[n], ML.COR_RISCO[n])}${{ alto: 'Risco alto (chuva em até 6 h)', medio: 'Risco médio', baixo: 'Risco baixo' }[n]}</div>`).join('')
        + '<div class="leg-item leg-nota">contorno grosso = área já atingida</div>');
    }
    if (camadas.calorBO) html += secao('B.O.s (30 dias)', ML.htmlBarraCalor());
    if (camadas.conquistas) html += secao('Conquistas', '<div class="leg-item"><span class="leg-amostra leg-conquista" aria-hidden="true"><i class="ti ti-star"></i></span>Entrega concluída (clique para ver)</div>');
    return html;
  };

  GC.contarFiltros = (areas, bairro) => areas.length + (bairro ? 1 : 0);

  // Com filtro, o total da cidade aparece junto: nada urgente fica escondido pelo filtro.
  GC.tituloAtencao = function (filtradas, cidade, temFiltro) {
    return temFiltro && filtradas !== cidade ? `(${filtradas} · ${cidade} na cidade)` : `(${filtradas})`;
  };

  GC.contarPiorando = (pulsos) => pulsos.filter((p) => p.positivo === false).length;

  // Escolha vazia, corrompida ou só com ids que não existem mais: mostra todas.
  GC.widgetsVisiveis = function (pulsos, escolhidos) {
    if (!Array.isArray(escolhidos)) return pulsos;
    const visiveis = pulsos.filter((p) => escolhidos.includes(p.area));
    return visiveis.length ? visiveis : pulsos;
  };

  // Um grupo de pinos mostra a maior gravidade e pulsa se esconder um prazo estourado (mesma regra do pino).
  GC.urgenciaGrupo = function (ocorrencias) {
    const severidade = SEVERIDADES.find((s) => ocorrencias.some((o) => o.severidade === s)) || 'media';
    const pulsar = ocorrencias.some((o) => GC.estourada(o) && !o.acaoPrefeito);
    return { severidade, pulsar };
  };
})(window.GC = window.GC || {});
