const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../whatsapp');
const { validarSecao, configPadrao } = require('../admin');

test('normalizarTelefone: só dígitos, com DDI 55 quando vier sem', () => {
  assert.equal(W.normalizarTelefone('(31) 98888-7777'), '5531988887777');
  assert.equal(W.normalizarTelefone('+55 31 98888-7777'), '5531988887777');
  assert.equal(W.normalizarTelefone('5531988887777@s.whatsapp.net'), '5531988887777');
  assert.equal(W.normalizarTelefone('5531988887777:12@s.whatsapp.net'), '5531988887777');
  assert.equal(W.normalizarTelefone('031988887777'), '5531988887777');
  assert.equal(W.normalizarTelefone('1234'), '');
  assert.equal(W.normalizarTelefone(null), '');
});

test('mesmoTelefone: aceita com e sem o nono dígito (números antigos do WhatsApp vêm sem o 9)', () => {
  assert.equal(W.mesmoTelefone('5531988887777', '553188887777'), true);
  assert.equal(W.mesmoTelefone('(31) 98888-7777', '31 8888-7777'), true);
  assert.equal(W.mesmoTelefone('5531988887777', '5531988887778'), false);
  assert.equal(W.mesmoTelefone('5531988887777', '5511988887777'), false, 'DDD diferente');
  assert.equal(W.mesmoTelefone('', ''), false);
});

test('validarVinculo: telefone válido e usuário do GLPI (id) obrigatórios', () => {
  assert.deepEqual(W.validarVinculo({ telefone: '(31) 98888-7777', glpiId: '12', nome: ' Maria Silva ' }).valor, { telefone: '5531988887777', glpiId: 12, nome: 'Maria Silva' });
  assert.equal(W.validarVinculo({ telefone: '12', glpiId: 1 }).ok, false);
  assert.equal(W.validarVinculo({ telefone: '31988887777' }).ok, false);
  assert.equal(W.validarVinculo({ telefone: '31988887777', glpiId: 0 }).ok, false);
  assert.equal(W.validarVinculo(null).ok, false);
});

test('achar vínculo pelo telefone da mensagem', () => {
  const lista = [{ telefone: '5531988887777', glpiId: 12, nome: 'Maria' }, { telefone: '5511977776666', glpiId: 13, nome: 'João' }];
  assert.equal(W.acharVinculo(lista, '553188887777@s.whatsapp.net').glpiId, 12);
  assert.equal(W.acharVinculo(lista, '5511977776666').glpiId, 13);
  assert.equal(W.acharVinculo(lista, '5599900001111'), null);
});

test('montarChamado: título da primeira linha, descrição com o texto e a origem; sem travessão', () => {
  const c = W.montarChamado({ texto: 'Alterar senha do SGA do Fulano de Tal\nUsuário: fulano.tal', vinculo: { nome: 'Maria Silva' }, grupo: { nome: 'Cadastro' }, tipoNome: 'Alterar senha do SGA' });
  assert.equal(c.titulo, 'Alterar senha do SGA do Fulano de Tal');
  assert.match(c.descricao, /^Alterar senha do SGA do Fulano de Tal\nUsuário: fulano\.tal/);
  assert.match(c.descricao, /Aberto pelo ARX Hub a partir do WhatsApp \(grupo Cadastro, solicitante Maria Silva\)/);
  assert.ok(!/[—–]| - /.test(c.descricao));
  const longo = W.montarChamado({ texto: 'x'.repeat(400), vinculo: { nome: 'M' }, grupo: { nome: 'G' }, tipoNome: 'Tipo' });
  assert.ok(longo.titulo.length <= 120);
  const vazio = W.montarChamado({ texto: '   ', vinculo: { nome: 'M' }, grupo: { nome: 'G' }, tipoNome: 'Tipo X' });
  assert.equal(vazio.titulo, 'Tipo X');
});

