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

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      let message = 'Erro na requisição';
      try { const body = await res.json(); if (body.error) message = body.error; } catch (_) {}
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function App() {
    const [automations, setAutomations] = useState([]);
    const [automationsLoaded, setAutomationsLoaded] = useState(false);
    const [search, setSearch] = useState('');
    const [openTabs, setOpenTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [viewerLoad, setViewerLoad] = useState({});
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('new');
    const [modalForm, setModalForm] = useState(null);
    const [testState, setTestState] = useState('idle');
    const [menuOpenId, setMenuOpenId] = useState(null);
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
      let es;
      try {
        es = new EventSource('/api/events');
        es.onmessage = (ev) => {
          try {
            setAutomations(JSON.parse(ev.data));
            setAutomationsLoaded(true);
            setLastRefresh(new Date());
          } catch (err) {}
        };
      } catch (err) {}
      // Safety-net poll in case the SSE connection is ever blocked (e.g. a proxy buffering it).
      const t = setInterval(refresh, 15000);
      return () => {
        clearInterval(t);
        if (es) es.close();
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
      try { localStorage.setItem('arx-tema', next); } catch (err) {}
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

    const header = e('div', { style: sx('display:flex;align-items:center;gap:14px;padding:0 20px;height:56px;flex-shrink:0;background:var(--card);border-bottom:1px solid var(--border);z-index:10;position:relative') }, [
      e('div', { key: 'left', style: sx('display:flex;align-items:stretch;gap:2px;min-width:0;flex:0 1 auto;overflow:hidden') }, [
        e('button', {
          key: 'panel', className: 'panel-tab' + (panelCompact ? ' compact' : ''), onClick: abrirPainel,
          title: 'Painel', 'aria-label': 'Painel',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('painel') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('painel') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('LayoutDashboard', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Painel')]),
        e('button', {
          key: 'chamados', className: 'panel-tab' + (panelCompact ? ' compact' : ''), onClick: abrirChamados,
          title: 'Chamados do GLPI', 'aria-label': 'Chamados',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('chamados') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('chamados') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('Headset', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Chamados')]),
        e('button', {
          key: 'resultados', className: 'panel-tab' + (panelCompact ? ' compact' : ''), onClick: () => abrirAbaFixa('resultados'),
          title: 'Resultados das automações', 'aria-label': 'Resultados',
          style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (abaFixaAtiva('resultados') ? 'var(--accent)' : 'transparent') + ';color:' + (abaFixaAtiva('resultados') ? 'var(--text)' : 'var(--muted)') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
        }, [Icon('BarChart3', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Resultados')]),
        openTabItems.length ? e('span', { key: 'sep', className: 'tabs-sep' }) : null,
        navScroll,
      ]),
      tabsMenu,
      e('div', { key: 'spacer', style: { flex: 1, minWidth: 20 } }),
      e('div', { key: 'right', style: sx('display:flex;align-items:center;gap:16px;flex-shrink:0') }, [
        e('div', { key: 'search', className: 'search-box', style: sx('display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:7px 12px;flex-shrink:0;width:220px') }, [
          Icon('Search', 15, 'var(--muted-soft)'),
          e('input', {
            key: 'input', ref: searchRef, value: search, onChange: (ev) => setSearch(ev.target.value),
            placeholder: 'Buscar…',
            style: sx('flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text);font-size:13.5px'),
          }),
          e('span', { key: 'kbd', style: sx("font-family:'JetBrains Mono',monospace;font-size:10.5px;background:var(--secondary);border:1px solid var(--border);border-radius:5px;padding:2px 5px;color:var(--muted-soft);flex-shrink:0") }, 'Ctrl K'),
        ]),
        // alertas.js (sino) e acessos.js (Meus acessos): componentes próprios
        window.AlertasSino ? e(window.AlertasSino, { key: 'alertas' }) : null,
        window.MeusAcessosBotao ? e(window.MeusAcessosBotao, { key: 'acessos' }) : null,
        e('div', { key: 'health', style: sx('display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12.5px;flex-shrink:0') }, [
          e('span', { key: 'dot', className: 'pulse-dot', style: { position: 'relative', width: 7, height: 7, borderRadius: '50%', background: healthDotColor, color: healthDotColor } }),
          e('span', { key: 'label' }, online + '/' + total + ' online'),
        ]),
        e('button', {
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
      const urlShort = a.url.replace(/^https?:\/\//, '');
      const cats = (a.categories || []).map((k) => CATEGORY_META[k]).filter(Boolean);
      return e('div', {
        key: a.id, className: 'card', onClick: () => openAutomation(a.id),
        style: { position: 'relative', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeInUp 0.3s ease both', animationDelay: Math.min(i, 10) * 35 + 'ms' },
      }, [
        e('div', { key: 'top', style: sx('display:flex;align-items:flex-start;justify-content:space-between') }, [
          e('div', { key: 'icon', style: { width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color + '22', color: a.color } }, Icon(a.icon, 19, a.color)),
          e('div', { key: 'actions', style: sx('display:flex;align-items:center;gap:2px') }, [
            e('span', { key: 'dot', className: isPulsing ? 'pulse-dot' : '', style: { position: 'relative', width: 8, height: 8, borderRadius: '50%', background: meta.color, color: meta.color, marginTop: 6, marginRight: 4 } }),
            e('button', {
              key: 'menu', className: 'icon-btn', onClick: (ev) => { ev.stopPropagation(); setMenuOpenId(menuOpen ? null : a.id); },
              style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);border-radius:6px;cursor:pointer'),
            }, Icon('MoreHorizontal', 17)),
          ]),
        ]),
        e('div', { key: 'info' }, [
          cats.length ? e('div', { key: 'cats', style: sx('display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px') }, cats.map((c) => e('span', {
            key: c.key,
            style: sx('display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:10.5px;font-weight:600;background:' + c.color + '22;color:' + c.color),
          }, c.label))) : null,
          e('div', { key: 'name', style: sx("font-weight:600;font-size:14px") }, a.name),
          e('div', { key: 'desc', style: sx('color:var(--muted);font-size:12.5px;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden') }, a.description),
        ]),
        e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--muted-soft)") }, urlShort),
        e('button', {
          key: 'open', className: 'card-open-btn', onClick: (ev) => { ev.stopPropagation(); openAutomation(a.id); },
          style: sx('padding:8px;background:var(--secondary);border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer;margin-top:2px'),
        }, 'Abrir'),
        menuOpen ? e('div', {
          key: 'popover', onClick: (ev) => ev.stopPropagation(),
          style: sx('position:absolute;top:44px;right:10px;background:var(--popover);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.12);z-index:5;overflow:hidden;min-width:170px'),
        }, [
          e('button', { key: 'edit', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); openEditModal(a); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Pencil', 14), ' Editar']),
          e('button', { key: 'newtab', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); window.open(a.url, '_blank'); setMenuOpenId(null); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          e('button', { key: 'copy', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); copyUrl(a.url); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--text);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Copy', 14), ' Copiar URL']),
          e('div', { key: 'sep', style: { height: 1, background: 'var(--border)' } }),
          e('button', { key: 'del', className: 'menu-item-danger', onClick: (ev) => { ev.stopPropagation(); deleteAutomation(a.id); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:var(--error);font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Trash2', 14), ' Remover']),
        ]) : null,
      ]);
    }

    // Automações de banco de dados (categoria "db") ficam numa seção própria, abaixo das demais.
    const isDb = (a) => (a.categories || []).includes('db');
    const mainList = visible.filter((a) => !isDb(a));
    const dbList = visible.filter(isDb);
    const cardGrid = (key, list) => e('div', { key, style: sx('display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px') }, list.map(buildCard));
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
        e('div', { key: 's', style: { color: 'var(--muted-soft)', fontSize: 12.5 } }, total + ' automações · ' + online + ' online · ' + offline + ' offline'),
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
            e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted-soft);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap") }, a.url),
          ]),
          fabItem('reload', 'RefreshCw', 'Recarregar', () => startViewerLoad(a.id)),
          fabItem('ext', 'ExternalLink', 'Abrir em nova aba', () => window.open(a.url, '_blank')),
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
            e('button', { key: 'ext', className: 'btn-outline', onClick: () => window.open(a.url, '_blank'), style: sx('display:flex;align-items:center;gap:7px;padding:10px 16px;background:var(--secondary);color:var(--text);border:1px solid var(--border);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          ]),
        ]) : null,
        e('iframe', {
          key: 'frame-' + a.id + '-' + (viewerNonce.current[a.id] || 0),
          src: a.url, title: a.name,
          onLoad: () => onIframeLoad(a.id),
          style: Object.assign({ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'var(--bg)' }, state === 'loaded' ? {} : { visibility: 'hidden' }),
        }),
      ]);
    }

    const viewerNodes = openTabs.map((id) => automations.find((a) => a.id === id)).filter(Boolean).map(buildViewerFor);

    // ---- modal ----
    let modal = null;
    if (modalOpen && modalForm) {
      modal = e('div', { onClick: closeModal, style: sx('position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(3px);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px') }, [
        e('div', { key: 'box', onClick: (ev) => ev.stopPropagation(), style: sx('width:100%;max-width:480px;max-height:88vh;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 60px -12px rgba(0,0,0,0.16);animation:modalIn 0.15s ease both') }, [
          e('div', { key: 'head', style: sx('display:flex;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)') }, [
            e('div', { key: 't', style: sx("font-weight:600;font-size:15.5px;flex:1") }, modalMode === 'new' ? 'Nova automação' : 'Editar automação'),
            e('button', { key: 'x', className: 'icon-btn', onClick: closeModal, style: sx('width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);cursor:pointer;border-radius:7px') }, Icon('X', 13)),
          ]),
          e('div', { key: 'body', style: sx('padding:18px;display:flex;flex-direction:column;gap:14px') }, [
            e('div', { key: 'name' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:600') }, 'Nome'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.name, onChange: (ev) => setModalField('name', ev.target.value), placeholder: 'Ex: Emissão de Boletos', style: sx('width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13.5px') }),
            ]),
            e('div', { key: 'url' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:600') }, 'URL (IP:porta)'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.url, onChange: (ev) => setModalField('url', ev.target.value), placeholder: 'http://192.168.0.10:8081', style: sx("width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13.5px;font-family:'JetBrains Mono',monospace") }),
            ]),
            e('div', { key: 'container' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:600') }, 'Container Docker (opcional)'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.container, onChange: (ev) => setModalField('container', ev.target.value), placeholder: 'boletos-service', style: sx("width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13.5px;font-family:'JetBrains Mono',monospace") }),
            ]),
            e('div', { key: 'icon' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:8px;font-weight:600') }, 'Ícone'),
              e('div', { key: 'grid', style: sx('display:grid;grid-template-columns:repeat(5,1fr);gap:8px') }, ICON_CHOICES.map((name) => {
                const selected = modalForm.icon === name;
                return e('button', {
                  key: name, className: 'icon-choice', onClick: () => setModalField('icon', name),
                  style: { aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: selected ? 'var(--accent)' : 'var(--bg)', border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)') },
                }, Icon(name, 18, selected ? 'var(--bg)' : 'var(--text)'));
              })),
            ]),
            e('div', { key: 'color' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:8px;font-weight:600') }, 'Cor'),
              e('div', { key: 'row', style: sx('display:flex;gap:10px') }, COLOR_CHOICES.map((c) => {
                const selected = modalForm.color === c;
                return e('button', {
                  key: c, onClick: () => setModalField('color', c),
                  style: { width: 30, height: 30, borderRadius: '50%', background: c, border: '2px solid ' + (selected ? 'var(--text)' : 'transparent'), cursor: 'pointer', boxShadow: '0 0 0 1px var(--border)' },
                });
              })),
            ]),
            e('div', { key: 'category' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:8px;font-weight:600') }, 'Sistema (seleção múltipla)'),
              e('div', { key: 'row', style: sx('display:flex;flex-wrap:wrap;gap:8px') }, [
                ...CATEGORY_CHOICES.map((c) => {
                  const selected = modalForm.categories.includes(c.key);
                  return e('button', {
                    key: c.key,
                    onClick: () => setModalField('categories', selected
                      ? modalForm.categories.filter((k) => k !== c.key)
                      : [...modalForm.categories, c.key]),
                    style: sx('display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;background:' + c.color + '22;border:1px solid ' + (selected ? c.color : 'transparent') + ';color:' + c.color),
                  }, [
                    e('span', { key: 'dot', style: { width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 } }),
                    e('span', { key: 't' }, c.label),
                  ]);
                }),
              ]),
            ]),
            e('div', { key: 'desc' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:var(--muted);margin-bottom:6px;font-weight:600') }, 'Descrição'),
              e('textarea', { key: 'i', className: 'field-input', value: modalForm.description, onChange: (ev) => setModalField('description', ev.target.value), placeholder: 'Finalidade da automação', rows: 2, style: sx('width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:13.5px;resize:vertical;font-family:inherit') }),
            ]),
            e('div', { key: 'test', style: sx('display:flex;align-items:center;gap:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:11px 13px') }, [
              e('button', { key: 'btn', className: 'btn-outline', onClick: testConnection, style: sx('display:flex;align-items:center;gap:7px;padding:8px 13px;background:var(--secondary);border:1px solid var(--border);color:var(--text);border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;flex-shrink:0') }, [Icon('Activity', 14), ' Testar conexão']),
              e('div', {
                key: 'state',
                style: { fontSize: 12.5, color: testState === 'online' ? 'var(--accent)' : testState === 'offline' ? 'var(--error)' : testState === 'testing' ? 'var(--warn)' : 'var(--muted-soft)', display: 'flex', alignItems: 'center', gap: 6 },
              }, [
                testState === 'testing' ? e('span', { key: 'spin', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14)) : null,
                testState === 'online' ? Icon('Activity', 14, 'var(--accent)') : null,
                testState === 'offline' ? Icon('AlertCircle', 14, 'var(--error)') : null,
                e('span', { key: 'txt' }, testState === 'idle' ? 'Ainda não testado' : testState === 'testing' ? 'Testando conexão…' : testState === 'online' ? 'Conexão bem-sucedida' : 'Falha na conexão'),
              ]),
            ]),
          ]),
          e('div', { key: 'footer', style: sx('display:flex;gap:10px;padding:16px 18px;border-top:1px solid var(--border)') }, [
            e('button', { key: 'cancel', className: 'btn-secondary', onClick: closeModal, style: sx('flex:1;padding:10px;background:transparent;border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Cancelar'),
            e('button', { key: 'save', className: 'btn-primary', onClick: saveAutomation, style: sx('flex:1;padding:10px;background:var(--primary);border:none;color:var(--primary-fg);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Salvar'),
          ]),
        ]),
      ]);
    }

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
      key: 'glpi-fab', ref: glpiFabRef, title: glpiOpen ? 'Fechar' : 'Abrir chamado no GLPI', 'aria-label': 'Abrir chamado no GLPI',
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

    let glpiBody;
    if (!glpiToken) {
      glpiBody = e('div', { key: 'setup', style: sx('display:flex;flex-direction:column;gap:12px') }, [
        e('div', { key: 'txt', style: sx('color:var(--muted);font-size:13px;line-height:1.5') }, 'Informe o token pessoal do GLPI (Configurar → Meus tokens de API). O token fica salvo somente neste navegador e não é gravado no servidor.'),
        e('input', { key: 'tok', className: 'field-input', value: glpiTokenDraft, onChange: (ev) => setGlpiTokenDraft(ev.target.value), placeholder: 'User-Token do GLPI', style: sx(selectStyle) }),
        e('button', { key: 'save', className: 'btn-primary', onClick: saveGlpiToken, style: sx('padding:10px;background:var(--primary);border:none;color:var(--primary-fg);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Salvar token'),
      ]);
    } else if (glpiLookupLoading) {
      glpiBody = e('div', { key: 'loading', style: sx('display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;padding:10px 0') }, [
        e('span', { style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)),
        'Carregando categorias e usuários do GLPI…',
      ]);
    } else if (glpiLookupError) {
      glpiBody = e('div', { key: 'error', style: sx('display:flex;flex-direction:column;gap:10px') }, [
        e('div', { style: sx('color:var(--error);font-size:13px;line-height:1.5') }, glpiLookupError),
        e('button', { className: 'btn-outline', onClick: () => loadGlpiLookup(glpiToken), style: sx('padding:9px;background:var(--secondary);border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer') }, 'Tentar novamente'),
      ]);
    } else {
      const catOptions = [e('option', { key: '', value: '' }, 'Sem categoria')].concat(
        (glpiLookup ? glpiLookup.categories : []).map((c) => e('option', { key: c.id, value: c.id }, c.label))
      );
      const users = glpiLookup ? glpiLookup.users : [];
      glpiBody = e('div', { key: 'form', style: sx('display:flex;flex-direction:column;gap:12px') }, [
        e('div', { key: 'cat' }, [
          e('div', { style: sx(fieldLabelStyle) }, 'Categoria'),
          e('select', { className: 'field-input', value: glpiForm.categoriaId, onChange: (ev) => setGlpiField('categoriaId', ev.target.value), style: sx(selectStyle) }, catOptions),
        ]),
        e('div', { key: 'req' }, [
          e('div', { style: sx(fieldLabelStyle) }, 'Requerente'),
          userCombo({
            users, selectedId: glpiForm.requerenteId, search: glpiReqSearch, open: glpiReqOpen,
            setSearch: setGlpiReqSearch, setOpen: setGlpiReqOpen, placeholder: 'Buscar pessoa…',
            onSelect: (id) => setGlpiField('requerenteId', id),
          }),
        ]),
        e('div', { key: 'assign' }, [
          e('div', { style: sx(fieldLabelStyle) }, 'Atribuído'),
          userCombo({
            users, selectedId: glpiForm.atribuidoId, search: glpiAssignSearch, open: glpiAssignOpen,
            setSearch: setGlpiAssignSearch, setOpen: setGlpiAssignOpen, placeholder: 'Buscar pessoa…',
            onSelect: (id) => setGlpiField('atribuidoId', id),
          }),
        ]),
        e('div', { key: 'titulo' }, [
          e('div', { style: sx(fieldLabelStyle) }, 'Título'),
          e('input', { className: 'field-input', value: glpiForm.titulo, onChange: (ev) => setGlpiField('titulo', ev.target.value), placeholder: 'Ex: Erro ao bloquear usuário X', style: sx(selectStyle) }),
        ]),
        e('div', { key: 'desc' }, [
          e('div', { style: sx(fieldLabelStyle) }, 'Descrição'),
          e('textarea', { className: 'field-input', value: glpiForm.descricao, onChange: (ev) => setGlpiField('descricao', ev.target.value), rows: 4, placeholder: 'Detalhes do chamado…', style: sx(selectStyle + ';resize:vertical;font-family:inherit') }),
        ]),
        e('button', {
          key: 'submit', className: 'btn-primary', disabled: glpiSubmitting, onClick: submitGlpiTicket,
          style: sx('padding:10px;background:var(--primary);border:none;color:var(--primary-fg);border-radius:8px;font-weight:600;font-size:13px;cursor:pointer'),
        }, glpiSubmitting ? 'Abrindo chamado…' : 'Abrir chamado'),
      ]);
    }

    let glpiHistoryBody;
    if (glpiHistoryLoading) {
      glpiHistoryBody = e('div', { style: sx('display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;padding:10px 0') }, [
        e('span', { style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)),
        'Carregando histórico…',
      ]);
    } else if (glpiHistoryError) {
      glpiHistoryBody = e('div', { style: sx('display:flex;flex-direction:column;gap:10px') }, [
        e('div', { style: sx('color:var(--error);font-size:13px;line-height:1.5') }, glpiHistoryError),
        e('button', { className: 'btn-outline', onClick: loadGlpiHistory, style: sx('padding:9px;background:var(--secondary);border:1px solid var(--border);color:var(--text);border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer') }, 'Tentar novamente'),
      ]);
    } else if (glpiHistory.length === 0) {
      glpiHistoryBody = e('div', { style: sx('color:var(--muted-soft);font-size:13px;text-align:center;padding:24px 0') }, 'Nenhum chamado aberto até o momento.');
    } else {
      glpiHistoryBody = e('div', { style: sx('display:flex;flex-direction:column;gap:10px') }, glpiHistory.map((t) => {
        const meta = [t.categoriaLabel, t.requerenteLabel ? 'Requerente: ' + t.requerenteLabel : null, t.atribuidoLabel ? 'Atribuído: ' + t.atribuidoLabel : null].filter(Boolean).join(' · ');
        return e('div', { key: t.id, style: sx('background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px') }, [
          e('div', { key: 'row', style: sx('display:flex;align-items:center;justify-content:space-between;gap:8px') }, [
            t.url
              ? e('a', { key: 'num', href: t.url, target: '_blank', rel: 'noopener noreferrer', style: sx('color:var(--accent);font-weight:600;font-size:13px;text-decoration:underline') }, '#' + t.ticketId)
              : e('span', { key: 'num', style: { fontWeight: 700, fontSize: 13 } }, '#' + t.ticketId),
            e('span', { key: 'date', style: sx("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted-soft);flex-shrink:0") }, new Date(t.createdAt).toLocaleString('pt-BR')),
          ]),
          e('div', { key: 'title', style: sx('font-size:12.5px;margin-top:4px;color:var(--text)') }, t.titulo),
          meta ? e('div', { key: 'meta', style: sx('font-size:11px;color:var(--muted);margin-top:4px') }, meta) : null,
        ]);
      }));
    }

    const glpiModal = glpiOpen ? e('div', {
      ref: glpiPanelRef,
      style: sx('position:fixed;bottom:76px;left:20px;z-index:76;width:340px;max-width:calc(100vw - 40px);max-height:70vh;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 20px 50px -12px rgba(0,0,0,0.16);animation:chatPop 0.15s ease both'),
    }, [
      e('div', { key: 'head', style: sx('display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid var(--border)') }, [
        glpiView === 'history'
          ? e('button', { key: 'back', onClick: backToGlpiForm, className: 'icon-btn', style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('ArrowLeft', 16))
          : e('span', { key: 'ico', className: 'glpi-head-icon' }, Icon('Headset', 16, 'currentColor')),
        e('div', { key: 't', style: sx("font-weight:600;font-size:14.5px;flex:1") }, glpiView === 'history' ? 'Histórico de chamados' : 'Abrir chamado GLPI'),
        glpiView === 'form' ? e('button', { key: 'hist', title: 'Ver histórico', onClick: openGlpiHistory, className: 'icon-btn', style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('FileText', 15)) : null,
        glpiToken ? e('button', { key: 'forget', onClick: forgetGlpiToken, style: sx('background:none;border:none;color:var(--muted-soft);font-size:11px;cursor:pointer;padding:0;margin-right:4px') }, 'Remover token') : null,
        e('button', { key: 'x', className: 'icon-btn', onClick: closeGlpiWidget, style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--muted);cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('X', 13)),
      ]),
      e('div', { key: 'body', style: sx('padding:16px') }, glpiView === 'history' ? glpiHistoryBody : glpiBody),
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
