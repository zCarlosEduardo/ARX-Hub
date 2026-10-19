// Cofre dos acessos (cifra no navegador). Roda com o WebCrypto do Node e um storage de mentira.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { criarCofre, CHAVE } = require('../public/cofre');

function storageFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
// 1.000 voltas nos testes (o padrão real é 600 mil)
const novo = (extra = {}) => {
  const storage = storageFalso();
  return { storage, cofre: criarCofre({ storage, crypto: webcrypto, iteracoes: 1000, ocioMs: 0, ...extra }) };
};
const DADOS = { userToken: 'tok-glpi-secreto', sgas: [{ usuario: 'op', senha: 'Senha-SGA-123', empresas: ['valle'] }], crm: { usuario: 'a@b.com', senha: 'Senha-CRM-456' }, senhaPadrao: 'Padrao-789' };

test('cria o cofre e o que fica gravado NÃO contém nenhum segredo em texto puro', async () => {
  const { storage, cofre } = novo();
  assert.equal(cofre.existe(), false);
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  assert.equal(cofre.existe(), true);
  assert.equal(cofre.aberto(), true);
  const gravado = storage.getItem(CHAVE);
  for (const segredo of ['tok-glpi-secreto', 'Senha-SGA-123', 'Senha-CRM-456', 'Padrao-789', 'a@b.com', 'minha-senha-mestra-forte']) {
    assert.ok(!gravado.includes(segredo), `${segredo} apareceu no que fica no navegador`);
  }
  const blob = JSON.parse(gravado);
  assert.equal(blob.v, 1);
  assert.equal(blob.kdf, 'PBKDF2-SHA256');
  assert.ok(blob.salt && blob.iv && blob.ct);
});

test('travar e destravar com a senha certa devolve os mesmos dados', async () => {
  const { cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  cofre.travar();
  assert.equal(cofre.aberto(), false);
  assert.deepEqual(await cofre.abrir('minha-senha-mestra-forte'), DADOS);
  assert.equal(cofre.aberto(), true);
});

test('senha errada não abre (e o cofre continua travado)', async () => {
  const { cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  cofre.travar();
  await assert.rejects(() => cofre.abrir('senha-errada-qualquer'), /Senha mestra incorreta/);
  assert.equal(cofre.aberto(), false);
  await assert.rejects(() => cofre.abrir(''), /Senha mestra incorreta/);
});

test('gravar guarda de novo cifrado, com iv novo a cada vez; travado não grava', async () => {
  const { storage, cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  const antes = JSON.parse(storage.getItem(CHAVE));
  await cofre.gravar({ ...DADOS, senhaPadrao: 'Outra-senha-padrao' });
  const depois = JSON.parse(storage.getItem(CHAVE));
  assert.notEqual(antes.iv, depois.iv);
  assert.equal(antes.salt, depois.salt);
  assert.ok(!storage.getItem(CHAVE).includes('Outra-senha-padrao'));
  cofre.travar();
  await assert.rejects(() => cofre.gravar(DADOS), /travado/);
  assert.equal((await cofre.abrir('minha-senha-mestra-forte')).senhaPadrao, 'Outra-senha-padrao');
});

test('recusa senha mestra curta e não sobrescreve cofre que já existe', async () => {
  const { cofre } = novo();
  await assert.rejects(() => cofre.criar('curta', DADOS), /ao menos 10/);
  assert.equal(cofre.existe(), false);
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  await assert.rejects(() => cofre.criar('outra-senha-mestra-forte', {}), /Já existe um cofre/);
});

test('trocar a senha mestra: confere a atual, a antiga deixa de valer e os dados se mantêm', async () => {
  const { cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  await assert.rejects(() => cofre.trocarSenha('errada-errada', 'nova-senha-mestra-forte'), /incorreta/);
  await cofre.trocarSenha('minha-senha-mestra-forte', 'nova-senha-mestra-forte');
  cofre.travar();
  await assert.rejects(() => cofre.abrir('minha-senha-mestra-forte'), /incorreta/);
  assert.deepEqual(await cofre.abrir('nova-senha-mestra-forte'), DADOS);
  await assert.rejects(() => cofre.trocarSenha('nova-senha-mestra-forte', 'curta'), /ao menos 10/);
});

test('blob adulterado não abre (AES-GCM detecta)', async () => {
  const { storage, cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  const blob = JSON.parse(storage.getItem(CHAVE));
  const ct = Buffer.from(blob.ct, 'base64');
  ct[0] ^= 0xff;
  storage.setItem(CHAVE, JSON.stringify({ ...blob, ct: ct.toString('base64') }));
  cofre.travar();
  await assert.rejects(() => cofre.abrir('minha-senha-mestra-forte'), /incorreta/);
});

test('trava sozinho por ociosidade e a atividade da pessoa adia a trava', async () => {
  const timers = [];
  const setTimer = (fn, ms) => {
    const t = { fn, ms, ativo: true };
    timers.push(t);
    return t;
  };
  const clearTimer = (t) => {
    if (t) t.ativo = false;
  };
  const eventos = [];
  const { cofre } = novo({ ocioMs: 15 * 60 * 1000, setTimer, clearTimer });
  cofre.aoMudar((e) => eventos.push(e));
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  assert.equal(timers.filter((t) => t.ativo).length, 1);
  cofre.atividade();
  assert.equal(timers.filter((t) => t.ativo).length, 1, 'só um relógio ativo por vez');
  assert.equal(timers.length, 2);
  timers.filter((t) => t.ativo)[0].fn();
  assert.equal(cofre.aberto(), false);
  assert.deepEqual(eventos.map((e) => `${e.aberto}:${e.motivo}`), ['true:criado', 'false:ocio']);
});

test('outra aba: mesma senha relê os dados; senha trocada lá trava esta aba', async () => {
  const storage = storageFalso();
  const a = criarCofre({ storage, crypto: webcrypto, iteracoes: 1000, ocioMs: 0 });
  const b = criarCofre({ storage, crypto: webcrypto, iteracoes: 1000, ocioMs: 0 });
  await a.criar('minha-senha-mestra-forte', DADOS);
  await b.abrir('minha-senha-mestra-forte');
  await a.gravar({ ...DADOS, senhaPadrao: 'mudou-na-aba-a' });
  assert.equal((await b.reler()).senhaPadrao, 'mudou-na-aba-a');
  await a.trocarSenha('minha-senha-mestra-forte', 'nova-senha-mestra-forte');
  assert.equal(await b.reler(), null);
  assert.equal(b.aberto(), false);
});

test('apagar remove tudo do navegador (esqueci a senha mestra)', async () => {
  const { storage, cofre } = novo();
  await cofre.criar('minha-senha-mestra-forte', DADOS);
  cofre.apagar();
  assert.equal(cofre.existe(), false);
  assert.equal(cofre.aberto(), false);
  assert.equal(storage.getItem(CHAVE), null);
});

test('abrir sem cofre existente dá erro claro', async () => {
  const { cofre } = novo();
  await assert.rejects(() => cofre.abrir('qualquer-senha-aqui'), /Não existe cofre/);
});
