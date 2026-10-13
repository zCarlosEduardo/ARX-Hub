const test = require('node:test');
const assert = require('node:assert/strict');
const { lerConfig, verificarSenhaProducao } = require('../config');

test('lerConfig usa padrões e aceita override válido', () => {
  assert.deepEqual(lerConfig({}), { port: 8317, checkIntervalMs: 15000, checkTimeoutMs: 3000 });
  assert.equal(lerConfig({ CHECK_INTERVAL_MS: '30000' }).checkIntervalMs, 30000);
  assert.equal(lerConfig({ CHECK_INTERVAL_MS: 'abc' }).checkIntervalMs, 15000);
  assert.equal(lerConfig({ CHECK_TIMEOUT_MS: '-1' }).checkTimeoutMs, 3000);
});

test('senha: fora de produção nunca falha', () => {
  assert.equal(verificarSenhaProducao({}).ok, true);
});

test('senha: em produção sem POSTGRES_PASSWORD falha com mensagem', () => {
  const r = verificarSenhaProducao({ NODE_ENV: 'production' });
  assert.equal(r.ok, false);
  assert.match(r.error, /POSTGRES_PASSWORD/);
  assert.equal(verificarSenhaProducao({ NODE_ENV: 'production', POSTGRES_PASSWORD: '' }).ok, false);
});

test('senha: em produção com senha própria passa; padrão só avisa', () => {
  const ok = verificarSenhaProducao({ NODE_ENV: 'production', POSTGRES_PASSWORD: 'segredo-forte' });
  assert.deepEqual(ok, { ok: true });
  const aviso = verificarSenhaProducao({ NODE_ENV: 'production', POSTGRES_PASSWORD: 'arxhub_dev_password' });
  assert.equal(aviso.ok, true);
  assert.ok(aviso.aviso);
});
