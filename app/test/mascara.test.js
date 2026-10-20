const test = require('node:test');
const assert = require('node:assert/strict');
const { mascararUrl } = require('../mascara');

test('mascararUrl esconde o host e deixa só a porta', () => {
  assert.equal(mascararUrl('http://192.168.0.10:4016/'), 'xxx.xxx.xxx.xxx:4016');
  assert.equal(mascararUrl('https://automacao.exemplo.com.br/tela?x=1'), 'xxx.xxx.xxx.xxx');
  assert.equal(mascararUrl('http://localhost:4001'), 'xxx:4001');
  assert.equal(mascararUrl('http://[::1]:4002'), 'xxx:4002');
});

test('mascararUrl com entrada inválida não vaza nada', () => {
  assert.equal(mascararUrl('192.168.0.10:4016'), 'xxx'); // sem esquema o URL lê "192.168.0.10:" como esquema
  assert.equal(mascararUrl(''), 'xxx');
  assert.equal(mascararUrl(null), 'xxx');
});
