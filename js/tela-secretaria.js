(function (GC) {
  // Página de uma secretaria: cabeçalho com orçamento, 4 indicadores, 12 meses com meta e
  // projeção (e o marco de uma ação), metas do plano de governo, unidades e alertas da pasta.
  const esc = (t) => GC.escaparHtml(t);
  const STATUS = { em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const STATUS_META = { concluida: 'Concluída', em_dia: 'Em dia', atencao: 'Atenção', critico: 'Crítico' };
  const SITUACAO = { ok: 'Normal', atencao: 'Atenção', critica: 'Crítica' };
  const bairro = (id) => GC.data.bairros.find((b) => b.id === id);
  const PERGUNTA = {
    defesa_civil: 'Onde mais alaga este mês?',
    infraestrutura: 'Quais bairros têm mais falta de energia?',
    saude: 'Como está a lotação das UBS?',
    seguranca: 'Como evoluiu a criminalidade?',
    mobilidade: 'Onde está o trânsito mais crítico?',
    educacao: 'Como está a frequência nas escolas?',
    limpeza: 'Onde a coleta de lixo está atrasada?',
  };
  const PROJECAO = ['nov*', 'dez*'];

  function valor(n, unidade) {
    if (unidade === 'min') return `${n} min`;
    if (unidade === '%') return `${n}%`;
    return n.toLocaleString('pt-BR');
  }

  // Linha vertical do marco de uma ação (ex.: "lembretes ativados").
  const pluginMarco = {
    id: 'marco',
    afterDatasetsDraw(chart, _args, opcoes) {
      if (!opcoes || opcoes.indice === undefined) return;
      const { ctx, chartArea } = chart;
      const x = chart.scales.x.getPixelForValue(opcoes.indice);
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#475569';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = x > chartArea.left + chartArea.width / 2 ? 'right' : 'left';
      ctx.fillText(`▼ ${opcoes.texto}`, x + (ctx.textAlign === 'left' ? 4 : -4), chartArea.top + 10);
      ctx.restore();
    },
  };

  GC.criarTelaSecretaria = function (el, { aoAbrirAlerta, aoPerguntar, aoGerarRelatorio, aoVerIndicadores }) {
    let grafico = null;
    let areaAtual = null;

    function cabecalho(p) {
      return `
        <header class="sec-topo">
          <div>
            <h2>${p.secretaria.emoji} ${esc(p.secretaria.nome)} <span class="sec-status st-${p.status}">${STATUS[p.status]}</span></h2>
            <p>Titular: ${esc(p.titular)} · Orçamento 2026: R$ ${p.orcamento.dotacaoMi.toLocaleString('pt-BR')} mi · executado ${p.orcamento.executadoPct}% · base atualizada há ${p.base.atualizadoHaMin} min</p>
          </div>
          <span class="sec-acoes">${aoVerIndicadores ? '<button type="button" class="btn-sec sec-indicadores-btn">📏 Indicadores da pasta</button>' : ''}<button type="button" class="btn-sec sec-perguntar">✨ Perguntar</button><button type="button" class="btn-primario sec-relatorio">📄 Gerar relatório</button></span>
        </header>`;
    }

    function indicadores(p) {
      return `<div class="sec-indicadores">${p.indicadores.map((i) => `
        <div class="sec-ind"><small>${esc(i.rotulo)}</small><b>${esc(i.valor)}</b><span class="${i.bom ? 'melhor' : 'pior'}">${esc(i.variacao)}</span></div>`).join('')}</div>`;
    }

    // Sem Chart.js (sem internet): a mesma informação em texto.
    function listaSerie(p) {
      const s = p.serie;
      return `<ul class="grafico-texto">${s.meses.map((v, i) => `<li>${p.meses[i]}: ${valor(v, s.unidade)}${s.marco && s.marco.mes === i ? ` · ${esc(s.marco.texto)}` : ''}</li>`).join('')}
        <li>projeção da IA: ${s.projecao.map((v) => valor(v, s.unidade)).join(', ')}</li><li>meta: ${valor(s.meta, s.unidade)}</li></ul>`;
    }

    function desenharGrafico(p) {
      const caixa = el.querySelector('.sec-grafico');
      if (grafico) { grafico.destroy(); grafico = null; }
      if (typeof Chart === 'undefined') { caixa.innerHTML = listaSerie(p); return; }
      const s = p.serie;
      const rotulos = [...p.meses, ...PROJECAO];
      const nulos = (n) => Array(n).fill(null);
      caixa.innerHTML = '<canvas></canvas>';
      grafico = new Chart(caixa.querySelector('canvas'), {
        type: 'line',
        data: {
          labels: rotulos,
          datasets: [
            { label: s.rotulo, data: [...s.meses, ...nulos(2)], borderColor: GC.corMarca('navy'), backgroundColor: GC.corMarca('navy'), tension: 0.3, pointRadius: 3 },
            { label: 'projeção da IA', data: [...nulos(11), s.meses[11], ...s.projecao], borderColor: GC.corMarca('ia'), backgroundColor: GC.corMarca('ia'), borderDash: [5, 4], tension: 0.3, pointRadius: 3 },
            { label: `meta ${valor(s.meta, s.unidade)}`, data: rotulos.map(() => s.meta), borderColor: '#15803d', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
            tooltip: { callbacks: { label: (c) => (c.raw === null ? '' : `${c.dataset.label}: ${valor(c.raw, s.unidade)}`) } },
            marco: s.marco ? { indice: s.marco.mes, texto: s.marco.texto } : {},
          },
          scales: { y: { ticks: { callback: (v) => valor(v, s.unidade) } } },
        },
        plugins: [pluginMarco],
      });
    }

    function metas(p) {
      return p.metas.map((m) => `
        <div class="sec-meta">
          <div class="sec-meta-topo"><span>${esc(m.titulo)}</span><span class="sec-status st-${m.status}">${STATUS_META[m.status]}</span></div>
          <div class="sec-barra"><i class="st-${m.status}" style="width:${m.progressoPct}%"></i></div>
          <small>${m.progressoPct}% · prazo ${esc(m.prazo)}</small>
        </div>`).join('');
    }

    function unidades(p) {
      const cols = p.unidades[0].metricas.map((m) => `<th>${esc(m.rotulo)}</th>`).join('');
      return `<table class="sec-tabela"><thead><tr><th>Unidade</th><th>Bairro</th>${cols}<th>Situação</th></tr></thead><tbody>${p.unidades.map((u) => `
        <tr><td>${esc(u.nome)}</td><td>${esc(bairro(u.bairroId).nome)}</td>${u.metricas.map((m) => `<td>${esc(m.valor)}</td>`).join('')}
        <td><span class="sec-status sit-${u.situacao}">${SITUACAO[u.situacao]}</span></td></tr>`).join('')}</tbody></table>`;
    }

    function alertas(p) {
      if (!p.alertas.length) return '<p class="painel-vazio">Nenhum alerta ativo nesta pasta 🎉</p>';
      return `<ul class="sec-alertas">${p.alertas.map((o) => {
        const m = GC.motivosAtencao(o)[0];
        return `<li><button type="button" data-alerta="${o.id}">${m ? `<span class="motivo m-${m.tipo}">${esc(m.texto)}</span>` : ''}
          <b>${esc(o.titulo)}</b><small>${esc(bairro(o.bairroId).nome)} · ${esc(GC.situacao(o))}</small></button></li>`;
      }).join('')}</ul>`;
    }

    function ligar(p) {
      el.querySelector('.sec-perguntar').onclick = () => aoPerguntar(PERGUNTA[p.area]);
      el.querySelector('.sec-relatorio').onclick = () => aoGerarRelatorio(p.area);
      const ind = el.querySelector('.sec-indicadores-btn');
      if (ind) ind.onclick = () => aoVerIndicadores(p.area);
      el.querySelectorAll('[data-alerta]').forEach((b) => { b.onclick = () => aoAbrirAlerta(b.dataset.alerta); });
    }

    function mostrar(p) {
      if (!p) return;
      areaAtual = p.area;
      el.innerHTML = `
        ${cabecalho(p)}
        <div class="sec-ind-wrap">${indicadores(p)}</div>
        <div class="sec-grade">
          <section class="painel-card sec-evolucao"><h3>${esc(p.serie.rotulo)} · 12 meses e projeção</h3><div class="sec-grafico"></div></section>
          <section class="painel-card"><h3>Metas do plano de governo</h3>${metas(p)}</section>
        </div>
        <div class="sec-grade">
          <section class="painel-card"><h3>Unidades</h3>${unidades(p)}</section>
          <section class="painel-card"><h3>Alertas da pasta (${p.alertas.length})</h3><div class="sec-alertas-wrap">${alertas(p)}</div></section>
        </div>`;
      desenharGrafico(p);
      ligar(p);
    }

    // A cidade anda: status, indicadores e alertas mudam; o gráfico (12 meses) não.
    function atualizar(p) {
      if (!p) return;
      if (p.area !== areaAtual) return mostrar(p);
      el.querySelector('.sec-topo').outerHTML = cabecalho(p);
      el.querySelector('.sec-ind-wrap').innerHTML = indicadores(p);
      el.querySelector('.sec-alertas-wrap').innerHTML = alertas(p);
      el.querySelector('.sec-alertas-wrap').previousElementSibling.textContent = `Alertas da pasta (${p.alertas.length})`;
      ligar(p);
    }

    return { mostrar, atualizar };
  };
})(window.GC = window.GC || {});
