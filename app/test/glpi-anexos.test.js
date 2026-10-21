// Anexos do "Abrir chamado": validação dos arquivos e envio ao GLPI (simulado: fetch falso, nada sai da máquina).
process.env.GLPI_BASE_URL = 'http://glpi.teste/apirest.php';
process.env.GLPI_APP_TOKEN = 'app-token-falso';
const test = require('node:test');
const assert = require('node:assert/strict');
const glpi = require('../glpi');

const b64 = (s) => Buffer.from(s).toString('base64');

test('lerAnexos aceita foto e PDF e devolve o conteúdo', () => {
  const l = glpi.lerAnexos([{ nome: 'print.png', tipo: 'image/png', base64: b64('png') }, { nome: 'a/b\\c.pdf', tipo: 'application/pdf', base64: b64('pdf') }]);
  assert.equal(l.length, 2);
  assert.equal(l[0].conteudo.toString(), 'png');
  assert.equal(l[1].nome, 'a_b_c.pdf');
  assert.deepEqual(glpi.lerAnexos(undefined), []);
});

test('lerAnexos recusa tipo, tamanho, quantidade e base64 inválidos', () => {
  assert.throws(() => glpi.lerAnexos([{ nome: 'x.exe', tipo: 'application/x-msdownload', base64: b64('x') }]), /não é foto, PDF nem documento/);
  assert.throws(() => glpi.lerAnexos([{ nome: 'x.png', tipo: 'image/png', base64: '@@' }]), /corrompido/);
  assert.throws(() => glpi.lerAnexos([{ nome: 'x.png', tipo: 'image/png', base64: '' }]), /vazio/);
  assert.throws(() => glpi.lerAnexos(Array.from({ length: 6 }, (_, i) => ({ nome: i + '.png', tipo: 'image/png', base64: b64('x') }))), /até 5 arquivos/);
  const grande = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => glpi.lerAnexos([{ nome: 'g.png', tipo: 'image/png', base64: grande }]), /passa de 10 MB/);
});

test('createTicketComAnexos abre o chamado, sobe os arquivos e informa o que falhou', async (t) => {
  const chamadas = [];
  t.mock.method(global, 'fetch', async (url, op = {}) => {
    const caminho = String(url).replace(process.env.GLPI_BASE_URL, '');
    chamadas.push(`${op.method || 'GET'} ${caminho}`);
    const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
    if (caminho === '/initSession') return json({ session_token: 'sess' });
    if (caminho === '/killSession') return json({});
    if (caminho === '/Ticket') return json({ id: 77 });
    if (caminho === '/Document') {
      const manifesto = JSON.parse(op.body.get('uploadManifest'));
      if (manifesto.input.name === 'ruim.pdf') return json(['ERRO'], 400);
      return json({ id: 5 });
    }
    if (caminho === '/Ticket/77/Document_Item') return json([{ documents_id: 5 }]);
    throw new Error('rota inesperada ' + caminho);
  });
  const anexos = glpi.lerAnexos([{ nome: 'bom.png', tipo: 'image/png', base64: b64('ok') }, { nome: 'ruim.pdf', tipo: 'application/pdf', base64: b64('x') }]);
  const r = await glpi.createTicketComAnexos('token-usuario', { titulo: 'Teste' }, anexos);
  assert.deepEqual(r, { id: 77, anexados: 1, falhas: ['ruim.pdf'] });
  assert.equal(chamadas.filter((c) => c === 'POST /Document').length, 2);
  assert.ok(chamadas.includes('GET /killSession'));
});
