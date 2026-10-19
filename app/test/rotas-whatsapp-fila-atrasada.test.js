// Pedido que ficou parado na fila porque ninguém estava com o Chamados automático: com o token de serviço, o servidor abre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');

const mensagem = (s, extra = {}) => s.comoBot('POST', '/api/whatsapp/bot/mensagem', { mensagemId: 'm1', grupoJid: '1203@g.us', grupoNome: 'Grupo Tech', remetente: '553188887777@s.whatsapp.net', texto: 'Alterar a senha do SGA do Fulano de Tal', ...extra });
const envelhecer = (s, ms) => { for (const p of s.repo.e.pedidos) p.criadoEm = Date.now() - ms; };

test('pedido recente na fila não é aberto pelo servidor (dá tempo de um navegador pegar)', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  assert.equal((await mensagem(s)).json.status, 'pendente');
  assert.equal(await s.wa.abrirPendentesAtrasados({ esperaMs: 60000 }), 0);
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('pedido parado na fila há mais de um minuto: o servidor abre com o token de serviço e vira andamento', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  await mensagem(s);
  envelhecer(s, 120000);
  assert.equal(await s.wa.abrirPendentesAtrasados({ esperaMs: 60000 }), 1);
  assert.equal(s.abertos.length, 1);
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.equal(s.repo.e.pedidos[0].status, 'aberto');
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json.eventos.pop();
  assert.equal(ev.status, 'aberto');
  assert.equal(ev.reacao, '🔍');
  // e quando alguém finaliza o chamado, de qualquer forma, o robô é avisado
  s.statusDosChamados.set(ev.ticketId, 5);
  await s.wa.verificarAbertos();
  const fim = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json.eventos.pop();
  assert.equal(fim.status, 'concluido');
  assert.equal(fim.reacao, '✅');
  s.fechar();
});

test('sem token de serviço o servidor não abre nada: o pedido continua esperando um navegador', async () => {
  const s = await subir({ servico: false });
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  await mensagem(s);
  envelhecer(s, 120000);
  assert.equal(await s.wa.abrirPendentesAtrasados({ esperaMs: 60000 }), 0);
  assert.equal(s.repo.e.pedidos[0].status, 'pendente');
  s.fechar();
});

test('pedido que um navegador já pegou (abrindo) não é aberto de novo pelo servidor', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  await mensagem(s);
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`);
  envelhecer(s, 120000);
  assert.equal(await s.wa.abrirPendentesAtrasados({ esperaMs: 60000 }), 0);
  assert.equal(s.abertos.length, 1, 'só o do navegador');
  s.fechar();
});

test('falha ao abrir pelo servidor vira erro no pedido, sem repetir o chamado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  await mensagem(s);
  envelhecer(s, 120000);
  s.definirFalha('GLPI recusou');
  assert.equal(await s.wa.abrirPendentesAtrasados({ esperaMs: 60000 }), 0);
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  assert.ok(!/token-de-servico/.test(s.repo.e.pedidos[0].erro), 'não vaza o token');
  s.fechar();
});
