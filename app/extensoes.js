// Extensões de navegador que o Hub oferece para baixar (pasta app/extensoes, uma subpasta por extensão com o
// manifest.json do Chrome). O .zip é montado na hora com o zlib do Node (sem biblioteca nova); a pasta test/ fica de fora.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DATA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1; // 01/01/2026: data fixa (o .zip sai igual a cada download)

/** [{ id, nome, versao, descricao }] das subpastas com manifest.json válido. */
function listarExtensoes(pasta) {
  let nomes = [];
  try { nomes = fs.readdirSync(pasta, { withFileTypes: true }).filter((d) => d.isDirectory() && ID.test(d.name)).map((d) => d.name).sort(); } catch { return []; } // sem a pasta: nenhuma extensão
  return nomes.flatMap((id) => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(pasta, id, 'manifest.json'), 'utf8'));
      return [{ id, nome: String(m.name || id), versao: String(m.version || ''), descricao: String(m.description || '') }];
    } catch {
      return []; // pasta sem manifest.json (ou inválido) não é extensão
    }
  });
}

function arquivosDe(pasta, rel = '') {
  return fs.readdirSync(path.join(pasta, rel), { withFileTypes: true }).flatMap((d) => {
    const r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) return d.name === 'test' || d.name === 'node_modules' ? [] : arquivosDe(pasta, r);
    return [r];
  }).sort();
}

/** .zip (deflate) com os arquivos da pasta dentro de <raiz>/, pronto para "Carregar sem compactação" depois de extrair. */
function montarZip(pasta, raiz) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const rel of arquivosDe(pasta)) {
    const dados = fs.readFileSync(path.join(pasta, rel));
    const comp = zlib.deflateRawSync(dados);
    const nome = Buffer.from(raiz + '/' + rel, 'utf8');
    const crc = zlib.crc32(dados) >>> 0;
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6); cab.writeUInt16LE(8, 8); cab.writeUInt16LE(DATA_DOS, 12);
    cab.writeUInt32LE(crc, 14); cab.writeUInt32LE(comp.length, 18); cab.writeUInt32LE(dados.length, 22); cab.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(DATA_DOS, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    locais.push(cab, nome, comp);
    centrais.push(central, nome);
    offset += 30 + nome.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(centrais.length / 2, 8); fim.writeUInt16LE(centrais.length / 2, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, dir, fim]);
}

module.exports = { listarExtensoes, montarZip };
