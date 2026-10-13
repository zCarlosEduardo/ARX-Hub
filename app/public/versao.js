/* =====================================================================
   ArxVersao: avisa e recarrega a tela quando sobe uma versão nova do front.
   - consulta api/versao (relativa ao documento) ao abrir, a cada 60 s com a aba
     visível e ao voltar o foco; erro de rede/HTTP/JSON é ignorado (servidor
     reiniciando não recarrega nada);
   - versão diferente da que a página carregou: aviso fixo e recarga em ~8 s;
   - não recarrega no meio de uma execução: há um .stop-btn visível ou
     window.ArxVersao.ocupado() devolve true (hook opcional da página). O botão
     "Atualizar agora" recarrega sempre;
   - sessionStorage guarda a versão para a qual já recarregou, evitando laço
     quando duas instâncias respondem versões diferentes;
   - recarrega só o próprio documento (a tela vive em iframe no Hub).
   ===================================================================== */
(function () {
  const INTERVALO_MS = 60000;
  const ATRASO_MS = 8000;
  const OCUPADO_MS = 2000;
  const TEXTO_AVISO = 'Nova versão disponível. A página será atualizada';
  const TEXTO_OCUPADO = 'A atualização acontece quando a execução terminar';

  const api = (window.ArxVersao = window.ArxVersao || {});

  // --- decisões puras (testadas em shared/ui/test) ---
  function deveAvisar(atual, servidor) {
    return typeof atual === 'string' && atual !== '' && typeof servidor === 'string' && servidor !== '' && atual !== servidor;
  }

  // Ocupado = há botão "Parar" visível ou a página disse que está executando.
  function ocupado(doc, hook) {
    if (typeof hook === 'function') {
      try {
        if (hook()) return true;
      } catch (e) {
        // hook da página com defeito não pode travar a atualização: segue só pelo .stop-btn
      }
    }
    const botoes = doc.querySelectorAll('.stop-btn');
    for (let i = 0; i < botoes.length; i += 1) {
      const b = botoes[i];
      if (!b.classList.contains('hidden') && b.offsetParent !== null) return true;
    }
    return false;
  }

  function jaRecarregouPara(gravada, servidor) {
    return typeof servidor === 'string' && servidor !== '' && gravada === servidor;
  }

  api.deveAvisar = deveAvisar;
  api.ocupadoNoDocumento = ocupado;
  api.jaRecarregouPara = jaRecarregouPara;

  // --- estado e efeitos ---
  const CHAVE = 'arxVersaoRecarregou:' + location.pathname;
  let atual = null;
  let consultando = false;
  let aviso = null;
  let timer = null;

  function lerGravada() {
    try {
      return sessionStorage.getItem(CHAVE);
    } catch (e) {
      return null; // sessionStorage indisponível (iframe/privado): sem proteção, só segue
    }
  }
  function gravar(v) {
    try {
      sessionStorage.setItem(CHAVE, v);
    } catch (e) {
      // sem sessionStorage a proteção contra laço não existe, mas a recarga funciona
    }
  }

  const estaOcupado = () => ocupado(document, api.ocupado);

  function recarregar(versao) {
    gravar(versao);
    location.reload();
  }

  function montarAviso(versao) {
    const el = document.createElement('div');
    el.className = 'arx-versao';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="arx-versao-ponto" aria-hidden="true"></span><span class="arx-versao-texto"></span>';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'arx-versao-btn';
    botao.textContent = 'Atualizar agora';
    botao.addEventListener('click', () => recarregar(versao));
    el.appendChild(botao);
    document.body.appendChild(el);
    return el;
  }

  function mostrarTexto(texto, aguardando) {
    const t = aviso.querySelector('.arx-versao-texto');
    if (t.textContent !== texto) t.textContent = texto;
    aviso.classList.toggle('is-aguardando', aguardando);
  }

  // Ocupado: repete a checagem a cada 2 s. Livre: espera o atraso e confere de novo antes de recarregar.
  function agendar(versao) {
    clearTimeout(timer);
    if (estaOcupado()) {
      mostrarTexto(TEXTO_OCUPADO, true);
      timer = setTimeout(() => agendar(versao), OCUPADO_MS);
      return;
    }
    mostrarTexto(TEXTO_AVISO, false);
    timer = setTimeout(() => {
      if (estaOcupado()) agendar(versao);
      else recarregar(versao);
    }, ATRASO_MS);
  }

  function anunciar(versao) {
    if (aviso || !document.body) return;
    aviso = montarAviso(versao);
    agendar(versao);
  }

  async function consultar() {
    if (consultando || aviso) return;
    consultando = true;
    try {
      const res = await fetch(new URL('api/versao', location.href), { cache: 'no-store' });
      if (!res.ok) return;
      const corpo = await res.json();
      const servidor = corpo && typeof corpo.versao === 'string' ? corpo.versao : '';
      if (!servidor) return;
      if (atual === null) {
        atual = servidor;
        return;
      }
      if (!deveAvisar(atual, servidor)) return;
      if (jaRecarregouPara(lerGravada(), servidor)) return;
      anunciar(servidor);
    } catch (e) {
      // rede fora, servidor reiniciando ou JSON inválido: tenta de novo na próxima checagem
    } finally {
      consultando = false;
    }
  }

  function iniciar() {
    consultar();
    setInterval(() => {
      if (!document.hidden) consultar();
    }, INTERVALO_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) consultar();
    });
    window.addEventListener('focus', consultar);
  }

  iniciar();
})();
