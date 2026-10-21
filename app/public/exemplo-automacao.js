// Motor das telas de exemplo das automações: desenha a definição (exemplo-automacoes.js) no layout das telas reais,
// simula a execução (log, progresso, tela ao vivo) e mostra o resultado. Nada sai do navegador.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef } = React;
  const { Ico, useAvisos } = window.ExemploUI;
  const A = window.ExemploAutomacoes;
  const params = new URLSearchParams(location.search);
  const chave = params.get('a') || 'generica';
  const RAIZ = A.DEFS[chave] || A.DEFS.generica;
  const hora = () => new Date().toLocaleTimeString('pt-BR');
  const SIT = { ok: 'concluido', aviso: 'pendencia', erro: 'erro' };
  const ROT_SIT = { ok: 'Sucesso', aviso: 'Aviso', erro: 'Erro' };

  if (window.self !== window.top) document.documentElement.classList.add('no-hub');
  // Login de Meus acessos: com o cofre do Hub aberto, a automação recebe os logins e não mostra os campos de login.
  // Fora do Hub, ou com o cofre travado, os campos aparecem para digitar (como nas automações reais).
  function useLoginHub() {
    let cofre = null;
    try { cofre = window.parent !== window && window.parent.ExemploTopo ? window.parent.ExemploTopo.cofre : null; } catch (err) { cofre = null; /* fora do Hub */ }
    const [aberto, setAberto] = useState(cofre ? cofre.aberto : false);
    useEffect(() => (cofre ? cofre.assinar(setAberto) : undefined), []);
    return aberto;
  }
  const SOBRE_LOGIN = /Lembrar|usuário e senha|o login|login padrão|login do PowerCRM é global/i;
  const todosCampos = (secoes) => secoes.flatMap((s) => s.campos).flatMap((c) => (c.t === 'grupo' ? c.campos : [c]));
  function valoresIniciais(def) {
    const v = {};
    const telas = def.abas || [def];
    telas.forEach((t) => todosCampos(t.secoes).forEach((c) => {
      if (!c.k) return;
      if (c.t === 'escolha') v[c.k] = [];
      else if (c.t === 'logins-assoc') v[c.k] = ['Associação Aurora', 'Associação Boreal'];
      else if (c.t === 'lista-add' || c.t === 'vincular' || c.t === 'tabela-edit' || c.t === 'mapa') v[c.k] = (c.valor || c.linhas || []).map((l) => (Array.isArray(l) ? l.slice() : l));
      else if (c.valor !== undefined) v[c.k] = Array.isArray(c.valor) ? c.valor.slice() : (typeof c.valor === 'object' ? Object.assign({}, c.valor) : c.valor);
      else v[c.k] = c.t === 'check' ? false : '';
    }));
    return v;
  }
  const visivel = (c, v) => {
    if (!c.se) return true;
    const [k, val] = c.se.split('=');
    return val === undefined ? !!v[k] : v[k] === val;
  };
  const vazio = (x) => (Array.isArray(x) ? !x.length : !String(x || '').trim());

  // ---------------------------------------------------------------- campos
  function Ajuda({ texto, destaque }) { return e('p', { className: 'au-ajuda' + (destaque ? ' destaque' : '') }, texto); }

  function Empresas({ c, valor, set }) {
    const [busca, setBusca] = useState('');
    const ops = c.opcoes || A.EMP;
    const vis = ops.filter((x) => x.toLowerCase().includes(busca.toLowerCase()));
    const todas = ops.every((x) => valor.includes(x));
    return e('div', { className: 'au-campo' }, [
      e('span', { key: 'r', className: 'au-rot' }, c.rot),
      e('div', { key: 't', className: 'au-empresas-topo' }, [
        e('label', { key: 'a' }, [e('input', { key: 'i', type: 'checkbox', checked: todas, onChange: () => set(todas ? [] : ops.slice()) }), c.rotTodas || 'Selecionar todas']),
        e('button', { key: 'l', type: 'button', className: 'au-link', onClick: () => set([]) }, 'Limpar'),
        c.busca ? e('input', { key: 'b', type: 'search', className: 'au-input', placeholder: c.busca, value: busca, onChange: (ev) => setBusca(ev.target.value), 'aria-label': c.busca }) : null,
        e('span', { key: 'n', style: { color: 'var(--muted)', marginLeft: 'auto' } }, valor.length + ' de ' + ops.length),
      ]),
      e('div', { key: 'l', className: 'au-lista-marcar' }, vis.map((x) => e('label', { key: x, className: 'au-marcar', title: x }, [
        e('input', { key: 'i', type: 'checkbox', checked: valor.includes(x), onChange: () => set(valor.includes(x) ? valor.filter((y) => y !== x) : [...valor, x]) }), e('span', { key: 's' }, x),
      ]))),
      c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
    ]);
  }

  // Login preenchido pelo Hub (Meus acessos); a pessoa pode trocar na hora sem gravar nada.
  function Login({ c }) {
    const usuario = c.sistema === 'SGA' ? 'ana.lima' : 'ana.lima@exemplo.com';
    return e('div', { className: 'au-campo' }, [
      e('div', { key: 'l', className: 'au-login' }, [
        e('div', { key: 'u', className: 'au-campo' }, [e('label', { key: 'l' }, c.rotUsuario), e('div', { key: 'i', className: 'au-preenchido' }, [e('input', { key: 'i', type: 'text', defaultValue: usuario, 'aria-label': c.rotUsuario }), e('span', { key: 's', className: 'au-selo' }, 'Preenchido pelo Hub')])]),
        e('div', { key: 's', className: 'au-campo' }, [e('label', { key: 'l' }, c.rotSenha), e('div', { key: 'i', className: 'au-preenchido' }, [e('input', { key: 'i', type: 'password', defaultValue: 'exemplo-senha', autoComplete: 'off', 'aria-label': c.rotSenha }), e('span', { key: 's', className: 'au-selo' }, 'Preenchido pelo Hub')])]),
      ]),
      c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
    ]);
  }

  // Vários logins do SGA, cada um com as empresas em que vale (como em Meus acessos).
  function LoginsSga({ c, avisar }) {
    const [logins, setLogins] = useState([{ u: 'ana.lima', emp: ['Aurora', 'Boreal', 'Cerrado'] }, { u: 'ana.lima.delta', emp: ['Delta', 'Estrela', 'Farol'] }]);
    return e('div', { className: 'au-campo' }, [
      c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
      e('div', { key: 'l', className: 'au-logins' }, logins.map((l, i) => e('div', { key: i, className: 'au-login-sga' }, [
        e('div', { key: 'c', className: 'au-login' }, [
          e('div', { key: 'u', className: 'au-preenchido' }, [e('input', { key: 'i', type: 'text', defaultValue: l.u, 'aria-label': 'Usuário do SGA' }), e('span', { key: 's', className: 'au-selo' }, 'Preenchido pelo Hub')]),
          e('div', { key: 's', className: 'au-preenchido' }, [e('input', { key: 'i', type: 'password', defaultValue: 'exemplo-senha', autoComplete: 'off', 'aria-label': 'Senha do SGA' }), e('span', { key: 's', className: 'au-selo' }, 'Preenchido pelo Hub')]),
        ]),
        e('div', { key: 'e', className: 'au-chips' }, A.EMP.map((x) => e('button', {
          key: x, type: 'button', className: 'au-chip', 'aria-pressed': l.emp.includes(x) ? 'true' : 'false',
          onClick: () => setLogins(logins.map((y, j) => (j === i ? { u: y.u, emp: y.emp.includes(x) ? y.emp.filter((z) => z !== x) : [...y.emp, x] } : y))),
        }, [l.emp.includes(x) ? Ico('Check', 12, 'currentColor', 2.5) : null, x]))),
      ]))),
      e('div', { key: 'b' }, e('button', { type: 'button', className: 'exu-btn pequeno', onClick: () => { setLogins([...logins, { u: '', emp: [] }]); avisar('Login adicionado só nesta execução (exemplo).', 'ok'); } }, [Ico('Plus', 13, 'currentColor'), 'Adicionar login do SGA'])),
    ]);
  }

  // Associações agrupadas pelo login do Hub que vale nelas (Cadastro de colaborador).
  function LoginsAssoc({ c, valor, set, hub }) {
    if (hub) return e(Empresas, { c: Object.assign({}, c, { opcoes: A.EMP.map((x) => 'Associação ' + x) }), valor, set });
    const grupos = [['ana.lima', ['Associação Aurora', 'Associação Boreal', 'Associação Cerrado']], ['ana.lima.delta', ['Associação Delta', 'Associação Estrela', 'Associação Farol']]];
    const misturou = grupos.filter(([, l]) => l.some((a) => valor.includes(a))).length > 1;
    return e('div', { className: 'au-campo' }, [
      e('span', { key: 'r', className: 'au-rot' }, c.rot),
      ...grupos.map(([u, lista]) => e('div', { key: u, className: 'au-login-sga' }, [
        e('div', { key: 'c', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 } }, [Ico('Users', 14, 'var(--muted)'), 'Login ', e('b', { key: 'b' }, u), e('span', { key: 's', className: 'au-tag', style: { background: 'var(--accent-soft)', color: 'var(--accent-fg)' } }, 'Preenchido pelo Hub')]),
        e('div', { key: 'l', className: 'au-lista-marcar' }, lista.map((a) => e('label', { key: a, className: 'au-marcar' }, [e('input', { key: 'i', type: 'checkbox', checked: valor.includes(a), onChange: () => set(valor.includes(a) ? valor.filter((x) => x !== a) : [...valor, a]) }), e('span', { key: 's' }, a.replace('Associação ', ''))]))),
      ])),
      misturou ? e('p', { key: 'm', className: 'au-erro' }, 'As associações marcadas usam logins diferentes no Hub. Marque apenas associações de um mesmo login ou informe usuário e senha.') : null,
      c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
    ]);
  }

  function Escolha({ c, valor, set }) {
    const [estado, setEstado] = useState('nada');
    const [busca, setBusca] = useState('');
    const [filtros, setFiltros] = useState((c.filtros || []).map((f) => f[0]));
    const vis = c.linhas.filter((l) => l.join(' ').toLowerCase().includes(busca.toLowerCase()) && filtros.every((f, i) => f === c.filtros[i][0] || l.join(' ').toLowerCase().includes(f.replace(/^Só /, '').toLowerCase().replace(/s$/, ''))));
    const id = (l) => l[0];
    const extra = (rot) => {
      if (/^(Selecionar as exibidas|Marcar todos)/.test(rot)) set([...new Set([...valor, ...vis.map(id)])]);
      else if (/^(Desmarcar)/.test(rot)) set(valor.filter((x) => !vis.some((l) => id(l) === x)));
      else if (/não salvas/.test(rot)) set(c.linhas.filter((l) => l.join(' ').includes('Não salva')).map(id));
      else set([]);
    };
    if (estado !== 'pronto') {
      return e('div', { className: 'au-campo' }, [
        c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
        e('div', { key: 'd', className: 'au-drop' }, estado === 'lendo'
          ? [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Ico('Loader2', 16, 'var(--au)')), 'Lendo…']
          : [Ico('Database', 16, 'var(--muted)'), e('span', { key: 't' }, 'Nada carregado ainda.'), e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', style: { marginLeft: 'auto' }, onClick: () => { setEstado('lendo'); setTimeout(() => { setEstado('pronto'); if (c.marcarTudo) set(c.linhas.map(id)); }, 1100); } }, c.botao)]),
      ]);
    }
    const todas = vis.length > 0 && vis.every((l) => valor.includes(id(l)));
    return e('div', { className: 'au-campo' }, [
      c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null,
      e('div', { key: 't', className: 'au-tabela-caixa' }, [
        e('div', { key: 'b', className: 'au-tabela-barra' }, [
          c.busca ? e('input', { key: 'q', type: 'search', className: 'au-input', placeholder: c.busca, value: busca, onChange: (ev) => setBusca(ev.target.value), 'aria-label': c.busca }) : null,
          ...(c.filtros || []).map((f, i) => e('select', { key: 'f' + i, className: 'au-input', value: filtros[i], onChange: (ev) => setFiltros(filtros.map((x, j) => (j === i ? ev.target.value : x))) }, f.map((o) => e('option', { key: o }, o)))),
          e('span', { key: 'n', style: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' } }, valor.length + ' de ' + c.linhas.length + ' marcadas'),
        ]),
        e('div', { key: 'r', className: 'au-tabela-rolagem' }, e('table', { className: 'au-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'm', style: { width: 32 } }, e('input', { type: 'checkbox', checked: todas, onChange: () => set(todas ? valor.filter((x) => !vis.some((l) => id(l) === x)) : [...new Set([...valor, ...vis.map(id)])]), 'aria-label': 'Marcar as exibidas' })), ...c.colunas.map((t) => e('th', { key: t }, t))])),
          e('tbody', { key: 'b' }, vis.map((l) => e('tr', { key: id(l), className: 'clicavel' + (valor.includes(id(l)) ? ' marcada' : ''), onClick: () => set(valor.includes(id(l)) ? valor.filter((x) => x !== id(l)) : [...valor, id(l)]) }, [
            e('td', { key: 'm' }, e('input', { type: 'checkbox', checked: valor.includes(id(l)), readOnly: true, tabIndex: -1, 'aria-label': id(l) })),
            ...l.map((x, i) => e('td', { key: i }, /^(Não salva|Não existe|Inativa)$/.test(x) ? e('span', { className: 'exu-sit' }, [e('i', { key: 'i' }), x]) : /^(Salva|Já existe|Ativa)/.test(x) ? e('span', { className: 'exu-sit concluido' }, [e('i', { key: 'i' }), x]) : x)),
          ]))),
        ])),
      ]),
      c.extras ? e('div', { key: 'x', className: 'au-mais' }, c.extras.map((b) => e('button', { key: b, type: 'button', className: 'exu-btn pequeno', onClick: () => extra(b) }, b))) : null,
    ]);
  }

  function ListaAdd({ c, valor, set, v }) {
    const [novo, setNovo] = useState(c.placeholders.map(() => ''));
    const deptos = (v.deptos || []).map((l) => l[0]);
    return e('div', { className: 'au-campo' }, [
      c.rot ? e('span', { key: 'r', className: 'au-rot' }, c.rot) : null,
      e('div', { key: 'n', className: 'au-com-botao' }, [
        e('div', { key: 'i', className: 'au-linha2' }, c.placeholders.map((p, i) => (p === '@deptos'
          ? e('select', { key: i, className: 'au-input', value: novo[i] || deptos[0], onChange: (ev) => setNovo(novo.map((x, j) => (j === i ? ev.target.value : x))), 'aria-label': 'Departamento' }, deptos.map((d) => e('option', { key: d }, d)))
          : e('input', { key: i, className: 'au-input', placeholder: p, value: novo[i], onChange: (ev) => setNovo(novo.map((x, j) => (j === i ? ev.target.value : x))), 'aria-label': p })))),
        e('button', { key: 'b', type: 'button', className: 'exu-btn', style: { flex: 'none' }, onClick: () => {
          const linha = novo.map((x, i) => (c.placeholders[i] === '@deptos' ? x || deptos[0] : x.trim()));
          if (linha.some((x) => !x)) return;
          set([...valor, linha]); setNovo(c.placeholders.map(() => ''));
        } }, c.botao || 'Adicionar'),
      ]),
      e('div', { key: 't', className: 'au-tabela-caixa' }, e('table', { className: 'au-tab' }, [
        e('thead', { key: 'h' }, e('tr', null, [...c.colunas.map((t) => e('th', { key: t }, t)), e('th', { key: 'x', style: { width: 40 } })])),
        e('tbody', { key: 'b' }, valor.map((l, i) => e('tr', { key: i }, [...l.map((x, j) => e('td', { key: j }, x)), e('td', { key: 'x' }, e('button', { type: 'button', className: 'exu-btn pequeno perigo', 'aria-label': 'Remover', onClick: () => set(valor.filter((_, k) => k !== i)) }, Ico('Trash2', 13, 'currentColor')))]))),
      ])),
    ]);
  }

  function Vincular({ valor, set, v }) {
    const roles = (v.roles || []).map((l) => l[2]);
    const grupos = ['ARX - CONSULTOR', 'ARX - CADASTRO', 'ARX - SUPERVISOR', 'Consultor externo', 'Gestor regional'];
    const [f, setF] = useState({ sis: 'Sistema: todos', assoc: 'Associação: todas', role: roles[0] || '', grupo: grupos[0] });
    const mostra = valor.filter((l) => (f.sis === 'Sistema: todos' || l[1] === f.sis) && (f.assoc === 'Associação: todas' || l[0] === f.assoc));
    return e('div', { className: 'au-campo' }, [
      e('div', { key: 'f', className: 'au-linha2' }, [
        e('select', { key: 's', className: 'au-input', value: f.sis, onChange: (ev) => setF(Object.assign({}, f, { sis: ev.target.value })) }, ['Sistema: todos', 'SGA', 'PowerCRM'].map((o) => e('option', { key: o }, o))),
        e('select', { key: 'a', className: 'au-input', value: f.assoc, onChange: (ev) => setF(Object.assign({}, f, { assoc: ev.target.value })) }, ['Associação: todas', ...A.EMP].map((o) => e('option', { key: o }, o))),
        e('select', { key: 'r', className: 'au-input', value: f.role, onChange: (ev) => setF(Object.assign({}, f, { role: ev.target.value })), 'aria-label': 'Role' }, roles.map((o) => e('option', { key: o }, o))),
        e('select', { key: 'g', className: 'au-input', value: f.grupo, onChange: (ev) => setF(Object.assign({}, f, { grupo: ev.target.value })), 'aria-label': 'Grupo' }, grupos.map((o) => e('option', { key: o }, o))),
      ]),
      e('div', { key: 'b' }, e('button', { type: 'button', className: 'exu-btn', onClick: () => set([...valor, [f.assoc === 'Associação: todas' ? 'Aurora' : f.assoc, f.sis === 'Sistema: todos' ? 'SGA' : f.sis, f.role, f.grupo]]) }, 'Vincular')),
      e('div', { key: 't', className: 'au-tabela-caixa' }, e('table', { className: 'au-tab' }, [
        e('thead', { key: 'h' }, e('tr', null, ['Associação', 'Sistema', 'Role', 'Grupo', ''].map((t, i) => e('th', { key: i }, t)))),
        e('tbody', { key: 'b' }, mostra.map((l, i) => e('tr', { key: i }, [...l.map((x, j) => e('td', { key: j }, x)), e('td', { key: 'x' }, e('button', { type: 'button', className: 'exu-btn pequeno perigo', 'aria-label': 'Remover vínculo', onClick: () => set(valor.filter((y) => y !== l)) }, Ico('Trash2', 13, 'currentColor')))]))),
      ])),
    ]);
  }

  function Campo({ c, v, set, tocado, avisar, hub }) {
    const [outro, setOutro] = useState(false);
    const valor = v[c.k];
    // com login no Hub: nada de campos de login, "Lembrar" nem textos sobre login
    if (hub && !outro) {
      if (c.t === 'lembrar' || (c.t === 'senha' && c.hub) || (c.t === 'ajuda' && SOBRE_LOGIN.test(c.texto))) return null;
      if (c.t === 'login' || c.t === 'logins-sga') {
        return e('div', { className: 'au-login-hub' }, [
          Ico('Lock', 13, 'currentColor'),
          e('span', { key: 't' }, c.t === 'logins-sga' ? 'Logins do SGA de Meus acessos, um por associação' : 'Login do ' + c.sistema + ' de Meus acessos'),
          e('button', { key: 'b', type: 'button', className: 'au-link', onClick: () => setOutro(true) }, 'Usar outro login'),
        ]);
      }
    }
    const mudar = (x) => set(c.k, x);
    const erro = tocado && c.obrig && vazio(valor) ? 'Obrigatório.' : '';
    const rot = (r) => (r ? e('label', { key: 'l', htmlFor: c.k }, r) : null);
    const ajuda = c.ajuda ? e(Ajuda, { key: 'a', texto: c.ajuda }) : null;
    const errEl = erro ? e('p', { key: 'e', className: 'au-erro' }, erro) : null;
    const [resposta, setResposta] = useState('');
    const botaoExtra = c.botao ? e('button', { key: 'b', type: 'button', className: 'exu-btn', style: { flex: 'none' }, onClick: () => { setResposta('…'); setTimeout(() => setResposta(c.botao.resposta), 800); } }, c.botao.rot) : null;
    const respEl = resposta ? e('div', { key: 'r', className: 'au-resposta' }, resposta === '…' ? 'Consultando…' : [Ico('Check', 14, 'currentColor'), resposta]) : null;

    switch (c.t) {
      case 'ajuda': return e(Ajuda, { texto: c.texto, destaque: c.destaque });
      case 'subtitulo': return e('h3', { className: 'au-sub' }, c.texto);
      case 'grupo': return e('div', { className: 'au-linha2' }, c.campos.filter((x) => visivel(x, v)).map((x) => e(Campo, { key: x.k, c: x, v, set, tocado, avisar, hub })));
      case 'empresas': return e(Empresas, { c, valor, set: mudar });
      case 'login': return e(Login, { c });
      case 'logins-sga': return e(LoginsSga, { c, avisar });
      case 'logins-assoc': return e(LoginsAssoc, { c, valor, set: mudar, hub: hub && !outro });
      case 'lembrar': return e('div', { className: 'au-lembrar' }, [e('label', { key: 'l', className: 'au-check' }, [e('input', { key: 'i', type: 'checkbox', defaultChecked: false }), 'Lembrar neste navegador']), e('button', { key: 'b', type: 'button', className: 'au-link', onClick: () => avisar('Logins esquecidos neste navegador (exemplo).', 'ok') }, 'Esquecer')]);
      case 'check': return e('label', { className: 'au-check' + (c.forte ? ' forte' : '') }, [e('input', { key: 'i', type: 'checkbox', checked: !!valor, onChange: (ev) => mudar(ev.target.checked) }), c.rot]);
      case 'checks': return e('div', { className: 'au-campo' }, [e('span', { key: 'r', className: 'au-rot' }, c.rot), e('div', { key: 'c', className: 'au-lembrar' }, c.opcoes.map((o) => e('label', { key: o, className: 'au-check' }, [e('input', { key: 'i', type: 'checkbox', checked: valor.includes(o), onChange: () => mudar(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o]) }), o])))]);
      case 'chips': return e('div', { className: 'au-campo' }, [e('span', { key: 'r', className: 'au-rot' }, c.rot), e('div', { key: 'c', className: 'au-chips' }, c.opcoes.map((o) => e('button', { key: o, type: 'button', className: 'au-chip', 'aria-pressed': valor.includes(o) ? 'true' : 'false', onClick: () => mudar(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o]) }, [valor.includes(o) ? Ico('Check', 12, 'currentColor', 2.5) : null, o]))), ajuda]);
      case 'campos-ordem': {
        const [filtro, setFiltro] = [v['_f' + c.k] || '', (x) => set('_f' + c.k, x)];
        return e('div', { className: 'au-campo' }, [
          e('span', { key: 'r', className: 'au-rot' }, c.rot),
          e('div', { key: 't', className: 'au-empresas-topo' }, [e('input', { key: 'f', type: 'search', className: 'au-input', placeholder: 'Filtrar campos', value: filtro, onChange: (ev) => setFiltro(ev.target.value), 'aria-label': 'Filtrar campos' }), e('button', { key: 'p', type: 'button', className: 'exu-btn pequeno', onClick: () => mudar(c.padrao.slice()) }, 'Padrão'), e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => mudar([]) }, 'Limpar')]),
          e('div', { key: 'c', className: 'au-chips' }, c.opcoes.filter((o) => o.toLowerCase().includes(filtro.toLowerCase())).map((o) => e('button', { key: o, type: 'button', className: 'au-chip', 'aria-pressed': valor.includes(o) ? 'true' : 'false', onClick: () => mudar(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o]) }, [valor.includes(o) ? e('span', { key: 'o', className: 'ordem' }, String(valor.indexOf(o) + 1)) : null, o]))),
          ajuda,
        ]);
      }
      case 'select': return e('div', { className: 'au-campo' }, [rot(c.rot), botaoExtra ? e('div', { key: 'c', className: 'au-com-botao' }, [e('select', { key: 's', id: c.k, value: valor, onChange: (ev) => mudar(ev.target.value) }, c.opcoes.map((o) => e('option', { key: o }, o))), botaoExtra]) : e('select', { key: 's', id: c.k, value: valor, onChange: (ev) => mudar(ev.target.value) }, c.opcoes.map((o) => e('option', { key: o }, o))), respEl, ajuda]);
      case 'radios': return e('div', { className: 'au-campo' }, [c.rot ? e('span', { key: 'r', className: 'au-rot' }, c.rot) : null, e('div', { key: 'o', className: 'au-radios', role: 'radiogroup' }, c.opcoes.map(([k, t, d]) => e('label', { key: k, className: 'au-radio' }, [e('input', { key: 'i', type: 'radio', name: c.k, checked: valor === k, onChange: () => mudar(k) }), e('div', { key: 't' }, [e('b', { key: 'b' }, t), e('small', { key: 's' }, d)])])))]);
      case 'alternar': return e('div', { className: 'au-alternar', role: 'group' }, c.opcoes.map(([k, t, d]) => e('button', { key: k, type: 'button', 'aria-pressed': valor === k ? 'true' : 'false', onClick: () => mudar(k) }, [e('b', { key: 'b' }, t), e('span', { key: 's' }, d)])));
      case 'area': return e('div', { className: 'au-campo' }, [rot(c.rot), e('textarea', { key: 't', id: c.k, className: (c.alto ? 'alto ' : '') + (c.mono ? 'mono' : ''), value: valor, placeholder: c.placeholder, spellCheck: false, onChange: (ev) => mudar(ev.target.value), 'aria-invalid': !!erro }), errEl, ajuda]);
      case 'senha': return e('div', { className: 'au-campo' }, [rot(c.rot), e('div', { key: 'i', className: c.hub ? 'au-preenchido' : '' }, [e('input', { key: 'i', id: c.k, type: 'password', value: valor, autoComplete: 'off', onChange: (ev) => mudar(ev.target.value) }), c.hub ? e('span', { key: 's', className: 'au-selo' }, 'Preenchido pelo Hub') : null]), errEl, ajuda]);
      case 'texto': return e('div', { className: 'au-campo' }, [rot(c.rot), botaoExtra ? e('div', { key: 'c', className: 'au-com-botao' }, [e('input', { key: 'i', id: c.k, type: 'text', className: c.mono ? 'mono' : '', value: valor, placeholder: c.placeholder, onChange: (ev) => mudar(ev.target.value) }), botaoExtra]) : e('input', { key: 'i', id: c.k, type: 'text', className: c.mono ? 'mono' : '', value: valor, placeholder: c.placeholder, onChange: (ev) => mudar(ev.target.value), 'aria-invalid': !!erro }), respEl, errEl, ajuda]);
      case 'meses': return e('div', { className: 'au-campo' }, [e('span', { key: 'r', className: 'au-rot' }, c.rot), e('div', { key: 'm', className: 'au-linha2' }, ['de', 'ate'].map((k) => e('input', { key: k, type: 'month', value: valor[k], 'aria-label': k === 'de' ? 'Mês inicial' : 'Mês final', onChange: (ev) => mudar(Object.assign({}, valor, { [k]: ev.target.value })) })))]);
      case 'arquivo': return e('div', { className: 'au-campo' }, [rot(c.rot), e('div', { key: 'd', className: 'au-drop' }, valor
        ? [Ico('Sheet', 18, 'var(--au)'), e('b', { key: 'n' }, valor), e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', style: { marginLeft: 'auto' }, onClick: () => mudar('') }, 'Trocar')]
        : [Ico('Upload', 18, 'var(--muted)'), e('span', { key: 't' }, c.aceita), e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', style: { marginLeft: 'auto' }, onClick: () => mudar(c.exemplo) }, 'Usar arquivo de exemplo')]), errEl]);
      case 'acao': {
        const falta = c.precisa && vazio(v[c.precisa]);
        return e('div', { className: 'au-campo' }, [e('div', { key: 'b' }, e('button', { type: 'button', className: 'exu-btn', disabled: falta, title: falta ? 'Escolha o arquivo primeiro' : '', onClick: () => { setResposta('…'); setTimeout(() => setResposta(c.resposta), 900); } }, [Ico('RefreshCw', 14, 'currentColor'), c.rot])), respEl]);
      }
      case 'acoes': return e('div', { className: 'au-mais' }, c.botoes.map((b) => e('button', { key: b, type: 'button', className: 'exu-btn pequeno', onClick: () => avisar(b + ' (exemplo).', 'ok') }, b)));
      case 'previa': return e('div', { className: 'au-tabela-caixa' }, [e('div', { key: 'b', className: 'au-tabela-barra', style: { fontSize: 12.5, fontWeight: 600 } }, [Ico('Eye', 14, 'var(--au)'), 'Como ficou a aba LEVES']), e('div', { key: 't', className: 'au-tabela-rolagem' }, e('table', { className: 'au-tab' }, [e('thead', { key: 'h' }, e('tr', null, c.colunas.map((t) => e('th', { key: t }, t)))), e('tbody', { key: 'b' }, c.linhas.map((l, i) => e('tr', { key: i }, l.map((x, j) => e('td', { key: j }, x)))))]))]);
      case 'tabela-edit': return e('div', { className: 'au-campo' }, [ajuda, e('div', { key: 't', className: 'au-tabela-caixa' }, e('table', { className: 'au-tab' }, [
        e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'm', style: { width: 32 } }), ...c.colunas.map((t) => e('th', { key: t }, t))])),
        e('tbody', { key: 'b' }, valor.map((l, i) => e('tr', { key: i }, [e('td', { key: 'm' }, e('input', { type: 'checkbox', defaultChecked: i < 3, 'aria-label': 'Usar ' + l[1] })), e('td', { key: 'c' }, l[0]), e('td', { key: 'd' }, l[1]), e('td', { key: 'n' }, e('input', { className: 'au-input', value: l[2], 'aria-label': 'Nome na descrição da cota', onChange: (ev) => mudar(valor.map((x, j) => (j === i ? [x[0], x[1], ev.target.value] : x))) }))]))),
      ]))]);
      case 'mapa': return e('div', { className: 'au-campo' }, [e('h3', { key: 'h', className: 'au-sub' }, c.rot), ajuda, e('div', { key: 't', className: 'au-tabela-caixa' }, e('table', { className: 'au-tab' }, [
        e('thead', { key: 'h' }, e('tr', null, [e('th', { key: 'o' }, 'Regional de origem'), e('th', { key: 'd' }, 'Regional no destino')])),
        e('tbody', { key: 'b' }, valor.map((l, i) => e('tr', { key: i }, [e('td', { key: 'o' }, l[0]), e('td', { key: 'd' }, e('select', { className: 'au-input', value: l[1], onChange: (ev) => mudar(valor.map((x, j) => (j === i ? [x[0], ev.target.value] : x))), 'aria-label': 'Regional no destino de ' + l[0] }, [e('option', { key: '', value: '' }, 'Escolha'), ...c.opcoes.map((o) => e('option', { key: o }, o))]))]))),
      ]))]);
      case 'escolha': return e(Escolha, { c, valor, set: mudar });
      case 'lista-add': return e(ListaAdd, { c, valor, set: mudar, v });
      case 'vincular': return e(Vincular, { valor, set: mudar, v });
      default: return null;
    }
  }

  // ---------------------------------------------------------------- tela ao vivo (desenho ilustrativo do SGA ou do PowerCRM)
  function TelaDesenhada({ sistema, passo, n }) {
    const campos = ['Nome', 'CPF', 'Usuário', 'E-mail', 'Situação', 'Grupo'];
    const ativo = n % campos.length;
    if (sistema === 'PowerCRM') {
      return e('div', { className: 'tv crm' }, [
        e('div', { key: 't', className: 'tv-topo' }, ['PowerCRM', e('span', { key: 's' }, 'app.powercrm.com.br')]),
        e('div', { key: 'k', className: 'tv-kanban' }, ['Vistorias', 'Liberadas', 'Cadastro', 'Filiação'].map((col, i) => e('div', { key: col, className: 'tv-coluna' }, [e('b', { key: 'b' }, col), ...[0, 1, 2].map((j) => e('div', { key: j, className: 'tv-card' + ((n + i + j) % 7 === 0 ? ' agora' : '') }))]))),
        e('div', { key: 'c', className: 'tv-cursor', style: { left: (20 + (n * 17) % 60) + '%', top: (35 + (n * 11) % 40) + '%' } }),
      ]);
    }
    return e('div', { className: 'tv sga' }, [
      e('div', { key: 't', className: 'tv-topo' }, ['SGA', e('span', { key: 's' }, 'sga.exemplo.com.br/v5')]),
      e('div', { key: 'm', className: 'tv-meio' }, [
        e('div', { key: 'm', className: 'tv-menu' }, [0, 1, 2, 3, 4, 5].map((i) => e('i', { key: i, className: i === 2 ? 'ativo' : '' }))),
        e('div', { key: 'c', className: 'tv-conteudo' }, [
          e('div', { key: 't', className: 'tv-titulo' }, (passo || 'Cadastro').slice(0, 60)),
          ...campos.map((cp, i) => e('div', { key: cp, className: 'tv-campo' + (i === ativo ? ' agora' : '') }, [e('b', { key: 'b' }, cp), e('span', { key: 's' }, i <= ativo ? '••••••' : '')])),
          e('div', { key: 'b', className: 'tv-botao' }, 'SALVAR'),
        ]),
      ]),
      e('div', { key: 'c', className: 'tv-cursor', style: { left: '58%', top: (36 + ativo * 9) + '%' } }),
    ]);
  }

  // Janela flutuante "Ao vivo": arrasta pelo topo, redimensiona pelo canto e minimiza numa bolinha pulsando.
  function Pip({ sistemas, passo, n, rodando }) {
    const [min, setMin] = useState(false);
    const [aba, setAba] = useState(sistemas[0]);
    const [pos, setPos] = useState(null);
    const [tam, setTam] = useState(null);
    const caixa = useRef(null);
    const arrastar = (ev, tipo) => {
      if (min) return;
      ev.preventDefault();
      const r = caixa.current.getBoundingClientRect();
      const x0 = ev.clientX, y0 = ev.clientY;
      const mover = (m) => {
        if (tipo === 'mover') setPos({ left: Math.max(0, r.left + m.clientX - x0), top: Math.max(0, r.top + m.clientY - y0) });
        else setTam({ width: Math.max(240, r.width + m.clientX - x0), height: Math.max(160, r.height + m.clientY - y0) });
      };
      const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    };
    const estilo = min ? null : Object.assign({}, pos ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' } : null, tam || null);
    return e('div', { ref: caixa, className: 'pip' + (min ? ' minimizado' : ''), style: estilo, role: 'region', 'aria-label': 'Tela ao vivo da automação' }, [
      e('div', { key: 'c', className: 'pip-cab', onPointerDown: (ev) => { if (!ev.target.closest('button')) arrastar(ev, 'mover'); }, onClick: () => { if (min) setMin(false); } }, [
        e('div', { key: 'e', className: 'pip-esq' }, [
          e('span', { key: 'v', className: 'pip-vivo' }, [e('i', { key: 'i' }), 'Ao vivo']),
          sistemas.length > 1 ? e('div', { key: 'a', className: 'pip-abas' }, sistemas.map((s) => e('button', { key: s, type: 'button', 'aria-pressed': aba === s ? 'true' : 'false', onClick: () => setAba(s) }, s))) : null,
        ]),
        e('button', { key: 'm', type: 'button', className: 'pip-min', title: min ? 'Abrir a tela ao vivo' : 'Minimizar', 'aria-label': min ? 'Abrir a tela ao vivo' : 'Minimizar', onClick: (ev) => { ev.stopPropagation(); setMin(!min); } },
          min ? [Ico('Eye', 20, '#fff'), e('span', { key: 'p', className: 'pip-ponto-vivo' })] : 'Min.'),
      ]),
      e('div', { key: 'b', className: 'pip-corpo' }, rodando || n ? e(TelaDesenhada, { sistema: aba, passo, n }) : e('p', { style: { color: '#a1a1a1', fontSize: 12, textAlign: 'center', marginTop: 70 } }, 'Aguardando o início do navegador da automação.')),
      e('div', { key: 's', className: 'pip-estado', title: 'Último evento da automação' }, passo || 'Aguardando'),
      e('div', { key: 'r', className: 'pip-alca', onPointerDown: (ev) => arrastar(ev, 'tamanho') }),
    ]);
  }

  // ---------------------------------------------------------------- resultados
  function Resultado({ def, exec, v, avisar, repetir }) {
    const res = exec.resultados;
    const [filtro, setFiltro] = useState('todos');
    const [empresa, setEmpresa] = useState('Todas');
    const [agrupar, setAgrupar] = useState(false);
    const [ver, setVer] = useState({});
    const [abertos, setAbertos] = useState({});
    const conta = (s) => res.filter((r) => r.sit === s).length;
    const lista = res.filter((r) => (filtro === 'todos' || r.sit === filtro) && (empresa === 'Todas' || r.item.empresa === empresa));
    const empresas = [...new Set(res.map((r) => r.item.empresa).filter(Boolean))];
    const pill = (r) => e('span', { className: 'exu-sit ' + SIT[r.sit] }, [e('i', { key: 'i' }), r.texto]);
    const kpis = e('div', { key: 'k', className: 'au-kpis' }, [['ok', 'Check'], ['aviso', 'AlertCircle'], ['erro', 'X']].map(([s, ic]) => e('button', { key: s, type: 'button', className: 'au-kpi ' + s, 'aria-pressed': filtro === s ? 'true' : 'false', onClick: () => setFiltro(filtro === s ? 'todos' : s) }, [e('i', { key: 'i' }, Ico(ic, 16, 'currentColor', 2.25)), e('div', { key: 't' }, [e('b', { key: 'b' }, String(conta(s))), e('small', { key: 's' }, ROT_SIT[s])])])));
    const copiar = () => { avisar('Resultados copiados (exemplo).', 'ok'); };
    const baixarCsv = (cols, linhas) => {
      const csv = [cols.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      a.download = 'resultado-' + chave + '.csv';
      a.click();
    };
    const acoesTopo = [
      conta('erro') && !exec.rodando ? e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', onClick: repetir }, 'Rodar de novo só os erros (' + conta('erro') + ')') : null,
      def.arquivoFinal && !exec.rodando ? e('button', { key: 'z', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar(def.arquivoFinal + ' baixado (exemplo).', 'ok') }, [Ico('Download', 13, 'currentColor'), def.arquivoFinal]) : null,
    ];
    let corpo;
    if (def.resultadoTipo === 'senhas') {
      const grupos = agrupar ? empresas.map((emp) => [emp, lista.filter((r) => r.item.empresa === emp)]) : [[null, lista]];
      corpo = [
        e('p', { key: 'a', className: 'au-aviso-res' }, def.avisoResultado),
        e('div', { key: 'f', className: 'au-res-filtros' }, [
          e('label', { key: 'e' }, ['Empresa ', e('select', { key: 's', className: 'au-input', value: empresa, onChange: (ev) => setEmpresa(ev.target.value) }, ['Todas', ...empresas].map((o) => e('option', { key: o }, o)))]),
          e('label', { key: 's' }, ['Situação ', e('select', { key: 's', className: 'au-input', value: filtro, onChange: (ev) => setFiltro(ev.target.value) }, [['todos', 'Todas'], ['ok', 'Sucesso'], ['erro', 'Erro']].map(([k, t]) => e('option', { key: k, value: k }, t)))]),
          e('label', { key: 'g', className: 'au-check' }, [e('input', { key: 'i', type: 'checkbox', checked: agrupar, onChange: (ev) => setAgrupar(ev.target.checked) }), 'Agrupar por empresa']),
          e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', onClick: copiar }, [Ico('Copy', 13, 'currentColor'), 'Copiar resultados']),
        ]),
        e('p', { key: 'd', className: 'au-ajuda', style: { margin: '8px 0 12px' } }, '"Copiar resultados" copia as linhas exibidas, com a empresa e sem as senhas. A senha de cada linha tem Mostrar e Copiar.'),
        e('div', { key: 't', className: 'au-tabela-caixa' }, e('div', { className: 'au-tabela-rolagem', style: { maxHeight: 480 } }, e('table', { className: 'au-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, ['Empresa', 'Alvo', 'Usuário', 'Situação', 'Senha', 'Tentativas', 'Observações'].map((t) => e('th', { key: t }, t)))),
          e('tbody', { key: 'b' }, grupos.flatMap(([emp, rs]) => [
            emp ? e('tr', { key: 'g' + emp }, e('td', { colSpan: 7, style: { fontWeight: 600, background: 'var(--au-suave)' } }, emp)) : null,
            ...rs.map((r, i) => { const id = r.item.empresa + r.item.nome; return e('tr', { key: id + i }, [
              e('td', { key: 'e' }, r.item.empresa), e('td', { key: 'a' }, r.item.nome), e('td', { key: 'u' }, r.item.usuario || ''), e('td', { key: 's' }, pill(r)),
              e('td', { key: 'p' }, r.senha ? e('span', { className: 'au-senha' }, [ver[id] ? r.senha : '••••••••', e('button', { key: 'm', type: 'button', className: 'exu-btn pequeno', onClick: () => setVer(Object.assign({}, ver, { [id]: !ver[id] })) }, ver[id] ? 'Ocultar' : 'Mostrar'), e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar('Senha copiada (exemplo).', 'ok') }, 'Copiar')]) : ''),
              e('td', { key: 't' }, String(r.tentativas)), e('td', { key: 'o' }, r.detalhe || ''),
            ]); }),
          ])),
        ]))),
      ];
    } else if (def.resultadoTipo === 'arvore') {
      const json = JSON.stringify(res.map((r) => ({ base: r.item.empresa, itens: r.filhos.map((f) => f[0]) })), null, 2);
      corpo = [
        e('div', { key: 'b', className: 'au-mais', style: { marginBottom: 10 } }, [
          e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar('JSON copiado (exemplo).', 'ok') }, 'Copiar JSON'),
          e('button', { key: 'd', type: 'button', className: 'exu-btn pequeno', onClick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = chave + '.json'; a.click(); } }, 'Baixar JSON'),
          e('button', { key: 'e', type: 'button', className: 'exu-btn pequeno', onClick: () => setAbertos(Object.fromEntries(res.map((r, i) => [i, true]))) }, 'Expandir todas'),
          e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', onClick: () => setAbertos({}) }, 'Recolher todas'),
        ]),
        e('p', { key: 'a', className: 'au-ajuda', style: { marginBottom: 10 } }, 'O JSON traz, por empresa, os itens lidos com o id no CRM, além do estado do salvamento.'),
        e('div', { key: 't', className: 'au-tabela-caixa' }, e('div', { className: 'au-tabela-rolagem', style: { maxHeight: 480 } }, e('table', { className: 'au-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, def.colunasArvore.map((t) => e('th', { key: t }, t)))),
          e('tbody', { key: 'b' }, res.flatMap((r, i) => [
            e('tr', { key: 'p' + i, className: 'clicavel', onClick: () => setAbertos(Object.assign({}, abertos, { [i]: !abertos[i] })) }, [
              e('td', { key: 'n', colSpan: def.colunasArvore.length - 1 }, e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 } }, [e('span', { key: 's', style: { display: 'inline-block', transform: abertos[i] ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' } }, Ico('ChevronDown', 14, 'currentColor')), r.item.empresa, e('span', { key: 'q', className: 'exu-tipo' }, r.filhos.length + (r.filhos.length === 1 ? ' item' : ' itens'))])),
              e('td', { key: 's' }, pill(r)),
            ]),
            ...(abertos[i] ? r.filhos.map((f, j) => e('tr', { key: 'f' + i + j, className: 'filho' }, f.map((x, k) => e('td', { key: k }, k === f.length - 1 ? e('span', { className: 'exu-sit concluido' }, [e('i', { key: 'i' }), x]) : x)))) : []),
          ])),
        ]))),
      ];
    } else if (def.resultadoTipo === 'resumo') {
      corpo = res.map((r, i) => e('div', { key: i }, [e('div', { key: 's', style: { marginBottom: 12 } }, pill(r)), e('dl', { key: 'd', className: 'au-resumo' }, r.resumo.flatMap(([k, x]) => [e('dt', { key: 't' + k }, k), e('dd', { key: 'd' + k, style: k === 'O que fazer' ? { fontWeight: 600, color: 'var(--au)' } : null }, x)]))]));
    } else if (def.resultadoTipo === 'arquivos') {
      corpo = [
        kpis,
        e('div', { key: 't', className: 'au-tabela-caixa' }, e('div', { className: 'au-tabela-rolagem', style: { maxHeight: 420 } }, e('table', { className: 'au-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, ['Empresa', 'Mês ou data', 'Status', 'Arquivo ou detalhe'].map((t) => e('th', { key: t }, t)))),
          e('tbody', { key: 'b' }, lista.map((r, i) => e('tr', { key: i }, [e('td', { key: 'e' }, r.item.empresa), e('td', { key: 'm' }, r.item.nome), e('td', { key: 's' }, pill(r)),
            e('td', { key: 'a' }, r.sit === 'ok' ? e('button', { type: 'button', className: 'au-link', style: { color: 'var(--au)' }, onClick: () => avisar(r.detalhe + ' baixado (exemplo).', 'ok') }, [Ico('Download', 13, 'currentColor'), ' ' + r.detalhe + (r.linhas ? ' · ' + r.linhas.toLocaleString('pt-BR') + ' linhas' : '')]) : r.detalhe)]))),
        ]))),
      ];
    } else {
      const cols = def.colunas || ['Item', 'Status', 'Detalhe'];
      const celulas = (r) => (def.celulas ? def.celulas(r).map((x) => (x === null ? pill(r) : x)) : cols.map((col) => (/^(Status|Situação)$/.test(col) ? pill(r) : /^(Empresa|Associação)$/.test(col) && cols[0] !== col ? r.item.empresa || '' : col === 'Sistema' ? r.item.sistema || '' : col === 'Sistemas' ? e('span', { className: 'au-chips' }, (r.sistemas || []).map((s) => e('span', { key: s, className: 'exu-tipo' }, s))) : /^(Detalhe|Observações)$/.test(col) ? r.detalhe || '' : r.item.nome)));
      corpo = [
        kpis,
        e('div', { key: 'f', className: 'au-res-filtros', style: { marginBottom: 10 } }, [
          e('label', { key: 's' }, ['Situação ', e('select', { key: 's', className: 'au-input', value: filtro, onChange: (ev) => setFiltro(ev.target.value) }, [['todos', 'Todas'], ['ok', 'Sucesso'], ['aviso', 'Aviso'], ['erro', 'Erro']].map(([k, t]) => e('option', { key: k, value: k }, t)))]),
          e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', onClick: copiar }, [Ico('Copy', 13, 'currentColor'), 'Copiar resultados']),
          e('button', { key: 'd', type: 'button', className: 'exu-btn pequeno', onClick: () => baixarCsv(cols, lista.map((r) => celulas(r).map((x) => (typeof x === 'string' ? x : r.texto)))) }, [Ico('Download', 13, 'currentColor'), 'Baixar CSV']),
        ]),
        e('div', { key: 't', className: 'au-tabela-caixa' }, e('div', { className: 'au-tabela-rolagem', style: { maxHeight: 480 } }, e('table', { className: 'au-tab' }, [
          e('thead', { key: 'h' }, e('tr', null, cols.map((t) => e('th', { key: t }, t)))),
          e('tbody', { key: 'b' }, lista.map((r, i) => e('tr', { key: i }, celulas(r).map((x, j) => e('td', { key: j }, x))))),
        ]))),
      ];
    }
    return e('section', { className: 'au-card larga' }, [
      e('div', { key: 'c', className: 'au-res-topo' }, [e('h2', { key: 'h', style: { margin: 0 } }, [e('span', { key: 'n', className: 'au-num' }, 'Fim'), def.resultadoTipo === 'arquivos' ? 'Arquivos' : 'Resultado']), e('div', { key: 'a', className: 'au-mais' }, acoesTopo)]),
      ...[].concat(corpo),
    ]);
  }

  function Mensagens({ exec, v, avisar }) {
    const ok = exec.resultados.filter((r) => r.sit === 'ok');
    const porEmpresa = [...new Set(ok.map((r) => r.item.empresa))];
    if (!porEmpresa.length || v.teste || !String(v.valor || '').trim()) {
      return e('section', { className: 'au-card larga' }, [e('h2', { key: 'h' }, 'Mensagens para o WhatsApp'), e('p', { key: 'p', className: 'au-ajuda' }, 'Preencha o "Valor do cálculo (R$)" e rode fora do modo teste para montar as mensagens de cada empresa.')]);
    }
    return e('section', { className: 'au-card larga' }, [
      e('h2', { key: 'h' }, 'Mensagens para o WhatsApp'),
      e('p', { key: 'p', className: 'au-ajuda', style: { marginBottom: 12 } }, 'Montadas com os números do "Resumo" de cada arquivo. É possível editar antes de copiar ou abrir no WhatsApp.'),
      e('div', { key: 'm', className: 'au-msgs' }, porEmpresa.map((emp) => {
        const cotas = ok.filter((r) => r.item.empresa === emp).reduce((s, r) => s + (r.cotas || 0), 0);
        const texto = '*Rateio ' + emp + '*\nCotas da base: ' + cotas.toLocaleString('pt-BR') + '\nValor do cálculo: R$ ' + v.valor + '\nValor por cota: R$ ' + (Number(String(v.valor).replace(/\./g, '').replace(',', '.')) / Math.max(1, cotas)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return e('div', { key: emp, className: 'au-msg' }, [e('b', { key: 'b' }, emp), e('textarea', { key: 't', defaultValue: texto, 'aria-label': 'Mensagem da ' + emp }), e('div', { key: 'a', className: 'au-mais' }, [e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar('Mensagem copiada (exemplo).', 'ok') }, 'Copiar'), e('button', { key: 'w', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar('Abriria o WhatsApp com a mensagem (exemplo).', 'ok') }, [Ico('MessageCircle', 13, 'currentColor'), 'Abrir no WhatsApp'])])]);
      })),
    ]);
  }

  // ---------------------------------------------------------------- tela
  function Tela() {
    const [aba, setAba] = useState(RAIZ.abas ? RAIZ.abas[0].k : null);
    const def = RAIZ.abas ? Object.assign({}, RAIZ, RAIZ.abas.find((x) => x.k === aba)) : RAIZ;
    const [v, setV] = useState(() => valoresIniciais(RAIZ));
    const [tocado, setTocado] = useState(false);
    const [execs, setExecs] = useState({});
    const [hist, setHist] = useState(false);
    const [avisar, avisos] = useAvisos();
    const hub = useLoginHub();
    const parar = useRef(false);
    const logRef = useRef(null);
    const exec = execs[aba || 'unica'] || null;
    const setExec = (f) => setExecs((x) => Object.assign({}, x, { [aba || 'unica']: f(x[aba || 'unica']) }));
    const set = (k, x) => setV((o) => Object.assign({}, o, { [k]: x }));
    const campos = todosCampos(def.secoes).filter((c) => visivel(c, v));
    const faltam = campos.filter((c) => c.obrig && vazio(v[c.k])).map((c) => c.rot || c.k);
    let itens = [];
    try { itens = def.itens(v); } catch (err) { itens = []; }
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [exec && exec.log.length]);
    useEffect(() => { document.title = RAIZ.titulo.replace(/^ARX /, 'ARX ') + ' (exemplo)'; }, []);

    const iniciar = (lista) => {
      setTocado(true);
      if (faltam.length || !lista.length) { avisar(faltam.length ? 'Preencha: ' + faltam.join(', ') + '.' : 'Nada para processar.', 'erro'); return; }
      parar.current = false;
      const teste = v.teste;
      setExec(() => ({ itens: lista, feitos: 0, rodando: true, n: 0, atual: 'Abrindo o navegador da automação', log: [[hora(), 'Execução iniciada: ' + (lista.length === 1 ? '1 item' : lista.length + ' itens') + (teste ? ' (modo teste)' : '')]], resultados: [], inicio: Date.now() }));
      let i = 0;
      const proximo = () => {
        if (parar.current || i >= lista.length) {
          setExec((x) => Object.assign({}, x, { rodando: false, log: [...x.log, [hora(), parar.current ? 'Cancelamento solicitado. Parado depois do item atual.' : 'Execução terminada.']] }));
          avisar(parar.current ? 'Execução parada.' : 'Execução terminada.', 'ok');
          return;
        }
        const item = lista[i];
        const passos = def.passos(item);
        let p = 0;
        const passo = () => {
          if (p < passos.length) {
            const t = passos[p++];
            setExec((x) => Object.assign({}, x, { atual: t, n: x.n + 1, log: [...x.log, [hora(), t]] }));
            setTimeout(passo, 320 + Math.random() * 420);
            return;
          }
          const r = def.resultado(item, i, v);
          setExec((x) => Object.assign({}, x, { feitos: x.feitos + 1, resultados: [...x.resultados, Object.assign({ item }, r)], log: [...x.log, [hora(), (r.sit === 'erro' ? 'Erro: ' : '') + item.nome + (item.empresa ? ' (' + item.empresa + ')' : '') + ': ' + r.texto + (r.detalhe && r.sit !== 'ok' ? '. ' + r.detalhe : ''), r.sit === 'erro']] }));
          i++;
          setTimeout(proximo, 160);
        };
        passo();
      };
      setTimeout(proximo, 500);
    };

    const pct = exec ? Math.round((exec.feitos / exec.itens.length) * 100) : 0;
    const resta = exec && exec.feitos && exec.rodando ? Math.max(1, Math.round(((Date.now() - exec.inicio) / exec.feitos) * (exec.itens.length - exec.feitos) / 1000)) : null;
    const empresasExec = exec ? [...new Set(exec.itens.map((x) => x.empresa).filter(Boolean))] : [];
    const modoTela = (v.modo || v.modoCrm) === 'tela';
    const sistemas = (def.sistemas || ['SGA']).filter((s) => !(s === 'SGA' && v.sga === false) && !(s === 'PowerCRM' && v.crm === false));
    let numero = 0;

    return e('main', { className: 'au-tela' }, [
      e('header', { key: 'c', className: 'au-cab' }, [
        e('div', { key: 't', className: 'au-cab-titulo' }, [e('span', { key: 'i', className: 'au-icone' }, Ico(RAIZ.icone, 22, 'currentColor')), e('div', { key: 'x' }, [e('h1', { key: 'h' }, RAIZ.titulo), e('p', { key: 'p' }, RAIZ.sub)])]),
        e('div', { key: 'a', className: 'au-cab-acoes' }, [
          e('span', { key: 'e', className: 'au-tag' }, 'Exemplo: dados fictícios'),
          e('span', { key: 's', className: 'exu-sit ' + (exec && exec.rodando ? 'rodando' : 'concluido') }, [e('i', { key: 'i' }), exec && exec.rodando ? 'Executando' : 'No ar']),
          RAIZ.historico ? e('button', { key: 'h', type: 'button', className: 'exu-btn', 'aria-pressed': hist ? 'true' : 'false', onClick: () => setHist(!hist) }, [Ico('History', 14, 'currentColor'), typeof RAIZ.historico === 'string' ? RAIZ.historico : 'Histórico de execuções']) : null,
        ]),
      ]),
      RAIZ.abas ? e('div', { key: 'abas', className: 'au-abas', role: 'tablist' }, RAIZ.abas.map((x) => e('button', { key: x.k, type: 'button', role: 'tab', className: 'au-aba', 'aria-selected': aba === x.k ? 'true' : 'false', onClick: () => { setAba(x.k); setTocado(false); } }, [e('b', { key: 'b' }, x.titulo), e('span', { key: 's' }, x.desc)]))) : null,
      hist ? e('section', { key: 'hist', className: 'au-card' }, [
        e('div', { key: 'c', className: 'au-res-topo' }, [e('h2', { key: 'h', style: { margin: 0 } }, typeof RAIZ.historico === 'string' ? RAIZ.historico : 'Histórico de execuções'), e('button', { key: 'b', type: 'button', className: 'exu-btn pequeno', onClick: () => avisar('Histórico atualizado.', 'ok') }, 'Atualizar')]),
        e('ul', { key: 'l', className: 'au-hist' }, [['Hoje, 10:42', 'Ana Lima', 12, 1, '2 min 10 s'], ['Ontem, 16:05', 'Bruno Costa', 4, 0, '48 s'], ['18/10, 09:30', 'Ana Lima', 30, 3, '6 min 02 s'], ['16/10, 14:12', 'Carla Nunes', 2, 0, '21 s']].map(([q, quem, n, err, dur], i) => e('li', { key: i }, [
          e('div', { key: 't' }, [e('b', { key: 'b' }, q + ' · ' + quem), e('small', { key: 's' }, n + (n === 1 ? ' item' : ' itens') + ' em ' + dur)]),
          e('span', { key: 'a', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [e('span', { key: 's', className: 'exu-sit ' + (err ? 'pendencia' : 'concluido') }, [e('i', { key: 'i' }), err ? err + (err === 1 ? ' erro' : ' erros') : 'Sem erros']), RAIZ.historico === 'Leituras feitas' ? e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno perigo', onClick: () => avisar('Leitura apagada (exemplo).', 'ok') }, 'Apagar') : null]),
        ]))),
      ]) : null,
      e('div', { key: 'g', className: 'au-grade' + (def.umaColuna ? ' uma' : '') }, def.secoes.filter((s) => !(hub && s.soLogin)).map((s, i) => {
        if (!s.semNumero) numero = s.numero || numero + 1;
        return e('section', { key: aba + i, className: 'au-card' + (s.larga ? ' larga' : '') }, [
          e('h2', { key: 'h' }, [s.semNumero ? null : e('span', { key: 'n', className: 'au-num' }, String(s.numero || numero)), s.titulo]),
          e('div', { key: 'c', className: 'au-campos' }, [
            ...s.campos.filter((c) => visivel(c, v)).map((c, j) => e(Campo, { key: (c.k || c.t) + j, c, v, set, tocado, avisar, hub })),
            s.iniciar ? e('div', { key: 'ini', className: 'au-iniciar' }, [
              exec && exec.rodando
                ? e('button', { key: 'p', type: 'button', className: 'exu-btn perigo', onClick: () => { parar.current = true; } }, [Ico('Square', 14, 'currentColor'), 'Parar'])
                : e('button', { key: 'i', type: 'button', className: 'au-btn-iniciar', onClick: () => iniciar(itens) }, [Ico('Play', 14, 'currentColor'), s.iniciar]),
              e('span', { key: 'q', style: { fontSize: 12.5, color: 'var(--muted)' } }, itens.length ? (itens.length === 1 ? '1 item a processar' : itens.length + ' itens a processar') : 'Nada a processar ainda'),
            ]) : null,
          ]),
        ]);
      })),
      modoTela && exec ? e('section', { key: 'vnc', className: 'au-card' }, [
        e('h2', { key: 'h' }, 'Navegador ao vivo'),
        e('p', { key: 'p', className: 'au-ajuda', style: { marginBottom: 12 } }, 'Navegador real do servidor, que exibe o login e o preenchimento. Evite clicar na tela enquanto a automação é executada.'),
        e('div', { key: 'v', className: 'au-vnc' }, e(TelaDesenhada, { sistema: sistemas[0], passo: exec.atual, n: exec.n })),
      ]) : null,
      e('section', { key: 'acomp', className: 'au-card' }, [
        e('div', { key: 'c', className: 'au-res-topo', style: { marginBottom: 0 } }, [
          e('h2', { key: 'h', style: { margin: 0 } }, def.tituloLog || 'Acompanhamento'),
          exec && exec.rodando ? e('button', { key: 'p', type: 'button', className: 'exu-btn pequeno perigo', onClick: () => { parar.current = true; } }, 'Parar execução') : null,
        ]),
        e('div', { key: 'l', className: 'au-progresso-linha', style: { marginTop: 12 } }, [
          e('span', { key: 'a' }, exec ? (exec.rodando ? exec.atual : 'Terminado: ' + exec.resultados.filter((r) => r.sit === 'ok').length + ' com sucesso, ' + exec.resultados.filter((r) => r.sit === 'erro').length + ' com erro') : 'Aguardando início'),
          exec ? e('b', { key: 'b' }, exec.feitos + ' de ' + exec.itens.length + ' · ' + pct + '%' + (resta ? ' · cerca de ' + resta + ' s' : '')) : null,
        ]),
        exec ? e('div', { key: 'p', className: 'au-progresso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, e('div', { style: { width: pct + '%' } })) : null,
        empresasExec.length > 1 ? e('div', { key: 'e', className: 'au-empresas-exec' }, empresasExec.map((emp) => {
          const t = exec.itens.filter((x) => x.empresa === emp).length, f = exec.resultados.filter((r) => r.item.empresa === emp).length;
          return e('span', { key: emp, className: 'exu-sit ' + (f === t ? 'concluido' : f ? 'rodando' : '') }, [e('i', { key: 'i' }), emp + ' ' + f + '/' + t]);
        })) : null,
        e('div', { key: 'log', ref: logRef, className: 'au-log', role: 'log' }, exec ? exec.log.map((l, i) => e('div', { key: i, className: l[2] ? 'erro' : '' }, [e('span', { key: 't', className: 't' }, l[0] + '  '), l[1]])) : e('span', { className: 'vazio' }, 'O log da execução aparece aqui.')),
      ]),
      exec && exec.resultados.length ? e(Resultado, { key: 'res' + aba, def, exec, v, avisar, repetir: () => iniciar(exec.resultados.filter((r) => r.sit === 'erro').map((r) => r.item)) }) : null,
      exec && def.resultadoTipo === 'arquivos' && !exec.rodando ? e(Mensagens, { key: 'msg', exec, v, avisar }) : null,
      exec && !modoTela ? e(Pip, { key: 'pip', sistemas, passo: exec.atual, n: exec.n, rodando: exec.rodando }) : null,
      avisos,
    ]);
  }

  const raiz = document.getElementById('root');
  if (ReactDOM.createRoot) ReactDOM.createRoot(raiz).render(e(Tela)); else ReactDOM.render(e(Tela), raiz);
})();
