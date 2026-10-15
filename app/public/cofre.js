// Cofre dos acessos: guarda logins, senhas e o token do GLPI CIFRADOS no navegador, nunca em texto puro.
//
// - A chave nasce da SENHA MESTRA (PBKDF2-SHA256, 600 mil voltas, sal aleatório) e a cifra é AES-GCM de 256 bits. A senha
//   mestra e a chave NUNCA são gravadas: a chave fica só na memória (CryptoKey não extraível) e some ao travar.
// - O que fica no localStorage é só o texto cifrado (`arxhub_cofre_v1`): sem a senha mestra não dá para ler.
// - Trava sozinho depois de um tempo sem uso (padrão 15 minutos) e ao fechar a aba.
// - Hash não serve aqui (é de mão única): as automações precisam da senha original, então é criptografia.
// Limite honesto: protege o que está gravado em disco (cópia do perfil do navegador, acesso ao computador, curiosos). Com o
// cofre DESTRAVADO, um script malicioso rodando nesta página ou um programa espião no computador ainda conseguiria ler.
(function (raiz) {
  const CHAVE = 'arxhub_cofre_v1';
  const ITERACOES_PADRAO = 600000;
  const OCIO_PADRAO_MS = 15 * 60 * 1000;
  const MIN_SENHA = 10;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const paraB64 = (bytes) => {
    let t = '';
    const b = new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(t);
  };
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /**
   * @param {{storage: Storage, crypto?: Crypto, iteracoes?: number, ocioMs?: number, setTimer?: Function, clearTimer?: Function}} deps
   *   `crypto`, `iteracoes` e os timers existem para os testes.
   */
  function criarCofre(deps) {
    const storage = deps.storage;
    const cr = deps.crypto || raiz.crypto;
    const iteracoes = deps.iteracoes || ITERACOES_PADRAO;
    const ocioMs = deps.ocioMs === undefined ? OCIO_PADRAO_MS : deps.ocioMs;
    const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));

    let chave = null; // CryptoKey (só na memória)
    let sal = null; // sal do cofre aberto (para saber se outra aba trocou a senha)
    let temporizador = null;
    const ouvintes = new Set();

    const avisar = (estado) => ouvintes.forEach((fn) => {
      try {
        fn(estado);
      } catch {
        // um ouvinte com erro não atrapalha os outros
      }
    });

    function lerBlob() {
      try {
        const bruto = storage.getItem(CHAVE);
        return bruto ? JSON.parse(bruto) : null;
      } catch {
        return null;
      }
    }

    async function derivar(senha, salBytes, voltas) {
      const base = await cr.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
      return cr.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salBytes, iterations: voltas }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    async function cifrar(dados, k, salBytes, voltas) {
      const iv = cr.getRandomValues(new Uint8Array(12));
      const ct = await cr.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(dados)));
      return { v: 1, kdf: 'PBKDF2-SHA256', it: voltas, salt: paraB64(salBytes), iv: paraB64(iv), ct: paraB64(ct) };
    }

    async function decifrar(blob, k) {
      const claro = await cr.subtle.decrypt({ name: 'AES-GCM', iv: deB64(blob.iv) }, k, deB64(blob.ct));
      return JSON.parse(dec.decode(claro));
    }

    function armarOcio() {
      if (temporizador) clearTimer(temporizador);
      temporizador = ocioMs ? setTimer(() => travar('ocio'), ocioMs) : null;
    }

    function travar(motivo) {
      const estavaAberto = !!chave;
      chave = null;
      sal = null;
      if (temporizador) clearTimer(temporizador);
      temporizador = null;
      if (estavaAberto) avisar({ aberto: false, motivo: motivo || 'manual' });
    }

    const existe = () => !!lerBlob();
    const aberto = () => !!chave;

    function gravarBlob(blob) {
      storage.setItem(CHAVE, JSON.stringify(blob));
    }

    return {
      CHAVE,
      MIN_SENHA,
      existe,
      aberto,
      /** Cria o cofre com a senha mestra e já deixa aberto. Recusa senha curta. Não sobrescreve cofre existente. */
      async criar(senhaMestra, dados) {
        if (existe()) throw new Error('Já existe um cofre neste navegador.');
        if (typeof senhaMestra !== 'string' || senhaMestra.length < MIN_SENHA) throw new Error(`A senha mestra precisa de ao menos ${MIN_SENHA} caracteres.`);
        const salBytes = cr.getRandomValues(new Uint8Array(16));
        const k = await derivar(senhaMestra, salBytes, iteracoes);
        gravarBlob(await cifrar(dados, k, salBytes, iteracoes));
        chave = k;
        sal = paraB64(salBytes);
        armarOcio();
        avisar({ aberto: true, motivo: 'criado' });
        return dados;
      },
      /** Destrava com a senha mestra e devolve os dados. Senha errada lança erro (o cofre continua travado). */
      async abrir(senhaMestra) {
        const blob = lerBlob();
        if (!blob) throw new Error('Não existe cofre neste navegador.');
        const k = await derivar(String(senhaMestra || ''), deB64(blob.salt), blob.it || ITERACOES_PADRAO);
        let dados;
        try {
          dados = await decifrar(blob, k);
        } catch {
          throw new Error('Senha mestra incorreta.');
        }
        chave = k;
        sal = blob.salt;
        armarOcio();
        avisar({ aberto: true, motivo: 'aberto' });
        return dados;
      },
      /** Grava os dados (cifrados) com a chave do cofre aberto. */
      async gravar(dados) {
        if (!chave) throw new Error('O cofre está travado.');
        const blob = lerBlob();
        if (!blob || blob.salt !== sal) {
          travar('alterado');
          throw new Error('O cofre foi alterado em outra aba. Destrave de novo.');
        }
        gravarBlob(await cifrar(dados, chave, deB64(blob.salt), blob.it || ITERACOES_PADRAO));
        armarOcio();
      },
      /** Relê o que outra aba gravou (mesma senha mestra). Se a senha foi trocada lá, trava. */
      async reler() {
        const blob = lerBlob();
        if (!chave) return null;
        if (!blob || blob.salt !== sal) {
          travar('alterado');
          return null;
        }
        try {
          return await decifrar(blob, chave);
        } catch {
          travar('alterado');
          return null;
        }
      },
      /** Troca a senha mestra: confere a atual, gera sal novo e regrava. */
      async trocarSenha(atual, nova) {
        if (typeof nova !== 'string' || nova.length < MIN_SENHA) throw new Error(`A nova senha mestra precisa de ao menos ${MIN_SENHA} caracteres.`);
        const dados = await this.abrir(atual);
        const salNovo = cr.getRandomValues(new Uint8Array(16));
        const k = await derivar(nova, salNovo, iteracoes);
        gravarBlob(await cifrar(dados, k, salNovo, iteracoes));
        chave = k;
        sal = paraB64(salNovo);
        armarOcio();
      },
      /** Marca atividade da pessoa: adia a trava por ociosidade. */
      atividade() {
        if (chave) armarOcio();
      },
      travar,
      /** Apaga o cofre (esqueci a senha mestra): os logins somem e precisam ser digitados de novo. */
      apagar() {
        try {
          storage.removeItem(CHAVE);
        } catch {
          // sem storage: nada a apagar
        }
        travar('apagado');
        avisar({ aberto: false, motivo: 'apagado' });
      },
      aoMudar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
      },
    };
  }

  const api = { criarCofre, CHAVE, MIN_SENHA, ITERACOES_PADRAO, OCIO_PADRAO_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    let armazenamento = null;
    try {
      armazenamento = raiz.localStorage;
    } catch {
      armazenamento = null; // storage bloqueado: sem cofre persistente (os acessos valem só nesta sessão)
    }
    raiz.ArxCofre = armazenamento ? criarCofre({ storage: armazenamento }) : null;
    raiz.ArxCofreFabrica = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
