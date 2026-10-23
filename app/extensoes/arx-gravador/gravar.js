// Roda nas páginas do SGA e do PowerCRM. Só faz algo enquanto uma gravação está ligada (botão da extensão): registra a
// página aberta, os cliques e os campos preenchidos, já mascarados aqui (mascarar.js), e manda para o background.
(function () {
  const M = window.ArxMascara;
  let gravando = false;

  chrome.storage.local.get('atual').then(({ atual }) => { gravando = !!atual; if (gravando) pagina(); });
  chrome.storage.onChanged.addListener((mud, area) => {
    if (area !== 'local' || !mud.atual) return;
    const antes = gravando;
    gravando = !!mud.atual.newValue;
    if (gravando && !antes) pagina();
  });

  const enviar = (passo) => {
    if (!gravando) return;
    chrome.runtime.sendMessage({ tipo: 'passo', passo: { ...passo, url: M.enderecoMascarado(location.href) } }).catch(() => {
      // extensão recarregada: esta página só volta a gravar depois de recarregar
    });
  };

  function rotuloDe(el) {
    const t = (x) => (x && x.trim ? x.trim() : '');
    const doLabel = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    // formulários do SGA: o rótulo costuma estar na célula anterior da tabela
    const celula = el.closest && el.closest('td');
    const anterior = celula && celula.previousElementSibling ? celula.previousElementSibling.innerText : '';
    const proprio = ['A', 'BUTTON', 'LI', 'LABEL', 'SPAN', 'DIV'].includes(el.tagName) || el.getAttribute('role') ? el.innerText : '';
    return M.mascararTexto(t(el.getAttribute('aria-label')) || t(doLabel) || t(el.getAttribute('placeholder')) || t(el.title) || t(el.value && ['submit', 'button'].includes(el.type) ? el.value : '') || t(proprio) || t(anterior), 80);
  }

  function seletorDe(el) {
    if (el.id && !/\d{4,}/.test(el.id)) return `#${CSS.escape(el.id)}`;
    const nome = el.getAttribute('name');
    if (nome) return `${el.tagName.toLowerCase()}[name="${nome}"]`;
    const partes = [];
    for (let n = el; n && n.nodeType === 1 && partes.length < 4; n = n.parentElement) {
      if (n.id && !/\d{4,}/.test(n.id)) { partes.unshift(`#${CSS.escape(n.id)}`); break; }
      const irmaos = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [];
      partes.unshift(n.tagName.toLowerCase() + (irmaos.length > 1 ? `:nth-of-type(${irmaos.indexOf(n) + 1})` : ''));
    }
    return partes.join(' > ');
  }

  const alvoDe = (el) => ({ tag: el.tagName.toLowerCase(), tipo: el.type || el.getAttribute('role') || '', id: M.mascararTexto(el.id, 80), nome: M.mascararTexto(el.getAttribute('name') || '', 80), rotulo: rotuloDe(el), seletor: M.mascararTexto(seletorDe(el), 200) });

  function pagina() {
    enviar({ acao: 'pagina', titulo: M.mascararTexto(document.title, 120) });
  }

  // sistemas de uma página só (PowerCRM) trocam o endereço sem recarregar
  let ultimo = location.href;
  setInterval(() => {
    if (location.href === ultimo) return;
    ultimo = location.href;
    pagina();
  }, 700);

  document.addEventListener('click', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('a, button, input[type=submit], input[type=button], input[type=checkbox], input[type=radio], [role=button], [role=menuitem], [role=option], [role=tab], li, label, td');
    if (!alvo) return;
    // a caixa de marcar vira "campo" pelo change; o rótulo dela já aparece lá
    if (alvo.matches('input[type=checkbox], input[type=radio], label')) return;
    enviar({ acao: 'clique', alvo: alvoDe(alvo) });
  }, true);

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
    const valor = el.tagName === 'SELECT' ? M.mascararTexto(el.selectedOptions[0] ? el.selectedOptions[0].text : '', 80) : M.valorDoCampo({ tipo: el.type, valor: el.value, marcado: el.checked });
    enviar({ acao: 'campo', alvo: alvoDe(el), valor });
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target || !['INPUT', 'TEXTAREA'].includes(ev.target.tagName)) return;
    enviar({ acao: 'tecla', tecla: 'Enter', alvo: alvoDe(ev.target) });
  }, true);
})();
