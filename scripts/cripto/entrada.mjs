// Fonte do motor de reserva do cofre (app/public/vendor/arx-cripto.min.js). Como regerar (versões fixadas no CLAUDE.md):
//   mkdir /tmp/cripto && cd /tmp/cripto && npm init -y && npm i @noble/hashes@2.4.0 @noble/ciphers@2.4.0 esbuild
//   cp <repo>/scripts/cripto/entrada.mjs . && npx esbuild entrada.mjs --bundle --minify --format=iife --target=es2019 \
//     --legal-comments=none --banner:js="<comentário de cabeçalho do arquivo atual>" --outfile=arx-cripto.min.js
// Mesmos algoritmos e mesmo formato do WebCrypto (PBKDF2-SHA256 e AES-256-GCM, cifrado + etiqueta de 16 bytes): um cofre
// criado por um motor abre no outro (testado em app/test/cofre-reserva.test.js).
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';

globalThis.ArxCriptoJs = {
  derivar: (senhaBytes, salBytes, voltas) => pbkdf2Async(sha256, senhaBytes, salBytes, { c: voltas, dkLen: 32, asyncTick: 10 }),
  cifrar: (chave, iv, claro) => gcm(chave, iv).encrypt(claro),
  decifrar: (chave, iv, cifrado) => gcm(chave, iv).decrypt(cifrado),
  versoes: { noble_hashes: '2.4.0', noble_ciphers: '2.4.0' },
};
