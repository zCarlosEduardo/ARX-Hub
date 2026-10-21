// Pré-carga e cache da lista da aba Chamados (chamados-cache.js). Lógica pura e store com
// storage, acessos e rede falsos: nenhuma rede real e nenhum navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = globalThis;
globalThis.CHAMADOS_CACHE_MANUAL = true; // não inicia a pré-carga sozinho
globalThis.location = { protocol: 'http:', hostname: 'localhost' };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'chamados-cache.js'), 'utf8'), { filename: 'chamados-cache.js' });
const { criar, puro } = window.ChamadosCache;

const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-14T12:00:00Z');
const lista = (extra) => ({ itens: [{ id: 1, problemas: [] }], usuario: { id: 7, nome: 'Fulano' }, outros: 0, totalAbertos: 1, perfis: [], assinatura: 'a1', ...extra });

function storageFalso() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

test('hashToken é estável, curto e não contém o token', () => {
  const h = puro.hashToken('segredo-super-longo-123');
  assert.equal(h, puro.hashToken('segredo-super-longo-123'));
  assert.notEqual(h, puro.hashToken('outro'));
  assert.ok(h.length <= 8 && !h.includes('segredo'));
});

test('registro: grava com usuário, data e sem o token', () => {
  const r = puro.registroParaGravar(lista(), 'TOKEN-SECRETO', T0);
  assert.ok(r);
  assert.equal(r.usuarioId, '7');
  assert.ok(!r.texto.includes('TOKEN-SECRETO'));
  assert.equal(JSON.parse(r.texto).em, T0);
});

test('registro: sem identificador do usuário ou acima de 800 KB não grava', () => {
  assert.equal(puro.registroParaGravar(lista({ usuario: null }), 't', T0), null);
  assert.equal(puro.registroParaGravar({ itens: [] }, 't', T0), null);
  const grande = lista({ itens: [{ id: 1, texto: 'x'.repeat(810 * 1024) }] });
  assert.equal(puro.registroParaGravar(grande, 't', T0), null);
  assert.ok(puro.registroParaGravar(lista({ itens: [{ id: 1, texto: 'x'.repeat(700 * 1024) }] }), 't', T0));
});

test('guardado: mostra dentro de 30 min, expira depois, rejeita outro token e lixo', () => {
  const st = storageFalso();
  puro.guardar(st, lista(), 'tk1', T0);
  assert.ok(puro.carregarGuardado(st, 'tk1', T0 + 5 * MIN));
  assert.ok(puro.carregarGuardado(st, 'tk1', T0 + 30 * MIN), 'no limite ainda vale');
  assert.equal(puro.carregarGuardado(st, 'tk1', T0 + 30 * MIN + 1), null, 'mais velho que 30 min');
  assert.equal(puro.carregarGuardado(st, 'tk2', T0 + MIN), null, 'token de outro usuário');
  assert.equal(puro.carregarGuardado(st, 'tk1', T0 - 10 * MIN), null, 'data no futuro');
  st.m.set('arxhub_chamados_lista:7', '{lixo');
  assert.equal(puro.carregarGuardado(st, 'tk1', T0 + MIN), null);
  assert.equal(puro.carregarGuardado(storageFalso(), 'tk1', T0), null, 'vazio');
});

test('storage que lança erro nunca derruba', () => {
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); } };
  assert.equal(puro.carregarGuardado(quebrado, 't', T0), null);
  assert.equal(puro.guardar(quebrado, lista(), 't', T0), false);
  assert.equal(puro.carregarGuardado(null, 't', T0), null);
});

test('textoTempos: leitura do GLPI em segundos, vazio sem dados', () => {
  assert.equal(puro.textoTempos(null), null);
  assert.equal(puro.textoTempos({}), null);
  assert.equal(puro.textoTempos({ glpi: 1250 }), 'Leitura do GLPI: 1,3 s');
  assert.equal(puro.textoTempos({ total: 2000, glpi: 800 }), 'Leitura do GLPI: 0,8 s. Total: 2,0 s');
  assert.equal(puro.textoTempos({ a: 500, b: 1500 }), 'Leitura do GLPI: 2,0 s');
  assert.equal(puro.textoTempos({ glpi: 'x' }), null);
});

