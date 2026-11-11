(function (GC) {
  // Sessão da demonstração (tela de login acessória). Não há servidor: qualquer e-mail e senha entram, e o
  // perfil escolhido no login vira o perfil de acesso do painel. ?sem-login pula a tela (desenvolvimento).
  // A sessão fica no navegador: vale para todas as abas por 12 horas, ou 30 dias com "Manter conectado".
  const CHAVE = 'gc.sessao';
  const HORA = 3600000;
  const ler = () => {
    try {
      const s = JSON.parse(window.localStorage.getItem(CHAVE) || 'null');
      if (s && s.expira && s.expira < Date.now()) { window.localStorage.removeItem(CHAVE); return null; }
      return s;
    } catch (e) { return null; }
  };
  GC.sessao = ler();
  GC.entrar = function (dados, lembrar) {
    const agora = Date.now();
    const s = Object.assign({ desde: agora, expira: agora + (lembrar ? 30 * 24 : 12) * HORA }, dados);
    try { window.localStorage.setItem(CHAVE, JSON.stringify(s)); return true; } catch (e) { return false; }
  };
  GC.sair = function () {
    try { window.localStorage.removeItem(CHAVE); } catch (e) { /* nada salvo */ }
    window.location.href = 'login.html';
  };
  // Painel do gestor exige sessão; o portal do cidadão é aberto.
  const exige = document.documentElement.dataset.exigeLogin === 'sim';
  let pular = false;
  try { pular = new URLSearchParams(window.location.search).has('sem-login'); } catch (e) { /* sem URL */ }
  if (exige && !GC.sessao && !pular) window.location.replace('login.html');
})(window.GC = window.GC || {});
