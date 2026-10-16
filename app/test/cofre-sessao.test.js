// Sessão do cofre (como um acesso a sistema): destravado até virar o dia, sobrevive ao F5 e some ao travar ou ao limpar os dados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
require('../public/vendor/arx-cripto.min.js');
const { criarCofre, CHAVE, CHAVE_SESSAO, proximaMeiaNoite } = require('../public/cofre');

const DADOS = { userToken: 'tok-glpi-secreto', sgas: [{ usuario: 'op', senha: 'Senha-SGA-123' }], crm: { usuario: 'a@b.com', senha: 'Senha-CRM-456' } };
const SENHA = 'minha-senha-mestra-forte';

function storageFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

/** Um "navegador": localStorage, sessionStorage e relógio; cada `abrirPagina()` é um F5 (cofre novo sobre o mesmo storage). */
function navegador({ crypto = webcrypto, reserva = null, agora = new Date(2026, 9, 16, 9, 0, 0).getTime() } = {}) {
  const b = { local: storageFalso(), aba: storageFalso(), agora, timers: [] };
  b.abrirPagina = (politica) => {
    const cofre = criarCofre({
      storage: b.local,
      sessionStorage: b.aba,
      crypto,
      reserva,
      iteracoes: 1000,
      agora: () => b.agora,
      setTimer: (fn, ms) => { const t = { fn, ms, ativo: true }; b.timers.push(t); return t; },
      clearTimer: (t) => { if (t) t.ativo = false; },
    });
    if (politica) cofre.definirPolitica(politica);
    return cofre;
  };
  b.timersAtivos = () => b.timers.filter((t) => t.ativo);
  return b;
}

test('sessão do dia: depois de destravar, o F5 NÃO pede a senha e os dados voltam', async () => {
  const b = navegador();
  const a = b.abrirPagina({ sessao: 'dia' });
  await a.criar(SENHA, DADOS);
  assert.ok(b.local.getItem(CHAVE_SESSAO), 'a chave da sessão ficou guardada');
  const f5 = b.abrirPagina({ sessao: 'dia' });
  assert.equal(f5.aberto(), false, 'a página nova começa travada');
  assert.deepEqual(await f5.restaurar(), DADOS);
  assert.equal(f5.aberto(), true);
  // e dá para gravar normalmente depois de restaurar
  await f5.gravar({ ...DADOS, senhaPadrao: 'nova' });
  assert.equal((await b.abrirPagina({ sessao: 'dia' }).restaurar()).senhaPadrao, 'nova');
});

test('o registro da sessão não deixa nenhum segredo em texto puro nem a senha mestra', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  const tudo = JSON.stringify([...b.local._m.entries()]);
  for (const segredo of ['tok-glpi-secreto', 'Senha-SGA-123', 'Senha-CRM-456', 'a@b.com', SENHA]) assert.ok(!tudo.includes(segredo), segredo);
  const sessao = JSON.parse(b.local.getItem(CHAVE_SESSAO));
  assert.deepEqual(Object.keys(sessao).sort(), ['exp', 'k', 'salt', 'v']);
});

test('virou o dia: a sessão vence à meia-noite e volta a pedir a senha mestra', async () => {
  const b = navegador({ agora: new Date(2026, 9, 16, 23, 59, 0).getTime() });
  await b.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  const meiaNoite = new Date(2026, 9, 17, 0, 0, 0, 0).getTime();
  assert.equal(JSON.parse(b.local.getItem(CHAVE_SESSAO)).exp, meiaNoite);
  b.agora = meiaNoite - 1000; // ainda é o mesmo dia
  assert.ok(await b.abrirPagina({ sessao: 'dia' }).restaurar());
  b.agora = meiaNoite; // virou o dia
  const novo = b.abrirPagina({ sessao: 'dia' });
  assert.equal(await novo.restaurar(), null);
  assert.equal(novo.aberto(), false);
  assert.equal(b.local.getItem(CHAVE_SESSAO), null, 'a sessão vencida é apagada');
  assert.deepEqual(await novo.abrir(SENHA), DADOS, 'com a senha mestra continua abrindo');
  assert.equal(proximaMeiaNoite(new Date(2026, 11, 31, 12, 0, 0).getTime()), new Date(2027, 0, 1).getTime(), 'virada de ano');
});

