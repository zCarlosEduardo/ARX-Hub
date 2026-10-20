const test = require('node:test');
const assert = require('node:assert/strict');
const { validarId, validarUrl, validarAutomacao, validarUrlTeste } = require('../validacao');

test('validarId aceita inteiro positivo', () => {
  assert.equal(validarId('12'), 12);
  assert.equal(validarId('1'), 1);
});

test('validarId rejeita lixo', () => {
  for (const v of ['abc', '0', '-3', '1.5', '', ' ', '1e3', '12abc', undefined, null, '99999999999999999999']) {
    assert.equal(validarId(v), null, String(v));
  }
});

test('validarUrl aceita só http/https', () => {
  assert.equal(validarUrl('http://192.168.0.10:8081'), 'http://192.168.0.10:8081');
  assert.equal(validarUrl('  https://exemplo.com/x  '), 'https://exemplo.com/x');
  for (const v of ['ftp://x.com', 'javascript:alert(1)', 'file:///etc/passwd', 'nao eh url', '', null, 42]) {
    assert.equal(validarUrl(v), null, String(v));
  }
  assert.equal(validarUrl('http://a.com/' + 'x'.repeat(2100)), null);
});

test('validarAutomacao normaliza e aplica padrões', () => {
  const r = validarAutomacao({ name: ' Boletos ', url: 'http://h:1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, {
    name: 'Boletos', url: 'http://h:1', container: '', description: '',
    icon: 'Workflow', color: '#1E4A9E', categories: [], vncPorta: null, minutosPorItem: null,
  });
});

test('validarAutomacao: minutos por item aceitam vírgula, arredondam a 1 casa e recusam fora da faixa', () => {
  const base = { name: 'x', url: 'http://a' };
  assert.equal(validarAutomacao({ ...base, minutosPorItem: '4,25' }).valor.minutosPorItem, 4.3);
  assert.equal(validarAutomacao({ ...base, minutosPorItem: 0 }).valor.minutosPorItem, 0);
  assert.equal(validarAutomacao({ ...base, minutosPorItem: -1 }).ok, false);
  assert.equal(validarAutomacao({ ...base, minutosPorItem: 'muito' }).ok, false);
});

test('validarAutomacao: porta da tela ao vivo é opcional e precisa ser porta válida', () => {
  const base = { name: 'x', url: 'http://a' };
  assert.equal(validarAutomacao({ ...base, vncPorta: '4004' }).valor.vncPorta, 4004);
  assert.equal(validarAutomacao({ ...base, vncPorta: '' }).valor.vncPorta, null);
  assert.equal(validarAutomacao({ ...base, vncPorta: 70000 }).ok, false);
  assert.equal(validarAutomacao({ ...base, vncPorta: 'abc' }).ok, false);
});

test('validarAutomacao exige name e url válida', () => {
  assert.equal(validarAutomacao({}).ok, false);
  assert.equal(validarAutomacao(undefined).ok, false);
  assert.equal(validarAutomacao({ name: '  ', url: 'http://a' }).ok, false);
  assert.equal(validarAutomacao({ name: 'x', url: 'ftp://a' }).ok, false);
  assert.equal(validarAutomacao({ name: 'x', url: 'http://a' }).ok, true);
});

test('validarAutomacao aplica limites e formatos', () => {
  const base = { name: 'x', url: 'http://a' };
  assert.equal(validarAutomacao({ ...base, name: 'n'.repeat(121) }).ok, false);
  assert.equal(validarAutomacao({ ...base, description: 'd'.repeat(501) }).ok, false);
  assert.equal(validarAutomacao({ ...base, container: 'c'.repeat(121) }).ok, false);
  assert.equal(validarAutomacao({ ...base, color: 'red' }).ok, false);
  assert.equal(validarAutomacao({ ...base, color: '#12345' }).ok, false);
  assert.equal(validarAutomacao({ ...base, color: '#aBc123' }).ok, true);
  assert.equal(validarAutomacao({ ...base, icon: '<script>' }).ok, false);
  assert.equal(validarAutomacao({ ...base, icon: 'BarChart3' }).ok, true);
  assert.equal(validarAutomacao({ ...base, categories: 'db' }).ok, false);
  assert.equal(validarAutomacao({ ...base, categories: [1] }).ok, false);
  assert.equal(validarAutomacao({ ...base, categories: Array(21).fill('a') }).ok, false);
  assert.equal(validarAutomacao({ ...base, categories: ['a'.repeat(41)] }).ok, false);
  assert.deepEqual(validarAutomacao({ ...base, categories: ['db', 'info'] }).valor.categories, ['db', 'info']);
});

test('validarAutomacao rejeita campos não-string', () => {
  assert.equal(validarAutomacao({ name: { a: 1 }, url: 'http://a' }).ok, false);
  assert.equal(validarAutomacao({ name: 'x', url: 'http://a', description: 5 }).ok, false);
});

test('validarUrlTeste valida só o formato', () => {
  assert.equal(validarUrlTeste('http://10.0.0.1:80').ok, true);
  assert.equal(validarUrlTeste('gopher://x').ok, false);
  assert.equal(validarUrlTeste(undefined).ok, false);
});
