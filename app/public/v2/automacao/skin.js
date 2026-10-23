// Layout novo nas telas das automações abertas pelo Hub (o proxy injeta este script com ?v2=1).
// Todas: título no modelo novo e números dos passos discretos. Gerar foto de perfil: tela nova inteira, usando a API da
// própria automação (/api/foto.png para a prévia sem gravar, /api/start para gerar e /api/execucoes para o histórico).
(function () {
  // escapa texto antes de entrar em innerHTML (nome digitado, dados do histórico da automação)
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICONES = [
    [/senha/i, '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'],
    [/foto/i, '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'],
    [/vistoria/i, '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'],
    [/modelo/i, '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H7.3a2 2 0 0 0-1.6.8L3 10.5l-1.4.6A1.5 1.5 0 0 0 1 12.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'],
    [/regiona/i, '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'],
    [/tabela/i, '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>'],
    [/planilha/i, '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 13v4"/>'],
    [/relat/i, '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>'],
    [/grupo|permiss/i, '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'],
    [/cooperativ/i, '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>'],
    [/cadastro|bloqueio|ativa/i, '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'],
  ];
  const PADRAO = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M7 10v4a2 2 0 0 0 2 2h5"/>';

  function tituloNovo() {
    const cab = document.querySelector('header.page-header');
    const titulo = cab && cab.querySelector('.page-title');
    if (!titulo || cab.querySelector('.v2-titulo')) return;
    const nome = (titulo.querySelector('h1') || {}).textContent || document.title;
    const icone = (ICONES.find(([r]) => r.test(nome)) || [null, PADRAO])[1];
    const caixa = document.createElement('div');
    caixa.className = 'v2-titulo';
    caixa.innerHTML = '<span class="v2-icone">' + SVG(icone) + '</span>';
    titulo.parentNode.insertBefore(caixa, titulo);
    caixa.appendChild(titulo);
    iconeDoHub(caixa.querySelector('.v2-icone'));
  }

  // v3 manda o ícone e a cor do cadastro no Hub (?icone=&cor=): o título fica igual ao cartão do Painel. O desenho vem do
  // icons.js do próprio Hub (servido pelo proxy), lido com um React de mentira que só guarda a árvore; o SVG é montado com
  // createElementNS e só com nomes de ícone que existem e cor #RRGGBB, então nada do link vira HTML.
  function iconeDoHub(alvo) {
    const q = new URLSearchParams(location.search);
    const nome = q.get('icone') || '';
    const cor = /^#[0-9a-fA-F]{6}$/.test(q.get('cor') || '') ? q.get('cor') : null;
    if (!alvo || !/^[A-Za-z0-9]{1,40}$/.test(nome)) return;
    const reactAntes = window.React;
    const iconsAntes = window.Icons;
    const falso = { createElement: (type, props, ...filhos) => ({ type, props: props || {}, filhos: filhos.flat() }), cloneElement: (el) => el };
    window.React = falso;
    const s = document.createElement('script');
    s.src = '/__arx-v2/icons.js';
    s.onload = () => {
      const I = window.Icons;
      let arvore = null;
      try {
        if (I && I.NAMES.includes(nome)) arvore = I.Icon(nome, 22, cor || 'currentColor');
      } finally {
        window.React = reactAntes;
        window.Icons = iconsAntes;
      }
      if (!arvore) return;
      const ATTR = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin' };
      const montar = (n) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', n.type);
        Object.keys(n.props).forEach((k) => { if (k !== 'key' && k !== 'style' && k !== 'children') el.setAttribute(ATTR[k] || k, String(n.props[k])); });
        (n.filhos || []).forEach((f) => { if (f && typeof f === 'object') el.appendChild(montar(f)); });
        return el;
      };
      alvo.replaceChildren(montar(arvore));
      if (cor) { alvo.style.background = cor + '1f'; alvo.style.color = cor; alvo.style.boxShadow = 'inset 0 0 0 1px ' + cor + '33'; }
    };
    s.onerror = () => { window.React = reactAntes; window.Icons = iconsAntes; };
    document.head.appendChild(s);
  }

  // "1. Empresa e login" -> selo pequeno com o número + título
  function passosDiscretos(raiz) {
    (raiz || document).querySelectorAll('.card h2, section h2').forEach((h) => {
      if (h.querySelector('.v2-num')) return;
      const no = h.firstChild;
      if (!no || no.nodeType !== 3) return;
      const m = /^\s*(\d+)\.\s+/.exec(no.textContent);
      if (!m) return;
      no.textContent = no.textContent.slice(m[0].length);
      const n = document.createElement('span');
      n.className = 'v2-num';
      n.textContent = m[1];
      h.insertBefore(n, no);
    });
  }

  // Foto de perfil e Alt. Status têm tela própria; as demais do kit, o layout padrão
  const ehFoto = !!(document.getElementById('previaBox') && document.getElementById('nome') && document.getElementById('departamento'));
  const ehAltStatus = !!(document.getElementById('acaoGlobal') && document.getElementById('cpfsInput') && document.getElementById('resultsTable'));
  // campos com rótulo visível mas sem ligação (label sem "for"): o leitor de tela não anunciava o nome. Só acrescenta
  // aria-label, sem mexer na estrutura, então vale também nas telas montadas pelo React
  nomearCampos();
  // telas montadas por script num #root (Cadastro de voluntário e de colaborador, em Python): o layout não é mexido
  // (os nós são remontados pelo app.js); só os logins do Hub ficam discretos, que apenas escondem campos e põem o selo
  if (document.getElementById('root')) { acessosDoHubDiscretos(); return; }
  tituloNovo();
  passosDiscretos();
  // telas que montam partes depois (abas, cards que aparecem): aplica de novo
  new MutationObserver(() => passosDiscretos()).observe(document.body, { childList: true, subtree: true });

  if (ehFoto) fotoNova();
  else if (ehAltStatus) altStatusNova();
  else layoutPadrao();
  acessosDoHubDiscretos();

  // Logins que vieram do Hub (o app.js põe o selo "Preenchido pelo Hub" ao lado do campo, via ArxAcessos.marcarCampo):
  // usuário e senha somem e fica só "Acesso do Hub", com "Usar outro login" para quem precisar trocar. Sem o selo
  // (cofre travado, login sem a empresa) os campos voltam, para digitar.
  function acessosDoHubDiscretos() {
    const grupos = []; // { campos, ocultos, chip, forcado }
    const ehTexto = (el) => el && el.tagName === 'INPUT' && /^(text|email|)$/i.test(el.getAttribute('type') || '');
    const temSeloDoHub = (campo) => {
      const selo = campo.parentNode && campo.parentNode.querySelector(':scope > .arx-acesso-hub');
      return !!selo && /pelo Hub/i.test(selo.textContent);
    };
    // o que esconder de um campo: ele, o rótulo e o invólucro quando o invólucro só tem o campo (rótulo, olho, selo)
    function partes(campo) {
      const pai = campo.parentElement;
      const soDoCampo = pai && !pai.classList.contains('card') && pai.querySelectorAll('input, select, textarea').length === 1 && pai.children.length <= 4;
      if (soDoCampo) return [pai];
      const rotulo = (campo.id && document.querySelector('label[for="' + campo.id + '"]')) || (campo.previousElementSibling && campo.previousElementSibling.tagName === 'LABEL' ? campo.previousElementSibling : null);
      const selo = pai && pai.querySelector(':scope > .arx-acesso-hub');
      return [rotulo, campo, selo].filter(Boolean);
    }
    function grupoDe(campo) {
      // começa no pai: o próprio campo pode ter "cred" na classe (cred-senha)
      const cartao = campo.parentElement.closest('.card, .painel-sistema, .cred-row, [class*="cred"]') || document.body;
      const todos = Array.from(cartao.querySelectorAll('input'));
      const i = todos.indexOf(campo);
      // senha marcada: o usuário é o campo de texto logo antes; usuário marcado: a senha é o campo logo depois
      const par = ehTexto(campo) ? todos.slice(i + 1).find((x) => x.type === 'password') : todos.slice(0, i).reverse().find(ehTexto);
      return [par, campo].filter(Boolean).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    }
    function aplicar() {
      document.querySelectorAll('.arx-acesso-hub').forEach((selo) => {
        const campo = selo.previousElementSibling;
        if (!campo || campo.tagName !== 'INPUT' || campo.dataset.v3Hub || !/pelo Hub/i.test(selo.textContent)) return;
        const campos = grupoDe(campo);
        campos.forEach((c) => { c.dataset.v3Hub = '1'; });
        const ocultos = campos.flatMap(partes);
        const chip = document.createElement('div');
        chip.className = 'v3-hub-acesso';
        // o rótulo do campo pode ser o próprio oculto ou estar dentro do invólucro escondido
        const rotulo = campos.length === 1 && ocultos.map((el) => (el.tagName === 'LABEL' ? el : el.querySelector && el.querySelector('label'))).find(Boolean);
        const nome = rotulo ? rotulo.textContent.trim() + ' vem do Hub' : 'Acesso do Hub';
        chip.innerHTML = '<span class="v3-hub-ok" aria-hidden="true">✓</span><span></span><button type="button" class="link-btn"></button>';
        chip.children[1].textContent = nome;
        chip.children[2].textContent = rotulo ? 'Usar outra' : 'Usar outro login';
        const grupo = { campos, ocultos, chip, forcado: false };
        chip.querySelector('button').onclick = () => { grupo.forcado = true; mostrar(grupo, true); campos[0].focus(); };
        ocultos[0].parentNode.insertBefore(chip, ocultos[0]);
        grupos.push(grupo);
        mostrar(grupo, false);
        // login numa linha da lista de logins (Relatórios, Gerenciar permissões): a linha fica recolhida, só com o
        // título e o resumo das empresas; quem quiser mexer abre a linha
        const linha = campo.closest('.cred-row');
        if (linha && !linha.classList.contains('collapsed')) {
          linha.classList.add('collapsed');
          const botao = linha.querySelector('.cred-toggle');
          if (botao) botao.setAttribute('aria-expanded', 'false');
        }
      });
      // o selo sumiu (cofre travado, login trocado): os campos voltam
      grupos.forEach((g) => { if (!g.forcado && !g.campos.some(temSeloDoHub)) mostrar(g, true); });
    }
    function mostrar(g, campos) {
      g.ocultos.forEach((el) => el.classList.toggle('v3-hub-oculto', !campos));
      g.chip.hidden = campos;
    }
    let agendado = false;
    new MutationObserver(() => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => { agendado = false; aplicar(); }, 30);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    aplicar();
  }

  function nomearCampos() {
    const temNome = (c) => c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.closest('label') ||
      (c.id && document.querySelector('label[for="' + CSS.escape(c.id) + '"]'));
    const aplicar = () => {
      document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea').forEach((c) => {
        if (temNome(c)) return;
        let rotulo = c.previousElementSibling && c.previousElementSibling.tagName === 'LABEL' ? c.previousElementSibling : null;
        // rótulo e campo no mesmo invólucro, sem outro campo junto (o par é inequívoco)
        const pai = c.parentElement;
        if (!rotulo && pai && pai.querySelectorAll(':scope > label').length === 1 && pai.querySelectorAll('input, select, textarea').length === 1) rotulo = pai.querySelector(':scope > label');
        // rótulo logo antes da linha que agrupa o campo (ex.: select + botão numa .form-row), com um campo só na linha
        if (!rotulo && pai && !pai.querySelector(':scope > label') && pai.querySelectorAll('input, select, textarea').length === 1 &&
          pai.previousElementSibling && pai.previousElementSibling.tagName === 'LABEL' && !pai.previousElementSibling.htmlFor) rotulo = pai.previousElementSibling;
        const texto = rotulo && rotulo.textContent.replace(/\s+/g, ' ').trim();
        if (texto) c.setAttribute('aria-label', texto.slice(0, 120));
      });
    };
    let agendado = false;
    new MutationObserver(() => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => { agendado = false; aplicar(); }, 60);
    }).observe(document.body, { childList: true, subtree: true });
    aplicar();
  }

  // Abas pelo teclado (padrão WAI-ARIA): só a aba ativa entra no Tab; setas trocam, Home e End vão às pontas.
  function ligarTeclasDasAbas(lista, irPara) {
    if (!lista) return;
    const abas = () => Array.from(lista.querySelectorAll('[role="tab"]'));
    abas().forEach((a) => { a.tabIndex = a.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    lista.addEventListener('keydown', (ev) => {
      const todas = abas();
      const i = todas.indexOf(document.activeElement);
      if (i < 0) return;
      const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: todas.length - 1 }[ev.key];
      if (destino === undefined) return;
      ev.preventDefault();
      const alvo = todas[(destino + todas.length) % todas.length];
      irPara(alvo.getAttribute('data-aba'));
      alvo.focus();
    });
  }

  // ------------------------------------------------------------ demais automações do kit (v3)
  // Mesmo padrão da Foto e das Alt. Status, sem recriar nada: abas (Executar, Resultado, Histórico), os cartões do
  // formulário como estão, Andamento com passos e o log em "Detalhes técnicos". Os nós originais são movidos.
  function layoutPadrao() {
    const wrap = document.querySelector('.wrap');
    const cab = wrap && wrap.querySelector('header.page-header');
    if (!wrap || !cab) return;
    const $ = (id) => document.getElementById(id);
    const res = $('resultsCard');
    const extrasRes = [$('mensagensCard')].filter(Boolean);
    const hist = $('historicoCard');
    const abas = [['exec', 'Executar']];
    if (res) abas.push(['res', 'Resultado']);
    if (hist) abas.push(['hist', 'Histórico']);

    const v2 = document.createElement('div');
    v2.className = 'v2f v2p';
    if (abas.length > 1) {
      v2.innerHTML = '<div class="v2f-abas" role="tablist">' + abas.map(([k, t], i) =>
        '<button type="button" class="v2f-aba" role="tab" aria-selected="' + (i ? 'false' : 'true') + '" data-aba="' + k + '">' + t + (k === 'exec' ? '' : ' <span class="n" id="v2pN' + k + '">0</span>') + '</button>').join('') + '</div>';
    }
    const painel = (k) => { const p = document.createElement('div'); p.className = 'v2p-painel'; p.setAttribute('data-painel', k); if (k !== 'exec') p.hidden = true; v2.appendChild(p); return p; };
    const exec = painel('exec');
    const pRes = res ? painel('res') : null;
    const pHist = hist ? painel('hist') : null;
    cab.insertAdjacentElement('afterend', v2);
    // tudo o que vinha depois do cabeçalho vai para "Executar", menos resultado e histórico (e a tela ao vivo, fora do .wrap)
    Array.from(wrap.children).forEach((el) => { if (el !== cab && el !== v2) exec.appendChild(el); });
    if (pRes) { pRes.appendChild(res); extrasRes.forEach((el) => pRes.appendChild(el)); }
    if (pHist) pHist.appendChild(hist);

    // o cartão fica escondido até ter conteúdo (o app.js decide): a aba mostra uma mensagem no lugar
    const escondido = (el) => el.classList.contains('hidden') || el.style.display === 'none' || el.hidden;
    const comVazio = (painelAba, cartoes, texto) => {
      const vazio = document.createElement('div');
      vazio.className = 'card v2a-vazio';
      vazio.textContent = texto;
      painelAba.insertBefore(vazio, painelAba.firstChild);
      const atualizar = () => { vazio.hidden = cartoes.some((c) => !escondido(c)); };
      cartoes.forEach((c) => new MutationObserver(atualizar).observe(c, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] }));
      atualizar();
    };
    if (pRes) comVazio(pRes, [res, ...extrasRes], 'O resultado aparece aqui quando a execução terminar.');
    if (pHist) comVazio(pHist, [hist], 'Nenhuma execução carregada.');

    // o histórico só carrega pelo botão "Histórico de execuções" do cabeçalho (o app.js busca e mostra o cartão)
    const botaoHist = pHist ? Array.from(cab.querySelectorAll('button')).find((b) => /hist[óo]rico/i.test(b.textContent)) : null;
    let abrindoHist = false;
    function irPara(aba) {
      v2.querySelectorAll('.v2f-aba').forEach((x) => {
        const sel = x.getAttribute('data-aba') === aba;
        x.setAttribute('aria-selected', sel ? 'true' : 'false');
        x.tabIndex = sel ? 0 : -1;
      });
      v2.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.getAttribute('data-painel') !== aba; });
      if (aba === 'hist' && botaoHist && escondido(hist) && !abrindoHist) { abrindoHist = true; botaoHist.click(); abrindoHist = false; }
    }
    v2.querySelectorAll('.v2f-aba').forEach((b) => b.addEventListener('click', () => irPara(b.getAttribute('data-aba'))));
    if (botaoHist) botaoHist.addEventListener('click', () => { if (!abrindoHist) setTimeout(() => irPara('hist')); });
    ligarTeclasDasAbas(v2.querySelector('.v2f-abas'), irPara);

    // contagem nas abas: linhas da tabela (ou itens) que o app.js preenche
    const contar = (cartao, id) => {
      const alvo = $(id);
      if (!cartao || !alvo) return;
      const atualizar = () => {
        const corpo = cartao.querySelector('tbody') || cartao.querySelector('ul, ol, .lista, .historico-lista') || cartao;
        alvo.textContent = corpo.querySelectorAll(':scope > tr, :scope > li, :scope > .item, :scope > .historico-item').length;
      };
      new MutationObserver(atualizar).observe(cartao, { childList: true, subtree: true });
      atualizar();
    };
    contar(res, 'v2pNres');
    contar(hist, 'v2pNhist');

    // Andamento: passos pelo texto de andamento do app.js e o log recolhido
    const texto = $('progressText');
    const cartao = texto && texto.closest('.card');
    const log = cartao && cartao.querySelector('.log');
    if (!cartao) return;
    cartao.classList.add('v2p-andamento');
    const passos = document.createElement('ol');
    passos.className = 'v2f-passos';
    passos.hidden = true;
    passos.innerHTML = '<li data-p="0"><i></i>Conferindo os dados e os logins</li><li data-p="1"><i></i>Executando</li><li data-p="2"><i></i>Concluído</li>';
    if (log) {
      const det = document.createElement('details');
      det.className = 'v2f-tec';
      det.innerHTML = '<summary>Detalhes técnicos da execução</summary>';
      log.parentNode.insertBefore(det, log);
      det.appendChild(log);
      det.parentNode.insertBefore(passos, det);
    } else {
      cartao.appendChild(passos);
    }
    function passo(p, erro) {
      passos.hidden = false;
      passos.querySelectorAll('li').forEach((li) => {
        const i = Number(li.getAttribute('data-p'));
        li.className = erro && i === p ? 'erro' : i < p || p === 3 ? 'feito' : i === p ? 'agora' : '';
        li.querySelector('i').textContent = li.className === 'feito' ? '✓' : li.className === 'erro' ? '!' : '';
      });
    }
    let atual = -1;
    new MutationObserver(() => {
      const t = texto.textContent.trim();
      if (!t || /^Aguardando/i.test(t)) { passos.hidden = true; atual = -1; return; }
      if (/^Iniciando/i.test(t)) atual = 0;
      else if (/^(Conclu|Parad)/i.test(t)) { atual = 3; if (pRes) irPara('res'); }
      else if (/^(Erro|Conexão perdida)/i.test(t)) { passo(Math.max(0, atual), true); return; }
      else atual = 1;
      passo(atual);
    }).observe(texto, { childList: true, characterData: true, subtree: true });
  }

  // ------------------------------------------------------------ Alt. Status Usuário e Alt. Status Voluntário
  // Mesmo padrão da Foto: abas, dois cartões (o que fazer e resumo ao vivo), passos e detalhes técnicos recolhidos.
  // Os campos ORIGINAIS são movidos (não recriados): o app.js da automação continua lendo e preenchendo os mesmos
  // elementos (logins do Hub, empresas, planilha, iniciar, parar, tela ao vivo e resultado).
  function altStatusNova() {
    const wrap = document.querySelector('.wrap');
    const cab = wrap && wrap.querySelector('header.page-header');
    if (!wrap || !cab) return;
    const $ = (id) => document.getElementById(id);
    const acao = $('acaoGlobal');
    const cpfs = $('cpfsInput');
    const checklist = $('empresaChecklist'); // Usuário: várias empresas
    const select = $('empresaSelect'); // Voluntário: uma empresa
    const ehUsuario = !!checklist;
    const pessoa = ehUsuario ? 'usuário' : 'voluntário';

    const v2 = document.createElement('div');
    v2.className = 'v2f v2a';
    v2.innerHTML = `
      <div class="v2f-abas" role="tablist">
        <button type="button" class="v2f-aba" role="tab" aria-selected="true" data-aba="exec">Executar</button>
        <button type="button" class="v2f-aba" role="tab" aria-selected="false" data-aba="res">Resultado <span class="n" id="v2aN">0</span></button>
      </div>
      <section data-painel="exec" class="v2f-grade">
        <div class="card" id="v2aEsq">
          <h2>1. Quem e o que fazer</h2>
          <div class="v2f-campo">
            <label>Ação</label>
            <div class="v2a-acoes" role="group" aria-label="Ação">
              <button type="button" data-acao="bloquear"><b>Bloquear e inativar</b><small>Inativa no SGA e bloqueia no PowerCRM</small></button>
              <button type="button" data-acao="ativar"><b>Ativar e desbloquear</b><small>Ativa no SGA e desbloqueia no PowerCRM</small></button>
            </div>
          </div>
          <div class="v2f-campo" id="v2aVarias"><label>CPFs, nomes ou ${pessoa}s</label></div>
          <div class="v2f-campo" id="v2aEmpresas"></div>
          <div id="v2aIniciar" class="v2f-botoes"></div>
          <ol class="v2f-passos" id="v2aPassos" hidden>
            <li data-p="0"><i></i>Conferindo os dados e os logins</li>
            <li data-p="1"><i></i>Executando nos sistemas, uma empresa por vez</li>
            <li data-p="2"><i></i>Concluído: veja a aba Resultado</li>
          </ol>
        </div>
        <section class="card">
          <h2>2. Resumo</h2>
          <dl class="v2a-resumo" id="v2aResumo"></dl>
          <div id="v2aSistemas"></div>
          <details class="v2f-tec" id="v2aSobre"><summary>Sobre os logins guardados</summary></details>
        </section>
      </section>
      <section data-painel="exec" class="card" id="v2aAndamento">
        <h2>3. Andamento</h2>
        <details class="v2f-tec" id="v2aTec"><summary>Detalhes técnicos da execução</summary></details>
      </section>
      <section data-painel="res" id="v2aRes" hidden>
        <div class="card v2a-vazio" id="v2aResVazio">O resultado aparece aqui quando a execução terminar.</div>
      </section>`;
    cab.insertAdjacentElement('afterend', v2);

    // move os campos originais para os lugares novos (os ids e os ouvintes do app.js vão junto)
    const mover = (el, destino) => { if (el && destino) destino.appendChild(el); };
    const empresas = $('v2aEmpresas');
    if (ehUsuario) {
      mover($('empresaSelecionarTodas') && $('empresaSelecionarTodas').closest('.field-head'), empresas);
      mover(checklist, empresas);
    } else {
      mover(document.querySelector('label[for="empresaSelect"]'), empresas);
      mover(select, empresas);
    }
    mover($('empresaHint'), empresas);
    const abasOriginais = document.querySelector('.tabs');
    mover(abasOriginais, $('v2aVarias'));
    mover($('tab-manual'), $('v2aVarias'));
    mover($('tab-planilha'), $('v2aVarias'));
    mover($('startBtn'), $('v2aIniciar'));
    mover($('formError'), $('v2aIniciar'));
    const sobre = $('painelPowercrm') && $('painelPowercrm').parentNode.querySelector('#painelPowercrm ~ p.hint');
    mover($('painelSga'), $('v2aSistemas'));
    mover($('painelPowercrm'), $('v2aSistemas'));
    if (sobre) { sobre.classList.add('v2f-ajuda'); mover(sobre, $('v2aSobre')); } else $('v2aSobre').remove();
    const progresso = document.querySelector('.progress-row');
    $('v2aAndamento').insertBefore(progresso, $('v2aTec'));
    mover($('log'), $('v2aTec'));
    const resultados = $('resultsCard');
    mover(resultados, $('v2aRes'));
    // o que sobrou da tela antiga (cartões vazios, rótulo e dica da ação) some; o PiP e os scripts ficam
    Array.from(wrap.children).forEach((el) => { if (el !== cab && el !== v2) el.classList.add('v2-escondido'); });
    passosDiscretos(v2);

    // abas: Executar (lista colada ou planilha, os campos originais) e Resultado; uma pessoa só é uma lista de uma linha
    function irPara(aba) {
      v2.querySelectorAll('.v2f-aba').forEach((x) => {
        const sel = x.getAttribute('data-aba') === aba;
        x.setAttribute('aria-selected', sel ? 'true' : 'false');
        x.tabIndex = sel ? 0 : -1;
      });
      v2.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = (aba === 'res') !== (p.getAttribute('data-painel') === 'res'); });
      if (aba !== 'res') atualizar();
    }
    v2.querySelectorAll('.v2f-aba').forEach((b) => b.addEventListener('click', () => irPara(b.getAttribute('data-aba'))));
    ligarTeclasDasAbas(v2.querySelector('.v2f-abas'), irPara);

    // ação: dois botões grandes ligados ao select original
    v2.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => {
      acao.value = b.getAttribute('data-acao');
      acao.dispatchEvent(new Event('change', { bubbles: true }));
      atualizar();
    }));

    // resumo ao vivo (a "prévia" desta automação): ação, quem, empresas e sistemas
    const visivel = (el) => el && !el.classList.contains('hidden');
    function atualizar() {
      v2.querySelectorAll('[data-acao]').forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-acao') === acao.value ? 'true' : 'false'));
      const ativa = document.querySelector('.tab-btn.active[data-tab]');
      const planilha = ativa && ativa.getAttribute('data-tab') === 'planilha';
      const arquivo = $('planilhaInput') && $('planilhaInput').files[0];
      const linhas = cpfs.value.split('\n').map((x) => x.trim()).filter(Boolean);
      const quem = planilha ? (arquivo ? 'Planilha ' + arquivo.name : 'Nenhuma planilha escolhida') : linhas.length === 1 ? '1 pessoa' : linhas.length ? linhas.length + ' pessoas' : 'Não informado';
      let emp;
      if (ehUsuario) {
        const marcadas = Array.from(checklist.querySelectorAll('input:checked')).map((cb) => (cb.closest('label') || cb).textContent.trim());
        emp = !marcadas.length ? 'Nenhuma marcada' : marcadas.length <= 3 ? marcadas.join(', ') : marcadas.length + ' empresas';
      } else {
        emp = select.selectedOptions[0] ? select.selectedOptions[0].textContent : 'Não informado';
      }
      const sistemas = [
        visivel($('painelSga')) && $('executarSga') && $('executarSga').checked ? 'SGA' : null,
        visivel($('painelPowercrm')) && $('executarPowercrm') && $('executarPowercrm').checked ? 'PowerCRM' : null,
      ].filter(Boolean);
      const linha = (k, v, cls) => '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</dd>';
      $('v2aResumo').innerHTML = linha('Ação', acao.value === 'ativar' ? 'Ativar e desbloquear' : 'Bloquear e inativar', acao.value === 'ativar' ? 'ok' : 'perigo') +
        linha('Quem', quem) + linha(ehUsuario ? 'Empresas' : 'Empresa', emp) + linha('Sistemas', sistemas.length ? sistemas.join(' e ') : 'Nenhum marcado');
    }
    document.addEventListener('change', atualizar, true);
    document.addEventListener('input', atualizar, true);
    // o app.js mostra os painéis de sistema e monta a lista de empresas depois de ler /api/opcoes
    new MutationObserver(atualizar).observe($('v2aSistemas'), { attributes: true, subtree: true, attributeFilter: ['class'] });
    new MutationObserver(atualizar).observe(ehUsuario ? checklist : select, { childList: true, subtree: true });

    // passos pelo texto de andamento do app.js; ao terminar com resultado, abre a aba Resultado
    const progressoTexto = $('progressText');
    function passo(p, erro) {
      const lista = $('v2aPassos');
      lista.hidden = false;
      lista.querySelectorAll('li').forEach((li) => {
        const i = Number(li.getAttribute('data-p'));
        li.className = erro && i === p ? 'erro' : i < p || p === 3 ? 'feito' : i === p ? 'agora' : '';
        li.querySelector('i').textContent = li.className === 'feito' ? '✓' : li.className === 'erro' ? '!' : '';
      });
    }
    let atual = -1;
    new MutationObserver(() => {
      const t = progressoTexto.textContent;
      if (/^Iniciando/.test(t)) atual = 0;
      else if (/^(Processando|Reconectado)/.test(t)) atual = 1;
      else if (/^Concluído/.test(t)) { atual = 3; if (resultados.querySelector('tbody tr')) irPara('res'); }
      else if (/^Erro/.test(t)) { passo(Math.max(0, atual), true); return; }
      else return;
      passo(atual);
    }).observe(progressoTexto, { childList: true, characterData: true, subtree: true });
    const tbody = resultados.querySelector('tbody');
    new MutationObserver(() => {
      const n = tbody.querySelectorAll('tr').length;
      $('v2aN').textContent = n;
      $('v2aResVazio').hidden = n > 0;
    }).observe(tbody, { childList: true });

    irPara('exec');
  }

  // ------------------------------------------------------------ Gerar foto de perfil
  function fotoNova() {
    const wrap = document.querySelector('.wrap');
    const cab = wrap && wrap.querySelector('header.page-header');
    if (!wrap || !cab) return;
    // a tela antiga continua no DOM (escondida) para o app.js original não quebrar
    Array.from(wrap.children).forEach((el) => { if (el !== cab) el.classList.add('v2-escondido'); });
    const DEPTOS = ['Comercial', 'Qualidade', 'Cadastro', 'Financeiro', 'Eventos', 'Assistência'];
    const ORIGEM = { tela: 'Tela', chamado: 'Chamado do GLPI', api: 'API' };
    const v2 = document.createElement('div');
    v2.className = 'v2f';
    v2.innerHTML = `
      <div class="v2f-abas" role="tablist">
        <button type="button" class="v2f-aba" role="tab" aria-selected="true" data-aba="uma">Uma foto</button>
        <button type="button" class="v2f-aba" role="tab" aria-selected="false" data-aba="varias">Várias fotos</button>
        <button type="button" class="v2f-aba" role="tab" aria-selected="false" data-aba="hist">Histórico <span class="n" id="v2fN">0</span></button>
      </div>
      <section data-painel="uma" class="v2f-grade">
        <form class="card" id="v2fForm" novalidate>
          <h2>1. Dados da foto</h2>
          <div class="v2f-campo">
            <label for="v2fNome">Nome (primeiro e último) <span id="v2fCN">0/60</span></label>
            <input type="text" id="v2fNome" maxlength="60" autocomplete="off" placeholder="Ester Dias" aria-describedby="v2fEN">
            <p class="v2f-erro" id="v2fEN" hidden></p>
          </div>
          <div class="v2f-campo">
            <label for="v2fDepto">Departamento <span id="v2fCD">0/60</span></label>
            <input type="text" id="v2fDepto" maxlength="60" autocomplete="off" placeholder="Qualidade" aria-describedby="v2fED">
            <p class="v2f-erro" id="v2fED" hidden></p>
            <div class="v2f-chips" id="v2fChips" aria-label="Departamentos usados com frequência"></div>
          </div>
          <p class="v2f-ajuda" style="margin-bottom:16px">O departamento é exibido em caixa alta e, se for extenso, quebra em duas linhas. A Assistência usa "ANALISTA 4" (o número) no lugar do nome. Nos chamados do GLPI, o departamento vem do nome do solicitante e o nome vem do texto do chamado.</p>
          <div class="v2f-botoes">
            <button type="submit" class="v2f-btn primario" id="v2fGerar">Gerar foto</button>
            <button type="button" class="v2f-btn" id="v2fLimpar">Limpar</button>
          </div>
          <ol class="v2f-passos" id="v2fPassos" hidden>
            <li data-p="0"><i></i>Conferindo nome e departamento</li>
            <li data-p="1"><i></i>Montando a arte em 1600 x 1600</li>
            <li data-p="2"><i></i>Foto pronta e guardada no histórico</li>
          </ol>
        </form>
        <section class="card">
          <h2>2. Prévia</h2>
          <div class="v2f-previa" id="v2fPrevia"><span class="vazio">A prévia aparece aqui enquanto você digita.</span></div>
          <div class="v2f-acoes-previa">
            <a class="v2f-btn" id="v2fBaixar" aria-disabled="true">Baixar PNG</a>
            <button type="button" class="v2f-btn" id="v2fCopiar" disabled>Copiar imagem</button>
          </div>
        </section>
      </section>
      <section data-painel="varias" class="card" hidden>
        <h2>Várias fotos de uma vez</h2>
        <div class="v2f-campo">
          <label for="v2fLote">Uma pessoa por linha, no formato Nome; Departamento <span id="v2fCL">0 linhas</span></label>
          <textarea id="v2fLote" rows="7" spellcheck="false" placeholder="Ester Dias; Qualidade&#10;Bruno Costa; Comercial"></textarea>
        </div>
        <div class="v2f-botoes"><button type="button" class="v2f-btn primario" id="v2fGerarLote" disabled>Gerar fotos</button></div>
        <div class="v2f-lote" id="v2fGrade"></div>
      </section>
      <section data-painel="hist" class="card" hidden>
        <div class="card-head"><h2>Histórico de execuções</h2><button type="button" class="v2f-btn" id="v2fAtualizar">Atualizar</button></div>
        <div style="overflow-x:auto"><table class="v2f-hist"><tbody id="v2fHist"></tbody></table></div>
      </section>
      <details class="card v2f-tec"><summary>Detalhes técnicos da execução</summary><div class="log" id="v2fLog"><div class="log-empty">O log da execução será exibido aqui.</div></div></details>`;
    cab.insertAdjacentElement('afterend', v2);

    const $ = (id) => document.getElementById(id);
    const nome = $('v2fNome');
    const depto = $('v2fDepto');
    const previa = $('v2fPrevia');
    const limpo = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    let gerada = null; // { url, arquivo } depois de "Gerar foto"
    let espera = null;
    let historico = [];
    passosDiscretos(v2);

    function log(msg, classe) {
      const el = $('v2fLog');
      if (el.querySelector('.log-empty')) el.innerHTML = '';
      const linha = document.createElement('div');
      linha.className = 'line' + (classe ? ' ' + classe : '');
      linha.innerHTML = '<span class="log-ts">[' + new Date().toLocaleTimeString('pt-BR') + ']</span> ' + esc(msg);
      el.appendChild(linha);
    }

    // abas
    v2.querySelectorAll('.v2f-aba').forEach((b) => b.addEventListener('click', () => {
      v2.querySelectorAll('.v2f-aba').forEach((x) => { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); x.tabIndex = x === b ? 0 : -1; });
      v2.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.getAttribute('data-painel') !== b.getAttribute('data-aba'); });
      if (b.getAttribute('data-aba') === 'hist') carregarHistorico();
    }));
    ligarTeclasDasAbas(v2.querySelector('.v2f-abas'), (aba) => v2.querySelector('.v2f-aba[data-aba="' + aba + '"]').click());

    // prévia ao vivo: a arte de verdade, desenhada pela automação sem gravar (/api/foto.png)
    const urlPrevia = (n, d, baixar) => '/api/foto.png?nome=' + encodeURIComponent(n) + '&departamento=' + encodeURIComponent(d) + (baixar ? '&baixar=1' : '');
    function mostrarPrevia() {
      const n = limpo(nome.value), d = limpo(depto.value);
      $('v2fCN').textContent = nome.value.length + '/60';
      $('v2fCD').textContent = depto.value.length + '/60';
      if (gerada) { gerada = null; }
      clearTimeout(espera);
      if (!n || !d) {
        previa.innerHTML = '<span class="vazio">A prévia aparece aqui enquanto você digita.</span>';
        habilitarAcoes(null);
        return;
      }
      espera = setTimeout(() => {
        let img = previa.querySelector('img');
        if (!img) { previa.innerHTML = '<img alt="Prévia da foto de perfil"><span class="v2f-selo" id="v2fSelo">Prévia ao vivo</span>'; img = previa.querySelector('img'); }
        img.classList.add('carregando');
        img.onload = () => img.classList.remove('carregando');
        img.onerror = () => { previa.innerHTML = '<span class="vazio">Não foi possível montar a prévia.</span>'; };
        img.src = urlPrevia(n, d);
        $('v2fSelo').textContent = 'Prévia ao vivo';
        $('v2fSelo').className = 'v2f-selo';
        habilitarAcoes(urlPrevia(n, d, true));
      }, 450);
    }
    function habilitarAcoes(urlBaixar) {
      const b = $('v2fBaixar');
      if (urlBaixar) { b.href = urlBaixar; b.removeAttribute('aria-disabled'); } else { b.removeAttribute('href'); b.setAttribute('aria-disabled', 'true'); }
      $('v2fCopiar').disabled = !urlBaixar || !(navigator.clipboard && window.ClipboardItem && window.isSecureContext);
      $('v2fCopiar').title = $('v2fCopiar').disabled && urlBaixar ? 'O navegador só copia imagens em endereço seguro (HTTPS)' : '';
    }
    nome.addEventListener('input', () => { validar(false); mostrarPrevia(); });
    depto.addEventListener('input', () => { validar(false); mostrarPrevia(); });
    DEPTOS.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'v2f-chip'; b.textContent = d;
      b.onclick = () => { depto.value = d; validar(false); mostrarPrevia(); depto.focus(); };
      $('v2fChips').appendChild(b);
    });
    function validar(mostrar) {
      const erros = { n: !limpo(nome.value) ? 'Informe o nome.' : '', d: !limpo(depto.value) ? 'Informe o departamento.' : '' };
      [['n', nome, 'v2fEN'], ['d', depto, 'v2fED']].forEach(([k, el, id]) => {
        if (!mostrar && el.getAttribute('aria-invalid') !== 'true') return;
        el.setAttribute('aria-invalid', erros[k] ? 'true' : 'false');
        $(id).hidden = !erros[k];
        $(id).textContent = erros[k];
      });
      return erros;
    }
    function passo(p, erro) {
      const lista = $('v2fPassos');
      lista.hidden = false;
      lista.querySelectorAll('li').forEach((li) => {
        const i = Number(li.getAttribute('data-p'));
        li.className = erro && i === p ? 'erro' : i < p || p === 3 ? 'feito' : i === p ? 'agora' : '';
        li.querySelector('i').textContent = li.className === 'feito' ? '✓' : li.className === 'erro' ? '!' : '';
      });
    }
    async function gerar(n, d) {
      const resp = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: n, departamento: d }) });
      const x = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(x.error || 'HTTP ' + resp.status);
      return x;
    }
    $('v2fForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const erros = validar(true);
      if (erros.n) return nome.focus();
      if (erros.d) return depto.focus();
      const n = limpo(nome.value), d = limpo(depto.value);
      $('v2fGerar').disabled = true;
      passo(0);
      log('Gerando a foto de ' + n + ' (' + d.toUpperCase() + ').');
      try {
        passo(1);
        const x = await gerar(n, d);
        gerada = x;
        previa.innerHTML = '<img alt="Foto de perfil gerada" src="' + esc(x.url) + '"><span class="v2f-selo ok" id="v2fSelo">Foto gerada</span>';
        habilitarAcoes(x.url + '?baixar=1');
        passo(3);
        log('Foto gerada (1600 x 1600): ' + x.arquivo, 'ok');
        carregarHistorico();
      } catch (err) {
        passo(1, true);
        log('Falha na geração: ' + err.message, 'err');
        $('v2fEN').hidden = false;
        $('v2fEN').textContent = err.message;
      } finally {
        $('v2fGerar').disabled = false;
      }
    });
    $('v2fLimpar').onclick = () => {
      nome.value = ''; depto.value = '';
      [nome, depto].forEach((el) => el.setAttribute('aria-invalid', 'false'));
      $('v2fEN').hidden = true; $('v2fED').hidden = true; $('v2fPassos').hidden = true;
      mostrarPrevia(); nome.focus();
    };
    $('v2fCopiar').onclick = async () => {
      try {
        const blob = await (await fetch($('v2fBaixar').href.replace(/([?&])baixar=1&?/, '$1').replace(/[?&]$/, ''))).blob();
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        $('v2fCopiar').textContent = 'Copiada';
      } catch {
        $('v2fCopiar').textContent = 'Não deu para copiar';
      }
      setTimeout(() => { $('v2fCopiar').textContent = 'Copiar imagem'; }, 1800);
    };

    // várias fotos: uma por linha, geradas uma depois da outra (cada uma vai para o histórico)
    const lote = $('v2fLote');
    const linhasLote = () => lote.value.split('\n').map(limpo).filter(Boolean);
    lote.addEventListener('input', () => { const n = linhasLote().length; $('v2fCL').textContent = n === 1 ? '1 linha' : n + ' linhas'; $('v2fGerarLote').disabled = !n; });
    $('v2fGerarLote').onclick = async () => {
      const grade = $('v2fGrade');
      grade.innerHTML = '';
      $('v2fGerarLote').disabled = true;
      const caixas = linhasLote().map((linha) => {
        const [n, d] = linha.split(';').map(limpo);
        const caixa = document.createElement('div');
        caixa.className = 'v2f-mini';
        caixa.innerHTML = '<div class="img">Na fila</div><div class="pe"><b></b><span class="v2f-sit">Na fila</span></div>';
        caixa.querySelector('b').textContent = n || 'Sem nome';
        grade.appendChild(caixa);
        return { caixa, n, d };
      });
      for (const { caixa, n, d } of caixas) {
        const sit = caixa.querySelector('.v2f-sit');
        if (!n || !d) { caixa.classList.add('erro'); sit.className = 'v2f-sit erro'; sit.textContent = !n ? 'Falta o nome' : 'Falta o departamento'; continue; }
        sit.className = 'v2f-sit rodando'; sit.textContent = 'Gerando';
        try {
          const x = await gerar(n, d);
          caixa.querySelector('.img').innerHTML = '<img alt="Foto de ' + esc(n) + '" src="' + esc(x.url) + '">';
          const a = document.createElement('a');
          a.className = 'v2f-btn'; a.style.height = '26px'; a.style.padding = '0 10px'; a.style.fontSize = '12px';
          a.href = x.url + '?baixar=1'; a.textContent = 'Baixar';
          sit.replaceWith(a);
          log('Foto gerada: ' + x.arquivo, 'ok');
        } catch (err) {
          caixa.classList.add('erro'); sit.className = 'v2f-sit erro'; sit.textContent = 'Erro';
          log('Falha em ' + n + ': ' + err.message, 'err');
        }
      }
      $('v2fGerarLote').disabled = false;
      carregarHistorico();
    };

    // histórico real da automação
    async function carregarHistorico() {
      const tb = $('v2fHist');
      try {
        historico = await (await fetch('/api/execucoes')).json();
      } catch {
        tb.innerHTML = '<tr><td class="v2f-ajuda">Não foi possível carregar o histórico.</td></tr>';
        return;
      }
      $('v2fN').textContent = historico.length;
      tb.innerHTML = historico.length ? '' : '<tr><td class="v2f-ajuda">Nenhuma execução realizada.</td></tr>';
      historico.forEach((x) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td style="width:56px"><a href="' + esc(x.url) + '" target="_blank" rel="noopener"><img src="' + esc(x.url) + '" alt="" loading="lazy"></a></td>' +
          '<td><b>' + esc(x.nome) + '</b> · ' + esc(String(x.departamento).toUpperCase()) + (x.teste ? '<span class="v2f-tag">Teste</span>' : '') +
          '<small>' + esc(x.inicio ? new Date(x.inicio).toLocaleString('pt-BR') : '') + ' · ' + esc(ORIGEM[x.origem] || x.origem) + (x.chamado ? ' #' + esc(x.chamado) : '') + '</small></td>' +
          '<td style="text-align:right;white-space:nowrap"><a class="v2f-btn" style="height:28px;font-size:12px" href="' + esc(x.url) + '?baixar=1">Baixar</a> <button type="button" class="v2f-btn" style="height:28px;font-size:12px">Usar de novo</button></td>';
        tr.querySelector('button').onclick = () => { nome.value = x.nome; depto.value = x.departamento; mostrarPrevia(); v2.querySelector('[data-aba="uma"]').click(); nome.focus(); };
        tb.appendChild(tr);
      });
    }
    $('v2fAtualizar').onclick = carregarHistorico;
    carregarHistorico();
  }
})();
