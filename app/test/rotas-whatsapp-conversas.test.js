// Conversas do WhatsApp no Hub (dados fictícios): só admin, listar, mensagens com vínculo, mídia, responder e abrir chamado
// com as mensagens marcadas, anexo e a resposta automática. Também o contexto que vai para a IA.
const test = require('node:test');
const assert = require('node:assert/strict');
const { subir } = require('./_base-rotas-whatsapp');

const G = '1203@g.us';
function roboFalso() {
  const enviados = [];
  const msgs = [
    { id: 'MSG001', remetente: '553188887777@s.whatsapp.net', nome: 'Maria', quando: Date.UTC(2026, 9, 23, 13, 0), tipo: 'texto', texto: 'Preciso desbloquear meu SGA', deMim: false, midia: null },
    { id: 'MSG002', remetente: '553188887777@s.whatsapp.net', nome: 'Maria', quando: Date.UTC(2026, 9, 23, 13, 1), tipo: 'imagem', texto: 'print', deMim: false, midia: { mime: 'image/png', nome: '', tamanho: 3, disponivel: true } },
    { id: 'MSG003', remetente: '553100000000@s.whatsapp.net', nome: 'Outro', quando: Date.UTC(2026, 9, 23, 13, 2), tipo: 'texto', texto: 'bom dia', deMim: false, midia: null },
  ];
  return {
    enviados,
    async conversas() { return [{ jid: G, nome: 'Grupo Tech', privado: false, total: 3, ultima: { quando: 1, nome: 'Outro', tipo: 'texto', texto: 'bom dia' } }]; },
    async mensagens(jid) { return jid === G ? msgs.map((m) => ({ ...m })) : []; },
    async midia(id) { return id === 'MSG002' ? { mime: 'image/png', conteudo: Buffer.from('png') } : null; },
    async enviar(jid, texto) { enviados.push({ jid, texto }); return { id: 'R1' }; },
  };
}

test('Conversas: só administrador; lista, mensagens (telefone mascarado e vínculo) e mídia', async () => {
  const t = await subir({ robo: roboFalso() });
  try {
    await t.configurar({ conversas: { ativo: true, privado: false, jids: [] } });
    await t.vincular();
    assert.equal((await t.comoOperador('GET', '/api/whatsapp/conversas')).status, 403);
    const l = await t.comoAdmin('GET', '/api/whatsapp/conversas');
    assert.equal(l.json.ativo, true);
    assert.equal(l.json.conversas[0].jid, G);
    const m = await t.comoAdmin('GET', '/api/whatsapp/conversas/mensagens?jid=' + encodeURIComponent(G));
    assert.equal(m.json[0].remetente, '***7777');
    assert.deepEqual(m.json[0].vinculo, { glpiId: 12, nome: 'Maria Silva' });
    assert.equal(m.json[2].vinculo, null);
    assert.equal((await t.comoAdmin('GET', '/api/whatsapp/conversas/mensagens?jid=nada')).status, 400);
    assert.equal((await t.comoAdmin('GET', '/api/whatsapp/midia/MSG002')).status, 200);
    assert.equal((await t.comoAdmin('GET', '/api/whatsapp/midia/MSG001')).status, 404);
  } finally {
    t.fechar();
  }
});

test('Conversas: responder e abrir chamado com as mensagens marcadas, anexo e resposta do tipo', async () => {
  const robo = roboFalso();
  const t = await subir({ robo });
  try {
    await t.configurar({ conversas: { ativo: true, privado: false, jids: [] }, respostas: { abertura: 'Chamado {chamado} aberto.', porTipo: { desbloquear_usuario_sga: 'Pedido de desbloqueio recebido: chamado {chamado}.' } } });
    await t.vincular();
    assert.equal((await t.comoAdmin('POST', '/api/whatsapp/conversas/responder', { jid: G, texto: '' })).status, 400);
    assert.deepEqual((await t.comoAdmin('POST', '/api/whatsapp/conversas/responder', { jid: G, texto: 'Já vou ver.' })).json, { id: 'R1' });
    const corpo = { jid: G, ids: ['MSG001', 'MSG002'], titulo: 'Desbloquear SGA', categoriaId: 45, requerenteId: 12, tipo: 'desbloquear_usuario_sga', conversa: 'Grupo Tech', resposta: 'Pedido de desbloqueio recebido: chamado {chamado}.' };
    assert.equal((await t.comoOperador('POST', '/api/whatsapp/conversas/chamado', corpo)).status, 403);
    assert.equal((await t.comoAdmin('POST', '/api/whatsapp/conversas/chamado', { ...corpo, categoriaId: '' })).status, 400);
    assert.equal((await t.comoAdmin('POST', '/api/whatsapp/conversas/chamado', { ...corpo, ids: ['nao-existe'] })).status, 404);
    const r = await t.comoAdmin('POST', '/api/whatsapp/conversas/chamado', corpo);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.respondido, true);
    const ch = t.abertos.at(-1);
    assert.equal(ch.id, r.json.ticketId);
    assert.deepEqual([ch.titulo, ch.categoriaId, ch.requerenteId], ['Desbloquear SGA', 45, 12]);
    assert.match(ch.descricao, /Preciso desbloquear meu SGA/);
    assert.match(ch.descricao, /imagem em anexo/);
    assert.doesNotMatch(ch.descricao, /bom dia/);
    assert.equal(ch.anexos.length, 1);
    assert.equal(ch.anexos[0].tipo, 'image/png');
    assert.equal(robo.enviados.at(-1).texto, `Pedido de desbloqueio recebido: chamado ${r.json.ticketId}.`);
    const semResposta = await t.comoAdmin('POST', '/api/whatsapp/conversas/chamado', { ...corpo, resposta: '' });
    assert.equal(semResposta.json.respondido, false);
  } finally {
    t.fechar();
  }
});

test('Conversas sem o robô configurado respondem 503; a configuração rejeita grupo inválido e tipo inexistente', async () => {
  const t = await subir();
  try {
    assert.equal((await t.comoAdmin('GET', '/api/whatsapp/conversas')).status, 503);
    assert.equal((await t.comoAdmin('PUT', '/api/admin/config/whatsapp', { conversas: { ativo: true, jids: ['nao-e-grupo'] } })).status, 400);
    assert.equal((await t.comoAdmin('PUT', '/api/admin/config/whatsapp', { respostas: { abertura: 'ok', porTipo: { inventado: 'x' } } })).status, 400);
  } finally {
    t.fechar();
  }
});

test('o contexto das mensagens anteriores chega à IA local', async () => {
  const recebidos = [];
  const t = await subir({ ia: { async whatsapp(c) { recebidos.push(c); return null; } } });
  try {
    await t.configurar({});
    assert.equal((await t.comoAdmin('PUT', '/api/admin/config/ia', { ligada: true })).status, 200);
    await t.mensagem({ contexto: ['meu cpf é 000.000.000-00', 123] });
    assert.deepEqual(recebidos[0].contexto, ['meu cpf é 000.000.000-00']);
  } finally {
    t.fechar();
  }
});
