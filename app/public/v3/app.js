(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;
  const { Icon, ICON_CHOICES, COLOR_CHOICES, CATEGORY_CHOICES } = window.Icons;
  const CATEGORY_META = CATEGORY_CHOICES.reduce((acc, c) => { acc[c.key] = c; return acc; }, {});
  const GLPI_TOKEN_STORAGE_KEY = 'arxhub_glpi_user_token';

  function toCamel(prop) {
    const isVendor = /^-(webkit|moz|ms|o)-/.test(prop);
    const parts = prop.split('-').filter(Boolean);
    if (isVendor) {
      const vendor = parts[0];
      const vendorCap = vendor === 'ms' ? 'ms' : vendor.charAt(0).toUpperCase() + vendor.slice(1);
      const rest = parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      return vendorCap + rest.join('');
    }
    return parts[0] + parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  function sx(str) {
    if (!str) return undefined;
    const out = {};
    str.split(';').forEach((rule) => {
      const idx = rule.indexOf(':');
      if (idx === -1) return;
      const prop = rule.slice(0, idx).trim();
      const val = rule.slice(idx + 1).trim();
      if (!prop || !val) return;
      out[toCamel(prop)] = val;
    });
    return out;
  }

  // v2: situação escrita no selo (não só a cor)
  const STATUS_V2 = { online: 'No ar', offline: 'Fora do ar', checking: 'Verificando' };
  const lerLocal = (k, padrao) => { try { return localStorage.getItem(k) || padrao; } catch (err) { return padrao; } };
  const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (err) { /* sem armazenamento: vale só nesta aba */ } };
  const STATUS_META = {
    online: { color: 'var(--accent)', label: 'Online' },
    offline: { color: 'var(--error)', label: 'Offline' },
    checking: { color: 'var(--warn)', label: 'Verificando' },
  };
  const TOAST_META = {
    success: { color: 'var(--accent)', icon: 'Activity' },
    error: { color: 'var(--error)', icon: 'AlertCircle' },
    info: { color: '#1E4A9E', icon: 'Activity' },
  };

  const PORTA_PROXY = 8318; // proxy das automações (PROXY_PORT do servidor; acessos.js usa a mesma)

  async function api(path, options) {
    // Token do GLPI do cofre: o servidor só deixa admin cadastrar, editar ou remover automação.
    const token = ((window.ArxAcessosHub && window.ArxAcessosHub.ler()) || {}).userToken || '';
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': token },
      ...options,
    });
    if (!res.ok) {
      let message = 'Erro na requisição';
      try { const body = await res.json(); if (body.error) message = body.error; } catch (_) { /* resposta sem JSON: fica a mensagem genérica */ }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Busca de pessoa do GLPI (requerente e atribuído): digita, filtra e escolhe com o teclado.
  function EscolhaPessoa({ users, valor, mudar, id }) {
    const [texto, setTexto] = useState('');
    const [aberta, setAberta] = useState(false);
    const [sel, setSel] = useState(0);
    const atual = users.find((u) => String(u.id) === String(valor));
    const lista = users.filter((u) => u.label.toLowerCase().includes(texto.trim().toLowerCase())).slice(0, 50);
    const escolher = (u) => { mudar(u ? u.id : ''); setTexto(''); setAberta(false); };
    return e('div', { className: 'ext-escolha' }, [
      e('input', {
        key: 'i', id, role: 'combobox', 'aria-expanded': aberta ? 'true' : 'false', autoComplete: 'off', value: aberta ? texto : (atual ? atual.label : ''), placeholder: atual ? atual.label : 'Buscar pessoa',
        onFocus: () => { setAberta(true); setSel(0); }, onBlur: () => setTimeout(() => setAberta(false), 150),
        onChange: (ev) => { setTexto(ev.target.value); setAberta(true); setSel(0); },
        onKeyDown: (ev) => {
          if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
          if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (ev.key === 'Enter' && lista[sel]) { ev.preventDefault(); escolher(lista[sel]); }
        },
      }),
      atual && !aberta ? e('button', { key: 'x', type: 'button', className: 'v2-limpar', 'aria-label': 'Limpar', onMouseDown: (ev) => ev.preventDefault(), onClick: () => escolher(null) }, Icon('X', 13)) : null,
      aberta ? e('ul', { key: 'l', className: 'ext-escolha-lista', role: 'listbox' }, lista.length ? lista.map((u, i) => e('li', {
        key: u.id, role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onMouseDown: (ev) => { ev.preventDefault(); escolher(u); }, onMouseEnter: () => setSel(i),
      }, [e('span', { key: 'a', className: 'ext-avatar' }, u.label.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()), u.label])) : [e('li', { key: 'v', className: 'ext-escolha-vazio' }, 'Ninguém com esse nome')]) : null,
    ]);
  }

  // Ícones que o Hub sabe desenhar (cartões do Hub atual também), sem os de interface.
  const ICONES_V2 = Icons_NAMES().filter((n) => !['X', 'Plus', 'Search', 'MoreHorizontal', 'Pencil', 'Copy', 'ExternalLink', 'Trash2', 'Maximize2', 'Loader2', 'ChevronDown', 'ArrowLeft', 'RefreshCw', 'WifiOff', 'AlertCircle'].includes(n));
  function Icons_NAMES() { return (window.Icons.NAMES || ICON_CHOICES).slice(); }
  const CORES_V2 = [...COLOR_CHOICES, '#0EA5E9', '#EC4899', '#6366F1', '#F97316', '#84CC16', '#64748B'];

  // Nova automação / Editar automação: layout novo, uma coluna só (prévia, dados, aparência e testes).
  function FormAutomacaoV2({ form, modo, setCampo, fechar, salvar, testar, teste }) {
    const { Modal } = window.ExemploUI;
    const [tocado, setTocado] = useState(false);
    const [buscaIcone, setBuscaIcone] = useState('');
    const cats = Array.isArray(form.categories) ? form.categories : [];
    const erros = { name: !String(form.name || '').trim() ? 'Informe o nome.' : '', url: !String(form.url || '').trim() ? 'Informe a URL.' : '' };
    const campo = (rotulo, filho, ajuda, erro) => e('div', { className: 'exu-campo' }, [e('label', { key: 'l' }, rotulo), filho, erro ? e('p', { key: 'e', className: 'exu-campo-erro' }, erro) : ajuda ? e('p', { key: 'a', className: 'exu-campo-ajuda' }, ajuda) : null]);
    const textoTeste = teste === 'testing' ? 'Testando…' : teste === 'online' ? 'Conexão bem-sucedida' : teste === 'offline' ? 'Falha na conexão' : 'Testar conexão';
    const previaCats = cats.map((k) => CATEGORY_META[k]).filter(Boolean);
    return e(Modal, {
      titulo: modo === 'new' ? 'Nova automação' : 'Editar automação', largura: 560, fechar,
      descricao: modo === 'new' ? 'Ela aparece no Painel para quem tem acesso e o Hub passa a conferir se está no ar.' : 'As mudanças valem para todos que veem esta automação.',
      rodape: [
        e('button', { key: 't', type: 'button', className: 'exu-btn' + (teste === 'online' ? ' v2-ok' : teste === 'offline' ? ' perigo' : ''), style: { marginRight: 'auto' }, disabled: teste === 'testing', onClick: testar },
          [teste === 'testing' ? e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14)) : Icon(teste === 'offline' ? 'AlertCircle' : 'Activity', 14, 'currentColor'), textoTeste]),
        e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: fechar }, 'Cancelar'),
        e('button', { key: 's', type: 'button', className: 'exu-btn primario', onClick: () => { setTocado(true); if (!erros.name && !erros.url) salvar(); } }, modo === 'new' ? 'Cadastrar' : 'Salvar'),
      ],
    }, [
      e('div', { key: 'p', className: 'exu-campo' }, [e('label', { key: 'l' }, 'Prévia do cartão'), e('div', { key: 'c', className: 'v2-previa' }, [
        e('span', { key: 'i', className: 'v2-linha-ic', style: { background: (form.color || '#1E4A9E') + '22' } }, Icon(form.icon || 'Workflow', 18, form.color || '#1E4A9E')),
        e('div', { key: 'n', style: { minWidth: 0, flex: 1 } }, [e('b', { key: 'b' }, form.name || 'Nome da automação'), e('small', { key: 's' }, form.description || 'A descrição aparece aqui, em até duas linhas.')]),
        e('span', { key: 'st', className: 'v2-status online' }, [e('i', { key: 'i' }), 'No ar']),
      ]), previaCats.length ? e('div', { key: 'k', className: 'v2-linha-cats' }, previaCats.map((c) => e('span', { key: c.key, style: { background: c.color + '22', color: 'color-mix(in srgb, ' + c.color + ' var(--chip-mix), var(--text))' } }, c.label))) : null]),
      campo('Nome', e('input', { value: form.name || '', onChange: (ev) => setCampo('name', ev.target.value), placeholder: 'Ex.: Emissão de boletos', maxLength: 80, 'aria-invalid': !!(tocado && erros.name) }), null, tocado && erros.name),
      campo('URL (vista pelo servidor do Hub)', e('input', { value: form.url || '', onChange: (ev) => setCampo('url', ev.target.value), placeholder: 'http://alterar-senha-sga:4016/', spellCheck: false, style: { fontFamily: 'var(--font-mono)', fontSize: 13 }, 'aria-invalid': !!(tocado && erros.url) }), 'O navegador nunca vê este endereço: a tela abre pelo proxy do Hub.', tocado && erros.url),
      e('div', { key: 'cat', className: 'exu-campo' }, [
        e('label', { key: 'l' }, ['Sistemas ', e('span', { key: 's', style: { fontWeight: 400, color: 'var(--muted)' } }, '(pode marcar mais de um)')]),
        e('div', { key: 'c', className: 'ex-cats', role: 'group', 'aria-label': 'Sistemas' }, CATEGORY_CHOICES.map((c) => e('button', {
          key: c.key, type: 'button', 'aria-pressed': cats.includes(c.key) ? 'true' : 'false', onClick: () => setCampo('categories', cats.includes(c.key) ? cats.filter((k) => k !== c.key) : [...cats, c.key]),
        }, [e('i', { key: 'i', style: { background: c.color } }), c.label]))),
      ]),
      e('div', { key: 'cor', className: 'exu-campo' }, [
        e('label', { key: 'l' }, 'Cor'),
        e('div', { key: 'c', className: 'ex-cores', role: 'radiogroup', 'aria-label': 'Cor' }, CORES_V2.map((c) => e('button', { key: c, type: 'button', role: 'radio', 'aria-checked': form.color === c ? 'true' : 'false', 'aria-label': 'Cor ' + c, style: { background: c }, onClick: () => setCampo('color', c) }, form.color === c ? Icon('Activity', 12, '#fff', 2.5) : null))),
      ]),
      e('div', { key: 'ic', className: 'exu-campo' }, [
        e('label', { key: 'l' }, 'Ícone'),
        e('label', { key: 'b', className: 'exu-busca', style: { flex: 'none', height: 32 } }, [Icon('Search', 14, 'var(--muted-soft)'), e('input', { key: 'i', value: buscaIcone, onChange: (ev) => setBuscaIcone(ev.target.value), placeholder: 'Buscar ícone (em inglês)', 'aria-label': 'Buscar ícone' })]),
        e('div', { key: 'g', className: 'exu-icones ex-icones-lista', role: 'radiogroup', 'aria-label': 'Ícone' }, ICONES_V2.filter((n) => n.toLowerCase().includes(buscaIcone.toLowerCase())).map((n) => e('button', {
          key: n, type: 'button', role: 'radio', 'aria-checked': form.icon === n ? 'true' : 'false', 'aria-pressed': form.icon === n ? 'true' : 'false', title: n, 'aria-label': n, onClick: () => setCampo('icon', n),
        }, Icon(n, 17, form.icon === n ? (form.color || 'currentColor') : 'currentColor')))),
      ]),
      campo('Descrição', e('textarea', { value: form.description || '', onChange: (ev) => setCampo('description', ev.target.value), maxLength: 160, placeholder: 'Finalidade da automação' }), (form.description || '').length + '/160 · aparece no cartão, em até duas linhas.'),
      campo('Minutos que um item levaria à mão (opcional)', e('input', { inputMode: 'decimal', value: form.minutosPorItem == null ? '' : form.minutosPorItem, onChange: (ev) => setCampo('minutosPorItem', ev.target.value), placeholder: '4', style: { fontFamily: 'var(--font-mono)' } }), 'Base do tempo economizado das execuções manuais na aba Resultados (itens concluídos x minutos).'),
      campo('Container Docker (opcional)', e('input', { value: form.container || '', onChange: (ev) => setCampo('container', ev.target.value), placeholder: 'boletos-service', style: { fontFamily: 'var(--font-mono)' } })),
    ]);
  }

  function App() {
    const [automations, setAutomations] = useState([]);
    const [automationsLoaded, setAutomationsLoaded] = useState(false);
    const [search, setSearch] = useState('');
    const [visaoPainel, setVisaoPainel] = useState(() => lerLocal('arxhub_v2_visao', 'grade'));
    const trocarVisao = (v) => { setVisaoPainel(v); gravarLocal('arxhub_v2_visao', v); };
    const [glpiAba, setGlpiAba] = useState('novo');
    const [glpiTocado, setGlpiTocado] = useState(false);
    const [glpiSucesso, setGlpiSucesso] = useState(null);
    const [openTabs, setOpenTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [viewerLoad, setViewerLoad] = useState({});
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('new');
    const [modalForm, setModalForm] = useState(null);
    const [testState, setTestState] = useState('idle');
    const [menuOpenId, setMenuOpenId] = useState(null);
    // A lista do servidor não traz a URL real (só `endereco`, mascarado): a tela abre pelo proxy do Hub (proxy.js).
    // Quem gerencia (admin, ou todos se a administração liberar) cadastra, edita, remove e vê as URLs reais. Para os
    // outros, a aba Automações da administração diz se o endereço aparece mascarado ou some e se há "Abrir em nova aba".
    const ehAdmin = (window.useEhAdmin || (() => false))();
    const [cfgAuto, setCfgAuto] = useState({ cadastro: 'admins', endereco: 'mascarado', novaAba: true });
    useEffect(() => {
      api('/api/config-publica').then((c) => c && c.automacoes && setCfgAuto(c.automacoes)).catch(() => { /* sem config: valem os padrões */ });
      const aoMudar = (ev) => setCfgAuto(ev.detail);
      window.addEventListener('arx-config-automacoes', aoMudar); // admin.js avisa quando a aba Automações salva
      return () => window.removeEventListener('arx-config-automacoes', aoMudar);
    }, []);
    const podeGerenciar = ehAdmin || cfgAuto.cadastro === 'todos';
    const [urlsReais, setUrlsReais] = useState({});
    useEffect(() => {
      if (!podeGerenciar) return setUrlsReais({});
      api('/api/admin/automations/urls').then(setUrlsReais).catch(() => setUrlsReais({}));
    }, [podeGerenciar, automations.length]);
    const urlReal = (a) => urlsReais[a.id] || '';
    const urlVisivel = (a) => (podeGerenciar && urlReal(a) ? urlReal(a).replace(/^https?:\/\//, '') : cfgAuto.endereco === 'oculto' ? '' : a.endereco);
    const urlProxy = (a) => `${location.protocol}//${location.hostname}:${PORTA_PROXY}/a/${a.id}/`;
    const podeNovaAba = podeGerenciar || cfgAuto.novaAba;
    // Passe de cada tela aberta (passe.js): o proxy exige nas automações restritas por grupo e anota quem abriu.
    // '' = não deu para pegar (sem token): a tela abre sem passe e só funciona se a automação for de todo mundo.
    const [passes, setPasses] = useState({});
    const pedirPasse = (id) => api('/api/automations/' + id + '/passe', { method: 'POST' }).then((r) => r.passe).catch(() => '');
    // v3: as automações ganham a tela nova (o proxy injeta o estilo com ?v2=1); icone e cor são os do cadastro no Hub,
    // para o título da automação ficar igual ao cartão
    const comPasse = (a, passe) => urlProxy(a) + '?v2=1&icone=' + encodeURIComponent(a.icon || '') + '&cor=' + encodeURIComponent(a.color || '') +
      (passe ? '&passe=' + encodeURIComponent(passe) : '');
    function abrirEmNovaAba(a) {
      const janela = window.open('', '_blank'); // abre já, no clique; depois do await o navegador bloquearia
      pedirPasse(a.id).then((passe) => { if (janela) janela.location = comPasse(a, passe); });
    }
    const [toasts, setToasts] = useState([]);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [viewerMenuOpen, setViewerMenuOpen] = useState(false);
    // Faixa de abas: quando não cabem, as abas encolhem, a faixa rola (sem
    // barra visível, com esmaecido nas bordas) e aparece o menu "N abas".
    const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
    const [tabsOverflow, setTabsOverflow] = useState({ any: false, left: false, right: false });
    const navRef = useRef(null);
    const tabsMenuRef = useRef(null);
    // "Painel" fica fixo no início; quando as abas começam a não caber ele
    // mostra só o ícone. Guarda com quantas abas isso aconteceu e só volta a
    // mostrar o nome quando uma aba é fechada (evita ficar piscando).
    const [panelCompactAt, setPanelCompactAt] = useState(null);
    // Abas fixas ao lado do Painel: "Chamados" (chamados.js) e "Resultados"
    // (resultados.js). Cada uma só monta na primeira vez que é aberta.
    const [abaFixa, setAbaFixa] = useState('painel');
    const [abasMontadas, setAbasMontadas] = useState({});
    const abrirAbaFixa = (qual) => { setActiveTabId(null); setAbaFixa(qual); setAbasMontadas((m) => (m[qual] ? m : Object.assign({}, m, { [qual]: true }))); };
    const abrirPainel = () => abrirAbaFixa('painel');
    const abrirChamados = () => abrirAbaFixa('chamados');
    const abaFixaAtiva = (qual) => activeTabId === null && abaFixa === qual;

    // ---- GLPI quick-ticket widget ----
    const [glpiOpen, setGlpiOpen] = useState(false);
    const [glpiToken, setGlpiToken] = useState(null);
    const [glpiTokenDraft, setGlpiTokenDraft] = useState('');
    const [glpiLookup, setGlpiLookup] = useState(null);
    const [glpiLookupLoading, setGlpiLookupLoading] = useState(false);
    const [glpiLookupError, setGlpiLookupError] = useState(null);
    const [glpiForm, setGlpiForm] = useState({ categoriaId: '', requerenteId: '', atribuidoId: '', titulo: '', descricao: '' });
    const [glpiAnexos, setGlpiAnexos] = useState([]); // v3: fotos e documentos do chamado ({ nome, tipo, tamanho, base64 })
    const [glpiArrastando, setGlpiArrastando] = useState(false);
    const [glpiSubmitting, setGlpiSubmitting] = useState(false);
    const [glpiReqSearch, setGlpiReqSearch] = useState('');
    const [glpiReqOpen, setGlpiReqOpen] = useState(false);
    const [glpiAssignSearch, setGlpiAssignSearch] = useState('');
    const [glpiAssignOpen, setGlpiAssignOpen] = useState(false);
    const [glpiView, setGlpiView] = useState('form');
    const [glpiHistory, setGlpiHistory] = useState([]);
    const [glpiHistoryLoading, setGlpiHistoryLoading] = useState(false);
    const [glpiHistoryError, setGlpiHistoryError] = useState(null);
    const glpiPanelRef = useRef(null);
    const glpiFabRef = useRef(null);

    const searchRef = useRef(null);
    const viewerRef = useRef(null);
    const viewerTimers = useRef({});
    const viewerNonce = useRef({});

    const pushToast = useCallback((type, message, link) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, type, message, link }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), link ? 8000 : 3500);
    }, []);

    const refresh = useCallback(async () => {
      try {
        const data = await api('/api/automations');
        setAutomations(data);
        setAutomationsLoaded(true);
        setLastRefresh(new Date());
      } catch (err) {
        // silent: network hiccup, next poll will retry
      }
    }, []);

    useEffect(() => {
      refresh();
      let es = null;
      // o SSE só avisa que mudou: a lista vem de /api/automations com o token (cada um vê os seus grupos).
      // Aba escondida solta a conexão: o navegador abre no máximo 6 por endereço e cada aba do Hub segura as suas;
      // com várias abas abertas, as outras páginas do Hub deixavam de carregar.
      const abrir = () => {
        if (es || document.hidden) return;
        try {
          es = new EventSource('/api/events');
          es.onmessage = () => refresh();
        } catch (err) { es = null; }
      };
      const fechar = () => { if (es) { es.close(); es = null; } };
      const aoMudarVisibilidade = () => {
        if (document.hidden) return fechar();
        abrir();
        refresh(); // os avisos de enquanto estava escondida se perderam
      };
      abrir();
      document.addEventListener('visibilitychange', aoMudarVisibilidade);
      // Safety-net poll in case the SSE connection is ever blocked (e.g. a proxy buffering it).
      const t = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
      return () => {
        clearInterval(t);
        document.removeEventListener('visibilitychange', aoMudarVisibilidade);
        fechar();
      };
    }, [refresh]);

    // Opção escondida de tema escuro: Ctrl+Alt+D ou duplo clique no título
    // "Automações". O index.html repassa o tema para as automações abertas
    // nas abas (iframes) quando data-theme muda.
    const toggleTheme = useCallback(() => {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-anim');
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('arx-tema', next); } catch (err) { /* sem armazenamento: o tema vale só nesta aba */ }
      setTimeout(() => root.classList.remove('theme-anim'), 450);
      pushToast('info', next === 'dark' ? 'Modo escuro ativado.' : 'Modo claro ativado.');
    }, [pushToast]);

    useEffect(() => {
      const onKeydown = (ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (mod && ev.altKey && ev.key.toLowerCase() === 'd') {
          ev.preventDefault();
          toggleTheme();
          return;
        }
        if (mod && ev.key.toLowerCase() === 'k') {
          ev.preventDefault();
          if (searchRef.current) searchRef.current.focus();
          return;
        }
        if (ev.key === 'Escape') {
          setGlpiOpen((aberto) => {
            if (aberto) setTimeout(() => glpiFabRef.current && glpiFabRef.current.focus());
            return false;
          });
          setTabsMenuOpen(false);
          setConfirmDialog(null);
          setModalOpen((open) => {
            if (open) return false;
            return open;
          });
          setMenuOpenId((id) => (id ? null : id));
          setViewerMenuOpen(false);
        }
      };
      window.addEventListener('keydown', onKeydown);
      return () => window.removeEventListener('keydown', onKeydown);
    }, [toggleTheme]);

    useEffect(() => {
      const setas = (ev) => {
        const aba = ev.target && ev.target.closest && ev.target.closest('[role="tab"]');
        const lista = aba && aba.closest('[role="tablist"]');
        if (!lista) return;
        const abas = Array.from(lista.querySelectorAll('[role="tab"]')).filter((x) => !x.disabled);
        const i = abas.indexOf(aba);
        const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[ev.key];
        if (destino === undefined || i < 0) return;
        ev.preventDefault();
        const alvo = abas[(destino + abas.length) % abas.length];
        alvo.focus();
        alvo.click();
      };
      document.addEventListener('keydown', setas);
      return () => document.removeEventListener('keydown', setas);
    }, []);

    // ---- faixa de abas: mede se transborda (pra esmaecer bordas / mostrar o menu) ----
    const measureTabs = useCallback(() => {
      const el = navRef.current;
      if (!el) return;
      const any = el.scrollWidth > el.clientWidth + 1;
      const left = any && el.scrollLeft > 2;
      const right = any && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setTabsOverflow((o) => (o.any === any && o.left === left && o.right === right ? o : { any, left, right }));
    }, []);

    useEffect(() => {
      window.addEventListener('resize', measureTabs);
      return () => window.removeEventListener('resize', measureTabs);
    }, [measureTabs]);

    // Ao abrir/trocar de aba, rola a faixa até a aba ativa (nunca fica escondida).
    useEffect(() => {
      const el = navRef.current;
      if (!el) return;
      const active = el.querySelector('[data-active="1"]');
      if (active) {
        const left = active.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
        const right = left + active.offsetWidth;
        if (left < el.scrollLeft) el.scrollTo({ left: left - 24, behavior: 'smooth' });
        else if (right > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right - el.clientWidth + 24, behavior: 'smooth' });
      }
      measureTabs();
    }, [openTabs, activeTabId, automations, measureTabs, tabsOverflow.any, panelCompactAt]);

    useEffect(() => {
      if (tabsOverflow.any && panelCompactAt === null) setPanelCompactAt(openTabs.length);
      else if (panelCompactAt !== null && openTabs.length < panelCompactAt) setPanelCompactAt(null);
    }, [tabsOverflow.any, openTabs.length, panelCompactAt]);

    // Fecha o menu de abas ao clicar fora dele.
    useEffect(() => {
      if (!tabsMenuOpen) return undefined;
      const onDown = (ev) => {
        if (tabsMenuRef.current && !tabsMenuRef.current.contains(ev.target)) setTabsMenuOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [tabsMenuOpen]);

    // o token do GLPI fica no cofre dos acessos (cifrado); aqui só se lê e se atualiza quando o cofre destrava ou muda
    useEffect(() => {
      const hub = window.ArxAcessosHub;
      if (!hub) return undefined;
      const token = (hub.ler() || {}).userToken;
      if (token) setGlpiToken(token);
      return hub.aoMudar((a) => setGlpiToken(a.userToken || null));
    }, []);
    // token novo (cofre destravou, trocou de pessoa): as automações visíveis dependem dos grupos dela
    useEffect(() => { refresh(); }, [glpiToken, refresh]);

    useEffect(() => {
      if (!glpiOpen) return;
      const onDocMouseDown = (ev) => {
        const panel = glpiPanelRef.current;
        const fab = glpiFabRef.current;
        if (panel && panel.contains(ev.target)) return;
        if (fab && fab.contains(ev.target)) return;
        setGlpiOpen(false);
      };
      document.addEventListener('mousedown', onDocMouseDown);
      return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [glpiOpen]);

    const loadGlpiLookup = useCallback(async (token) => {
      setGlpiLookupLoading(true);
      setGlpiLookupError(null);
      try {
        const data = await api('/api/glpi/lookup', { method: 'POST', body: JSON.stringify({ userToken: token }) });
        setGlpiLookup(data);
      } catch (err) {
        setGlpiLookupError(err.message);
      } finally {
        setGlpiLookupLoading(false);
      }
    }, []);

    function openGlpiWidget() {
      setGlpiOpen(true);
      if (glpiToken && !glpiLookup && !glpiLookupLoading) loadGlpiLookup(glpiToken);
      setTimeout(() => {
        const alvo = document.querySelector('.v3-glpi .exu-modal-corpo input, .v3-glpi .exu-modal-corpo select, .v3-glpi .exu-modal-corpo textarea, .v3-glpi input, .v3-glpi select, .v3-glpi textarea') || document.querySelector('.v3-glpi button');
        if (alvo) alvo.focus();
      }, 60);
    }

    function closeGlpiWidget() {
      setGlpiOpen(false);
      setGlpiView('form');
    }

    function toggleGlpiWidget() {
      if (glpiOpen) closeGlpiWidget();
      else openGlpiWidget();
    }

    async function loadGlpiHistory() {
      setGlpiHistoryLoading(true);
      setGlpiHistoryError(null);
      try {
        const data = await api('/api/glpi/history');
        setGlpiHistory(data);
      } catch (err) {
        setGlpiHistoryError(err.message);
      } finally {
        setGlpiHistoryLoading(false);
      }
    }

    function openGlpiHistory() {
      setGlpiView('history');
      loadGlpiHistory();
    }

    function backToGlpiForm() {
      setGlpiView('form');
    }

    function saveGlpiToken() {
      const value = glpiTokenDraft.trim();
      if (!value) return;
      if (window.ArxAcessosHub) window.ArxAcessosHub.definirToken(value); // vai para o cofre (cifrado)
      setGlpiToken(value);
      setGlpiTokenDraft('');
      loadGlpiLookup(value);
    }

    function forgetGlpiToken() {
      if (window.ArxAcessosHub) window.ArxAcessosHub.definirToken('');
      setGlpiToken(null);
      setGlpiLookup(null);
      setGlpiLookupError(null);
    }

    function setGlpiField(field, value) {
      setGlpiForm((f) => ({ ...f, [field]: value }));
    }

    async function submitGlpiTicket() {
      if (!glpiForm.titulo.trim()) {
        pushToast('error', 'Preencha o título do chamado.');
        return;
      }
      setGlpiSubmitting(true);
      try {
        const users = glpiLookup ? glpiLookup.users : [];
        const categoria = glpiLookup ? glpiLookup.categories.find((c) => String(c.id) === String(glpiForm.categoriaId)) : null;
        const requerente = users.find((u) => String(u.id) === String(glpiForm.requerenteId));
        const atribuido = users.find((u) => String(u.id) === String(glpiForm.atribuidoId));
        const result = await api('/api/glpi/ticket', {
          method: 'POST',
          body: JSON.stringify({
            userToken: glpiToken, ...glpiForm,
            categoriaLabel: categoria ? categoria.label : null,
            requerenteLabel: requerente ? requerente.label : null,
            atribuidoLabel: atribuido ? atribuido.label : null,
          }),
        });
        pushToast('success', 'Chamado aberto no GLPI:', result.url ? { label: '#' + result.id, url: result.url } : null);
        setGlpiForm({ categoriaId: '', requerenteId: '', atribuidoId: '', titulo: '', descricao: '' });
        setGlpiOpen(false);
      } catch (err) {
        pushToast('error', 'Não foi possível abrir o chamado: ' + err.message);
      } finally {
        setGlpiSubmitting(false);
      }
    }

    function clearViewerTimer(id) {
      if (viewerTimers.current[id]) {
        clearTimeout(viewerTimers.current[id]);
        delete viewerTimers.current[id];
      }
    }

    function startViewerLoad(id) {
      clearViewerTimer(id);
      // Setting the same src again is a no-op for the browser (no navigation, no load event),
      // so force a real reload by remounting the iframe with a fresh key.
      viewerNonce.current[id] = (viewerNonce.current[id] || 0) + 1;
      setViewerLoad((v) => ({ ...v, [id]: 'loading' }));
      // passe novo a cada carga; o iframe só monta quando ele chega (ou falha)
      setPasses((p) => { const n = { ...p }; delete n[id]; return n; });
      pedirPasse(id).then((passe) => setPasses((p) => ({ ...p, [id]: passe })));
      viewerTimers.current[id] = setTimeout(() => {
        setViewerLoad((v) => (v[id] === 'loading' ? { ...v, [id]: 'error' } : v));
      }, 8000);
    }

    function onIframeLoad(id) {
      clearViewerTimer(id);
      setViewerLoad((v) => ({ ...v, [id]: 'loaded' }));
    }

    function openAutomation(id) {
      setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]));
      setActiveTabId(id);
      setMenuOpenId(null);
      setViewerMenuOpen(false);
      if (!viewerLoad[id]) startViewerLoad(id);
    }

    function switchTab(id) {
      if (id === activeTabId) return;
      setActiveTabId(id);
      setViewerMenuOpen(false);
      // Every open tab's iframe stays mounted (just hidden) while you're on
      // another one, so switching back only needs a fresh load the first time.
      if (!viewerLoad[id]) startViewerLoad(id);
    }

    function closeTab(id) {
      clearViewerTimer(id);
      delete viewerNonce.current[id];
      setViewerLoad((v) => {
        const next = { ...v };
        delete next[id];
        return next;
      });
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== id);
        setActiveTabId((cur) => (cur === id ? (next.length ? next[next.length - 1] : null) : cur));
        return next;
      });
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        if (viewerRef.current && viewerRef.current.requestFullscreen) viewerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }

    function deleteAutomation(id) {
      const a = automations.find((x) => x.id === id);
      setMenuOpenId(null);
      setConfirmDialog({
        title: 'Remover automação',
        message: 'Remover ' + (a ? 'a automação "' + a.name + '"' : 'esta automação') + '? A ação não pode ser desfeita.',
        confirmLabel: 'Remover',
        danger: true,
        onConfirm: async () => {
          setConfirmDialog(null);
          try {
            await api('/api/automations/' + id, { method: 'DELETE' });
            setAutomations((list) => list.filter((x) => x.id !== id));
            setOpenTabs((tabs) => tabs.filter((t) => t !== id));
            setActiveTabId((cur) => (cur === id ? null : cur));
            pushToast('info', 'Automação removida.');
          } catch (err) {
            pushToast('error', 'Não foi possível remover: ' + err.message);
          }
        },
      });
    }

    function copyUrl(url) {
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      pushToast('success', 'URL copiada.');
      setMenuOpenId(null);
    }

    function openNewModal() {
      setModalMode('new');
      setModalForm({ name: '', url: '', container: '', icon: 'Workflow', color: '#1E4A9E', categories: [], description: '' });
      setTestState('idle');
      setModalOpen(true);
    }

    function openEditModal(a) {
      setModalMode('edit');
      setModalForm({ ...a, categories: Array.isArray(a.categories) ? a.categories : [] });
      setTestState('idle');
      setMenuOpenId(null);
      setModalOpen(true);
    }

    // A aba Automações da administração (admin.js) usa este mesmo formulário e a mesma confirmação de remoção.
    useEffect(() => {
      window.ArxHubAutomacoes = {
        nova: openNewModal,
        editar: (id) => {
          const a = automations.find((x) => String(x.id) === String(id));
          if (a) openEditModal({ ...a, url: urlReal(a) });
        },
        remover: deleteAutomation,
      };
    });
    useEffect(() => {
      window.dispatchEvent(new CustomEvent('arx-automacoes', { detail: automations }));
    }, [automations]);

    function closeModal() {
      setModalOpen(false);
    }

    function setModalField(field, value) {
      setModalForm((f) => ({ ...f, [field]: value }));
    }

    async function testConnection() {
      if (!modalForm || !modalForm.url.trim()) {
        pushToast('error', 'Preencha a URL antes de testar.');
        return;
      }
      setTestState('testing');
      try {
        const result = await api('/api/test-connection', {
          method: 'POST',
          body: JSON.stringify({ url: modalForm.url.trim() }),
        });
        setTestState(result.status);
      } catch (err) {
        setTestState('offline');
      }
    }

    async function saveAutomation() {
      const f = modalForm;
      if (!f.name.trim() || !f.url.trim()) {
        pushToast('error', 'Preencha nome e URL antes de salvar.');
        return;
      }
      const payload = {
        name: f.name.trim(),
        url: f.url.trim(),
        container: f.container || '',
        description: f.description || '',
        icon: f.icon || 'Workflow',
        color: f.color || '#1E4A9E',
        categories: Array.isArray(f.categories) ? f.categories : [],
        vncPorta: f.vncPorta == null ? '' : String(f.vncPorta).trim(),
        minutosPorItem: f.minutosPorItem == null ? '' : String(f.minutosPorItem).trim(),
      };
      try {
        if (f.id) {
          const updated = await api('/api/automations/' + f.id, { method: 'PUT', body: JSON.stringify(payload) });
          setAutomations((list) => list.map((a) => (a.id === updated.id ? updated : a)));
          pushToast('success', 'Automação atualizada.');
        } else {
          const created = await api('/api/automations', { method: 'POST', body: JSON.stringify(payload) });
          setAutomations((list) => [...list, created]);
          pushToast('success', 'Automação salva.');
        }
        setModalOpen(false);
        setTimeout(refresh, 1500);
      } catch (err) {
        pushToast('error', 'Não foi possível salvar: ' + err.message);
      }
    }

    // ---- derived render data ----
    const q = search.trim().toLowerCase();
    const visible = automations.filter((a) => !q || a.name.toLowerCase().includes(q));
    const total = automations.length;
    const online = automations.filter((a) => a.status === 'online').length;
    const offline = automations.filter((a) => a.status === 'offline').length;
    const healthDotColor = offline > 0 ? 'var(--warn)' : 'var(--accent)';

    function closeMenus() {
      setMenuOpenId((id) => (id ? null : id));
      setViewerMenuOpen(false);
      setTabsMenuOpen(false);
    }

    function closeAllTabs() {
      openTabs.forEach((id) => closeTab(id));
      setActiveTabId(null);
      setTabsMenuOpen(false);
    }

    function selectTabFromMenu(id) {
      if (id === null) abrirPainel();
      else switchTab(id);
      setTabsMenuOpen(false);
    }

    // ---- single unified nav bar (logo + panel/tabs + search + health + add) ----
    const openTabItems = openTabs.map((id) => automations.find((x) => x.id === id)).filter(Boolean);
    const panelCompact = panelCompactAt !== null;
    const navScroll = e('div', {
      key: 'nav', ref: navRef,
      className: 'nav-scroll' + (tabsOverflow.left ? ' fade-left' : '') + (tabsOverflow.right ? ' fade-right' : ''),
      onScroll: measureTabs,
      // roda do mouse rola a faixa na horizontal
      onWheel: (ev) => { if (tabsOverflow.any && ev.deltaY) navRef.current.scrollLeft += ev.deltaY; },
      style: sx('display:flex;align-items:stretch;gap:2px;overflow-x:auto;min-width:0;flex:0 1 auto'),
    }, [
      ...openTabItems.map((a) => {
        const id = a.id;
        const active = activeTabId === id;
        return e('div', {
          key: id, className: 'tab-item' + (active ? ' active' : ''), title: a.name, 'data-active': active ? '1' : '0',
          onClick: () => switchTab(id),
          // botão do meio do mouse fecha a aba, como no navegador
          onAuxClick: (ev) => { if (ev.button === 1) { ev.preventDefault(); closeTab(id); } },
          style: sx('display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border-bottom:2px solid ' + (active ? 'var(--accent)' : 'transparent') + ';color:' + (active ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;cursor:pointer;white-space:nowrap;flex:0 1 auto;max-width:240px;min-width:' + (active ? 190 : 150) + 'px'),
        }, [
          e('span', { key: 'dot', style: { width: 6, height: 6, borderRadius: '50%', background: STATUS_META[a.status].color, flexShrink: 0 } }),
          Icon(a.icon, 13, a.color),
          e('span', { key: 'name', style: sx('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap') }, a.name),
          e('span', {
            key: 'close', className: 'tab-close', title: 'Fechar aba', onClick: (ev) => { ev.stopPropagation(); closeTab(id); },
            style: sx('display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;color:var(--muted-soft);flex-shrink:0'),
          }, Icon('X', 13)),
        ]);
      }),
    ]);

    // Menu "N abas": lista todas as abas abertas (útil quando não cabem na faixa).
    const tabsMenu = (tabsOverflow.any || tabsMenuOpen) && openTabItems.length ? e('div', { key: 'tabs-menu', ref: tabsMenuRef, style: { position: 'relative', flexShrink: 0 } }, [
      e('button', {
        key: 'btn', className: 'tabs-overflow-btn' + (tabsMenuOpen ? ' open' : ''), title: 'Todas as abas abertas',
        onClick: () => setTabsMenuOpen((v) => !v),
      }, [
        e('span', { key: 'n', className: 'tabs-count' }, String(openTabItems.length)),
        e('span', { key: 't' }, 'abas'),
        e('span', { key: 'c', className: 'tabs-chevron' }, Icon('ChevronDown', 14, 'currentColor')),
      ]),
      tabsMenuOpen ? e('div', { key: 'menu', className: 'tabs-menu' }, [
        e('div', { key: 'head', className: 'tabs-menu-head' }, [
          e('span', { key: 't' }, 'Abas abertas (' + openTabItems.length + ')'),
          e('button', { key: 'all', className: 'tabs-menu-closeall', onClick: closeAllTabs }, 'Fechar todas'),
        ]),
        e('div', { key: 'list', className: 'tabs-menu-list' }, [
          e('div', {
            key: 'panel', className: 'tabs-menu-item' + (activeTabId === null ? ' active' : ''), onClick: () => selectTabFromMenu(null),
          }, [
            e('span', { key: 'i', className: 'tabs-menu-icon' }, Icon('LayoutDashboard', 14, 'var(--muted)')),
            e('span', { key: 'n', className: 'tabs-menu-name' }, 'Painel'),
          ]),
          ...openTabItems.map((a, i) => e('div', {
            key: a.id, className: 'tabs-menu-item' + (activeTabId === a.id ? ' active' : ''), onClick: () => selectTabFromMenu(a.id),
            style: { animationDelay: Math.min(i, 10) * 20 + 'ms' },
          }, [
            e('span', { key: 'i', className: 'tabs-menu-icon', style: { background: a.color + '22' } }, Icon(a.icon, 14, a.color)),
            e('span', { key: 'n', className: 'tabs-menu-name' }, a.name),
            e('span', { key: 'd', className: 'tabs-menu-dot', title: STATUS_META[a.status].label, style: { background: STATUS_META[a.status].color } }),
            e('button', {
              key: 'x', className: 'tab-close', title: 'Fechar aba',
              onClick: (ev) => { ev.stopPropagation(); closeTab(a.id); },
              style: sx('display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;background:transparent;border-radius:6px;color:var(--muted-soft);cursor:pointer;flex-shrink:0'),
            }, Icon('X', 13)),
          ])),
        ]),
      ]) : null,
    ]) : null;

    const header = e('div', { className: 'hub-header', style: sx('display:flex;align-items:center;gap:14px;padding:0 20px;height:56px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border);z-index:10;position:relative') }, [
      e('div', { key: 'left', className: 'hub-header-left', style: sx('display:flex;align-items:stretch;gap:2px;min-width:0;flex:0 1 auto;overflow:hidden') }, [
        e('button', {
          key: 'panel', className: 'panel-tab' + (abaFixaAtiva('painel') ? ' ativa' : '') + (panelCompact ? ' compact' : ''), onClick: abrirPainel,
          title: 'Painel', 'aria-label': 'Painel',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('painel') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('painel') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('LayoutDashboard', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Painel')]),
        e('button', {
          key: 'chamados', className: 'panel-tab' + (abaFixaAtiva('chamados') ? ' ativa' : '') + (panelCompact ? ' compact' : ''), onClick: abrirChamados,
          title: 'Chamados do GLPI', 'aria-label': 'Chamados',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('chamados') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('chamados') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('Headset', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Chamados')]),
        e('button', {
          key: 'resultados', className: 'panel-tab' + (abaFixaAtiva('resultados') ? ' ativa' : '') + (panelCompact ? ' compact' : ''), onClick: () => abrirAbaFixa('resultados'),
          title: 'Resultados das automações', 'aria-label': 'Resultados',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('resultados') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('resultados') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('BarChart3', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Resultados')]),
        // admin.js: aba "Administração", só aparece para quem é administrador (identificado pelo token do GLPI)
        window.AdminAba ? e(window.AdminAba, { key: 'admin', ativa: abaFixaAtiva('admin'), aoAbrir: () => abrirAbaFixa('admin'), compacto: panelCompact }) : null,
        openTabItems.length ? e('span', { key: 'sep', className: 'tabs-sep' }) : null,
        navScroll,
      ]),
      tabsMenu,
      e('div', { key: 'spacer', className: 'hub-header-spacer', style: { flex: 1, minWidth: 20 } }),
      e('div', { key: 'right', className: 'hub-header-right', style: sx('display:flex;align-items:center;gap:16px;flex-shrink:0') }, [
        e('div', { key: 'search', className: 'search-box hub-search', style: sx('display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 12px;flex-shrink:0;width:220px') }, [
          Icon('Search', 15, 'var(--muted-soft)'),
          e('input', {
            key: 'input', ref: searchRef, value: search, onChange: (ev) => setSearch(ev.target.value),
            placeholder: 'Buscar…', 'aria-label': 'Buscar automações', type: 'search',
            style: sx('flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text);font-size:13.5px'),
          }),
          e('span', { key: 'kbd', style: sx("font-family:'JetBrains Mono',monospace;font-size:10.5px;background:var(--secondary);border:1px solid var(--border);border-radius:5px;padding:2px 5px;color:var(--muted-soft);flex-shrink:0") }, 'Ctrl K'),
        ]),
        // ajuda.js (?), alertas.js (sino) e acessos.js (Meus acessos): componentes próprios
        window.AjudaBotao ? e(window.AjudaBotao, { key: 'ajuda', aba: activeTabId === null ? abaFixa : null }) : null,
        window.AlertasSino ? e(window.AlertasSino, { key: 'alertas' }) : null,
        window.MeusAcessosBotao ? e(window.MeusAcessosBotao, { key: 'acessos' }) : null,
        e('div', { key: 'health', style: sx('display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12.5px;flex-shrink:0') }, [
          e('span', { key: 'dot', className: 'pulse-dot', style: { position: 'relative', width: 7, height: 7, borderRadius: '50%', background: healthDotColor, color: healthDotColor } }),
          e('span', { key: 'label' }, online + '/' + total + ' online'),
        ]),
        podeGerenciar && e('button', {
          key: 'new', className: 'btn-primary', onClick: openNewModal, title: 'Nova automação',
          style: sx('display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;flex-shrink:0'),
        }, [Icon('Plus', 16, 'var(--primary-fg)', 2.25), e('span', { key: 't' }, 'Nova automação')]),
      ]),
    ]);

    // ---- automation card ----
    function buildCard(a, i) {
      const meta = STATUS_META[a.status] || STATUS_META.checking;
      const isPulsing = a.status !== 'offline';
      const menuOpen = menuOpenId === a.id;
      const urlShort = urlVisivel(a);
      const cats = (a.categories || []).map((k) => CATEGORY_META[k]).filter(Boolean);
      return e('div', {
        key: a.id, className: 'card', onClick: () => openAutomation(a.id),
        style: { position: 'relative', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeInUp 0.3s ease both', animationDelay: Math.min(i, 10) * 35 + 'ms' },
      }, [
        e('div', { key: 'top', style: sx('display:flex;align-items:flex-start;justify-content:space-between') }, [
          e('div', { key: 'icon', style: { width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color + '22', color: a.color } }, Icon(a.icon, 19, a.color)),
          e('div', { key: 'actions', style: sx('display:flex;align-items:center;gap:2px') }, [
            e('span', { key: 'dot', className: isPulsing ? 'pulse-dot' : '', style: { position: 'relative', width: 8, height: 8, borderRadius: '50%', background: meta.color, color: meta.color, marginTop: 6, marginRight: 4 } }),
            // o menu só tem ações de admin (editar, abrir/copiar o endereço, remover)
            podeGerenciar && e('button', {
              key: 'menu', className: 'icon-btn', onClick: (ev) => { ev.stopPropagation(); setMenuOpenId(menuOpen ? null : a.id); },
              style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);border-radius:6px;cursor:pointer'),
            }, Icon('MoreHorizontal', 17)),
          ]),
        ]),
        e('div', { key: 'info' }, [
          cats.length ? e('div', { key: 'cats', style: sx('display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px') }, cats.map((c) => e('span', {
            key: c.key,
            style: sx('display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:10.5px;font-weight:600;background:' + c.color + '22;color:color-mix(in srgb, ' + c.color + ' var(--chip-mix), var(--text))'),
          }, c.label))) : null,
          e('div', { key: 'name', style: sx("font-weight:600;font-size:14px") }, a.name),
          e('div', { key: 'desc', style: sx('color:var(--muted);font-size:12.5px;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden') }, a.description),
        ]),
        urlShort ? e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--muted-soft)") }, urlShort) : null,
        e('button', {
          key: 'open', className: 'card-open-btn', onClick: (ev) => { ev.stopPropagation(); openAutomation(a.id); },
          style: sx('padding:8px;background:var(--secondary);border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer;margin-top:2px'),
        }, 'Abrir'),
        (podeGerenciar && menuOpen) ? e('div', {
          key: 'popover', onClick: (ev) => ev.stopPropagation(),
          style: sx('position:absolute;top:44px;right:10px;background:var(--popover);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.12);z-index:5;overflow:hidden;min-width:170px'),
        }, [
          e('button', { key: 'edit', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); openEditModal({ ...a, url: urlReal(a) }); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Pencil', 14), ' Editar']),
          e('button', { key: 'newtab', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); abrirEmNovaAba(a); setMenuOpenId(null); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          e('button', { key: 'copy', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); copyUrl(urlReal(a)); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Copy', 14), ' Copiar URL']),
          e('div', { key: 'sep', style: { height: 1, background: 'var(--border)' } }),
          e('button', { key: 'del', className: 'menu-item-danger', onClick: (ev) => { ev.stopPropagation(); deleteAutomation(a.id); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--error);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Trash2', 14), ' Remover']),
        ]) : null,
      ]);
    }

    // Automações de banco de dados (categoria "db") ficam numa seção própria, abaixo das demais.
    const isDb = (a) => (a.categories || []).includes('db');
    const mainList = visible.filter((a) => !isDb(a));
    const dbList = visible.filter(isDb);
    // ---- automação em lista (Painel > Lista): uma linha por automação, abre com clique, Enter ou espaço ----
    function buildLinha(a) {
      const meta = STATUS_META[a.status] || STATUS_META.checking;
      const cats = (a.categories || []).map((k) => CATEGORY_META[k]).filter(Boolean);
      return e('div', {
        key: a.id, className: 'v2-linha', role: 'button', tabIndex: 0, 'aria-label': 'Abrir ' + a.name,
        onClick: () => openAutomation(a.id),
        onKeyDown: (ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openAutomation(a.id); } },
      }, [
        e('span', { key: 'i', className: 'v2-linha-ic', style: { background: a.color + '22' } }, Icon(a.icon, 17, a.color)),
        e('div', { key: 'n', className: 'v2-linha-nome' }, [e('b', { key: 'b' }, a.name), e('small', { key: 's' }, a.description || 'Sem descrição')]),
        e('div', { key: 'c', className: 'v2-linha-cats' }, cats.map((c) => e('span', {
          key: c.key, style: { background: c.color + '22', color: 'color-mix(in srgb, ' + c.color + ' var(--chip-mix), var(--text))' },
        }, c.label))),
        e('span', { key: 's', className: 'v2-status ' + (STATUS_META[a.status] ? a.status : 'checking') }, [e('i', { key: 'i', 'aria-hidden': true }), meta.label]),
        podeGerenciar ? e('button', {
          key: 'e', type: 'button', className: 'icon-btn v2-linha-editar', title: 'Editar', 'aria-label': 'Editar ' + a.name,
          onClick: (ev) => { ev.stopPropagation(); openEditModal({ ...a, url: urlReal(a) }); },
        }, Icon('Pencil', 14)) : null,
      ]);
    }
    const cardGrid = (key, list) => (visaoPainel === 'lista'
      ? e('div', { key, className: 'v2-lista' }, list.map(buildLinha))
      : e('div', { key, style: sx('display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px') }, list.map(buildCard)));
    const dbSection = dbList.length ? e('section', { key: 'db', className: 'db-section' }, [
      e('div', { key: 'head', className: 'db-section-head' }, [
        e('div', { key: 'icon', className: 'db-section-icon' }, Icon('Database', 18, 'var(--db-color)')),
        e('div', { key: 'txt', style: { minWidth: 0 } }, [
          e('div', { key: 't', style: sx('font-weight:600;font-size:15px;letter-spacing:-0.01em') }, 'Banco de Dados'),
          e('div', { key: 's', style: sx('font-size:12.5px;color:var(--muted);margin-top:2px') }, 'Rotinas que alimentam e mantêm o banco-central.'),
        ]),
        e('span', { key: 'count', className: 'db-section-count' }, dbList.length + (dbList.length === 1 ? ' automação' : ' automações')),
      ]),
      cardGrid('grid', dbList),
    ]) : null;

    const panelBody = e('div', { style: sx('padding:28px 24px 96px;max-width:1200px;margin:0 auto') }, [
      e('div', { key: 'head', style: sx('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px') }, [
        e('div', { key: 't', onDoubleClick: toggleTheme, style: sx('font-weight:600;font-size:19px;user-select:none') }, 'Automações'),
        e('div', { key: 's', style: sx('display:flex;align-items:center;gap:12px;flex-wrap:wrap') }, [
          e('span', { key: 't', style: { color: 'var(--muted-soft)', fontSize: 12.5 } }, total + ' automações · ' + online + ' online · ' + offline + ' offline'),
          e('div', { key: 'v', className: 'exu-seg', role: 'group', 'aria-label': 'Exibição das automações' }, [
            e('button', { key: 'g', type: 'button', 'aria-pressed': visaoPainel === 'lista' ? 'false' : 'true', onClick: () => trocarVisao('grade') }, [Icon('LayoutDashboard', 13, 'currentColor'), ' Cartões']),
            e('button', { key: 'l', type: 'button', 'aria-pressed': visaoPainel === 'lista' ? 'true' : 'false', onClick: () => trocarVisao('lista') }, [Icon('FileText', 13, 'currentColor'), ' Lista']),
          ]),
        ]),
      ]),
      !automationsLoaded
        ? e('div', { key: 'loading', style: sx('display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:60px 20px;color:var(--muted-soft)') }, [
            e('div', { key: 'spin', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 26, 'var(--accent)')),
            e('div', { key: 't', style: { fontSize: 13.5 } }, 'Carregando automações…'),
          ])
        : visible.length > 0
        ? e('div', { key: 'groups' }, [mainList.length ? cardGrid('main', mainList) : null, dbSection])
        : e('div', { key: 'empty', style: sx('display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--muted-soft);text-align:center') }, [
            Icon('Inbox', 34, 'var(--muted-soft)', 1.3),
            e('div', { key: 't', style: { fontSize: 14 } }, q ? 'Nenhuma automação encontrada' : 'Nenhuma automação cadastrada'),
          ]),
    ]);

    // ---- viewer (no topbar — a floating button exposes the actions instead) ----
    // Every open tab gets its own persistent node (hidden via CSS, not
    // unmounted) so switching tabs never tears down the iframe — the
    // automation keeps running, keeps its in-page state/history, exactly
    // like a real browser tab. Only the actually-active one is visible.
    function buildViewerFor(a) {
      const isActive = a.id === activeTabId;
      const state = viewerLoad[a.id] || 'loading';
      const isOffline = a.status === 'offline';
      const fabItem = (key, icon, label, onClick, danger) => e('button', {
        key, className: danger ? 'menu-item-danger' : 'menu-item', onClick: () => { setViewerMenuOpen(false); onClick(); },
        style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:' + (danger ? 'var(--error)' : 'var(--text)') + ';font-size:12.5px;cursor:pointer;text-align:left'),
      }, [Icon(icon, 14, danger ? 'var(--error)' : 'var(--text)'), ' ' + label]);

      return e('div', {
        key: 'viewer-' + a.id, ref: isActive ? viewerRef : undefined,
        style: { height: '100%', position: 'relative', background: 'var(--bg)', display: isActive ? 'block' : 'none' },
      }, [
        e('button', {
          key: 'fab', title: 'Opções', onClick: (ev) => { ev.stopPropagation(); setViewerMenuOpen((v) => !v); },
          style: sx('position:absolute;top:14px;right:14px;z-index:20;width:38px;height:38px;border-radius:10px;background:var(--card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text);cursor:pointer;box-shadow:0 8px 20px -6px rgba(0,0,0,0.12)'),
        }, Icon('MoreHorizontal', 18)),
        (isActive && viewerMenuOpen) ? e('div', {
          key: 'fab-menu', onClick: (ev) => ev.stopPropagation(),
          style: sx('position:absolute;top:58px;right:14px;z-index:20;background:var(--popover);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.12);min-width:230px;overflow:hidden'),
        }, [
          e('div', { key: 'info', style: sx('padding:12px 14px;border-bottom:1px solid var(--border)') }, [
            e('div', { key: 'name', style: sx("display:flex;align-items:center;gap:7px;font-weight:600;font-size:13px") }, [
              e('span', { key: 'dot', className: a.status !== 'offline' ? 'pulse-dot' : '', style: { position: 'relative', width: 6, height: 6, borderRadius: '50%', background: STATUS_META[a.status].color, color: STATUS_META[a.status].color, flexShrink: 0 } }),
              e('span', { key: 't', style: sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap') }, a.name),
            ]),
            e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted-soft);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap") }, urlVisivel(a)),
          ]),
          fabItem('reload', 'RefreshCw', 'Recarregar', () => startViewerLoad(a.id)),
          podeNovaAba && fabItem('ext', 'ExternalLink', 'Abrir em nova aba', () => abrirEmNovaAba(a)),
          fabItem('full', 'Maximize2', 'Tela cheia', toggleFullscreen),
          e('div', { key: 'sep', style: { height: 1, background: 'var(--border)' } }),
          fabItem('close', 'X', 'Fechar aba', () => closeTab(a.id), true),
        ]) : null,
        state === 'loading' ? e('div', { key: 'loading', style: sx('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--bg)') }, [
          e('div', { key: 'spin', style: { width: 48, height: 48, borderRadius: 12, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'spin 1.4s linear infinite', color: 'var(--primary-fg)' } }, Icon('Loader2', 22, 'var(--primary-fg)')),
          e('div', { key: 't', style: { color: 'var(--muted)', fontSize: 13.5 } }, 'Carregando automação…'),
          e('div', { key: 'bar', style: sx('width:220px;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--secondary) 25%,var(--hover-bg) 50%,var(--secondary) 75%);background-size:200% 100%;animation:shimmer 1.3s linear infinite') }),
        ]) : null,
        state === 'error' ? e('div', { key: 'error', style: sx('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px') }, [
          e('div', { key: 'i', style: sx('width:54px;height:54px;border-radius:14px;background:var(--error-tint);display:flex;align-items:center;justify-content:center;color:var(--error)') }, Icon('WifiOff', 26)),
          e('div', { key: 't', style: sx("font-weight:600;font-size:16px;max-width:420px") }, isOffline ? 'Este container está offline' : 'Não foi possível carregar esta automação dentro do painel'),
          e('div', { key: 'd', style: sx('color:var(--muted);font-size:13.5px;max-width:420px;line-height:1.5') }, isOffline
            ? 'O container "' + a.container + '" não está respondendo. Verifique se ele está em execução.'
            : 'O serviço pode estar bloqueando exibição em iframe (X-Frame-Options / CSP) ou estar fora do alcance desta rede.'),
          e('div', { key: 'actions', style: sx('display:flex;gap:10px;margin-top:6px') }, [
            e('button', { key: 'retry', className: 'btn-primary', onClick: () => startViewerLoad(a.id), style: sx('display:flex;align-items:center;gap:7px;padding:10px 16px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, [Icon('RefreshCw', 14), ' Tentar novamente']),
            podeNovaAba && e('button', { key: 'ext', className: 'btn-outline', onClick: () => abrirEmNovaAba(a), style: sx('display:flex;align-items:center;gap:7px;padding:10px 16px;background:var(--secondary);color:var(--text);border:1px solid var(--border);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          ]),
        ]) : null,
        passes[a.id] === undefined ? null : e('iframe', {
          key: 'frame-' + a.id + '-' + (viewerNonce.current[a.id] || 0),
          src: comPasse(a, passes[a.id]), title: a.name,
          onLoad: () => onIframeLoad(a.id),
          style: Object.assign({ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'var(--bg)' }, state === 'loaded' ? {} : { visibility: 'hidden' }),
        }),
      ]);
    }

    const viewerNodes = openTabs.map((id) => automations.find((a) => a.id === id)).filter(Boolean).map(buildViewerFor);

    // ---- modal (v2: layout novo, tudo em uma coluna) ----
    let modal = null;
    if (modalOpen && modalForm) modal = e(FormAutomacaoV2, { key: 'form-auto', form: modalForm, modo: modalMode, setCampo: setModalField, fechar: closeModal, salvar: saveAutomation, testar: testConnection, teste: testState });

    // ---- confirm dialog ----
    let confirmModal = null;
    if (confirmDialog) {
      confirmModal = e('div', { onClick: () => setConfirmDialog(null), style: sx('position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(3px);z-index:70;display:flex;align-items:center;justify-content:center;padding:16px') }, [
        e('div', { key: 'box', onClick: (ev) => ev.stopPropagation(), style: sx('width:100%;max-width:380px;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 60px -12px rgba(0,0,0,0.16);animation:modalIn 0.15s ease both;padding:20px') }, [
          e('div', { key: 't', style: sx("font-weight:600;font-size:15px;margin-bottom:8px") }, confirmDialog.title),
          e('div', { key: 'm', style: sx('color:var(--muted);font-size:13px;line-height:1.5;margin-bottom:18px') }, confirmDialog.message),
          e('div', { key: 'actions', style: sx('display:flex;gap:10px') }, [
            e('button', { key: 'cancel', className: 'btn-secondary', onClick: () => setConfirmDialog(null), style: sx('flex:1;padding:10px;background:transparent;border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Cancelar'),
            e('button', {
              key: 'confirm', className: confirmDialog.danger ? 'btn-danger' : 'btn-primary', onClick: confirmDialog.onConfirm,
              style: { flex: 1, padding: 10, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: confirmDialog.danger ? 'var(--error)' : 'var(--accent)', color: confirmDialog.danger ? '#fff' : 'var(--bg)' },
            }, confirmDialog.confirmLabel || 'Confirmar'),
          ]),
        ]),
      ]);
    }

    // ---- GLPI quick-ticket floating button + widget (Messenger-style popup: no backdrop, opens/closes over the corner) ----
    const selectStyle = 'width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13.5px';
    const fieldLabelStyle = 'font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:600';

    // Botão do GLPI: pílula na cor primária; no hover expande mostrando
    // "Abrir chamado"; aberto, o ícone vira um X (troca com animação).
    const glpiFab = e('button', {
      key: 'glpi-fab', ref: glpiFabRef, title: glpiOpen ? 'Fechar' : 'Abrir chamado no GLPI', 'aria-label': glpiOpen ? 'Fechar chamado no GLPI' : 'Abrir chamado no GLPI', 'aria-expanded': glpiOpen ? 'true' : 'false',
      className: 'glpi-fab' + (glpiOpen ? ' open' : ''), onClick: toggleGlpiWidget,
    }, [
      e('span', { key: glpiOpen ? 'x' : 'headset', className: 'glpi-fab-icon' }, glpiOpen ? Icon('X', 18, 'currentColor', 2) : Icon('Headset', 19, 'currentColor')),
      e('span', { key: 'label', className: 'glpi-fab-label' }, 'Abrir chamado'),
    ]);

    // Combobox com busca embutida — usado pra Requerente e Atribuído, já que a
    // lista de usuários do GLPI pode ser grande demais pra um <select> comum.
    function userCombo({ users, selectedId, search, open, setSearch, setOpen, placeholder, onSelect }) {
      const selected = users.find((u) => String(u.id) === String(selectedId));
      const q = search.trim().toLowerCase();
      const filtered = q ? users.filter((u) => u.label.toLowerCase().includes(q)) : users;
      return e('div', { style: { position: 'relative' } }, [
        e('div', { key: 'row', style: sx('display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px') }, [
          Icon('Search', 14, 'var(--muted-soft)'),
          e('input', {
            key: 'inp',
            value: open ? search : (selected ? selected.label : ''),
            onFocus: () => { setOpen(true); setSearch(''); },
            onBlur: () => setTimeout(() => setOpen(false), 150),
            onChange: (ev) => setSearch(ev.target.value),
            placeholder,
            style: sx('flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text);font-size:13.5px'),
          }),
          selected ? e('span', {
            key: 'clear', onMouseDown: (ev) => ev.preventDefault(), onClick: () => { onSelect(''); setSearch(''); },
            style: sx('cursor:pointer;color:var(--muted-soft);display:flex'),
          }, Icon('X', 13)) : null,
        ]),
        open ? e('div', { key: 'list', style: sx('position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:180px;overflow-y:auto;background:var(--popover);border:1px solid var(--border);border-radius:8px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.12);z-index:5') },
          filtered.length
            ? filtered.slice(0, 50).map((u) => e('button', {
                key: u.id, className: 'menu-item', onMouseDown: (ev) => ev.preventDefault(), onClick: () => { onSelect(u.id); setSearch(''); setOpen(false); },
                style: sx('display:block;width:100%;padding:8px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left'),
              }, u.label))
            : [e('div', { key: 'empty', style: sx('padding:9px 12px;color:var(--muted-soft);font-size:12.5px') }, 'Nenhum resultado')]
        ) : null,
      ]);
    }

    const users = glpiLookup ? glpiLookup.users : [];
    const erroTitulo = glpiTocado && !glpiForm.titulo.trim() ? 'Escreva um título curto.' : '';
    async function enviarChamadoV2() {
      setGlpiTocado(true);
      if (!glpiForm.titulo.trim()) return;
      setGlpiSubmitting(true);
      try {
        const categoria = glpiLookup ? glpiLookup.categories.find((c) => String(c.id) === String(glpiForm.categoriaId)) : null;
        const requerente = users.find((u) => String(u.id) === String(glpiForm.requerenteId));
        const atribuido = users.find((u) => String(u.id) === String(glpiForm.atribuidoId));
        const result = await api('/api/glpi/ticket', {
          method: 'POST',
          body: JSON.stringify({ userToken: glpiToken, ...glpiForm, categoriaLabel: categoria ? categoria.label : null, requerenteLabel: requerente ? requerente.label : null, atribuidoLabel: atribuido ? atribuido.label : null,
            anexos: glpiAnexos.map((a) => ({ nome: a.nome, tipo: a.tipo, base64: a.base64 })) }),
        });
        setGlpiSucesso({ id: result.id, url: result.url, titulo: glpiForm.titulo.trim(), categoria: categoria ? categoria.label : 'Sem categoria', anexados: result.anexados || 0, falhasAnexo: result.falhasAnexo || [] });
        setGlpiForm({ categoriaId: '', requerenteId: '', atribuidoId: '', titulo: '', descricao: '' });
        setGlpiAnexos([]);
        setGlpiTocado(false);
      } catch (err) {
        pushToast('error', 'Não foi possível abrir o chamado: ' + err.message);
      } finally {
        setGlpiSubmitting(false);
      }
    }
    // anexos: mesmas regras do servidor (glpi.lerAnexos); conferidas aqui para avisar antes de enviar
    const ANEXO_ACEITOS = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';
    const TIPO_POR_EXT = { doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    const tamanhoTexto = (n) => (n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB');
    function adicionarAnexos(arquivos) {
      Array.from(arquivos || []).forEach((f, i) => {
        const ext = String(f.name || '').split('.').pop().toLowerCase();
        const tipo = TIPO_POR_EXT[ext] || f.type;
        const nome = f.name && f.name !== 'image.png' ? f.name : 'print-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '-' + i + '.png';
        if (!Object.values(TIPO_POR_EXT).includes(tipo)) { pushToast('error', nome + ': envie foto, PDF ou documento.'); return; }
        if (f.size > 10 * 1024 * 1024) { pushToast('error', nome + ' passa de 10 MB.'); return; }
        const leitor = new FileReader();
        leitor.onload = () => setGlpiAnexos((atual) => {
          if (atual.length >= 5) { pushToast('error', 'Envie até 5 arquivos por chamado.'); return atual; }
          if (atual.reduce((soma, a) => soma + a.tamanho, 0) + f.size > 25 * 1024 * 1024) { pushToast('error', 'Os arquivos passam de 25 MB no total.'); return atual; }
          return [...atual, { id: Math.random().toString(36).slice(2), nome, tipo, tamanho: f.size, base64: String(leitor.result).split(',')[1] || '', previa: tipo.startsWith('image/') ? leitor.result : null }];
        });
        leitor.readAsDataURL(f);
      });
    }
    // o rótulo aponta para o campo (htmlFor/id), para o leitor de tela anunciar "Título", "Categoria"...
    const campoV2 = (rotulo, filho, extra) => {
      const ligavel = filho && (['input', 'select', 'textarea'].includes(filho.type) || filho.type === EscolhaPessoa);
      const id = ligavel ? 'v3-campo-' + rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() : undefined;
      return e('div', { className: 'exu-campo' }, [
        e('label', { key: 'l', htmlFor: id }, rotulo),
        ligavel ? React.cloneElement(filho, { key: 'f', id }) : filho,
        extra || null,
      ]);
    };

    let glpiBody;
    if (!glpiToken) {
      glpiBody = e('div', { key: 'setup', className: 'ext-travado' }, [
        Icon('Lock', 28, 'var(--muted)'),
        e('b', { key: 'b' }, 'Falta o seu token do GLPI'),
        e('p', { key: 'p' }, 'O chamado sai com o seu token, que fica cifrado em Meus acessos (Configurar, Meus tokens de API).'),
        e('input', { key: 'tok', className: 'v2-input', type: 'password', autoComplete: 'off', value: glpiTokenDraft, onChange: (ev) => setGlpiTokenDraft(ev.target.value), placeholder: 'User-Token do GLPI', 'aria-label': 'User-Token do GLPI' }),
        e('button', { key: 'save', type: 'button', className: 'exu-btn primario', disabled: !glpiTokenDraft.trim(), onClick: saveGlpiToken }, 'Salvar token'),
      ]);
    } else if (glpiLookupLoading) {
      glpiBody = e('div', { key: 'loading', className: 'v2-carregando' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)), 'Carregando categorias e pessoas do GLPI…']);
    } else if (glpiLookupError) {
      glpiBody = e('div', { key: 'error', className: 'exc-aviso', style: { background: 'var(--error-tint)', flexDirection: 'column', alignItems: 'flex-start' } }, [
        e('span', { key: 't' }, glpiLookupError),
        e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: () => loadGlpiLookup(glpiToken) }, 'Tentar novamente'),
      ]);
    } else if (glpiSucesso) {
      glpiBody = e('div', { key: 'ok', className: 'ext-sucesso' }, [
        e('span', { key: 'i', className: 'ext-sucesso-icone' }, Icon('Activity', 26, 'var(--accent)')),
        e('b', { key: 'b' }, glpiSucesso.id ? 'Chamado #' + glpiSucesso.id + ' aberto' : 'Chamado aberto'),
        e('p', { key: 'p' }, glpiSucesso.titulo + ' · ' + glpiSucesso.categoria + (glpiSucesso.anexados ? ' · ' + (glpiSucesso.anexados === 1 ? '1 arquivo anexado' : glpiSucesso.anexados + ' arquivos anexados') : '')),
        glpiSucesso.falhasAnexo && glpiSucesso.falhasAnexo.length ? e('div', { key: 'fa', className: 'exc-aviso' }, 'O chamado foi aberto, mas não consegui anexar: ' + glpiSucesso.falhasAnexo.join(', ') + '. Anexe pelo GLPI.') : null,
        e('div', { key: 'a', style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' } }, [
          glpiSucesso.url ? e('a', { key: 'g', className: 'exu-btn', href: glpiSucesso.url, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none' } }, [Icon('ExternalLink', 14, 'currentColor'), 'Ver no GLPI']) : null,
          e('button', { key: 'o', type: 'button', className: 'exu-btn', onClick: () => setGlpiSucesso(null) }, 'Abrir outro'),
          e('button', { key: 'm', type: 'button', className: 'exu-btn primario', onClick: () => { setGlpiSucesso(null); setGlpiAba('meus'); loadGlpiHistory(); } }, 'Ver meus chamados'),
        ]),
      ]);
    } else {
      glpiBody = e('div', { key: 'form', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [
        campoV2('Categoria', e('select', { value: glpiForm.categoriaId, onChange: (ev) => setGlpiField('categoriaId', ev.target.value) }, [e('option', { key: '', value: '' }, 'Sem categoria'), ...(glpiLookup ? glpiLookup.categories : []).map((c) => e('option', { key: c.id, value: c.id }, c.label))])),
        e('div', { key: 'pessoas', className: 'exu-duas-col' }, [
          e('div', { key: 'r' }, campoV2('Requerente', e(EscolhaPessoa, { users, valor: glpiForm.requerenteId, mudar: (id) => setGlpiField('requerenteId', id) }), e('p', { key: 'a', className: 'exu-campo-ajuda' }, 'Vazio: você mesmo.'))),
          e('div', { key: 'a' }, campoV2('Atribuído a', e(EscolhaPessoa, { users, valor: glpiForm.atribuidoId, mudar: (id) => setGlpiField('atribuidoId', id) }), e('p', { key: 'a', className: 'exu-campo-ajuda' }, 'Vazio: fila da equipe.'))),
        ]),
        campoV2('Título', e('input', { value: glpiForm.titulo, onChange: (ev) => setGlpiField('titulo', ev.target.value), maxLength: 200, placeholder: 'Ex.: Erro ao bloquear usuário', 'aria-invalid': !!erroTitulo }), erroTitulo ? e('p', { key: 'e', className: 'exu-campo-erro' }, erroTitulo) : null),
        campoV2('Descrição', e('textarea', { value: glpiForm.descricao, onChange: (ev) => setGlpiField('descricao', ev.target.value), onPaste: (ev) => { if (ev.clipboardData && ev.clipboardData.files.length) { ev.preventDefault(); adicionarAnexos(ev.clipboardData.files); } }, placeholder: 'Conte o que aconteceu e o que já tentou. Cole um print aqui (Ctrl+V).', style: { height: 100 } })),
        campoV2('Fotos e documentos (opcional)', e('div', { className: 'v3-anexos' }, [
          e('label', {
            key: 'z', className: 'ext-anexo v3-anexo-zona' + (glpiArrastando ? ' arrastando' : ''),
            onDragOver: (ev) => { ev.preventDefault(); setGlpiArrastando(true); }, onDragLeave: () => setGlpiArrastando(false),
            onDrop: (ev) => { ev.preventDefault(); setGlpiArrastando(false); adicionarAnexos(ev.dataTransfer.files); },
          }, [
            Icon('Plus', 16, 'var(--muted)'),
            e('span', { key: 't' }, 'Arraste aqui, cole um print ou'),
            e('span', { key: 'b', className: 'exu-btn pequeno' }, 'escolha arquivos'),
            e('input', { key: 'i', type: 'file', multiple: true, accept: ANEXO_ACEITOS, className: 'v3-anexo-input', onChange: (ev) => { adicionarAnexos(ev.target.files); ev.target.value = ''; } }),
          ]),
          glpiAnexos.length ? e('ul', { key: 'l', className: 'v3-anexo-lista' }, glpiAnexos.map((a) => e('li', { key: a.id }, [
            a.previa ? e('img', { key: 'p', src: a.previa, alt: '' }) : e('span', { key: 'p', className: 'v3-anexo-icone' }, Icon('FileText', 16, 'var(--muted)')),
            e('div', { key: 'n' }, [e('b', { key: 'b' }, a.nome), e('small', { key: 's' }, tamanhoTexto(a.tamanho))]),
            e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno', onClick: () => setGlpiAnexos((l) => l.filter((x) => x.id !== a.id)), 'aria-label': 'Remover ' + a.nome }, Icon('X', 13, 'currentColor')),
          ]))) : null,
        ]), e('p', { key: 'a', className: 'exu-campo-ajuda' }, 'Fotos, PDF, Word, Excel ou PowerPoint. Até 5 arquivos de 10 MB.')),
      ]);
    }

    let glpiHistoryBody;
    if (glpiHistoryLoading) {
      glpiHistoryBody = e('div', { className: 'v2-carregando' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)), 'Carregando seus chamados…']);
    } else if (glpiHistoryError) {
      glpiHistoryBody = e('div', { className: 'exc-aviso', style: { background: 'var(--error-tint)', flexDirection: 'column', alignItems: 'flex-start' } }, [e('span', { key: 't' }, glpiHistoryError), e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: loadGlpiHistory }, 'Tentar novamente')]);
    } else if (glpiHistory.length === 0) {
      glpiHistoryBody = e('div', { className: 'exc-vazio', style: { padding: 24 } }, 'Nenhum chamado aberto por aqui ainda.');
    } else {
      glpiHistoryBody = e('ul', { className: 'ext-meus' }, glpiHistory.map((t) => e('li', { key: t.id }, [
        e('div', { key: 't', style: { minWidth: 0 } }, [
          e('b', { key: 'b' }, [t.url ? e('a', { key: 'n', href: t.url, target: '_blank', rel: 'noopener noreferrer', className: 'exc-id', style: { color: 'var(--accent)' } }, '#' + t.ticketId + ' ') : e('span', { key: 'n', className: 'exc-id' }, '#' + t.ticketId + ' '), t.titulo]),
          e('small', { key: 's' }, [t.categoriaLabel, t.requerenteLabel ? 'Requerente: ' + t.requerenteLabel : null, t.atribuidoLabel ? 'Atribuído: ' + t.atribuidoLabel : null].filter(Boolean).join(' · ') || 'Sem categoria'),
        ]),
        e('small', { key: 'd', style: { color: 'var(--muted)', whiteSpace: 'nowrap' } }, new Date(t.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
      ])));
    }

    const glpiPodeEnviar = glpiAba === 'novo' && glpiToken && !glpiLookupLoading && !glpiLookupError && !glpiSucesso;
    const glpiModal = glpiOpen ? e('div', { ref: glpiPanelRef, className: 'v2-glpi v3-glpi', role: 'dialog', 'aria-label': 'Chamado no GLPI' }, [
      e('div', { key: 'c', className: 'exu-modal-cab' }, [
        e('span', { key: 'i', className: 'glpi-head-icon' }, Icon('Headset', 16, 'currentColor')),
        e('div', { key: 't', style: { flex: 1, minWidth: 0 } }, [e('h3', { key: 'h' }, 'Chamado no GLPI'), e('p', { key: 'p' }, 'Abre na entidade Sistemas com o seu usuário do GLPI.')]),
        glpiToken ? e('button', { key: 'f', type: 'button', className: 'exu-btn pequeno', onClick: forgetGlpiToken, title: 'Remover o token deste navegador' }, 'Remover token') : null,
        e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno exu-modal-x', onClick: closeGlpiWidget, 'aria-label': 'Fechar' }, Icon('X', 14)),
      ]),
      glpiToken ? e('div', { key: 'a', className: 'exu-abas', role: 'tablist', style: { padding: '0 20px' } }, [['novo', 'Novo chamado'], ['meus', 'Meus chamados']].map(([k, t]) => e('button', {
        key: k, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': glpiAba === k ? 'true' : 'false', onClick: () => { setGlpiAba(k); if (k === 'meus') loadGlpiHistory(); },
      }, [t, k === 'meus' && glpiHistory.length ? e('span', { key: 'n', className: 'n' }, String(glpiHistory.length)) : null]))) : null,
      e('div', { key: 'b', className: 'exu-modal-corpo' }, glpiAba === 'meus' && glpiToken ? glpiHistoryBody : glpiBody),
      glpiPodeEnviar ? e('div', { key: 'r', className: 'exu-modal-pe' }, [
        e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: closeGlpiWidget }, 'Cancelar'),
        e('button', { key: 'e', type: 'button', className: 'exu-btn primario', disabled: glpiSubmitting, onClick: enviarChamadoV2 }, glpiSubmitting ? 'Abrindo…' : 'Abrir chamado'),
      ]) : null,
    ]) : null;

    // ---- toasts ----
    const toastEl = e('div', { style: sx('position:fixed;bottom:20px;right:20px;z-index:80;display:flex;flex-direction:column;gap:10px;max-width:340px') },
      toasts.map((t) => {
        const meta = TOAST_META[t.type] || TOAST_META.info;
        return e('div', {
          key: t.id,
          style: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid ' + meta.color, borderRadius: 9, padding: '12px 14px', boxShadow: '0 12px 30px -8px rgba(0,0,0,0.12)', animation: 'toastIn 0.2s ease both' },
        }, [
          Icon(meta.icon, 16, meta.color),
          e('span', { key: 'm', style: { fontSize: 13 } }, t.message),
          t.link ? e('a', {
            key: 'link', href: t.link.url, target: '_blank', rel: 'noopener noreferrer',
            style: sx('margin-left:6px;color:var(--accent);font-weight:600;text-decoration:underline;cursor:pointer'),
          }, t.link.label) : null,
        ]);
      })
    );

    return e('div', { style: sx("height:100vh;width:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden") }, [
      header,
      e('div', { key: 'main', style: sx('flex:1;position:relative;overflow:hidden'), onClick: closeMenus }, [
        e('div', { key: 'panel', style: { display: abaFixaAtiva('painel') ? 'block' : 'none', height: '100%', overflowY: 'auto' } }, panelBody),
        abasMontadas.chamados && window.ChamadosView
          ? e('div', { key: 'chamados', style: { display: abaFixaAtiva('chamados') ? 'block' : 'none', height: '100%', overflowY: 'auto' } }, e(window.ChamadosView))
          : null,
        abasMontadas.admin && window.AdminView
          ? e('div', { key: 'admin', style: { display: abaFixaAtiva('admin') ? 'block' : 'none', height: '100%', overflowY: 'auto' } }, e(window.AdminView))
          : null,
        abasMontadas.resultados && window.ResultadosView
          ? e('div', { key: 'resultados', style: { display: abaFixaAtiva('resultados') ? 'block' : 'none', height: '100%', overflowY: 'auto' } }, e(window.ResultadosView))
          : null,
        ...viewerNodes,
      ]),
      modal,
      confirmModal,
      glpiFab,
      glpiModal,
      toastEl,
    ]);
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(e(App));
})();
