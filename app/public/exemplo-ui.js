// Peças comuns das telas de exemplo: janela (modal) e avisos no canto.
(function () {
  const e = React.createElement;
  const { useEffect, useRef, useState } = React;
  const { Icon } = window.Icons;

  // Ícones a mais só do exemplo (o icons.js do Hub fica como está). Ico() usa o do Hub e cai nestes quando não existe.
  const L = (x1, y1, x2, y2) => e('line', { x1, y1, x2, y2 });
  const C = (cx, cy, r) => e('circle', { cx, cy, r });
  const P = (d) => e('path', { d });
  const PL = (pts) => e('polyline', { points: pts });
  const RC = (x, y, w, h, rx) => e('rect', { x, y, width: w, height: h, rx: rx || 0 });
  const EXTRAS = {
    Car: () => [P('M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H7.3a2 2 0 0 0-1.6.8L3 10.5l-1.4.6A1.5 1.5 0 0 0 1 12.5V16c0 .6.4 1 1 1h2'), C(7, 17, 2), C(17, 17, 2), P('M9 17h6')],
    Camera: () => [P('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z'), C(12, 13, 3)],
    Key: () => [C(7.5, 15.5, 5.5), P('m21 2-9.6 9.6'), P('m15.5 7.5 3 3L22 7l-3-3')],
    Mail: () => [RC(2, 4, 20, 16, 2), P('m22 7-10 5L2 7')],
    Phone: () => [P('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z')],
    Calendar: () => [RC(3, 4, 18, 18, 2), L(16, 2, 16, 6), L(8, 2, 8, 6), L(3, 10, 21, 10)],
    Shield: () => [P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z')],
    Image: () => [RC(3, 3, 18, 18, 2), C(9, 9, 2), P('m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21')],
    Upload: () => [P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), PL('17 8 12 3 7 8'), L(12, 3, 12, 15)],
    Download: () => [P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), PL('7 10 12 15 17 10'), L(12, 15, 12, 3)],
    Table: () => [RC(3, 3, 18, 18, 2), L(3, 9, 21, 9), L(3, 15, 21, 15), L(12, 3, 12, 21)],
    Tag: () => [P('M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z'), C(7, 7, 1)],
    Truck: () => [P('M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2'), P('M15 18H9'), P('M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14'), C(17, 18, 2), C(7, 18, 2)],
    MapPin: () => [P('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z'), C(12, 10, 3)],
    CreditCard: () => [RC(2, 5, 20, 14, 2), L(2, 10, 22, 10)],
    UserPlus: () => [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), C(9, 7, 4), L(19, 8, 19, 14), L(22, 11, 16, 11)],
    UserCheck: () => [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), C(9, 7, 4), PL('16 11 18 13 22 9')],
    Globe: () => [C(12, 12, 10), L(2, 12, 22, 12), P('M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z')],
    Zap: () => [P('M13 2 3 14h9l-1 8 10-12h-9z')],
    Clipboard: () => [RC(8, 2, 8, 4, 1), P('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2')],
    Bell: () => [P('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'), P('M10.3 21a1.9 1.9 0 0 0 3.4 0')],
    Check: () => [PL('20 6 9 17 4 12')],
    Unlock: () => [RC(3, 11, 18, 11, 2), P('M7 11V7a5 5 0 0 1 9.9-1')],
    Play: () => [P('m6 3 14 9-14 9z')],
    Sheet: () => [P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'), PL('14 2 14 8 20 8'), L(8, 13, 16, 13), L(8, 17, 16, 17), L(12, 13, 12, 17)],
    Wrench: () => [P('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z')],
    Layers: () => [P('m12 2 10 5-10 5L2 7z'), P('m2 17 10 5 10-5'), P('m2 12 10 5 10-5')],
    Send: () => [P('m22 2-7 20-4-9-9-4z'), P('M22 2 11 13')],
    Square: () => [RC(4, 4, 16, 16, 2)],
  };
  function Ico(nome, tam, cor, traco) {
    const doHub = window.Icons.Icon(nome, tam, cor, traco);
    if (doHub || !EXTRAS[nome]) return doHub;
    const col = cor || 'var(--text)';
    return e('svg', { width: tam || 18, height: tam || 18, viewBox: '0 0 24 24', fill: 'none', stroke: col, strokeWidth: traco == null ? 1.75 : traco, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', style: { flexShrink: 0 } },
      EXTRAS[nome]().map((el, i) => React.cloneElement(el, { key: i })));
  }
  const ICONES = [...window.Icons.ICON_CHOICES, 'LifeBuoy', 'Lock', 'MessageCircle', 'Settings', 'History', 'Inbox', 'Eye', ...Object.keys(EXTRAS).filter((k) => !['Check', 'Bell', 'Square', 'Play', 'Unlock'].includes(k))];
  const CORES = [...window.Icons.COLOR_CHOICES, '#0EA5E9', '#EC4899', '#6366F1', '#F97316', '#84CC16', '#64748B'];

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
    // portal no body: a janela fica por cima de tudo mesmo quando quem abre está dentro da barra do topo
    return ReactDOM.createPortal(e('div', { className: 'exu-modal-fundo', onMouseDown: (ev) => { if (ev.target === ev.currentTarget) fechar(); } },
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
      ])), document.body);
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

  window.ExemploUI = { Modal, useAvisos, Campo, Ico, ICONES, CORES };
})();