test('o F5 não renova o prazo: a sessão do dia continua vencendo à meia-noite', async () => {
  const b = navegador({ agora: new Date(2026, 9, 16, 9, 0, 0).getTime() });
  await b.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  const prazo = JSON.parse(b.local.getItem(CHAVE_SESSAO)).exp;
  b.agora += 5 * 3600000;
  await b.abrirPagina({ sessao: 'dia' }).restaurar();
  assert.equal(JSON.parse(b.local.getItem(CHAVE_SESSAO)).exp, prazo);
});

test('sessão por horas: vence depois de N horas', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'horas', horas: 2 }).criar(SENHA, DADOS);
  b.agora += 2 * 3600000 - 1000;
  assert.ok(await b.abrirPagina({ sessao: 'horas', horas: 2 }).restaurar());
  b.agora += 2000;
  assert.equal(await b.abrirPagina({ sessao: 'horas', horas: 2 }).restaurar(), null);
});

test('sessão só da aba: fica no sessionStorage (F5 vale), não no localStorage, e outra aba pede a senha', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'aba' }).criar(SENHA, DADOS);
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
  assert.ok(b.aba.getItem(CHAVE_SESSAO));
  assert.deepEqual(await b.abrirPagina({ sessao: 'aba' }).restaurar(), DADOS);
  b.aba._m.clear(); // aba nova: sessionStorage vazio
  assert.equal(await b.abrirPagina({ sessao: 'aba' }).restaurar(), null);
});

test('"pedir sempre": nada da sessão é guardado e o F5 pede a senha; trocar a política apaga o que existia', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'pedir' }).criar(SENHA, DADOS);
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
  assert.equal(await b.abrirPagina({ sessao: 'pedir' }).restaurar(), null);
  // havia sessão do dia e o admin passou para "pedir": a sessão some e não restaura
  const b2 = navegador();
  const c = b2.abrirPagina({ sessao: 'dia' });
  await c.criar(SENHA, DADOS);
  assert.ok(b2.local.getItem(CHAVE_SESSAO));
  assert.equal(await b2.abrirPagina({ sessao: 'pedir' }).restaurar(), null);
  assert.equal(b2.local.getItem(CHAVE_SESSAO), null);
  // e a política aplicada ao cofre aberto também apaga a sessão guardada
  const d = b2.abrirPagina({ sessao: 'dia' });
  await d.abrir(SENHA);
  assert.ok(b2.local.getItem(CHAVE_SESSAO));
  d.definirPolitica({ sessao: 'pedir' });
  assert.equal(b2.local.getItem(CHAVE_SESSAO), null);
});

test('travar agora apaga a sessão: o F5 seguinte pede a senha mestra', async () => {
  const b = navegador();
  const a = b.abrirPagina({ sessao: 'dia' });
  await a.criar(SENHA, DADOS);
  a.travar('manual');
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
  assert.equal(await b.abrirPagina({ sessao: 'dia' }).restaurar(), null);
});

test('limpar os dados do navegador (cookies e armazenamento) trava: sem a chave da sessão não abre sozinho', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  const cifrado = b.local.getItem(CHAVE);
  b.local._m.clear();
  b.local.setItem(CHAVE, cifrado); // cenário: só o texto cifrado sobrou (ex.: cópia do arquivo)
  assert.equal(await b.abrirPagina({ sessao: 'dia' }).restaurar(), null);
});

