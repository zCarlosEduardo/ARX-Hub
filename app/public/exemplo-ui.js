// Peças comuns das telas de exemplo: janela (modal) e avisos no canto.
(function () {
  const e = React.createElement;
  const { useEffect, useRef, useState } = React;
  const { Icon } = window.Icons;

  // Janela com foco preso dentro (Tab circula), Esc e clique fora fecham, e o foco volta para quem abriu.
  function Modal({ titulo, descricao, fechar, rodape, largura, children, perigo }) {
    const caixa = useRef(null);
    useEffect(() => {
      const antes = document.activeElement;
      const alvo = caixa.current.querySelector('[autofocus], input, select, textarea, button:not(.exu-modal-x)');
      if (alvo) alvo.focus();
      const tecla = (ev) => {
        if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); }
        if (ev.key !== 'Tab') return;
        const focaveis = [...caixa.current.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')];
        if (!focaveis.length) return;
        const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
        if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      };
      document.addEventListener('keydown', tecla, true);
      return () => { document.removeEventListener('keydown', tecla, true); if (antes && antes.focus) antes.focus(); };
    }, []);
    return e('div', { className: 'exu-modal-fundo', onMouseDown: (ev) => { if (ev.target === ev.currentTarget) fechar(); } },
      e('div', { ref: caixa, className: 'exu-modal' + (perigo ? ' perigo' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'exu-modal-titulo', style: largura ? { maxWidth: largura } : null }, [
        e('div', { key: 'c', className: 'exu-modal-cab' }, [
          perigo ? e('span', { key: 'i', className: 'exu-modal-icone' }, Icon('AlertCircle', 18, 'var(--error)')) : null,
          e('div', { key: 't', style: { flex: 1, minWidth: 0 } }, [
            e('h3', { key: 'h', id: 'exu-modal-titulo' }, titulo),
            descricao ? e('p', { key: 'p' }, descricao) : null,
          ]),
          e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno exu-modal-x', onClick: fechar, 'aria-label': 'Fechar' }, Icon('X', 14, 'currentColor')),
        ]),
        children ? e('div', { key: 'b', className: 'exu-modal-corpo' }, children) : null,
        rodape ? e('div', { key: 'r', className: 'exu-modal-pe' }, rodape) : null,
      ]));
  }

  function useAvisos() {
    const [avisos, setAvisos] = useState([]);
    const avisar = (texto, tipo) => {
      const id = Math.random();
      setAvisos((a) => [...a, { id, texto, tipo }]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 3500);
    };
    const lista = avisos.length ? e('div', { key: 'avisos', className: 'exu-avisos', 'aria-live': 'polite' }, avisos.map((a) => e('div', { key: a.id, className: 'exu-aviso ' + (a.tipo || '') }, [e('i', { key: 'i' }), a.texto]))) : null;
    return [avisar, lista];
  }

  // Campo de formulário: rótulo, controle, ajuda e erro no mesmo lugar.
  function Campo({ rotulo, ajuda, erro, children, id }) {
    return e('div', { className: 'exu-campo' }, [
      e('label', { key: 'l', htmlFor: id }, rotulo),
      children,
      erro ? e('p', { key: 'e', className: 'exu-campo-erro' }, erro) : ajuda ? e('p', { key: 'a', className: 'exu-campo-ajuda' }, ajuda) : null,
    ]);
  }

  window.ExemploUI = { Modal, useAvisos, Campo };
})();
