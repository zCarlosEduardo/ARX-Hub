const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizar } = require('../glpi');

test('sanitizar oculta tokens na mensagem', () => {
  const msg = sanitizar('erro com user_token abc12345XYZ e sessão sess-999', ['abc12345XYZ', 'sess-999', null]);
  assert.equal(msg, 'erro com user_token [oculto] e sessão [oculto]');
  assert.ok(!msg.includes('abc12345XYZ'));
});

test('sanitizar tolera entradas vazias', () => {
  assert.equal(sanitizar(undefined, ['abcd']), '');
  assert.equal(sanitizar('ok', []), 'ok');
});
