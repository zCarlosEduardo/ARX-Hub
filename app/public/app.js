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
    online: { color: '#6DBE6A', label: 'Online' },
    offline: { color: '#F5514D', label: 'Offline' },
    checking: { color: '#F5A524', label: 'Verificando' },
  };
  const TOAST_META = {
    success: { color: '#6DBE6A', icon: 'Activity' },
    error: { color: '#F5514D', icon: 'AlertCircle' },
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

    useEffect(() => {
      const onKeydown = (ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (mod && ev.key.toLowerCase() === 'k') {
          ev.preventDefault();
          if (searchRef.current) searchRef.current.focus();
          return;
        }
        if (ev.key === 'Escape') {
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
    }, []);

    useEffect(() => {
      try {
        const saved = localStorage.getItem(GLPI_TOKEN_STORAGE_KEY);
        if (saved) setGlpiToken(saved);
      } catch (err) {
        // localStorage indisponível (modo privado, etc.) — segue sem token salvo
      }
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
      try {
        localStorage.setItem(GLPI_TOKEN_STORAGE_KEY, value);
      } catch (err) {
        // segue mesmo se não conseguir persistir — vale só para esta sessão
      }
      setGlpiToken(value);
      setGlpiTokenDraft('');
      loadGlpiLookup(value);
    }

    function forgetGlpiToken() {
      try {
        localStorage.removeItem(GLPI_TOKEN_STORAGE_KEY);
      } catch (err) {}
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
        message: 'Tem certeza que deseja remover "' + (a ? a.name : 'esta automação') + '"? Essa ação não pode ser desfeita.',
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
    const healthDotColor = offline > 0 ? '#F5A524' : '#6DBE6A';

    function closeMenus() {
      setMenuOpenId((id) => (id ? null : id));
      setViewerMenuOpen(false);
    }

    // ---- single unified nav bar (logo + panel/tabs + search + health + add) ----
    const navScroll = e('div', { key: 'nav', className: 'nav-scroll', style: sx('display:flex;align-items:stretch;gap:2px;overflow-x:auto;min-width:0') }, [
      e('button', {
        key: 'panel', className: 'panel-tab', onClick: () => setActiveTabId(null),
        style: sx('display:flex;align-items:center;gap:7px;padding:8px 12px;background:transparent;border:none;border-bottom:2px solid ' + (activeTabId === null ? '#6DBE6A' : 'transparent') + ';color:' + (activeTabId === null ? '#EDEDED' : '#888') + ';font-size:13px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap'),
      }, [Icon('LayoutDashboard', 13), e('span', { key: 't' }, 'Painel')]),
      ...openTabs.map((id) => {
        const a = automations.find((x) => x.id === id);
        if (!a) return null;
        const active = activeTabId === id;
        return e('div', {
          key: id, className: 'tab-item', onClick: () => switchTab(id),
          style: sx('display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:2px solid ' + (active ? '#6DBE6A' : 'transparent') + ';color:' + (active ? '#EDEDED' : '#888') + ';font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0'),
        }, [
          e('span', { key: 'dot', style: { width: 6, height: 6, borderRadius: '50%', background: STATUS_META[a.status].color, flexShrink: 0 } }),
          Icon(a.icon, 13, a.color),
          e('span', { key: 'name', style: sx('max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap') }, a.name),
          e('span', {
            key: 'close', className: 'tab-close', onClick: (ev) => { ev.stopPropagation(); closeTab(id); },
            style: sx('display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;color:#666;flex-shrink:0'),
          }, Icon('X', 13)),
        ]);
      }),
    ]);

    const header = e('div', { style: sx('display:flex;align-items:center;gap:14px;padding:0 20px;height:56px;flex-shrink:0;background:#111111;border-bottom:1px solid #262626;z-index:10') }, [
      e('div', { key: 'left', style: sx('display:flex;align-items:center;gap:14px;min-width:0;flex-shrink:1;overflow:hidden') }, [
        e('img', { key: 'logo', src: 'assets/arx-logo.png', alt: 'ARX Administradora', style: sx('height:22px;width:auto;object-fit:contain;flex-shrink:0') }),
        e('div', { key: 'sep', style: sx('width:1px;height:22px;background:#262626;flex-shrink:0') }),
        navScroll,
      ]),
      e('div', { key: 'spacer', style: { flex: 1, minWidth: 20 } }),
      e('div', { key: 'right', style: sx('display:flex;align-items:center;gap:16px;flex-shrink:0') }, [
        e('div', { key: 'search', className: 'search-box', style: sx('display:flex;align-items:center;gap:8px;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:7px 12px;flex-shrink:0;width:220px') }, [
          Icon('Search', 15, '#666'),
          e('input', {
            key: 'input', ref: searchRef, value: search, onChange: (ev) => setSearch(ev.target.value),
            placeholder: 'Buscar…',
            style: sx('flex:1;min-width:0;background:transparent;border:none;outline:none;color:#EDEDED;font-size:13.5px'),
          }),
          e('span', { key: 'kbd', style: sx("font-family:'JetBrains Mono',monospace;font-size:10.5px;background:#1a1a1a;border:1px solid #262626;border-radius:5px;padding:2px 5px;color:#666;flex-shrink:0") }, 'Ctrl K'),
        ]),
        e('div', { key: 'health', style: sx('display:flex;align-items:center;gap:7px;color:#888;font-size:12.5px;flex-shrink:0') }, [
          e('span', { key: 'dot', className: 'pulse-dot', style: { position: 'relative', width: 7, height: 7, borderRadius: '50%', background: healthDotColor, color: healthDotColor } }),
          e('span', { key: 'label' }, online + '/' + total + ' online'),
        ]),
        e('button', {
          key: 'new', className: 'btn-primary', onClick: openNewModal, title: 'Nova automação',
          style: sx('display:flex;align-items:center;gap:6px;padding:8px 14px;background:#6DBE6A;color:#0A0A0A;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0'),
        }, [Icon('Plus', 16, '#0A0A0A', 2.25), e('span', { key: 't' }, 'Nova automação')]),
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
        style: { position: 'relative', background: '#111111', border: '1px solid #262626', borderRadius: 12, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeInUp 0.3s ease both', animationDelay: Math.min(i, 10) * 35 + 'ms' },
      }, [
        e('div', { key: 'top', style: sx('display:flex;align-items:flex-start;justify-content:space-between') }, [
          e('div', { key: 'icon', style: { width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color + '22', color: a.color } }, Icon(a.icon, 19, a.color)),
          e('div', { key: 'actions', style: sx('display:flex;align-items:center;gap:2px') }, [
            e('span', { key: 'dot', className: isPulsing ? 'pulse-dot' : '', style: { position: 'relative', width: 8, height: 8, borderRadius: '50%', background: meta.color, color: meta.color, marginTop: 6, marginRight: 4 } }),
            e('button', {
              key: 'menu', className: 'icon-btn', onClick: (ev) => { ev.stopPropagation(); setMenuOpenId(menuOpen ? null : a.id); },
              style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#888;border-radius:6px;cursor:pointer'),
            }, Icon('MoreHorizontal', 17)),
          ]),
        ]),
        e('div', { key: 'info' }, [
          cats.length ? e('div', { key: 'cats', style: sx('display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px') }, cats.map((c) => e('span', {
            key: c.key,
            style: sx('display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:10.5px;font-weight:700;background:' + c.color + '22;color:' + c.color),
          }, c.label))) : null,
          e('div', { key: 'name', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:14px") }, a.name),
          e('div', { key: 'desc', style: sx('color:#888;font-size:12.5px;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden') }, a.description),
        ]),
        e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#666") }, urlShort),
        e('button', {
          key: 'open', className: 'card-open-btn', onClick: (ev) => { ev.stopPropagation(); openAutomation(a.id); },
          style: sx('padding:8px;background:#1a1a1a;border:1px solid #262626;color:#EDEDED;border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer;margin-top:2px'),
        }, 'Abrir'),
        menuOpen ? e('div', {
          key: 'popover', onClick: (ev) => ev.stopPropagation(),
          style: sx('position:absolute;top:44px;right:10px;background:#171717;border:1px solid #262626;border-radius:10px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.6);z-index:5;overflow:hidden;min-width:170px'),
        }, [
          e('button', { key: 'edit', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); openEditModal(a); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:#EDEDED;font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Pencil', 14), ' Editar']),
          e('button', { key: 'newtab', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); window.open(a.url, '_blank'); setMenuOpenId(null); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:#EDEDED;font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          e('button', { key: 'copy', className: 'menu-item', onClick: (ev) => { ev.stopPropagation(); copyUrl(a.url); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:#EDEDED;font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Copy', 14), ' Copiar URL']),
          e('div', { key: 'sep', style: { height: 1, background: '#262626' } }),
          e('button', { key: 'del', className: 'menu-item-danger', onClick: (ev) => { ev.stopPropagation(); deleteAutomation(a.id); }, style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:#F5514D;font-size:12.5px;cursor:pointer;text-align:left') }, [Icon('Trash2', 14), ' Remover']),
        ]) : null,
      ]);
    }

    const panelBody = e('div', { style: sx('padding:28px 24px;max-width:1200px;margin:0 auto') }, [
      e('div', { key: 'head', style: sx('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px') }, [
        e('div', { key: 't', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:19px") }, 'Automações'),
        e('div', { key: 's', style: { color: '#666', fontSize: 12.5 } }, total + ' automações · ' + online + ' online · ' + offline + ' offline'),
      ]),
      !automationsLoaded
        ? e('div', { key: 'loading', style: sx('display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:60px 20px;color:#666') }, [
            e('div', { key: 'spin', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 26, '#6DBE6A')),
            e('div', { key: 't', style: { fontSize: 13.5 } }, 'Carregando automações…'),
          ])
        : visible.length > 0
        ? e('div', { key: 'grid', style: sx('display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px') }, visible.map(buildCard))
        : e('div', { key: 'empty', style: sx('display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:#666;text-align:center') }, [
            Icon('Inbox', 34, '#666', 1.3),
            e('div', { key: 't', style: { fontSize: 14 } }, q ? 'Nenhuma automação encontrada' : 'Adicione sua primeira automação'),
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
        style: sx('display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:transparent;border:none;color:' + (danger ? '#F5514D' : '#EDEDED') + ';font-size:12.5px;cursor:pointer;text-align:left'),
      }, [Icon(icon, 14, danger ? '#F5514D' : '#EDEDED'), ' ' + label]);

      return e('div', {
        key: 'viewer-' + a.id, ref: isActive ? viewerRef : undefined,
        style: { height: '100%', position: 'relative', background: '#0A0A0A', display: isActive ? 'block' : 'none' },
      }, [
        e('button', {
          key: 'fab', title: 'Opções', onClick: (ev) => { ev.stopPropagation(); setViewerMenuOpen((v) => !v); },
          style: sx('position:absolute;top:14px;right:14px;z-index:20;width:38px;height:38px;border-radius:10px;background:#111111;border:1px solid #262626;display:flex;align-items:center;justify-content:center;color:#EDEDED;cursor:pointer;box-shadow:0 8px 20px -6px rgba(0,0,0,0.6)'),
        }, Icon('MoreHorizontal', 18)),
        (isActive && viewerMenuOpen) ? e('div', {
          key: 'fab-menu', onClick: (ev) => ev.stopPropagation(),
          style: sx('position:absolute;top:58px;right:14px;z-index:20;background:#171717;border:1px solid #262626;border-radius:10px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.6);min-width:230px;overflow:hidden'),
        }, [
          e('div', { key: 'info', style: sx('padding:12px 14px;border-bottom:1px solid #262626') }, [
            e('div', { key: 'name', style: sx("display:flex;align-items:center;gap:7px;font-family:'Sora',sans-serif;font-weight:700;font-size:13px") }, [
              e('span', { key: 'dot', className: a.status !== 'offline' ? 'pulse-dot' : '', style: { position: 'relative', width: 6, height: 6, borderRadius: '50%', background: STATUS_META[a.status].color, color: STATUS_META[a.status].color, flexShrink: 0 } }),
              e('span', { key: 't', style: sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap') }, a.name),
            ]),
            e('div', { key: 'url', style: sx("font-family:'JetBrains Mono',monospace;font-size:11px;color:#666;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap") }, a.url),
          ]),
          fabItem('reload', 'RefreshCw', 'Recarregar', () => startViewerLoad(a.id)),
          fabItem('ext', 'ExternalLink', 'Abrir em nova aba', () => window.open(a.url, '_blank')),
          fabItem('full', 'Maximize2', 'Tela cheia', toggleFullscreen),
          e('div', { key: 'sep', style: { height: 1, background: '#262626' } }),
          fabItem('close', 'X', 'Fechar aba', () => closeTab(a.id), true),
        ]) : null,
        state === 'loading' ? e('div', { key: 'loading', style: sx('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0A0A0A') }, [
          e('div', { key: 'spin', style: { width: 48, height: 48, borderRadius: 12, background: '#6DBE6A', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'spin 1.4s linear infinite', color: '#0A0A0A' } }, Icon('Loader2', 22, '#0A0A0A')),
          e('div', { key: 't', style: { color: '#888', fontSize: 13.5 } }, 'Carregando automação…'),
          e('div', { key: 'bar', style: sx('width:220px;height:6px;border-radius:3px;background:linear-gradient(90deg,#111111 25%,#262626 50%,#111111 75%);background-size:200% 100%;animation:shimmer 1.3s linear infinite') }),
        ]) : null,
        state === 'error' ? e('div', { key: 'error', style: sx('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px') }, [
          e('div', { key: 'i', style: sx('width:54px;height:54px;border-radius:14px;background:#F5514D1a;display:flex;align-items:center;justify-content:center;color:#F5514D') }, Icon('WifiOff', 26)),
          e('div', { key: 't', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:16px;max-width:420px") }, isOffline ? 'Este container está offline' : 'Não foi possível carregar esta automação dentro do painel'),
          e('div', { key: 'd', style: sx('color:#888;font-size:13.5px;max-width:420px;line-height:1.5') }, isOffline
            ? 'O container "' + a.container + '" não está respondendo. Verifique se ele está em execução.'
            : 'O serviço pode estar bloqueando exibição em iframe (X-Frame-Options / CSP) ou estar fora do alcance desta rede.'),
          e('div', { key: 'actions', style: sx('display:flex;gap:10px;margin-top:6px') }, [
            e('button', { key: 'retry', className: 'btn-primary', onClick: () => startViewerLoad(a.id), style: sx('display:flex;align-items:center;gap:7px;padding:10px 16px;background:#6DBE6A;color:#0A0A0A;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer') }, [Icon('RefreshCw', 14), ' Tentar novamente']),
            e('button', { key: 'ext', className: 'btn-outline', onClick: () => window.open(a.url, '_blank'), style: sx('display:flex;align-items:center;gap:7px;padding:10px 16px;background:#1a1a1a;color:#EDEDED;border:1px solid #262626;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, [Icon('ExternalLink', 14), ' Abrir em nova aba']),
          ]),
        ]) : null,
        e('iframe', {
          key: 'frame-' + a.id + '-' + (viewerNonce.current[a.id] || 0),
          src: a.url, title: a.name,
          onLoad: () => onIframeLoad(a.id),
          style: Object.assign({ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }, state === 'loaded' ? {} : { visibility: 'hidden' }),
        }),
      ]);
    }

    const viewerNodes = openTabs.map((id) => automations.find((a) => a.id === id)).filter(Boolean).map(buildViewerFor);

    // ---- modal ----
    let modal = null;
    if (modalOpen && modalForm) {
      modal = e('div', { onClick: closeModal, style: sx('position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(3px);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px') }, [
        e('div', { key: 'box', onClick: (ev) => ev.stopPropagation(), style: sx('width:100%;max-width:480px;max-height:88vh;overflow-y:auto;background:#111111;border:1px solid #262626;border-radius:14px;box-shadow:0 24px 60px -12px rgba(0,0,0,0.7);animation:modalIn 0.15s ease both') }, [
          e('div', { key: 'head', style: sx('display:flex;align-items:center;padding:16px 18px;border-bottom:1px solid #262626') }, [
            e('div', { key: 't', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:15.5px;flex:1") }, modalMode === 'new' ? 'Nova automação' : 'Editar automação'),
            e('button', { key: 'x', className: 'icon-btn', onClick: closeModal, style: sx('width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#888;cursor:pointer;border-radius:7px') }, Icon('X', 13)),
          ]),
          e('div', { key: 'body', style: sx('padding:18px;display:flex;flex-direction:column;gap:14px') }, [
            e('div', { key: 'name' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:6px;font-weight:600') }, 'Nome'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.name, onChange: (ev) => setModalField('name', ev.target.value), placeholder: 'Ex: Emissão de Boletos', style: sx('width:100%;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px;color:#EDEDED;font-size:13.5px') }),
            ]),
            e('div', { key: 'url' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:6px;font-weight:600') }, 'URL (IP:porta)'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.url, onChange: (ev) => setModalField('url', ev.target.value), placeholder: 'http://192.168.0.10:8081', style: sx("width:100%;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px;color:#EDEDED;font-size:13.5px;font-family:'JetBrains Mono',monospace") }),
            ]),
            e('div', { key: 'container' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:6px;font-weight:600') }, 'Container Docker (opcional)'),
              e('input', { key: 'i', className: 'field-input', value: modalForm.container, onChange: (ev) => setModalField('container', ev.target.value), placeholder: 'boletos-service', style: sx("width:100%;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px;color:#EDEDED;font-size:13.5px;font-family:'JetBrains Mono',monospace") }),
            ]),
            e('div', { key: 'icon' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:8px;font-weight:600') }, 'Ícone'),
              e('div', { key: 'grid', style: sx('display:grid;grid-template-columns:repeat(5,1fr);gap:8px') }, ICON_CHOICES.map((name) => {
                const selected = modalForm.icon === name;
                return e('button', {
                  key: name, className: 'icon-choice', onClick: () => setModalField('icon', name),
                  style: { aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: selected ? '#6DBE6A' : '#0A0A0A', border: '1px solid ' + (selected ? '#6DBE6A' : '#262626') },
                }, Icon(name, 18, selected ? '#0A0A0A' : '#EDEDED'));
              })),
            ]),
            e('div', { key: 'color' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:8px;font-weight:600') }, 'Cor'),
              e('div', { key: 'row', style: sx('display:flex;gap:10px') }, COLOR_CHOICES.map((c) => {
                const selected = modalForm.color === c;
                return e('button', {
                  key: c, onClick: () => setModalField('color', c),
                  style: { width: 30, height: 30, borderRadius: '50%', background: c, border: '2px solid ' + (selected ? '#EDEDED' : 'transparent'), cursor: 'pointer', boxShadow: '0 0 0 1px #262626' },
                });
              })),
            ]),
            e('div', { key: 'category' }, [
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:8px;font-weight:600') }, 'Sistema (pode marcar mais de um)'),
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
              e('div', { key: 'l', style: sx('font-size:11.5px;color:#888;margin-bottom:6px;font-weight:600') }, 'Descrição'),
              e('textarea', { key: 'i', className: 'field-input', value: modalForm.description, onChange: (ev) => setModalField('description', ev.target.value), placeholder: 'O que essa automação faz?', rows: 2, style: sx('width:100%;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px;color:#EDEDED;font-size:13.5px;resize:vertical;font-family:inherit') }),
            ]),
            e('div', { key: 'test', style: sx('display:flex;align-items:center;gap:12px;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:11px 13px') }, [
              e('button', { key: 'btn', className: 'btn-outline', onClick: testConnection, style: sx('display:flex;align-items:center;gap:7px;padding:8px 13px;background:#1a1a1a;border:1px solid #262626;color:#EDEDED;border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;flex-shrink:0') }, [Icon('Activity', 14), ' Testar conexão']),
              e('div', {
                key: 'state',
                style: { fontSize: 12.5, color: testState === 'online' ? '#6DBE6A' : testState === 'offline' ? '#F5514D' : testState === 'testing' ? '#F5A524' : '#666', display: 'flex', alignItems: 'center', gap: 6 },
              }, [
                testState === 'testing' ? e('span', { key: 'spin', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14)) : null,
                testState === 'online' ? Icon('Activity', 14, '#6DBE6A') : null,
                testState === 'offline' ? Icon('AlertCircle', 14, '#F5514D') : null,
                e('span', { key: 'txt' }, testState === 'idle' ? 'Ainda não testado' : testState === 'testing' ? 'Testando conexão…' : testState === 'online' ? 'Conexão bem-sucedida' : 'Falha na conexão'),
              ]),
            ]),
          ]),
          e('div', { key: 'footer', style: sx('display:flex;gap:10px;padding:16px 18px;border-top:1px solid #262626') }, [
            e('button', { key: 'cancel', className: 'btn-secondary', onClick: closeModal, style: sx('flex:1;padding:10px;background:transparent;border:1px solid #262626;color:#EDEDED;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Cancelar'),
            e('button', { key: 'save', className: 'btn-primary', onClick: saveAutomation, style: sx('flex:1;padding:10px;background:#6DBE6A;border:none;color:#0A0A0A;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer') }, 'Salvar'),
          ]),
        ]),
      ]);
    }

    // ---- confirm dialog ----
    let confirmModal = null;
    if (confirmDialog) {
      confirmModal = e('div', { onClick: () => setConfirmDialog(null), style: sx('position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(3px);z-index:70;display:flex;align-items:center;justify-content:center;padding:16px') }, [
        e('div', { key: 'box', onClick: (ev) => ev.stopPropagation(), style: sx('width:100%;max-width:380px;background:#111111;border:1px solid #262626;border-radius:14px;box-shadow:0 24px 60px -12px rgba(0,0,0,0.7);animation:modalIn 0.15s ease both;padding:20px') }, [
          e('div', { key: 't', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:15px;margin-bottom:8px") }, confirmDialog.title),
          e('div', { key: 'm', style: sx('color:#999;font-size:13px;line-height:1.5;margin-bottom:18px') }, confirmDialog.message),
          e('div', { key: 'actions', style: sx('display:flex;gap:10px') }, [
            e('button', { key: 'cancel', className: 'btn-secondary', onClick: () => setConfirmDialog(null), style: sx('flex:1;padding:10px;background:transparent;border:1px solid #262626;color:#EDEDED;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer') }, 'Cancelar'),
            e('button', {
              key: 'confirm', className: confirmDialog.danger ? 'btn-danger' : 'btn-primary', onClick: confirmDialog.onConfirm,
              style: { flex: 1, padding: 10, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: confirmDialog.danger ? '#F5514D' : '#6DBE6A', color: confirmDialog.danger ? '#fff' : '#0A0A0A' },
            }, confirmDialog.confirmLabel || 'Confirmar'),
          ]),
        ]),
      ]);
    }

    // ---- GLPI quick-ticket floating button + widget (Messenger-style popup: no backdrop, opens/closes over the corner) ----
    const selectStyle = 'width:100%;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px;color:#EDEDED;font-size:13.5px';
    const fieldLabelStyle = 'font-size:11.5px;color:#888;margin-bottom:6px;font-weight:600';

    const glpiFab = e('button', {
      key: 'glpi-fab', ref: glpiFabRef, title: 'Abrir chamado no GLPI', onClick: toggleGlpiWidget,
      style: sx('position:fixed;bottom:20px;left:20px;z-index:75;width:46px;height:46px;border-radius:50%;background:#1E4A9E;border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px -6px rgba(0,0,0,0.6)'),
    }, Icon('LifeBuoy', 21, '#fff'));

    // Combobox com busca embutida — usado pra Requerente e Atribuído, já que a
    // lista de usuários do GLPI pode ser grande demais pra um <select> comum.
    function userCombo({ users, selectedId, search, open, setSearch, setOpen, placeholder, onSelect }) {
      const selected = users.find((u) => String(u.id) === String(selectedId));
      const q = search.trim().toLowerCase();
      const filtered = q ? users.filter((u) => u.label.toLowerCase().includes(q)) : users;
      return e('div', { style: { position: 'relative' } }, [
        e('div', { key: 'row', style: sx('display:flex;align-items:center;gap:6px;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:9px 11px') }, [
          Icon('Search', 14, '#666'),
          e('input', {
            key: 'inp',
            value: open ? search : (selected ? selected.label : ''),
            onFocus: () => { setOpen(true); setSearch(''); },
            onBlur: () => setTimeout(() => setOpen(false), 150),
            onChange: (ev) => setSearch(ev.target.value),
            placeholder,
            style: sx('flex:1;min-width:0;background:transparent;border:none;outline:none;color:#EDEDED;font-size:13.5px'),
          }),
          selected ? e('span', {
            key: 'clear', onMouseDown: (ev) => ev.preventDefault(), onClick: () => { onSelect(''); setSearch(''); },
            style: sx('cursor:pointer;color:#666;display:flex'),
          }, Icon('X', 13)) : null,
        ]),
        open ? e('div', { key: 'list', style: sx('position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:180px;overflow-y:auto;background:#171717;border:1px solid #262626;border-radius:8px;box-shadow:0 12px 30px -8px rgba(0,0,0,0.6);z-index:5') },
          filtered.length
            ? filtered.slice(0, 50).map((u) => e('button', {
                key: u.id, className: 'menu-item', onMouseDown: (ev) => ev.preventDefault(), onClick: () => { onSelect(u.id); setSearch(''); setOpen(false); },
                style: sx('display:block;width:100%;padding:8px 12px;background:transparent;border:none;color:#EDEDED;font-size:12.5px;cursor:pointer;text-align:left'),
              }, u.label))
            : [e('div', { key: 'empty', style: sx('padding:9px 12px;color:#666;font-size:12.5px') }, 'Nenhum resultado')]
        ) : null,
      ]);
    }

    let glpiBody;
    if (!glpiToken) {
      glpiBody = e('div', { key: 'setup', style: sx('display:flex;flex-direction:column;gap:12px') }, [
        e('div', { key: 'txt', style: sx('color:#999;font-size:13px;line-height:1.5') }, 'Cole seu token pessoal do GLPI (Configurar → Meus tokens de API). Ele fica salvo só neste navegador, nunca é enviado a mais ninguém.'),
        e('input', { key: 'tok', className: 'field-input', value: glpiTokenDraft, onChange: (ev) => setGlpiTokenDraft(ev.target.value), placeholder: 'Seu User-Token do GLPI', style: sx(selectStyle) }),
        e('button', { key: 'save', className: 'btn-primary', onClick: saveGlpiToken, style: sx('padding:10px;background:#6DBE6A;border:none;color:#0A0A0A;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer') }, 'Salvar token'),
      ]);
    } else if (glpiLookupLoading) {
      glpiBody = e('div', { key: 'loading', style: sx('display:flex;align-items:center;gap:10px;color:#888;font-size:13px;padding:10px 0') }, [
        e('span', { style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)),
        'Carregando categorias e usuários do GLPI…',
      ]);
    } else if (glpiLookupError) {
      glpiBody = e('div', { key: 'error', style: sx('display:flex;flex-direction:column;gap:10px') }, [
        e('div', { style: sx('color:#F5514D;font-size:13px;line-height:1.5') }, glpiLookupError),
        e('button', { className: 'btn-outline', onClick: () => loadGlpiLookup(glpiToken), style: sx('padding:9px;background:#1a1a1a;border:1px solid #262626;color:#EDEDED;border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer') }, 'Tentar novamente'),
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
          style: sx('padding:10px;background:#6DBE6A;border:none;color:#0A0A0A;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer'),
        }, glpiSubmitting ? 'Abrindo chamado…' : 'Abrir chamado'),
      ]);
    }

    let glpiHistoryBody;
    if (glpiHistoryLoading) {
      glpiHistoryBody = e('div', { style: sx('display:flex;align-items:center;gap:10px;color:#888;font-size:13px;padding:10px 0') }, [
        e('span', { style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16)),
        'Carregando histórico…',
      ]);
    } else if (glpiHistoryError) {
      glpiHistoryBody = e('div', { style: sx('display:flex;flex-direction:column;gap:10px') }, [
        e('div', { style: sx('color:#F5514D;font-size:13px;line-height:1.5') }, glpiHistoryError),
        e('button', { className: 'btn-outline', onClick: loadGlpiHistory, style: sx('padding:9px;background:#1a1a1a;border:1px solid #262626;color:#EDEDED;border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer') }, 'Tentar novamente'),
      ]);
    } else if (glpiHistory.length === 0) {
      glpiHistoryBody = e('div', { style: sx('color:#666;font-size:13px;text-align:center;padding:24px 0') }, 'Nenhum chamado aberto por aqui ainda.');
    } else {
      glpiHistoryBody = e('div', { style: sx('display:flex;flex-direction:column;gap:10px') }, glpiHistory.map((t) => {
        const meta = [t.categoriaLabel, t.requerenteLabel ? 'Req: ' + t.requerenteLabel : null, t.atribuidoLabel ? 'Atrib: ' + t.atribuidoLabel : null].filter(Boolean).join(' · ');
        return e('div', { key: t.id, style: sx('background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:10px 12px') }, [
          e('div', { key: 'row', style: sx('display:flex;align-items:center;justify-content:space-between;gap:8px') }, [
            t.url
              ? e('a', { key: 'num', href: t.url, target: '_blank', rel: 'noopener noreferrer', style: sx('color:#6DBE6A;font-weight:700;font-size:13px;text-decoration:underline') }, '#' + t.ticketId)
              : e('span', { key: 'num', style: { fontWeight: 700, fontSize: 13 } }, '#' + t.ticketId),
            e('span', { key: 'date', style: sx("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#666;flex-shrink:0") }, new Date(t.createdAt).toLocaleString('pt-BR')),
          ]),
          e('div', { key: 'title', style: sx('font-size:12.5px;margin-top:4px;color:#EDEDED') }, t.titulo),
          meta ? e('div', { key: 'meta', style: sx('font-size:11px;color:#888;margin-top:4px') }, meta) : null,
        ]);
      }));
    }

    const glpiModal = glpiOpen ? e('div', {
      ref: glpiPanelRef,
      style: sx('position:fixed;bottom:76px;left:20px;z-index:76;width:340px;max-width:calc(100vw - 40px);max-height:70vh;overflow-y:auto;background:#111111;border:1px solid #262626;border-radius:14px;box-shadow:0 20px 50px -12px rgba(0,0,0,0.7);animation:chatPop 0.15s ease both'),
    }, [
      e('div', { key: 'head', style: sx('display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid #262626') }, [
        glpiView === 'history'
          ? e('button', { key: 'back', onClick: backToGlpiForm, className: 'icon-btn', style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#888;cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('ArrowLeft', 16))
          : Icon('LifeBuoy', 17, '#1E4A9E'),
        e('div', { key: 't', style: sx("font-family:'Sora',sans-serif;font-weight:700;font-size:14.5px;flex:1") }, glpiView === 'history' ? 'Histórico de chamados' : 'Abrir chamado GLPI'),
        glpiView === 'form' ? e('button', { key: 'hist', title: 'Ver histórico', onClick: openGlpiHistory, className: 'icon-btn', style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#888;cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('FileText', 15)) : null,
        glpiToken ? e('button', { key: 'forget', onClick: forgetGlpiToken, style: sx('background:none;border:none;color:#666;font-size:11px;cursor:pointer;padding:0;margin-right:4px') }, 'Esquecer token') : null,
        e('button', { key: 'x', className: 'icon-btn', onClick: closeGlpiWidget, style: sx('width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#888;cursor:pointer;border-radius:7px;flex-shrink:0') }, Icon('X', 13)),
      ]),
      e('div', { key: 'body', style: sx('padding:16px') }, glpiView === 'history' ? glpiHistoryBody : glpiBody),
    ]) : null;

    // ---- toasts ----
    const toastEl = e('div', { style: sx('position:fixed;bottom:20px;right:20px;z-index:80;display:flex;flex-direction:column;gap:10px;max-width:340px') },
      toasts.map((t) => {
        const meta = TOAST_META[t.type] || TOAST_META.info;
        return e('div', {
          key: t.id,
          style: { display: 'flex', alignItems: 'center', gap: 10, background: '#111111', border: '1px solid #262626', borderLeft: '3px solid ' + meta.color, borderRadius: 9, padding: '12px 14px', boxShadow: '0 12px 30px -8px rgba(0,0,0,0.6)', animation: 'toastIn 0.2s ease both' },
        }, [
          Icon(meta.icon, 16, meta.color),
          e('span', { key: 'm', style: { fontSize: 13 } }, t.message),
          t.link ? e('a', {
            key: 'link', href: t.link.url, target: '_blank', rel: 'noopener noreferrer',
            style: sx('margin-left:6px;color:#6DBE6A;font-weight:700;text-decoration:underline;cursor:pointer'),
          }, t.link.label) : null,
        ]);
      })
    );

    return e('div', { style: sx("height:100vh;width:100%;display:flex;flex-direction:column;background:#0A0A0A;color:#EDEDED;font-family:'Inter',sans-serif;overflow:hidden") }, [
      header,
      e('div', { key: 'main', style: sx('flex:1;position:relative;overflow:hidden'), onClick: closeMenus }, [
        e('div', { key: 'panel', style: { display: activeTabId === null ? 'block' : 'none', height: '100%', overflowY: 'auto' } }, panelBody),
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
