// v3 (Hub de exemplo): cópia de chamados.js com a tela do Hub de exemplo (lista paginada, visões, painel lateral); a lógica é a mesma.
// Aba "Chamados" do ARX Hub: chamados do GLPI (entidade Sistemas) que as
// automações sabem resolver aparecem como cards: "Rodar" ou "Não rodar".
// Quem faz o trabalho é o serviço chamados-glpi (porta 4013): ele lê o GLPI,
// roda a automação (Relatórios SGA / Cadastro de voluntário / Cadastro de
// colaborador), responde no chamado e registra no banco-central.
// Endereço e App-Token do GLPI ficam no servidor; o token de cada pessoa e os
// logins do SGA/PowerCRM vêm de "Meus acessos" (acessos.js, só neste navegador).
(function () {
  const e = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;
  const { Icon } = window.Icons;

  const Hub = window.ArxAcessosHub; // acessos.js: dono dos acessos do Hub
  const Cache = window.ChamadosCache; // chamados-cache.js: pré-carga e lista em memória/localStorage
  const TEXTO_AGUARDANDO = 'Aguardando a atualização da lista';

  /** Forma de `lista` usada pela tela, a partir do estado do cache. `guardado`: lista antiga, ainda não confirmada. */
  function listaDoCache(s) {
    const d = s.dados;
    return {
      carregando: s.carregando,
      erro: s.erro,
      itens: d ? d.itens : [],
      usuario: d ? d.usuario : null,
      outros: d ? d.outros : 0,
      totalAbertos: d ? d.totalAbertos : 0,
      perfis: d ? d.perfis || [] : [],
      tiposDisponiveis: d ? d.tiposDisponiveis || [] : [],
      entidades: d ? Cache.puro.entidadesDaLista(d) : [],
      tempos: s.tempos,
      em: s.em,
      guardado: !!d && !s.fresco,
      aoVivo: !!s.aoVivo,
    };
  }
  const KEY_DISPENSADOS = 'arxhub_chamados_dispensados';
  const KEY_MODO_TESTE = 'arxhub_chamados_modo_teste';
  // identifica esta aba pro servidor (cada computador no modo automático reserva os chamados que vai pegar)
  const CLIENTE_ID = (() => {
    const novo = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      let v = sessionStorage.getItem('arxhub_chamados_cliente');
      if (!v) { v = novo(); sessionStorage.setItem('arxhub_chamados_cliente', v); }
      return v;
    } catch { return novo(); }
  })();
  const KEY_AUTO = 'arxhub_chamados_auto'; // só o limite e os tipos; "ligado" nunca volta sozinho
  const SERVICO = `${location.origin}/servicos/chamados`;

  const ler = (k, padrao) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  };
  const gravar = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // sem storage: vale só enquanto a tela estiver aberta
    }
  };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const dataBr = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

  // ---------- pedidos de senha (senha_sistemas, alterar_senha_sga e desbloquear_usuario_sga) ----------
  // trocar a senha e desbloquear o usuário do SGA usam o mesmo card (requerente, alvo, identidade); só a ação muda
  const ehSenhaSga = (item) => !!item && (item.tipo === 'alterar_senha_sga' || item.tipo === 'desbloquear_usuario_sga');
  const NOMES_SISTEMA = { crm: 'CRM (PowerCRM)', ezchat: 'EzChat', wint: 'Wint', mundiale: 'Mundiale', chat: 'Chat', sga: 'SGA' };
  const nomeSistema = (chave) => NOMES_SISTEMA[chave] || String(chave);
  const SELOS_REGRA = { mesma_pessoa: 'Própria pessoa', gestao: 'Gestão do departamento' };
  const textoOuNaoInformado = (v) => (v === null || v === undefined || String(v).trim() === '' ? 'Não informado' : String(v));

  const ESTADOS_PLANILHA = { unica: 'achado', ambigua: 'mais de uma pessoa com esse nome', inativa: 'consta como inativo', nenhuma: 'não encontrado', planilha_indisponivel: 'planilha indisponível' };
  const descreverPessoa = (p) => (!p ? 'Não informado' : p.estado === 'unica' ? `${textoOuNaoInformado(p.nome)} (função ${textoOuNaoInformado(p.funcao)}, departamento ${textoOuNaoInformado(p.departamento)})` : ESTADOS_PLANILHA[p.estado] || 'Não informado');
  /** O que a planilha de funcionários achou do solicitante e do alvo (null = servidor antigo, sem o campo). */
  function textoDiagnosticoPlanilha(d) {
    if (!d) return null;
    return `Planilha de funcionários: solicitante ${descreverPessoa(d.solicitante)}; alvo ${descreverPessoa(d.alvo)}.`;
  }

  /** Aviso do card "Alterar senha do SGA": só existe quando a identidade não foi confirmada. */
  function avisoSenha(item) {
    if (!ehSenhaSga(item)) return null;
    const id = item.identidade;
    if (id && id.ok === true) return null;
    if (id && id.liberavelManual === true) return { motivo: textoOuNaoInformado(id.motivo), texto: 'Não roda no automático. Confira o chamado e rode manualmente se o pedido for legítimo', liberavel: true };
    return { motivo: textoOuNaoInformado(id && id.motivo), texto: 'Este chamado não será executado' };
  }

  // ---------- confirmação manual (chamado identificado só pela descrição) ----------
  const MOTIVO_PADRAO_CONFIANCA = 'pedido identificado pela descrição';

  /** Rótulo do chip do card (null = confiança alta ou serviço sem o campo). */
  function rotuloConfianca(item) {
    return item && item.somenteManual === true ? 'Confirmação manual' : null;
  }

  /** Itens somenteManual nunca entram no modo automático nem em "Rodar todos os prontos". */
  /** Chegou a hora da nova tentativa automática de uma falha momentânea (IA)? */
  const horaDeRepetir = (quando) => !!quando && Date.now() >= Date.parse(quando);

  // A automação já concluiu e o chamado segue aberto sem resposta nova do solicitante: a solução não chegou ao GLPI.
  // Rodar de novo duplicaria o cadastro; com resposta nova é reaberto de verdade e segue as regras do servidor.
  const concluidoAindaAberto = (item) => !!item.ultimaExecucao && item.ultimaExecucao.status === 'concluido' && !(item.respostas && item.respostas.length);

  function deveExcluirDoAutomatico(item) {
    return !!item && (item.somenteManual === true || concluidoAindaAberto(item) || (ehSenhaSga(item) && !!item.identidade && item.identidade.ok !== true && item.identidade.liberavelManual === true));
  }

  /** Textos do aviso âmbar do card (null = sem aviso). */
  function avisoConfianca(item) {
    if (!rotuloConfianca(item)) return null;
    const motivo = String(item.motivoConfianca || '').trim() || MOTIVO_PADRAO_CONFIANCA;
    return { titulo: `Confirmação manual: ${motivo}`, orientacao: 'Revise o chamado antes de rodar. Este item não entra no modo automático.' };
  }

  /** Objeto do item enviado ao serviço. `confirmado: true` só no clique manual de um item somenteManual. */
  function montarPedidoItem(item, { manual = false, campos = {} } = {}) {
    const pedido = { id: item.id, ...campos };
    if (manual === true && deveExcluirDoAutomatico(item)) pedido.confirmado = true;
    return pedido;
  }

  /** Motivo que impede de rodar um pedido de senha (null = liberado). `temLoginSga(chave)` diz se há login do SGA para a empresa. */
  function bloqueioSenha(item, temLoginSga) {
    if (!ehSenhaSga(item)) return null;
    const aviso = avisoSenha(item);
    if (aviso && !aviso.liberavel) return 'Identidade não confirmada: este chamado não será executado';
    if (!item.empresaSga || !temLoginSga(item.empresaSga.chave)) return `Marque ${item.empresaSga ? item.empresaSga.nome : item.categoria} em um login do SGA (Acessos)`;
    return null;
  }

  /** Bloco de detalhes do card dos dois tipos de senha. */
  function detalhesSenha(item) {
    const caixa = { fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 };
    const rotulo = (chave, t) => e('div', { key: chave, style: { ...S.label, marginBottom: 0 } }, t);
    const chips = (lista, chave) => e('div', { key: chave, role: 'list', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
      lista.map((s) => e('span', { key: s, role: 'listitem', style: { ...S.chip(false), cursor: 'default' } }, nomeSistema(s))));
    const sistemas = Array.isArray(item.sistemas) ? item.sistemas : [];
    const listaSistemas = sistemas.length ? chips(sistemas, 'sis') : e('div', { key: 'sis', style: { color: 'var(--muted)' } }, 'Não informado');
    if (item.tipo === 'senha_sistemas') {
      return e('div', { key: 'det', style: caixa }, [
        rotulo('l', 'Sistemas citados'),
        listaSistemas,
        e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Responde com o texto "Esqueci minha senha" e soluciona o chamado. Nenhuma senha é alterada.'),
      ]);
    }
    const alvo = item.senhaAlvo || {};
    const outros = Array.isArray(item.outrosSistemas) ? item.outrosSistemas : [];
    const aviso = avisoSenha(item);
    const diagnostico = textoDiagnosticoPlanilha(item.diagnosticoPlanilha);
    const regra = item.identidade && item.identidade.ok === true ? SELOS_REGRA[item.identidade.regra] : null;
    const bloco = (chave, titulo, linhas) => e('div', { key: chave, style: { minWidth: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowWrap: 'anywhere' } }, [
      e('div', { key: 'l', style: { ...S.label, marginBottom: 2 } }, titulo),
      ...linhas.map((x, i) => e('div', { key: i, style: i === 0 ? { fontWeight: 600 } : { color: 'var(--muted)', fontSize: 12 } }, x)),
    ]);
    return e('div', { key: 'det', style: caixa }, [
      e('div', { key: 'par', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }, [
        bloco('req', 'Requerente', [textoOuNaoInformado(item.requerente)]),
        bloco('alvo', 'Usuário alvo', [textoOuNaoInformado(alvo.nome), `Usuário ${textoOuNaoInformado(alvo.usuario)}`, `CPF ${textoOuNaoInformado(alvo.cpfMascarado)}`]),
      ]),
      regra ? e('div', { key: 'selo', style: { display: 'flex' } }, e('span', { style: { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-fg)' } }, regra)) : null,
      diagnostico ? e('div', { key: 'diag', style: { color: 'var(--muted)', fontSize: 12 } }, diagnostico) : null,
      aviso ? e('div', { key: 'aviso', role: 'alert', style: { background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 10, padding: '8px 10px', color: 'var(--warn)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2 } }, [
        e('div', { key: 'm' }, aviso.motivo),
        e('strong', { key: 't' }, aviso.texto),
      ]) : null,
      e('div', { key: 'emp' }, [e('span', { key: 'l', style: { color: 'var(--muted)' } }, 'Empresa no SGA: '), e('strong', { key: 'n' }, textoOuNaoInformado(item.empresaSga && item.empresaSga.nome))]),
      rotulo('sl', 'Sistemas citados'),
      listaSistemas,
      outros.length ? rotulo('ol', 'Recebem só a orientação "Esqueci minha senha"') : null,
      outros.length ? chips(outros, 'out') : null,
      e('div', { key: 'p', style: { color: 'var(--muted)' } }, item.tipo === 'desbloquear_usuario_sga' ? 'Desbloqueia o usuário alvo no SGA e soluciona o chamado. A senha não é alterada.' : 'Troca a senha do usuário alvo no SGA e soluciona o chamado. A senha não passa pelo Hub.'),
    ]);
  }

  /** Copia texto pra área de transferência (o Hub abre em http: sem navigator.clipboard, então cai no execCommand). */
  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch { /* tenta o plano B */ }
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(t);
    return ok;
  }

  async function api(caminho, corpo) {
    const resp = await fetch(SERVICO + caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : undefined);
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.error || `HTTP ${resp.status}`);
    return dados;
  }

  // estilos (mesmo visual dos cards do Painel)
  // v2: mesmos nomes do Hub atual (detalhesSenha usa label e chip), visual do layout novo
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-card)' },
    label: { fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 },
    input: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' },
    btnPrim: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    btnSec: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', background: 'var(--secondary)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
    link: { background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 },
    tag: (cor) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: cor + '22', color: cor }),
    chip: (sel) => ({ padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)'), background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--muted)' }),
  };
  const COR_TIPO = { fechamento: '#F5A524', cadastro_consultor: '#6DBE6A', cadastro_usuario: '#3B82F6', inativacao_consultor: '#F5514D', ativacao_consultor: '#10B981', desbloquear_usuario_sga: '#0EA5E9', bloqueio_acesso: '#8B5CF6', cadastro_modelo: '#14B8A6', erro_exportar_modelo: '#0EA5E9', senha_crm: '#64748B', senha_sistemas: '#64748B', alterar_senha_sga: '#06B6D4', foto_perfil: '#D946EF', sincronizar_vistoria: '#F97316' };

  /** Login do SGA que cobre a empresa (o primeiro que a tiver marcada). */
  const loginDaEmpresa = (sgas, chave) => Hub.loginDaEmpresa(sgas, chave);

  // ---------- "Ver chamado": painel lateral com o chamado do GLPI + linha do tempo ----------
  // O link do GLPI cai em "sessão expirou" quando clicado de fora, então o chamado é lido
  // aqui dentro, pela API (chamados-glpi: /api/chamado/:id e /api/chamado/:id/historico).
  // O servidor já devolve os textos sem CPF, e-mail, telefone e senha.
  const COR_EXEC = { concluido: 'var(--accent)', erro: 'var(--error)', teste: 'var(--warn)', executando: 'var(--muted)' };
  const NOME_EXEC = { concluido: 'Concluído', erro: 'Erro', teste: 'Teste', executando: 'Executando' };
  const tempo = (s) => { const t = Date.parse(String(s || '').replace(' ', 'T')); return Number.isNaN(t) ? 0 : t; };

  /** Texto que começa recolhido (poucas linhas) e abre com "ver mais". */
  function TextoRecolhivel({ texto, linhas, recolhidoTodo, rotulo }) {
    const [aberto, setAberto] = useState(false);
    if (!texto) return null;
    const longo = !!recolhidoTodo || texto.length > 220 || texto.split('\n').length > (linhas || 4);
    const estilo = { margin: 0, fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' };
    const corte = !aberto && !recolhidoTodo ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: linhas || 4, overflow: 'hidden' } : {};
    return e('div', null, [
      recolhidoTodo && !aberto ? null : e('pre', { key: 't', style: { ...estilo, ...corte } }, texto),
      longo ? e('button', { key: 'b', style: { ...S.link, fontSize: 11.5, marginTop: 4 }, onClick: () => setAberto((a) => !a) }, aberto ? 'Recolher' : (rotulo || 'Ver mais')) : null,
    ]);
  }

  // v3: painel lateral no layout do Hub de exemplo. Com `p` (partes do chamado, vindas da aba Chamados) mostra
  // Informações, O que a automação leu, Opinião da IA, a Conversa e o Andamento, com Rodar, Não rodar e Abrir no GLPI
  // no rodapé. Sem `p` (aba Resultados) mostra só o chamado e a conversa.
  const tempoRelativo = (s) => {
    const t = tempo(s);
    if (!t) return 'Não informado';
    const min = Math.max(1, Math.round((Date.now() - t) / 60000));
    return min < 60 ? min + ' min' : min < 1440 ? Math.floor(min / 60) + ' h' : Math.floor(min / 1440) + (min < 2880 ? ' dia' : ' dias');
  };
  function VerChamado({ item, userToken, onFechar, p }) {
    const [d, setD] = useState({ carregando: true, erro: null, chamado: null });
    const [h, setH] = useState({ carregando: true, erro: null, itens: [] });
    const [copiado, setCopiado] = useState(false);
    // resposta ao solicitante: começa com a que a IA daria (lendo as respostas dele) e pode ser editada antes de enviar
    const [resposta, setResposta] = useState(item.respostaSugerida || '');
    const [envio, setEnvio] = useState({ enviando: false, msg: '', erro: '' });
    useEffect(() => { setResposta(item.respostaSugerida || ''); setEnvio({ enviando: false, msg: '', erro: '' }); }, [item.id, item.respostaSugerida]);
    async function responder() {
      setEnvio({ enviando: true, msg: '', erro: '' });
      try {
        const r = await p.responder(resposta.trim());
        setEnvio({ enviando: false, msg: r.teste ? 'Modo teste: nada foi escrito no GLPI (desligue o modo teste para responder de verdade).' : 'Resposta enviada no chamado; ele ficou Pendente esperando o solicitante.', erro: '' });
      } catch (err) {
        setEnvio({ enviando: false, msg: '', erro: err.message });
      }
    }

    useEffect(() => {
      let vivo = true;
      const corpo = { glpi: { userToken } };
      setD({ carregando: true, erro: null, chamado: null });
      setH({ carregando: true, erro: null, itens: [] });
      api(`/api/chamado/${item.id}`, corpo)
        .then((c) => vivo && setD({ carregando: false, erro: null, chamado: c }))
        .catch((err) => vivo && setD({ carregando: false, erro: err.message, chamado: null }));
      api(`/api/chamado/${item.id}/historico`, corpo)
        .then((itens) => vivo && setH({ carregando: false, erro: null, itens: Array.isArray(itens) ? itens : [] }))
        .catch((err) => vivo && setH({ carregando: false, erro: err.message, itens: [] }));
      return () => { vivo = false; };
    }, [item.id, userToken]);

    useEffect(() => {
      const tecla = (ev) => { if (ev.key === 'Escape' && !document.querySelector('.exu-modal-fundo')) onFechar(); };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }, [onFechar]);

    // painel é um diálogo: o foco entra no Fechar, o Tab não sai para a tela de trás e, ao fechar, volta para quem abriu
    const gavetaRef = useRef(null);
    useEffect(() => {
      const antes = document.activeElement;
      const g = gavetaRef.current;
      const fechar = g && g.querySelector('.exu-gaveta-cab [aria-label="Fechar"]');
      if (fechar) fechar.focus();
      const prender = (ev) => {
        if (ev.key !== 'Tab' || !g || document.querySelector('.exu-modal-fundo')) return; // janela por cima cuida do próprio foco
        const focaveis = Array.from(g.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
          .filter((x) => x.offsetParent !== null);
        if (!focaveis.length) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (!g.contains(document.activeElement)) { ev.preventDefault(); primeiro.focus(); }
        else if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      };
      document.addEventListener('keydown', prender);
      return () => {
        document.removeEventListener('keydown', prender);
        if (antes && antes.focus && document.contains(antes)) antes.focus();
      };
    }, []);

    const c = d.chamado;
    const linha = [];
    if (c) {
      linha.push({ k: 'aberto', em: c.abertoEm, autor: c.requerente, texto: c.descricao, de: 'pedido' });
      c.acompanhamentos.forEach((x, i) => linha.push({ ...x, k: 'acomp' + i, de: 'acomp' }));
      c.solucoes.forEach((x, i) => linha.push({ ...x, k: 'sol' + i, de: 'solucao' }));
    }
    h.itens.forEach((x) => linha.push({ ...x, k: 'exec' + x.id, de: 'exec' }));
    linha.forEach((x) => { x.t = tempo(x.em); });
    linha.sort((a, b) => a.t - b.t);

    function evento(x) {
      if (x.de === 'exec') {
        const sit = { concluido: 'concluido', erro: 'erro', teste: 'pendencia', executando: 'rodando' }[x.status] || '';
        return e('div', { key: x.k, className: 'exu-msg auto ' + (x.status === 'erro' ? 'erro' : x.status === 'concluido' ? 'ok' : 'pergunta') }, [
          e('div', { key: 'm', className: 'exu-msg-meta' }, [Icon('Bot', 13, 'currentColor'), e('b', { key: 'b' }, 'Automação'), ' · ' + ([x.tipo, x.por ? 'aprovado por ' + x.por : null].filter(Boolean).join(' · ') || 'execução') + ' · há ' + tempoRelativo(x.em),
            e('span', { key: 's', className: 'exu-sit ' + sit }, [e('i', { key: 'i' }), (NOME_EXEC[x.status] || x.status) + (x.teste && x.status !== 'teste' ? ' (teste)' : '')])]),
          x.resultado ? e(TextoRecolhivel, { key: 'r', texto: x.resultado, linhas: 6 }) : null,
        ]);
      }
      const ehPedido = x.de === 'pedido';
      return e('div', { key: x.k, className: 'exu-msg' + (x.de === 'solucao' ? ' auto ok' : x.de === 'acomp' ? ' v2c-acomp' : '') }, [
        e('div', { key: 'm', className: 'exu-msg-meta' }, [e('b', { key: 'b' }, x.autor || (ehPedido ? 'Requerente' : 'GLPI')), ' ' + (ehPedido ? 'abriu o chamado' : x.de === 'solucao' ? '· Solução' : '· Acompanhamento') + ' · há ' + tempoRelativo(x.em),
          x.de === 'solucao' ? e('span', { key: 's', className: 'exu-sit concluido' }, [e('i', { key: 'i' }), 'Solucionado']) : null]),
        x.texto ? e(TextoRecolhivel, { key: 't', texto: x.texto, linhas: ehPedido ? 10 : 6 }) : e('p', { key: 't', className: 'v2c-vazio' }, 'Sem texto'),
      ]);
    }

    let conversa;
    if (d.carregando) conversa = e('div', { className: 'v2-carregando' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 16, 'var(--accent)')), 'Lendo o chamado no GLPI…']);
    else if (d.erro) conversa = e('div', { className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), 'Falha ao ler o chamado: ' + d.erro]);
    else {
      conversa = e('div', { className: 'exu-conversa' }, [
        ...linha.map(evento),
        h.carregando ? e('p', { key: 'hc', className: 'exu-msg-espera' }, 'Buscando as execuções da automação…') : null,
        h.erro ? e('p', { key: 'he', className: 'exu-msg-espera', style: { color: 'var(--warn)' } }, 'Falha ao buscar as execuções da automação: ' + h.erro) : null,
        p && p.res && p.res.status === 'pendencia' ? e('p', { key: 'esp', className: 'exu-msg-espera' }, 'Esperando a resposta de ' + (item.requerente || 'quem abriu') + '. Quando chegar, o chamado volta para a fila.') : null,
      ]);
    }

    const titulo = (c && c.titulo) || item.titulo || 'Chamado';
    const link = (c && c.link) || item.link;
    const res = p && p.res;
    const passos = [
      ['Aberto no GLPI', 'há ' + tempoRelativo((c && c.abertoEm) || item.abertoEm) + ' por ' + ((c && c.requerente) || item.requerente || 'quem abriu'), true],
      item.tipoNome ? ['Classificado', item.tipoNome + (item.somenteManual ? ', reconhecido só pela descrição' : '') + (item.ia ? ' · IA ' + Math.round(item.ia.confianca * 100) + '%' : ''), true] : null,
      item.pedirPendencia ? ['Pedido o que falta', 'Falta ' + item.pedirPendencia.faltas.join(' e '), !!res] : null,
      ['Execução', p && p.rodandoEste ? 'Rodando agora' : res ? ({ concluido: 'Solucionado no GLPI', teste: 'Teste concluído', erro: 'Erro: devolutiva no chamado', pendencia: 'Pedido o que falta', repetir: 'Nova tentativa automática', nao_rodou: 'Não executado' }[res.status] || res.status) : item.ultimaExecucao ? 'Última: ' + (NOME_EXEC[item.ultimaExecucao.status] || item.ultimaExecucao.status) + ' · ' + dataBr(item.ultimaExecucao.em) : 'Ainda não rodou', !!res],
    ].filter(Boolean);
    const dl = (pares) => e('dl', { className: 'exu-dl' }, pares.flatMap(([k, v]) => [e('dt', { key: 't' + k }, k), e('dd', { key: 'd' + k }, v)]));

    const rodape = !p ? null : p.rodandoEste
      ? e('div', { key: 'r', className: 'v2-carregando', style: { padding: 0 } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14, 'var(--accent)')), p.ultimaLinha || 'Em execução…'])
      : p.confirmandoEste
        ? e('div', { key: 'cf', className: 'v2c-confirmar' + (p.modoTeste ? '' : ' real'), style: { width: '100%' } }, [
            e('div', { key: 'q' }, p.modoTeste ? 'Rodar em modo teste (não escreve no GLPI)?' : 'Rodar em modo real? O chamado ficará atribuído ao titular do token e será solucionado no GLPI.'),
            e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
              e('button', { key: 'n', type: 'button', className: 'exu-btn', onClick: p.cancelar }, 'Cancelar'),
              e('button', { key: 's', type: 'button', className: 'exu-btn primario', onClick: p.confirmarRodar }, 'Confirmar'),
            ]),
          ])
        : [
            // já solucionado (ou testado) nesta tela e reaberto no GLPI: rodar de novo continua possível, com a confirmação
            e('button', { key: 'r', type: 'button', className: 'exu-btn primario', disabled: !p.pode, onClick: p.pedirRodar }, [Icon(res ? 'RefreshCw' : 'Activity', 14, 'currentColor'), res ? 'Rodar novamente' : 'Rodar']),
            e('button', { key: 'd', type: 'button', className: 'exu-btn', disabled: !!res && res.status === 'concluido', onClick: p.dispensar }, p.dispensado ? 'Voltar para a lista' : 'Não rodar'),
            link ? e('a', { key: 'g', className: 'exu-btn', href: link, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none' }, title: 'Se cair em "sessão expirou", use Copiar link e cole na barra de endereço' }, [Icon('ExternalLink', 14, 'currentColor'), 'Abrir no GLPI']) : null,
          ];

    return ReactDOM.createPortal(e(React.Fragment, null, [
      e('div', { key: 'f', className: 'exu-gaveta-fundo', onClick: onFechar }),
      e('aside', { key: 'g', ref: gavetaRef, className: 'exu-gaveta v3c-gaveta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Chamado #' + item.id }, [
        e('div', { key: 'c', className: 'exu-gaveta-cab' }, [
          e('div', { key: 't', style: { flex: 1, minWidth: 0 } }, [
            e('div', { key: 'l', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
              e('span', { key: 'i', className: 'exc-id' }, '#' + item.id),
              p ? p.selo : e('span', { key: 's', className: 'exu-sit ' + (c && c.status >= 5 ? 'concluido' : 'pendencia') }, [e('i', { key: 'i' }), (c && c.statusNome) || item.statusNome || 'Aberto']),
            ]),
            e('h3', { key: 'h' }, titulo),
          ]),
          e('button', { key: 'x', type: 'button', className: 'exu-btn pequeno', onClick: onFechar, 'aria-label': 'Fechar', title: 'Fechar (Esc)' }, Icon('X', 14)),
        ]),
        e('div', { key: 'b', className: 'exu-gaveta-corpo' }, [
          ...(p ? p.avisos : []),
          p && p.pendente ? e('div', { key: 'pend', className: 'exc-aviso' }, [Icon('AlertCircle', 16, 'var(--warn)'), p.pendente]) : null,
          p ? p.problemas : null,
          e('section', { key: 'i', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Informações'),
            dl([
              ['Tipo', e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
                e('span', { key: 't', className: 'exu-tipo' }, item.tipoNome || 'Sem automação'),
                item.tipoManual ? e('span', { key: 'm', style: { fontSize: 12, color: 'var(--muted)' } }, `escolhido à mão${item.tipoManual.por ? ` por ${item.tipoManual.por}` : ''}`) : null,
                // a regra ou a IA erraram o tipo: troca aqui (vale na lista e na execução) ou volta ao das regras
                p && p.trocarTipo && (p.tipos || []).length ? e('select', {
                  key: 's', className: 'exu-select', 'aria-label': 'Trocar o tipo do chamado', value: '', disabled: !!p.rodandoEste,
                  onChange: (ev) => { if (ev.target.value) p.trocarTipo(ev.target.value); },
                }, [
                  e('option', { key: '', value: '' }, 'Trocar o tipo…'),
                  ...p.tipos.filter((t) => t.chave !== item.tipo).map((t) => e('option', { key: t.chave, value: t.chave }, t.nome)),
                  e('option', { key: 'sem', value: 'sem_automacao' }, 'Sem automação (tirar da lista)'),
                  item.tipoManual ? e('option', { key: 'regra', value: 'regra' }, 'Voltar ao tipo das regras') : null,
                ]) : null,
              ])],
              ['Categoria', (c && c.categoria) || item.categoria || 'Sem categoria'],
              ['Solicitante', (c && c.requerente) || item.requerente || 'Não informado'],
              ['Aberto há', tempoRelativo((c && c.abertoEm) || item.abertoEm) + ' · ' + dataBr((c && c.abertoEm) || item.abertoEm)],
              ['Situação no GLPI', (c && c.statusNome) || item.statusNome || 'Não informado'],
              p ? ['Modo', item.somenteManual ? 'Só manual (confirmação)' : 'Automático ou manual'] : null,
            ].filter(Boolean)),
            link ? e('div', { key: 'cp', style: { marginTop: 10 } }, e('button', { type: 'button', className: 'exu-btn pequeno', onClick: async () => { if (await copiarTexto(link)) { setCopiado(true); setTimeout(() => setCopiado(false), 2500); } } }, [Icon('Copy', 13, 'currentColor'), copiado ? 'Link copiado' : 'Copiar link'])) : null,
          ]),
          // o solicitante respondeu depois da automação (reaberto pedindo ajuste, correção depois de erro): ler antes de rodar
          item.respostas && item.respostas.length ? e('section', { key: 'resp', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Respostas do solicitante depois da automação'),
            item.ajusteIa ? e('div', { key: 'aj', className: 'v2c-aviso', role: 'status' }, `Ajuste pedido (lido pela IA): ${item.ajusteIa.resumo}${item.tipo === 'foto_perfil' && Object.keys(item.ajusteIa.campos || {}).length ? ' Os campos da foto já vêm com a sugestão: confira antes de rodar.' : ''}`) : e('div', { key: 'aj', className: 'v2c-aviso', role: 'status' }, 'Leia as respostas e ajuste os dados antes de rodar: o chamado não roda de novo sozinho.'),
            e('ol', { key: 'l', style: { margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 } }, item.respostas.map((r, i) =>
              e('li', { key: i }, [e('span', { key: 'q', style: { color: 'var(--muted)' } }, dataBr(r.em) + ' · '), r.texto]))),
            p && p.responder ? e('div', { key: 'rp', className: 'exu-campo', style: { marginTop: 12 } }, [
              e('label', { key: 'l', htmlFor: 'resp-' + item.id }, item.respostaSugerida ? 'Resposta que a IA daria (pode editar)' : 'Responder o solicitante'),
              e('textarea', { key: 't', id: 'resp-' + item.id, rows: 4, maxLength: 2000, value: resposta, placeholder: 'Ex.: Vamos refazer a foto com o nome certo. Assim que ficar pronta, a solução chega aqui.', onChange: (ev) => setResposta(ev.target.value) }),
              e('div', { key: 'b', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 } }, [
                e('button', { key: 'r', type: 'button', className: 'exu-btn', disabled: envio.enviando || !resposta.trim(), onClick: responder }, envio.enviando ? 'Enviando…' : 'Responder no chamado'),
                e('span', { key: 'd', className: 'exu-campo-ajuda', style: { margin: 0 } }, 'Só manda a resposta e deixa o chamado Pendente; não roda a automação.'),
              ]),
              envio.msg ? e('p', { key: 'ok', role: 'status', className: 'exu-campo-ajuda' }, envio.msg) : null,
              envio.erro ? e('p', { key: 'er', role: 'alert', className: 'exu-campo-erro' }, envio.erro) : null,
            ]) : null,
          ]) : null,
          p && p.detalhes ? e('section', { key: 'l', className: 'exu-bloco' }, [e('h4', { key: 'h' }, 'O que a automação leu'), p.detalhes]) : null,
          item.ia ? e('section', { key: 'ia', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Opinião da IA local'),
            e('div', { key: 't', style: { fontSize: 13 } }, item.reabertoIa ? item.reabertoIa.aviso || `Reaberto com outro pedido (${item.reabertoIa.tipoNovoNome}); rodar encerra o chamado explicando.` : item.ia.concorda ? 'Concorda com a regra' + (item.validadoPorIa ? '; liberado para o automático.' : '.') : item.ia.sugerido ? `Sugere ${item.ia.sugeridoNome}${item.ia.motivo ? ': ' + item.ia.motivo.replace(/[.]+$/, '') : ''}. Vale a regra (${item.tipoNome}); se a IA estiver certa, troque o tipo acima.` : `${item.ia.aplicar === 'auto' ? 'Trocou o tipo para' : 'Sugere'} ${item.tipoNome || 'sem automação'}${item.ia.motivo ? ': ' + item.ia.motivo.replace(/[.]+$/, '') : ''}.`),
            e('div', { key: 'm', className: 'exu-medidor', role: 'meter', 'aria-valuenow': Math.round(item.ia.confianca * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Confiança da IA' }, e('div', { style: { width: Math.round(item.ia.confianca * 100) + '%' } })),
            e('div', { key: 'p', style: { fontSize: 12, color: 'var(--muted)', marginTop: 4 } }, 'Confiança de ' + Math.round(item.ia.confianca * 100) + '%'),
          ]) : null,
          res ? e('section', { key: 'res', className: 'exu-bloco' }, [e('h4', { key: 'h' }, 'Resultado nesta tela'), p.resultado]) : null,
          // texto que a IA escreveu para o chamado (Administração > IA > texto pela IA); em teste, o que seria escrito
          // o texto que foi (ou, em teste, iria) para o chamado, escrito pela IA ou o texto fixo
          res && (res.resposta || res.respostaIa) ? e('section', { key: 'ria', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, `${res.status === 'teste' ? 'Resposta que iria para o GLPI' : 'Resposta no GLPI'} (${res.respostaIa ? 'escrita pela IA' : 'texto fixo'})`),
            e('p', { key: 't', className: 'v1-resposta-ia' }, res.respostaIa || res.resposta),
          ]) : null,
          e('section', { key: 'cv', className: 'exu-bloco' }, [e('h4', { key: 'h' }, 'Conversa no chamado'), conversa]),
          e('section', { key: 'lt', className: 'exu-bloco' }, [
            e('h4', { key: 'h' }, 'Andamento'),
            e('ol', { key: 'o', className: 'exu-linha-tempo' }, passos.map(([t, dsc, feito]) => e('li', { key: t, className: feito ? 'feito' : '' }, [t, e('small', { key: 's' }, dsc)]))),
            p && p.ultima ? e('div', { key: 'u', style: { marginTop: 8 } }, p.ultima) : null,
          ]),
        ]),
        rodape ? e('div', { key: 'p', className: 'exu-gaveta-pe' }, rodape) : null,
      ]),
    ]), document.body);
  }

  // ---------- Aba ----------
  function ChamadosView() {
    const [acessos, setAcessos] = useState(Hub.ler);
    // a lista vem do cache (pré-carga): ao montar já mostra o que existir; `setLista` só acompanha o cache
    const [lista, setLista] = useState(listaDoCache(Cache.store.estado()));
    const [filtroEntidade, setFiltroEntidade] = useState(''); // '' = todas
    const [dispensados, setDispensados] = useState(() => ler(KEY_DISPENSADOS, []));
    const [verOutros, setVerOutros] = useState(false);
    const [modoTeste, setModoTeste] = useState(() => ler(KEY_MODO_TESTE, true));
    const [escolhas, setEscolhas] = useState({}); // id -> { dataInicial, dataFinal, roleId, loginSga, empresasCrm }
    const [confirmando, setConfirmando] = useState(null);
    // várias execuções ao mesmo tempo: jobId -> { jobId, ids, linhas, fim }
    const [execucoes, setExecucoes] = useState({});
    const [resultados, setResultados] = useState({});
    const [mensagensGerais, setMensagensGerais] = useState([]);
    const [logsAbertos, setLogsAbertos] = useState({});
    const [confirmandoTodos, setConfirmandoTodos] = useState(false);
    // Modo automático: com a chave ligada, roda sozinho os chamados prontos, até "limite" por vez
    // (a escolha de "tipos que rodam sozinhos" foi retirada: o que estiver guardada dela é ignorado)
    const [auto, setAuto] = useState(() => { const guardado = { ...ler(KEY_AUTO, {}) }; delete guardado.fora; return { limite: 5, ...guardado, ativo: false }; });
    const [confirmandoAuto, setConfirmandoAuto] = useState(false);
    const [erroAuto, setErroAuto] = useState('');
    const [computadoresAuto, setComputadoresAuto] = useState([]); // nomes de quem está com o automático ligado (todos os computadores)
    const [ultimoAuto, setUltimoAuto] = useState(null); // última rodada deste computador: { hora, quantos }
    const [filaWhatsapp, setFilaWhatsapp] = useState(0); // pedidos do WhatsApp esperando alguém abrir o chamado
    const [verChamado, setVerChamado] = useState(null); // chamado aberto no painel "Ver chamado"
    const [linkCopiado, setLinkCopiado] = useState(null); // id do chamado cujo link acabou de ser copiado
    const copiarLink = async (item) => {
      if (await copiarTexto(item.link)) {
        setLinkCopiado(item.id);
        setTimeout(() => setLinkCopiado((x) => (x === item.id ? null : x)), 2500);
      }
    };
    const [verificadoEm, setVerificadoEm] = useState(null); // última vez que o servidor respondeu "mudou?" (a cada 3 s)
    const autoRef = useRef(new Set()); // chamados que o automático já tentou nesta tela (não repete, mesmo com erro)
    const mudarAuto = (campos) => setAuto((a) => {
      const n = { ...a, ...campos };
      gravar(KEY_AUTO, { limite: n.limite });
      return n;
    });
    const fontesRef = useRef(new Map());
    const assinaturaRef = useRef(''); // assinatura dos chamados abertos na última atualização
    const rodandoAlgo = Object.values(execucoes).some((x) => !x.fim);
    const execDoChamado = (id) => Object.values(execucoes).find((x) => !x.fim && x.ids.includes(id)) || null;
    const pronto = !!acessos.pronto;
    const mostrarEntidade = lista.entidades.length > 1; // com uma entidade só nada novo aparece
    const entidadeAtiva = mostrarEntidade && lista.entidades.includes(filtroEntidade) ? filtroEntidade : '';

    // salvo em "Meus acessos" (cabeçalho), no botão "Acessos" daqui ou em outra aba
    useEffect(() => Hub.aoMudar(setAcessos), []);

    // acompanha o cache: pré-carga, lista guardada, lista nova e erro chegam por aqui
    useEffect(() => {
      const aplicar = (s) => { assinaturaRef.current = s.assinatura || ''; setLista(listaDoCache(s)); };
      aplicar(Cache.store.estado());
      return Cache.store.assinar(aplicar);
    }, []);

    // uma busca por vez, no cache (a mesma da pré-carga); a assinatura conhecida vai junto
    const buscar = useCallback(() => Cache.store.buscar(), []);

    // ao entrar só busca se a lista não for fresca (a pré-carga já costuma ter trazido); depois, polling leve
    useEffect(() => {
      if (!pronto) return undefined;
      Cache.store.garantir();
      // a cada 3 s (o webhook do GLPI só chega a cada ~1 min) só pergunta ao servidor se algo mudou no GLPI (1 busca
      // leve de ~0,2 s) e recarrega a lista inteira só se mudou: chamado aberto aparece em 1 a 4 s. Com a aba escondida
      // não pergunta, nunca duas perguntas ao mesmo tempo (GLPI lento não empilha) e, por segurança, recarrega tudo a
      // cada ~5 min mesmo sem mudança
      let volta = 0;
      let perguntando = false;
      const t = setInterval(async () => {
        if (fontesRef.current.size || document.hidden || perguntando) return;
        volta++;
        perguntando = true;
        try {
          const m = await api('/api/mudou', { glpi: { userToken: acessos.userToken } });
          setVerificadoEm(new Date());
          if (volta % 100 === 0 || m.assinatura !== assinaturaRef.current) buscar();
        } catch {
          // servidor fora por um instante: tenta de novo no próximo ciclo
        } finally {
          perguntando = false;
        }
      }, 3000);
      return () => clearInterval(t);
    }, [pronto, buscar, acessos.userToken]);
    useEffect(() => () => fontesRef.current.forEach((f) => f.close()), []);

    const escolha = (item) => {
      const atual = escolhas[item.id] || {};
      return {
        dataInicial: atual.dataInicial || (item.periodo && item.periodo.dataInicial),
        dataFinal: atual.dataFinal || (item.periodo && item.periodo.dataFinal),
        roleId: atual.roleId || (item.usuario && item.usuario.roleSugerido) || '',
        extrasAlt: atual.extrasAlt || (item.altStatus ? item.altStatus.secundarias.filter((b) => b.citada).map((b) => b.chave) : []),
        baseCrm: atual.baseCrm !== undefined ? atual.baseCrm : (item.baseCrm && (item.baseCrm.pedida || item.baseCrm.principal)) || '',
        cooperativa: atual.cooperativa !== undefined ? atual.cooperativa : (item.cooperativa && (item.cooperativa.exata || (item.cooperativa.sugestoes.length === 1 ? item.cooperativa.sugestoes[0] : ''))) || '',
        fotoLista: atual.fotoLista !== undefined ? atual.fotoLista : item.foto && item.foto.multi ? item.foto.fotos.map((x) => `${x.nome} | ${x.departamento}`).join('\n') : '',
        // ajuste pedido nas respostas (lido pela IA): os campos já vêm com o que o solicitante pediu; a pessoa confere
        fotoNome: atual.fotoNome !== undefined ? atual.fotoNome : (item.ajusteIa && item.foto && item.foto.sugestaoNome) || '',
        fotoDepartamento: atual.fotoDepartamento !== undefined ? atual.fotoDepartamento : (item.ajusteIa && item.foto && item.foto.sugestaoDepartamento) || '',
        loginSga: atual.loginSga !== undefined ? atual.loginSga : (item.usuario && item.usuario.loginSugerido) || '',
        empresasCrm: atual.empresasCrm || (item.associacaoUsuario ? item.associacaoUsuario.empresasCrm : []), // padrão: todas as bases (uma para cada)
      };
    };
    const mudarEscolha = (id, campos) => setEscolhas((x) => ({ ...x, [id]: { ...(x[id] || {}), ...campos } }));

    /** O que ainda falta escolher no card pra poder rodar. */
    function falta(item) {
      if (ehSenhaSga(item)) return bloqueioSenha(item, (chave) => !!loginDaEmpresa(acessos.sgas, chave));
      if (item.altStatus) {
        const precisaSga = item.altStatus.bases.some((b) => b.temSga);
        if (precisaSga && (!item.empresaSga || !loginDaEmpresa(acessos.sgas, item.empresaSga.chave))) {
          return `Marque ${item.empresaSga ? item.empresaSga.nome : item.categoria} em um login do SGA (Acessos)`;
        }
        return null;
      }
      if (item.tipo === 'fechamento') {
        return item.empresa && !loginDaEmpresa(acessos.sgas, item.empresa.chave) ? `Marque ${item.empresa.nome} em um login do SGA (Acessos)` : null;
      }
      if (item.tipo === 'erro_exportar_modelo') {
        if (!item.empresaSga || !loginDaEmpresa(acessos.sgas, item.empresaSga.chave)) return `Marque ${item.empresaSga ? item.empresaSga.nome : item.categoria} em um login do SGA (Acessos)`;
        return acessos.crm && acessos.crm.usuario && acessos.crm.senha ? null : 'Configure o login do PowerCRM (Acessos)';
      }
      if (item.tipo === 'cadastro_modelo') {
        return !item.empresaSga || !loginDaEmpresa(acessos.sgas, item.empresaSga.chave) ? `Marque ${item.empresaSga ? item.empresaSga.nome : item.categoria} em um login do SGA (Acessos)` : null;
      }
      if (item.tipo === 'cadastro_consultor') {
        return item.cooperativa && !escolha(item).cooperativa ? `Escolha a cooperativa do SGA (o chamado diz "${item.cooperativa.informada}")` : null;
      }
      if (item.tipo === 'foto_perfil' && item.foto) {
        const c = escolha(item);
        if (item.foto.multi) {
          const linhas = c.fotoLista.split('\n').map((l) => l.trim()).filter(Boolean);
          const padrao = item.foto.fotos.map((x) => `${x.nome} | ${x.departamento}`).join('\n');
          if (!linhas.length || linhas.some((l) => !l.split('|')[0].trim() || !(l.split('|')[1] || '').trim())) return 'Cada linha da lista precisa de Nome | DEPARTAMENTO';
          if (item.foto.fotos.some((x) => x.duvida) && c.fotoLista === padrao) return 'Confira a lista de fotos: há linhas em dúvida';
          return null;
        }
        if (item.foto.duvidaNome && !c.fotoNome.trim()) return 'Informe o nome da foto';
        if (item.foto.duvidaDepto && !c.fotoDepartamento.trim()) return 'Informe o departamento da foto';
        return null;
      }
      if (item.tipo !== 'cadastro_usuario') return null;
      const c = escolha(item);
      if (item.usuario.sistema === 'SGA' && (!item.empresaSga || !loginDaEmpresa(acessos.sgas, item.empresaSga.chave))) {
        return `Marque ${item.empresaSga ? item.empresaSga.nome : item.categoria} em um login do SGA (Acessos)`;
      }
      if (!c.roleId) return 'Escolha o perfil';
      if (item.usuario.sistema === 'SGA' && !c.loginSga.trim()) return 'Informe o login do SGA';
      if (item.usuario.sistema === 'SGA' && !acessos.senhaPadrao) return 'Configure a senha padrão em Acessos';
      if (item.usuario.sistema === 'CRM' && !c.empresasCrm.length) return 'Escolha a base do PowerCRM';
      return null;
    }

    // `manual`: execução pedida por clique em UM chamado (único caso que envia `confirmado`)
    async function rodar(itensParaRodar, { manual = false } = {}) {
      setConfirmando(null);
      setConfirmandoTodos(false);
      if (lista.guardado) return; // nunca roda em cima da lista guardada (pode estar desatualizada)
      const ids = itensParaRodar.map((x) => x.id);
      try {
        const d = await api('/api/executar', {
          glpi: { userToken: acessos.userToken },
          quem: lista.usuario && lista.usuario.nome,
          sgas: acessos.sgas.filter((l) => l.usuario && l.senha).map((l) => ({ ...l, empresas: Hub.chavesDoLogin(l) })),
          crm: acessos.crm,
          senhaPadrao: acessos.senhaPadrao,
          modoTeste,
          itens: itensParaRodar.map((item) => {
            const c = escolha(item);
            return montarPedidoItem(item, { manual, campos: { dataInicial: c.dataInicial, dataFinal: c.dataFinal, roleId: c.roleId ? Number(c.roleId) : undefined, loginSga: c.loginSga, empresasCrm: c.empresasCrm, fotoLista: item.foto && item.foto.multi ? c.fotoLista : undefined, fotoNome: item.foto && item.foto.duvidaNome ? c.fotoNome : undefined, fotoDepartamento: item.foto && item.foto.duvidaDepto ? c.fotoDepartamento : undefined, cooperativa: c.cooperativa || undefined, baseCrm: c.baseCrm || undefined, extrasAlt: item.altStatus && item.altStatus.secundarias.length ? c.extrasAlt : undefined } });
          }),
        });
        const jobId = d.jobId;
        // chamados que já estavam rodando em outra execução (outro computador): não rodam aqui
        const ign = new Map((d.ignorados || []).map((i) => [i.id, i.por]));
        if (ign.size) setResultados((r) => ({ ...r, ...Object.fromEntries([...ign].map(([id, por]) => [id, { ok: false, status: 'nao_rodou', texto: `Já estava em execução em outra sessão${por ? ` (${por})` : ''}. Atualize a lista para ver o resultado.` }])) }));
        ids.splice(0, ids.length, ...ids.filter((x) => !ign.has(x)));
        const mudar = (fn) => setExecucoes((ex) => (ex[jobId] ? { ...ex, [jobId]: fn(ex[jobId]) } : ex));
        setExecucoes((ex) => ({ ...ex, [jobId]: { jobId, ids, linhas: [], fim: null } }));
        const fonte = new EventSource(`${SERVICO}/api/logs/${jobId}`);
        fontesRef.current.set(jobId, fonte);
        const fechar = () => {
          fonte.close();
          fontesRef.current.delete(jobId);
        };
        fonte.onmessage = (ev) => {
          const p = JSON.parse(ev.data);
          if (p.type === 'log') mudar((x) => ({ ...x, linhas: [...x.linhas, p.msg].slice(-400) }));
          else if (p.type === 'resultado') {
            setResultados((r) => ({ ...r, [p.item.id]: p.item }));
            // falha momentânea (IA): o automático pode pegar de novo quando chegar a hora
            if (p.item.status === 'repetir') {
              autoRef.current.delete(p.item.id);
              setTimeout(() => setTentativaAuto((x) => x + 1), Math.max(1000, Date.parse(p.item.repetirEm) - Date.now() + 500));
            }
          }
          else if (p.type === 'done') {
            fechar();
            mudar((x) => ({ ...x, fim: p }));
            if (p.mensagensGerais && p.mensagensGerais.length) setMensagensGerais((m) => [...p.mensagensGerais, ...m].slice(0, 10));
            if (!fontesRef.current.size) buscar();
          }
        };
        fonte.onerror = () => {
          if (fonte.readyState === EventSource.CLOSED) {
            fechar();
            mudar((x) => ({ ...x, fim: x.fim || { error: 'conexão com o serviço interrompida' } }));
          }
        };
      } catch (err) {
        setResultados((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, { ok: false, status: 'erro', texto: `Falha ao iniciar: ${err.message}` }])) }));
      }
    }

    function dispensar(id, sim) {
      const novo = sim ? [...new Set([...dispensados, id])] : dispensados.filter((x) => x !== id);
      setDispensados(novo);
      gravar(KEY_DISPENSADOS, novo);
    }

    /** Registra este computador no automático (vários podem estar ligados; o servidor limita e reserva chamado a chamado) e liga. */
    async function ligarAuto() {
      try {
        await api('/api/auto/assumir', { clienteId: CLIENTE_ID, quem: lista.usuario && lista.usuario.nome });
        setErroAuto('');
        mudarAuto({ ativo: true });
        // avisa quantos computadores (pessoas) estão no automático agora, este incluído
        const nomes = await api('/api/auto').then((x) => (x.computadores || []).map((c) => c.por)).catch(() => null);
        if (nomes) { setComputadoresAuto(nomes); avisar('Modo automático ligado. ' + window.ChamadosAuto.descreverAuto({ computadores: nomes, limite: auto.limite }).computadores, 'ok'); }
      } catch (err) {
        setErroAuto(err.message);
        mudarAuto({ ativo: false });
      }
    }
    // com o automático ligado: renova a presença a cada 30 s (se o servidor recusar, desliga); ao desligar/fechar, solta e libera as reservas
    useEffect(() => {
      if (!auto.ativo) return undefined;
      const atualizarComputadores = () => api('/api/auto').then((x) => setComputadoresAuto((x.computadores || []).map((c) => c.por))).catch(() => { /* sem resposta: mantém a contagem anterior */ });
      const renovar = () => api('/api/auto/assumir', { clienteId: CLIENTE_ID, quem: lista.usuario && lista.usuario.nome }).then(atualizarComputadores).catch((err) => {
        if (/^HTTP|Failed|NetworkError/.test(err.message)) return; // servidor fora um instante: tenta de novo
        setErroAuto(err.message);
        mudarAuto({ ativo: false });
      });
      atualizarComputadores();
      const t = setInterval(renovar, 30000);
      const soltar = () => { try { fetch(SERVICO + '/api/auto/soltar', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: CLIENTE_ID }) }); } catch { /* sem rede */ } };
      window.addEventListener('beforeunload', soltar);
      return () => { clearInterval(t); window.removeEventListener('beforeunload', soltar); soltar(); };
    }, [auto.ativo]); // eslint-disable-line
    // quem está no automático (todos os computadores), mesmo com a chave deste desligada: aparece ao lado da chave
    useEffect(() => {
      if (!pronto) return undefined;
      const ler = () => { if (!document.hidden) api('/api/auto').then((x) => setComputadoresAuto((x.computadores || []).map((c) => c.por))).catch(() => { /* sem resposta: mantém a contagem anterior */ }); };
      ler();
      const t = setInterval(ler, 30000);
      return () => clearInterval(t);
    }, [pronto, auto.ativo]);

    // Robô do WhatsApp: com o automático ligado, este navegador também abre os chamados que chegaram pelos grupos
    // (fila no Hub). O chamado é aberto com o token de quem está com o automático e o requerente do pedido; depois o
    // próprio automático o executa como qualquer outro. Falha de rede aqui não atrapalha o resto da tela.
    useEffect(() => {
      if (!auto.ativo || !pronto || !acessos.userToken) return undefined;
      let vivo = true;
      let ocupado = false;
      const cabecalho = { 'Content-Type': 'application/json', 'X-Glpi-Token': acessos.userToken };
      const puxar = async () => {
        if (ocupado || document.hidden) return;
        ocupado = true;
        try {
          const r = await fetch('/api/whatsapp/fila', { headers: cabecalho, cache: 'no-store' });
          if (!r.ok) return;
          const fila = await r.json();
          if (vivo) setFilaWhatsapp(fila.length);
          let abertos = 0;
          for (const p of fila) {
            if (!vivo) break;
            const ab = await fetch(`/api/whatsapp/fila/${p.id}/abrir`, { method: 'POST', headers: cabecalho }).catch(() => null); // 409 = outro computador pegou
            if (ab && ab.ok) abertos += 1;
          }
          if (vivo) setFilaWhatsapp(Math.max(0, fila.length - abertos));
        } catch {
          // Hub fora do ar um instante: tenta na próxima volta
        } finally {
          ocupado = false;
        }
      };
      puxar();
      const t = setInterval(puxar, 10000);
      return () => { vivo = false; clearInterval(t); setFilaWhatsapp(0); };
    }, [auto.ativo, pronto, acessos.userToken]); // eslint-disable-line

    // Avisa o Hub quando uma automação termina um chamado (o robô do WhatsApp reage ou responde no grupo). Só vale para
    // chamados abertos pelo robô; para os outros o Hub responde que não há pedido e nada acontece. Resultado de teste não conta.
    const avisadosRef = useRef(new Set());
    useEffect(() => {
      if (!acessos.userToken) return;
      for (const [id, r] of Object.entries(resultados)) {
        if (!r || avisadosRef.current.has(id) || !['concluido', 'erro', 'nao_rodou'].includes(r.status)) continue;
        avisadosRef.current.add(id);
        fetch('/api/whatsapp/resultado', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Glpi-Token': acessos.userToken },
          body: JSON.stringify({ ticketId: Number(id), ok: r.status === 'concluido' && r.ok !== false, texto: String(r.texto || '').slice(0, 300) }),
        }).catch(() => { /* aviso ao WhatsApp é melhor esforço: o resultado já está na tela e no GLPI */ });
      }
    }, [resultados, acessos.userToken]); // eslint-disable-line

    // Automático: a cada atualização da lista (e quando uma execução termina), pega a sua parte, até
    // "limite" chamados prontos de uma vez. Pula: com pendência, dispensados,
    // já tentados aqui e os que deram erro na última execução (esses voltam
    // só no "Rodar novamente", pra não ficar repetindo o mesmo erro).
    // Com vários computadores no automático, cada um pega a SUA parte (a divisão dos prontos pelos computadores ligados, até o
    // limite) e o que ficou com outro computador é tentado de novo de 15 em 15 s, sem depender de a lista mudar.
    const [tentativaAuto, setTentativaAuto] = useState(0);
    const novaTentativaRef = useRef(null);
    useEffect(() => () => clearTimeout(novaTentativaRef.current), []);
    useEffect(() => {
      if (!auto.ativo || !pronto || lista.carregando || lista.guardado || rodandoAlgo) return;
      // `lote` = TODOS os prontos, na ordem da lista; a parte deste computador é decidida na reserva (max)
      const lote = lista.itens
        .filter((i) => !i.problemas.length && !dispensados.includes(i.id) && !autoRef.current.has(i.id) && (!resultados[i.id] || horaDeRepetir(resultados[i.id].status === 'repetir' && resultados[i.id].repetirEm)) && !execDoChamado(i.id) && !falta(i) && !deveExcluirDoAutomatico(i) && !(i.usuario && i.usuario.daPlanilha) && !(i.foto && i.foto.multi)
          && !(i.ultimaExecucao && ['erro', 'executando'].includes(i.ultimaExecucao.status) && !(i.repetirIa && horaDeRepetir(i.repetirIa.em))));
      if (!lote.length) return;
      lote.forEach((i) => autoRef.current.add(i.id));
      // Vários computadores podem estar no automático: antes de rodar, RESERVA no servidor (atômico) os chamados deste lote.
      // O que outro computador já pegou é descartado aqui. Se o controle (Redis) estiver fora do ar, o automático para.
      (async () => {
        const nome = lista.usuario && lista.usuario.nome;
        try {
          // quantos computadores estão no automático: cada um pega a sua parte (com 1 computador, pega até o limite como sempre)
          const quantos = await api('/api/auto').then((x) => Math.max(1, Number(x.quantos) || 1)).catch(() => 1);
          const quero = Math.min(auto.limite, Math.ceil(lote.length / quantos));
          const reservar = () => api('/api/auto/reservar', { clienteId: CLIENTE_ID, ids: lote.map((i) => i.id), max: quero });
          let r;
          try {
            r = await reservar();
          } catch (err) {
            if (!/^Assuma/.test(err.message)) throw err;
            await api('/api/auto/assumir', { clienteId: CLIENTE_ID, quem: nome }); // o servidor reiniciou e esqueceu este computador
            r = await reservar();
          }
          const meus = lote.filter((i) => r.reservados.includes(i.id));
          lote.filter((i) => !r.reservados.includes(i.id)).forEach((i) => autoRef.current.delete(i.id)); // com outro computador (ou fora da minha parte): reavalia depois
          if (lote.length > meus.length) {
            clearTimeout(novaTentativaRef.current);
            novaTentativaRef.current = setTimeout(() => setTentativaAuto((x) => x + 1), 15000);
          }
          if (meus.length) {
            setUltimoAuto({ hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), quantos: meus.length });
            rodar(meus);
          }
        } catch (err) {
          lote.forEach((i) => autoRef.current.delete(i.id));
          setErroAuto(err.message);
        }
      })();
    }, [auto, pronto, lista.carregando, lista.guardado, lista.itens, rodandoAlgo, resultados, dispensados, tentativaAuto]); // eslint-disable-line

    // ---------- v2: estado só da tela nova (visões, busca, seleção, painel e confirmações) ----------
    const [visao, setVisao] = useState(() => ler('arxhub_v3_chamados_visao', 'disponiveis'));
    const [busca, setBusca] = useState('');
    const [tipoSel, setTipoSel] = useState('');
    const [exibir, setExibir] = useState(() => ler('arxhub_v3_chamados_exibir', 'lista'));
    const [marcados, setMarcados] = useState([]);
    const [aberto, setAberto] = useState(null); // id do chamado no painel lateral
    const [confirmar, setConfirmar] = useState(null); // { itens, manual, titulo }
    const [catSel, setCatSel] = useState('');
    const [ordem, setOrdem] = useState('recentes');
    const [pagina, setPagina] = useState(0);
    const [cabe, setCabe] = useState({ lista: 10, cartoes: 9 });
    const [motivos, setMotivos] = useState(() => ler('arxhub_v3_motivos', {})); // motivo do "Não rodar" (só neste navegador)
    const [motivoDispensa, setMotivoDispensa] = useState('Já resolvido por outra pessoa');
    const [avisar, avisos] = window.ExemploUI.useAvisos();
    const corpoRef = useRef(null);
    const trocarVisao = (v) => { setVisao(v); gravar('arxhub_v3_chamados_visao', v); setMarcados([]); setPagina(0); };
    const trocarExibir = (v) => { setExibir(v); gravar('arxhub_v3_chamados_exibir', v); setPagina(0); };
    // quantas linhas (lista) ou cartões cabem na janela, como no Hub de exemplo
    useEffect(() => {
      const medir = () => {
        const corpo = corpoRef.current;
        if (!corpo) return;
        const sobra = window.innerHeight - corpo.getBoundingClientRect().top - 90;
        const colunas = Math.max(1, Math.floor((corpo.clientWidth + 12) / (300 + 12)));
        setCabe({ lista: Math.max(5, Math.floor((sobra - 38) / 60)), cartoes: colunas * Math.max(1, Math.floor((sobra + 12) / (188 + 12))) });
      };
      medir();
      window.addEventListener('resize', medir);
      // a aba monta escondida (largura zero) para contar os prontos: mede de novo quando aparece
      const obs = corpoRef.current && 'ResizeObserver' in window ? new ResizeObserver(medir) : null;
      if (obs) obs.observe(corpoRef.current);
      return () => { window.removeEventListener('resize', medir); if (obs) obs.disconnect(); };
    }, [exibir, pronto, auto.ativo, modoTeste]);

    // a aba Chamados da moldura mostra quantos estão prontos (app.js ouve o evento); o número é calculado mais abaixo
    const prontosRef = useRef(0);
    const avisadoRef = useRef(-1);
    useEffect(() => {
      if (avisadoRef.current === prontosRef.current) return;
      avisadoRef.current = prontosRef.current;
      window.dispatchEvent(new CustomEvent('arx-chamados-prontos', { detail: prontosRef.current }));
    });

    if (!pronto) {
      prontosRef.current = 0;
      return e('div', { className: 'exu-tela' }, e(Hub.EditorAcessos, { exigirChamados: true, moldura: 'card' }));
    }

    // Situação de um chamado na tela (texto e cor do selo; também decide em que visão ele aparece).
    function situacao(item) {
      const res = resultados[item.id];
      if (execDoChamado(item.id)) return 'rodando';
      if (res) return { concluido: 'concluido', teste: 'teste', pendencia: 'pendencia', repetir: 'repetir', nao_rodou: 'nao_rodou' }[res.status] || 'erro';
      if (dispensados.includes(item.id)) return 'dispensado';
      if (item.problemas.length) return 'manual';
      if (lista.guardado || falta(item)) return 'falta';
      if (deveExcluirDoAutomatico(item)) return 'confirmar';
      return 'pronto';
    }
    const SIT = {
      pronto: ['pronto', 'Pronto para rodar'], falta: ['pendencia', 'Falta escolher'], confirmar: ['pendencia', 'Confirmação manual'], manual: ['sem_automacao', 'Análise manual'],
      dispensado: ['', 'Não rodar'], rodando: ['rodando', 'Rodando'], concluido: ['concluido', 'Solucionado'], teste: ['pendencia', 'Teste'], erro: ['erro', 'Erro'],
      pendencia: ['pendencia', 'Pedido o que falta'], repetir: ['pendencia', 'Nova tentativa'], nao_rodou: ['pendencia', 'Não executado'],
    };
    const selo = (item) => { const s = SIT[situacao(item)]; return e('span', { className: 'exu-sit ' + s[0] }, [e('i', { key: 'i' }), s[1]]); };

    // ---------- partes do chamado (as mesmas do card do Hub atual): detalhes com as escolhas, avisos e ações ----------
    function partes(item) {
      const res = resultados[item.id];
      const execEste = execDoChamado(item.id);
      const rodandoEste = !!execEste;
      const c = escolha(item);
      const pendente = item.problemas.length ? null : lista.guardado ? TEXTO_AGUARDANDO : falta(item);
      const pode = !item.problemas.length && !pendente;
      const campoTela = (rotulo, filho, k) => e('div', { key: k || rotulo, className: 'exu-campo' }, [e('label', { key: 'l' }, rotulo), filho]);

      let detalhes = null;
      if (item.tipo === 'fechamento' && item.periodo) {
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('div', { key: 'p' }, [e('strong', { key: 's' }, item.periodo.rotulo), e('span', { key: 'o', style: { color: 'var(--muted)' } }, ' · ' + item.periodo.origem)]),
          e('div', { key: 'd', className: 'exu-duas-col' }, ['dataInicial', 'dataFinal'].map((k) =>
            campoTela(k === 'dataInicial' ? 'Data inicial' : 'Data final', e('input', { type: 'date', value: c[k] || '', onChange: (ev) => mudarEscolha(item.id, { [k]: ev.target.value }) }), k))),
        ]);
      } else if (item.tipo === 'foto_perfil' && item.foto && item.foto.multi) {
        const f = item.foto;
        const duvidosas = f.fotos.filter((x) => x.duvida);
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('div', { key: 'r' }, [e('strong', { key: 'n' }, f.fotos.length + ' fotos de perfil'), e('span', { key: 'd', style: { color: 'var(--muted)' } }, ' neste chamado (uma arte por pessoa, todas anexadas)')]),
          e('div', { key: 'p', className: 'v2c-aviso' }, 'Várias fotos: não roda no automático. Confira a lista abaixo (uma pessoa por linha: Nome | DEPARTAMENTO).'),
          duvidosas.length ? e('div', { key: 'm', className: 'v2c-aviso' }, duvidosas.map((x) => `${x.nome}: ${x.motivos.join('; ')}`).join(' · ') + '. Edite a lista para liberar.') : null,
          campoTela('Lista de fotos', e('textarea', { rows: Math.min(10, f.fotos.length + 1), value: c.fotoLista, onChange: (ev) => mudarEscolha(item.id, { fotoLista: ev.target.value }) }), 'lista'),
        ]);
      } else if (item.tipo === 'foto_perfil' && item.foto) {
        const f = item.foto;
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('div', { key: 'r' }, [
            e('strong', { key: 'n' }, f.duvidaNome ? '(nome a informar)' : f.nome),
            e('span', { key: 'd', style: { color: 'var(--muted)' } }, ' · ' + (f.duvidaDepto ? '(departamento a informar)' : f.departamento)),
            !f.duvidaDepto && f.departamentoOrigem === 'planilha' ? e('span', { key: 'o', style: { color: 'var(--muted)' } }, ' (pela lista de funcionários)') : null,
          ]),
          e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Gera a foto de perfil (arte com nome e departamento), anexa no chamado e soluciona.'),
          (f.duvidaNome || f.duvidaDepto) && f.motivos.length ? e('div', { key: 'm', className: 'v2c-aviso' }, 'Há dúvida (não roda no automático): ' + f.motivos.join('; ') + '. Preencha abaixo.') : null,
          f.outraPessoa && !f.duvidaDepto ? e('div', { key: 'o2', className: 'v2c-aviso' }, 'A foto é para outra pessoa, não o solicitante.') : null,
          f.duvidaNome ? campoTela('Nome na foto', e('div', { className: 'v2c-com-sugestao' }, [
            e('input', { key: 'i', value: c.fotoNome, placeholder: f.analista ? 'Analista 4' : 'Primeiro e último nome', onChange: (ev) => mudarEscolha(item.id, { fotoNome: ev.target.value }) }),
            f.sugestaoNome && !c.fotoNome ? e('button', { key: 's', type: 'button', className: 'exu-btn pequeno', onClick: () => mudarEscolha(item.id, { fotoNome: f.sugestaoNome }) }, 'Usar: ' + f.sugestaoNome) : null,
          ]), 'nome') : null,
          f.duvidaDepto ? campoTela('Departamento na foto (MAIÚSCULO)', e('div', { className: 'v2c-com-sugestao' }, [
            e('input', { key: 'i', value: c.fotoDepartamento, placeholder: 'Ex.: CENTRAL DE RELACIONAMENTO', onChange: (ev) => mudarEscolha(item.id, { fotoDepartamento: ev.target.value.toUpperCase() }) }),
            f.sugestaoDepartamento && !c.fotoDepartamento ? e('button', { key: 's', type: 'button', className: 'exu-btn pequeno', onClick: () => mudarEscolha(item.id, { fotoDepartamento: f.sugestaoDepartamento }) }, 'Usar: ' + f.sugestaoDepartamento) : null,
          ]), 'dep') : null,
        ]);
      } else if (item.tipo === 'senha_sistemas' || ehSenhaSga(item)) {
        detalhes = detalhesSenha(item);
      } else if (item.tipo === 'senha_crm') {
        detalhes = e('div', { key: 'det', className: 'v2c-det', style: { color: 'var(--muted)' } }, 'Responde que a senha do CRM não é alterada por aqui (usar "Esqueci minha senha") e soluciona o chamado.');
      } else if (item.tipo === 'erro_exportar_modelo') {
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('strong', { key: 'n' }, item.placa ? `Placa ${item.placa}` : `Card ${item.codigoCard || 'Não informado'}`),
          item.descricaoErro ? e('div', { key: 'd', style: { color: 'var(--muted)' } }, item.descricaoErro) : null,
          e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Busca o código FIPE no card do PowerCRM (só roda com 1 card) e cadastra o modelo no SGA.'),
          e('div', { key: 'r', className: 'v2c-aviso' }, 'Reconhecido pela descrição. Só cadastra se encontrar um único card e a FIPE; modelo já existente recebe a resposta "Modelo já cadastrado".'),
        ]);
      } else if (item.tipo === 'cadastro_modelo' && item.modelo) {
        const f = item.modelo.fipe;
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('strong', { key: 'n' }, `FIPE ${item.modelo.codigoFipe}`),
          f ? e('div', { key: 'm' }, `${f.marca} · ${f.modelo}`) : null,
          f ? e('div', { key: 't', style: { color: 'var(--muted)' } }, `${f.tipoNome}${f.combustivel ? ' · ' + f.combustivel : ''} · cadastra só no SGA`) : null,
          item.modelo.fipeErro ? e('div', { key: 'e', className: 'v2c-aviso' }, 'Falha ao consultar a FIPE: ' + item.modelo.fipeErro) : null,
        ]);
      } else if (item.tipo === 'cadastro_consultor' && item.consultor) {
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('strong', { key: 'n' }, item.consultor.nome || 'Não informado'),
          e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${item.consultor.cpfMascarado || 'Não informado'} · ${item.consultor.email || 'e-mail não informado'}`),
          item.cooperativa
            ? campoTela(`Cooperativa no SGA (o chamado informa "${item.cooperativa.informada}")`, e('select', { value: c.cooperativa, onChange: (ev) => mudarEscolha(item.id, { cooperativa: ev.target.value }) }, [
                e('option', { key: '', value: '' }, 'Escolha a cooperativa…'),
                item.cooperativa.sugestoes.length && !item.cooperativa.exata ? e('optgroup', { key: 'sug', label: 'Parecidas com o que o chamado diz' }, item.cooperativa.sugestoes.map((n) => e('option', { key: n, value: n }, n))) : null,
                e('optgroup', { key: 'todas', label: 'Todas do SGA' }, item.cooperativa.opcoes.map((n) => e('option', { key: n, value: n }, n))),
              ]), 'coop')
            : e('div', { key: 'k' }, 'Cooperativa: ' + (item.consultor.cooperativa || 'Não informado')),
          item.cooperativa && item.cooperativa.exata ? e('div', { key: 'ok', style: { color: 'var(--muted)', fontSize: 12 } }, 'O nome do chamado é igual ao do SGA.') : null,
          item.baseCrm ? campoTela('Base do PowerCRM', e('select', { value: c.baseCrm, onChange: (ev) => mudarEscolha(item.id, { baseCrm: ev.target.value }) }, item.baseCrm.opcoes.map((b, i) => e('option', { key: b, value: b }, i === 0 ? b + ' (principal)' : b))), 'crm') : null,
          item.baseCrm ? e('div', { key: 'n', style: { color: 'var(--muted)', fontSize: 12 } }, item.baseCrm.pedida ? 'Base informada no chamado.' : 'O chamado não informa a base. Será usada a principal.') : null,
        ]);
      } else if (item.altStatus && item.pessoa) {
        const p = item.pessoa;
        const sec = item.altStatus.secundarias.map((b) => b.chave);
        const sel = item.altStatus.todas.filter((b) => !sec.includes(b.chave) || c.extrasAlt.includes(b.chave)); // o que vai rodar
        const sga = sel.some((b) => b.temSga);
        const crm = sel.filter((b) => b.temPowercrm).map((b) => b.label);
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('strong', { key: 'n' }, p.nome || 'Não informado'),
          e('div', { key: 'b', style: { color: p.busca === 'CPF' ? 'var(--muted)' : 'var(--warn)' } }, p.busca === 'CPF' ? `Busca pelo CPF ${p.cpfMascarado}` : 'Busca pelo nome (o chamado não tem CPF)'),
          e('div', { key: 'q', style: { color: 'var(--muted)' } }, item.altStatus.qual === 'usuario' ? 'Colaborador interno' : 'Consultor/voluntário'),
          e('div', { key: 's' }, [sga ? 'SGA: inativar' : null, crm.length ? `PowerCRM (${crm.join(', ')}): bloquear` : null].filter(Boolean).join(' · ')),
          item.altStatus.secundarias.length ? campoTela('Também validar em (o chamado só cita as marcadas)', e('div', { className: 'ext-login-assoc' }, item.altStatus.secundarias.map((b) => {
            const marcada = c.extrasAlt.includes(b.chave);
            return e('button', { key: b.chave, type: 'button', 'aria-pressed': marcada ? 'true' : 'false', onClick: () => mudarEscolha(item.id, { extrasAlt: marcada ? c.extrasAlt.filter((x) => x !== b.chave) : [...c.extrasAlt, b.chave] }) }, b.label);
          })), 'extras') : null,
          p.outrosSistemas ? e('div', { key: 'o', className: 'v2c-aviso' }, 'Cita chats e outros sistemas, que ficam fora (somente SGA e CRM). Vai como observação na solução.') : null,
        ]);
      } else if (item.tipo === 'cadastro_usuario' && item.usuario) {
        const u = item.usuario;
        const bases = (item.associacaoUsuario && item.associacaoUsuario.empresasCrm) || [];
        detalhes = e('div', { key: 'det', className: 'v2c-det' }, [
          e('div', { key: 'i' }, [
            e('span', { key: 's', style: S.tag(u.sistema === 'SGA' ? '#3B82F6' : '#F5514D') }, u.sistema === 'CRM' ? 'PowerCRM' : u.sistema),
            ' ',
            e('strong', { key: 'n' }, u.nomeCadastro || u.nome || 'Não informado'),
            e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${u.cpfMascarado || 'Não informado'} · ${u.email || 'e-mail não informado'}`),
            u.daPlanilha && u.planilha ? e('div', { key: 'pl', className: 'v2c-aviso' }, `Dados da lista de funcionários (aba ${u.planilha.aba} · ${u.planilha.funcao || 'função não informada'}). Confira se a pessoa ainda está ativa e se o perfil está certo; este não roda no automático.${u.solicitanteDepto ? ` Solicitante do departamento ${u.solicitanteDepto}${u.avisoDepto ? ', diferente da aba da lista: confira o perfil' : ''}.` : ''}${u.ambos ? ' O chamado cita SGA e CRM; apenas o primeiro citado é processado.' : ''}`) : null,
          ]),
          campoTela('Perfil (departamento · role)', e('select', { value: c.roleId, onChange: (ev) => mudarEscolha(item.id, { roleId: ev.target.value }) }, [
            e('option', { key: '', value: '' }, 'Escolha o perfil…'),
            ...lista.perfis.map((p) => e('option', { key: p.id, value: p.id }, p.nome)),
          ]), 'perfil'),
          u.sistema === 'SGA' ? campoTela('Login no SGA', e('input', { value: c.loginSga, onChange: (ev) => mudarEscolha(item.id, { loginSga: ev.target.value }) }), 'login') : null,
          u.sistema === 'CRM' && bases.length > 1 ? campoTela('Bases do PowerCRM (cria uma para cada marcada)', e('div', { className: 'ext-login-assoc' }, bases.map((b) => {
            const sel = c.empresasCrm.includes(b);
            return e('button', { key: b, type: 'button', 'aria-pressed': sel ? 'true' : 'false', onClick: () => mudarEscolha(item.id, { empresasCrm: sel ? c.empresasCrm.filter((x) => x !== b) : [...c.empresasCrm, b] }) }, b);
          })), 'bases') : null,
        ]);
      }

      const avisos = [
        avisoConfianca(item) ? e('div', { key: 'confianca', role: 'status', className: 'exc-aviso v2c-aviso-caixa' }, [Icon('AlertCircle', 16, 'var(--warn)'), e('div', { key: 't' }, [e('strong', { key: 't' }, avisoConfianca(item).titulo), e('div', { key: 'o' }, avisoConfianca(item).orientacao)])]) : null,
        item.ia || item.reabertoIa ? e('div', { key: 'ia', className: 'chamado-ia v2c-ia' }, [
          Icon('Bot', 14, 'currentColor'),
          e('span', { key: 't' }, item.reabertoIa
            ? item.reabertoIa.aviso || `Reaberto com outro pedido (${item.reabertoIa.tipoNovoNome}); rodar encerra o chamado explicando.`
            : item.ia.concorda
              ? `IA local confirma o tipo (${Math.round(item.ia.confianca * 100)}%)${item.validadoPorIa ? '; liberado para o automático' : ''}.`
              : `IA local ${item.ia.aplicar === 'auto' ? 'trocou o tipo para' : 'sugere'} ${item.tipoNome || 'sem automação'} (${Math.round(item.ia.confianca * 100)}%)${item.ia.motivo ? ': ' + item.ia.motivo : ''}`),
        ]) : null,
        item.pedirPendencia && !res ? e('div', { key: 'pend', className: 'v2c-aviso' }, `Falta ${item.pedirPendencia.faltas.join(' e ')} (não está na descrição, nos acompanhamentos nem nos prints). Rodar pede no chamado e deixa Pendente, sem atribuir.`) : null,
        item.identificadorAchadoEm ? e('div', { key: 'achado', style: { fontSize: 12.5, color: 'var(--muted)' } }, `Identificador achado ${item.identificadorAchadoEm === 'print' ? 'no print anexado' : 'nos acompanhamentos'}.`) : null,
        item.repetirIa && !res ? e('div', { key: 'rep', className: 'v2c-aviso' }, `Nova tentativa automática ${item.repetirIa.tentativa}: ${item.repetirIa.motivo || 'falha momentânea'}.`) : null,
      ].filter(Boolean);
      const problemas = item.problemas.length ? e('div', { key: 'prob', className: 'exc-aviso v2c-aviso-caixa', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 } }, item.problemas.map((p, j) => e('div', { key: j }, '⚠ ' + p))) : null;
      const ultima = item.ultimaExecucao ? e('div', { key: 'ult', style: { fontSize: 12, color: 'var(--muted)' } }, `Última execução: ${NOME_EXEC[item.ultimaExecucao.status] || item.ultimaExecucao.status} · ${dataBr(item.ultimaExecucao.em)} · ${item.ultimaExecucao.por || ''}`) : null;

      let acoes;
      if (res) {
        const cls = res.status === 'erro' ? 'erro' : ['teste', 'nao_rodou', 'repetir', 'pendencia'].includes(res.status) ? 'pergunta' : 'ok';
        acoes = e('div', { key: 'res', className: 'exu-msg auto ' + cls }, [
          e('div', { key: 's', className: 'exu-msg-meta' }, [Icon('Bot', 13, 'currentColor'), e('b', { key: 'b' },
            res.status === 'teste' ? `Teste: execução ${res.ok ? 'sem erro' : 'com erro'}`
              : res.status === 'concluido' ? 'Solucionado no GLPI'
                : res.status === 'nao_rodou' ? 'Não executado: configuração pendente'
                  : res.status === 'repetir' ? 'Falha momentânea: nova tentativa automática (IA)'
                    : res.status === 'pendencia' ? 'Pedido o que falta: chamado Pendente'
                      : 'Erro: devolutiva pendente no chamado')]),
          e('p', { key: 't' }, res.texto),
          e('button', { key: 'again', type: 'button', className: 'exu-btn', style: { marginTop: 10 }, onClick: () => { setResultados((r) => { const n = { ...r }; delete n[item.id]; return n; }); if (pode) setConfirmando(item.id); } }, [Icon('RefreshCw', 14, 'currentColor'), 'Rodar novamente']),
        ]);
      } else if (rodandoEste) {
        acoes = e('div', { key: 'rod', className: 'v2-carregando' }, [
          e('span', { key: 'sp', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14, 'var(--accent)')),
          e('span', { key: 't', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (execEste.linhas[execEste.linhas.length - 1] || 'Em execução…').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')),
        ]);
      } else if (confirmando === item.id) {
        acoes = e('div', { key: 'conf', className: 'v2c-confirmar' + (modoTeste ? '' : ' real') }, [
          e('div', { key: 'q' }, modoTeste ? 'Rodar em modo teste (não escreve no GLPI)?' : 'Rodar em modo real? O chamado ficará atribuído ao titular do token e será solucionado no GLPI.'),
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 'n', type: 'button', className: 'exu-btn', onClick: () => setConfirmando(null) }, 'Cancelar'),
            e('button', { key: 's', type: 'button', className: 'exu-btn primario', onClick: () => rodar([item], { manual: true }) }, 'Confirmar'),
          ]),
        ]);
      } else {
        acoes = e('div', { key: 'btns', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          pendente ? e('div', { key: 'f', className: 'v2c-aviso' }, pendente) : null,
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 'r', type: 'button', className: 'exu-btn primario', disabled: !pode, style: { flex: 1 }, onClick: () => setConfirmando(item.id) }, [Icon('Activity', 14, 'currentColor'), 'Rodar']),
            e('button', { key: 'n', type: 'button', className: 'exu-btn', style: { flex: 1 }, onClick: () => dispensar(item.id, !dispensados.includes(item.id)) }, dispensados.includes(item.id) ? 'Voltar para a lista' : 'Não rodar'),
          ]),
        ]);
      }
      return { avisos, detalhes, problemas, ultima, acoes, rodandoEste };
    }

    // ---------- listas, visões e filtros (v3: layout do Hub de exemplo) ----------
    const itensDaEntidade = Cache.puro.filtrarPorEntidade(lista.itens, entidadeAtiva);
    const possiveis = itensDaEntidade.filter((i) => !i.problemas.length && !dispensados.includes(i.id));
    const manuais = itensDaEntidade.filter((i) => i.problemas.length);
    const naoRodar = itensDaEntidade.filter((i) => !i.problemas.length && dispensados.includes(i.id));
    // prontos pra rodar agora: sem pendência, sem resultado nesta tela e sem execução em andamento;
    // nenhum enquanto a lista for a guardada (só a lista confirmada pelo servidor roda)
    const prontosTodos = lista.guardado ? [] : possiveis.filter((i) => !falta(i) && !deveExcluirDoAutomatico(i) && !resultados[i.id] && !execDoChamado(i.id));
    prontosRef.current = prontosTodos.length;
    const comErro = itensDaEntidade.filter((i) => ['erro', 'nao_rodou', 'repetir'].includes(situacao(i)));
    const solucionados = itensDaEntidade.filter((i) => ['concluido', 'teste', 'pendencia'].includes(situacao(i)));
    const VISOES = [
      ['disponiveis', 'Todos', possiveis],
      ['prontos', 'Prontos', possiveis.filter((i) => situacao(i) === 'pronto')],
      ['falta', 'Falta escolher', possiveis.filter((i) => situacao(i) === 'falta')],
      ['confirmar', 'Só manual', possiveis.filter((i) => situacao(i) === 'confirmar')],
      ['erro', 'Com erro', comErro],
      ['manual', 'Análise manual', manuais],
      ['feitos', 'Solucionados', solucionados],
      ['naorodar', 'Não rodar', naoRodar],
    ];
    const visaoAtual = VISOES.find((v) => v[0] === visao) || VISOES[0];
    const q = busca.trim().toLowerCase();
    const tipos = [...new Map(itensDaEntidade.map((i) => [i.tipo, i.tipoNome])).entries()].filter(([k]) => k).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
    const categorias = [...new Set(itensDaEntidade.map((i) => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const visiveis = visaoAtual[2]
      .filter((i) => (!tipoSel || i.tipo === tipoSel) && (!catSel || i.categoria === catSel) && (!q || [i.id, i.titulo, i.categoria, i.requerente, i.tipoNome].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (ordem === 'antigos' ? tempo(a.abertoEm) - tempo(b.abertoEm) : tempo(b.abertoEm) - tempo(a.abertoEm)));
    const porPagina = exibir === 'lista' ? cabe.lista : cabe.cartoes;
    const totalPag = Math.max(1, Math.ceil(visiveis.length / porPagina));
    const atualPag = Math.min(pagina, totalPag - 1);
    const fatia = visiveis.slice(atualPag * porPagina, (atualPag + 1) * porPagina);
    const marcadosItens = visiveis.filter((i) => marcados.includes(i.id));
    const marcadosProntos = marcadosItens.filter((i) => situacao(i) === 'pronto');
    const todosMarcados = fatia.length > 0 && fatia.every((i) => marcados.includes(i.id));
    const alternar = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    const itemAberto = aberto ? lista.itens.find((i) => i.id === aberto) : null;

    // ---------- automático (estado do servidor) ----------
    const descreverAuto = (window.ChamadosAuto && window.ChamadosAuto.descreverAuto) || (() => ({}));
    const estadoAuto = descreverAuto({
      computadores: computadoresAuto, rodando: Object.values(execucoes).filter((x) => !x.fim).reduce((n, x) => n + x.ids.length, 0),
      ultima: ultimoAuto, filaWhatsapp, modoTeste, limite: auto.limite,
    });
    const avisosTopo = [
      !modoTeste ? e('div', { key: 'real', className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), 'Modo teste desligado: as soluções são escritas no GLPI e os chamados ficam atribuídos ao titular do token.']) : null,
      auto.ativo ? e('div', { key: 'auto', className: 'exc-aviso auto-estado', style: { background: 'var(--accent-soft)', color: 'var(--text)', alignItems: 'flex-start' } }, [
        Icon('Activity', 16, 'var(--accent)'),
        e('div', { key: 't', style: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 } }, [
          e('b', { key: 'tt' }, 'Modo automático ligado: até ' + (auto.limite === 1 ? '1 chamado' : auto.limite + ' chamados') + ' por vez neste computador.'),
          estadoAuto.computadores ? e('span', { key: 'c', style: { color: 'var(--muted)', fontSize: 12 } }, estadoAuto.computadores) : null,
          e('span', { key: 'ag', style: { color: 'var(--muted)', fontSize: 12 } }, [estadoAuto.agora, estadoAuto.ultima, estadoAuto.whatsapp].filter(Boolean).join(' ')),
          estadoAuto.aviso ? e('span', { key: 'av', style: { color: 'var(--warn)', fontSize: 12, fontWeight: 600 } }, estadoAuto.aviso) : null,
          e('span', { key: 'm', style: { color: 'var(--muted)', fontSize: 11.5 } }, 'Mantenha esta aba aberta: é este navegador que roda os chamados.'),
        ]),
      ]) : null,
      erroAuto ? e('div', { key: 'ea', className: 'exc-aviso' }, [Icon('AlertCircle', 16, 'var(--warn)'), erroAuto]) : null,
      lista.erro && lista.guardado && lista.itens.length ? e('div', { key: 'guardada', role: 'alert', className: 'exc-aviso' }, [Icon('AlertCircle', 16, 'var(--warn)'), `Não foi possível atualizar a lista: ${lista.erro}. Mostrando a lista guardada às ${lista.em ? lista.em.toLocaleTimeString('pt-BR') : 'Não informado'}. Nada roda até a lista ser atualizada.`]) : null,
    ].filter(Boolean);

    // ---------- cabeçalho ----------
    const abertosNaTela = lista.totalAbertos;
    const cabecalho = e('header', { key: 'head', className: 'exu-cab' }, [
      e('div', { key: 't' }, [
        e('h1', { key: 'h', className: 'v1-h1' }, 'Chamados'),
        e('p', { key: 'p' }, lista.usuario ? [
          (mostrarEntidade ? plural(lista.entidades.length, 'entidade', 'entidades') : 'Entidade ' + (lista.entidades[0] || 'Sistemas')) + ', ' + plural(abertosNaTela, 'aberto', 'abertos') + ', aprovação como ' + lista.usuario.nome,
          lista.em ? e('span', { key: 'em', title: (!lista.guardado && Cache.puro.textoTempos(lista.tempos)) || undefined }, `, ${lista.guardado ? 'guardada às' : 'atualizado às'} ${lista.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`) : '.',
          lista.aoVivo ? e('span', { key: 'av', title: 'Atualização automática ligada', role: 'img', 'aria-label': 'Atualização automática ligada', className: 'v2c-ao-vivo' }) : null,
          e('span', { key: 'vivo', 'aria-live': 'polite', style: { marginLeft: 8 } }, lista.guardado && !lista.erro ? 'Atualizando…' : ''),
        ] : 'Chamados do GLPI (entidade Sistemas) que as automações resolvem.'),
      ]),
      e('div', { key: 'a', className: 'exu-acoes' }, [
        e('label', { key: 'mt', className: 'exu-chave', title: 'Em teste a automação preenche mas não escreve no GLPI' }, [
          e('input', { key: 'c', type: 'checkbox', className: 'admin-chave', role: 'switch', checked: modoTeste, onChange: (ev) => { setModoTeste(ev.target.checked); gravar(KEY_MODO_TESTE, ev.target.checked); } }), 'Modo teste',
        ]),
        e('label', { key: 'au', className: 'exu-chave', title: 'Roda sozinho os chamados prontos. Com mais computadores ligados, cada um pega a sua parte.' }, [
          e('input', { key: 'c', type: 'checkbox', className: 'admin-chave', role: 'switch', checked: auto.ativo, onChange: (ev) => {
            if (!ev.target.checked) { mudarAuto({ ativo: false }); setErroAuto(''); }
            else if (modoTeste) ligarAuto();
            else { setErroAuto(''); setConfirmar({ tipo: 'auto' }); }
          } }), 'Automático',
        ]),
        // quantas pessoas (computadores) estão com o automático ligado agora, com os nomes ao passar o mouse
        computadoresAuto.length ? e('span', { key: 'qa', className: 'pill pos', title: computadoresAuto.filter(Boolean).join(', ') || undefined },
          computadoresAuto.length === 1 ? '1 computador no automático' : computadoresAuto.length + ' computadores no automático') : null,
        e('div', { key: 'pv', className: 'exu-contador', role: 'group', 'aria-label': 'Chamados ao mesmo tempo no automático', title: 'Quantos chamados o automático roda ao mesmo tempo' }, [
          e('button', { key: 'm', type: 'button', disabled: auto.limite <= 1, onClick: () => mudarAuto({ limite: Math.max(1, auto.limite - 1) }), 'aria-label': 'Diminuir' }, '−'),
          e('span', { key: 'n', 'aria-live': 'polite' }, [e('b', { key: 'b' }, String(auto.limite)), ' por vez']),
          e('button', { key: 'p', type: 'button', disabled: auto.limite >= 20, onClick: () => mudarAuto({ limite: Math.min(20, auto.limite + 1) }), 'aria-label': 'Aumentar' }, '+'),
        ]),
        e('button', { key: 'cfg', type: 'button', className: 'icone-btn', onClick: () => Hub.abrirEditor(), title: 'Meus acessos', 'aria-label': 'Meus acessos' }, Icon('Settings', 16, 'currentColor')),
        e('button', { key: 'rf', type: 'button', className: 'icone-btn', disabled: lista.carregando, onClick: buscar, title: 'Atualizar a lista', 'aria-label': 'Atualizar a lista' }, e('span', { style: { display: 'flex', animation: lista.carregando ? 'spin 1s linear infinite' : 'none' } }, Icon('RefreshCw', 16, 'currentColor'))),
        e('button', { key: 'todos', type: 'button', className: 'exu-btn primario', disabled: !prontosTodos.length, onClick: () => setConfirmar({ itens: prontosTodos, manual: false }) }, `Rodar prontos (${prontosTodos.length})`),
      ]),
    ]);
    const avisoTeste = modoTeste ? e('p', { key: 'aviso-teste', className: 'aviso-teste' }, 'Em teste a automação lê e preenche, mas não escreve no GLPI.') : null;

    const kpi = (v, rot, n, det) => e('button', { key: v, type: 'button', className: 'exu-kpi' + (visao === v ? ' marcado' : ''), 'aria-pressed': visao === v ? 'true' : 'false', onClick: () => trocarVisao(visao === v ? 'disponiveis' : v) },
      [e('div', { key: 'r', className: 'exu-kpi-rot' }, rot), e('div', { key: 'v', className: 'exu-kpi-val' }, String(n)), e('div', { key: 'd', className: 'exu-kpi-det' }, det)]);
    const kpis = e('div', { key: 'kpis', className: 'exu-kpis' }, [
      kpi('prontos', 'Prontos para rodar', VISOES[1][2].length, 'reconhecidos e completos'),
      kpi('falta', 'Falta escolher', VISOES[2][2].length, 'perfil, cooperativa, login…'),
      kpi('confirmar', 'Só manual', VISOES[3][2].length, 'precisam de confirmação'),
      kpi('erro', 'Com erro', comErro.length, 'podem rodar de novo'),
      kpi('feitos', 'Solucionados', solucionados.length, 'nesta tela'),
    ]);
    const abas = e('div', { key: 'abas', className: 'exu-abas', role: 'tablist' }, VISOES.map(([v, rot, l]) => e('button', {
      key: v, type: 'button', role: 'tab', className: 'exu-aba', 'aria-selected': visao === v ? 'true' : 'false', onClick: () => trocarVisao(v),
    }, [rot, e('span', { key: 'n', className: 'n' }, String(l.length))])));
    const barra = e('div', { key: 'barra', className: 'exu-barra' }, [
      e('label', { key: 'b', className: 'exu-busca' }, [Icon('Search', 15, 'var(--muted-soft)'), e('input', { key: 'i', value: busca, onChange: (ev) => { setBusca(ev.target.value); setPagina(0); }, placeholder: 'Buscar por número, título ou solicitante', 'aria-label': 'Buscar chamados' })]),
      e('select', { key: 't', className: 'exu-select', value: tipoSel, onChange: (ev) => { setTipoSel(ev.target.value); setPagina(0); }, 'aria-label': 'Tipo' }, [e('option', { key: '', value: '' }, 'Todos os tipos'), ...tipos.map(([k, n]) => e('option', { key: k, value: k }, n))]),
      e('select', { key: 'c', className: 'exu-select', value: catSel, onChange: (ev) => { setCatSel(ev.target.value); setPagina(0); }, 'aria-label': 'Categoria' }, [e('option', { key: '', value: '' }, 'Todas as categorias'), ...categorias.map((n) => e('option', { key: n, value: n }, n))]),
      mostrarEntidade ? e('select', { key: 'en', className: 'exu-select', value: entidadeAtiva, onChange: (ev) => setFiltroEntidade(ev.target.value), 'aria-label': 'Entidade' }, [e('option', { key: '', value: '' }, 'Todas as entidades'), ...lista.entidades.map((n) => e('option', { key: n, value: n }, n))]) : null,
      e('select', { key: 'o', className: 'exu-select', value: ordem, onChange: (ev) => setOrdem(ev.target.value), 'aria-label': 'Ordem' }, [e('option', { key: 'r', value: 'recentes' }, 'Mais recentes'), e('option', { key: 'a', value: 'antigos' }, 'Mais antigos')]),
      e('div', { key: 'v', className: 'exu-seg', role: 'group', 'aria-label': 'Exibição' }, [
        e('button', { key: 'l', type: 'button', 'aria-pressed': exibir === 'lista' ? 'true' : 'false', onClick: () => trocarExibir('lista') }, [Icon('FileText', 13, 'currentColor'), ' Lista']),
        e('button', { key: 'c', type: 'button', 'aria-pressed': exibir === 'cartoes' ? 'true' : 'false', onClick: () => trocarExibir('cartoes') }, [Icon('LayoutDashboard', 13, 'currentColor'), ' Cartões']),
      ]),
    ]);

    // ---------- lista e cartões ----------
    const tipoCel = (item) => [
      e('span', { key: 't', className: 'exu-tipo' + (item.tipo ? '' : ' vazio') }, item.tipoNome || 'Sem automação'),
      item.ia && !item.ia.concorda ? e('span', { key: 'ia', className: 'exc-ia', title: 'A IA local sugere outro tipo' }, [Icon('Bot', 12, 'currentColor'), 'IA']) : null,
    ];
    // o que explica a situação, embaixo do selo: o que falta, o erro, o motivo de só manual ou de não rodar
    const detalheSit = (item) => {
      const res = resultados[item.id];
      const exec = execDoChamado(item.id);
      if (exec) return (exec.linhas[exec.linhas.length - 1] || 'Em execução…').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
      if (res) return String(res.texto || '').split('\n')[0].slice(0, 160);
      const s = situacao(item);
      if (s === 'falta') return lista.guardado ? TEXTO_AGUARDANDO : falta(item);
      if (s === 'confirmar') return avisoConfianca(item) ? String(item.motivoConfianca || '').trim() || 'Reconhecido só pela descrição' : 'Sempre manual';
      if (s === 'manual') return item.problemas[0];
      if (s === 'dispensado') return motivos[item.id] || null;
      return null;
    };
    // ação da linha: Rodar quem está pronto, Rodar novamente quem deu erro, e o resto abre o chamado para escolher
    const acaoLinha = (item) => {
      const s = situacao(item);
      const rodarEste = () => setConfirmar({ itens: [item], manual: true });
      if (s === 'pronto') return e('button', { type: 'button', className: 'exu-btn', onClick: rodarEste }, 'Rodar');
      if (['erro', 'nao_rodou', 'repetir'].includes(s)) {
        return e('button', { type: 'button', className: 'exu-btn', onClick: () => {
          setResultados((r) => { const n = { ...r }; delete n[item.id]; return n; });
          if (!item.problemas.length && !lista.guardado && !falta(item)) rodarEste(); else setAberto(item.id);
        } }, 'Rodar novamente');
      }
      // solucionado ou testado nesta tela e ainda na lista (reaberto, ou teste que agora vai rodar de verdade): abre o
      // chamado para conferir e rodar de novo; nunca roda direto da linha
      if (s === 'concluido' || s === 'teste') return e('button', { type: 'button', className: 'exu-btn texto', onClick: () => setAberto(item.id) }, 'Rodar novamente');
      if (s === 'falta') return e('button', { type: 'button', className: 'exu-btn texto', onClick: () => setAberto(item.id) }, 'Escolher');
      if (s === 'confirmar') return e('button', { type: 'button', className: 'exu-btn texto', onClick: () => setAberto(item.id) }, 'Conferir e rodar');
      return null;
    };
    const abrirCom = (item) => ({ onClick: () => setAberto(item.id), onKeyDown: (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === ev.currentTarget) { ev.preventDefault(); setAberto(item.id); } }, tabIndex: 0 });
    const vazio = e('div', { key: 'v', className: 'exc-vazio' }, [
      Icon('Inbox', 30, 'var(--muted-soft)', 1.3),
      q || tipoSel || catSel ? 'Nenhum chamado com esses filtros.' : visao === 'disponiveis' ? 'Nenhum chamado disponível para rodar.' : 'Nada nesta visão.',
      q || tipoSel || catSel ? e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => { setBusca(''); setTipoSel(''); setCatSel(''); } }, 'Limpar filtros') : null,
    ]);
    const emLista = e('div', { key: 'tab', ref: corpoRef, className: 'exc-tabela', role: 'table', 'aria-label': 'Chamados' }, [
      e('div', { key: 'h', className: 'exc-cab', role: 'row' }, [
        e('span', { key: 'm', className: 'exc-marcar' }, e('input', { type: 'checkbox', checked: todosMarcados, onChange: () => setMarcados(todosMarcados ? marcados.filter((id) => !fatia.some((i) => i.id === id)) : [...new Set([...marcados, ...fatia.map((i) => i.id)])]), 'aria-label': 'Marcar a página' })),
        e('span', { key: 'c' }, 'Chamado'), e('span', { key: 't' }, 'Tipo'), e('span', { key: 'a' }, 'Categoria'), e('span', { key: 'h' }, 'Aberto há'), e('span', { key: 's' }, 'Situação'), e('span', { key: 'x', className: 'sr' }, 'Ação'),
      ]),
      fatia.length ? fatia.map((item) => e('div', Object.assign({
        key: item.id, role: 'row', className: 'exc-linha' + (marcados.includes(item.id) ? ' selecionada' : '') + (aberto === item.id ? ' aberta' : ''),
      }, abrirCom(item)), [
        e('span', { key: 'm', className: 'exc-marcar', onClick: (ev) => ev.stopPropagation() }, e('input', { type: 'checkbox', checked: marcados.includes(item.id), onChange: () => alternar(item.id), 'aria-label': 'Marcar chamado ' + item.id })),
        e('div', { key: 't', className: 'exc-titulo' }, [
          e('b', { key: 'b' }, [e('span', { key: 'i', className: 'exc-id' }, '#' + item.id), e('span', { key: 't' }, item.titulo)]),
          e('small', { key: 's' }, (item.requerente || 'Requerente não informado') + ', ' + item.statusNome),
          e('small', { key: 'e', className: 'so-estreito' }, (item.tipoNome || 'Sem automação') + ', ' + (item.categoria || 'Sem categoria') + ', aberto há ' + tempoRelativo(item.abertoEm)),
        ]),
        e('div', { key: 'tp', className: 'exc-celula' }, tipoCel(item)),
        e('div', { key: 'a', className: 'exc-celula', title: item.categoria }, item.categoria || 'Sem categoria'),
        e('div', { key: 'h', className: 'exc-celula num' }, tempoRelativo(item.abertoEm)),
        e('div', { key: 's', className: 'exc-sit' }, [selo(item), detalheSit(item) ? e('small', { key: 'd' }, detalheSit(item)) : null]),
        e('div', { key: 'x', className: 'exc-acao', onClick: (ev) => ev.stopPropagation() }, acaoLinha(item)),
      ])) : vazio,
    ]);
    const emCartoes = fatia.length ? e('div', { key: 'cart', ref: corpoRef, className: 'exc-cartoes' }, fatia.map((item) => e('div', Object.assign({
      key: item.id, role: 'button', className: 'exc-cartao' + (marcados.includes(item.id) ? ' selecionada' : ''), 'aria-label': 'Chamado ' + item.id + ': ' + item.titulo,
    }, abrirCom(item)), [
      e('div', { key: 't', className: 'exc-cartao-topo' }, [
        e('span', { key: 'i', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [e('span', { key: 'm', onClick: (ev) => ev.stopPropagation(), style: { display: 'flex' } }, e('input', { type: 'checkbox', checked: marcados.includes(item.id), onChange: () => alternar(item.id), 'aria-label': 'Marcar chamado ' + item.id })), e('span', { key: 'n', className: 'exc-id' }, '#' + item.id)]),
        selo(item),
      ]),
      e('h4', { key: 'h', title: item.titulo }, item.titulo),
      e('p', { key: 'p' }, item.categoria || 'Sem categoria'),
      e('div', { key: 'tp', style: { display: 'flex', alignItems: 'center', minWidth: 0 } }, tipoCel(item)),
      e('div', { key: 'r', className: 'exc-cartao-pe' }, [e('span', { key: 'a' }, item.requerente || 'Requerente não informado'), e('span', { key: 'h' }, tempoRelativo(item.abertoEm))]),
    ]))) : e('div', { key: 'cart', ref: corpoRef, className: 'exc-tabela' }, vazio);

    let corpo;
    if (lista.erro && !(lista.guardado && lista.itens.length)) corpo = e('div', { key: 'erro', className: 'exc-aviso', style: { background: 'var(--error-tint)' } }, [Icon('AlertCircle', 16, 'var(--error)'), 'Falha ao buscar os chamados: ' + lista.erro]);
    else if (!lista.usuario && lista.carregando) corpo = e('div', { key: 'load', ref: corpoRef, className: 'exc-tabela' }, e('div', { className: 'exc-vazio' }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando chamados no GLPI…']));
    else corpo = exibir === 'lista' ? emLista : emCartoes;

    const paginacao = visiveis.length ? e('nav', { key: 'pag', className: 'exc-paginacao', 'aria-label': 'Páginas' }, [
      e('span', { key: 't' }, (atualPag * porPagina + 1) + ' a ' + (atualPag * porPagina + fatia.length) + ' de ' + plural(visiveis.length, 'chamado', 'chamados')),
      totalPag > 1 ? e('div', { key: 'b', style: { display: 'flex', gap: 6, alignItems: 'center' } }, [
        e('button', { key: 'a', type: 'button', className: 'exu-btn pequeno', disabled: atualPag === 0, onClick: () => setPagina(atualPag - 1) }, 'Anterior'),
        e('span', { key: 'p' }, 'Página ' + (atualPag + 1) + ' de ' + totalPag),
        e('button', { key: 'p2', type: 'button', className: 'exu-btn pequeno', disabled: atualPag >= totalPag - 1, onClick: () => setPagina(atualPag + 1) }, 'Próxima'),
      ]) : null,
    ]) : null;

    const extras = [];
    if (mensagensGerais.length) {
      extras.push(e('section', { key: 'msgs', className: 'exu-cartao' }, e('div', { className: 'exu-cartao-corpo', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, mensagensGerais.map((m, i) =>
        e('div', { key: i, className: 'exu-campo' }, [
          e('label', { key: 'l' }, 'Mensagem geral do fechamento ' + m.periodo),
          e('textarea', { key: 't', readOnly: true, value: m.texto, rows: Math.min(18, m.texto.split('\n').length + 1) }),
          e('button', { key: 'c', type: 'button', className: 'exu-btn pequeno', style: { alignSelf: 'flex-start' }, onClick: () => copiarTexto(m.texto) }, [Icon('Copy', 13, 'currentColor'), 'Copiar']),
        ])))));
    }
    // Parar: se o pedido não chegar ao serviço, o aviso vai para o log da própria execução (antes falhava calado)
    const pararExecucao = (jobId) => fetch(`${SERVICO}/api/parar/${jobId}`, { method: 'POST' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); })
      .catch((err) => setExecucoes((ex) => (ex[jobId] ? { ...ex, [jobId]: { ...ex[jobId], linhas: [...ex[jobId].linhas, 'Não foi possível parar agora (' + err.message + '). Tente de novo.'] } } : ex)));
    const listaExec = Object.values(execucoes).reverse();
    if (listaExec.length) {
      extras.push(e('section', { key: 'execs', className: 'exu-cartao' }, [
        e('div', { key: 'c', className: 'exu-cartao-cab' }, e('div', null, [e('h3', { key: 'h' }, 'Execuções'), e('p', { key: 'p' }, rodandoAlgo ? listaExec.filter((x) => !x.fim).length + ' em execução agora' : 'Todas terminaram.')])),
        e('div', { key: 'b', className: 'exu-cartao-corpo', style: { display: 'flex', flexDirection: 'column' } }, listaExec.map((x) => {
          const abertoLog = !!logsAbertos[x.jobId];
          return e('div', { key: x.jobId, className: 'v2c-exec' }, [
            e('div', { key: 'r', className: 'v2c-exec-linha' }, [
              !x.fim ? e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 13, 'var(--accent)')) : null,
              e('span', { key: 'n', style: { flex: 1, minWidth: 0 } }, x.ids.map((id) => '#' + id).join(', ')),
              e('span', { key: 'st', className: 'exu-sit ' + (!x.fim ? 'rodando' : x.fim.error ? 'erro' : 'concluido') }, [e('i', { key: 'i' }), !x.fim ? 'Em execução' : x.fim.error ? 'Erro' : 'Concluída']),
              !x.fim ? e('button', { key: 'p', type: 'button', className: 'exu-btn pequeno perigo', onClick: () => pararExecucao(x.jobId) }, 'Parar') : null,
              e('button', { key: 'v', type: 'button', className: 'exu-btn pequeno', onClick: () => setLogsAbertos((l) => ({ ...l, [x.jobId]: !abertoLog })) }, abertoLog ? 'Ocultar log' : 'Ver log'),
            ]),
            abertoLog ? e('pre', { key: 'l', className: 'v2c-log' }, x.linhas.join('\n') || 'Aguardando…') : null,
          ]);
        })),
      ]));
    }

    const lote = marcados.length ? e('div', { key: 'lote', className: 'exc-lote', role: 'toolbar', 'aria-label': 'Ações nos selecionados' }, [
      e('b', { key: 'n' }, marcados.length === 1 ? '1 selecionado' : marcados.length + ' selecionados'),
      e('button', { key: 'r', type: 'button', className: 'exu-btn pequeno', disabled: !marcadosProntos.length, title: marcadosProntos.length < marcadosItens.length ? 'Só os prontos rodam em lote' : '', onClick: () => setConfirmar({ itens: marcadosProntos, manual: false }) }, 'Rodar' + (marcadosProntos.length ? ' ' + marcadosProntos.length : '')),
      e('button', { key: 'd', type: 'button', className: 'exu-btn pequeno', onClick: () => setConfirmar({ tipo: 'dispensa', ids: marcadosItens.map((i) => i.id) }) }, 'Não rodar'),
      e('button', { key: 'l', type: 'button', className: 'exu-btn pequeno', onClick: () => setMarcados([]), 'aria-label': 'Limpar seleção' }, Icon('X', 13, 'currentColor')),
    ]) : null;

    const { Modal, Campo } = window.ExemploUI;
    let janelaConfirmar = null;
    if (confirmar && confirmar.tipo === 'auto') {
      janelaConfirmar = e(Modal, {
        key: 'conf-auto', perigo: true, titulo: 'Ligar o modo automático em modo real?', fechar: () => setConfirmar(null),
        descricao: `Os chamados prontos serão processados em modo real, até ${auto.limite} por vez, sem confirmação individual. Cada chamado fica atribuído ao titular do token e é solucionado no GLPI.`,
        rodape: [e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: () => setConfirmar(null) }, 'Cancelar'), e('button', { key: 'o', type: 'button', className: 'exu-btn primario', onClick: () => { setConfirmar(null); ligarAuto(); } }, 'Ligar')],
      });
    } else if (confirmar && confirmar.tipo === 'dispensa') {
      const um = confirmar.ids.length === 1;
      janelaConfirmar = e(Modal, {
        key: 'conf-disp', perigo: true, fechar: () => setConfirmar(null),
        titulo: um ? 'Não rodar o chamado #' + confirmar.ids[0] + '?' : 'Não rodar ' + confirmar.ids.length + ' chamados?',
        descricao: 'Sai da fila das automações e não roda no automático. O chamado continua aberto no GLPI e volta com "Voltar para a lista".',
        rodape: [e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: () => setConfirmar(null) }, 'Cancelar'), e('button', { key: 'o', type: 'button', className: 'exu-btn primario', onClick: () => {
          confirmar.ids.forEach((id) => dispensar(id, true));
          const novos = { ...motivos };
          confirmar.ids.forEach((id) => { novos[id] = motivoDispensa; });
          setMotivos(novos); gravar('arxhub_v3_motivos', novos);
          avisar((um ? 'Chamado marcado' : confirmar.ids.length + ' chamados marcados') + ' como "Não rodar": ' + motivoDispensa.toLowerCase() + '.', 'ok');
          setConfirmar(null); setMarcados([]); if (confirmar.ids.includes(aberto)) setAberto(null);
        } }, um ? 'Não rodar' : 'Não rodar ' + confirmar.ids.length)],
      }, e(Campo, { rotulo: 'Motivo (fica só neste navegador)', id: 'motivoDisp' }, e('select', { id: 'motivoDisp', value: motivoDispensa, onChange: (ev) => setMotivoDispensa(ev.target.value) }, ['Já resolvido por outra pessoa', 'Pedido duplicado', 'Departamento errado', 'Não é para automação', 'Outro motivo'].map((m) => e('option', { key: m, value: m }, m)))));
    } else if (confirmar) {
      janelaConfirmar = e(Modal, {
        key: 'conf-rodar', perigo: !modoTeste, titulo: `Rodar ${plural(confirmar.itens.length, 'chamado', 'chamados')}${modoTeste ? ' em modo teste' : ' em modo real'}?`, fechar: () => setConfirmar(null),
        descricao: modoTeste ? 'Em teste a automação lê e preenche, mas não escreve no GLPI.' : 'Em modo real os chamados ficam atribuídos ao titular do token e são solucionados no GLPI.',
        rodape: [e('button', { key: 'c', type: 'button', className: 'exu-btn', onClick: () => setConfirmar(null) }, 'Cancelar'), e('button', { key: 'o', type: 'button', className: 'exu-btn primario', onClick: () => { const l = confirmar.itens; setConfirmar(null); setMarcados([]); rodar(l, { manual: confirmar.manual }); } }, 'Rodar')],
      }, e('div', { className: 'v2c-lista-conf' }, confirmar.itens.slice(0, 8).map((i) => e('div', { key: i.id }, [e('span', { key: 'n', className: 'exc-id' }, '#' + i.id + ' '), i.tipoNome, ' · ', i.categoria || 'Sem categoria'])).concat(confirmar.itens.length > 8 ? [e('div', { key: 'mais', style: { color: 'var(--muted)' } }, 'e mais ' + (confirmar.itens.length - 8))] : [])));
    }

    // painel lateral do chamado: as partes do card + as ações no rodapé
    const gaveta = itemAberto ? (() => {
      const pt = partes(itemAberto);
      const res = resultados[itemAberto.id];
      const execEste = execDoChamado(itemAberto.id);
      const resultadoCaixa = res ? e('div', { className: 'exu-msg auto ' + (res.status === 'erro' ? 'erro' : ['teste', 'nao_rodou', 'repetir', 'pendencia'].includes(res.status) ? 'pergunta' : 'ok') }, [
        e('div', { key: 's', className: 'exu-msg-meta' }, [Icon('Bot', 13, 'currentColor'), e('b', { key: 'b' }, SIT[situacao(itemAberto)][1])]),
        e('p', { key: 't' }, res.texto),
      ]) : null;
      const pendente = itemAberto.problemas.length ? null : lista.guardado ? TEXTO_AGUARDANDO : falta(itemAberto);
      return e(VerChamado, {
        key: 'ver-' + itemAberto.id, item: itemAberto, userToken: acessos.userToken, onFechar: () => { setAberto(null); setConfirmando(null); },
        p: {
          selo: selo(itemAberto), avisos: pt.avisos, detalhes: pt.detalhes, problemas: pt.problemas, ultima: null, res, resultado: resultadoCaixa,
          pendente: res ? null : pendente, pode: !itemAberto.problemas.length && !pendente, rodandoEste: !!execEste,
          ultimaLinha: execEste ? (execEste.linhas[execEste.linhas.length - 1] || 'Em execução…').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '') : '',
          confirmandoEste: confirmando === itemAberto.id, modoTeste, dispensado: dispensados.includes(itemAberto.id),
          pedirRodar: () => { if (res) setResultados((r) => { const n = { ...r }; delete n[itemAberto.id]; return n; }); setConfirmando(itemAberto.id); },
          confirmarRodar: () => rodar([itemAberto], { manual: true }),
          // resposta ao solicitante (sugerida pela IA ou digitada): só o acompanhamento, sem rodar; em teste não escreve
          responder: (texto) => api('/api/responder', { glpi: { userToken: acessos.userToken }, id: itemAberto.id, texto, modoTeste }),
          // trocar o tipo (ou voltar ao das regras): o servidor guarda e a lista volta montada com o tipo novo
          tipos: lista.tiposDisponiveis || [],
          trocarTipo: async (tipo) => {
            try {
              await api('/api/tipo', { id: itemAberto.id, tipo, quem: lista.usuario && lista.usuario.nome });
              setResultados((r) => { const n = { ...r }; delete n[itemAberto.id]; return n; });
              avisar(tipo === 'regra' ? 'O chamado voltou ao tipo das regras.' : tipo === 'sem_automacao' ? 'Chamado marcado como sem automação: sai da lista.' : 'Tipo trocado. A lista vai mostrar o chamado com o tipo novo.', 'ok');
              buscar();
            } catch (err) {
              avisar('Não consegui trocar o tipo: ' + err.message, 'erro');
            }
          },
          cancelar: () => setConfirmando(null),
          dispensar: () => (dispensados.includes(itemAberto.id) ? dispensar(itemAberto.id, false) : setConfirmar({ tipo: 'dispensa', ids: [itemAberto.id] })),
        },
      });
    })() : verChamado ? e(VerChamado, { key: 'ver-chamado', item: verChamado, userToken: acessos.userToken, onFechar: () => setVerChamado(null) }) : null;

    return e('div', { className: 'exu-tela v3c-tela' }, [cabecalho, avisoTeste, ...avisosTopo, kpis, abas, barra, corpo, paginacao, ...extras, lote, janelaConfirmar, gaveta, avisos]);
  }

  window.ChamadosView = ChamadosView;
  window.VerChamado = VerChamado; // a aba Resultados abre o mesmo painel
  window.ChamadosSenhas = { nomeSistema, avisoSenha, bloqueioSenha, detalhesSenha, SELOS_REGRA, rotuloConfianca, deveExcluirDoAutomatico, avisoConfianca, montarPedidoItem }; // testados em app/test
})();
