// Meus acessos: guarda os logins (só no navegador) e entrega às automações abertas no Hub.
// Expõe window.ArxAcessosHub e window.MeusAcessosBotao (usado no cabeçalho do app.js).
//
// - Um lugar só para os acessos do Hub: token do GLPI (aba Chamados), logins
//   do SGA (cada um com as empresas em que funciona), PowerCRM e senha padrão
//   dos novos usuários. Ficam só no localStorage deste navegador.
// - Ponte: a automação aberta numa aba do Hub (iframe) pede os acessos com
//   postMessage { type: 'arx-acessos-pedido' } (biblioteca arx-acessos.js de
//   cada automação). O Hub só responde se quem pediu é um iframe desta página
//   e o endereço dele é o de uma automação cadastrada no Hub; a resposta vai
//   só para esse endereço. O token do GLPI nunca sai daqui.
(function () {
  const e = React.createElement;
  const { useState, useEffect } = React;
  const { Icon } = window.Icons;

  const KEY_ACESSOS = 'arxhub_chamados_acessos_v2';
  const KEY_TOKEN_HUB = 'arxhub_glpi_user_token'; // o mesmo token do "Abrir chamado"
  const SERVICO = `${location.protocol}//${location.hostname}:4013`; // chamados-glpi
  const PRAZO_PEDIDO_MS = 1100; // a automação espera ~1,5 s pela resposta

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const minusculo = (s) => String(s == null ? '' : s).trim().toLowerCase();

  // ---------- armazenamento ----------
  function lerGuardado() {
    try {
      const v = localStorage.getItem(KEY_ACESSOS);
      return v === null ? null : JSON.parse(v);
    } catch {
      return null;
    }
  }
  function tokenDoHub() {
    try {
      return localStorage.getItem(KEY_TOKEN_HUB) || '';
    } catch {
      return '';
    }
  }

  /** Formato salvo: { userToken, sgas: [{ usuario, senha, empresas }], crm: { usuario, senha }, senhaPadrao, pronto, nomeGlpi }. */
  function normalizar(a) {
    const base = a && typeof a === 'object' ? copia(a) : { pronto: false };
    if (!base.userToken) base.userToken = tokenDoHub();
    // vários logins do SGA (a mesma senha não vale em todo SGA); `empresas: null` = todas
    if (!Array.isArray(base.sgas)) base.sgas = base.sga && base.sga.usuario ? [{ ...base.sga, empresas: null }] : [];
    delete base.sga;
    base.sgas = base.sgas
      .filter((l) => l && typeof l === 'object')
      .map((l) => ({ usuario: l.usuario || '', senha: l.senha || '', empresas: Array.isArray(l.empresas) ? l.empresas : null }));
    const crm = base.crm && typeof base.crm === 'object' ? base.crm : {};
    base.crm = { usuario: crm.usuario || '', senha: crm.senha || '' };
    base.senhaPadrao = base.senhaPadrao || '';
    base.pronto = !!base.pronto;
    return base;
  }

  let atual = normalizar(lerGuardado());
  const ouvintes = new Set();

  function avisar() {
    ouvintes.forEach((fn) => {
      try {
        fn(copia(atual));
      } catch {
        // um ouvinte com erro não atrapalha os outros
      }
    });
    reenviar();
  }

  function salvar(novo) {
    atual = normalizar(novo);
    try {
      localStorage.setItem(KEY_ACESSOS, JSON.stringify(atual));
    } catch {
      // sem storage: vale só enquanto a tela estiver aberta
    }
    avisar();
    return copia(atual);
  }

  // salvo em outra aba do navegador
  window.addEventListener('storage', (ev) => {
    if (ev.key !== KEY_ACESSOS && ev.key !== KEY_TOKEN_HUB) return;
    atual = normalizar(lerGuardado());
    avisar();
  });

  const loginOk = (l) => !!(l && l.usuario && l.senha);
  const crmOk = (a) => !!(a.crm && a.crm.usuario && a.crm.senha);

  /** O que falta configurar (texto para o usuário). */
  function faltando(a) {
    const x = a || atual;
    const falta = [];
    if (!x.sgas.some(loginOk)) falta.push('login do SGA');
    if (!crmOk(x)) falta.push('PowerCRM');
    if (!x.senhaPadrao) falta.push('senha padrão');
    if (!x.userToken) falta.push('token do GLPI');
    return falta;
  }

  // ---------- empresas (chaves do contexto `sga`) ----------
  async function buscarJson(url, ms) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), ms || 8000) : null;
    try {
      const resp = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
      return dados;
    } finally {
      if (t) clearTimeout(t);
    }
  }

  // códigos de um contexto: aceita ['ancore'] ou [{ codigo: 'ancore', nome }]
  const textoCodigo = (c) => (c && typeof c === 'object' ? c.codigo : c);
  function codigosEmTexto(codigos) {
    const out = {};
    Object.entries(codigos || {}).forEach(([ctx, lista]) => {
      out[ctx] = (Array.isArray(lista) ? lista : []).map(textoCodigo).filter((x) => x != null && x !== '').map(String);
    });
    return out;
  }

  let cadastro = null; // [{ id, nome, ativo, codigos }] do cadastro único (via chamados-glpi)
  let opcoesSga = null; // [{ chave, nome }] do /api/opcoes do chamados-glpi (reserva)
  let buscandoEmpresas = null;

  /** Cadastro único primeiro; o /api/opcoes do chamados-glpi completa (ou substitui, se o cadastro não vier). */
  function carregarEmpresas(forcar) {
    if (buscandoEmpresas) return buscandoEmpresas;
    if (cadastro && !forcar) return Promise.resolve(listaEmpresas());
    buscandoEmpresas = Promise.all([
      buscarJson(SERVICO + '/api/associacoes').then((d) => (Array.isArray(d) ? d : d && d.associacoes) || null).catch(() => null),
      buscarJson(SERVICO + '/api/opcoes').then((o) => (o && Array.isArray(o.empresasSga) ? o.empresasSga : null)).catch(() => null),
    ]).then(([assoc, opcoes]) => {
      const tinhaCadastro = !!cadastro;
      if (assoc) cadastro = assoc;
      if (opcoes) opcoesSga = opcoes;
      buscandoEmpresas = null;
      // quem pediu antes do cadastro carregar recebeu só as chaves; manda de novo completo
      if (!tinhaCadastro && cadastro) reenviar();
      return listaEmpresas();
    });
    return buscandoEmpresas;
  }

  /** [{ chave, nome }] para os chips: associações ativas do cadastro único + o que só o chamados-glpi conhece. */
  function listaEmpresas() {
    const out = [];
    const vistas = new Set();
    const por = (chave, nome) => {
      const k = minusculo(chave);
      if (!k || vistas.has(k)) return;
      vistas.add(k);
      out.push({ chave: String(chave), nome: nome || String(chave) });
    };
    (cadastro || []).forEach((a) => {
      if (a.ativo === false) return;
      const sga = ((a.codigos || {}).sga || []).filter((c) => textoCodigo(c));
      sga.forEach((c) => por(textoCodigo(c), sga.length > 1 ? `${a.nome} · ${(c && c.nome) || textoCodigo(c)}` : a.nome));
    });
    (opcoesSga || []).forEach((x) => por(x.chave, x.nome));
    return out;
  }

  /** Chaves de empresa em que o login vale (sem nenhuma marcada = todas as conhecidas). */
  function chavesDoLogin(l) {
    if (l && Array.isArray(l.empresas) && l.empresas.length) return l.empresas.slice();
    return listaEmpresas().map((x) => x.chave);
  }

  /** Login do SGA que cobre a empresa (o primeiro que a tiver marcada). */
  function loginDaEmpresa(sgas, chave) {
    const lista = Array.isArray(sgas) ? sgas : atual.sgas;
    const alvo = minusculo(chave);
    return lista.find((l) => loginOk(l) && (!Array.isArray(l.empresas) || !l.empresas.length || l.empresas.some((k) => minusculo(k) === alvo))) || null;
  }

  // ---------- ponte com as automações ----------
  /** Associações do login no formato do protocolo: [{ id, nome, codigos: { sga: [...], ... } }]. */
  function associacoesDoLogin(l) {
    const chaves = chavesDoLogin(l);
    if (!cadastro) return chaves.map((ch) => ({ id: null, nome: ch, codigos: { sga: [ch] } }));
    const out = [];
    const porId = new Map();
    chaves.forEach((ch) => {
      const alvo = minusculo(ch);
      const a = cadastro.find((x) => ((x.codigos || {}).sga || []).some((c) => minusculo(textoCodigo(c)) === alvo));
      if (!a) {
        out.push({ id: null, nome: ch, codigos: { sga: [ch] } });
        return;
      }
      let item = porId.get(a.id);
      if (!item) {
        // os outros contextos (alt-status, glpi...) vão inteiros; `sga` só com as chaves marcadas neste login
        item = { id: a.id, nome: a.nome, codigos: { ...codigosEmTexto(a.codigos), sga: [] } };
        porId.set(a.id, item);
        out.push(item);
      }
      item.codigos.sga.push(ch);
    });
    return out;
  }

  /** O que vai para as automações (nunca o token do GLPI). */
  function dadosParaAutomacoes() {
    return {
      sga: atual.sgas.filter(loginOk).map((l) => ({ usuario: l.usuario, senha: l.senha, associacoes: associacoesDoLogin(l) })),
      crm: crmOk(atual) ? { usuario: atual.crm.usuario, senha: atual.crm.senha } : null,
      senhaPadrao: atual.senhaPadrao || null,
    };
  }
  const temAlgo = (d) => !!(d.sga.length || d.crm || d.senhaPadrao);

  let automacoes = null; // lista do GET /api/automations do Hub
  let buscandoAutomacoes = null;
  let ultimaBuscaAutomacoes = 0;
  function carregarAutomacoes(forcar) {
    if (buscandoAutomacoes) return buscandoAutomacoes;
    if (automacoes && !forcar) return Promise.resolve(automacoes);
    ultimaBuscaAutomacoes = Date.now();
    buscandoAutomacoes = buscarJson('/api/automations', 6000)
      .then((d) => {
        automacoes = Array.isArray(d) ? d : (d && d.automations) || [];
        return automacoes;
      })
      .catch(() => automacoes || [])
      .finally(() => {
        buscandoAutomacoes = null;
      });
    return buscandoAutomacoes;
  }

  const comPrazo = (promessa, ms, reserva) => Promise.race([promessa, new Promise((r) => setTimeout(() => r(reserva), Math.max(0, ms)))]);
  const portaDe = (u) => u.port || (u.protocol === 'https:' ? '443' : '80');

  /** O endereço (protocolo+host+porta) é o de uma automação cadastrada? */
  function origemCadastrada(origem, lista) {
    let o;
    try {
      o = new URL(origem);
    } catch {
      return false;
    }
    return (lista || []).some((a) => {
      let u;
      try {
        u = new URL(a.url, location.href);
      } catch {
        return false;
      }
      if (u.origin === o.origin) return true;
      // Hub aberto por outro nome da mesma máquina (localhost, IP...): mesma porta da automação, no host do Hub
      return o.hostname === location.hostname && o.protocol === u.protocol && portaDe(o) === portaDe(u);
    });
  }

  function ehIframeDaPagina(janela) {
    if (!janela) return false;
    const quadros = document.getElementsByTagName('iframe');
    for (let i = 0; i < quadros.length; i++) if (quadros[i].contentWindow === janela) return true;
    return false;
  }

  // janela do iframe -> { origem, recebeu } de quem pediu (recebeu: já ganhou dados alguma vez)
  const pedidos = new Map();

  function enviar(janela, pedido) {
    const d = dadosParaAutomacoes();
    // nada configurado: a automação fica no modo de digitar; só avisa quem já tinha recebido algo (pra esquecer)
    if (!temAlgo(d) && !pedido.recebeu) return;
    try {
      janela.postMessage({ type: 'arx-acessos', versao: 1, sga: d.sga, crm: d.crm, senhaPadrao: d.senhaPadrao }, pedido.origem);
      pedido.recebeu = temAlgo(d);
    } catch {
      // iframe fechado ou em outro endereço: o navegador descarta
    }
  }

  // acessos novos (ou o cadastro carregou): reenvia a quem já pediu
  function reenviar() {
    pedidos.forEach((pedido, janela) => {
      if (!ehIframeDaPagina(janela)) {
        pedidos.delete(janela);
        return;
      }
      enviar(janela, pedido);
    });
  }

  async function atenderPedido(janela, origem) {
    const limite = Date.now() + PRAZO_PEDIDO_MS;
    let lista = await comPrazo(carregarAutomacoes(), limite - Date.now(), automacoes || []);
    // automação cadastrada há pouco: busca a lista de novo (no máximo a cada 10 s)
    if (!origemCadastrada(origem, lista) && Date.now() - ultimaBuscaAutomacoes > 10000) {
      lista = await comPrazo(carregarAutomacoes(true), Math.max(300, limite - Date.now()), automacoes || []);
    }
    if (!origemCadastrada(origem, lista) || !ehIframeDaPagina(janela)) return;
    const pedido = { origem, recebeu: false };
    pedidos.set(janela, pedido);
    if (!temAlgo(dadosParaAutomacoes())) return;
    if (!cadastro) await comPrazo(carregarEmpresas(), Math.max(200, limite - Date.now()), null);
    enviar(janela, pedido);
  }

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!m || typeof m !== 'object' || m.type !== 'arx-acessos-pedido') return;
    if (!ev.origin || ev.origin === 'null' || !ehIframeDaPagina(ev.source)) return;
    atenderPedido(ev.source, ev.origin);
  });

  // adianta as listas se já há algo para entregar
  if (temAlgo(dadosParaAutomacoes())) {
    carregarAutomacoes();
    carregarEmpresas();
  }

  // ---------- editor (modal "Meus acessos" e primeira tela da aba Chamados) ----------
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', animation: 'fadeInUp 0.3s ease both' },
    label: { fontSize: 11.5, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 },
    input: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' },
    btnPrim: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    btnSec: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--secondary)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    link: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 },
    chip: (sel) => ({ padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)'), background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--muted)' }),
  };

  const campo = (rotulo, filho, key) => e('div', { key: key || rotulo }, [e('div', { key: 'l', style: S.label }, rotulo), filho]);
  const inp = (valor, onChange, extra = {}) => e('input', { className: 'field-input', value: valor || '', onChange: (ev) => onChange(ev.target.value), style: S.input, ...extra });
  const loginVazio = () => ({ usuario: '', senha: '', empresas: null });

  async function testarToken(userToken) {
    const resp = await fetch(SERVICO + '/api/glpi/testar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ glpi: { userToken } }) });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
    return dados;
  }

  /**
   * Formulário dos acessos.
   * exigirChamados: pede tudo o que a aba Chamados usa (token, SGA e PowerCRM), como na primeira vez.
   * moldura: 'card' (tela solta) ou 'nenhuma' (dentro do modal).
   */
  function EditorAcessos({ exigirChamados, moldura, aoSalvar, aoCancelar }) {
    const [inicial] = useState(() => copia(atual));
    const [a, setA] = useState(() => {
      const x = copia(atual);
      if (!x.sgas.length) x.sgas = [loginVazio()];
      return x;
    });
    const [erro, setErro] = useState(null);
    const [testando, setTestando] = useState(false);
    const [empresas, setEmpresas] = useState(listaEmpresas);
    const [carregando, setCarregando] = useState(!cadastro && !opcoesSga);
    const mudar = (fn) => setA((x) => fn(copia(x)));

    useEffect(() => {
      let vivo = true;
      carregarEmpresas().then((l) => {
        if (vivo) {
          setEmpresas(l);
          setCarregando(false);
        }
      });
      return () => {
        vivo = false;
      };
    }, []);

    // chips: lista conhecida + chaves já marcadas que a lista não tem (pra não sumirem)
    const chips = empresas.slice();
    a.sgas.forEach((l) => (l.empresas || []).forEach((k) => {
      if (!chips.some((x) => minusculo(x.chave) === minusculo(k))) chips.push({ chave: k, nome: k });
    }));
    const todas = chips.map((x) => x.chave);

    // marcar uma empresa num login tira ela dos outros (cada empresa usa um login só)
    function alternarEmpresa(i, chave) {
      mudar((x) => {
        const atualI = x.sgas[i].empresas || todas;
        const marcar = !atualI.includes(chave);
        x.sgas = x.sgas.map((l, j) => {
          const emp = l.empresas || todas;
          if (j === i) return { ...l, empresas: marcar ? [...emp, chave] : emp.filter((k) => k !== chave) };
          return marcar ? { ...l, empresas: emp.filter((k) => k !== chave) } : l;
        });
        return x;
      });
    }

    async function salvarForm() {
      setErro(null);
      const logins = a.sgas.filter((l) => l.usuario || l.senha);
      if (logins.some((l) => !l.usuario || !l.senha)) return setErro('Cada login do SGA precisa de usuário e senha.');
      if (todas.length && logins.some((l) => l.empresas && !l.empresas.length)) return setErro('Cada login do SGA precisa de ao menos uma empresa marcada.');
      if ((a.crm.usuario || a.crm.senha) && !(a.crm.usuario && a.crm.senha)) return setErro('Informe o usuário e a senha do PowerCRM (ou deixe os dois vazios).');
      if (exigirChamados) {
        if (!a.userToken) return setErro('Informe o token do GLPI.');
        if (!logins.length) return setErro('Informe ao menos um login do SGA.');
        if (!a.crm.usuario || !a.crm.senha) return setErro('Informe o usuário e a senha do PowerCRM.');
      }
      const novo = { ...a, sgas: logins.map((l) => ({ ...l, empresas: l.empresas || (todas.length ? todas : null) })) };
      // o token só é conferido no GLPI quando muda (ou nunca foi conferido)
      let tokenConferido = !!a.userToken && a.userToken === inicial.userToken && !!inicial.nomeGlpi;
      if (a.userToken && !tokenConferido) {
        setTestando(true);
        try {
          const r = await testarToken(a.userToken);
          novo.nomeGlpi = r.usuario && r.usuario.nome;
          tokenConferido = true;
        } catch (err) {
          setTestando(false);
          return setErro(`O GLPI não aceitou o token: ${err.message}`);
        }
        setTestando(false);
      }
      if (!a.userToken) delete novo.nomeGlpi;
      novo.pronto = tokenConferido && novo.sgas.some(loginOk) && crmOk(novo);
      const salvo = salvar(novo);
      if (aoSalvar) aoSalvar(salvo);
    }

    const conteudo = [
      e('div', { key: 'h' }, [
        moldura === 'card' ? e('div', { key: 't', style: { fontWeight: 600, fontSize: 16 } }, exigirChamados ? 'Acessos para rodar os chamados' : 'Meus acessos') : null,
        e('div', { key: 's', style: { color: 'var(--muted)', fontSize: 12.5, marginTop: moldura === 'card' ? 4 : 0, lineHeight: 1.5 } },
          'Os dados ficam salvos somente neste navegador. As automações abertas no Hub recebem os logins do SGA, do PowerCRM e a senha padrão. O token do GLPI não sai deste navegador. Na aba Chamados, o titular do token é quem aprova, e o chamado fica atribuído a essa pessoa.'),
      ]),
      campo(exigirChamados ? 'Token de usuário do GLPI' : 'Token de usuário do GLPI (aba Chamados)', inp(a.userToken, (v) => mudar((x) => ((x.userToken = v.trim()), x)), { type: 'password', autoComplete: 'new-password', placeholder: 'Minhas configurações → Chaves de acesso remoto' }), 'tk'),
      e('div', { key: 'sga-t', style: { ...S.label, marginBottom: -6 } }, 'Logins do SGA (cada um com as empresas em que funciona)'),
      ...a.sgas.map((l, i) =>
        e('div', { key: 'sga' + i, className: 'acessos-login', style: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)' } }, [
          e('div', { key: 'r', className: 'acessos-linha', style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' } }, [
            campo('Usuário do SGA', inp(l.usuario, (v) => mudar((x) => ((x.sgas[i].usuario = v), x)), { autoComplete: 'off' }), 'su'),
            campo('Senha do SGA', inp(l.senha, (v) => mudar((x) => ((x.sgas[i].senha = v), x)), { type: 'password', autoComplete: 'new-password' }), 'ss'),
            a.sgas.length > 1
              ? e('button', { key: 'rm', type: 'button', style: { ...S.link, color: 'var(--error)', marginBottom: 10 }, onClick: () => mudar((x) => ((x.sgas = x.sgas.filter((_, j) => j !== i)), x)) }, 'Remover')
              : e('span', { key: 'rm' }),
          ]),
          chips.length
            ? e('div', { key: 'emp', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, chips.map((emp) => {
                const sel = (l.empresas || todas).includes(emp.chave);
                return e('button', { key: emp.chave, type: 'button', style: S.chip(sel), onClick: () => alternarEmpresa(i, emp.chave) }, emp.nome);
              }))
            : e('div', { key: 'emp', style: { fontSize: 12, color: 'var(--muted)' } }, carregando ? 'Carregando as empresas…' : 'Falha ao carregar a lista de empresas. Este login vale para todas.'),
        ])
      ),
      e('button', { key: 'sga-add', type: 'button', style: { ...S.link, alignSelf: 'flex-start' }, onClick: () => mudar((x) => (x.sgas.push({ usuario: '', senha: '', empresas: [] }), x)) }, '+ Adicionar outro login do SGA'),
      e('div', { key: 'crm', className: 'acessos-linha', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } }, [
        campo('Usuário (e-mail) do PowerCRM', inp(a.crm.usuario, (v) => mudar((x) => ((x.crm.usuario = v), x)), { autoComplete: 'off' }), 'cu'),
        campo('Senha do PowerCRM', inp(a.crm.senha, (v) => mudar((x) => ((x.crm.senha = v), x)), { type: 'password', autoComplete: 'new-password' }), 'cs'),
      ]),
      campo('Senha padrão dos novos usuários no SGA (Cadastro de usuário)', inp(a.senhaPadrao, (v) => mudar((x) => ((x.senhaPadrao = v), x)), { type: 'password', autoComplete: 'new-password' }), 'sp'),
      erro ? e('div', { key: 'err', className: 'acessos-erro', style: { color: 'var(--error)', fontSize: 12.5 } }, erro) : null,
      e('div', { key: 'b', style: { display: 'flex', gap: 10 } }, [
        e('button', { key: 'ok', type: 'button', className: 'btn-primary acessos-salvar', style: { ...S.btnPrim, flex: 1, opacity: testando ? 0.7 : 1 }, disabled: testando, onClick: salvarForm },
          testando ? 'Conferindo o token…' : exigirChamados ? 'Salvar e ver os chamados' : 'Salvar'),
        aoCancelar ? e('button', { key: 'c', type: 'button', className: 'btn-outline', style: S.btnSec, onClick: aoCancelar }, 'Cancelar') : null,
      ]),
    ];

    if (moldura === 'card') return e('div', { className: 'acessos-editor', style: { maxWidth: 560, margin: '30px auto 0', ...S.card, gap: 14, padding: 22 } }, conteudo);
    return e('div', { className: 'acessos-editor', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, conteudo);
  }

  // ---------- modal (raiz própria, aberta de qualquer lugar) ----------
  let raizModal = null;
  let modalAberto = false;

  function ModalAcessos() {
    useEffect(() => {
      const tecla = (ev) => {
        if (ev.key === 'Escape') fecharEditor();
      };
      document.addEventListener('keydown', tecla);
      return () => document.removeEventListener('keydown', tecla);
    }, []);
    return e('div', {
      className: 'acessos-modal-fundo',
      onMouseDown: (ev) => {
        if (ev.target === ev.currentTarget) fecharEditor();
      },
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 78, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    }, e('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Meus acessos',
      style: { width: '100%', maxWidth: 600, maxHeight: '88vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 60px -12px rgba(0,0,0,0.16)', animation: 'modalIn 0.15s ease both', color: 'var(--text)' },
    }, [
      e('div', { key: 'cab', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' } }, [
        e('span', { key: 'i', className: 'glpi-head-icon' }, iconeChave(15)),
        e('div', { key: 't', style: { fontWeight: 600, fontSize: 15.5, flex: 1 } }, 'Meus acessos'),
        e('button', { key: 'x', type: 'button', className: 'icon-btn', title: 'Fechar', onClick: fecharEditor, style: { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', borderRadius: 7 } }, Icon('X', 13)),
      ]),
      e('div', { key: 'corpo', style: { padding: 20 } }, e(EditorAcessos, { moldura: 'nenhuma', aoSalvar: fecharEditor, aoCancelar: fecharEditor })),
    ]));
  }

  function desenharModal() {
    if (!raizModal) {
      const div = document.createElement('div');
      div.id = 'arx-acessos-modal';
      document.body.appendChild(div);
      raizModal = ReactDOM.createRoot(div);
    }
    raizModal.render(modalAberto ? e(ModalAcessos) : null);
  }
  function abrirEditor() {
    modalAberto = true;
    desenharModal();
  }
  function fecharEditor() {
    modalAberto = false;
    desenharModal();
  }

  // ---------- botão do cabeçalho ----------
  // ícone de chave (o icons.js não tem)
  function iconeChave(tamanho, cor) {
    const c = cor || 'currentColor';
    return e('svg', { width: tamanho || 15, height: tamanho || 15, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0, display: 'block' } }, [
      e('path', { key: 'p', d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' }),
      e('circle', { key: 'c', cx: 16.5, cy: 7.5, r: 0.5, fill: c }),
    ]);
  }

  function MeusAcessosBotao() {
    const [a, setA] = useState(() => copia(atual));
    useEffect(() => aoMudar(setA), []);
    const falta = faltando(a);
    // o pontinho aparece quando falta o que as automações usam (SGA ou PowerCRM)
    const alerta = falta.includes('login do SGA') || falta.includes('PowerCRM');
    return e('button', {
      type: 'button',
      className: 'btn-outline meus-acessos-btn',
      onClick: abrirEditor,
      title: falta.length ? 'Meus acessos · falta configurar: ' + falta.join(', ') : 'Meus acessos: logins entregues às automações abertas no Hub (salvos só neste navegador)',
      'aria-label': 'Meus acessos',
      style: { position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' },
    }, [
      e('span', { key: 'i', style: { display: 'flex' } }, iconeChave(15)),
      e('span', { key: 't', className: 'meus-acessos-label' }, 'Meus acessos'),
      alerta ? e('span', { key: 'p', className: 'meus-acessos-pendente', 'aria-hidden': 'true', style: { position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: 'var(--warn)', border: '2px solid var(--card)' } }) : null,
    ]);
  }

  /** Avisa a cada mudança (salvo aqui ou em outra aba). Devolve a função que para de avisar. */
  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => {
      ouvintes.delete(fn);
    };
  }

  window.ArxAcessosHub = {
    ler: () => copia(atual),
    salvar,
    aoMudar,
    abrirEditor,
    fecharEditor,
    faltando,
    loginDaEmpresa,
    chavesDoLogin,
    carregarEmpresas,
    empresas: listaEmpresas,
    dadosParaAutomacoes,
    EditorAcessos,
  };
  window.MeusAcessosBotao = MeusAcessosBotao;
})();
