(function (GC) {
  // Tela de login da demonstração: sem servidor, qualquer e-mail e senha entram.
  document.title = `Entrar · ${GC.produto()}`;
  const $ = (id) => document.getElementById(id);
  // Já logado: vai direto ao painel.
  if (GC.sessao && !new URLSearchParams(location.search).has('trocar')) {
    location.replace(GC.sessao.destino || 'index.html');
    return;
  }
  // Secretaria fora do contrato não aparece no login.
  document.querySelectorAll('#login-perfil option[value^="setor:"]').forEach((o) => { if (GC.moduloAtivo && !GC.moduloAtivo(o.value.split(':')[1])) o.remove(); });
  const aviso = (t) => { $('login-aviso').textContent = t; $('login-aviso').hidden = false; };
  $('login-esqueci').onclick = () => aviso('No ambiente de demonstração qualquer senha funciona. Na versão da prefeitura, o link de recuperação chega por e-mail.');
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const [perfil, area] = $('login-perfil').value.split(':');
    const cidade = $('login-cidade').value;
    const nome = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const q = new URLSearchParams({ perfil, cidade });
    if (area) q.set('area', area);
    const destino = `index.html?${q}`;
    try { localStorage.setItem('vd-cidade', cidade); } catch (err) { /* segue pela URL */ }
    GC.entrar({ nome, email, perfil, area: area || null, cidade, destino }, $('login-lembrar').checked);
    location.href = destino;
  });
})(window.GC = window.GC || {});
