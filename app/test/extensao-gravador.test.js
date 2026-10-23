// ARX Gravador: o que sai mascarado antes de ser gravado e o formato dos passos (dados fictícios).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../extensoes/arx-gravador/mascarar');

test('texto de tela: dados pessoais viram o tipo', () => {
  assert.equal(M.mascararTexto('Associado 123.456.789-09 placa ABC1D23'), 'Associado [cpf] placa [placa]');
  assert.equal(M.mascararTexto('CNPJ 12.345.678/0001-90'), 'CNPJ [cnpj]');
  assert.equal(M.mascararTexto('fulano.teste@exemplo.com.br (31) 98888-7777'), '[email] [telefone]');
  assert.equal(M.mascararTexto('Chassi 9BWZZZ377VT004251 cód 12345'), 'Chassi [chassi] cód [número]');
  assert.equal(M.mascararTexto('Salvar'), 'Salvar');
  assert.equal(M.mascararTexto('x'.repeat(100), 10).length, 10);
});

test('valor de campo: senha nunca, texto livre só o tamanho, caixa marcada ou não', () => {
  assert.equal(M.valorDoCampo({ tipo: 'password', valor: 'Segredo@123' }), '[senha]');
  assert.equal(M.valorDoCampo({ tipo: 'text', valor: '123.456.789-09' }), '[cpf]');
  assert.equal(M.valorDoCampo({ tipo: 'text', valor: 'Maria da Silva' }), '[texto de 14 caracteres]');
  assert.equal(M.valorDoCampo({ tipo: 'text', valor: 'Rua 1234 apto' }), '[texto de 13 caracteres]');
  assert.equal(M.valorDoCampo({ tipo: 'text', valor: '01/02/2026' }), '[data]');
  assert.equal(M.valorDoCampo({ tipo: 'text', valor: '' }), '[vazio]');
  assert.equal(M.valorDoCampo({ tipo: 'checkbox', marcado: true }), 'marcado');
  assert.equal(M.valorDoCampo({ tipo: 'radio', marcado: false }), 'desmarcado');
});

test('endereço: caminho mascarado e só o nome dos parâmetros', () => {
  assert.equal(M.enderecoMascarado('https://sga.hinova.com.br/sga/sgav4_valle/v5/Associado/alterar/123456?cpf=12345678909&aba=2'), 'https://sga.hinova.com.br/sga/sgav4_valle/v5/Associado/alterar/[número]?cpf=…&aba=…');
  assert.equal(M.enderecoMascarado('não é endereço'), '');
});

test('só grava SGA e PowerCRM por https; passo da página é conferido e cortado', () => {
  assert.ok(M.siteGravavel('https://sga.hinova.com.br/sga/x'));
  assert.ok(M.siteGravavel('https://app.powercrm.com.br/pipeline'));
  assert.equal(M.siteGravavel('http://sga.hinova.com.br/'), false);
  assert.equal(M.siteGravavel('https://hinova.com.br.golpe.com/'), false);
  assert.equal(M.limparPasso({ acao: 'apagar_tudo' }), null);
  const p = M.limparPasso({ acao: 'campo', alvo: { tag: 'input', rotulo: 'CPF', extra: 'x' }, valor: '[cpf]', lixo: 1 });
  assert.deepEqual(Object.keys(p).sort(), ['acao', 'alvo', 'tecla', 'titulo', 'url', 'valor']);
  assert.equal(p.alvo.extra, undefined);
  assert.equal(M.descreverPasso(p), 'Preencheu "CPF" com [cpf]');
  assert.equal(M.descreverPasso({ acao: 'clique', alvo: { rotulo: 'Salvar' } }), 'Clicou em "Salvar"');
});
