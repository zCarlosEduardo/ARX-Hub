const test = require('node:test');
const assert = require('node:assert/strict');
const { subir, TOKEN_ADMIN, TOKEN_OPERADOR, TOKEN_BOT, TOKEN_SERVICO } = require('./_base-rotas-whatsapp');

test('robô sem credencial ou com credencial errada não passa; sem WHATSAPP_BOT_TOKEN no servidor responde 503', async () => {
  const s = await subir();
  assert.equal((await s.chamar('GET', '/api/whatsapp/bot/config')).status, 401);
  assert.equal((await s.chamar('GET', '/api/whatsapp/bot/config', { headers: { 'X-Bot-Token': 'errado' } })).status, 401);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/config')).status, 200);
  s.fechar();
  const sem = await subir({ bot: false });
  assert.equal((await sem.comoBot('GET', '/api/whatsapp/bot/config')).status, 503);
  sem.fechar();
});

test('administração do WhatsApp só para admin; vínculos criam, atualizam e removem', async () => {
  const s = await subir();
  assert.equal((await s.comoOperador('GET', '/api/admin/whatsapp/painel')).status, 403);
  assert.equal((await s.chamar('GET', '/api/admin/whatsapp/painel')).status, 401);
  assert.equal((await s.vincular()).status, 201);
  assert.equal((await s.vincular('31988887777', 13, 'Maria S.')).json.glpiId, 13, 'mesmo telefone atualiza');
  assert.equal((await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json.vinculos.length, 1);
  assert.equal((await s.comoAdmin('POST', '/api/admin/whatsapp/vinculos', { telefone: '1', glpiId: 1 })).status, 400);
  assert.equal((await s.comoAdmin('DELETE', '/api/admin/whatsapp/vinculos/5531988887777')).status, 204);
  assert.equal((await s.comoAdmin('DELETE', '/api/admin/whatsapp/vinculos/5531988887777')).status, 404);
  s.fechar();
});

test('robô desligado, grupo desconhecido, remetente não autorizado e conversa solta: ignorado, nada é gravado', async () => {
  const s = await subir();
  await s.vincular();
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'automação do WhatsApp desligada');
  await s.configurar({ remetentesAutorizados: ['11977776666'] });
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'remetente fora da lista de autorizados');
  await s.configurar({});
  assert.equal((await s.mensagem({ grupoJid: 'outro@g.us', grupoNome: 'Outro' })).json.status, 'ignorado');
  assert.equal((await s.mensagem({ texto: 'bom dia pessoal' })).json.status, 'ignorado');
  await s.configurar({ grupos: [{ id: 'g1', nome: 'Grupo Tech', jid: '1203@g.us', tipos: ['foto_perfil'] }] });
  assert.equal((await s.mensagem()).json.status, 'ignorado', 'tipo que o grupo não atende');
  assert.equal(s.repo.e.pedidos.length, 0);
  s.fechar();
});

test('sem vínculo: guarda o pedido, reage com a dúvida e não abre chamado', async () => {
  const s = await subir();
  await s.configurar({});
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'sem_vinculo');
  assert.equal(r.reacao, '❓');
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('modo observação: registra o que faria, sem abrir chamado e sem reagir', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ modo: 'observacao' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'observado');
  assert.equal(r.reacao, null);
  assert.equal(s.abertos.length, 0);
  s.fechar();
});

test('fila do automático: o pedido espera com a reação de a fazer; o navegador abre o chamado com o token dele e o requerente do vínculo', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'fila_automatico' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'pendente');
  assert.equal(r.reacao, '⏳');
  assert.equal(s.abertos.length, 0, 'ninguém abriu ainda');
  const fila = (await s.comoOperador('GET', '/api/whatsapp/fila')).json;
  assert.equal(fila.length, 1);
  assert.equal(fila[0].solicitante, 'Maria Silva');
  const ab = await s.comoOperador('POST', `/api/whatsapp/fila/${fila[0].id}/abrir`);
  assert.equal(ab.status, 200);
  assert.equal(s.abertos.length, 1);
  assert.equal(s.abertos[0].token, TOKEN_OPERADOR, 'abriu com o token de quem está com o automático');
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.equal(s.abertos[0].categoriaId, 45);
  assert.match(s.abertos[0].descricao, /grupo Grupo Tech, solicitante Maria Silva/);
  // dois computadores: o segundo recebe 409
  assert.equal((await s.comoOperador('POST', `/api/whatsapp/fila/${fila[0].id}/abrir`)).status, 409);
  assert.equal((await s.comoOperador('GET', '/api/whatsapp/fila')).json.length, 0);
  // sem token do GLPI ninguém mexe na fila
  assert.equal((await s.chamar('GET', '/api/whatsapp/fila')).status, 401);
  s.fechar();
});

