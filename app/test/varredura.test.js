const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularMudancas } = require('../varredura');

test('só devolve automações cujo status mudou', () => {
  const lista = [
    { id: 1, url: 'http://a', status: 'online' },
    { id: 2, url: 'http://b', status: 'online' },
    { id: 3, url: 'http://c', status: 'checking' },
  ];
  const r = new Map([[1, 'online'], [2, 'offline'], [3, 'online']]);
  assert.deepEqual(calcularMudancas(lista, r), [
    { id: 2, url: 'http://b', status: 'offline' },
    { id: 3, url: 'http://c', status: 'online' },
  ]);
});

test('sem mudança devolve lista vazia; resultado ausente é ignorado', () => {
  assert.deepEqual(calcularMudancas([{ id: 1, url: 'u', status: 'online' }], new Map([[1, 'online']])), []);
  assert.deepEqual(calcularMudancas([{ id: 1, url: 'u', status: 'online' }], new Map()), []);
});
