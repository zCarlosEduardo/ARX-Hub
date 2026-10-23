// Janela da extensão ARX SGA: cria o cofre (senha mestra), destrava, cadastra os logins do SGA com as empresas em que
// cada um vale, liga e desliga o "Entrar sozinho" e apaga os cookies do SGA na hora. Os logins só ficam abertos em
// memória enquanto a janela está aberta; no armazenamento vai só o pacote cifrado (regras.js).
(function () {
  const R = window.ArxRegras;
  const EMPRESAS = module.exports.EMPRESAS_SGA;
  const tela = document.getElementById('tela');
  const travarBtn = document.getElementById('travar');
  const estado = document.getElementById('estado');
  document.getElementById('versao').textContent = 'Versão ' + chrome.runtime.getManifest().version;
  const situacao = (texto, classe) => { estado.textContent = texto; estado.className = 'estado ' + (classe || ''); };
  let chave = null; // CryptoKey do cofre aberto
  let pacote = null;
  let logins = [];

  function h(tag, props, filhos) {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    });
    (filhos || []).filter((f) => f !== null && f !== undefined && f !== false).forEach((f) => n.append(f));
    return n;
  }
  const msg = (texto, tipo) => h('p', { className: 'msg ' + (tipo || 'ok'), role: tipo === 'erro' ? 'alert' : 'status' }, [texto]);
  const mostrar = (...nos) => tela.replaceChildren(...nos);
  const nomeEmpresa = (chaveEmp) => (EMPRESAS.find((e) => e.chave === chaveEmp) || { nome: chaveEmp }).nome;

  async function salvar() {
    pacote = await R.cifrar(chave, R.deB64(pacote.sal), logins);
    await chrome.storage.local.set({ cofre: pacote });
  }

  // ---------- sem cofre: criar a senha mestra ----------
  function telaCriar() {
    travarBtn.hidden = true;
    situacao('Sem cofre');
    const s1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const s2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const erro = h('div');
    mostrar(h('form', {
      className: 'caixa',
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (s1.value !== s2.value) return erro.replaceChildren(msg('As duas senhas não conferem.', 'erro'));
        try {
          const novo = await R.criarCofre(s1.value);
          chave = novo.chave; pacote = novo.pacote; logins = [];
          await chrome.storage.local.set({ cofre: pacote, auto: true });
          await chrome.storage.session.set({ chave: await R.exportarChave(chave) });
          telaAberta();
        } catch (e) { erro.replaceChildren(msg(e.message, 'erro')); }
      },
    }, [
      h('h2', {}, ['Criar a senha mestra']),
      h('p', { className: 'dica' }, ['Os logins do SGA ficam cifrados nesta extensão com essa senha. Sem ela não dá para recuperar os logins.']),
      h('label', {}, ['Senha mestra (8 caracteres ou mais)', s1]),
      h('label', {}, ['Repita a senha mestra', s2]),
      erro,
      h('div', { className: 'acoes' }, [h('button', { type: 'submit', className: 'primario' }, ['Criar cofre'])]),
    ]));
    s1.focus();
  }

  // ---------- cofre travado: destravar (vale até fechar o navegador) ----------
  function telaTravada() {
    travarBtn.hidden = true;
    situacao('Travado', 'travado');
    const senha = h('input', { type: 'password', autocomplete: 'current-password' });
    const erro = h('div');
    mostrar(h('form', {
      className: 'caixa',
      onsubmit: async (ev) => {
        ev.preventDefault();
        try {
          const aberto = await R.abrirCofre(senha.value, pacote);
          chave = aberto.chave; logins = aberto.logins;
          await chrome.storage.session.set({ chave: await R.exportarChave(chave) });
          telaAberta();
        } catch (e) { erro.replaceChildren(msg(e.message, 'erro')); senha.select(); }
      },
    }, [
      h('h2', {}, ['Destravar']),
      h('p', { className: 'dica' }, ['Fica destravado até você fechar o navegador ou clicar em Travar.']),
      h('label', {}, ['Senha mestra', senha]),
      erro,
      h('div', { className: 'acoes' }, [
        h('button', { type: 'button', className: 'texto perigo', onclick: apagarTudo }, ['Esqueci a senha']),
        h('button', { type: 'submit', className: 'primario' }, ['Destravar']),
      ]),
    ]));
    senha.focus();
  }

  async function apagarTudo() {
    if (!confirm('Apagar o cofre e todos os logins guardados nesta extensão? Você vai cadastrá-los de novo.')) return;
    await chrome.storage.local.remove('cofre');
    await chrome.storage.session.remove('chave');
    pacote = null; chave = null; logins = [];
    telaCriar();
  }

  // ---------- cofre aberto: logins, entrar sozinho e cookies ----------
  async function telaAberta(aviso) {
    travarBtn.hidden = false;
    situacao('Destravado: entra sozinho no SGA', 'aberto');
    const { auto } = await chrome.storage.local.get('auto');
    const lista = logins.length
      ? logins.map((l, i) => h('div', { className: 'login' }, [
          h('span', { className: 'avatar', 'aria-hidden': 'true' }, [l.usuario.slice(0, 1)]),
          h('div', { className: 'nome' }, [
            h('b', {}, [l.usuario]),
            // até 4 empresas em selos; o resto vira "+N"
            h('div', { className: 'selos' }, l.empresas.slice(0, 4).map((c) => h('span', { className: 'selo' }, [nomeEmpresa(c)])).concat(l.empresas.length > 4 ? [h('span', { className: 'selo', title: l.empresas.slice(4).map(nomeEmpresa).join(', ') }, ['+' + (l.empresas.length - 4)])] : [])),
          ]),
          h('button', { type: 'button', className: 'texto', onclick: () => telaLogin(i) }, ['Editar']),
        ]))
      : [h('div', { className: 'vazio' }, [h('b', {}, ['Nenhum login guardado']), h('span', { className: 'dica' }, ['Adicione o login do SGA e marque as empresas em que ele vale.'])])];
    const autoChave = h('input', { type: 'checkbox', className: 'chave', checked: auto !== false, onchange: (ev) => chrome.storage.local.set({ auto: ev.target.checked }) });
    const resultado = h('div');
    mostrar(
      h('section', { className: 'caixa' }, [
        h('div', { className: 'linha' }, [h('h2', {}, ['Logins do SGA']), h('span', { className: 'esp' }), h('button', { type: 'button', onclick: () => telaLogin(-1) }, ['Adicionar'])]),
        ...lista,
      ]),
      h('section', { className: 'caixa' }, [
        h('label', { className: 'linha' }, [h('span', { className: 'esp' }, ['Entrar sozinho na tela de login']), autoChave]),
        h('p', { className: 'dica' }, ['Na tela de login de uma empresa, preenche o login dela e clica em Entrar.']),
      ]),
      h('section', { className: 'caixa' }, [
        h('div', { className: 'linha' }, [
          h('p', { className: 'esp' }, ['Erro de cookies no SGA']),
          h('button', {
            type: 'button',
            onclick: async () => {
              const r = await chrome.runtime.sendMessage({ tipo: 'limpar-cookies' });
              resultado.replaceChildren(r && !r.erro ? msg(r.removidos === 1 ? '1 cookie do SGA apagado.' : r.removidos + ' cookies do SGA apagados.') : msg('Não foi possível apagar os cookies.', 'erro'));
            },
          }, ['Limpar cookies']),
        ]),
        h('p', { className: 'dica' }, ['Acontece sozinho quando aparece "Cookie Too Large". As abas abertas do SGA saem e entram de novo.']),
        resultado,
      ]),
      aviso ? msg(aviso) : null,
    );
  }

  // ---------- um login: usuário, senha e empresas (cada empresa fica num login só) ----------
  function telaLogin(i) {
    const atual = i >= 0 ? logins[i] : { usuario: '', senha: '', empresas: [] };
    const usuario = h('input', { type: 'text', value: atual.usuario, autocomplete: 'off' });
    const senha = h('input', { type: 'password', value: atual.senha, autocomplete: 'new-password' });
    const emOutro = new Map();
    logins.forEach((l, j) => { if (j !== i) l.empresas.forEach((c) => emOutro.set(c, l.usuario)); });
    const marcas = EMPRESAS.map((e) => {
      const cb = h('input', { type: 'checkbox', value: e.chave, checked: atual.empresas.includes(e.chave) });
      return h('label', { className: emOutro.has(e.chave) ? 'usada' : '', title: emOutro.has(e.chave) ? 'Hoje no login ' + emOutro.get(e.chave) + '; marcar aqui tira de lá' : '' }, [cb, e.nome]);
    });
    const erro = h('div');
    mostrar(h('form', {
      className: 'caixa',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const empresas = marcas.map((m) => m.querySelector('input')).filter((c) => c.checked).map((c) => c.value);
        if (!usuario.value.trim() || !senha.value) return erro.replaceChildren(msg('Informe usuário e senha.', 'erro'));
        if (!empresas.length) return erro.replaceChildren(msg('Marque ao menos uma empresa.', 'erro'));
        const novo = { usuario: usuario.value.trim(), senha: senha.value, empresas };
        logins = logins.map((l, j) => (j === i ? novo : { ...l, empresas: l.empresas.filter((c) => !empresas.includes(c)) }));
        if (i < 0) logins.push(novo);
        await salvar();
        telaAberta('Login salvo.');
      },
    }, [
      h('h2', {}, [i >= 0 ? 'Editar login' : 'Novo login']),
      h('label', {}, ['Usuário do SGA', usuario]),
      h('label', {}, ['Senha do SGA', senha]),
      h('div', { className: 'campo' }, [h('p', { className: 'rotulo-empresas' }, ['Empresas em que esse login vale']), h('div', { className: 'empresas' }, marcas)]),
      erro,
      h('div', { className: 'acoes' }, [
        i >= 0 ? h('button', { type: 'button', className: 'texto perigo', onclick: async () => { logins.splice(i, 1); await salvar(); telaAberta('Login removido.'); } }, ['Remover']) : null,
        h('button', { type: 'button', className: 'texto', onclick: () => telaAberta() }, ['Cancelar']),
        h('button', { type: 'submit', className: 'primario' }, ['Salvar']),
      ]),
    ]));
    usuario.focus();
  }

  travarBtn.addEventListener('click', async () => {
    await chrome.storage.session.remove('chave');
    chave = null; logins = [];
    telaTravada();
  });

  (async function iniciar() {
    ({ cofre: pacote } = await chrome.storage.local.get('cofre'));
    if (!pacote) return telaCriar();
    const { chave: guardada } = await chrome.storage.session.get('chave');
    if (guardada) {
      try {
        chave = await R.importarChave(guardada);
        logins = await R.decifrar(chave, pacote);
        return telaAberta();
      } catch (e) { /* chave de outro cofre: pede a senha */ }
    }
    telaTravada();
  })();
})();