test('sessão de um cofre que mudou (senha trocada em outra aba) ou estragada é descartada', async () => {
  const b = navegador();
  await b.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  const velha = b.local.getItem(CHAVE_SESSAO);
  await b.abrirPagina({ sessao: 'dia' }).abrir(SENHA).then(async () => { await b.abrirPagina({ sessao: 'dia' }).trocarSenha(SENHA, 'senha-mestra-nova-123'); });
  b.local.setItem(CHAVE_SESSAO, velha); // sessão do sal antigo
  assert.equal(await b.abrirPagina({ sessao: 'dia' }).restaurar(), null);
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
  b.local.setItem(CHAVE_SESSAO, '{quebrado');
  assert.equal(await b.abrirPagina({ sessao: 'dia' }).restaurar(), null);
  const adulterada = JSON.stringify({ v: 1, k: Buffer.alloc(32, 1).toString('base64'), salt: JSON.parse(b.local.getItem(CHAVE)).salt, exp: b.agora + 1000000 });
  b.local.setItem(CHAVE_SESSAO, adulterada); // chave que não é a do cofre
  assert.equal(await b.abrirPagina({ sessao: 'dia' }).restaurar(), null);
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
});

test('trocar a senha mestra atualiza a sessão guardada para a chave nova', async () => {
  const b = navegador();
  const a = b.abrirPagina({ sessao: 'dia' });
  await a.criar(SENHA, DADOS);
  const antes = JSON.parse(b.local.getItem(CHAVE_SESSAO));
  await a.trocarSenha(SENHA, 'senha-mestra-nova-123');
  const depois = JSON.parse(b.local.getItem(CHAVE_SESSAO));
  assert.notEqual(antes.k, depois.k);
  assert.notEqual(antes.salt, depois.salt);
  assert.deepEqual(await b.abrirPagina({ sessao: 'dia' }).restaurar(), DADOS);
});

test('com sessão por prazo não há trava por ociosidade: só o relógio do prazo; em "aba" e "pedir" vale a ociosidade', async () => {
  const b = navegador();
  const dia = b.abrirPagina({ sessao: 'dia' });
  await dia.criar(SENHA, DADOS);
  assert.equal(b.timersAtivos().length, 1);
  const prazo = b.timersAtivos()[0].ms;
  assert.equal(prazo, new Date(2026, 9, 17).getTime() - b.agora, 'o relógio dispara na meia-noite');
  b.timersAtivos()[0].fn();
  assert.equal(dia.aberto(), false, 'o prazo travou o cofre');
  assert.equal(b.local.getItem(CHAVE_SESSAO), null);
  const b2 = navegador();
  const aba = b2.abrirPagina({ sessao: 'aba' });
  await aba.criar(SENHA, DADOS);
  assert.equal(b2.timersAtivos()[0].ms, 15 * 60 * 1000, 'ociosidade de 15 minutos');
});

test('o motor de reserva (HTTP fora de localhost) também guarda e restaura a sessão', async () => {
  const semSubtle = { getRandomValues: (a) => webcrypto.getRandomValues(a) };
  const b = navegador({ crypto: semSubtle, reserva: globalThis.ArxCriptoJs });
  const a = b.abrirPagina({ sessao: 'dia' });
  assert.equal(a.motor, 'reserva');
  await a.criar(SENHA, DADOS);
  assert.deepEqual(await b.abrirPagina({ sessao: 'dia' }).restaurar(), DADOS);
});

test('uma sessão criada pelo WebCrypto restaura no motor de reserva e vice-versa (mesmo formato)', async () => {
  const semSubtle = { getRandomValues: (a) => webcrypto.getRandomValues(a) };
  const web = navegador();
  await web.abrirPagina({ sessao: 'dia' }).criar(SENHA, DADOS);
  // relógios falsos: o relógio real do prazo (horas) manteria o processo do teste vivo
  const reserva = criarCofre({ storage: web.local, sessionStorage: web.aba, crypto: semSubtle, reserva: globalThis.ArxCriptoJs, iteracoes: 1000, agora: () => web.agora, setTimer: () => ({}), clearTimer: () => {} });
  reserva.definirPolitica({ sessao: 'dia' });
  assert.deepEqual(await reserva.restaurar(), DADOS);
});

test('política inválida cai em "pedir" (o mais restritivo) e horas fora da faixa usam 8', () => {
  const b = navegador();
  const c = b.abrirPagina();
  c.definirPolitica({ sessao: 'sempre' });
  assert.equal(c.politica().sessao, 'pedir');
  c.definirPolitica({ sessao: 'horas', horas: 999 });
  assert.deepEqual(c.politica(), { sessao: 'horas', horas: 8 });
});
