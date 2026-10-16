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
    observacao: 'Observação (recomendado no início): só lê e registra o que faria. Não abre chamado, não executa e não reage.',
    aprovacao: 'Aprovação: os pedidos entendidos aparecem para você aprovar com um clique antes de executar.',
    automatico: 'Automático: executa sozinho. Use só depois de conferir que a leitura acerta.',
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
    const campoTexto = (valor, onChange, placeholder, extra = {}) => e('input', { className: 'field-input', value: valor || '', onChange: (ev) => onChange(ev.target.value), placeholder, style: { ...S().input, ...extra } });

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
      e('div', { key: 'aviso', style: { background: 'var(--accent-soft, rgba(22,163,74,0.08))', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' } },
        'A conexão com o WhatsApp (leitura do QR code com o chip dedicado) ainda não foi instalada. Estas configurações já ficam salvas e serão usadas quando o número estiver disponível.'),
      e('div', { key: 'geral' }, [
        caixa(w.ativo, (v) => mudar((x) => ((x.ativo = v), x)), 'Automação do WhatsApp ligada', { fontWeight: 600 }),
        e('div', { style: { marginTop: 8 } }, [rotulo('Modo de funcionamento'), selecao(w.modo, (v) => mudar((x) => ((x.modo = v), x)), (opcoes.modosWhatsapp || ['observacao', 'aprovacao', 'automatico']).map((m) => [m, { observacao: 'Observação', aprovacao: 'Aprovação no Hub', automatico: 'Automático' }[m] || m]), { marginTop: 4 }), dica(NOTAS_MODO[w.modo])]),
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
      e('div', { key: 'grupos' }, [
        rotulo('Grupos atendidos'),
        dica('Para cada grupo: qual número responde nele e quais tipos de solicitação o robô pode tratar.'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 } }, w.grupos.map((g, i) =>
          e('div', { key: g.id, className: 'wa-grupo', style: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 } }, [
            e('div', { key: 'a', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }, [
              campoTexto(g.nome, (v) => mudar((x) => ((x.grupos[i].nome = v), x)), 'Nome do grupo (como aparece no WhatsApp)'),
              campoTexto(g.jid, (v) => mudar((x) => ((x.grupos[i].jid = v), x)), 'Identificador do grupo (opcional, ...@g.us)'),
            ]),
            e('div', { key: 'b', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
              e('span', { key: 'l', style: { fontSize: 12.5, color: 'var(--muted)' } }, 'Número que responde:'),
              selecao(g.numeroId || '', (v) => mudar((x) => ((x.grupos[i].numeroId = v), x)), [['', 'Nenhum definido'], ...w.numeros.map((n) => [n.id, n.rotulo || n.id])], { width: 'auto', minWidth: 190 }),
              caixa(g.ativo !== false, (v) => mudar((x) => ((x.grupos[i].ativo = v), x)), 'Grupo ativo'),
              caixa(g.responder, (v) => mudar((x) => ((x.grupos[i].responder = v), x)), 'Responder no grupo'),
              caixa(g.reagir !== false, (v) => mudar((x) => ((x.grupos[i].reagir = v), x)), 'Reagir às mensagens'),
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
        botao('+ Adicionar grupo', () => mudar((x) => (x.grupos.push({ id: proximoId('g', x.grupos), nome: '', jid: '', numeroId: x.numeros[0] ? x.numeros[0].id : '', tipos: [], ativo: true, responder: false, reagir: true }), x)), 'sec', { marginTop: 8, alignSelf: 'flex-start' }),
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

  // ---------- tela ----------
  const ABAS = [['cofre', 'Cofre', 'Lock'], ['admins', 'Administradores', 'Users'], ['automacoes', 'Automações', 'Workflow'], ['whatsapp', 'WhatsApp', 'MessageCircle']];

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

  /** Aba do cabeçalho: só existe para administradores (o servidor confere o token do GLPI). */
  function AdminAba({ ativa, aoAbrir, compacto }) {
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
    if (!admin) return null;
    return e('button', {
      type: 'button',
      className: 'panel-tab admin-btn' + (ativa ? ' ativa' : '') + (compacto ? ' compact' : ''),
      onClick: aoAbrir,
      title: 'Administração do Hub',
      'aria-label': 'Administração',
      style: { display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (ativa ? 'var(--accent)' : 'transparent'), color: ativa ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },
    }, [Icon('Settings', 14), e('span', { key: 't', className: 'panel-tab-label' }, 'Administração')]);
  }

  window.AdminAba = AdminAba;
  window.AdminView = AdminView;
})();
