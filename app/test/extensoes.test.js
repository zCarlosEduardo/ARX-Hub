// Extensões oferecidas pelo Hub (app/extensoes): catálogo lido dos manifest.json e o .zip montado na hora do download.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { listarExtensoes, montarZip } = require('../extensoes');

// leitor mínimo de .zip (só para o teste): diretório central -> { nome: conteúdo }
function lerZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const arquivos = {};
  for (let i = 0; i < total; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const metodo = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const tamComp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28); const xl = buf.readUInt16LE(p + 30); const cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nl);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamComp);
    const claro = metodo === 8 ? zlib.inflateRawSync(dados) : dados;
    assert.equal(zlib.crc32(claro) >>> 0, crc, 'crc de ' + nome);
    arquivos[nome] = claro.toString('utf8');
    p += 46 + nl + xl + cl;
  }
  return arquivos;
}

function pastaFicticia() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
  fs.mkdirSync(path.join(raiz, 'minha-ext', 'test'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'sem-manifesto'));
  fs.writeFileSync(path.join(raiz, 'minha-ext', 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Minha ext', version: '2.1.0', description: 'Faz algo.' }));
  fs.writeFileSync(path.join(raiz, 'minha-ext', 'a.js'), 'console.log("olá")\n'.repeat(50));
  fs.writeFileSync(path.join(raiz, 'minha-ext', 'test', 'x.test.js'), 'teste');
  return raiz;
}

test('catálogo: uma extensão por pasta com manifest.json; o resto é ignorado', () => {
  const raiz = pastaFicticia();
  assert.deepEqual(listarExtensoes(raiz), [{ id: 'minha-ext', nome: 'Minha ext', versao: '2.1.0', descricao: 'Faz algo.' }]);
  assert.deepEqual(listarExtensoes(path.join(raiz, 'nao-existe')), []);
});

test('zip: arquivos da extensão (sem a pasta de testes), dentro de uma pasta com o nome dela', () => {
  const raiz = pastaFicticia();
  const z = lerZip(montarZip(path.join(raiz, 'minha-ext'), 'minha-ext'));
  assert.deepEqual(Object.keys(z).sort(), ['minha-ext/a.js', 'minha-ext/manifest.json']);
  assert.match(z['minha-ext/a.js'], /olá/);
  assert.equal(JSON.parse(z['minha-ext/manifest.json']).version, '2.1.0');
});

test('a extensão ARX SGA do Hub está no catálogo e o zip tem o manifesto', () => {
  const pasta = path.join(__dirname, '..', 'extensoes');
  const sga = listarExtensoes(pasta).find((e) => e.id === 'arx-sga');
  assert.ok(sga);
  assert.equal(sga.nome, 'ARX SGA');
  const z = lerZip(montarZip(path.join(pasta, 'arx-sga'), 'arx-sga'));
  assert.ok(z['arx-sga/manifest.json'] && z['arx-sga/background.js'] && z['arx-sga/conteudo.js']);
});
