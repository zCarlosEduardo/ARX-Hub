// Motor de reserva do cofre (páginas sem WebCrypto, como o Hub aberto por http://IP-da-rede) e compatibilidade com o WebCrypto.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
require('../public/vendor/arx-cripto.min.js'); // define globalThis.ArxCriptoJs
const { criarCofre, CHAVE } = require('../public/cofre');

const RESERVA = globalThis.ArxCriptoJs;
const SEM_SUBTLE = { getRandomValues: (a) => webcrypto.getRandomValues(a) }; // como o navegador em HTTP: tem aleatório, não tem subtle

function storageFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const comReserva = (storage = storageFalso(), extra = {}) => ({ storage, cofre: criarCofre({ storage, crypto: SEM_SUBTLE, reserva: RESERVA, iteracoes: 1000, ocioMs: 0, ...extra }) });
const comWebCrypto = (storage = storageFalso()) => ({ storage, cofre: criarCofre({ storage, crypto: webcrypto, reserva: null, iteracoes: 1000, ocioMs: 0 }) });
const DADOS = { userToken: 'tok-glpi-secreto', sgas: [{ usuario: 'op', senha: 'Senha-SGA-123', empresas: ['valle'] }], crm: { usuario: 'a@b.com', senha: 'Senha-CRM-456' }, senhaPadrao: 'Padrao-789' };

test('sem subtle e com o motor de reserva: usa o motor "reserva"; com subtle, o WebCrypto', () => {
  assert.equal(comReserva().cofre.motor, 'reserva');
  assert.equal(comReserva().cofre.disponivel(), true);
  assert.equal(comWebCrypto().cofre.motor, 'webcrypto');
});

test('sem subtle e sem motor de reserva: indisponível, com mensagem clara (nada de erro técnico)', async () => {
  const cofre = criarCofre({ storage: storageFalso(), crypto: SEM_SUBTLE, reserva: null, iteracoes: 1000, ocioMs: 0 });
  assert.equal(cofre.motor, null);
  assert.equal(cofre.disponivel(), false);
  await assert.rejects(() => cofre.criar('minha-senha-mestra-forte', DADOS), /não permite criptografar nesta página/);
  await assert.rejects(() => cofre.abrir('minha-senha-mestra-forte'), /não permite criptografar nesta página/);
  assert.ok(!/importKey|undefined/.test(await cofre.criar('minha-senha-mestra-forte', DADOS).catch((e) => e.message)));
});

test('motor de reserva: cria sem segredo em texto puro, trava, destrava, recusa senha errada', async () => {
  const { storage, cofre } = comReserva();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  const gravado = storage.getItem(CHAVE);
  for (const segredo of ['tok-glpi-secreto', 'Senha-SGA-123', 'Senha-CRM-456', 'Padrao-789', 'a@b.com', 'minha-senha-mestra-forte']) assert.ok(!gravado.includes(segredo), segredo);
  const blob = JSON.parse(gravado);
  assert.deepEqual([blob.v, blob.kdf], [1, 'PBKDF2-SHA256']);
  cofre.travar();
  assert.equal(cofre.aberto(), false);
  await assert.rejects(() => cofre.abrir('senha-errada-qualquer'), /Senha mestra incorreta/);
  assert.deepEqual(await cofre.abrir('minha-senha-mestra-forte'), DADOS);
});

test('motor de reserva: gravar usa iv novo, trocar a senha mestra funciona e adulteração é detectada', async () => {
  const { storage, cofre } = comReserva();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  const antes = JSON.parse(storage.getItem(CHAVE));
  await cofre.gravar({ ...DADOS, senhaPadrao: 'Outra-senha-padrao' });
  const depois = JSON.parse(storage.getItem(CHAVE));
  assert.notEqual(antes.iv, depois.iv);
  assert.ok(!storage.getItem(CHAVE).includes('Outra-senha-padrao'));
  await cofre.trocarSenha('minha-senha-mestra-forte', 'nova-senha-mestra-forte');
  cofre.travar();
  await assert.rejects(() => cofre.abrir('minha-senha-mestra-forte'), /incorreta/);
  assert.equal((await cofre.abrir('nova-senha-mestra-forte')).senhaPadrao, 'Outra-senha-padrao');
  const blob = JSON.parse(storage.getItem(CHAVE));
  const ct = Buffer.from(blob.ct, 'base64');
  ct[0] ^= 0xff;
  storage.setItem(CHAVE, JSON.stringify({ ...blob, ct: ct.toString('base64') }));
  cofre.travar();
  await assert.rejects(() => cofre.abrir('nova-senha-mestra-forte'), /incorreta/);
});

test('compatibilidade: cofre criado pelo WebCrypto abre no motor de reserva, e o contrário', async () => {
  const storage = storageFalso();
  await comWebCrypto(storage).cofre.criar('minha-senha-mestra-forte', DADOS);
  const reserva = comReserva(storage).cofre;
  assert.deepEqual(await reserva.abrir('minha-senha-mestra-forte'), DADOS);
  await reserva.gravar({ ...DADOS, senhaPadrao: 'gravado-pela-reserva' });
  const web = comWebCrypto(storage).cofre;
  assert.equal((await web.abrir('minha-senha-mestra-forte')).senhaPadrao, 'gravado-pela-reserva');
  // e um cofre criado na reserva, com iteração diferente da padrão dos testes, abre no WebCrypto
  const outro = storageFalso();
  await criarCofre({ storage: outro, crypto: SEM_SUBTLE, reserva: RESERVA, iteracoes: 20000, ocioMs: 0 }).criar('minha-senha-mestra-forte', DADOS);
  assert.deepEqual(await comWebCrypto(outro).cofre.abrir('minha-senha-mestra-forte'), DADOS);
});

test('o destravar do motor de reserva não trava a página: devolve o controle ao navegador durante o cálculo', async () => {
  const { cofre } = comReserva(storageFalso(), { iteracoes: 30000 });
  let batidas = 0;
  const relogio = setInterval(() => {
    batidas += 1;
  }, 5);
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  clearInterval(relogio);
  assert.ok(batidas >= 1, 'o laço de eventos continuou rodando durante a derivação da chave');
});
