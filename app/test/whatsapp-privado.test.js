const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../whatsapp');
const { configPadrao, validarSecao } = require('../admin');

test('extrairCategoria: lê "Categoria X" nas primeiras linhas e tira a linha do texto', () => {
  assert.deepEqual(W.extrairCategoria('Categoria Ancore\n\nCadastro CRM/SGA\nNOME: FULANO'), { apelido: 'Ancore', texto: 'Cadastro CRM/SGA\nNOME: FULANO' });
  assert.deepEqual(W.extrairCategoria('CATEGORIA: Tech Protege\nAlterar senha do SGA'), { apelido: 'Tech Protege', texto: 'Alterar senha do SGA' });
  assert.deepEqual(W.extrairCategoria('categoria - Ancore\nInativação'), { apelido: 'Ancore', texto: 'Inativação' });
  assert.deepEqual(W.extrairCategoria('Bom dia\nCategoria Ancore\nCadastro'), { apelido: 'Ancore', texto: 'Bom dia\nCadastro' });
  assert.deepEqual(W.extrairCategoria('Cadastro CRM/SGA\nNOME: FULANO'), { apelido: '', texto: 'Cadastro CRM/SGA\nNOME: FULANO' });
  assert.equal(W.extrairCategoria('Cadastro\nNOME: X\nCPF: 1\nTELEFONE: 2\nCategoria Ancore').apelido, '', 'só vale nas 3 primeiras linhas');
  assert.equal(W.extrairCategoria('Categoria\nCadastro').apelido, '', 'sem nome depois da palavra não é categoria');
  assert.equal(W.extrairCategoria(null).apelido, '');
});

test('acharCategoria: ignora acento, caixa, espaço e pontuação ("TechProtege" = "Tech Protege")', () => {
  const lista = [{ apelido: 'Tech Protege', categoriaId: 45, categoriaLabel: 'Tech' }, { apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' }];
  assert.equal(W.acharCategoria(lista, 'TechProtege').categoriaId, 45);
  assert.equal(W.acharCategoria(lista, 'ANCORE').categoriaId, 3);
  assert.equal(W.acharCategoria(lista, 'Valle'), null);
  assert.equal(W.acharCategoria(lista, ''), null);
});

test('montarChamado: conversa privada aparece como origem', () => {
  const c = W.montarChamado({ texto: 'Cadastro CRM/SGA', vinculo: { nome: 'Maria' }, grupo: { nome: 'Privado', privado: true }, tipoNome: 'Cadastro de consultor' });
  assert.match(c.descricao, /a partir do WhatsApp \(conversa privada, solicitante Maria\)/);
});

test('reação de sem_categoria é a dúvida', () => {
  assert.equal(W.reacaoDoStatus('sem_categoria', { duvida: '❓' }), '❓');
});

test('conversa privada: padrão desligado; validação de apelidos e tipos', () => {
  const p = configPadrao().whatsapp.privado;
  assert.deepEqual(p, { ativo: false, tipos: [], responder: false, reagir: true, explicarDuvida: true, categorias: [] });
  const base = configPadrao().whatsapp;
  const ok = validarSecao('whatsapp', { ...base, privado: { ativo: true, tipos: ['cadastro_consultor', 'cadastro_consultor'], responder: true, categorias: [{ apelido: ' Ancore ', categoriaId: '3', categoriaLabel: 'Ancore' }] } });
  assert.equal(ok.ok, true, ok.error);
  assert.deepEqual(ok.valor.privado.categorias, [{ apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' }]);
  assert.deepEqual(ok.valor.privado.tipos, ['cadastro_consultor']);
  assert.equal(validarSecao('whatsapp', { ...base, privado: { categorias: [{ apelido: 'A', categoriaId: 1 }, { apelido: 'a ', categoriaId: 2 }] } }).ok, false, 'apelido repetido');
  assert.equal(validarSecao('whatsapp', { ...base, privado: { categorias: [{ apelido: '', categoriaId: 1 }] } }).ok, false);
  assert.equal(validarSecao('whatsapp', { ...base, privado: { categorias: [{ apelido: 'A' }] } }).ok, false, 'categoria do GLPI obrigatória');
  assert.equal(validarSecao('whatsapp', { ...base, privado: { tipos: ['voar'] } }).ok, false);
  const antigo = { ...base };
  delete antigo.privado;
  assert.equal(validarSecao('whatsapp', antigo).valor.privado.ativo, false, 'configuração antiga sem a seção continua válida');
});
