// Meus acessos: guarda os logins (só no navegador) e entrega às automações abertas no Hub.
// Expõe window.ArxAcessosHub e window.MeusAcessosBotao (usado no cabeçalho do app.js).
//
// - Um lugar só para os acessos do Hub: token do GLPI (aba Chamados), logins
//   do SGA (cada um com as empresas em que funciona), PowerCRM e senha padrão
//   dos novos usuários. Ficam só neste navegador e CIFRADOS no cofre (cofre.js,
//   com a senha mestra da pessoa): nada de segredo em texto puro no disco.
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
  const KEY_TOKEN_HUB = 'arxhub_glpi_user_token'; // o mesmo token do "Abrir chamado" (só legado: o cofre guarda o token)
  const cofre = window.ArxCofre; // null se o navegador bloqueia o armazenamento
  const SERVICO = `${location.origin}/servicos/chamados`; // chamados-glpi
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
    // com cofre criado, o token vem de lá; o texto puro antigo não vale mais
    if (cofre && cofre.existe()) return '';
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

  const temSegredo = (a) => !!(a && (a.userToken || a.senhaPadrao || (a.crm && a.crm.senha) || (a.sgas || []).some((l) => l.senha)));

  // Estado do cofre: 'indisponivel' (sem storage), 'sem' (nada guardado), 'legado' (acessos antigos em texto puro, ainda sem
  // cofre), 'travado' (cofre existe, falta a senha mestra) ou 'aberto'.
  function estadoInicial() {
    // sem storage, ou sem como cifrar nesta página (nem WebCrypto nem o motor de reserva): os acessos valem só nesta sessão
    if (!cofre || !cofre.disponivel()) return 'indisponivel';
    if (cofre.existe()) return cofre.aberto() ? 'aberto' : 'travado';
    return temSegredo(normalizar(lerGuardado())) ? 'legado' : 'sem';
  }
  // Política vinda do painel de administração (GET /api/config-publica). Padrão: cofre ativo e sessão do dia.
  let politicaCofre = { modo: 'ativo', sessao: 'dia', horas: 8 };
  const cofreLigado = () => politicaCofre.modo !== 'desativado';
  let estadoCofre = estadoInicial();
  // travado: nada de segredo na memória até a senha mestra; o texto puro antigo só é lido enquanto não há cofre
  let atual = normalizar(estadoCofre === 'travado' ? null : lerGuardado());
  const ouvintes = new Set();
  const ouvintesCofre = new Set();
  function avisarCofre() {
    ouvintesCofre.forEach((fn) => {
      try {
        fn(estadoCofre);
      } catch {
        // um ouvinte com erro não atrapalha os outros
      }
    });
  }
  function aoMudarCofre(fn) {
    ouvintesCofre.add(fn);
    return () => {
      ouvintesCofre.delete(fn);
    };
  }
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

  // Grava SEMPRE cifrado. Sem cofre ainda: pede a criação (senha mestra) e, até lá, os acessos valem só nesta sessão (nunca
  // vão em texto puro para o disco). Travado: não grava (a pessoa precisa destravar antes).
  async function persistir() {
    if (estadoCofre === 'aberto') {
      try {
        await cofre.gravar(copia(atual));
      } catch {
        // alterado em outra aba ou travou: o aviso do cofre já mudou o estado
      }
      return;
    }
    if ((estadoCofre === 'sem' || estadoCofre === 'legado') && temSegredo(atual)) {
      if (cofreLigado()) abrirCofre('criar');
      else {
        // cofre desativado pelo administrador: guarda como nas versões antigas (texto puro). O painel avisa que é menos seguro.
        try {
          localStorage.setItem(KEY_ACESSOS, JSON.stringify(atual));
        } catch {
          // sem storage: vale só nesta sessão
        }
      }
    }
  }

  function salvar(novo) {
    if (estadoCofre === 'travado') {
      abrirCofre('destravar');
      return copia(atual);
    }
    atual = normalizar(novo);
    avisar();
    persistir();
    return copia(atual);
  }

  /** Token do GLPI da aba Chamados / "Abrir chamado" (vazio = esquecer). Vai para o cofre junto com os outros acessos. */
  function definirToken(valor) {
    const v = String(valor || '').trim();
    const novo = { ...copia(atual), userToken: v };
    if (!v) {
      delete novo.nomeGlpi;
      novo.pronto = false;
    }
    return salvar(novo);
  }

  // salvo em outra aba do navegador
  window.addEventListener('storage', async (ev) => {
    if (cofre && ev.key === cofre.CHAVE) {
      if (estadoCofre === 'aberto') {
        const dados = await cofre.reler();
        if (dados) {
          atual = normalizar(dados);
          avisar();
        }
      } else if (estadoCofre === 'sem' || estadoCofre === 'legado') {
        // outra aba criou o cofre: esta precisa da senha mestra
        estadoCofre = 'travado';
        atual = normalizar(null);
        avisarCofre();
        avisar();
      }
      return;
    }
    if (cofre && ev.key === cofre.CHAVE_SESSAO) {
      if (ev.newValue === null && estadoCofre === 'aberto' && ['dia', 'horas'].includes(cofre.politica().sessao)) {
        // a sessão foi apagada em outra aba (Travar agora ou fim do prazo): confere depois de um instante, porque gravar uma
        // sessão nova apaga a antiga antes de escrever
        setTimeout(() => {
          let ainda = null;
          try {
            ainda = localStorage.getItem(cofre.CHAVE_SESSAO);
          } catch {
            ainda = null;
          }
          if (!ainda && estadoCofre === 'aberto') cofre.travar('manual');
        }, 300);
      } else if (ev.newValue && estadoCofre === 'travado') {
        restaurarSessao();
      }
      return;
    }
    if (ev.key !== KEY_ACESSOS && ev.key !== KEY_TOKEN_HUB) return;
    if (estadoCofre === 'travado' || estadoCofre === 'aberto') return; // com cofre, o texto puro não conta
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

  const comPrazo = (promessa, ms, reserva) => Promise.race([promessa, new Promise((r) => setTimeout(() => r(reserva), Math.max(0, ms)))]);
  const PORTA_PROXY = '8318'; // as automações abrem só pelo proxy do Hub (proxy.js; app.js usa a mesma porta)

  /** O pedido veio do proxy das automações deste Hub? Ele só serve automações cadastradas. */
  function origemDoProxy(origem) {
    try {
      const o = new URL(origem);
      return o.hostname === location.hostname && o.protocol === location.protocol && o.port === PORTA_PROXY;
    } catch {
      return false;
    }
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
    if (!origemDoProxy(origem) || !ehIframeDaPagina(janela)) return;
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
    carregarEmpresas();
  }

  // ---------- cofre: criar, destravar, travar ----------
  // quando o cofre trava (por ociosidade, outra aba, manual), os segredos saem da memória e as automações deixam de recebê-los
  if (cofre) {
    cofre.aoMudar((ev) => {
      if (ev.aberto) return;
      if (ev.motivo === 'apagado') {
        estadoCofre = 'sem';
        atual = normalizar(null);
      } else {
        estadoCofre = 'travado';
        atual = normalizar(null);
      }
      avisarCofre();
      avisar();
    });
    // atividade da pessoa adia a trava por ociosidade (no máximo uma vez a cada 10 s)
    let ultimaAtividade = 0;
    ['mousedown', 'keydown', 'touchstart'].forEach((nome) =>
      window.addEventListener(nome, () => {
        const agora = Date.now();
        if (agora - ultimaAtividade > 10000) {
          ultimaAtividade = agora;
          cofre.atividade();
        }
      }, { passive: true }),
    );
  }

  /** Frase para a pessoa saber por quanto tempo o cofre fica liberado depois de destravar (vem da política do painel). */
  function descricaoSessao() {
    const p = cofre ? cofre.politica() : politicaCofre;
    if (p.sessao === 'dia') return 'Depois de destravar, fica liberado neste navegador até a meia-noite: o F5 não pede a senha de novo. "Travar agora" ou limpar os dados do navegador trava antes.';
    if (p.sessao === 'horas') return `Depois de destravar, fica liberado por ${p.horas} ${p.horas === 1 ? 'hora' : 'horas'} (o F5 não pede a senha de novo). "Travar agora" ou limpar os dados do navegador trava antes.`;
    if (p.sessao === 'aba') return 'Depois de destravar, fica liberado nesta aba (o F5 não pede a senha) e trava sozinho depois de 15 minutos parado ou ao fechar a aba.';
    return 'A senha mestra é pedida a cada vez que o Hub é aberto.';
  }

  /** Destrava sem pedir a senha quando há uma sessão guardada que ainda vale (política dia, horas ou aba). */
  async function restaurarSessao() {
    if (!cofre || estadoCofre !== 'travado') return false;
    let dados = null;
    try {
      dados = await cofre.restaurar();
    } catch {
      dados = null;
    }
    if (!dados) return false;
    atual = normalizar(dados);
    estadoCofre = 'aberto';
    avisarCofre();
    avisar();
    if (modoCofre === 'destravar') fecharCofre();
    return true;
  }

  /** Lê a política do painel (rápido, com prazo curto) e aplica ao cofre. Falha de rede usa o padrão. */
  async function carregarPolitica() {
    try {
      const resp = await fetch('/api/config-publica', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (resp.ok) {
        const c = (await resp.json()).cofre;
        if (c && typeof c === 'object') politicaCofre = { modo: c.modo === 'desativado' ? 'desativado' : 'ativo', sessao: c.sessao, horas: c.horas };
      }
    } catch {
      // sem resposta do servidor: vale o padrão (cofre ativo, sessão do dia)
    }
    if (cofre) cofre.definirPolitica(politicaCofre);
  }

  /** Cria o cofre com os acessos atuais e apaga o texto puro antigo. */
  async function criarCofre(senha) {
    await cofre.criar(senha, copia(atual));
    try {
      localStorage.removeItem(KEY_ACESSOS);
      localStorage.removeItem(KEY_TOKEN_HUB);
    } catch {
      // sem storage: nada a apagar
    }
    estadoCofre = 'aberto';
    avisarCofre();
  }

  async function destravarCofre(senha) {
    const dados = await cofre.abrir(senha);
    atual = normalizar(dados);
    estadoCofre = 'aberto';
    avisarCofre();
    avisar();
  }

  function travarCofre() {
    if (cofre && estadoCofre === 'aberto') cofre.travar('manual');
  }

  let raizCofre = null;
  let modoCofre = null;
  let adiouCriacao = false;

  function CofreModal({ modo }) {
    const [senha, setSenha] = useState('');
    const [nova, setNova] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [erro, setErro] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [apagando, setApagando] = useState(false);
    const fecharSe = (ev) => {
      if (ev.target === ev.currentTarget && modo !== 'destravar') fecharCofre();
    };
    useEffect(() => {
      const tecla = (ev) => {
        if (ev.key === 'Escape') fecharCofre();
      };
      document.addEventListener('keydown', tecla);
      return () => document.removeEventListener('keydown', tecla);
    }, []);

    async function enviar() {
      setErro(null);
      try {
        if (modo === 'criar') {
          if (senha.length < cofre.MIN_SENHA) return setErro(`A senha mestra precisa de ao menos ${cofre.MIN_SENHA} caracteres.`);
          if (senha !== confirmar) return setErro('As duas senhas não são iguais.');
          setOcupado(true);
          await criarCofre(senha);
        } else if (modo === 'destravar') {
          setOcupado(true);
          await destravarCofre(senha);
        } else {
          if (nova.length < cofre.MIN_SENHA) return setErro(`A nova senha mestra precisa de ao menos ${cofre.MIN_SENHA} caracteres.`);
          if (nova !== confirmar) return setErro('As duas senhas novas não são iguais.');
          setOcupado(true);
          await cofre.trocarSenha(senha, nova);
        }
        fecharCofre();
      } catch (err) {
        setOcupado(false);
        setErro(err.message || 'Não foi possível concluir.');
      }
    }

    const titulos = { criar: 'Proteger meus acessos', destravar: 'Destravar meus acessos', trocar: 'Trocar a senha mestra' };
    const textos = {
      criar: 'Crie uma senha mestra. Seus logins e o token ficam guardados neste navegador CIFRADOS com ela (nada em texto puro). ' + descricaoSessao() + ' Anote a senha mestra: não há como recuperá-la.',
      destravar: 'Digite a senha mestra para liberar os logins e o token. ' + descricaoSessao(),
      trocar: 'Informe a senha mestra atual e a nova.',
    };
    const campoSenha = (rotulo, valor, onChange, extra) =>
      campo(rotulo, inp(valor, onChange, { type: 'password', autoComplete: 'new-password', onKeyDown: (ev) => ev.key === 'Enter' && enviar(), ...extra }), rotulo);

    const corpo = apagando
      ? [
          e('div', { key: 'a', style: { color: 'var(--text)', fontSize: 13.5, lineHeight: 1.55 } }, 'Sem a senha mestra não dá para abrir o cofre. Para recomeçar, é preciso APAGAR os acessos guardados e digitá-los de novo (logins do SGA, PowerCRM, senha padrão e token do GLPI). Isso não afeta o servidor, só este navegador.'),
          e('div', { key: 'b', style: { display: 'flex', gap: 10 } }, [
            e('button', { key: 'ok', type: 'button', style: { ...S.btnPrim, background: 'var(--error)', flex: 1 }, onClick: () => { cofre.apagar(); fecharCofre(); abrirEditor(); } }, 'Apagar e recomeçar'),
            e('button', { key: 'c', type: 'button', style: S.btnSec, onClick: () => setApagando(false) }, 'Voltar'),
          ]),
        ]
      : [
          e('div', { key: 't', style: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55 } }, textos[modo]),
          modo === 'criar' ? campoSenha('Senha mestra (mínimo ' + cofre.MIN_SENHA + ' caracteres)', senha, setSenha, { autoFocus: true }) : null,
          modo === 'criar' ? campoSenha('Repita a senha mestra', confirmar, setConfirmar) : null,
          modo === 'destravar' ? campoSenha('Senha mestra', senha, setSenha, { autoFocus: true }) : null,
          modo === 'trocar' ? campoSenha('Senha mestra atual', senha, setSenha, { autoFocus: true }) : null,
          modo === 'trocar' ? campoSenha('Nova senha mestra', nova, setNova) : null,
          modo === 'trocar' ? campoSenha('Repita a nova senha mestra', confirmar, setConfirmar) : null,
          ocupado && cofre.motor === 'reserva' ? e('div', { key: 'lento', className: 'cofre-lento', style: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 } }, 'Calculando a chave de segurança. Neste endereço (sem HTTPS) isso leva alguns segundos.') : null,
          erro ? e('div', { key: 'err', className: 'cofre-erro', style: { color: 'var(--error)', fontSize: 12.5 } }, erro) : null,
          e('div', { key: 'b', style: { display: 'flex', gap: 10 } }, [
            e('button', { key: 'ok', type: 'button', className: 'cofre-ok', disabled: ocupado, style: { ...S.btnPrim, flex: 1, opacity: ocupado ? 0.7 : 1 }, onClick: enviar },
              ocupado ? 'Aguarde…' : modo === 'criar' ? 'Criar cofre e proteger' : modo === 'destravar' ? 'Destravar' : 'Trocar senha'),
            e('button', { key: 'c', type: 'button', className: 'cofre-agora-nao', style: S.btnSec, onClick: () => { if (modo === 'criar') adiouCriacao = true; fecharCofre(); } }, modo === 'criar' ? 'Agora não' : modo === 'destravar' ? 'Agora não' : 'Cancelar'),
          ]),
          modo === 'destravar' ? e('button', { key: 'esq', type: 'button', style: { ...S.link, alignSelf: 'flex-start' }, onClick: () => setApagando(true) }, 'Esqueci a senha mestra') : null,
          modo === 'criar' ? e('div', { key: 'av', style: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5 } }, 'Se escolher "Agora não", o que você digitar vale só nesta sessão: nada será gravado no navegador sem o cofre.') : null,
        ];

    return e('div', { className: 'cofre-fundo', onMouseDown: fecharSe, style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
      e('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulos[modo], style: { width: '100%', maxWidth: 460, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 60px -12px rgba(0,0,0,0.2)', color: 'var(--text)', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 } }, [
        e('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
          e('span', { key: 'i', className: 'glpi-head-icon' }, iconeChave(15)),
          e('div', { key: 't', style: { fontWeight: 600, fontSize: 15.5 } }, titulos[modo]),
        ]),
        ...corpo,
      ]));
  }

  function desenharCofre() {
    if (!raizCofre) {
      const div = document.createElement('div');
      div.id = 'arx-cofre-modal';
      document.body.appendChild(div);
      raizCofre = ReactDOM.createRoot(div);
    }
    raizCofre.render(modoCofre ? e(CofreModal, { key: modoCofre, modo: modoCofre }) : null);
  }
  function abrirCofre(modo) {
    if (!cofre) return;
    modoCofre = modo;
    desenharCofre();
  }
  function fecharCofre() {
    modoCofre = null;
    desenharCofre();
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
    const [estadoDoCofre, setEstadoDoCofre] = useState(estadoCofre);
    useEffect(() => aoMudarCofre(setEstadoDoCofre), []);
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

    // cofre travado: o formulário só faz sentido depois de destravar (senão se sobrescreveria o que está guardado)
    if (estadoDoCofre === 'travado') {
      return e('div', { className: 'acessos-editor', style: moldura === 'card' ? { maxWidth: 560, margin: '30px auto 0', ...S.card, gap: 14, padding: 22 } : { display: 'flex', flexDirection: 'column', gap: 14 } }, [
        e('div', { key: 't', style: { fontWeight: 600, fontSize: 15 } }, 'Seus acessos estão travados'),
        e('div', { key: 's', style: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55 } }, 'Os logins e o token ficam cifrados neste navegador. Digite a senha mestra para liberar.'),
        e('button', { key: 'b', type: 'button', className: 'btn-primary', style: { ...S.btnPrim, alignSelf: 'flex-start' }, onClick: () => abrirCofre('destravar') }, 'Destravar acessos'),
      ]);
    }

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
          'Os dados ficam salvos somente neste navegador, cifrados com a sua senha mestra. As automações abertas no Hub recebem os logins do SGA, do PowerCRM e a senha padrão. O token do GLPI não sai deste navegador. Na aba Chamados, o titular do token é quem aprova, e o chamado fica atribuído a essa pessoa.'),
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
        estadoCofre === 'aberto' ? e('button', { key: 'tr', type: 'button', className: 'cofre-trocar', style: S.link, onClick: () => abrirCofre('trocar') }, 'Trocar senha mestra') : null,
        estadoCofre === 'aberto' ? e('button', { key: 'tv', type: 'button', className: 'cofre-travar', style: { ...S.link, marginRight: 8 }, onClick: () => { travarCofre(); fecharEditor(); } }, 'Travar agora') : null,
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
    const [travado, setTravado] = useState(estadoCofre === 'travado');
    useEffect(() => aoMudarCofre((s) => setTravado(s === 'travado')), []);
    const falta = faltando(a);
    // o pontinho aparece quando falta o que as automações usam (SGA ou PowerCRM)
    const alerta = falta.includes('login do SGA') || falta.includes('PowerCRM');
    return e('button', {
      type: 'button',
      className: 'btn-outline meus-acessos-btn',
      onClick: () => (travado ? abrirCofre('destravar') : abrirEditor()),
      title: travado ? 'Meus acessos travados: digite a senha mestra para liberar' : falta.length ? 'Meus acessos · falta configurar: ' + falta.join(', ') : 'Meus acessos: logins entregues às automações abertas no Hub (salvos só neste navegador)',
      'aria-label': 'Meus acessos',
      style: { position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' },
    }, [
      e('span', { key: 'i', style: { display: 'flex' } }, iconeChave(15)),
      e('span', { key: 't', className: 'meus-acessos-label' }, travado ? 'Acessos travados' : 'Meus acessos'),
      alerta && !travado ? e('span', { key: 'p', className: 'meus-acessos-pendente', 'aria-hidden': 'true', style: { position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: 'var(--warn)', border: '2px solid var(--card)' } }) : null,
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
    // estilo e campos compartilhados com o painel de administração (admin.js)
    ui: { S, campo, inp, iconeChave },
    definirToken,
    estadoCofre: () => estadoCofre,
    aoMudarCofre,
    abrirCofre,
    travarCofre,
    politicaCofre: () => ({ ...politicaCofre }),
    recarregarPolitica: carregarPolitica,
  };
  window.MeusAcessosBotao = MeusAcessosBotao;

  // ao abrir o Hub: lê a política do painel, tenta a sessão guardada (sem pedir senha) e só então pergunta o que falta:
  // cofre travado pede a senha mestra; acessos antigos em texto puro pedem para criar o cofre (se o cofre estiver ligado)
  (async function iniciar() {
    await carregarPolitica();
    if (await restaurarSessao()) return;
    if (estadoCofre === 'travado') abrirCofre('destravar');
    else if (estadoCofre === 'legado' && cofreLigado() && !adiouCriacao) abrirCofre('criar');
  })();
})();
