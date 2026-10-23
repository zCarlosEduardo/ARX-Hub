// Regras puras da extensão ARX SGA (sem chrome.* nem DOM): reconhecer a empresa pela URL, achar o login dela, reconhecer
// a página de erro de cookies e o cofre cifrado (AES-GCM com chave derivada da senha mestra por PBKDF2). Roda no service
// worker, na janela da extensão e no Node (testes em test/).
(function (raiz) {
  const ITERACOES = 310000; // PBKDF2-SHA256: o mínimo recomendado pela OWASP para 2023 em diante
  const subtle = () => raiz.crypto.subtle;
  const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const deB64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

  /** Base da empresa no SGA a partir de qualquer página dela: https://host/sga/sgav4_x/v5/... -> https://host/sga/sgav4_x */
  function baseDaUrl(url) {
    const m = /^(https:\/\/[^/]+\/sga\/[^/?#]+)/i.exec(String(url || ''));
    return m ? m[1].toLowerCase() : null;
  }

  /** Chave da empresa (lista do kit, empresasSga.js) para a base, ou null se não for uma empresa conhecida. */
  function empresaDaBase(base, empresas) {
    const alvo = String(base || '').toLowerCase();
    const e = (empresas || []).find((x) => String(x.base).toLowerCase() === alvo);
    return e ? e.chave : null;
  }

  /** O login que vale para a empresa (o primeiro que a tiver marcada). */
  function loginDaEmpresa(logins, chave) {
    return (logins || []).find((l) => l.usuario && l.senha && (l.empresas || []).includes(chave)) || null;
  }

  /** A página é o erro do SGA de cookies acumulados ("Request Header Or Cookie Too Large")? */
  function ehErroDeCookies({ titulo, texto } = {}) {
    const tudo = `${titulo || ''} ${texto || ''}`;
    return /cookie too large|header fields? too large|request header.{0,20}too large/i.test(tudo)
      || (/^\s*400 bad request\s*$/i.test(titulo || '') && String(texto || '').length < 1500);
  }

  async function derivarChave(senha, sal) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  const exportarChave = async (chave) => b64(await subtle().exportKey('raw', chave));
  const importarChave = (texto) => subtle().importKey('raw', deB64(texto), 'AES-GCM', false, ['encrypt', 'decrypt']);

  /** Cifra os logins com a chave; devolve o pacote guardável (sem nada em texto puro). */
  async function cifrar(chave, sal, logins) {
    const iv = raiz.crypto.getRandomValues(new Uint8Array(12));
    const dados = await subtle().encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(JSON.stringify(logins)));
    return { versao: 1, sal: b64(sal), iv: b64(iv), dados: b64(dados) };
  }
  /** Decifra o pacote; senha mestra errada (ou pacote alterado) lança erro. */
  async function decifrar(chave, pacote) {
    try {
      const claro = await subtle().decrypt({ name: 'AES-GCM', iv: deB64(pacote.iv) }, chave, deB64(pacote.dados));
      return JSON.parse(new TextDecoder().decode(claro));
    } catch (e) {
      throw new Error('Senha mestra incorreta.');
    }
  }
  /** Cria o cofre: sal novo, chave derivada da senha e a lista vazia. */
  async function criarCofre(senha) {
    if (String(senha || '').length < 8) throw new Error('A senha mestra precisa de pelo menos 8 caracteres.');
    const sal = raiz.crypto.getRandomValues(new Uint8Array(16));
    const chave = await derivarChave(senha, sal);
    return { chave, pacote: await cifrar(chave, sal, []) };
  }
  /** Abre o cofre com a senha: devolve a chave (para manter destravado) e os logins. */
  async function abrirCofre(senha, pacote) {
    const chave = await derivarChave(senha, deB64(pacote.sal));
    return { chave, logins: await decifrar(chave, pacote) };
  }

  const api = { baseDaUrl, empresaDaBase, loginDaEmpresa, ehErroDeCookies, criarCofre, abrirCofre, cifrar, decifrar, exportarChave, importarChave, deB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ArxRegras = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
