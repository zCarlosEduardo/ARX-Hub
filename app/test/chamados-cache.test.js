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
