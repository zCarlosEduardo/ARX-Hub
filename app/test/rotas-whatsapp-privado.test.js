// Atendimento na conversa privada (PV) do robô do WhatsApp: a categoria do GLPI vem da primeira linha da mensagem.
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');

const CAT_ANCORE = { apelido: 'Ancore', categoriaId: 3, categoriaLabel: 'Ancore' };
const privado = (mud = {}) => ({ ativo: true, tipos: [], responder: true, reagir: true, categorias: [CAT_ANCORE, { apelido: 'Tech Protege', categoriaId: 45, categoriaLabel: 'Tech' }], ...mud });
const mensagemPv = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'pv1', privado: true, grupoJid: '5531988887777@s.whatsapp.net', grupoNome: '', remetente: '5531988887777@s.whatsapp.net', texto: 'Categoria Ancore\n\nAlterar a senha do SGA do Fulano de Tal', ...extra });

test('privado desligado: ignora mesmo com pedido e vínculo', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ ativo: false }) });
  assert.equal((await mensagemPv(s)).json.status, 'ignorado');
  assert.equal(s.repo.e.pedidos.length, 0);
  s.fechar();
});

test('privado: a categoria vem da mensagem, o chamado abre com ela e a linha "Categoria" sai do texto', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await mensagemPv(s)).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.reacao, '🔍');
  assert.equal(s.abertos[0].categoriaId, 3);
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.ok(!/Categoria Ancore/.test(s.abertos[0].descricao));
  assert.match(s.abertos[0].descricao, /conversa privada, solicitante Maria Silva/);
  s.fechar();
});

test('privado: apelido sem espaço ("TechProtege") acha a categoria "Tech Protege"', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  await mensagemPv(s, { texto: 'Categoria TechProtege\nAlterar a senha do SGA do Fulano' });
  assert.equal(s.abertos[0].categoriaId, 45);
  s.fechar();
});

test('privado: sem categoria ou com categoria desconhecida: dúvida, nada é aberto', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const sem = (await mensagemPv(s, { mensagemId: 'a', texto: 'Alterar a senha do SGA do Fulano' })).json;
  assert.equal(sem.status, 'sem_categoria');
  assert.equal(sem.reacao, '❓');
  const desconhecida = (await mensagemPv(s, { mensagemId: 'b', texto: 'Categoria Valle\nAlterar a senha do SGA do Fulano' })).json;
  assert.equal(desconhecida.status, 'sem_categoria');
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('privado: tipo que não está liberado na conversa privada é ignorado; conversa solta também', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ tipos: ['foto_perfil'] }) });
  assert.equal((await mensagemPv(s)).json.status, 'ignorado');
  assert.equal((await mensagemPv(s, { mensagemId: 'c', texto: 'Categoria Ancore\nbom dia, tudo bem?' })).json.status, 'ignorado');
  assert.equal(s.repo.e.pedidos.length, 0);
  s.fechar();
});

test('privado: remetente sem vínculo é ignorado em silêncio (sem reação e sem registro); não autorizado também', async () => {
  const s = await subir();
  await s.configurar({ operacao: 'so_abrir', privado: privado() });
  const r = (await mensagemPv(s)).json;
  assert.equal(r.status, 'ignorado');
  assert.equal(r.reacao, undefined);
  assert.equal(s.repo.e.pedidos.length, 0);
  await s.configurar({ operacao: 'so_abrir', remetentesAutorizados: ['11977776666'], privado: privado() });
  assert.equal((await mensagemPv(s, { mensagemId: 'd' })).json.status, 'ignorado');
  s.fechar();
});

test('privado pela fila do automático: espera com ⏳ e o navegador abre com a categoria da mensagem', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico', privado: privado() });
  assert.equal((await mensagemPv(s)).json.reacao, '⏳');
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  assert.equal((await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`)).status, 200);
  assert.equal(s.abertos[0].categoriaId, 3);
  assert.ok(!/Categoria Ancore/.test(s.abertos[0].descricao));
  s.fechar();
});

test('privado: evento de conclusão responde na própria conversa, conforme a configuração do privado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', privado: privado({ responder: true }) });
  const r = (await mensagemPv(s)).json;
  s.statusDosChamados.set(r.ticketId, 5);
  await s.wa.verificarAbertos();
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json.eventos.pop();
  assert.equal(ev.grupoJid, '5531988887777@s.whatsapp.net');
  assert.equal(ev.reacao, '✅');
  assert.equal(ev.resposta, `Chamado ${r.ticketId} concluído.`);
  await s.configurar({ operacao: 'so_abrir', privado: privado({ responder: false, reagir: false }) });
  const ev2 = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json.eventos.pop();
  assert.equal(ev2.reacao, null);
  assert.equal(ev2.resposta, null);
  s.fechar();
});

test('config do robô informa se o privado está ligado', async () => {
  const s = await subir();
  await s.configurar({ privado: privado({ ativo: true }) });
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/config')).json.privado.ativo, true);
  s.fechar();
});