test('entidades: só aparecem com mais de uma; filtro por nome', () => {
  const itens = [{ id: 1, entidade: 'Sistemas' }, { id: 2, entidade: 'Infra' }, { id: 3 }];
  assert.deepEqual(puro.entidadesDaLista({ itens, entidades: [{ id: 1, nome: 'Sistemas' }, { id: 2, nome: 'Infra' }] }), ['Sistemas', 'Infra']);
  assert.deepEqual(puro.entidadesDaLista({ itens }), ['Sistemas', 'Infra'], 'deriva dos itens se o servidor não mandar');
  assert.deepEqual(puro.entidadesDaLista({ itens: [{ id: 1, entidade: 'Sistemas' }] }), ['Sistemas']);
  assert.deepEqual(puro.entidadesDaLista({ itens: [{ id: 1 }] }), []);
  assert.deepEqual(puro.filtrarPorEntidade(itens, '').map((i) => i.id), [1, 2, 3]);
  assert.deepEqual(puro.filtrarPorEntidade(itens, 'Infra').map((i) => i.id), [2]);
});

function montar({ token = 'tk1', respostas = [], st = storageFalso(), inicio = T0 } = {}) {
  const hub = { acessos: { userToken: token }, ouvintes: new Set(), ler() { return this.acessos; }, aoMudar(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); } };
  const pedidos = [];
  let agora = inicio;
  const buscarApi = async (caminho, corpo) => {
    pedidos.push({ caminho, corpo: JSON.parse(JSON.stringify(corpo)) });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  const store = criar({ hub, storage: st, buscarApi, agora: () => agora });
  return { store, hub, pedidos, st, avancar: (ms) => { agora += ms; } };
}

test('store: uma só busca em voo; guarda e mostra como fresco', async () => {
  const m = montar({ respostas: [lista()] });
  m.store.iniciar();
  const p1 = m.store.buscar();
  const p2 = m.store.buscar();
  assert.equal(p1, p2, 'mesma promessa');
  await p1;
  assert.equal(m.pedidos.length, 1);
  const s = m.store.estado();
  assert.equal(s.fresco, true);
  assert.equal(s.carregando, false);
  assert.equal(s.dados.itens.length, 1);
  assert.ok(puro.carregarGuardado(m.st, 'tk1', T0), 'gravou no storage');
  assert.ok(![...m.st.m.values()].some((v) => v.includes('tk1')), 'token nunca vai pro storage');
});

test('store: abre com o guardado (não fresco), manda a assinatura e mantém a lista no semMudanca', async () => {
  const st = storageFalso();
  puro.guardar(st, lista(), 'tk1', T0 - 2 * MIN);
  const m = montar({ st, respostas: [{ semMudanca: true, assinatura: 'a1', tempos: { glpi: 300 } }] });
  m.store.iniciar();
  let s = m.store.estado();
  assert.equal(s.fresco, false);
  assert.equal(s.dados.itens.length, 1, 'já na tela antes da rede');
  const p = m.store.buscar();
  assert.equal(m.store.estado().carregando, true);
  await p;
  assert.equal(m.pedidos[0].corpo.assinatura, 'a1');
  s = m.store.estado();
  assert.equal(s.fresco, true, 'confirmada pelo servidor');
  assert.equal(s.dados.itens.length, 1);
  assert.deepEqual(s.tempos, { glpi: 300 });
});

test('store: servidor antigo devolve a lista inteira e funciona igual', async () => {
  const st = storageFalso();
  puro.guardar(st, lista(), 'tk1', T0);
  const nova = lista({ itens: [{ id: 1 }, { id: 2 }], assinatura: 'a2' });
  const m = montar({ st, respostas: [nova] });
  m.store.iniciar();
  await m.store.buscar();
  const s = m.store.estado();
  assert.equal(s.dados.itens.length, 2);
  assert.equal(s.assinatura, 'a2');
  assert.equal(s.fresco, true);
});

test('store: sem lista em mãos não manda assinatura; semMudanca sem lista refaz o pedido', async () => {
  const m = montar({ respostas: [{ semMudanca: true, assinatura: 'x' }, lista()] });
  m.store.iniciar();
  await m.store.buscar();
  assert.equal(m.pedidos.length, 2);
  assert.equal('assinatura' in m.pedidos[0].corpo, false);
  assert.equal(m.store.estado().dados.itens.length, 1);
});

test('store: erro mantém a lista guardada como não fresca e registra a falha', async () => {
  const st = storageFalso();
  puro.guardar(st, lista(), 'tk1', T0);
  const m = montar({ st, respostas: [new Error('HTTP 500')] });
  m.store.iniciar();
  await m.store.buscar();
  const s = m.store.estado();
  assert.equal(s.erro, 'HTTP 500');
  assert.equal(s.fresco, false);
  assert.equal(s.carregando, false);
});