test('falha ao abrir o chamado: pedido vira erro, a mensagem não vaza o token', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({});
  await s.mensagem();
  s.definirFalha('GLPI recusou');
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  const r = await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`);
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.json).includes(TOKEN_OPERADOR));
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  s.fechar();
});

test('só abrir (token de serviço): abre na hora com a lupa; o poll vê a solução e conclui', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'aberto');
  assert.equal(r.reacao, '🔍');
  assert.equal(s.abertos[0].token, TOKEN_SERVICO);
  assert.equal(s.abertos[0].requerenteId, 12);
  assert.equal(await s.wa.verificarAbertos(), 0, 'ainda não foi solucionado');
  s.statusDosChamados.set(r.ticketId, 5);
  assert.equal(await s.wa.verificarAbertos(), 1);
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=0')).json;
  const ultimo = ev.eventos[ev.eventos.length - 1];
  assert.equal(ultimo.status, 'concluido');
  assert.equal(ultimo.reacao, '✅');
  assert.equal(ultimo.resposta, `Chamado ${r.ticketId} concluído.`);
  s.fechar();
});

test('só abrir sem token de serviço configurado: erro claro, sem abrir nada', async () => {
  const s = await subir({ servico: false });
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  const r = (await s.mensagem()).json;
  assert.equal(r.status, 'erro');
  assert.equal(r.reacao, '⚠️');
  assert.match(s.repo.e.pedidos[0].erro, /HUB_GLPI_TOKEN_SERVICO/);
  assert.equal((await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json.disponivel.so_abrir, false);
  s.fechar();
});

test('mensagem repetida (o robô reenviou): não duplica pedido nem chamado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir' });
  await s.mensagem();
  const dup = (await s.mensagem()).json;
  assert.equal(dup.repetida, true);
  assert.equal(s.abertos.length, 1);
  assert.equal(s.repo.e.pedidos.length, 1);
  s.fechar();
});

test('resultado do automático: conclui ou marca erro só do pedido aberto; chamado de fora do WhatsApp é ignorado', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({});
  await s.mensagem();
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  const ticketId = (await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`)).json.ticketId;
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId: 999999, ok: true })).json.atualizado, false);
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId: 'x', ok: true })).status, 400);
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: false, texto: 'não achou o usuário' })).json.atualizado, true);
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  // deu erro e depois o chamado foi finalizado numa nova execução: sai do erro para concluído (a reação no WhatsApp muda)
  const antes = s.repo.e.pedidos[0].evento;
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: true })).json.atualizado, true);
  assert.equal(s.repo.e.pedidos[0].status, 'concluido');
  assert.ok(s.repo.e.pedidos[0].evento > antes, 'evento novo: é por ele que o robô troca a reação');
  // concluído não volta: um aviso atrasado de erro não desfaz o sucesso
  assert.equal((await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: false, texto: 'atrasado' })).json.atualizado, false);
  assert.equal(s.repo.e.pedidos[0].status, 'concluido');
  s.fechar();
});

test('pedido em erro com chamado aberto: a conferência no GLPI conclui quando o chamado é solucionado à mão', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({});
  await s.mensagem();
  const id = (await s.comoOperador('GET', '/api/whatsapp/fila')).json[0].id;
  const ticketId = (await s.comoOperador('POST', `/api/whatsapp/fila/${id}/abrir`)).json.ticketId;
  await s.comoOperador('POST', '/api/whatsapp/resultado', { ticketId, ok: false, texto: 'falhou' });
  assert.equal(s.repo.e.pedidos[0].status, 'erro');
  const desde = s.repo.e.seq;
  s.statusDosChamados.set(ticketId, 5);
  assert.equal(await s.wa.verificarAbertos(), 1);
  const ev = (await s.comoBot('GET', `/api/whatsapp/bot/eventos?desde=${desde}`)).json.eventos;
  assert.deepEqual(ev.map((x) => x.status), ['concluido']);
  s.fechar();
});

test('eventos: "agora" devolve só o último; reação nula quando o grupo não reage; resposta só quando o grupo responde', async () => {
  const s = await subir();
  await s.vincular();
  await s.configurar({ operacao: 'so_abrir', grupos: [{ id: 'g1', nome: 'Grupo Tech', jid: '1203@g.us', categoriaId: 45, tipos: [], responder: false, reagir: false }] });
  const r = (await s.mensagem()).json;
  assert.equal(r.reacao, null);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=agora')).json.ultimo, 2, 'reservado e aberto');
  s.statusDosChamados.set(r.ticketId, 5);
  await s.wa.verificarAbertos();
  const ev = (await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=2')).json;
  assert.equal(ev.eventos.length, 1);
  assert.equal(ev.eventos[0].reacao, null);
  assert.equal(ev.eventos[0].resposta, null);
  assert.equal((await s.comoBot('GET', '/api/whatsapp/bot/eventos?desde=abc')).status, 400);
  s.fechar();
});

test('estado do robô fica só em memória e aparece no painel do admin (com os grupos visíveis)', async () => {
  const s = await subir();
  await s.comoBot('POST', '/api/whatsapp/bot/estado', { conectado: false, qr: 'data:image/png;base64,AAAA', grupos: [{ jid: '1@g.us', nome: 'Grupo A' }, { nome: 'sem jid' }] });
  const p = (await s.comoAdmin('GET', '/api/admin/whatsapp/painel')).json;
  assert.equal(p.estado.conectado, false);
  assert.equal(p.estado.qr, 'data:image/png;base64,AAAA');
  assert.deepEqual(p.estado.grupos, [{ jid: '1@g.us', nome: 'Grupo A' }]);
  assert.equal(p.estado.botConfigurado, true);
  s.fechar();
});
