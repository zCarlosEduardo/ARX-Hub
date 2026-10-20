// Painel de administração do Hub. O botão "Administração" só aparece para quem é administrador: o Hub não tem login próprio,
// a pessoa é identificada pelo token do GLPI (guardado no cofre dos acessos) e a lista de admins fica no servidor.
//
// Abas: Cofre (ativar ou desativar a senha mestra e escolher quanto tempo fica liberada), Administradores (quem pode abrir
// este painel), Automações (ordem em que aparecem) e WhatsApp (grupos, número que responde e tipos de solicitação).
// Expõe window.AdminAba (aba do cabeçalho, só para administradores) e window.AdminView (a tela, como Chamados e Resultados).
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Icon } = window.Icons;
  const hub = () => window.ArxAcessosHub;
  const tokenAtual = () => ((hub() && hub().ler()) || {}).userToken || '';

  /** Chamada autenticada: o token do GLPI vai no cabeçalho; o servidor decide se a pessoa é admin. */
  async function api(metodo, caminho, corpo) {
    const resp = await fetch(caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': tokenAtual() },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = resp.status === 204 ? null : await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((dados && dados.error) || `Falha (${resp.status}).`);
    return dados;
  }

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const proximoId = (prefixo, lista) => {
    let n = lista.length + 1;
    while (lista.some((x) => x.id === prefixo + n)) n += 1;
    return prefixo + n;
  };

  // ---------- peças de tela ----------
  const ui = () => hub().ui;
  const S = () => ui().S;
  const rotulo = (texto) => e('div', { style: S().label }, texto);
  const dica = (texto) => e('div', { style: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 } }, texto);
  const caixa = (marcado, onChange, texto, extra = {}) =>
    e('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', ...extra } }, [
      e('input', { key: 'c', type: 'checkbox', checked: !!marcado, onChange: (ev) => onChange(ev.target.checked) }),
      e('span', { key: 't' }, texto),
    ]);
  const selecao = (valor, onChange, opcoes, extra = {}) =>
    e('select', { value: valor, onChange: (ev) => onChange(ev.target.value), style: { ...S().input, ...extra } }, opcoes.map(([v, t]) => e('option', { key: v, value: v }, t)));
  const botao = (texto, onClick, tipo = 'sec', extra = {}) =>
    e('button', { type: 'button', className: tipo === 'prim' ? 'btn-primary' : 'btn-outline', style: { ...(tipo === 'prim' ? S().btnPrim : S().btnSec), ...extra }, onClick, disabled: extra.disabled }, texto);
  const rodape = (salvar, salvando, erro, ok) =>
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
      erro ? e('div', { key: 'e', className: 'admin-erro', style: { color: 'var(--error)', fontSize: 12.5 } }, erro) : null,
      ok ? e('div', { key: 'o', className: 'admin-ok', style: { color: 'var(--success, #16a34a)', fontSize: 12.5 } }, 'Salvo.') : null,
      botao(salvando ? 'Salvando…' : 'Salvar', salvar, 'prim', { alignSelf: 'flex-start', opacity: salvando ? 0.7 : 1, disabled: salvando }),
    ]);

  /** Estado comum das abas que salvam uma seção. */
  function useSalvar(fn) {
    const [erro, setErro] = useState(null);
    const [ok, setOk] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
      setErro(null);
      setOk(false);
      setSalvando(true);
      try {
        await fn();
        setOk(true);
      } catch (err) {
        setErro(err.message);
      }
      setSalvando(false);
    };
    return { erro, ok, salvando, salvar };
  }

  // ---------- aba: Cofre ----------
  const DESC_SESSAO = {
    dia: 'Até o fim do dia (padrão): depois de destravar, o F5 e as outras abas não pedem a senha; vira o dia, pede de novo.',
    horas: 'Por um número de horas depois de destravar.',
    aba: 'Só nesta aba: o F5 não pede a senha, mas trava sozinho em 15 minutos parado ou ao fechar a aba.',
    pedir: 'Pedir a senha mestra toda vez que o Hub for aberto (o mais seguro).',
  };

  function AbaCofre({ config, aoSalvar }) {
    const [c, setC] = useState(() => copia(config.cofre));
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      const novo = await api('PUT', '/api/admin/config/cofre', { ...c, horas: Number(c.horas) });
      setC(novo);
      aoSalvar({ ...config, cofre: novo });
      if (hub().recarregarPolitica) await hub().recarregarPolitica(); // vale já neste navegador
    });
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      e('div', { key: 'm' }, [
        rotulo('Senha mestra dos acessos (cofre)'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } }, [
          caixa(c.modo === 'ativo', () => setC({ ...c, modo: 'ativo' }), 'Ativa (recomendado): logins, senhas e token do GLPI ficam cifrados neste navegador com uma senha mestra.'),
          caixa(c.modo === 'desativado', () => setC({ ...c, modo: 'desativado' }), 'Desativada: ninguém precisa de senha mestra e os acessos novos voltam a ficar em texto puro no navegador (menos seguro).'),
        ]),
        dica('A mudança vale para navegadores que ainda não criaram o cofre. Quem já tem cofre continua usando a senha mestra.'),
      ]),
      e('div', { key: 's' }, [
        rotulo('Quanto tempo o cofre fica liberado depois de destravar'),
        selecao(c.sessao, (v) => setC({ ...c, sessao: v }), [['dia', 'Até o fim do dia'], ['horas', 'Por horas'], ['aba', 'Só nesta aba'], ['pedir', 'Pedir a senha toda vez']], { marginTop: 4 }),
        dica(DESC_SESSAO[c.sessao]),
        c.sessao === 'horas' ? e('div', { style: { marginTop: 8, maxWidth: 140 } }, [rotulo('Horas (1 a 72)'), e('input', { className: 'field-input admin-horas', type: 'number', min: 1, max: 72, value: c.horas, onChange: (ev) => setC({ ...c, horas: ev.target.value }), style: S().input })]) : null,
        e('div', { style: { marginTop: 8 } }, dica('Atenção: com a sessão guardada (dia, horas), quem tiver acesso ao perfil deste navegador dentro do prazo consegue abrir o cofre. "Travar agora" ou limpar os dados do navegador encerram a sessão na hora.')),
      ]),
      rodape(salvar, salvando, erro, ok),
    ]);
  }

  // ---------- aba: Administradores ----------
  function AbaAdmins() {
    const [admins, setAdmins] = useState(null);
    const [eu, setEu] = useState(null);
    const [usuarios, setUsuarios] = useState(null);
    const [busca, setBusca] = useState('');
    const [escolhido, setEscolhido] = useState('');
    const [login, setLogin] = useState('');
    const [erro, setErro] = useState(null);
    const [info, setInfo] = useState(null);

    const carregar = async () => {
      try {
        const [lista, quem] = await Promise.all([api('GET', '/api/admin/admins'), api('GET', '/api/admin/eu')]);
        setAdmins(lista);
        setEu(quem.usuario);
      } catch (err) {
        setErro(err.message);
      }
    };
    useEffect(() => {
      carregar();
      // lista de pessoas do GLPI (a mesma do "Abrir chamado") para escolher o novo administrador
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json())
        .then((d) => setUsuarios(Array.isArray(d.users) ? d.users : []))
        .catch(() => setUsuarios([]));
    }, []);

    async function adicionar(corpo) {
      setErro(null);
      setInfo(null);
      try {
        await api('POST', '/api/admin/admins', corpo);
        setInfo('Administrador adicionado.');
        setEscolhido('');
        setLogin('');
        await carregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    async function remover(a) {
      setErro(null);
      setInfo(null);
      try {
        await api('DELETE', `/api/admin/admins/${a.id}`);
        setInfo('Administrador removido.');
        await carregar();
      } catch (err) {
        setErro(err.message);
      }
    }

    const filtrados = (usuarios || []).filter((u) => !busca || u.label.toLowerCase().includes(busca.toLowerCase())).slice(0, 60);
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      eu ? e('div', { key: 'eu', style: { fontSize: 12.5, color: 'var(--muted)' } }, `Você é ${eu.nome || eu.login} (GLPI${eu.login ? `, login ${eu.login}` : ''}).`) : null,
      e('div', { key: 'l' }, [
        rotulo('Quem é administrador'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 } }, !admins ? [dica('Carregando…')] : admins.map((a) =>
          e('div', { key: a.id, className: 'admin-linha', style: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg)' } }, [
            e('div', { key: 'n', style: { flex: 1, fontSize: 13 } }, [
              e('div', { key: 'a', style: { fontWeight: 600 } }, a.nome || a.login || `GLPI ${a.glpiId}`),
              e('div', { key: 'b', style: { fontSize: 11.5, color: 'var(--muted)' } }, [a.login ? `login ${a.login}` : null, a.glpiId ? `id ${a.glpiId}` : 'ainda não confirmado pelo GLPI', a.criadoPor ? `adicionado por ${a.criadoPor}` : null].filter(Boolean).join(' · ')),
            ]),
            botao('Remover', () => remover(a), 'sec', { color: 'var(--error)', padding: '5px 10px' }),
          ]))),
      ]),
      e('div', { key: 'novo', style: { borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } }, [
        rotulo('Adicionar administrador'),
        e('input', { className: 'field-input admin-busca', value: busca, onChange: (ev) => setBusca(ev.target.value), placeholder: usuarios ? 'Buscar pessoa do GLPI pelo nome' : 'Carregando as pessoas do GLPI…', style: S().input }),
        selecao(escolhido, setEscolhido, [['', filtrados.length ? 'Escolha a pessoa' : 'Nenhuma pessoa encontrada'], ...filtrados.map((u) => [String(u.id), u.label])]),
        botao('Adicionar a pessoa escolhida', () => {
          const u = (usuarios || []).find((x) => String(x.id) === escolhido);
          if (u) adicionar({ glpiId: u.id, nome: u.label });
        }, 'prim', { alignSelf: 'flex-start', disabled: !escolhido, opacity: escolhido ? 1 : 0.6 }),
        dica('Ou informe o login do GLPI de quem não aparece na lista:'),
        e('div', { style: { display: 'flex', gap: 8 } }, [
          e('input', { key: 'i', className: 'field-input admin-login', value: login, onChange: (ev) => setLogin(ev.target.value), placeholder: 'login do GLPI', style: { ...S().input, flex: 1 } }),
          botao('Adicionar pelo login', () => login.trim() && adicionar({ login: login.trim() }), 'sec', { key: 'b' }),
        ]),
      ]),
      erro ? e('div', { key: 'e', className: 'admin-erro', style: { color: 'var(--error)', fontSize: 12.5 } }, erro) : null,
      info ? e('div', { key: 'i', className: 'admin-ok', style: { color: 'var(--success, #16a34a)', fontSize: 12.5 } }, info) : null,
    ]);
  }

  // ---------- aba: ordem das automações ----------
  function AbaAutomacoes() {
    const [lista, setLista] = useState(null);
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      await api('PUT', '/api/admin/automations/ordem', { ids: lista.map((a) => a.id) });
    });
    useEffect(() => {
      fetch('/api/automations').then((r) => r.json()).then(setLista).catch(() => setLista([]));
    }, []);
    const mover = (i, d) => setLista((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const n = l.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [
      dica('Use as setas para mudar a posição das automações no painel. A nova ordem aparece para todos assim que você salvar.'),
      e('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, !lista ? [dica('Carregando…')] : lista.map((a, i) =>
        e('div', { key: a.id, className: 'admin-automacao', style: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: 'var(--bg)' } }, [
          e('span', { key: 'p', style: { width: 22, color: 'var(--muted)', fontSize: 12 } }, i + 1),
          e('span', { key: 'n', style: { flex: 1, fontSize: 13 } }, a.name),
          botao('↑', () => mover(i, -1), 'sec', { padding: '3px 9px', disabled: i === 0, opacity: i === 0 ? 0.4 : 1 }),
          botao('↓', () => mover(i, 1), 'sec', { padding: '3px 9px', disabled: i === lista.length - 1, opacity: i === lista.length - 1 ? 0.4 : 1 }),
        ]))),
      lista && lista.length ? rodape(salvar, salvando, erro, ok) : null,
    ]);
  }

  // ---------- aba: WhatsApp ----------
  const NOTAS_MODO = {
    observacao: 'Observação (recomendado no início): o robô só lê e registra o que faria. Não abre chamado e não reage.',
    ativo: 'Ativo: o robô identifica quem pediu e o que pediu, abre o chamado no GLPI e reage na mensagem.',
  };
  const NOTAS_OPERACAO = {
    fila_automatico: 'Pela fila do Chamados automático: o pedido espera na fila e o navegador de quem está com o Chamados automático ligado abre o chamado (com o token dessa pessoa) e o automático executa. Se ninguém pegar o pedido em 1 minuto e houver token de serviço no servidor, o servidor abre o chamado; sem token de serviço, o pedido espera um navegador.',
    so_abrir: 'Só abrir o chamado, 24 horas: o servidor abre o chamado com o token de um usuário de serviço do GLPI. A execução continua pelo Chamados (manual ou automático). Exige HUB_GLPI_TOKEN_SERVICO no servidor.',
  };

  function AbaWhatsapp({ config, opcoes, aoSalvar }) {
    const [w, setW] = useState(() => {
      const x = copia(config.whatsapp);
      x.remetentesTexto = (x.remetentesAutorizados || []).join('\n');
      return x;
    });
    const { erro, ok, salvando, salvar } = useSalvar(async () => {
      const corpo = { ...w, remetentesAutorizados: w.remetentesTexto.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean) };
      delete corpo.remetentesTexto;
      const novo = await api('PUT', '/api/admin/config/whatsapp', corpo);
      setW({ ...novo, remetentesTexto: novo.remetentesAutorizados.join('\n') });
      aoSalvar({ ...config, whatsapp: novo });
    });
    const mudar = (fn) => setW((x) => fn(copia(x)));
    const tipos = (opcoes && opcoes.tipos) || [];
    const [categorias, setCategorias] = useState([]);
    const { painel } = usePainelWhatsapp(0);
    const gruposVisiveis = (painel && painel.estado && painel.estado.grupos) || [];
    useEffect(() => {
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json()).then((d) => setCategorias(Array.isArray(d.categories) ? d.categories : [])).catch(() => setCategorias([]));
    }, []);
    const campoTexto = (valor, onChange, placeholder, extra = {}) => e('input', { className: 'field-input', value: valor || '', onChange: (ev) => onChange(ev.target.value), placeholder, style: { ...S().input, ...extra } });

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      e('div', { key: 'aviso', style: { background: 'var(--accent-soft, rgba(22,163,74,0.08))', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' } },
        'Fluxo: o robô lê a mensagem no grupo, identifica quem pediu (pelo telefone vinculado a um usuário do GLPI) e o tipo de solicitação, abre o chamado e reage na mensagem: a fazer, em andamento, concluído ou erro. A conexão do chip é feita na aba "Conexão e pedidos".'),
      e('div', { key: 'geral' }, [
        caixa(w.ativo, (v) => mudar((x) => ((x.ativo = v), x)), 'Automação do WhatsApp ligada', { fontWeight: 600 }),
        e('div', { style: { marginTop: 8 } }, [rotulo('Modo de funcionamento'), selecao(w.modo, (v) => mudar((x) => ((x.modo = v), x)), (opcoes.modosWhatsapp || ['observacao', 'ativo']).map((m) => [m, { observacao: 'Observação', ativo: 'Ativo' }[m] || m]), { marginTop: 4 }), dica(NOTAS_MODO[w.modo] || '')]),
        e('div', { style: { marginTop: 8 } }, [rotulo('Como o chamado é aberto'), selecao(w.operacao, (v) => mudar((x) => ((x.operacao = v), x)), [['fila_automatico', 'Pela fila do Chamados automático'], ['so_abrir', 'Só abrir o chamado, 24 horas (token de serviço)']], { marginTop: 4 }), dica(NOTAS_OPERACAO[w.operacao] || ''),
          dica('Totalmente automático no servidor (abrir e executar sem ninguém com o navegador aberto) ainda não está disponível: exigiria guardar logins do SGA e do PowerCRM no servidor.'),
          w.operacao === 'so_abrir' && painel && painel.disponivel && painel.disponivel.so_abrir === false ? e('div', { key: 'av', style: { color: 'var(--warn)', fontSize: 12.5, marginTop: 4 } }, 'O token de serviço do GLPI não está configurado no servidor: os pedidos vão dar erro até configurar.') : null]),
        e('div', { style: { marginTop: 8 } }, [rotulo('Texto da resposta no grupo quando o chamado for solucionado'), campoTexto(w.respostaModelo, (v) => mudar((x) => ((x.respostaModelo = v), x)), 'Chamado {chamado} concluído.'), dica('Use {chamado}, {solicitante} e {tipo}. Só responde nos grupos com "Responder no grupo" marcado.')]),
      ]),
      e('div', { key: 'numeros' }, [
        rotulo('Números (chips) do WhatsApp'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } }, w.numeros.map((n, i) =>
          e('div', { key: n.id, className: 'wa-numero', style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' } }, [
            campoTexto(n.rotulo, (v) => mudar((x) => ((x.numeros[i].rotulo = v), x)), 'Nome (ex.: Chip dedicado)'),
            campoTexto(n.telefone, (v) => mudar((x) => ((x.numeros[i].telefone = v), x)), 'Telefone com DDI e DDD (pode ficar vazio)'),
            caixa(n.ativo !== false, (v) => mudar((x) => ((x.numeros[i].ativo = v), x)), 'Ativo'),
            botao('Remover', () => mudar((x) => ((x.numeros = x.numeros.filter((_, j) => j !== i)), x.grupos.forEach((g) => { if (g.numeroId === n.id) g.numeroId = ''; }), x)), 'sec', { color: 'var(--error)', padding: '5px 10px' }),
          ]))),
        botao('+ Adicionar número', () => mudar((x) => (x.numeros.push({ id: proximoId('n', x.numeros), rotulo: '', telefone: '', ativo: true }), x)), 'sec', { marginTop: 6, alignSelf: 'flex-start' }),
      ]),
      e('datalist', { key: 'dl', id: 'wa-grupos-visiveis' }, gruposVisiveis.map((gv) => e('option', { key: gv.jid, value: gv.nome }))),
      e('div', { key: 'grupos' }, [
        rotulo('Grupos atendidos'),
        dica('Para cada grupo: qual número responde nele e quais tipos de solicitação o robô pode tratar.'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 } }, w.grupos.map((g, i) =>
          e('div', { key: g.id, className: 'wa-grupo', style: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 } }, [
            e('div', { key: 'a', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }, [
              e('input', { className: 'field-input', list: 'wa-grupos-visiveis', value: g.nome || '', placeholder: 'Nome do grupo (como aparece no WhatsApp)', style: S().input, onChange: (ev) => { const v = ev.target.value; mudar((x) => { x.grupos[i].nome = v; const achado = gruposVisiveis.find((gv) => gv.nome === v); if (achado) x.grupos[i].jid = achado.jid; return x; }); } }),
              campoTexto(g.jid, (v) => mudar((x) => ((x.grupos[i].jid = v), x)), 'Identificador do grupo (opcional, ...@g.us)'),
            ]),
            e('div', { key: 'b', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
              e('span', { key: 'l', style: { fontSize: 12.5, color: 'var(--muted)' } }, 'Número que responde:'),
              selecao(g.numeroId || '', (v) => mudar((x) => ((x.grupos[i].numeroId = v), x)), [['', 'Nenhum definido'], ...w.numeros.map((n) => [n.id, n.rotulo || n.id])], { width: 'auto', minWidth: 190 }),
              caixa(g.ativo !== false, (v) => mudar((x) => ((x.grupos[i].ativo = v), x)), 'Grupo ativo'),
              caixa(g.responder, (v) => mudar((x) => ((x.grupos[i].responder = v), x)), 'Responder no grupo'),
              caixa(g.reagir !== false, (v) => mudar((x) => ((x.grupos[i].reagir = v), x)), 'Reagir às mensagens'),
            ]),
            e('div', { key: 'cat', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
              e('span', { key: 'l', style: { fontSize: 12.5, color: 'var(--muted)' } }, 'Categoria do chamado no GLPI:'),
              selecao(g.categoriaId ? String(g.categoriaId) : '', (v) => mudar((x) => { const c = categorias.find((k) => String(k.id) === v); x.grupos[i].categoriaId = v ? Number(v) : null; x.grupos[i].categoriaLabel = c ? c.label : ''; return x; }),
                [['', 'Nenhuma (o chamado abre sem categoria)'], ...(g.categoriaId && !categorias.some((k) => k.id === g.categoriaId) ? [[String(g.categoriaId), g.categoriaLabel || String(g.categoriaId)]] : []), ...categorias.map((k) => [String(k.id), k.label])], { width: 'auto', minWidth: 260, maxWidth: '100%' }),
            ]),
            e('div', { key: 'c' }, [
              e('div', { style: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } }, 'Tipos de solicitação deste grupo:'),
              e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, tipos.map((t) => {
                const sel = g.tipos.includes(t.chave);
                return e('button', { key: t.chave, type: 'button', className: 'wa-tipo', style: S().chip(sel), onClick: () => mudar((x) => ((x.grupos[i].tipos = sel ? x.grupos[i].tipos.filter((k) => k !== t.chave) : [...x.grupos[i].tipos, t.chave]), x)) }, t.nome);
              })),
            ]),
            botao('Remover grupo', () => mudar((x) => ((x.grupos = x.grupos.filter((_, j) => j !== i)), x)), 'sec', { color: 'var(--error)', alignSelf: 'flex-start', padding: '5px 10px' }),
          ]))),
        botao('+ Adicionar grupo', () => mudar((x) => (x.grupos.push({ id: proximoId('g', x.grupos), nome: '', jid: '', categoriaId: null, categoriaLabel: '', numeroId: x.numeros[0] ? x.numeros[0].id : '', tipos: [], ativo: true, responder: false, reagir: true }), x)), 'sec', { marginTop: 8, alignSelf: 'flex-start' }),
      ]),
      e('div', { key: 'privado', className: 'wa-privado', style: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 } }, [
        rotulo('Conversa privada com o robô'),
        dica('A pessoa manda o pedido direto para o número do chip. A primeira linha diz a categoria do GLPI, por exemplo "Categoria Ancore". Só atende quem tem vínculo (aba Vínculos do WhatsApp).'),
        e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' } }, [
          caixa(w.privado.ativo, (v) => mudar((x) => ((x.privado.ativo = v), x)), 'Atender no privado', { fontWeight: 600 }),
          caixa(w.privado.responder, (v) => mudar((x) => ((x.privado.responder = v), x)), 'Responder na conversa'),
          caixa(w.privado.reagir !== false, (v) => mudar((x) => ((x.privado.reagir = v), x)), 'Reagir às mensagens'),
          caixa(w.privado.explicarDuvida !== false, (v) => mudar((x) => ((x.privado.explicarDuvida = v), x)), 'Explicar na conversa quando faltar algo'),
        ]),
        e('div', { key: 'tipos' }, [
          e('div', { style: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } }, 'Tipos de solicitação atendidos no privado (nenhum marcado = todos):'),
          e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, tipos.map((t) => {
            const sel = w.privado.tipos.includes(t.chave);
            return e('button', { key: t.chave, type: 'button', className: 'wa-tipo wa-tipo-privado', style: S().chip(sel), onClick: () => mudar((x) => ((x.privado.tipos = sel ? x.privado.tipos.filter((k) => k !== t.chave) : [...x.privado.tipos, t.chave]), x)) }, t.nome);
          })),
        ]),
        e('div', { key: 'cats' }, [
          e('div', { style: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } }, 'Categorias que a pessoa pode escrever na mensagem (o nome pode vir sem espaço ou acento):'),
          e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, w.privado.categorias.map((c, i) =>
            e('div', { key: i, className: 'wa-categoria', style: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 1.6fr) auto', gap: 8, alignItems: 'center' } }, [
              campoTexto(c.apelido, (v) => mudar((x) => ((x.privado.categorias[i].apelido = v), x)), 'Nome (ex.: Ancore)'),
              selecao(c.categoriaId ? String(c.categoriaId) : '', (v) => mudar((x) => { const k = categorias.find((q) => String(q.id) === v); x.privado.categorias[i].categoriaId = v ? Number(v) : null; x.privado.categorias[i].categoriaLabel = k ? k.label : ''; return x; }),
                [['', 'Escolha a categoria do GLPI'], ...(c.categoriaId && !categorias.some((q) => q.id === c.categoriaId) ? [[String(c.categoriaId), c.categoriaLabel || String(c.categoriaId)]] : []), ...categorias.map((q) => [String(q.id), q.label])]),
              botao('Remover', () => mudar((x) => ((x.privado.categorias = x.privado.categorias.filter((_, j) => j !== i)), x)), 'sec', { color: 'var(--error)', padding: '5px 10px' }),
            ]))),
          botao('+ Adicionar categoria', () => mudar((x) => (x.privado.categorias.push({ apelido: '', categoriaId: null, categoriaLabel: '' }), x)), 'sec', { marginTop: 6, alignSelf: 'flex-start' }),
        ]),
      ]),
      e('div', { key: 'rem' }, [
        rotulo('Quem pode pedir (telefones autorizados)'),
        e('textarea', { className: 'field-input wa-remetentes', value: w.remetentesTexto, onChange: (ev) => mudar((x) => ((x.remetentesTexto = ev.target.value), x)), rows: 3, placeholder: 'Um telefone por linha, com DDI e DDD. Vazio = qualquer pessoa dos grupos acima.', style: { ...S().input, resize: 'vertical' } }),
      ]),
      e('div', { key: 'reacoes' }, [
        rotulo('Reações usadas nas mensagens'),
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 4 } }, [['aFazer', 'A fazer (pedido recebido)'], ['andamento', 'Em andamento'], ['sucesso', 'Deu certo'], ['erro', 'Deu erro'], ['duvida', 'Faltou dado']].map(([k, t]) =>
          e('div', { key: k }, [e('div', { style: { fontSize: 11.5, color: 'var(--muted)', marginBottom: 3 } }, t), campoTexto(w.reacoes[k], (v) => mudar((x) => ((x.reacoes[k] = v), x)), '', { textAlign: 'center' })]))),
      ]),
      rodape(salvar, salvando, erro, ok),
    ]);
  }

  // ---------- abas: vínculos, conexão e pedidos do WhatsApp ----------
  const NOMES_STATUS = { pendente: 'Na fila', abrindo: 'Abrindo o chamado', aberto: 'Chamado aberto', concluido: 'Concluído', erro: 'Erro', sem_vinculo: 'Sem vínculo', sem_categoria: 'Sem categoria', observado: 'Só observado' };
  const COR_STATUS = { pendente: 'var(--warn)', abrindo: 'var(--accent)', aberto: 'var(--accent)', concluido: 'var(--success, #16a34a)', erro: 'var(--error)', sem_vinculo: 'var(--warn)', sem_categoria: 'var(--warn)', observado: 'var(--muted)' };
  const dataHora = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informado');

  /** Carrega o painel do WhatsApp (vínculos, pedidos recentes, estado do robô) e se atualiza sozinho de tempos em tempos. */
  function usePainelWhatsapp(intervaloMs) {
    const [painel, setPainel] = useState(null);
    const [erro, setErro] = useState(null);
    const carregar = async () => {
      try {
        setPainel(await api('GET', '/api/admin/whatsapp/painel'));
        setErro(null);
      } catch (err) {
        setErro(err.message);
      }
    };
    useEffect(() => {
      carregar();
      if (!intervaloMs) return undefined;
      const t = setInterval(carregar, intervaloMs);
      return () => clearInterval(t);
    }, []);
    return { painel, erro, recarregar: carregar };
  }

  function AbaVinculos() {
    const { painel, erro: erroPainel, recarregar } = usePainelWhatsapp(0);
    const [usuarios, setUsuarios] = useState([]);
    const [telefone, setTelefone] = useState('');
    const [escolhido, setEscolhido] = useState('');
    const [erro, setErro] = useState(null);
    const [info, setInfo] = useState(null);
    useEffect(() => {
      fetch('/api/glpi/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: tokenAtual() }) })
        .then((r) => r.json()).then((d) => setUsuarios(Array.isArray(d.users) ? d.users : [])).catch(() => setUsuarios([]));
    }, []);
    async function adicionar() {
      setErro(null);
      setInfo(null);
      const u = usuarios.find((x) => String(x.id) === escolhido);
      try {
        await api('POST', '/api/admin/whatsapp/vinculos', { telefone, glpiId: escolhido, nome: u ? u.label : '' });
        setTelefone('');
        setEscolhido('');
        setInfo('Vínculo salvo.');
        await recarregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    async function remover(v) {
      setErro(null);
      setInfo(null);
      try {
        await api('DELETE', `/api/admin/whatsapp/vinculos/${v.telefone}`);
        setInfo('Vínculo removido.');
        await recarregar();
      } catch (err) {
        setErro(err.message);
      }
    }
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      dica('Cada telefone que pede no grupo precisa estar ligado a um usuário do GLPI: é ele que vai como requerente do chamado aberto pelo robô. Telefone sem vínculo recebe só a reação de dúvida.'),
      e('div', { key: 'novo', style: { display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(180px, 1.4fr) auto', gap: 8, alignItems: 'center' } }, [
        e('input', { key: 't', className: 'field-input wa-vinculo-telefone', value: telefone, onChange: (ev) => setTelefone(ev.target.value), placeholder: 'Telefone com DDD', style: S().input }),
        selecao(escolhido, setEscolhido, [['', 'Escolha o usuário do GLPI'], ...usuarios.map((u) => [String(u.id), u.label])]),
        botao('Salvar vínculo', adicionar, 'prim', { padding: '8px 14px' }),
      ]),
      erro || erroPainel ? e('div', { key: 'e', className: 'admin-erro', style: { color: 'var(--error)', fontSize: 12.5 } }, erro || erroPainel) : null,
      info ? e('div', { key: 'i', className: 'admin-ok', style: { color: 'var(--success, #16a34a)', fontSize: 12.5 } }, info) : null,
      !painel ? dica('Carregando…') : painel.vinculos.length === 0 ? dica('Nenhum vínculo ainda.') : e('div', { key: 'lista', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, painel.vinculos.map((v) =>
        e('div', { key: v.telefone, className: 'admin-linha', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 13 } }, [
          e('div', { key: 'n', style: { flex: 1, minWidth: 0 } }, [
            e('div', { key: 'a', style: { fontWeight: 600 } }, v.nome || 'Não informado'),
            e('div', { key: 'b', style: { color: 'var(--muted)', fontSize: 12 } }, `${v.telefone} · usuário ${v.glpiId} no GLPI`),
          ]),
          botao('Remover', () => remover(v), 'sec', { color: 'var(--error)', padding: '5px 10px' }),
        ]))),
    ]);
  }

  function AbaConexao() {
    const { painel, erro, recarregar } = usePainelWhatsapp(8000);
    if (erro && !painel) return e('div', { style: { color: 'var(--error)', fontSize: 13 } }, erro);
    if (!painel) return dica('Carregando…');
    const est = painel.estado;
    const semSinal = !est.atualizadoEm || Date.now() - new Date(est.atualizadoEm).getTime() > 120000;
    const situacao = !est.botConfigurado ? 'O robô ainda não está configurado neste Hub (falta o segredo WHATSAPP_BOT_TOKEN).'
      : semSinal ? 'O robô do WhatsApp não está enviando sinal.'
        : est.conectado ? `Conectado${est.numero ? ` ao número ${est.numero}` : ''}.`
          : 'Desconectado: leia o QR code abaixo com o WhatsApp do chip dedicado (Aparelhos conectados).';
    const cor = est.botConfigurado && !semSinal && est.conectado ? 'var(--success, #16a34a)' : 'var(--warn)';
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      e('div', { key: 'sit', className: 'wa-situacao', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 13 } }, [
        e('span', { key: 'p', style: { width: 9, height: 9, borderRadius: '50%', background: cor, flexShrink: 0 } }),
        e('span', { key: 't', style: { flex: 1 } }, situacao),
        botao('Atualizar', recarregar, 'sec', { padding: '5px 10px' }),
      ]),
      est.qr && !est.conectado && !semSinal ? e('img', { key: 'qr', className: 'wa-qr', src: est.qr, alt: 'QR code para conectar o WhatsApp', style: { width: 240, height: 240, background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)', alignSelf: 'flex-start' } }) : null,
      painel.disponivel && painel.disponivel.so_abrir === false ? dica('O modo "só abrir o chamado" precisa do token de um usuário de serviço do GLPI no servidor (HUB_GLPI_TOKEN_SERVICO). Hoje não está configurado.') : null,
      rotulo('O que cada reação significa'),
      e('div', { key: 'legenda', className: 'wa-legenda', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6, fontSize: 12.5 } }, [
        ['aFazer', 'Na fila: espera alguém abrir o chamado.'],
        ['andamento', 'Chamado aberto, em andamento.'],
        ['sucesso', 'Chamado solucionado.'],
        ['erro', 'Deu erro: o motivo aparece em Pedidos recentes.'],
        ['duvida', 'Faltou algo: o vínculo do telefone (grupo) ou a categoria (privado). O motivo aparece em Mensagens recebidas.'],
      ].map(([k, t]) => e('div', { key: k, style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' } }, [
        e('span', { key: 'e', style: { fontSize: 16, lineHeight: 1.2 } }, (painel.reacoes && painel.reacoes[k]) || ''),
        e('span', { key: 't', style: { color: 'var(--muted)' } }, t),
      ]))),
      rotulo('Mensagens recebidas (últimas 100, inclusive as ignoradas)'),
      !painel.mensagens || painel.mensagens.length === 0 ? dica('Nenhuma mensagem chegou ao Hub desde a última vez que ele reiniciou.') : e('div', { key: 'msgs', className: 'wa-mensagens', style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' } }, painel.mensagens.map((m, i) =>
        e('div', { key: i, className: 'wa-mensagem', style: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 } }, [
          e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('span', { key: 's', style: { display: 'inline-flex', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: COR_STATUS[m.resultado] || 'var(--muted)', border: '1px solid currentColor' } }, m.resultado === 'ignorado' ? 'Ignorada' : (NOMES_STATUS[m.resultado] || m.resultado)),
            e('span', { key: 'g', style: { fontWeight: 600 } }, m.onde),
            e('span', { key: 'q', style: { color: 'var(--muted)' } }, `${m.remetente} · ${dataHora(m.quando)}`),
          ]),
          e('div', { key: 't', style: { color: 'var(--muted)' } }, m.trecho),
          m.motivo ? e('div', { key: 'm' }, m.motivo) : null,
        ]))),
      rotulo('Pedidos recentes'),
      painel.pedidos.length === 0 ? dica('Nenhum pedido ainda.') : e('div', { key: 'ped', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, painel.pedidos.map((p) =>
        e('div', { key: p.id, className: 'wa-pedido', style: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 } }, [
          e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('span', { key: 's', style: { display: 'inline-flex', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: COR_STATUS[p.status] || 'var(--muted)', border: '1px solid currentColor' } }, NOMES_STATUS[p.status] || p.status),
            e('span', { key: 'g', style: { fontWeight: 600 } }, p.grupo || 'Não informado'),
            e('span', { key: 'q', style: { color: 'var(--muted)' } }, `${p.solicitante || 'Sem vínculo'} · ${dataHora(p.criadoEm)}`),
            p.ticketId ? e('span', { key: 't', style: { color: 'var(--muted)' } }, `Chamado ${p.ticketId}`) : null,
          ]),
          e('div', { key: 'x', style: { color: 'var(--muted)' } }, p.texto),
          p.erro ? e('div', { key: 'r', style: { color: 'var(--error)' } }, p.erro) : null,
        ]))),
    ]);
  }

  // ---------- tela ----------
  const ABAS = [['cofre', 'Cofre', 'Lock'], ['admins', 'Administradores', 'Users'], ['automacoes', 'Automações', 'Workflow'], ['whatsapp', 'WhatsApp', 'MessageCircle'], ['vinculos', 'Vínculos do WhatsApp', 'Headset'], ['conexao', 'Conexão e pedidos', 'Bot']];

  function AdminView() {
    const [aba, setAba] = useState('cofre');
    const [dados, setDados] = useState(null); // { config, opcoes }
    const [erro, setErro] = useState(null);
    useEffect(() => {
      api('GET', '/api/admin/config').then(setDados).catch((err) => setErro(err.message));
    }, []);
    const atualizarConfig = (config) => setDados((d) => ({ ...d, config }));

    let corpo;
    if (erro) corpo = e('div', { style: { color: 'var(--error)', fontSize: 13 } }, erro);
    else if (!dados) corpo = dica('Carregando…');
    else if (aba === 'cofre') corpo = e(AbaCofre, { key: 'cofre', config: dados.config, aoSalvar: atualizarConfig });
    else if (aba === 'admins') corpo = e(AbaAdmins, { key: 'admins' });
    else if (aba === 'automacoes') corpo = e(AbaAutomacoes, { key: 'automacoes' });
    else if (aba === 'vinculos') corpo = e(AbaVinculos, { key: 'vinculos' });
    else if (aba === 'conexao') corpo = e(AbaConexao, { key: 'conexao' });
    else corpo = e(AbaWhatsapp, { key: 'whatsapp', config: dados.config, opcoes: dados.opcoes, aoSalvar: atualizarConfig });

    return e('div', { className: 'admin-tela', style: { maxWidth: 1040, margin: '0 auto', padding: '24px 20px 40px', color: 'var(--text)' } }, [
      e('div', { key: 'cab', style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 } }, [
        e('span', { key: 'i', className: 'glpi-head-icon' }, Icon('Settings', 16)),
        e('h1', { key: 't', style: { margin: 0, fontWeight: 600, fontSize: 18 } }, 'Administração do Hub'),
      ]),
      e('div', { key: 'grade', className: 'admin-grid' }, [
        e('nav', { key: 'nav', className: 'admin-nav', 'aria-label': 'Seções da administração' }, ABAS.map(([k, t, ic]) =>
          e('button', { key: k, type: 'button', className: `admin-nav-item admin-aba admin-aba-${k}` + (aba === k ? ' ativo' : ''), 'aria-current': aba === k ? 'page' : undefined, onClick: () => setAba(k) }, [Icon(ic, 16), e('span', { key: 't' }, t)]))),
        e('div', { key: 'corpo', className: 'admin-corpo' }, corpo),
      ]),
    ]);
  }

  /** true quando o token do GLPI do cofre é de um administrador (o servidor confere). Usado também pelo app.js. */
  function useEhAdmin() {
    const [admin, setAdmin] = useState(false);
    const ultimo = useRef(null);
    useEffect(() => {
      let vivo = true;
      async function checar(token) {
        if (token === ultimo.current) return;
        ultimo.current = token;
        if (!token) return setAdmin(false);
        try {
          const resp = await fetch('/api/admin/eu', { headers: { 'X-Glpi-Token': token }, cache: 'no-store' });
          const d = await resp.json().catch(() => ({}));
          if (vivo) setAdmin(resp.ok && !!d.admin);
        } catch {
          if (vivo) setAdmin(false); // sem resposta: a aba simplesmente não aparece
        }
      }
      checar(tokenAtual());
      const parar = hub() ? hub().aoMudar((a) => checar((a && a.userToken) || '')) : () => {};
      return () => {
        vivo = false;
        parar();
      };
    }, []);
    return admin;
  }

  /** Aba do cabeçalho: só existe para administradores. */
  function AdminAba({ ativa, aoAbrir, compacto }) {
    if (!useEhAdmin()) return null;
    return e('button', {
      type: 'button',
      className: 'panel-tab admin-btn' + (ativa ? ' ativa' : '') + (compacto ? ' compact' : ''),
      onClick: aoAbrir,
      title: 'Administração do Hub',
      'aria-label': 'Administração',
      style: { display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (ativa ? 'var(--accent)' : 'transparent'), color: ativa ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },
    }, [Icon('Settings', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Administração')]);
  }

  window.useEhAdmin = useEhAdmin;
  window.AdminAba = AdminAba;
  window.AdminView = AdminView;
})();
