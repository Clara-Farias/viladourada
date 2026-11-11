(function (GC) {
  // Telas por hash (#/painel, #/secretarias, #/secretaria/<area>): funciona via file://,
  // o F5 mantém a tela e o voltar do navegador funciona. Qualquer outra coisa vai ao Painel.
  const PAINEL = { tela: 'painel' };

  const TIPOS = ['executivo', 'secretaria', 'bairro', 'alertas'];
  const PERIODOS = ['7', '30', '90', '12m'];
  const EXECUTIVO = { tela: 'relatorios', tipo: 'executivo', alvo: '-', periodo: '30' };

  // Períodos que mudam de fato cada relatório. Secretaria: a série é mensal, então 7 dias seria igual a 30.
  // Bairro: os dados por bairro só existem para os últimos 30 dias.
  const PERIODOS_DO_TIPO = { executivo: PERIODOS, alertas: PERIODOS, secretaria: ['30', '90', '12m'], bairro: ['30'] };
  GC.periodosDoRelatorio = (tipo) => PERIODOS_DO_TIPO[tipo] || PERIODOS;
  // Intervalo de meses escolhido: 'm<de>-<ate>' com índices da série mensal (0 = nov/2025 ... 11 = out/2026).
  // Vale para todos os tipos menos o bairro (só há dados por bairro dos últimos 30 dias).
  const MESES = /^m(\d{1,2})-(\d{1,2})$/;
  const mesesValidos = (p) => { const m = MESES.exec(String(p)); return !!m && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 11; };
  GC.aceitaMesesNoRelatorio = (tipo) => tipo !== 'bairro';
  GC.periodoDoRelatorio = (tipo, periodo) => (GC.periodosDoRelatorio(tipo).includes(periodo)
    || (GC.aceitaMesesNoRelatorio(tipo) && mesesValidos(periodo)) ? periodo : '30');

  // #/relatorios/<tipo>/<alvo>/<periodo>; o alvo é a área (secretaria), o bairro, ou '-'.
  // Qualquer parte inválida vira o executivo de 30 dias; período que não se aplica ao tipo vira 30 dias.
  function lerRelatorio([tipo = 'executivo', alvo = '-', periodo = '30']) {
    if (!TIPOS.includes(tipo) || !(PERIODOS.includes(periodo) || mesesValidos(periodo))) return EXECUTIVO;
    if (tipo === 'secretaria' && !GC.data.areas.some((a) => a.id === alvo)) return EXECUTIVO;
    if (tipo === 'bairro' && !GC.data.bairros.some((b) => b.id === alvo)) return EXECUTIVO;
    return { tela: 'relatorios', tipo, alvo: tipo === 'secretaria' || tipo === 'bairro' ? alvo : '-', periodo: GC.periodoDoRelatorio(tipo, periodo) };
  }

  GC.lerRota = function (hash) {
    const partes = String(hash || '').replace(/^#\/?/, '').split('/');
    if (partes[0] === 'secretarias' && partes.length === 1) return { tela: 'secretarias' };
    if (partes[0] === 'secretaria' && GC.data.areas.some((a) => a.id === partes[1])) return { tela: 'secretaria', area: partes[1] };
    if (partes[0] === 'relatorios') return lerRelatorio(partes.slice(1));
    if (partes[0] === 'alertas' && partes.length === 1) return { tela: 'alertas' };
    if (partes[0] === 'cidadao' && partes.length === 1) return { tela: 'cidadao' }; // "Para você" (perfil Cidadão)
    // O id do gabinete é validado pela tela (os gabinetes vivem na memória da demo).
    // Indicadores: o alvo é uma secretaria (filtra) ou um código do catálogo (abre a ficha); a tela valida.
    if (partes[0] === 'indicadores') return { tela: 'indicadores', alvo: partes[1] ? decodeURIComponent(partes[1]) : null };
    if (partes[0] === 'crise') return { tela: 'crise', id: partes[1] ? decodeURIComponent(partes[1]) : null };
    // A tabela é validada pela tela (ela conhece as tabelas); id desconhecido abre a primeira.
    if (partes[0] === 'cruzamento') return { tela: 'cruzamento', a: partes[1] || null, b: partes[2] || null, meses: Number(partes[3]) || 3, recorte: partes[4] || 'cidade' };
    if (partes[0] === 'personalizar' && partes.length === 1) return { tela: 'personalizar' };
    if (partes[0] === 'admin') return { tela: 'admin', aba: partes[1] || 'consistencia' };
    if (partes[0] === 'dados') return { tela: 'dados', tabela: partes[1] ? decodeURIComponent(partes[1]) : null };
    return PAINEL;
  };

  GC.hashDe = function (rota) {
    if (rota.tela === 'secretaria') return `#/secretaria/${rota.area}`;
    if (rota.tela === 'admin') return `#/admin/${rota.aba || 'consistencia'}`;
    if (rota.tela === 'cruzamento') return rota.a && rota.b ? `#/cruzamento/${rota.a}/${rota.b}/${rota.meses || 3}/${rota.recorte || 'cidade'}` : '#/cruzamento';
    if (rota.tela === 'dados') return rota.tabela ? `#/dados/${rota.tabela}` : '#/dados';
    if (rota.tela === 'indicadores') return rota.alvo ? `#/indicadores/${encodeURIComponent(rota.alvo)}` : '#/indicadores';
    if (rota.tela === 'crise') return rota.id ? `#/crise/${encodeURIComponent(rota.id)}` : '#/crise';
    if (rota.tela === 'relatorios') return `#/relatorios/${rota.tipo}/${rota.alvo}/${rota.periodo}`;
    return `#/${rota.tela}`;
  };

  GC.criarRotas = function (aoMudar) {
    let atual = GC.lerRota(location.hash);
    window.addEventListener('hashchange', () => {
      atual = GC.lerRota(location.hash);
      aoMudar(atual);
    });
    return {
      atual: () => atual,
      ir(rota) {
        const hash = GC.hashDe(rota);
        if (location.hash === hash) aoMudar(atual);
        else location.hash = hash;
      },
      iniciar() { aoMudar(atual); },
    };
  };
})(window.GC = window.GC || {});
