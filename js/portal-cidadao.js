(function (GC) {
  // Portal do Cidadão (cidadao.html). Cinco abas, cada uma com endereço próprio (#/inicio, #/bairro,
  // #/mapa, #/servicos, #/numeros): o voltar do navegador funciona e um link leva direto à aba.
  // O conteúdo vem de GC.conteudoCidadao (js/tela-cidadao.js); o mapa, de GC.criarMapaCidadao.
  // O bairro do morador fica salvo neste aparelho. Avisos novos (inclusive comunicados publicados pelo
  // gabinete de crise em outra aba do painel) aparecem sozinhos.
  const $ = (id) => document.getElementById(id);
  const esc = (t) => GC.escaparHtml(t);
  const ic = (nome, classe) => `<i class="ti ti-${nome}${classe ? ` ${classe}` : ''}" aria-hidden="true"></i>`;
  const ABAS = [
    { id: 'inicio', nome: 'Início', icone: 'home' },
    { id: 'bairro', nome: 'Meu bairro', icone: 'map-pin' },
    { id: 'mapa', nome: 'Mapa', icone: 'map-2' },
    { id: 'servicos', nome: 'Serviços', icone: 'phone' },
    { id: 'numeros', nome: 'A cidade em números', curto: 'Números', icone: 'chart-bar' },
  ];
  const CAMADAS = [
    { id: 'avisos', nome: 'Avisos', icone: 'alert-triangle' },
    { id: 'saude', nome: 'Hospitais e UPAs', icone: 'building-hospital' },
    { id: 'escolas', nome: 'Escolas', icone: 'school' },
    { id: 'obras', nome: 'Obras', icone: 'crane' },
  ];
  // Camada do conteúdo → camada do mapa do cidadão (coleta e ônibus não têm pino público).
  const CAMADA_MAPA = { risco: 'avisos', saude: 'saude', leitos: 'saude', escolas: 'escolas', obras: 'obras' };
  const PASSO_MS = 20000;
  const CIDADE = GC.cidade ? GC.cidade.id : 'media';
  const CHAVE_BAIRRO = `vd-meu-bairro.${CIDADE}`;
  const CHAVE_GABINETES = `gc.gabinetes.${CIDADE}`;
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: vale só nesta visita */ } };
  const nomeBairro = (id) => (GC.data.bairros.find((b) => b.id === id) || { nome: id }).nome;

  document.addEventListener('DOMContentLoaded', () => {
    const store = GC.criarStore(GC.data);
    let bairro = GC.data.bairros.some((b) => b.id === ler(CHAVE_BAIRRO)) ? ler(CHAVE_BAIRRO) : null;
    let busca = '';
    let aba = null;
    let mapa = null;
    let bairroNoMapa = null;
    // Começa só com o que pede atenção e com urgência (avisos, hospitais); escolas e obras, num toque.
    let camadasMapa = new Set(['avisos', 'saude']);
    let conteudo = null;
    let avisosVistos = null;

    // Comunicados dos gabinetes de crise (salvos pelo painel do gestor neste navegador). O portal só lê.
    function comunicados() {
      if (!GC.criarGabinetes) return [];
      const g = GC.criarGabinetes({ armazenamento: { ler() { try { return JSON.parse(ler(CHAVE_GABINETES)); } catch (e) { return null; } }, gravar() {} } });
      const agora = GC.agora();
      const SEIS_H = 6 * 3600000;
      return g.todos().filter((x) => !x.encerradoEm || agora - x.encerradoEm < SEIS_H)
        .flatMap((x) => x.comunicados.map((c) => ({ t: c.t, texto: c.texto, titulo: `Comunicado da Prefeitura · ${x.titulo}`, bairroId: x.bairroId || null })));
    }
    const calcular = (b = bairro) => GC.conteudoCidadao({ ocorrencias: store.ocorrencias(), comunicados: comunicados(), bairro: b, busca, agora: GC.agora() });

    // ---------- cabeçalho, abas e diálogos ----------
    const nomeCidade = (GC.cidade && GC.cidade.nome) || 'Vila Dourada';
    $('p-cidade').textContent = nomeCidade;
    $('p-cidade-rodape').textContent = nomeCidade;
    document.title = `${nomeCidade} · Prefeitura`;
    $('p-abas').innerHTML = ABAS.map((a) => `<a href="#/${a.id}" class="p-aba-link" data-aba="${a.id}"><span class="p-aba-ic">${ic(a.icone)}</span><span class="p-rot-longo">${esc(a.nome)}</span><span class="p-rot-curto">${esc(a.curto || a.nome)}</span></a>`).join('');

    const ordenados = GC.data.bairros.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    function abrirEscolhaBairro() {
      const sel = $('p-sel-bairro');
      sel.innerHTML = `<option value="">Escolha…</option>${ordenados.map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join('')}`;
      sel.value = bairro || '';
      $('p-geo-msg').textContent = '';
      $('p-dlg-bairro').showModal();
    }
    $('p-dlg-bairro').addEventListener('close', () => {
      const d = $('p-dlg-bairro');
      if (d.returnValue === 'ok' && $('p-sel-bairro').value) definirBairro($('p-sel-bairro').value);
    });
    function definirBairro(id) {
      bairro = id;
      gravar(CHAVE_BAIRRO, id);
      desenhar();
    }
    $('p-meu-bairro').onclick = abrirEscolhaBairro;

    // Demonstração: trocar de perfil (vai para o painel do gestor) ou de cidade.
    $('p-demo').onclick = () => {
      const perfis = GC.PERFIS || [];
      const p = (id) => perfis.find((x) => x.id === id) || { nome: id };
      $('p-sel-perfil').innerHTML = `<option value="cidadao">Cidadão (este portal)</option>
        <option value="prefeito">${esc(p('prefeito').nome)} (Prefeito)</option>
        <optgroup label="Gestor do setor">${GC.data.areas.map((a) => `<option value="setor:${a.id}">${esc(a.secretaria.nome)}</option>`).join('')}</optgroup>`;
      const hab = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi hab.` : `${Math.round(n / 1000)} mil hab.`);
      $('p-sel-cidade').innerHTML = (GC.CIDADES || []).map((c) => `<option value="${c.id}">${esc(`${c.nome} · ${hab(c.populacao)}`)}</option>`).join('');
      $('p-sel-cidade').value = CIDADE;
      $('p-dlg-demo').showModal();
    };
    $('p-dlg-demo').addEventListener('close', () => {
      if ($('p-dlg-demo').returnValue !== 'ok') return;
      const [id, area] = $('p-sel-perfil').value.split(':');
      if (id !== 'cidadao') { GC.escolherPerfil(id, area); return; }
      if ($('p-sel-cidade').value !== CIDADE) GC.escolherCidade($('p-sel-cidade').value);
    });

    // ---------- pedaços de HTML ----------
    const nivel = (n) => `<span class="p-nivel ${n}">${ic(n === 'urgente' ? 'alert-octagon' : n === 'atencao' ? 'alert-triangle' : 'info-circle')}${esc(GC.NIVEIS_AVISO[n])}</span>`;
    const temNoMapa = (camada) => camada && CAMADA_MAPA[camada[0]];
    const botaoMapa = (camada, bairroId, rotulo = 'Ver no mapa') => (temNoMapa(camada) || bairroId
      ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-mapa="${esc(camada ? camada[0] : '')}" data-id="${esc(camada && camada[1] ? camada[1] : '')}" data-bairro="${esc(bairroId || '')}">${ic('map-2')} ${esc(rotulo)}</button>` : '');

    function htmlAviso(a) {
      const pinos = (a.pontos || []).filter((p) => p.lat !== undefined);
      return `<li class="p-aviso ${a.nivel} ${a.tipo}" data-aviso-id="${esc(a.id)}">
        <div class="p-aviso-cab">${nivel(a.nivel)}${a.tipo === 'comunicado' ? `<span class="p-tag">${ic('speakerphone')} Comunicado oficial</span>` : ''}${a.doMeuBairro && a.tipo !== 'comunicado' ? `<span class="p-tag p-tag-bairro">${ic('map-pin')} Seu bairro</span>` : ''}${a.quando !== null && a.quando !== undefined ? `<span class="p-quando">${esc(GC.haQuanto(a.quando))}</span>` : ''}</div>
        <h3>${esc(a.titulo)}</h3>
        <p>${esc(a.texto)}</p>
        ${a.locais && a.locais.length ? `<ul class="p-locais">${a.locais.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <div class="p-aviso-acoes">
          ${pinos.length ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-aviso="${esc(a.id)}">${ic('map-2')} Ver no mapa</button>` : ''}
          <button type="button" class="p-btn p-btn-sec p-btn-mini" data-compartilhar="${esc(a.id)}" aria-label="Compartilhar o aviso: ${esc(a.titulo)}">${ic('share')} Compartilhar</button>
        </div>
      </li>`;
    }

    // Versão curta para a Início: nível, título e há quanto tempo; o resto abre num toque.
    const ICONE_NIVEL = { urgente: 'alert-octagon', atencao: 'alert-triangle', informativo: 'info-circle' };
    function htmlAvisoCompacto(a) {
      const pinos = (a.pontos || []).filter((p) => p.lat !== undefined);
      return `<li class="p-aviso-c ${a.nivel} ${a.tipo}" data-aviso-id="${esc(a.id)}">
        <details data-pergunta="aviso:${esc(a.id)}">
          <summary>
            <span class="p-aviso-c-ic" aria-hidden="true">${ic(a.tipo === 'comunicado' ? 'speakerphone' : ICONE_NIVEL[a.nivel] || 'info-circle')}</span>
            <span class="p-aviso-c-txt">
              <span class="p-aviso-cab">${nivel(a.nivel)}${a.tipo === 'comunicado' ? `<span class="p-tag">${ic('speakerphone')} Comunicado oficial</span>` : ''}${a.doMeuBairro && a.tipo !== 'comunicado' ? `<span class="p-tag p-tag-bairro">${ic('map-pin')} Seu bairro</span>` : ''}${a.quando !== null && a.quando !== undefined ? `<span class="p-quando">${esc(GC.haQuanto(a.quando))}</span>` : ''}</span>
              <b class="p-aviso-c-tit">${esc(a.titulo)}</b>
            </span>
            ${ic('chevron-down', 'p-faq-seta')}
          </summary>
          <div class="p-aviso-c-corpo">
            <p>${esc(a.texto)}</p>
            ${a.locais && a.locais.length ? `<ul class="p-locais">${a.locais.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
            <div class="p-aviso-acoes">
              ${pinos.length ? `<button type="button" class="p-btn p-btn-sec p-btn-mini" data-aviso="${esc(a.id)}">${ic('map-2')} Ver no mapa</button>` : ''}
              <button type="button" class="p-btn p-btn-sec p-btn-mini" data-compartilhar="${esc(a.id)}" aria-label="Compartilhar o aviso: ${esc(a.titulo)}">${ic('share')} Compartilhar</button>
            </div>
          </div>
        </details>
      </li>`;
    }
    const ATALHOS = [
      { nome: 'Pedir serviço', icone: 'tool', href: '#/servicos', cor: 'ouro' },
      { nome: 'Telefones', icone: 'phone-call', href: '#/servicos', foco: 'contatos', cor: 'verde' },
      { nome: 'Dúvidas', icone: 'help-circle', href: '#/servicos', foco: 'faq', cor: 'roxo' },
      { nome: 'Números', icone: 'chart-donut', href: '#/numeros', cor: 'azul' },
    ];

    function htmlInicio(c) {
      const meu = c.meuBairro;
      const urgenteAqui = c.avisos.some((a) => a.doMeuBairro && a.nivel === 'urgente' && a.tipo !== 'comunicado');
      const hoje = meu.escolhido
        ? `<section class="p-card p-hoje" aria-labelledby="t-hoje">
            <div class="p-card-cab"><h2 id="t-hoje">${ic('sun')} Hoje em ${esc(meu.nome)}</h2><button type="button" class="p-link" data-trocar-bairro>Trocar bairro</button></div>
            <ul class="p-hoje-lista">${c.hoje.map((h) => `<li class="${h.nivel}">${ic(h.icone)}<span>${esc(h.texto)}</span></li>`).join('')}</ul>
            <a class="p-link" href="#/bairro">Tudo sobre ${esc(meu.nome)} ${ic('arrow-right')}</a>
          </section>`
        : `<section class="p-card p-pergunta-bairro" aria-labelledby="t-qual">
            <h2 id="t-qual">${ic('map-pin')} Qual é o seu bairro?</h2>
            <p>Escolha o seu bairro para ver primeiro o que acontece perto de você: avisos, coleta de lixo, posto de saúde e escolas.</p>
            <button type="button" class="p-btn" data-trocar-bairro>${ic('map-pin')} Escolher meu bairro</button>
          </section>`;
      const emergencia = urgenteAqui ? `<aside class="p-emergencia" aria-label="Telefones de emergência">${ic('phone-call')}<p><b>Em perigo?</b> Ligue <a href="tel:199">199</a> (Defesa Civil), <a href="tel:193">193</a> (Bombeiros) ou <a href="tel:192">192</a> (SAMU).</p></aside>` : '';
      const urgentes = c.avisos.filter((a) => a.nivel === 'urgente').length;
      return `${emergencia}
        ${hoje}
        <nav class="p-atalhos" aria-label="Acesso rápido">
          ${ATALHOS.map((a) => `<a class="p-atalho ${a.cor}" href="${a.href}"${a.foco ? ` data-foco="${a.foco}"` : ''}><span class="p-atalho-ic" aria-hidden="true">${ic(a.icone)}</span><span>${esc(a.nome)}</span></a>`).join('')}
        </nav>
        <section class="p-card" aria-labelledby="t-avisos">
          <div class="p-card-cab"><h2 id="t-avisos">${ic('speakerphone')} Avisos da Prefeitura</h2>${c.avisos.length ? `<span class="p-contagem">${urgentes ? `<span class="p-contagem-urg">${urgentes} ${urgentes > 1 ? 'urgentes' : 'urgente'}</span> · ` : ''}${c.avisos.length} no total</span>` : ''}</div>
          ${c.avisos.length ? `<p class="p-dica">Toque num aviso para ver os detalhes, o mapa e compartilhar.</p><ul class="p-avisos-c">${c.avisos.map(htmlAvisoCompacto).join('')}</ul>` : `<p class="p-vazio">${ic('circle-check')} Nenhum aviso agora.</p>`}
        </section>`;
    }

    function htmlItensBairro(meu) {
      return `<ul class="p-itens">${meu.itens.map((i) => `<li class="p-item${i.nivel ? ` ${i.nivel}` : ''}">
        <span class="p-item-ic">${ic(i.icone)}</span>
        <div><h3>${esc(i.titulo)}</h3>${i.destaque ? `<p class="p-destaque">${esc(i.destaque)}</p>` : ''}
          <ul class="p-linhas">${(i.linhas || [i.texto]).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          ${botaoMapa(temNoMapa(i.camada) ? i.camada : null, meu.id)}</div></li>`).join('')}</ul>`;
    }

    function htmlBairro(c) {
      const meu = c.meuBairro;
      const avisos = c.avisos.filter((a) => a.doMeuBairro && a.tipo !== 'comunicado');
      return `<div class="p-cab p-cab-linha"><div><h1 id="t-bairro">${esc(meu.nome)}</h1><p>${meu.escolhido ? 'Seu bairro. Serviços e avisos de hoje.' : 'Você ainda não escolheu o seu bairro: mostrando o Centro.'}</p></div>
          <button type="button" class="p-btn p-btn-sec" data-trocar-bairro>${ic('map-pin')} ${meu.escolhido ? 'Trocar bairro' : 'Escolher meu bairro'}</button></div>
        ${avisos.length ? `<section class="p-card" aria-labelledby="t-avisos-bairro"><h2 id="t-avisos-bairro">${ic('speakerphone')} Avisos no bairro</h2><ul class="p-avisos">${avisos.map(htmlAviso).join('')}</ul></section>` : ''}
        <section class="p-card" aria-labelledby="t-servicos-bairro"><h2 id="t-servicos-bairro">${ic('building-community')} Serviços do bairro</h2>${htmlItensBairro(meu)}</section>`;
    }

    function htmlFaq(c) {
      return c.faq.length ? c.faq.map((f, k) => `<details class="p-faq" data-pergunta="${esc(f.pergunta)}"${k === 0 && busca ? ' open' : ''}>
          <summary><small>${esc(f.tema)}</small><span>${esc(f.pergunta)}</span>${ic('chevron-down', 'p-faq-seta')}</summary>
          <p>${esc(f.resposta)}</p>${f.alvo === 'bairro' ? `<a class="p-link" href="#/bairro">Ver o meu bairro ${ic('arrow-right')}</a>` : botaoMapa(temNoMapa(f.camada) ? f.camada : null, null)}</details>`).join('')
        : `<p class="p-vazio">Nenhuma pergunta com esse termo. Ligue <a href="tel:156">156</a> que a Prefeitura responde.</p>`;
    }

    function htmlServicos(c) {
      return `<div class="p-cab"><h1 id="t-servicos">Serviços e contatos</h1><p>Peça um serviço, encontre o telefone certo e tire dúvidas.</p></div>
        <section class="p-card" aria-labelledby="t-pedir">
          <h2 id="t-pedir">${ic('tool')} Pedir um serviço</h2>
          <p>Ligue <b>156</b> (gratuito). Diga o endereço e um ponto de referência; você recebe um número de protocolo para acompanhar o pedido.</p>
          <ul class="p-servicos">${GC.SERVICOS_CIDADAO.map((s) => `<li><a class="p-servico" href="tel:156">${ic(s.icone)}<span>${esc(s.nome)}</span><small>Ligar 156</small></a></li>`).join('')}</ul>
        </section>
        <section class="p-card" aria-labelledby="t-contatos" id="contatos">
          <h2 id="t-contatos">${ic('phone')} Telefones úteis</h2>
          <ul class="p-contatos">${c.contatos.map((t) => `<li><a class="p-contato" href="tel:${t.numero}" aria-label="Ligar ${t.numero}, ${esc(t.nome)}">${ic(t.icone)}<b>${t.numero}</b><span><strong>${esc(t.nome)}</strong><small>${esc(t.texto)}</small></span></a></li>`).join('')}</ul>
        </section>
        <section class="p-card" aria-labelledby="t-faq" id="faq">
          <h2 id="t-faq">${ic('help-circle')} Perguntas frequentes</h2>
          <label class="p-busca">${ic('search')}<span class="p-so-leitor">Buscar nas perguntas frequentes</span><input type="search" id="p-busca" placeholder="Busque: lixo, creche, ônibus, chuva…" value="${esc(busca)}" autocomplete="off"></label>
          <div id="p-faqs" class="p-faqs">${htmlFaq(c)}</div>
        </section>`;
    }

    const SIT = { ok: 'Na meta', atencao: 'Perto da meta', critico: 'Fora da meta', sem_dado: 'Sem dado' };
    function htmlNumeros() {
      const lista = GC.avaliarIndicadores(GC.contextoIndicadores(store, {}), { publico: true });
      const nomeArea = (id) => (id ? (GC.data.areas.find((a) => a.id === id) || { nome: id }).nome : 'Prefeitura');
      const grupos = [...new Set(lista.map((i) => i.area || ''))];
      const conta = (s) => lista.filter((i) => i.situacao === s).length;
      const placar = ['ok', 'atencao', 'critico'].map((s) => `<li class="${s}"><b>${conta(s)}</b> ${SIT[s].toLowerCase()}</li>`).join('');
      const barra = ['ok', 'atencao', 'critico'].filter((s) => conta(s)).map((s) => `<span class="${s}" style="flex-grow:${conta(s)}"></span>`).join('');
      const fmt = (v, u) => (v === null || v === undefined ? 'sem dado' : GC.formatarIndicador(v, u));
      // Régua até a meta: a barra é o valor de hoje, o traço é a meta (a cor e o texto dizem se está bem).
      const medidor = (i) => {
        const v = Number(i.valorAtual);
        const m = Number(i.metaAtual);
        if (i.valorAtual === null || i.valorAtual === undefined || !Number.isFinite(v) || !Number.isFinite(m) || Math.max(v, m) <= 0) return '';
        const max = Math.max(v, m) * 1.15;
        const pct = (x) => Math.max(0, Math.min(100, (x / max) * 100)).toFixed(1);
        return `<span class="p-medidor ${i.situacao}" aria-hidden="true"><span class="p-medidor-v" style="width:${pct(v)}%"></span><span class="p-medidor-meta" style="left:${pct(m)}%"></span></span>`;
      };
      const ICONE_AREA = { saude: 'heartbeat', educacao: 'school', seguranca: 'shield-check', defesa_civil: 'umbrella', infraestrutura: 'crane', mobilidade: 'bus', limpeza: 'recycle' };
      return `<div class="p-cab"><h1 id="t-numeros">A cidade em números</h1><p>Como ${esc((GC.cidade && GC.cidade.nome) || 'a cidade')} está em relação às metas da Prefeitura. Os números são atualizados conforme cada área informa.</p></div>
        <section class="p-card p-resumo-metas" aria-label="Resumo das metas">
          <div class="p-placar-barra" aria-hidden="true">${barra}</div>
          <ul class="p-placar">${placar}</ul>
        </section>
        ${grupos.map((g) => `<section class="p-card" aria-labelledby="t-ind-${esc(g || 'geral')}"><h2 id="t-ind-${esc(g || 'geral')}"><span class="p-area-ic ${esc(g || 'geral')}" aria-hidden="true">${ic(ICONE_AREA[g] || 'building-bank')}</span> ${esc(nomeArea(g))}</h2>
          <ul class="p-indicadores">${lista.filter((i) => (i.area || '') === g).map((i) => `<li>
            <details class="p-ind ${i.situacao}" data-pergunta="${esc(i.id)}">
              <summary>
                <div class="p-ind-nome"><h3>${esc(i.nome)}</h3>${i.detalheAtual ? `<p>${esc(i.detalheAtual)}</p>` : ''}</div>
                <div class="p-ind-valor"><b>${esc(fmt(i.valorAtual, i.unidade))}</b><small>meta ${i.polaridade === 'menor' ? 'até' : 'de pelo menos'} ${esc(fmt(i.metaAtual, i.unidade))}</small><span class="p-sit ${i.situacao}">${esc(SIT[i.situacao] || '')}</span></div>
                ${medidor(i)}
                <span class="p-ind-mais">${ic('chevron-down', 'p-faq-seta')} Como é medido</span>
              </summary>
              <dl class="p-ind-ficha">
                ${i.formula ? `<dt>Como é calculado</dt><dd>${esc(i.formula)}</dd>` : ''}
                ${i.fonte ? `<dt>De onde vem o dado</dt><dd>${esc(i.fonte)}</dd>` : ''}
                ${i.frequenciaAtual ? `<dt>Atualização</dt><dd>${esc(i.frequenciaAtual)}</dd>` : ''}
                <dt>Meta</dt><dd>${i.polaridade === 'menor' ? 'Quanto menor, melhor: até' : 'Quanto maior, melhor: pelo menos'} ${esc(fmt(i.metaAtual, i.unidade))}.</dd>
              </dl>
            </details>
          </li>`).join('')}</ul></section>`).join('')}`;
    }

    // ---------- mapa ----------
    // Legenda aberta no computador; no celular fica recolhida para não cobrir o mapa.
    if (window.matchMedia && matchMedia('(min-width: 760px)').matches) $('p-legenda-caixa').open = true;
    $('p-camadas').innerHTML = CAMADAS.map((c) => `<button type="button" class="p-camada" data-camada="${c.id}" aria-pressed="${camadasMapa.has(c.id)}">${ic(c.icone)} ${esc(c.nome)}</button>`).join('');
    $('p-camadas').querySelectorAll('[data-camada]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.camada;
        if (camadasMapa.has(id)) camadasMapa.delete(id); else camadasMapa.add(id);
        b.setAttribute('aria-pressed', String(camadasMapa.has(id)));
        if (mapa) mapa.camadas(camadasMapa);
      };
    });
    function garantirMapa() {
      if (mapa !== null) return mapa;
      const risco = GC.risco ? GC.risco.resumo(store.ocorrencias()).areas : [];
      mapa = GC.criarMapaCidadao($('p-mapa'), { aoBairro: mostrarBairroNoMapa, areasRisco: risco }) || false;
      if (mapa) {
        mapa.pontos(GC.pontosMapaCidadao(conteudo));
        mapa.camadas(camadasMapa);
      }
      return mapa;
    }
    // Clique num bairro: o resumo do bairro na versão do cidadão (nunca o painel do gestor).
    function mostrarBairroNoMapa(id) {
      bairroNoMapa = id;
      if (mapa) mapa.selecionarBairro(id, { voar: false });
      desenharBairroNoMapa();
      $('p-mapa-bairro').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function desenharBairroNoMapa() {
      const el = $('p-mapa-bairro');
      if (!bairroNoMapa) { el.innerHTML = ''; return; }
      const c = calcular(bairroNoMapa);
      const avisos = c.avisos.filter((a) => a.doMeuBairro && a.tipo !== 'comunicado');
      el.innerHTML = `<section class="p-card" aria-labelledby="t-bairro-mapa">
        <div class="p-card-cab"><h2 id="t-bairro-mapa">${ic('map-pin')} ${esc(c.meuBairro.nome)}</h2>
          <button type="button" class="p-x" data-fechar-bairro aria-label="Fechar o bairro">${ic('x')}</button></div>
        ${avisos.length ? `<ul class="p-avisos">${avisos.map(htmlAviso).join('')}</ul>` : `<p class="p-vazio">${ic('circle-check')} Nenhum aviso neste bairro agora.</p>`}
        ${htmlItensBairro(c.meuBairro).replace(/<button[^>]*data-mapa[^>]*>[\s\S]*?<\/button>/g, '')}
        ${bairro === bairroNoMapa ? '' : `<button type="button" class="p-btn p-btn-sec" data-tornar-meu="${esc(bairroNoMapa)}">${ic('home')} Este é o meu bairro</button>`}
      </section>`;
      ligar(el);
      const x = el.querySelector('[data-fechar-bairro]');
      if (x) x.onclick = () => { bairroNoMapa = null; if (mapa) mapa.selecionarBairro(null, { voar: false }); desenharBairroNoMapa(); };
      const t = el.querySelector('[data-tornar-meu]');
      if (t) t.onclick = () => definirBairro(t.dataset.tornarMeu);
    }
    function verNoMapa({ camada, id, bairroId, aviso }) {
      irPara('mapa');
      setTimeout(() => {
        const m = garantirMapa();
        if (!m) return;
        m.redimensionar();
        if (aviso) {
          const a = conteudo.avisos.find((x) => x.id === aviso);
          const p = a && (a.pontos || []).find((x) => x.lat !== undefined);
          if (!camadasMapa.has('avisos')) $('p-camadas').querySelector('[data-camada="avisos"]').click();
          if (!m.focar('avisos', aviso) && p) m.focarPonto(p.lat, p.lng);
          return;
        }
        const alvo = CAMADA_MAPA[camada];
        if (alvo && !camadasMapa.has(alvo)) $('p-camadas').querySelector(`[data-camada="${alvo}"]`).click();
        const achou = alvo && alvo !== 'avisos' && m.focar(alvo, id);
        if (!achou && bairroId) { m.selecionarBairro(bairroId); mostrarBairroNoMapa(bairroId); }
      }, 60);
    }

    // ---------- desenho ----------
    function ligar(raiz) {
      raiz.querySelectorAll('[data-trocar-bairro]').forEach((b) => { b.onclick = abrirEscolhaBairro; });
      raiz.querySelectorAll('[data-aviso]').forEach((b) => { b.onclick = () => verNoMapa({ aviso: b.dataset.aviso }); });
      raiz.querySelectorAll('[data-mapa]').forEach((b) => { b.onclick = () => verNoMapa({ camada: b.dataset.mapa, id: b.dataset.id || null, bairroId: b.dataset.bairro || null }); });
      raiz.querySelectorAll('[data-compartilhar]').forEach((b) => { b.onclick = () => compartilhar(b.dataset.compartilhar); });
      raiz.querySelectorAll('[data-foco]').forEach((a) => { a.onclick = () => { setTimeout(() => { const f = $(a.dataset.foco); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); destacar(f); } }, 80); }; });
    }

    // Redesenha uma aba só quando o HTML muda, e devolve o foco e as perguntas abertas: quem está lendo
    // ou navegando pelo teclado não perde o lugar a cada atualização.
    const ultimo = {};
    function trocarHtml(el, html) {
      if (ultimo[el.id] === html) return;
      ultimo[el.id] = html;
      const ativo = document.activeElement && el.contains(document.activeElement) ? document.activeElement : null;
      const chaveFoco = ativo && (ativo.id ? `#${CSS.escape(ativo.id)}`
        : ['aviso', 'compartilhar'].filter((k) => ativo.dataset[k]).map((k) => `[data-${k}="${CSS.escape(ativo.dataset[k])}"]`)[0] || null);
      const abertas = [...el.querySelectorAll('details[open]')].map((d) => d.dataset.pergunta);
      el.innerHTML = html;
      abertas.forEach((p) => { const d = [...el.querySelectorAll('details')].find((x) => x.dataset.pergunta === p); if (d) d.open = true; });
      ligar(el);
      if (chaveFoco) {
        const novo = el.querySelector(chaveFoco);
        if (novo) novo.focus();
      }
    }

    function desenhar() {
      conteudo = calcular();
      const meu = conteudo.meuBairro;
      $('p-meu-bairro-nome').textContent = meu.escolhido ? meu.nome : 'Escolha seu bairro';
      $('p-meu-bairro').setAttribute('aria-label', meu.escolhido ? `Seu bairro: ${meu.nome}. Trocar` : 'Escolher o seu bairro');
      const agora = new Date(GC.agora());
      const h = agora.getHours();
      const saudacao = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      $('t-inicio').textContent = `${saudacao}!`;
      const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      $('p-hero-data').textContent = data.charAt(0).toUpperCase() + data.slice(1);
      $('p-inicio-sub').textContent = meu.escolhido
        ? `O que importa hoje em ${meu.nome} e no resto de ${conteudo.cidade}.`
        : `O que importa hoje em ${conteudo.cidade}, com os dados de agora.`;
      trocarHtml($('inicio-corpo'), htmlInicio(conteudo));
      if ($('p-busca-geral').value) mostrarResultados();
      trocarHtml($('aba-bairro'), htmlBairro(conteudo));
      if (!$('p-busca') || document.activeElement !== $('p-busca')) trocarHtml($('aba-servicos'), htmlServicos(conteudo));
      ligarBusca();
      if (aba === 'numeros') trocarHtml($('aba-numeros'), htmlNumeros());
      if (mapa) mapa.pontos(GC.pontosMapaCidadao(conteudo));
      if (bairroNoMapa) desenharBairroNoMapa();
      anunciarNovos();
    }
    function ligarBusca() {
      const b = $('p-busca');
      if (!b || b.dataset.ligado) return;
      b.dataset.ligado = '1';
      b.oninput = () => {
        busca = b.value;
        $('p-faqs').innerHTML = htmlFaq(calcular());
        ligar($('p-faqs'));
      };
    }
    // ---------- busca única (Início) ----------
    function mostrarResultados() {
      const termo = $('p-busca-geral').value;
      const lista = GC.buscaCidadao(conteudo, termo);
      const ul = $('p-resultados');
      const curto = termo.trim().length < 2;
      ul.hidden = curto;
      $('p-res-info').textContent = curto ? '' : lista.length ? `${lista.length} resultado${lista.length > 1 ? 's' : ''}` : 'Nada encontrado';
      if (curto) { ul.innerHTML = ''; return; }
      ul.innerHTML = lista.length ? lista.map((r, k) => {
        const corpo = `${ic(r.icone)}<span><b>${esc(r.titulo)}</b><small>${esc(r.detalhe)}</small></span>${ic(r.tipo === 'servico' || r.tipo === 'contato' ? 'phone' : 'chevron-right')}`;
        return `<li>${r.tipo === 'servico' || r.tipo === 'contato'
          ? `<a class="p-resultado" href="tel:${esc(r.alvo)}">${corpo}</a>`
          : `<button type="button" class="p-resultado" data-resultado="${k}">${corpo}</button>`}</li>`;
      }).join('')
        : `<li class="p-vazio-busca">Nada encontrado para "${esc(termo)}". Ligue <a href="tel:156">156</a> que a Prefeitura ajuda.</li>`;
      ul.querySelectorAll('[data-resultado]').forEach((b) => { b.onclick = () => abrirResultado(lista[Number(b.dataset.resultado)]); });
    }
    function abrirResultado(r) {
      if (r.tipo === 'bairro') { verNoMapa({ bairroId: r.alvo }); return; }
      if (r.tipo === 'aviso') {
        const li = $('inicio-corpo').querySelector(`[data-aviso-id="${CSS.escape(r.alvo)}"]`);
        if (li) {
          const d = li.querySelector('details');
          if (d) d.open = true;
          li.scrollIntoView({ behavior: 'smooth', block: 'center' }); destacar(li);
        }
        return;
      }
      if (r.tipo === 'pergunta') {
        irPara('servicos');
        setTimeout(() => {
          const d = [...$('aba-servicos').querySelectorAll('details')].find((x) => x.dataset.pergunta === r.alvo);
          if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.querySelector('summary').focus({ preventScroll: true }); destacar(d); }
        }, 60);
      }
    }
    const destacar = (el) => { el.classList.remove('p-destacado'); void el.offsetWidth; el.classList.add('p-destacado'); };
    $('p-busca-geral').addEventListener('input', mostrarResultados);
    $('p-busca-geral').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; mostrarResultados(); } });

    // ---------- compartilhar um aviso (WhatsApp, SMS…) ----------
    let fimToast = null;
    function toast(texto) {
      const t = $('p-toast');
      t.textContent = texto;
      t.hidden = false;
      clearTimeout(fimToast);
      fimToast = setTimeout(() => { t.hidden = true; }, 3500);
    }
    async function compartilhar(id) {
      const a = conteudo.avisos.find((x) => x.id === id);
      if (!a) return;
      const texto = GC.textoCompartilharAviso(a, nomeCidade);
      const url = `${location.origin}${location.pathname}#/inicio`;
      // Celular: a janela de compartilhar do sistema. Sem ela: o texto pronto, com Copiar e WhatsApp.
      if (navigator.share) {
        try { await navigator.share({ title: a.titulo, text: texto, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const completo = `${texto}\n${url}`;
      $('p-comp-texto').value = completo;
      $('p-comp-whats').href = `https://wa.me/?text=${encodeURIComponent(completo)}`;
      $('p-dlg-compartilhar').showModal();
    }
    $('p-comp-copiar').onclick = async () => {
      const t = $('p-comp-texto');
      try { await navigator.clipboard.writeText(t.value); }
      catch (e) { t.focus(); t.select(); try { document.execCommand('copy'); } catch (e2) { /* fica selecionado para copiar à mão */ } }
      toast('Aviso copiado. Cole no WhatsApp ou no SMS para avisar alguém.');
    };

    // ---------- bairro pela localização do aparelho ----------
    $('p-geo').onclick = () => {
      const msg = $('p-geo-msg');
      if (!navigator.geolocation) { msg.textContent = 'Este navegador não informa a localização. Escolha o bairro na lista.'; return; }
      msg.textContent = 'Procurando a sua localização…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const id = GC.bairroDoPonto(pos.coords.latitude, pos.coords.longitude);
        if (id) { $('p-sel-bairro').value = id; msg.textContent = `Você está em ${nomeBairro(id)}. Confira e toque em Salvar.`; }
        else msg.textContent = `Sua localização fica fora de ${nomeCidade} (cidade fictícia da demonstração). Escolha o bairro na lista.`;
      }, () => { msg.textContent = 'Não foi possível usar a localização. Escolha o bairro na lista.'; }, { timeout: 10000, maximumAge: 300000 });
    };

    // Aviso novo desde a última olhada: o leitor de tela ouve uma frase (sem reler a página).
    function anunciarNovos() {
      const ids = new Set(conteudo.avisos.map((a) => a.id));
      if (avisosVistos) {
        const novos = conteudo.avisos.filter((a) => !avisosVistos.has(a.id));
        if (novos.length) $('p-anuncio').textContent = `${novos.length > 1 ? `${novos.length} avisos novos` : 'Aviso novo'}: ${novos.map((a) => a.titulo).join('; ')}.`;
      }
      avisosVistos = ids;
    }

    function irPara(id) {
      const destino = `#/${id}`;
      if (location.hash !== destino) location.hash = destino; else mostrarAba(id);
    }
    function mostrarAba(id, { focar = false } = {}) {
      const nova = ABAS.some((a) => a.id === id) ? id : 'inicio';
      const mudou = nova !== aba;
      aba = nova;
      ABAS.forEach((a) => { $(`aba-${a.id}`).hidden = a.id !== aba; });
      document.querySelectorAll('.p-aba-link').forEach((l) => { if (l.dataset.aba === aba) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current'); });
      if (aba === 'numeros') trocarHtml($('aba-numeros'), htmlNumeros());
      if (aba === 'mapa') { const m = garantirMapa(); if (m) setTimeout(() => m.redimensionar(), 0); }
      if (mudou) {
        window.scrollTo(0, 0);
        // Entrada suave dos blocos só na troca de aba (não a cada atualização automática).
        const sec = $(`aba-${aba}`);
        sec.classList.remove('p-entrando'); void sec.offsetWidth; sec.classList.add('p-entrando');
        clearTimeout(sec.fimEntrada);
        sec.fimEntrada = setTimeout(() => sec.classList.remove('p-entrando'), 900);
        const t = $(`t-${aba}`);
        document.title = `${aba === 'inicio' ? '' : `${ABAS.find((a) => a.id === aba).nome} · `}${nomeCidade} · Prefeitura`;
        // Troca de aba pelo teclado ou leitor de tela: o foco vai para o título da aba nova.
        if (focar && t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
      }
    }
    const lerAba = () => String(location.hash || '').replace(/^#\/?/, '').split('/')[0] || 'inicio';
    window.addEventListener('hashchange', () => mostrarAba(lerAba(), { focar: true }));

    // Comunicado publicado no painel do gestor em outra aba do navegador: aparece aqui na hora.
    window.addEventListener('storage', (e) => { if (e.key === CHAVE_GABINETES || e.key === CHAVE_BAIRRO) { if (e.key === CHAVE_BAIRRO) bairro = e.newValue; desenhar(); } });
    // A cidade anda (como no painel do gestor): ocorrências mudam de situação e avisos entram e saem.
    setInterval(() => { store.passoAutomatico(); desenhar(); }, PASSO_MS);

    desenhar();
    mostrarAba(lerAba());
  });
})(window.GC = window.GC || {});
