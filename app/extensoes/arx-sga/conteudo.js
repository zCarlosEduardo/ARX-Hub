// Roda nas páginas do SGA (*.hinova.com.br/sga/*). Na tela de login, pede à extensão o login daquela empresa e entra
// sozinho (fecha o aviso inicial, preenche e clica em Entrar, o mesmo caminho dos robôs em shared/sga/sgaSessao.js).
// Na página de erro de cookies acumulados, pede para apagar os cookies do SGA e volta para o login.
(async function () {
  const R = globalThis.ArxRegras;
  const base = R.baseDaUrl(location.href);
  if (!base) return;

  // aviso pequeno no alto da página (o SGA não tem um lugar para isso; estilo próprio, independente da página)
  function aviso(texto) {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.textContent = 'ARX SGA: ' + texto;
    el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(560px,calc(100vw - 24px));padding:10px 16px;border-radius:999px;background:#15171a;color:#fff;font:500 13px/18px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }
  // evita laço: a mesma ação na mesma empresa não se repete em menos de 20 s (login recusado, cookies que voltam)
  function jaTentou(acao) {
    const chave = 'arx-sga-' + acao + '-' + base;
    const antes = Number(sessionStorage.getItem(chave) || 0);
    sessionStorage.setItem(chave, String(Date.now()));
    return Date.now() - antes < 20000;
  }
  const pedir = (msg) => chrome.runtime.sendMessage(msg).catch(() => null); // extensão recarregada: segue sem ela

  if (R.ehErroDeCookies({ titulo: document.title, texto: document.body ? document.body.innerText.slice(0, 2000) : '' })) {
    if (jaTentou('cookies')) return aviso('o erro de cookies voltou logo depois da limpeza. Feche as abas do SGA e tente de novo.');
    await pedir({ tipo: 'limpar-cookies' });
    location.replace(base + '/v5/login.php');
    return;
  }

  // fora da tela de login a entrada deu certo: a próxima tela de login (saiu, a sessão caiu) pode entrar sozinha de novo
  if (!/\/v5\/login\.php$/i.test(location.pathname)) return sessionStorage.removeItem('arx-sga-login-' + base);
  const r = await pedir({ tipo: 'credencial' });
  if (!r || r.desligado || r.desconhecida) return;
  if (r.travado) return aviso('destrave a extensão (ícone ARX SGA) para entrar sozinho.');
  if (r.semLogin) return aviso('não há login salvo para esta empresa.');
  if (!r.login) return;
  if (jaTentou('login')) return aviso('o login salvo não entrou. Confira usuário e senha na extensão.');

  const visivel = (el) => !!el && !!(el.offsetWidth || el.offsetHeight);
  // espera o elemento aparecer (sinal observável, sem tempo fixo); null depois do prazo
  const esperar = (seletor, ms) => new Promise((ok) => {
    const achar = () => { const el = document.querySelector(seletor); return visivel(el) ? el : null; };
    if (achar()) return ok(achar());
    const obs = new MutationObserver(() => { const el = achar(); if (el) { obs.disconnect(); ok(el); } });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    setTimeout(() => { obs.disconnect(); ok(achar()); }, ms);
  });
  // campo com o setter nativo e os eventos de digitação (a página valida pelos eventos, não pelo value)
  function preencher(campo, valor) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, valor);
    ['input', 'change', 'keyup', 'blur'].forEach((t) => campo.dispatchEvent(new Event(t, { bubbles: true })));
  }

  const aviso1 = await esperar('#myModal .modal-body button', 2500);
  if (aviso1) aviso1.click();
  const usuario = await esperar('#usuario', 10000);
  const senha = document.querySelector('#senha');
  if (!usuario || !senha) return;
  preencher(usuario, r.login.usuario);
  preencher(senha, r.login.senha);
  document.body.click(); // "clicar fora" dispara a validação dos campos, como os robôs fazem
  // o SGA não dá sinal de que validou: a mesma pausa curta dos robôs antes do Entrar
  setTimeout(() => {
    const entrar = Array.from(document.querySelectorAll('button, input[type="submit"]')).find((b) => (b.textContent || b.value || '').trim() === 'Entrar');
    if (entrar) entrar.click();
  }, 400);
})();
