(function (GC) {
  // Tour guiado: o painel se apresenta passo a passo (botão "▶ Tour guiado" no topo, index.html?tour
  // ou index.html?tour=N para começar no passo N).
  // Só lê o DOM e troca o hash; o painel continua clicável durante o tour, então dá para seguir as dicas.
  const PASSOS = [
    {
      titulo: '👋 Bem-vindo à Vila Dourada',
      texto: 'Hoje a informação chega espalhada: uma ligação da Defesa Civil, um relatório da Saúde, uma planilha da Infraestrutura. Este painel junta tudo num lugar só. E o prefeito não é o gargalo: cada problema vai sozinho para a secretaria certa, com prazo.',
      dica: 'Use → e ← (ou os botões). Durante o tour o painel continua clicável.',
      rota: '#/painel',
      antes: () => { fecharGaveta(); if (GC.fecharDashboard) GC.fecharDashboard(); },
    },
    {
      titulo: 'Os números da cidade',
      texto: 'Críticas, prazo estourado e em atendimento: só o que pede ação. Cada número é um atalho para o filtro de Situação (aparece como chip); clicar de novo desfaz. A satisfação e os demais indicadores ficam no dashboard.',
      dica: 'Clique em "prazo estourado" e veja o mapa filtrar.',
      rota: '#/painel', alvo: '#kpis',
    },
    {
      titulo: '⚙ Filtros: um lugar só',
      texto: 'Tudo o que filtra fica aqui. No topo, a visualização (um jeito de olhar a cidade, salvo: filtros + widgets); abaixo, situação, gravidade, secretarias e bairro. Valem na hora para o mapa, os alertas e o dashboard. O botão Filtros mostra a visualização em uso, e os filtros ligados viram chips sobre o mapa: o ✕ tira um de cada vez. Os números do topo são atalhos para estes mesmos filtros; o clique num bairro abre o painel dele, com o botão para filtrar por ele.',
      dica: 'Troque a visualização para "Saúde" (os leitos aparecem primeiro), depois "Chuva e obras", e volte para "Cidade inteira".',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'filtros') document.getElementById('btn-filtros').click(); },
    },
    {
      titulo: 'Cada ponto é um problema',
      texto: 'Todos já estão com alguém, com responsável e prazo correndo. Cor = gravidade, ícone = tipo. Pontos próximos viram um círculo com o total, na cor do mais grave e com um anel mostrando a mistura; clicar nele aproxima. O zoom também separa (rodinha do mouse ou os botões + e −). Os que pulsam passaram do prazo: esses, sim, são com o prefeito. A ◧ Legenda explica as cores e conta o que está no mapa.',
      dica: 'Passe o mouse num ponto. Aperte N para simular uma ocorrência: ela chega já encaminhada.',
      rota: '#/painel', alvo: '#mapa',
      antes: () => { fecharGaveta(); window.scrollTo(0, 0); },
    },
    {
      // Indicadores pedidos no workshop de 04/11 (docs/specs/2026-11-05-vila-dourada-indicadores-workshop.md).
      titulo: '🗂 Camadas: os indicadores no mapa',
      texto: 'Além dos problemas, o mapa mostra a cidade funcionando. Leitos: a ocupação de cada hospital e UPA. B.O.s: o calor da criminalidade em 30 dias. Áreas de risco: onde a chuva prevista vai alagar ou deslizar, antes de acontecer. Obras: no prazo, atrasadas e paradas. Escolas: onde faltam professores. Frota e linhas: ônibus, ambulâncias e a espera nos pontos. Coleta de lixo: as rotas e o caminhão na rua agora. Clicar em qualquer ponto mostra os números.',
      dica: 'Ligue "Áreas de risco": o Morro da Vila Nova está vermelho e ainda não foi atingido. Depois experimente "Coleta de lixo".',
      rota: '#/painel', alvo: '#painel-camadas', lado: 'esquerda',
      antes: () => {
        fecharGaveta();
        window.scrollTo(0, 0);
        const painel = document.getElementById('painel-camadas');
        if (painel && painel.hidden) document.getElementById('btn-camadas').click();
      },
    },
    {
      titulo: '🔔 Alertas: o que precisa de você',
      texto: 'Uma gaveta pela direita, sem cobrir o mapa. A primeira aba só traz o que fugiu do normal, e cada item diz o porquê: ⏰ prazo estourado, 🤝 envolve mais de uma secretaria ou 🔁 problema que se repete no bairro. A outra aba lista todos os ativos.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'atencao') document.getElementById('btn-alertas').click(); },
    },
    {
      titulo: 'A gaveta mostra o motivo',
      texto: 'A regra que disparou, os números, o prazo com o responsável e a linha do tempo. Nada de achismo.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (!gavetaAberta()) { const c = cartaoHospital(); if (c) c.click(); } },
    },
    {
      titulo: 'Agir: ele não aciona, ele cobra',
      texto: '📣 Cobrar: a secretaria responde no chat e a ocorrência volta a andar. ⚡ Priorizar: o prazo cai pela metade. 🚨 Gabinete de crise: quando envolve mais de uma secretaria, todas confirmam presença.',
      dica: 'Clique em 📣 Cobrar e veja a resposta no ' + GC.agente() + '.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (!gavetaAberta()) { const c = cartaoHospital(); if (c) c.click(); } },
    },
    {
      titulo: '✨ ' + GC.agente() + '',
      texto: 'O prefeito também pode perguntar: leitos de UTI, onde vai alagar, obras atrasadas, falta de professores, frota, coleta de lixo… A resposta vem com gráfico, a recomendação, de onde saíram os números e um botão que abre a camada certa no mapa. A IA aqui é simulada; o painel já fala o formato da IA real.',
      dica: 'Clique em "Como estão os leitos de UTI?" e depois no botão "Ver Hospital Municipal no mapa". Esc limpa o mapa.',
      rota: '#/painel', alvo: '#gavetas', lado: 'esquerda',
      antes: () => { if (gavetaDaVez() !== 'copiloto') document.getElementById('chat-aba').click(); },
    },
    {
      titulo: '▦ Dashboard e widgets',
      texto: 'Clique em Indicadores, na base do mapa: a gaveta sobe e cobre a tela inteira, com duas abas: Painel (os widgets e o seletor de visualização) e Metas e fichas (cada indicador com meta, fórmula e fonte). Nos widgets maiores, o cartão traz o resumo e "Ver detalhes" abre a lista completa. Há um widget para cada tema do workshop: leitos, segurança (com violência contra mulheres e crianças, só por bairro), risco climático, obras, educação, frota e coleta de lixo. Quais aparecem, e em que ordem, se escolhe em ⋯ → Configurar widgets; as visualizações prontas (Saúde, Segurança, Educação, Chuva e obras, Frota e transporte, Limpeza Urbana) já trazem os certos.',
      dica: 'Clique em ▦ Configurar widgets e desligue um widget.',
      rota: '#/painel', alvo: '#widgets',
      antes: () => { fecharGaveta(); if (document.getElementById('ir-dashboard').getAttribute('aria-expanded') !== 'true') document.getElementById('ir-dashboard').click(); },
    },
    {
      titulo: 'Quem está dando conta',
      texto: 'Se o prefeito não aciona cada coisa, ele precisa saber quem entrega: quanto foi resolvido no mês, quanto ficou no prazo e quem está atrasando.',
      rota: '#/secretarias', alvo: '#tela-secretarias',
    },
    {
      titulo: 'Uma página por secretaria',
      texto: 'Evolução de 12 meses, com a meta e a projeção da IA. Os marcos mostram se uma ação funcionou, como os lembretes por WhatsApp na espera das UBS. Do lado, as metas do plano de governo.',
      rota: '#/secretaria/saude', alvo: '#tela-secretaria',
    },
    {
      titulo: 'Relatório pronto para a reunião',
      texto: 'O executivo dos últimos 30 dias, com recomendações: quem cobrar, sobre o quê e por quê. Também por secretaria, bairro ou só alertas, em 7, 30, 90 dias ou 12 meses.',
      dica: 'Clique em ⬇ PDF.',
      rota: '#/relatorios/executivo/-/30', alvo: '#tela-relatorios',
    },
    {
      titulo: '🔔 Central de alertas',
      texto: 'A versão completa da gaveta Alertas (o link fica no rodapé dela): tudo o que está acontecendo, numa tabela, e as regras que disparam cada alerta. Regra gerando alarme demais? Pause: o alerta fica retido até religar.',
      dica: 'Desligue a regra Queda de energia e aperte N duas vezes.',
      rota: '#/alertas', alvo: '#tela-alertas',
    },
    {
      titulo: '🗄 De onde vêm os números',
      texto: 'As tabelas por trás de todo o painel. Dá para conferir e baixar tudo: os números batem.',
      rota: '#/dados', alvo: '#tela-dados',
    },
    {
      titulo: '🏙 Do tamanho da sua cidade',
      texto: 'A mesma demonstração em três portes: Arraial do Sol (22 mil habitantes, 7 bairros), Vila Dourada (250 mil, 25 bairros) e Nova Aurora (2,5 milhões, 123 bairros, porte de Fortaleza). Ocorrências, leitos, B.O.s, obras, escolas, frota, coleta e as respostas do ' + GC.agente() + ' acompanham o tamanho da cidade.',
      dica: 'Escolha outra cidade no menu ⋯: o painel recarrega com ela (o tour recomeça em ⋯ → Tour guiado).',
      rota: '#/painel', alvo: '#menu-mais', lado: 'esquerda',
      antes: () => {
        window.scrollTo(0, 0);
        const menu = document.getElementById('menu-mais');
        if (menu && menu.hidden) document.getElementById('btn-mais').click();
      },
    },
    {
      titulo: 'É isso!',
      texto: 'Tudo o que o prefeito precisa saber da cidade, num lugar só: ele vê a cidade, entende o que saiu do normal (e o que vai sair, como a chuva nas encostas), age só ali e acompanha quem entrega. Próximos passos: dados reais das secretarias, login e a IA real.',
      rota: '#/painel',
      antes: () => window.scrollTo(0, 0),
    },
  ];

  // Qual gaveta (Filtros, Widgets, Visualizações, Copiloto, alerta) está aberta.
  const gavetaDaVez = () => document.getElementById('gavetas').dataset.aberta || null;
  const gavetaAberta = () => gavetaDaVez() === 'alerta';

  // Qualquer gaveta fecha no Esc.
  function fecharGaveta() {
    if (gavetaDaVez()) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function cartaoHospital() {
    const cartoes = [...document.querySelectorAll('#gaveta-atencao .alerta-item')];
    return cartoes.find((c) => /hospital/i.test(c.textContent)) || cartoes[0];
  }

  // Alvo visível do passo (null: cartão no centro da tela).
  function elementoAlvo(passo) {
    const el = passo.alvo && document.querySelector(passo.alvo);
    return el && el.getBoundingClientRect().width ? el : null;
  }

  GC.criarTour = function () {
    const foco = document.createElement('div');
    foco.className = 'tour-foco';
    const cartao = document.createElement('div');
    cartao.className = 'tour-cartao';
    cartao.setAttribute('role', 'dialog');
    cartao.setAttribute('aria-live', 'polite');
    let atual = -1;
    let relogio = null;

    function posicionar() {
      const passo = PASSOS[atual];
      const el = passo && elementoAlvo(passo);
      const vw = innerWidth;
      const vh = innerHeight;
      const m = 16;
      const c = cartao.getBoundingClientRect();
      if (!el) {
        foco.classList.add('sem-alvo');
        Object.assign(foco.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
        Object.assign(cartao.style, { left: `${(vw - c.width) / 2}px`, top: `${(vh - c.height) / 2}px` });
        return;
      }
      foco.classList.remove('sem-alvo');
      // Recorta o alvo à janela (as telas com rolagem passam da altura da tela).
      const b = el.getBoundingClientRect();
      const r = { left: Math.max(b.left, 0), top: Math.max(b.top, 0), right: Math.min(b.right, vw), bottom: Math.min(b.bottom, vh) };
      Object.assign(foco.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.right - r.left + 12}px`, height: `${r.bottom - r.top + 12}px` });

      const limitar = (v, min, max) => Math.min(Math.max(v, min), max);
      const xAlinhado = limitar(r.left, m, vw - c.width - m);
      const yAlinhado = limitar(r.top, m, vh - c.height - m);
      const opcoes = [
        { lado: 'abaixo', left: xAlinhado, top: r.bottom + 14, cabe: r.bottom + 14 + c.height <= vh - m },
        { lado: 'acima', left: xAlinhado, top: r.top - 14 - c.height, cabe: r.top - 14 - c.height >= m },
        { lado: 'direita', left: r.right + 14, top: yAlinhado, cabe: r.right + 14 + c.width <= vw - m },
        { lado: 'esquerda', left: r.left - 14 - c.width, top: yAlinhado, cabe: r.left - 14 - c.width >= m },
      ].sort((a, b) => (b.lado === passo.lado) - (a.lado === passo.lado));
      // Alvo grande (uma tela inteira): o cartão fica por cima, no canto de baixo.
      const pos = opcoes.find((o) => o.cabe) || { left: limitar(r.right - c.width - 24, m, vw - c.width - m), top: limitar(r.bottom - c.height - 24, m, vh - c.height - m) };
      Object.assign(cartao.style, { left: `${pos.left}px`, top: `${pos.top}px` });
    }

    function desenhar() {
      const passo = PASSOS[atual];
      const ultimo = atual === PASSOS.length - 1;
      cartao.innerHTML = `
        <div class="tour-topo"><span>Passo ${atual + 1} de ${PASSOS.length}</span><button type="button" class="tour-sair" aria-label="Sair do tour">✕</button></div>
        <h3>${GC.escaparHtml(passo.titulo)}</h3>
        <p>${GC.escaparHtml(passo.texto)}</p>
        ${passo.dica ? `<p class="tour-dica">👉 ${GC.escaparHtml(passo.dica)}</p>` : ''}
        <div class="tour-barra"><i style="width:${((atual + 1) / PASSOS.length) * 100}%"></i></div>
        <div class="tour-pe">
          <button type="button" class="btn-sec tour-voltar"${atual === 0 ? ' disabled' : ''}>← Voltar</button>
          <button type="button" class="tour-proximo">${ultimo ? 'Concluir ✓' : 'Próximo →'}</button>
        </div>`;
      cartao.querySelector('.tour-sair').onclick = encerrar;
      cartao.querySelector('.tour-voltar').onclick = () => ir(atual - 1);
      cartao.querySelector('.tour-proximo').onclick = () => (ultimo ? encerrar() : ir(atual + 1));
      posicionar();
    }

    function ir(i) {
      if (i < 0 || i >= PASSOS.length) return;
      atual = i;
      const passo = PASSOS[i];
      const trocouTela = passo.rota && location.hash !== passo.rota;
      if (passo.rota && passo.rota !== '#/painel') fecharGaveta();
      if (trocouTela) location.hash = passo.rota;
      // Vindo de outra tela, o painel dela leva um instante para sair da frente do mapa.
      if (passo.antes) setTimeout(passo.antes, trocouTela ? 450 : 0);
      desenhar();
    }

    function teclas(ev) {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (ev.key === 'ArrowRight') ir(atual + 1);
      if (ev.key === 'ArrowLeft') ir(atual - 1);
    }

    function iniciar(passo = 1) {
      if (atual >= 0) return;
      document.body.append(foco, cartao);
      document.addEventListener('keydown', teclas);
      // Telas, gaveta e mapa mudam de tamanho com transições: o destaque acompanha.
      relogio = setInterval(posicionar, 200);
      addEventListener('resize', posicionar);
      ir(Math.min(Math.max(passo, 1), PASSOS.length) - 1);
    }

    function encerrar() {
      atual = -1;
      clearInterval(relogio);
      removeEventListener('resize', posicionar);
      document.removeEventListener('keydown', teclas);
      foco.remove();
      cartao.remove();
    }

    return { iniciar, encerrar, passos: PASSOS };
  };

  document.addEventListener('DOMContentLoaded', () => {
    const tour = GC.criarTour();
    document.getElementById('btn-tour').addEventListener('click', () => tour.iniciar());
    const pedido = location.search.match(/[?&]tour(?:=(\d+))?/);
    if (pedido) setTimeout(() => tour.iniciar(Number(pedido[1]) || 1), 1500);
  });
})(window.GC = window.GC || {});
