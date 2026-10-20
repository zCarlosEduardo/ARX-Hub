// Registro das execuções manuais com repositório em memória e automação de mentira (sem rede, sem banco).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarRegistroExecucoes, criarLeitorSse } = require('../execucoesRegistro');

function repoMemoria() {
  const linhas = [];
  return {
    linhas,
    async inserir(d) { linhas.push({ id: linhas.length + 1, ...d, fimEm: d.fim ? 'agora' : null }); return linhas.length; },
    async finalizar(id, r) { Object.assign(linhas[id - 1], r, { fimEm: 'agora' }); },
    async marcarInterrompidas() { for (const l of linhas) if (l.situacao === 'rodando') l.situacao = 'desconhecido'; },
  };
}
const AUTO = { id: '23', name: 'Altera Senha', url: 'http://alterar-senha-sga:4016/' };
const QUEM = { id: 7, nome: 'Fulano' };
const json = (o) => Buffer.from(JSON.stringify(o));
const esperar = (cond) => new Promise((ok, falha) => {
  const ate = Date.now() + 2000;
  const t = setInterval(() => { if (cond()) { clearInterval(t); ok(); } else if (Date.now() > ate) { clearInterval(t); falha(new Error('tempo esgotado')); } }, 5);
});

test('job com /api/status: grava o início com quem e modo teste, e o fim pelo status', async () => {
  const repo = repoMemoria();
  let consultas = 0;
  const reg = criarRegistroExecucoes({ repo, intervaloMs: 5, buscar: async (url) => {
    assert.equal(url, 'http://alterar-senha-sga:4016/api/status/j1');
    consultas += 1;
    return consultas < 2 ? { status: 200, json: { running: true } } : { status: 200, json: { running: false, results: [{ status: 'alterada' }, { status: 'erro' }] } };
  } });
  await reg.aoIniciar({ automacao: AUTO, quem: QUEM, caminho: '/api/start', status: 200, cabecalhos: {}, corpoPedido: json({ modoTeste: true }), corpoResposta: json({ jobId: 'j1' }) });
  assert.equal(repo.linhas[0].situacao, 'rodando');
  assert.equal(repo.linhas[0].modoTeste, true);
  assert.equal(repo.linhas[0].quem, QUEM);
  await esperar(() => repo.linhas[0].situacao === 'concluido');
  assert.equal(repo.linhas[0].concluidos, 1);
  assert.equal(repo.linhas[0].erros, 1);
  assert.equal(reg.emAndamento(), 0);
});

test('job sem /api/status: o fim vem do SSE que passa pelo proxy (resultados em eventos)', async () => {
  const repo = repoMemoria();
  const reg = criarRegistroExecucoes({ repo, intervaloMs: 5, buscar: async () => ({ status: 404, json: null }) });
  await reg.aoIniciar({ automacao: AUTO, quem: null, caminho: '/api/start', status: 200, cabecalhos: {}, corpoPedido: null, corpoResposta: json({ started: true, jobId: 'j2' }) });
  const leitor = reg.abrirSse({ automacao: AUTO, caminho: '/api/logs/j2' });
  assert.ok(leitor);
  leitor(Buffer.from('data: {"type":"log","msg":"x"}\n\ndata: {"type":"resultado","item":{"status":"criado"}}\n\nda'));
  leitor(Buffer.from('ta: {"type":"done"}\n\n'));
  await esperar(() => repo.linhas[0].situacao === 'concluido');
  assert.equal(repo.linhas[0].concluidos, 1);
  assert.equal(reg.abrirSse({ automacao: AUTO, caminho: '/api/logs/outro' }), null);
});

test('início que não é de execução, com erro ou na hora', async () => {
  const repo = repoMemoria();
  const reg = criarRegistroExecucoes({ repo, buscar: async () => ({ status: 404 }) });
  await reg.aoIniciar({ automacao: AUTO, quem: null, caminho: '/api/opcoes', status: 200, cabecalhos: {}, corpoPedido: null, corpoResposta: null });
  await reg.aoIniciar({ automacao: AUTO, quem: null, caminho: '/api/start', status: 429, cabecalhos: {}, corpoPedido: null, corpoResposta: json({ error: 'ocupado' }) });
  assert.equal(repo.linhas.length, 0);
  await reg.aoIniciar({ automacao: AUTO, quem: QUEM, caminho: '/api/gerar', status: 200, cabecalhos: { 'x-arquivos': '3' }, corpoPedido: null, corpoResposta: Buffer.from('PK...zip') });
  assert.equal(repo.linhas[0].situacao, 'concluido');
  assert.equal(repo.linhas[0].concluidos, 3);
});

test('cadastro em Python: acompanha o executando da config até terminar', async () => {
  const repo = repoMemoria();
  let n = 0;
  const reg = criarRegistroExecucoes({ repo, intervaloMs: 5, buscar: async (url) => {
    assert.equal(url, 'http://cadastro-voluntario:4003/api/config');
    n += 1;
    return { status: 200, json: { executando: n < 2 } };
  } });
  await reg.aoIniciar({ automacao: { id: '11', name: 'Cadastro', url: 'http://cadastro-voluntario:4003/' }, quem: QUEM, caminho: '/api/jobs', status: 201, cabecalhos: {}, corpoPedido: null, corpoResposta: json({ status: 'iniciado', consultores: ['a', 'b'] }) });
  await esperar(() => repo.linhas[0].situacao === 'concluido');
  assert.equal(repo.linhas[0].concluidos, 2);
});

test('sem retorno no prazo vira desconhecido; subida do Hub marca as que ficaram rodando', async () => {
  const repo = repoMemoria();
  const reg = criarRegistroExecucoes({ repo, intervaloMs: 5, limiteMs: 20, buscar: async () => ({ status: 200, json: { running: true } }) });
  await reg.aoIniciar({ automacao: AUTO, quem: null, caminho: '/api/start', status: 200, cabecalhos: {}, corpoPedido: null, corpoResposta: json({ jobId: 'j3' }) });
  await esperar(() => repo.linhas[0].situacao === 'desconhecido');
  repo.linhas.push({ id: 2, situacao: 'rodando' });
  await reg.aoSubir();
  assert.equal(repo.linhas[1].situacao, 'desconhecido');
});

test('leitor de SSE ignora linhas de texto e junta pedaços', () => {
  const eventos = [];
  const ler = criarLeitorSse((ev) => eventos.push(ev));
  ler(Buffer.from('data: texto solto\n\ndata: {"a":'));
  ler(Buffer.from('1}\n\n'));
  assert.deepEqual(eventos, [{ a: 1 }]);
});
