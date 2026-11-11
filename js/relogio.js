(function (GC) {
  // Relógio único da demonstração.
  // Os dados foram escritos com "hoje" = ANCORA (quinta, 05/11/2026). Em vez de cada arquivo ter a sua data
  // fixa, todos perguntam aqui: GC.relogio.hoje é a data real (ou GC.hojeForcado, nos testes) e
  // GC.relogio.data('2026-10-21') desloca uma data escrita contra a âncora, mantendo a idade relativa
  // ("há 15 dias" continua há 15 dias em qualquer dia em que a demo for aberta).
  const ANCORA = '2026-11-05';
  const DIA_MS = 86400000;
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const hojeReal = () => { const d = new Date(); return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

  const hoje = GC.hojeForcado || hojeReal();
  const deltaDias = Math.round((utc(hoje) - utc(ANCORA)) / DIA_MS);
  const diaHoje = new Date(utc(hoje)).getUTCDay();
  const diaAncora = new Date(utc(ANCORA)).getUTCDay();

  GC.relogio = {
    ancora: ANCORA,
    hoje,
    deltaDias,
    // Data escrita contra a âncora → a mesma distância de hoje.
    data: (escrita) => (deltaDias ? iso(utc(escrita) + deltaDias * DIA_MS) : escrita),
    // Dia da semana escrito contra a âncora ('qui') → o dia equivalente hoje ('ter', se hoje for terça).
    diaSemana: (dia) => DIAS[(DIAS.indexOf(dia) + diaHoje - diaAncora + 7) % 7],
    // Rótulos dos n meses fechados, terminando no mês anterior ao de hoje ('mai' … 'out' em novembro).
    meses: (n) => {
      const m = new Date(utc(hoje)).getUTCMonth();
      return Array.from({ length: n }, (_, i) => MESES[(m - n + i + 120) % 12]);
    },
    // "mês/ano" do último mês fechado (para textos de período).
    ultimoMes: () => {
      const d = new Date(utc(hoje));
      const m = (d.getUTCMonth() + 11) % 12;
      return `${MESES[m]}/${d.getUTCFullYear() - (m === 11 ? 1 : 0)}`;
    },
  };
})(window.GC = window.GC || {});
