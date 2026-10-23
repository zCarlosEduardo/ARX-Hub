// Hub v1: complemento do skin.js nas telas das automações abertas pelo /v1/ (o proxy injeta com ?v1=1, depois do
// skin.js). Como na maquete, o formulário fica à esquerda e um Resumo à direita, que acompanha a página ao rolar,
// com o botão Iniciar dentro. Os nós originais são movidos (não recriados): o app.js da automação continua igual.
(function () {
  if (document.getElementById('root')) return; // telas montadas pelo React (Python): só o estilo
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Alt. Status: o resumo já existe (skin.js); o Iniciar desce para ele
  const resumoAlt = $('v2aResumo');
  if (resumoAlt) {
    const cartao = resumoAlt.closest('.card');
    if (cartao && $('v2aIniciar')) cartao.insertBefore($('v2aIniciar'), resumoAlt.nextSibling);
    return;
  }
  if ($('previaBox')) return; // Foto de perfil: a prévia já faz o papel do resumo

  const exec = document.querySelector('.v2p-painel[data-painel="exec"]');
  const form = exec && exec.querySelector('main.grid');
  const iniciar = $('startBtn');
  if (!form || !iniciar) return;

  const lado = document.createElement('div');
  lado.className = 'v1-exec';
  form.parentNode.insertBefore(lado, form);
  lado.appendChild(form);
  const resumo = document.createElement('aside');
  resumo.className = 'card v1-resumo';
  resumo.setAttribute('aria-labelledby', 'v1ResumoTitulo');
  resumo.innerHTML = '<h2 id="v1ResumoTitulo">Resumo</h2><dl id="v1Resumo"></dl>';
  lado.appendChild(resumo);
  const acoes = iniciar.closest('.acoes-linha') || iniciar;
  resumo.appendChild(acoes);
  if ($('formError')) resumo.appendChild($('formError'));
  const nota = document.createElement('p');
  nota.className = 'hint';
  nota.textContent = 'Os logins vêm de Meus acessos e não ficam gravados.';
  resumo.appendChild(nota);

  // o resumo lê o que está na tela: cada campo visível com rótulo, as empresas marcadas e as marcações sim ou não
  const visivel = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const rotuloCurto = (t) => t.replace(/\s+/g, ' ').trim().split(/\s\(|:\s/)[0].replace(/^\d+\.\s*/, '').slice(0, 40);
  function valor(c) {
    if (c.tagName === 'SELECT') return c.multiple ? Array.from(c.selectedOptions).map((o) => o.textContent.trim()).join(', ') : (c.selectedOptions[0] ? c.selectedOptions[0].textContent.trim() : '');
    if (c.type === 'password') return c.value ? 'Preenchida' : '';
    if (c.type === 'checkbox') return c.checked ? 'Sim' : 'Não';
    if (c.type === 'file') return c.files && c.files[0] ? c.files[0].name : '';
    if (c.tagName === 'TEXTAREA') { const n = c.value.split('\n').map((l) => l.trim()).filter(Boolean).length; return n ? (n === 1 ? '1 linha' : n + ' linhas') : ''; }
    return c.value.trim();
  }
  function atualizar() {
    const linhas = [];
    form.querySelectorAll('.empresa-checklist').forEach((lista) => {
      if (!visivel(lista)) return;
      const marcadas = Array.from(lista.querySelectorAll('input:checked')).map((cb) => (cb.closest('label') || cb).textContent.trim());
      linhas.push(['Empresas', !marcadas.length ? 'Nenhuma marcada' : marcadas.length <= 3 ? marcadas.join(', ') : marcadas.length + ' empresas']);
    });
    form.querySelectorAll('label[for]').forEach((l) => {
      const c = $(l.getAttribute('for'));
      if (!c || !visivel(c) || c.type === 'search' || c.closest('.empresa-checklist') || c.id === 'empresaSelecionarTodas') return;
      linhas.push([rotuloCurto(l.textContent), valor(c) || 'Não informado']);
    });
    // marcações dentro do rótulo (Modo teste, Recorrente...): o texto antes dos dois-pontos vira o nome
    form.querySelectorAll('label.checkbox-label > input[type="checkbox"]').forEach((c) => {
      if (!visivel(c) || c.closest('.empresa-checklist') || c.id === 'empresaSelecionarTodas') return;
      linhas.push([rotuloCurto(c.closest('label').textContent), c.checked ? 'Sim' : 'Não']);
    });
    $('v1Resumo').innerHTML = linhas.slice(0, 10).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
  }
  document.addEventListener('input', atualizar, true);
  document.addEventListener('change', atualizar, true);
  // o app.js monta empresas e painéis depois de ler /api/opcoes
  new MutationObserver(atualizar).observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  atualizar();
})();