test('store: troca de token descarta a lista e busca de novo; resposta velha é ignorada', async () => {
  let soltar;
  const lenta = () => new Promise((res) => { soltar = () => res(lista({ usuario: { id: 1, nome: 'Velho' } })); });
  const m = montar({ respostas: [lenta, lista({ usuario: { id: 2, nome: 'Novo' } })] });
  m.store.iniciar();
  const p1 = m.store.buscar();
  m.hub.acessos = { userToken: 'tk2' };
  m.hub.ouvintes.forEach((fn) => fn());
  soltar();
  await p1;
  await new Promise((r) => setImmediate(r));
  assert.equal(m.pedidos.length, 2);
  assert.equal(m.store.estado().dados.usuario.nome, 'Novo');
});

test('store: sem token não busca; token removido limpa a lista', async () => {
  const m = montar({ token: '', respostas: [] });
  m.store.iniciar();
  await m.store.buscar();
  assert.equal(m.pedidos.length, 0);
  const m2 = montar({ respostas: [lista()] });
  m2.store.iniciar();
  await m2.store.buscar();
  m2.hub.acessos = { userToken: '' };
  m2.hub.ouvintes.forEach((fn) => fn());
  assert.equal(m2.store.estado().dados, null);
});

test('store: garantir só busca se não for fresca ou estiver velha', async () => {
  const m = montar({ respostas: [lista(), lista()] });
  m.store.iniciar();
  await m.store.buscar();
  await m.store.garantir(15000);
  assert.equal(m.pedidos.length, 1, 'fresca: não repete');
  m.avancar(20000);
  await m.store.garantir(15000);
  assert.equal(m.pedidos.length, 2);
});

// ---- Canal de avisos (SSE do webhook) ----
function relogioFalso() {
  let t = 0;
  let id = 0;
  const fila = new Map();
  return {
    setTimer: (fn, ms) => { fila.set(++id, { fn, em: t + ms }); return id; },
    clearTimer: (i) => { fila.delete(i); },
    avancar(ms) {
      const fim = t + ms;
      for (;;) {
        const prox = [...fila.entries()].filter(([, v]) => v.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        if (!prox) break;
        fila.delete(prox[0]);
        t = prox[1].em;
        prox[1].fn();
      }
      t = fim;
    },
    pendentes: () => fila.size,
  };
}

function fabricaFonte() {
  const fontes = [];
  const criarFonte = (url) => {
    const f = { url, fechada: false, readyState: 0, close() { this.fechada = true; this.readyState = 2; } };
    fontes.push(f);
    return f;
  };
  return { fontes, criarFonte };
}

const msg = (f, obj) => f.onmessage({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) });
const mudou = { tipo: 'mudou', evento: 'new', itemtype: 'Ticket', itemId: 1, avisos: 1 };
const umTick = () => new Promise((r) => setImmediate(r));

