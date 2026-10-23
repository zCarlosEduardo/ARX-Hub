// Roda no começo da tela de login do SGA (antes de ela aparecer): cobre a página com "Entrando no SGA..." para a pessoa
// não ver o formulário enquanto o conteudo.js entra sozinho. O conteudo.js tira a cortina quando não vai entrar
// (travado, sem login, desligado) ou quando o login não passa; por garantia ela sai sozinha em 12 s.
(function () {
  const cortina = document.createElement('div');
  cortina.id = 'arx-sga-cortina';
  cortina.setAttribute('role', 'status');
  cortina.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0c0d0f;color:#fff;font:500 14px/20px system-ui,sans-serif';
  cortina.innerHTML = '<svg width="56" height="56" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="#15171a"/><path d="M64 18 30 31v29c0 24 15 41 34 50 19-9 34-26 34-50V31z" fill="#5bd68a"/><path d="m46 64 13 13 24-26" fill="none" stroke="#0c0d0f" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Entrando no SGA…</span>';
  document.documentElement.appendChild(cortina);
  setTimeout(() => cortina.remove(), 12000);
})();