test('reacaoDoStatus e textoResposta', () => {
  const r = configPadrao().whatsapp.reacoes;
  assert.equal(W.reacaoDoStatus('pendente', r), r.aFazer);
  assert.equal(W.reacaoDoStatus('aberto', r), r.andamento);
  assert.equal(W.reacaoDoStatus('concluido', r), r.sucesso);
  assert.equal(W.reacaoDoStatus('erro', r), r.erro);
  assert.equal(W.reacaoDoStatus('sem_vinculo', r), r.duvida);
  assert.equal(W.reacaoDoStatus('sem_tipo', r), r.duvida);
  assert.equal(W.reacaoDoStatus('observado', r), null, 'observação não reage');
  assert.equal(W.textoResposta('Chamado {chamado} concluído para {solicitante}.', { ticketId: 321, solicitante: 'Maria' }), 'Chamado 321 concluído para Maria.');
});

test('padrão: reação de andamento é a lupa, modo observação, operação pela fila do automático', () => {
  const p = configPadrao().whatsapp;
  assert.equal(p.reacoes.andamento, '🔍');
  assert.equal(p.modo, 'observacao');
  assert.equal(p.operacao, 'fila_automatico');
  assert.ok(p.respostaModelo.includes('{chamado}'));
});

test('operação: fila_automatico e so_abrir valem; totalmente automático é recusado com o motivo', () => {
  const base = configPadrao().whatsapp;
  assert.equal(validarSecao('whatsapp', { ...base, operacao: 'so_abrir', modo: 'ativo' }).valor.operacao, 'so_abrir');
  const r = validarSecao('whatsapp', { ...base, operacao: 'totalmente' });
  assert.equal(r.ok, false);
  assert.match(r.error, /logins do SGA e do PowerCRM/);
  assert.equal(validarSecao('whatsapp', { ...base, operacao: 'outra' }).ok, false);
  assert.equal(validarSecao('whatsapp', { ...base, modo: 'aprovacao' }).ok, false, 'modo antigo não existe mais');
});

test('grupo guarda a categoria do GLPI; modelo de resposta é validado', () => {
  const base = configPadrao().whatsapp;
  const g = { id: 'g1', nome: 'Grupo Tech', categoriaId: '45', categoriaLabel: 'Tech Protege', tipos: [] };
  const ok = validarSecao('whatsapp', { ...base, grupos: [g] });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.valor.grupos[0].categoriaId, 45);
  assert.equal(ok.valor.grupos[0].categoriaLabel, 'Tech Protege');
  assert.equal(validarSecao('whatsapp', { ...base, grupos: [{ ...g, categoriaId: 'abc' }] }).ok, false);
  assert.equal(validarSecao('whatsapp', { ...base, grupos: [{ id: 'g2', nome: 'Sem categoria' }] }).valor.grupos[0].categoriaId, null);
  assert.equal(validarSecao('whatsapp', { ...base, respostaModelo: 'x'.repeat(500) }).ok, false);
  assert.equal(validarSecao('whatsapp', { ...base, respostaModelo: '   ' }).ok, false);
});

test('tipoComIa: concorda vale; discorda forte troca só para tipo liberado; certeza de que não é pedido ignora', () => {
  const { tipoComIa } = require('../whatsapp');
  const cfg = { confiancaMinima: 0.8, automaticoTipos: ['cadastro_usuario'] };
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: null, cfg }), { tipo: 'senha_sistemas', origem: 'regra' });
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: { tipo: 'senha_sistemas', confianca: 0.5 }, cfg }), { tipo: 'senha_sistemas', origem: 'regra e ia' });
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: { tipo: 'cadastro_usuario', confianca: 0.9 }, cfg }), { tipo: 'cadastro_usuario', origem: 'ia' });
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: { tipo: 'fechamento', confianca: 0.99 }, cfg }), { tipo: 'senha_sistemas', origem: 'regra' });
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: { tipo: 'cadastro_usuario', confianca: 0.6 }, cfg }), { tipo: 'senha_sistemas', origem: 'regra' });
  assert.deepEqual(tipoComIa({ tipoRegra: 'senha_sistemas', ia: { tipo: 'sem_automacao', confianca: 0.95 }, cfg }), { tipo: null, origem: 'ia' });
  assert.deepEqual(tipoComIa({ tipoRegra: null, ia: { tipo: 'cadastro_usuario', confianca: 0.95 }, cfg }), { tipo: 'cadastro_usuario', origem: 'ia' });
});