test('canal: rajada de 5 avisos vira 1 busca depois de 600 ms', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  let buscas = 0;
  const c = puro.criarCanal({ url: 'http://x/api/eventos', criarFonte, aoBuscar: () => { buscas++; }, setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  assert.equal(fontes.length, 1);
  assert.equal(fontes[0].url, 'http://x/api/eventos');
  fontes[0].onopen();
  for (let i = 0; i < 5; i++) { msg(fontes[0], mudou); r.avancar(100); }
  assert.equal(buscas, 0, 'cada aviso reinicia a espera');
  r.avancar(499);
  assert.equal(buscas, 0);
  r.avancar(1);
  assert.equal(buscas, 1);
  r.avancar(5000);
  assert.equal(buscas, 1);
});

test('canal: mensagem inválida, de outro tipo ou ping não gera busca nem lança', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  let buscas = 0;
  const c = puro.criarCanal({ url: 'u', criarFonte, aoBuscar: () => { buscas++; }, setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  fontes[0].onopen();
  for (const m of ['{lixo', '', 'null', '123', '"mudou"', { tipo: 'outro' }, { tipo: 'conectado' }, {}]) {
    assert.doesNotThrow(() => msg(fontes[0], m));
  }
  assert.doesNotThrow(() => fontes[0].onmessage({}));
  r.avancar(5000);
  assert.equal(buscas, 0);
});

test('canal: queda e reconexão gera 1 busca; queda sozinha não', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  let buscas = 0;
  const estados = [];
  const c = puro.criarCanal({ url: 'u', criarFonte, aoBuscar: () => { buscas++; }, aoEstado: (v) => estados.push(v), setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  fontes[0].onopen();
  assert.equal(buscas, 0, 'primeira conexão não busca (a pré-carga já fez)');
  fontes[0].readyState = 0; // o navegador reconecta sozinho
  fontes[0].onerror();
  assert.equal(c.conectado(), false);
  r.avancar(10000);
  assert.equal(buscas, 0);
  assert.equal(fontes.length, 1, 'não abre outra conexão: o EventSource reconecta sozinho');
  fontes[0].onopen();
  r.avancar(600);
  assert.equal(buscas, 1);
  assert.deepEqual(estados, [true, false, true]);
});

test('canal: servidor sem /api/eventos (404 fecha a fonte) reabre com espera crescente e teto', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  let buscas = 0;
  const c = puro.criarCanal({ url: 'u', criarFonte, aoBuscar: () => { buscas++; }, setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  const falhar = () => { const f = fontes[fontes.length - 1]; f.readyState = 2; f.onerror(); };
  falhar();
  r.avancar(4999);
  assert.equal(fontes.length, 1);
  r.avancar(1);
  assert.equal(fontes.length, 2, '1a nova tentativa em 5 s');
  falhar();
  r.avancar(9999);
  assert.equal(fontes.length, 2);
  r.avancar(1);
  assert.equal(fontes.length, 3, '2a em 10 s');
  falhar();
  r.avancar(20000);
  assert.equal(fontes.length, 4, '3a em 20 s');
  for (let i = 0; i < 10; i++) { falhar(); r.avancar(5 * 60 * 1000); }
  const antes = fontes.length;
  falhar();
  r.avancar(4 * 60 * 1000);
  assert.equal(fontes.length, antes, 'teto de 5 min entre tentativas');
  r.avancar(60 * 1000);
  assert.equal(fontes.length, antes + 1);
  assert.equal(buscas, 0, 'falhar sem nunca ter conectado não busca');
  c.fechar();
  falhar();
  r.avancar(10 * 60 * 1000);
  assert.equal(fontes.length, antes + 1, 'fechado não reabre');
});

test('canal: espera volta ao início depois de conectar', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  const c = puro.criarCanal({ url: 'u', criarFonte, aoBuscar: () => {}, setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  const falhar = () => { const f = fontes[fontes.length - 1]; f.readyState = 2; f.onerror(); };
  falhar(); r.avancar(5000); falhar(); r.avancar(10000);
  fontes[fontes.length - 1].onopen();
  falhar();
  const n = fontes.length;
  r.avancar(5000);
  assert.equal(fontes.length, n + 1);
});

test('canal: abrir duas vezes não duplica; fechar encerra a conexão e os timers', () => {
  const r = relogioFalso();
  const { fontes, criarFonte } = fabricaFonte();
  let buscas = 0;
  const c = puro.criarCanal({ url: 'u', criarFonte, aoBuscar: () => { buscas++; }, setTimer: r.setTimer, clearTimer: r.clearTimer });
  c.abrir();
  c.abrir();
  assert.equal(fontes.length, 1);
  fontes[0].onopen();
  msg(fontes[0], mudou);
  c.fechar();
  assert.equal(fontes[0].fechada, true);
  assert.equal(r.pendentes(), 0);
  r.avancar(5000);
  assert.equal(buscas, 0);
  assert.equal(c.conectado(), false);
  assert.doesNotThrow(() => msg(fontes[0], mudou), 'mensagem atrasada da fonte velha é ignorada');
  r.avancar(5000);
  assert.equal(buscas, 0);
});

test('canal: sem suporte a EventSource ou erro na criação não quebra', () => {
  const r = relogioFalso();
  const a = puro.criarCanal({ url: 'u', criarFonte: null, aoBuscar: () => {}, setTimer: r.setTimer, clearTimer: r.clearTimer });
  assert.doesNotThrow(() => { a.abrir(); a.fechar(); });
  assert.equal(a.conectado(), false);
  const b = puro.criarCanal({ url: 'u', criarFonte: () => { throw new Error('bloqueado'); }, aoBuscar: () => {}, setTimer: r.setTimer, clearTimer: r.clearTimer });
  assert.doesNotThrow(() => b.abrir());
  assert.equal(r.pendentes(), 0, 'sem suporte real: só o polling, sem tentar de novo');
});

function montarComCanal(opcoes = {}) {
  const r = relogioFalso();
  const f = fabricaFonte();
  const hub = { acessos: { userToken: opcoes.token === undefined ? 'tk1' : opcoes.token }, ouvintes: new Set(), ler() { return this.acessos; }, aoMudar(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); } };
  const pedidos = [];
  const respostas = [...(opcoes.respostas || [])];
  const buscarApi = async (caminho, corpo) => {
    pedidos.push({ caminho, corpo: JSON.parse(JSON.stringify(corpo)) });
    const x = respostas.shift();
    return typeof x === 'function' ? x() : x;
  };
  const store = criar({ hub, storage: storageFalso(), buscarApi, agora: () => T0, criarFonte: f.criarFonte, urlEventos: 'http://x/api/eventos', setTimer: r.setTimer, clearTimer: r.clearTimer });
  return { store, hub, pedidos, r, f };
}

test('store: sem token não abre canal; com token abre um só, mesmo iniciando duas vezes', () => {
  const a = montarComCanal({ token: '', respostas: [] });
  a.store.iniciar();
  assert.equal(a.f.fontes.length, 0);
  const b = montarComCanal({ respostas: [lista()] });
  b.store.iniciar();
  b.store.iniciar();
  assert.equal(b.f.fontes.length, 1);
});

test('store: troca de token fecha o canal antigo e abre outro; token removido fecha', () => {
  const m = montarComCanal({ respostas: [lista(), lista()] });
  m.store.iniciar();
  m.hub.acessos = { userToken: 'tk2' };
  m.hub.ouvintes.forEach((fn) => fn());
  assert.equal(m.f.fontes.length, 2);
  assert.equal(m.f.fontes[0].fechada, true);
  assert.equal(m.f.fontes[1].fechada, false);
  m.hub.acessos = { userToken: '' };
  m.hub.ouvintes.forEach((fn) => fn());
  assert.equal(m.f.fontes[1].fechada, true);
  assert.equal(m.f.fontes.length, 2);
});

test('store: aviso busca com a assinatura, mantém a lista fresca e marca ao vivo', async () => {
  const m = montarComCanal({ respostas: [lista(), { semMudanca: true, assinatura: 'a1' }] });
  m.store.iniciar();
  await umTick();
  assert.equal(m.store.estado().fresco, true);
  const fonte = m.f.fontes[0];
  fonte.onopen();
  assert.equal(m.store.estado().aoVivo, true);
  for (let i = 0; i < 5; i++) msg(fonte, mudou);
  m.r.avancar(600);
  assert.equal(m.pedidos.length, 2, 'pré-carga + 1 busca do aviso');
  assert.equal(m.pedidos[1].corpo.assinatura, 'a1');
  assert.equal(m.store.estado().fresco, true, 'continua fresca: a tela não mostra Atualizando');
  await umTick();
  assert.equal(m.store.estado().dados.itens.length, 1);
  fonte.readyState = 0;
  fonte.onerror();
  assert.equal(m.store.estado().aoVivo, false);
});

test('store: aviso durante busca em voo gera uma nova busca ao terminar', async () => {
  let soltar;
  const lenta = () => new Promise((res) => { soltar = () => res(lista()); });
  const m = montarComCanal({ respostas: [lenta, lista({ itens: [{ id: 1 }, { id: 2 }], assinatura: 'a2' })] });
  m.store.iniciar();
  const fonte = m.f.fontes[0];
  fonte.onopen();
  msg(fonte, mudou);
  m.r.avancar(600);
  assert.equal(m.pedidos.length, 1, 'reaproveita a busca em voo');
  soltar();
  await umTick();
  await umTick();
  assert.equal(m.pedidos.length, 2, 'o aviso chegou durante a busca: busca de novo');
  assert.equal(m.store.estado().dados.itens.length, 2);
});

test('store: sem criarFonte (navegador sem EventSource) segue só com a busca normal', async () => {
  const m = montar({ respostas: [lista()] });
  m.store.iniciar();
  await m.store.buscar();
  assert.equal(m.store.estado().aoVivo, false);
  assert.equal(m.store.estado().dados.itens.length, 1);
});

// Cada aba do Hub segura conexões abertas (avisos); o navegador abre no máximo 6 por endereço. Aba escondida solta
// o canal e, ao voltar, reabre e busca a lista (pode ter perdido avisos enquanto estava fechado).
test('store: pausar fecha o canal; retomar reabre e busca de novo; sem token não reabre', async () => {
  const m = montarComCanal({ respostas: [lista(), lista()] });
  m.store.iniciar();
  await umTick();
  assert.equal(m.f.fontes.length, 1);
  m.store.pausar();
  assert.equal(m.f.fontes[0].fechada, true);
  m.store.pausar();
  m.store.retomar();
  assert.equal(m.f.fontes.length, 2);
  assert.equal(m.f.fontes[1].fechada, false);
  await umTick();
  assert.equal(m.pedidos.length, 2);
  const sem = montarComCanal({ token: '', respostas: [] });
  sem.store.iniciar();
  sem.store.pausar();
  sem.store.retomar();
  assert.equal(sem.f.fontes.length, 0);
});
