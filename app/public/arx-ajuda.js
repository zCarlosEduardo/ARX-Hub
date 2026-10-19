/* =====================================================================
   ArxAjuda: botão "?" que mostra os tutoriais em vídeo da tela.
   - a página declara as áreas: <meta name="arx-tutoriais" content="area[,area2]">;
   - o Hub serve os vídeos e o índice em /tutoriais (mesmo host, porta 8317):
     tutoriais.json e <claro|escuro>/<area>/<nome>.mp4;
   - o vídeo segue o data-theme da página e troca na hora se o tema mudar;
   - o botão entra em .page-actions (ou no fim do header.page-header) ou num
     [data-arx-ajuda] que a página tenha; sem índice (Hub fora do ar ou área
     sem tutoriais) o botão não aparece;
   - vídeo, e não GIF: tem pausa (WCAG 2.2.2) e não começa sozinho para quem
     pediu menos movimento no sistema.
   Fonte única: shared/ui/arx-ajuda.js (copiado nas automações e no ARX Hub).
   ===================================================================== */
(function () {
  const api = (window.ArxAjuda = window.ArxAjuda || {});
  const PORTA_HUB = '8317';

  // --- regras puras (testadas em shared/ui/test) ---
  const pastaDoTema = (tema) => (tema === 'dark' ? 'escuro' : 'claro');
  const baseDoHub = (loc) => `${loc.protocol}//${loc.hostname}:${PORTA_HUB}/tutoriais`;
  const urlDoVideo = (base, tema, area, nome) => `${base}/${pastaDoTema(tema)}/${area}/${encodeURIComponent(nome)}.mp4`;
  const areasDaMeta = (conteudo) => String(conteudo || '').split(',').map((s) => s.trim()).filter(Boolean);

  /** Seções do diálogo, na ordem das áreas pedidas; área ausente ou vazia fica de fora. */
  function secoesDoIndice(indice, areas) {
    const todas = indice && indice.areas && typeof indice.areas === 'object' ? indice.areas : {};
    return areas
      .map((area) => ({ area, ...(todas[area] || {}) }))
      .filter((s) => Array.isArray(s.tutoriais) && s.tutoriais.length)
      .map((s) => ({ area: s.area, nome: s.nome || s.area, tutoriais: s.tutoriais }));
  }

  Object.assign(api, { urlDoVideo, baseDoHub, areasDaMeta, secoesDoIndice });

  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;

  // --- tela ---
  const CSS = `
.arx-ajuda-btn { width: 32px; height: 32px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 1px solid var(--border); background: var(--card); color: var(--text); font: 600 15px/1 var(--font-sans, inherit);
  cursor: pointer; transition: border-color .15s, background .15s; }
.arx-ajuda-btn:hover { border-color: var(--border-hover, var(--border)); background: var(--hover-bg, var(--card)); }
.arx-ajuda-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.arx-ajuda { width: min(1040px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; border: 1px solid var(--border);
  border-radius: var(--radius-card, 12px); background: var(--card); color: var(--text); box-shadow: var(--shadow-pop, 0 20px 50px rgba(0,0,0,.25)); }
.arx-ajuda::backdrop { background: rgba(0,0,0,.5); }
.arx-ajuda-topo { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.arx-ajuda-topo h2 { margin: 0; flex: 1; font-size: 16px; font-weight: 600; }
.arx-ajuda-fechar { border: 1px solid var(--border); background: transparent; color: var(--text); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; }
.arx-ajuda-corpo { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 0; max-height: calc(100vh - 100px); }
.arx-ajuda-lista { overflow-y: auto; padding: 10px; border-right: 1px solid var(--border); }
.arx-ajuda-secao { margin: 10px 8px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.arx-ajuda-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; color: var(--text); padding: 8px 10px;
  border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1.35; }
.arx-ajuda-item:hover { background: var(--hover-bg, transparent); }
.arx-ajuda-item[aria-current="true"] { background: var(--accent-soft, transparent); color: var(--accent); font-weight: 600; }
.arx-ajuda-palco { padding: 14px 18px 18px; overflow-y: auto; }
.arx-ajuda-palco h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.arx-ajuda-palco video { display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); }
@media (max-width: 760px) {
  .arx-ajuda-corpo { grid-template-columns: 1fr; }
  .arx-ajuda-lista { border-right: 0; border-bottom: 1px solid var(--border); max-height: 34vh; }
}`;

  document.head.appendChild(el('style', { textContent: CSS }));

  const temaAtual = () => document.documentElement.getAttribute('data-theme');
  const reduzMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const base = baseDoHub(location);

  let pedidoIndice = null;
  let dialogo = null;
  let atual = null; // { area, nome, titulo }

  function el(tag, props, filhos) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    (filhos || []).forEach((f) => n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f));
    return n;
  }

  function tocar(item, { manterTempo = false } = {}) {
    if (!dialogo) return;
    atual = item;
    const video = dialogo.querySelector('video');
    const tempo = manterTempo ? video.currentTime : 0;
    video.src = urlDoVideo(base, temaAtual(), item.area, item.nome);
    video.currentTime = tempo;
    if (!reduzMovimento() || manterTempo) video.play().catch(() => { /* o navegador pode bloquear o play: os controles continuam */ });
    dialogo.querySelector('h3').textContent = item.titulo;
    dialogo.querySelectorAll('.arx-ajuda-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.chave === `${item.area}/${item.nome}`)));
  }

  function montarDialogo(secoes) {
    const lista = el('nav', { className: 'arx-ajuda-lista', ariaLabel: 'Tutoriais' });
    secoes.forEach((s) => {
      if (secoes.length > 1) lista.appendChild(el('div', { className: 'arx-ajuda-secao' }, [s.nome]));
      s.tutoriais.forEach((t) => {
        const item = { area: s.area, nome: t.nome, titulo: t.titulo };
        const b = el('button', { type: 'button', className: 'arx-ajuda-item' }, [t.titulo]);
        b.dataset.chave = `${s.area}/${t.nome}`;
        b.addEventListener('click', () => tocar(item));
        lista.appendChild(b);
      });
    });
    const video = el('video', { controls: true, muted: true, loop: true, playsInline: true, preload: 'metadata' });
    const d = el('dialog', { className: 'arx-ajuda' }, [
      el('div', { className: 'arx-ajuda-topo' }, [el('h2', {}, ['Como usar esta tela']), el('button', { type: 'button', className: 'arx-ajuda-fechar' }, ['Fechar'])]),
      el('div', { className: 'arx-ajuda-corpo' }, [lista, el('div', { className: 'arx-ajuda-palco' }, [el('h3'), video])]),
    ]);
    d.setAttribute('aria-label', 'Tutoriais em vídeo');
    d.querySelector('.arx-ajuda-fechar').addEventListener('click', () => d.close());
    d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); }); // clique fora da caixa fecha
    d.addEventListener('close', () => video.pause());
    document.body.appendChild(d);
    return d;
  }

  /** Índice dos tutoriais, pedido uma vez; null se o Hub não responder. */
  function carregarIndice() {
    if (!pedidoIndice) {
      pedidoIndice = fetch(`${base}/tutoriais.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null); // Hub fora do ar: a tela funciona igual, só sem a ajuda
    }
    return pedidoIndice;
  }

  /** Há tutorial para alguma destas áreas? (o Hub usa para mostrar ou não o botão dele) */
  api.disponivel = async (areas) => secoesDoIndice(await carregarIndice(), areas).length > 0;

  /** Abre o diálogo com as áreas pedidas (o Hub chama direto, com as áreas dele). */
  api.abrir = async function abrir(areas) {
    const secoes = secoesDoIndice(await carregarIndice(), areas);
    if (!secoes.length) return;
    if (dialogo) dialogo.remove();
    dialogo = montarDialogo(secoes);
    dialogo.showModal();
    tocar({ area: secoes[0].area, ...secoes[0].tutoriais[0] });
  };

  // o tema muda (botão do Hub, postMessage): troca o vídeo pelo do outro tema no mesmo ponto
  new MutationObserver(() => { if (dialogo && dialogo.open && atual) tocar(atual, { manterTempo: true }); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function lugarDoBotao() {
    return document.querySelector('[data-arx-ajuda]') || document.querySelector('header.page-header .page-actions') || document.querySelector('header.page-header');
  }

  function criarBotao(areas) {
    const b = el('button', { type: 'button', className: 'arx-ajuda-btn', title: 'Como usar esta tela' }, ['?']);
    b.setAttribute('aria-label', 'Como usar esta tela: tutoriais em vídeo');
    b.addEventListener('click', () => api.abrir(areas));
    return b;
  }

  /** Põe o botão quando o cabeçalho existir (telas montadas por JS demoram um pouco). */
  function colocarBotao(areas) {
    const tentar = () => {
      const alvo = lugarDoBotao();
      if (!alvo || alvo.querySelector('.arx-ajuda-btn')) return !!alvo;
      if (alvo.classList.contains('page-actions')) alvo.insertBefore(criarBotao(areas), alvo.firstChild);
      else alvo.appendChild(criarBotao(areas));
      return true;
    };
    if (tentar()) return;
    const obs = new MutationObserver(() => { if (tentar()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
  }

  async function iniciar() {
    const meta = document.querySelector('meta[name="arx-tutoriais"]');
    const areas = areasDaMeta(meta && meta.content);
    if (!areas.length || !(await api.disponivel(areas))) return;
    colocarBotao(areas);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
