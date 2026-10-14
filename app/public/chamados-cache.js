// Pré-carga e cache da lista da aba Chamados.
// Assim que o Hub carrega e o token do GLPI existe, a lista é buscada em segundo plano e fica em
// memória; a aba (chamados.js) só mostra o que já estiver aqui. A última lista também vai para o
// localStorage (por identificador do usuário do GLPI, nunca o token) para aparecer já ao abrir.
// O token do usuário continua só no navegador e só viaja no pedido ao servidor.
(function () {
  const LIMITE_IDADE_MS = 30 * 60 * 1000; // lista guardada mais velha que isso não é mostrada
  const LIMITE_BYTES = 800 * 1024; // acima disso não grava
  const KEY_ULTIMO = 'arxhub_chamados_lista_ultimo';
  const KEY_LISTA = 'arxhub_chamados_lista:';
  const SERVICO = `${location.protocol}//${location.hostname}:4013`; // chamados-glpi

  /** Impressão curta (FNV-1a 32 bits) só para saber se o token mudou; não permite recuperar o token. */
  function hashToken(token) {
    let h = 0x811c9dc5;
    const t = String(token || '');
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  const idDoUsuario = (d) => {
    const u = d && d.usuario;
    if (!u) return null;
    const id = u.id !== undefined && u.id !== null && u.id !== '' ? u.id : u.nome;
    return id === undefined || id === null || id === '' ? null : String(id);
  };

  /** Texto a gravar (ou null se não deve gravar: sem usuário, lista inválida ou grande demais). */
  function registroParaGravar(dados, token, agora) {
    if (!dados || !Array.isArray(dados.itens)) return null;
    const usuarioId = idDoUsuario(dados);
    if (!usuarioId) return null;
    const texto = JSON.stringify({ v: 1, em: agora, tk: hashToken(token), usuarioId, dados });
    return texto.length > LIMITE_BYTES ? null : { usuarioId, texto };
  }

  function guardar(storage, dados, token, agora) {
    try {
      const r = registroParaGravar(dados, token, agora);
      if (!r || !storage) return false;
      storage.setItem(KEY_LISTA + r.usuarioId, r.texto);
      storage.setItem(KEY_ULTIMO, r.usuarioId);
      return true;
    } catch {
      return false; // sem storage ou cheio: a lista continua valendo em memória
    }
  }

  /** { dados, em } da lista guardada, ou null (vazia, corrompida, velha demais ou de outro token). */
  function carregarGuardado(storage, token, agora) {
    try {
      if (!storage) return null;
      const usuarioId = storage.getItem(KEY_ULTIMO);
      if (!usuarioId) return null;
      const texto = storage.getItem(KEY_LISTA + usuarioId);
      if (!texto) return null;
      const r = JSON.parse(texto);
      if (!r || r.v !== 1 || typeof r.em !== 'number' || !r.dados || !Array.isArray(r.dados.itens)) return null;
      if (r.tk !== hashToken(token)) return null;
      const idade = agora - r.em;
      if (idade < 0 || idade > LIMITE_IDADE_MS) return null;
      return { dados: r.dados, em: r.em };
    } catch {
      return null;
    }
  }

  const segundos = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
  const ehMs = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

  /** Texto do tooltip do carimbo de atualização (null = sem medição). */
  function textoTempos(tempos) {
    if (!tempos || typeof tempos !== 'object') return null;
    const valores = Object.values(tempos).filter(ehMs);
    if (!valores.length) return null;
    const glpi = ehMs(tempos.glpi) ? tempos.glpi : ehMs(tempos.total) ? tempos.total : valores.reduce((a, b) => a + b, 0);
    const base = `Leitura do GLPI: ${segundos(glpi)} s`;
    return ehMs(tempos.glpi) && ehMs(tempos.total) ? `${base}. Total: ${segundos(tempos.total)} s` : base;
  }

  /** Nomes das entidades (do servidor novo, ou derivados dos itens). */
  function entidadesDaLista(dados) {
    if (!dados) return [];
    const nomes = Array.isArray(dados.entidades) ? dados.entidades.map((x) => x && x.nome).filter(Boolean) : [];
    const lista = nomes.length ? nomes : (dados.itens || []).map((i) => i && i.entidade).filter(Boolean);
    return [...new Set(lista)];
  }

  function filtrarPorEntidade(itens, nome) {
    return nome ? itens.filter((i) => i.entidade === nome) : itens;
  }

  const DEBOUNCE_AVISO_MS = 600; // várias mensagens em rajada viram uma busca só
  const ESPERA_INICIAL_MS = 5000; // reabertura quando o servidor fecha o canal (ex.: 404 em servidor antigo)
  const ESPERA_MAXIMA_MS = 5 * 60 * 1000;

  /** Interpreta uma mensagem do canal: true só para {"tipo":"mudou"} em JSON válido; nunca lança. */
  function ehAvisoDeMudanca(ev) {
    try {
      const d = JSON.parse(ev && ev.data);
      return !!d && typeof d === 'object' && d.tipo === 'mudou';
    } catch {
      return false; // ping, texto solto ou JSON quebrado: não é aviso
    }
  }

  /**
   * Canal de avisos (SSE) do chamados-glpi. Só avisa "mudou"; quem busca é `aoBuscar`.
   * O EventSource reconecta sozinho em queda de rede; se o servidor fechar de vez (readyState 2, como
   * no 404 de um serviço antigo) reabre aqui com espera crescente. Sem EventSource (`criarFonte` nulo)
   * ou com erro na criação, não faz nada e o polling de /api/mudou segue como reserva.
   */
  function criarCanal({ url, criarFonte, aoBuscar, aoEstado = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = DEBOUNCE_AVISO_MS }) {
    let fonte = null;
    let aberto = false; // quer o canal ligado
    let conectado = false;
    let teveQueda = false; // já caiu ou falhou antes: ao conectar de novo pode ter perdido avisos
    let timerBusca = null;
    let timerReabrir = null;
    let espera = ESPERA_INICIAL_MS;

    const mudarEstado = (v) => {
      if (conectado === v) return;
      conectado = v;
      try { aoEstado(v); } catch { /* ouvinte com defeito não derruba o canal */ }
    };
    const agendarBusca = () => {
      if (timerBusca) clearTimer(timerBusca);
      timerBusca = setTimer(() => { timerBusca = null; try { aoBuscar(); } catch { /* a busca trata os próprios erros */ } }, debounceMs);
    };
    function conectar() {
      timerReabrir = null;
      if (!aberto || fonte || typeof criarFonte !== 'function') return;
      let f;
      try {
        f = criarFonte(url);
      } catch {
        return; // sem suporte ou bloqueado: fica só o polling
      }
      if (!f) return;
      fonte = f;
      f.onopen = () => {
        if (fonte !== f) return;
        espera = ESPERA_INICIAL_MS;
        mudarEstado(true);
        if (teveQueda) { teveQueda = false; agendarBusca(); }
      };
      f.onmessage = (ev) => {
        if (fonte !== f) return;
        if (ehAvisoDeMudanca(ev)) agendarBusca();
      };
      f.onerror = () => {
        if (fonte !== f) return;
        mudarEstado(false);
        teveQueda = true;
        if (f.readyState !== 2) return; // reconectando: o navegador cuida
        try { f.close(); } catch { /* já fechada */ }
        fonte = null;
        timerReabrir = setTimer(conectar, espera);
        espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
      };
    }
    return {
      abrir() { aberto = true; if (!fonte && !timerReabrir) conectar(); },
      fechar() {
        aberto = false;
        if (timerBusca) clearTimer(timerBusca);
        if (timerReabrir) clearTimer(timerReabrir);
        timerBusca = null;
        timerReabrir = null;
        const f = fonte;
        fonte = null;
        teveQueda = false;
        espera = ESPERA_INICIAL_MS;
        if (f) { try { f.close(); } catch { /* já fechada */ } }
        mudarEstado(false);
      },
      conectado: () => conectado,
    };
  }

  const estadoVazio = () => ({ dados: null, fresco: false, carregando: false, erro: null, em: null, assinatura: '', tempos: null, aoVivo: false });

  /** Armazenamento da lista. Tudo injetável para teste (acessos, storage, rede, relógio, canal de avisos). */
  function criar({ hub, storage, buscarApi, agora = () => Date.now(), criarFonte = null, urlEventos = '', setTimer, clearTimer }) {
    let s = estadoVazio();
    let emVoo = null;
    let tokenAtual = '';
    let geracao = 0; // muda com o token: resposta de uma busca antiga é descartada
    let iniciado = false;
    const ouvintes = new Set();
    const avisar = () => ouvintes.forEach((fn) => { try { fn(s); } catch { /* um ouvinte com defeito não derruba os outros */ } });

    function buscar() {
      if (!tokenAtual) return Promise.resolve();
      if (emVoo) return emVoo; // uma busca por vez
      const token = tokenAtual;
      const minha = geracao;
      const pedido = () => ({ glpi: { userToken: token } });
      s = { ...s, carregando: true, erro: null };
      avisar();
      const corpo = pedido();
      if (s.dados && s.assinatura) corpo.assinatura = s.assinatura;
      emVoo = (async () => {
        try {
          let d = await buscarApi('/api/chamados', corpo);
          if (minha !== geracao) return;
          if (d && d.semMudanca === true && !s.dados) d = await buscarApi('/api/chamados', pedido()); // sem lista em mãos: pede inteira
          if (minha !== geracao) return;
          if (d && d.semMudanca === true) {
            s = { ...s, fresco: true, carregando: false, erro: null, em: new Date(agora()), assinatura: d.assinatura || s.assinatura, tempos: d.tempos || s.tempos };
            guardar(storage, s.dados, token, agora());
          } else if (d && Array.isArray(d.itens)) {
            s = { dados: d, fresco: true, carregando: false, erro: null, em: new Date(agora()), assinatura: d.assinatura || '', tempos: d.tempos || null, aoVivo: s.aoVivo };
            guardar(storage, d, token, agora());
          } else {
            throw new Error('Resposta inválida do serviço de chamados');
          }
          avisar();
        } catch (err) {
          if (minha !== geracao) return;
          // `fresco` fica como estava: uma falha de rede não faz uma lista recém-confirmada virar "guardada"
          s = { ...s, carregando: false, erro: err && err.message ? err.message : 'Falha ao buscar os chamados' };
          avisar();
        } finally {
          if (minha === geracao) emVoo = null;
        }
      })();
      return emVoo;
    }

    // Aviso do webhook: busca na hora, reaproveitando a busca em voo. Se ela já estava a caminho, o aviso
    // pode ter chegado depois de o servidor ler o GLPI; então repete uma vez ao terminar.
    let repetindo = false;
    function buscarPorAviso() {
      if (!tokenAtual) return;
      if (!emVoo) { buscar(); return; }
      if (repetindo) return;
      repetindo = true;
      const g = geracao;
      emVoo.then(() => {
        repetindo = false;
        if (g === geracao) buscar();
      });
    }
    const canal = criarCanal({
      url: urlEventos,
      criarFonte,
      aoBuscar: buscarPorAviso,
      aoEstado: (v) => { if (s.aoVivo !== v) { s = { ...s, aoVivo: v }; avisar(); } },
      setTimer,
      clearTimer,
    });

    /** Busca só se a lista não for fresca ou estiver mais velha que `maxIdadeMs`. */
    function garantir(maxIdadeMs = 15000) {
      if (emVoo) return emVoo;
      if (!s.fresco || !s.em || agora() - s.em.getTime() > maxIdadeMs) return buscar();
      return Promise.resolve();
    }

    /** Reage ao Hub: token novo, trocado ou removido. */
    function reagir() {
      const token = (hub.ler() || {}).userToken || '';
      if (token === tokenAtual) return;
      tokenAtual = token;
      geracao++;
      emVoo = null;
      repetindo = false;
      canal.fechar();
      s = estadoVazio();
      if (token) {
        const g = carregarGuardado(storage, token, agora());
        if (g) s = { ...estadoVazio(), dados: g.dados, em: new Date(g.em), assinatura: g.dados.assinatura || '' };
      }
      avisar();
      if (token) {
        canal.abrir();
        buscar();
      }
    }

    function iniciar() {
      if (iniciado) return;
      iniciado = true;
      hub.aoMudar(reagir);
      reagir();
    }

    return {
      iniciar,
      buscar,
      garantir,
      estado: () => s,
      assinar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
      },
    };
  }

  async function apiReal(caminho, corpo) {
    const resp = await fetch(SERVICO + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
    return dados;
  }

  const puro = { criarCanal, ehAvisoDeMudanca, hashToken, registroParaGravar, guardar, carregarGuardado, textoTempos, entidadesDaLista, filtrarPorEntidade, LIMITE_IDADE_MS, LIMITE_BYTES };
  const api = { criar, puro };

  let storageReal = null;
  try { storageReal = window.localStorage; } catch { storageReal = null; }
  if (window.ArxAcessosHub) {
    const criarFonte = typeof window.EventSource === 'function' ? (url) => new window.EventSource(url) : null;
    api.store = criar({ hub: window.ArxAcessosHub, storage: storageReal, buscarApi: apiReal, criarFonte, urlEventos: `${SERVICO}/api/eventos` });
    if (!window.CHAMADOS_CACHE_MANUAL) api.store.iniciar();
  }
  window.ChamadosCache = api;
})();
