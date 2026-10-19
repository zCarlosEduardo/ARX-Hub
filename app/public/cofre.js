// Cofre dos acessos: guarda logins, senhas e o token do GLPI CIFRADOS no navegador, nunca em texto puro.
//
// - A chave nasce da SENHA MESTRA (PBKDF2-SHA256, 600 mil voltas, sal aleatório) e a cifra é AES-GCM de 256 bits. A senha
//   mestra NUNCA é gravada.
// - O que fica no localStorage é só o texto cifrado (`arxhub_cofre_v1`): sem a senha mestra não dá para ler.
// - Hash não serve aqui (é de mão única): as automações precisam da senha original, então é criptografia.
// - Dois motores com o MESMO formato (um cofre abre nos dois): o WebCrypto do navegador e, quando ele não existe, o motor
//   de reserva (vendor/arx-cripto.min.js, @noble/hashes e @noble/ciphers, MIT). O navegador só libera o WebCrypto em
//   contexto seguro (HTTPS ou localhost); o Hub aberto por http://IP-da-rede cai no motor de reserva, mais lento.
//
// SESSÃO (como um acesso a sistema): para não pedir a senha mestra a cada F5, depois de destravar o cofre pode guardar a
// CHAVE DA SESSÃO (`arxhub_cofre_sessao_v1`) com prazo. A política vem do painel de administração:
//   'dia'   : fica destravado até a meia-noite (sobrevive a F5, novas abas e a fechar o navegador);
//   'horas' : destravado por N horas;
//   'aba'   : só nesta aba (sessionStorage; sobrevive ao F5 e some ao fechar a aba) e trava após 15 min sem uso;
//   'pedir' : pede a senha mestra a cada abertura (nada da sessão é guardado).
// Limpar os dados do navegador, "Travar agora" ou o fim do prazo apagam a chave da sessão e travam o cofre.
// Limite honesto: com a sessão guardada, quem tiver acesso ao perfil do navegador DENTRO do prazo consegue abrir o cofre
// (a chave está ao lado do texto cifrado); o cofre protege de verdade o que fica gravado quando a sessão não existe mais.
// Com o cofre destravado, um script malicioso rodando nesta página ou um programa espião no computador ainda conseguiria ler.
(function (raiz) {
  const CHAVE = 'arxhub_cofre_v1';
  const CHAVE_SESSAO = 'arxhub_cofre_sessao_v1';
  const ITERACOES_PADRAO = 600000;
  const OCIO_PADRAO_MS = 15 * 60 * 1000;
  const MIN_SENHA = 10;
  const MAX_TIMER_MS = 2147483647; // limite do setTimeout
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const paraB64 = (bytes) => {
    let t = '';
    const b = new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(t);
  };
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /** Meia-noite local seguinte a `ms`. */
  function proximaMeiaNoite(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
  }

  /**
   * @param {{storage: Storage, sessionStorage?: Storage|null, crypto?: Crypto|null, reserva?: object|null, iteracoes?: number,
   *          ocioMs?: number, agora?: () => number, setTimer?: Function, clearTimer?: Function}} deps
   *   `crypto`, `reserva`, `iteracoes`, `agora` e os timers existem para os testes.
   */
  function criarCofre(deps) {
    const storage = deps.storage;
    const storageAba = deps.sessionStorage === undefined ? null : deps.sessionStorage;
    const cr = deps.crypto === undefined ? raiz.crypto : deps.crypto;
    const reserva = deps.reserva === undefined ? raiz.ArxCriptoJs : deps.reserva;
    // motor: 'webcrypto' (contexto seguro), 'reserva' (HTTP fora de localhost) ou null (sem como cifrar)
    const motor = cr && cr.subtle ? 'webcrypto' : reserva && cr && cr.getRandomValues ? 'reserva' : null;
    const iteracoes = deps.iteracoes || ITERACOES_PADRAO;
    const ocioMs = deps.ocioMs === undefined ? OCIO_PADRAO_MS : deps.ocioMs;
    const agora = deps.agora || Date.now;
    const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));

    let politica = { sessao: 'pedir', horas: 8 };
    let chave = null; // CryptoKey (webcrypto) ou bytes (reserva); só na memória
    let bruto = null; // bytes da chave: só guardados enquanto a política pede sessão
    let sal = null; // sal do cofre aberto (para saber se outra aba trocou a senha)
    let temporizador = null;
    let expiracao = null;
    const ouvintes = new Set();

    const avisar = (estado) => ouvintes.forEach((fn) => {
      try {
        fn(estado);
      } catch {
        // um ouvinte com erro não atrapalha os outros
      }
    });

    function exigirMotor() {
      if (!motor) throw new Error('Este navegador não permite criptografar nesta página. Abra o Hub por HTTPS ou por http://localhost.');
    }

    function lerBlob() {
      try {
        const b = storage.getItem(CHAVE);
        return b ? JSON.parse(b) : null;
      } catch {
        return null;
      }
    }

    // ---------- chave ----------
    /** Bytes da chave derivada da senha mestra (32 bytes). */
    async function derivarBytes(senha, salBytes, voltas) {
      exigirMotor();
      if (motor === 'reserva') return reserva.derivar(enc.encode(senha), salBytes, voltas);
      const base = await cr.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await cr.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salBytes, iterations: voltas }, base, 256));
    }

    /** Objeto de chave usado para cifrar e decifrar: CryptoKey não extraível (webcrypto) ou os próprios bytes (reserva). */
    async function chaveDeBytes(bytes) {
      exigirMotor();
      if (motor === 'reserva') return bytes;
      return cr.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }

    async function cifrar(dados, k, salBytes, voltas) {
      const iv = cr.getRandomValues(new Uint8Array(12));
      const claro = enc.encode(JSON.stringify(dados));
      const ct = motor === 'reserva' ? reserva.cifrar(k, iv, claro) : new Uint8Array(await cr.subtle.encrypt({ name: 'AES-GCM', iv }, k, claro));
      return { v: 1, kdf: 'PBKDF2-SHA256', it: voltas, salt: paraB64(salBytes), iv: paraB64(iv), ct: paraB64(ct) };
    }

    async function decifrar(blob, k) {
      const iv = deB64(blob.iv);
      const ct = deB64(blob.ct);
      const claro = motor === 'reserva' ? reserva.decifrar(k, iv, ct) : new Uint8Array(await cr.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct));
      return JSON.parse(dec.decode(claro));
    }

    // ---------- sessão guardada ----------
    function armazenamentoDaSessao() {
      return politica.sessao === 'aba' ? storageAba : storage;
    }

    function apagarSessao() {
      for (const s of [storage, storageAba]) {
        try {
          if (s) s.removeItem(CHAVE_SESSAO);
        } catch {
          // sem storage: nada a apagar
        }
      }
    }

    function prazoDaPolitica() {
      if (politica.sessao === 'dia') return proximaMeiaNoite(agora());
      if (politica.sessao === 'horas') return agora() + politica.horas * 3600000;
      return null; // aba: sem prazo, vale enquanto a aba existir
    }

    /** Guarda (ou apaga) a chave da sessão conforme a política. Chamado depois de criar, abrir ou trocar a senha. */
    function guardarSessao() {
      apagarSessao();
      if (politica.sessao === 'pedir' || !bruto) return;
      const alvo = armazenamentoDaSessao();
      if (!alvo) return;
      const prazo = prazoDaPolitica();
      try {
        alvo.setItem(CHAVE_SESSAO, JSON.stringify({ v: 1, k: paraB64(bruto), salt: sal, exp: prazo }));
      } catch {
        // sem storage: pede a senha mestra de novo na próxima abertura
      }
      armarTemporizadores(prazo);
    }

    function limparTemporizadores() {
      if (temporizador) clearTimer(temporizador);
      if (expiracao) clearTimer(expiracao);
      temporizador = null;
      expiracao = null;
    }

    /** Ociosidade só vale quando não há sessão por prazo (pedir ou aba); com prazo, o cofre trava ao fim dele. */
    function armarTemporizadores(prazo) {
      limparTemporizadores();
      const comPrazo = politica.sessao === 'dia' || politica.sessao === 'horas';
      if (!comPrazo && ocioMs) temporizador = setTimer(() => travar('ocio'), ocioMs);
      if (comPrazo && prazo) expiracao = setTimer(() => travar('prazo'), Math.max(0, Math.min(prazo - agora(), MAX_TIMER_MS)));
    }

    function travar(motivo) {
      const estavaAberto = !!chave;
      chave = null;
      bruto = null;
      sal = null;
      limparTemporizadores();
      apagarSessao(); // travar de verdade: a chave da sessão também sai
      if (estavaAberto) avisar({ aberto: false, motivo: motivo || 'manual' });
    }

    function abertoCom(novaChave, novoBruto, novoSal, motivo) {
      chave = novaChave;
      bruto = novoBruto;
      sal = novoSal;
      guardarSessao();
      if (politica.sessao === 'pedir' || politica.sessao === 'aba') armarTemporizadores(null);
      avisar({ aberto: true, motivo });
    }

    const existe = () => !!lerBlob();
    const aberto = () => !!chave;
    const gravarBlob = (blob) => storage.setItem(CHAVE, JSON.stringify(blob));

    return {
      CHAVE,
      CHAVE_SESSAO,
      MIN_SENHA,
      /** 'webcrypto', 'reserva' ou null (sem como cifrar nesta página). */
      motor,
      disponivel: () => !!motor,
      existe,
      aberto,
      /** Política de sessão vinda do painel: { sessao: 'dia'|'horas'|'aba'|'pedir', horas }. Aplica já ao cofre aberto. */
      definirPolitica(nova) {
        const sessao = ['dia', 'horas', 'aba', 'pedir'].includes(nova && nova.sessao) ? nova.sessao : 'pedir';
        const horas = Number.isInteger(nova && nova.horas) && nova.horas >= 1 && nova.horas <= 72 ? nova.horas : 8;
        politica = { sessao, horas };
        if (chave) guardarSessao();
        else if (sessao === 'pedir') apagarSessao();
      },
      politica: () => ({ ...politica }),
      /** Cria o cofre com a senha mestra e já deixa aberto. Recusa senha curta. Não sobrescreve cofre existente. */
      async criar(senhaMestra, dados) {
        exigirMotor();
        if (existe()) throw new Error('Já existe um cofre neste navegador.');
        if (typeof senhaMestra !== 'string' || senhaMestra.length < MIN_SENHA) throw new Error(`A senha mestra precisa de ao menos ${MIN_SENHA} caracteres.`);
        const salBytes = cr.getRandomValues(new Uint8Array(16));
        const bytes = await derivarBytes(senhaMestra, salBytes, iteracoes);
        const k = await chaveDeBytes(bytes);
        gravarBlob(await cifrar(dados, k, salBytes, iteracoes));
        abertoCom(k, bytes, paraB64(salBytes), 'criado');
        return dados;
      },
      /** Destrava com a senha mestra e devolve os dados. Senha errada lança erro (o cofre continua travado). */
      async abrir(senhaMestra) {
        exigirMotor();
        const blob = lerBlob();
        if (!blob) throw new Error('Não existe cofre neste navegador.');
        const bytes = await derivarBytes(String(senhaMestra || ''), deB64(blob.salt), blob.it || ITERACOES_PADRAO);
        const k = await chaveDeBytes(bytes);
        let dados;
        try {
          dados = await decifrar(blob, k);
        } catch {
          throw new Error('Senha mestra incorreta.');
        }
        abertoCom(k, bytes, blob.salt, 'aberto');
        return dados;
      },
      /**
       * Destrava com a chave da sessão guardada (sem pedir a senha), se ainda valer. Devolve os dados ou null (e apaga a sessão
       * vencida, estragada ou de um cofre que mudou). Não faz nada quando a política é "pedir".
       */
      async restaurar() {
        if (!motor || politica.sessao === 'pedir') {
          if (politica.sessao === 'pedir') apagarSessao();
          return null;
        }
        const blob = lerBlob();
        let guardada = null;
        for (const s of [storageAba, storage]) {
          try {
            const t = s && s.getItem(CHAVE_SESSAO);
            if (t) {
              guardada = JSON.parse(t);
              break;
            }
          } catch {
            guardada = null;
          }
        }
        if (!blob || !guardada) return null;
        const vencida = guardada.exp != null && guardada.exp <= agora();
        if (vencida || guardada.v !== 1 || guardada.salt !== blob.salt) {
          apagarSessao();
          return null;
        }
        try {
          const bytes = deB64(guardada.k);
          const k = await chaveDeBytes(bytes);
          const dados = await decifrar(blob, k);
          chave = k;
          bruto = bytes;
          sal = blob.salt;
          // mantém o prazo que já estava guardado (não renova a cada F5)
          armarTemporizadores(guardada.exp);
          avisar({ aberto: true, motivo: 'restaurado' });
          return dados;
        } catch {
          apagarSessao();
          return null;
        }
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
        if (politica.sessao === 'pedir' || politica.sessao === 'aba') armarTemporizadores(null);
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
      /** Troca a senha mestra: confere a atual, gera sal novo e regrava (a sessão guardada passa a ter a chave nova). */
      async trocarSenha(atual, nova) {
        if (typeof nova !== 'string' || nova.length < MIN_SENHA) throw new Error(`A nova senha mestra precisa de ao menos ${MIN_SENHA} caracteres.`);
        const dados = await this.abrir(atual);
        const salNovo = cr.getRandomValues(new Uint8Array(16));
        const bytes = await derivarBytes(nova, salNovo, iteracoes);
        const k = await chaveDeBytes(bytes);
        gravarBlob(await cifrar(dados, k, salNovo, iteracoes));
        chave = k;
        bruto = bytes;
        sal = paraB64(salNovo);
        guardarSessao();
      },
      /** Marca atividade da pessoa: adia a trava por ociosidade (só vale em 'pedir' e 'aba'). */
      atividade() {
        if (chave && (politica.sessao === 'pedir' || politica.sessao === 'aba')) armarTemporizadores(null);
      },
      travar,
      /** Apaga o cofre (esqueci a senha mestra): os logins somem e precisam ser digitados de novo. */
      apagar() {
        try {
          storage.removeItem(CHAVE);
        } catch {
          // sem storage: nada a apagar
        }
        apagarSessao();
        travar('apagado');
        avisar({ aberto: false, motivo: 'apagado' });
      },
      aoMudar(fn) {
        ouvintes.add(fn);
        return () => ouvintes.delete(fn);
      },
    };
  }

  const api = { criarCofre, CHAVE, CHAVE_SESSAO, MIN_SENHA, ITERACOES_PADRAO, OCIO_PADRAO_MS, proximaMeiaNoite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    let armazenamento = null;
    let sessaoAba = null;
    try {
      armazenamento = raiz.localStorage;
      sessaoAba = raiz.sessionStorage;
    } catch {
      armazenamento = null; // storage bloqueado: sem cofre persistente (os acessos valem só nesta sessão)
    }
    raiz.ArxCofre = armazenamento ? criarCofre({ storage: armazenamento, sessionStorage: sessaoAba }) : null;
    raiz.ArxCofreFabrica = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
