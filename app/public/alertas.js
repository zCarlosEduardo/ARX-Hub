// Alertas: sino no cabeçalho com o que parou de funcionar (lido do chamados-glpi, porta 4013).
// Expõe window.AlertasSino (usado no cabeçalho do app.js).
//
// - Quem checa é o monitor do chamados-glpi (de tempos em tempos, sozinho):
//   automações no ar, banco-central, GLPI (App-Token), tokens da API do SGA,
//   chamados com erro seguidos e login recusado no Relatórios SGA.
// - Aqui só mostra: contador vermelho (tem erro), amarelo (só aviso) ou sem
//   número (tudo ok). Busca de 60 em 60 s e quando a aba volta a ficar visível.
// - Se o próprio chamados-glpi não responder, o sino mostra isso.
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;
  const { Icon } = window.Icons;

  const SERVICO = `${location.protocol}//${location.hostname}:4013`; // chamados-glpi
  const INTERVALO_MS = 60 * 1000;

  // ---------- ícones que o icons.js não tem (mesmo traço dele) ----------
  function svg(tamanho, cor, filhos) {
    return e('svg', { width: tamanho, height: tamanho, viewBox: '0 0 24 24', fill: 'none', stroke: cor, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flexShrink: 0, display: 'block' } },
      filhos.map((f, i) => e(f[0], { key: i, ...f[1] })));
  }
  const iconeSino = (t, cor) => svg(t, cor, [['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }], ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }]]);
  const iconeSinoMudo = (t, cor) => svg(t, cor, [['path', { d: 'M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5' }], ['path', { d: 'M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7' }], ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }], ['line', { x1: 2, y1: 2, x2: 22, y2: 22 }]]);
  const iconeOk = (t, cor) => svg(t, cor, [['circle', { cx: 12, cy: 12, r: 10 }], ['polyline', { points: '16 9 10.5 15 8 12.5' }]]);
  const iconeAviso = (t, cor) => svg(t, cor, [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['line', { x1: 12, y1: 9, x2: 12, y2: 13 }], ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }]]);

  // ---------- datas ----------
  const dataCurta = (s) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  function haQuanto(s) {
    if (!s) return '';
    const min = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    return `há ${Math.floor(h / 24)} d`;
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  async function api(caminho, metodo) {
    const resp = await fetch(SERVICO + caminho, { method: metodo || 'GET', signal: AbortSignal.timeout ? AbortSignal.timeout(metodo === 'POST' ? 120000 : 15000) : undefined });
    if (resp.status === 404) throw new Error('o chamados-glpi não possui o recurso de alertas (serviço desatualizado)');
    const dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados) throw new Error((dados && dados.error) || `HTTP ${resp.status}`);
    return dados;
  }
  const motivoFalha = (erro) => (erro.name === 'TimeoutError' || erro.name === 'TypeError' ? 'o chamados-glpi (porta 4013) não respondeu' : erro.message);

  // ---------- item da lista ----------
  function ItemAlerta({ a, resolvido }) {
    const cor = resolvido ? 'var(--accent)' : a.nivel === 'erro' ? 'var(--error)' : 'var(--warn)';
    return e('div', { className: 'alertas-item' + (resolvido ? ' resolvido' : '') }, [
      e('span', { key: 'i', className: 'alertas-item-icone', style: { color: cor, background: resolvido ? 'var(--accent-soft)' : a.nivel === 'erro' ? 'var(--error-tint)' : 'var(--warn-tint)' } },
        resolvido ? iconeOk(15, cor) : a.nivel === 'erro' ? Icon('AlertCircle', 15, cor) : iconeAviso(15, cor)),
      e('div', { key: 't', style: { minWidth: 0, flex: 1 } }, [
        e('div', { key: 'ti', className: 'alertas-item-titulo' }, a.titulo),
        !resolvido && a.detalhe ? e('div', { key: 'de', className: 'alertas-item-detalhe' }, a.detalhe) : null,
        e('div', { key: 'q', className: 'alertas-item-quando' },
          resolvido ? `voltou ${haQuanto(a.resolvidoEm)} · com problema desde ${dataCurta(a.desde)}` : `desde ${dataCurta(a.desde)} (${haQuanto(a.desde)})`),
      ]),
    ]);
  }

  // ---------- sino ----------
  function AlertasSino() {
    const [dados, setDados] = useState(null);
    const [falha, setFalha] = useState(''); // o chamados-glpi não respondeu
    const [aberto, setAberto] = useState(false);
    const [checando, setChecando] = useState(false);
    const [verChecagens, setVerChecagens] = useState(false);
    const caixa = useRef(null);

    const carregar = useCallback(async () => {
      try {
        setDados(await api('/api/alertas'));
        setFalha('');
      } catch (erro) {
        setFalha(motivoFalha(erro));
      }
    }, []);

    useEffect(() => {
      carregar();
      const t = setInterval(() => {
        if (document.visibilityState === 'visible') carregar();
      }, INTERVALO_MS);
      const aoVoltar = () => {
        if (document.visibilityState === 'visible') carregar();
      };
      document.addEventListener('visibilitychange', aoVoltar);
      return () => {
        clearInterval(t);
        document.removeEventListener('visibilitychange', aoVoltar);
      };
    }, [carregar]);

    // fecha clicando fora ou com Esc
    useEffect(() => {
      if (!aberto) return undefined;
      const fora = (ev) => {
        if (caixa.current && !caixa.current.contains(ev.target)) setAberto(false);
      };
      const esc = (ev) => {
        if (ev.key === 'Escape') setAberto(false);
      };
      document.addEventListener('mousedown', fora);
      document.addEventListener('keydown', esc);
      return () => {
        document.removeEventListener('mousedown', fora);
        document.removeEventListener('keydown', esc);
      };
    }, [aberto]);

    const abrir = () => {
      if (!aberto) carregar();
      setAberto(!aberto);
    };

    async function checarAgora() {
      setChecando(true);
      try {
        setDados(await api('/api/alertas/checar', 'POST'));
        setFalha('');
      } catch (erro) {
        setFalha(motivoFalha(erro));
      } finally {
        setChecando(false);
      }
    }

    const alertas = (dados && dados.alertas) || [];
    const resolvidos = (dados && dados.resolvidos) || [];
    const checagens = (dados && dados.checagens) || [];
    const erros = alertas.filter((a) => a.nivel === 'erro').length;
    const total = alertas.length;
    const avisos = total - erros;
    const estado = falha ? 'fora' : erros ? 'erro' : total ? 'aviso' : 'ok';
    const dica =
      estado === 'fora' ? `Alertas indisponíveis: ${falha}`
        : estado === 'ok' ? (dados && dados.ultimaChecagem ? 'Alertas: tudo funcionando' : 'Alertas: aguardando a primeira checagem')
          : `Alertas: ${[erros ? plural(erros, 'erro', 'erros') : '', avisos ? plural(avisos, 'aviso', 'avisos') : ''].filter(Boolean).join(' e ')}`;

    const cabecalho = e('div', { key: 'h', className: 'alertas-cabeca' }, [
      e('div', { key: 't', style: { minWidth: 0 } }, [
        e('div', { key: 'n', className: 'alertas-titulo' }, 'Alertas'),
        e('div', { key: 's', className: 'alertas-sub' },
          falha ? 'Sem resposta do monitor'
            : dados && dados.ultimaChecagem ? `Última checagem ${haQuanto(dados.ultimaChecagem)} · a cada ${dados.intervaloMin} min`
              : 'Aguardando a primeira checagem'),
      ]),
      e('button', { key: 'c', type: 'button', className: 'btn-outline alertas-checar', onClick: checarAgora, disabled: checando, title: 'Checar tudo agora (inclui os tokens da API do SGA)' }, [
        e('span', { key: 'i', style: { display: 'flex', animation: checando ? 'spin 0.9s linear infinite' : 'none' } }, Icon('RefreshCw', 13)),
        e('span', { key: 't' }, checando ? 'Checando…' : 'Checar agora'),
      ]),
    ]);

    let corpo;
    if (falha) {
      corpo = e('div', { key: 'f', className: 'alertas-vazio' }, [
        e('span', { key: 'i', className: 'alertas-vazio-icone', style: { background: 'var(--hover-bg)' } }, Icon('WifiOff', 18, 'var(--muted)')),
        e('div', { key: 't', className: 'alertas-vazio-titulo' }, 'Falha ao ler os alertas'),
        e('div', { key: 'd', className: 'alertas-vazio-texto' }, `${falha[0].toUpperCase()}${falha.slice(1)}. Enquanto isso, nada é avisado aqui.`),
      ]);
    } else if (!total) {
      const ok = checagens.filter((c) => c.ok === true).length;
      corpo = e('div', { key: 'v', className: 'alertas-vazio' }, [
        e('span', { key: 'i', className: 'alertas-vazio-icone', style: { background: 'var(--accent-soft)' } }, iconeOk(18, 'var(--accent)')),
        e('div', { key: 't', className: 'alertas-vazio-titulo' }, dados && dados.ultimaChecagem ? 'Tudo funcionando' : 'Nenhuma checagem realizada'),
        e('div', { key: 'd', className: 'alertas-vazio-texto' }, dados && dados.ultimaChecagem ? `${ok} de ${plural(checagens.length, 'checagem', 'checagens')} sem problema.` : 'A primeira checagem ocorre logo após a inicialização do serviço.'),
      ]);
    } else {
      corpo = e('div', { key: 'l', className: 'alertas-lista' }, alertas.map((a) => e(ItemAlerta, { key: a.id, a })));
    }

    const corChecagem = (c) => {
      if (c.ok === true) return 'var(--accent)';
      if (c.ok == null) return 'var(--muted-soft)';
      return alertas.some((a) => a.nivel === 'erro' && (a.id === c.id || a.id.startsWith(c.id + ':'))) ? 'var(--error)' : 'var(--warn)';
    };
    const listaChecagens = checagens.length && !falha
      ? e('div', { key: 'ch', className: 'alertas-secao' }, [
        e('button', { key: 'b', type: 'button', className: 'alertas-secao-btn', onClick: () => setVerChecagens(!verChecagens), 'aria-expanded': verChecagens }, [
          e('span', { key: 't' }, `O que é checado (${checagens.length})`),
          e('span', { key: 'c', style: { display: 'flex', transform: verChecagens ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' } }, Icon('ChevronDown', 13, 'var(--muted)')),
        ]),
        verChecagens ? e('div', { key: 'l', className: 'alertas-checagens' }, checagens.map((c) => e('div', { key: c.id, className: 'alertas-checagem' }, [
          e('span', { key: 'd', className: 'alertas-checagem-ponto', style: { background: corChecagem(c) } }),
          e('span', { key: 'n', style: { flex: 1, minWidth: 0 } }, c.nome),
          c.ok == null ? e('span', { key: 'x', className: 'alertas-checagem-obs' }, 'checagem indisponível') : null,
        ]))) : null,
      ])
      : null;

    const secaoResolvidos = resolvidos.length && !falha
      ? e('div', { key: 'r', className: 'alertas-secao' }, [
        e('div', { key: 't', className: 'alertas-secao-titulo' }, 'Resolvidos recentemente'),
        e('div', { key: 'l', className: 'alertas-lista' }, resolvidos.slice(0, 6).map((a, i) => e(ItemAlerta, { key: a.id + '-' + i, a, resolvido: true }))),
      ])
      : null;

    return e('div', { ref: caixa, className: 'alertas-caixa' }, [
      e('button', {
        key: 'b', type: 'button', className: 'btn-outline alertas-sino' + (aberto ? ' aberto' : ''), onClick: abrir,
        title: dica, 'aria-label': dica, 'aria-expanded': aberto, 'data-estado': estado,
      }, [
        e('span', { key: 'i', style: { display: 'flex' } }, estado === 'fora' ? iconeSinoMudo(16, 'var(--muted-soft)') : iconeSino(16, 'var(--text)')),
        estado === 'erro' || estado === 'aviso'
          ? e('span', { key: 'n', className: 'alertas-contador ' + estado }, total > 99 ? '99+' : String(total))
          : null,
      ]),
      aberto ? e('div', { key: 'p', className: 'alertas-painel', role: 'dialog', 'aria-label': 'Alertas' }, [
        cabecalho,
        e('div', { key: 'c', className: 'alertas-rolagem' }, [corpo, secaoResolvidos, listaChecagens]),
      ]) : null,
    ]);
  }

  window.AlertasSino = AlertasSino;
})();
