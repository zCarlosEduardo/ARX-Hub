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

  function deveExcluirDoAutomatico(item) {
    return !!item && (item.somenteManual === true || (ehSenhaSga(item) && !!item.identidade && item.identidade.ok !== true && item.identidade.liberavelManual === true));
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
  const S = {
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeInUp 0.3s ease both' },
    label: { fontSize: 11.5, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 },
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

  function VerChamado({ item, userToken, onFechar }) {
    const [d, setD] = useState({ carregando: true, erro: null, chamado: null });
    const [h, setH] = useState({ carregando: true, erro: null, itens: [] });
    const [copiado, setCopiado] = useState(false);

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
      const tecla = (ev) => { if (ev.key === 'Escape') onFechar(); };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }, [onFechar]);

    const c = d.chamado;
    const linha = [];
    if (c) {
      linha.push({ k: 'aberto', em: c.abertoEm, autor: c.requerente });
      c.acompanhamentos.forEach((x, i) => linha.push({ ...x, k: 'acomp' + i, de: 'acomp' }));
      c.solucoes.forEach((x, i) => linha.push({ ...x, k: 'sol' + i, de: 'solucao' }));
    }
    h.itens.forEach((x) => linha.push({ ...x, k: 'exec' + x.id, de: 'exec' }));
    linha.forEach((x) => { x.t = tempo(x.em); });
    linha.sort((a, b) => b.t - a.t);

    const marcador = (cor) => e('span', { style: { position: 'absolute', left: -22, top: 4, width: 9, height: 9, borderRadius: '50%', background: cor, boxShadow: '0 0 0 3px var(--card)' } });
    function evento(x) {
      let cor; let topo; let corpo = null;
      if (x.de === 'exec') {
        cor = COR_EXEC[x.status] || 'var(--muted)';
        topo = [
          e('span', { key: 's', style: { fontWeight: 700, fontSize: 12.5, color: cor } }, 'Automação · ' + (NOME_EXEC[x.status] || x.status)),
          x.teste && x.status !== 'teste' ? e('span', { key: 'm', style: S.tag('#F5A524') }, 'Modo teste') : null,
        ];
        corpo = [
          e('div', { key: 'q', style: { fontSize: 12, color: 'var(--muted)' } }, [x.tipo ? x.tipo : null, x.por ? 'aprovado por ' + x.por : null].filter(Boolean).join(' · ') || 'Execução da automação'),
          x.resultado ? e(TextoRecolhivel, { key: 'r', texto: x.resultado, recolhidoTodo: true, rotulo: 'Ver resultado' }) : null,
        ];
      } else {
        cor = x.k === 'aberto' ? 'var(--muted)' : x.de === 'solucao' ? '#6DBE6A' : '#3B82F6';
        topo = [e('span', { key: 's', style: { fontWeight: 700, fontSize: 12.5 } }, x.k === 'aberto' ? 'Chamado aberto' : x.de === 'solucao' ? 'Solução' : 'Acompanhamento')];
        corpo = [
          x.autor ? e('div', { key: 'a', style: { fontSize: 12, color: 'var(--muted)' } }, x.autor) : null,
          x.texto ? e(TextoRecolhivel, { key: 't', texto: x.texto }) : null,
        ];
      }
      return e('div', { key: x.k, style: { position: 'relative', paddingBottom: 16 } }, [
        marcador(cor),
        e('div', { key: 'h', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 } }, [
          ...topo,
          e('span', { key: 'd', style: { marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted-soft)' } }, dataBr(x.em)),
        ]),
        e('div', { key: 'c', style: { marginTop: 3, display: 'flex', flexDirection: 'column', gap: 4 } }, corpo),
      ]);
    }

    const faixa = (txt, cor) => e('div', { style: { fontSize: 12.5, color: cor || 'var(--muted)', padding: '6px 0' } }, txt);
    const secao = (t) => e('div', { style: { ...S.label, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 } }, t);

    let miolo;
    if (d.carregando) {
      miolo = e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-soft)', padding: '50px 20px' } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 20, 'var(--accent)')), 'Lendo o chamado no GLPI…']);
    } else if (d.erro) {
      miolo = e('div', { style: { color: 'var(--error)', fontSize: 13.5, padding: '20px 0' } }, 'Falha ao ler o chamado: ' + d.erro);
    } else {
      miolo = e('div', null, [
        secao('Descrição'),
        e('div', { key: 'desc', style: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 18 } }, c.descricao ? e(TextoRecolhivel, { texto: c.descricao, linhas: 8 }) : faixa('Sem descrição')),
        secao('Linha do tempo'),
        h.carregando ? faixa('Buscando as execuções da automação…') : null,
        h.erro ? faixa('Falha ao buscar as execuções da automação: ' + h.erro, 'var(--warn)') : null,
        e('div', { key: 'tl', style: { position: 'relative', marginLeft: 5, paddingLeft: 16, borderLeft: '2px solid var(--border)', marginTop: 6 } }, linha.map(evento)),
        !h.carregando && !h.erro && !h.itens.length ? faixa('A automação ainda não rodou neste chamado.') : null,
      ]);
    }

    return e('div', { onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onFechar(); }, style: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'flex-end' } },
      e('aside', { role: 'dialog', 'aria-label': 'Chamado #' + item.id, style: { width: 'min(560px, 100vw)', height: '100%', background: 'var(--card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', animation: 'toastIn 0.2s ease both', boxSizing: 'border-box' } }, [
        e('div', { key: 'cab', style: { padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'l1', style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 } }, [
            e('div', { key: 't', style: { fontWeight: 600, fontSize: 15, lineHeight: 1.35, minWidth: 0, wordBreak: 'break-word' } }, `#${item.id} · ${(c && c.titulo) || item.titulo}`),
            e('button', { key: 'x', 'aria-label': 'Fechar', title: 'Fechar (Esc)', onClick: onFechar, style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' } }, Icon('X', 18, 'var(--muted)')),
          ]),
          e('div', { key: 'tags', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 } }, [
            e('span', { key: 'c', style: S.tag('#3B82F6') }, (c && c.categoria) || item.categoria || '(sem categoria)'),
            e('span', { key: 's', style: S.tag(c && c.status >= 5 ? '#6DBE6A' : '#F5A524') }, (c && c.statusNome) || item.statusNome),
          ]),
          e('div', { key: 'm', style: { fontSize: 12, color: 'var(--muted)' } }, `Requerente: ${(c && c.requerente) || item.requerente || 'Não informado'} · aberto em ${dataBr((c && c.abertoEm) || item.abertoEm)}`),
          e('div', { key: 'b', style: { display: 'flex', gap: 14, alignItems: 'center' } }, [
            e('button', { key: 'cp', onClick: async () => { if (await copiarTexto((c && c.link) || item.link)) { setCopiado(true); setTimeout(() => setCopiado(false), 2500); } }, style: { background: 'none', border: 'none', cursor: 'pointer', color: copiado ? 'var(--accent)' : 'var(--muted)', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' } }, [Icon('Copy', 12), e('span', { key: 't' }, copiado ? 'Link copiado' : 'Copiar link')]),
            e('a', { key: 'g', href: (c && c.link) || item.link, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--muted)', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' } }, [Icon('ExternalLink', 12), e('span', { key: 't' }, 'Abrir no GLPI')]),
          ]),
        ]),
        e('div', { key: 'corpo', style: { flex: 1, overflowY: 'auto', padding: '14px 16px 40px' } }, miolo),
      ]));
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
    const [verificadoEm, setVerificadoEm] = useState(null); // última vez que o servidor respondeu "mudou?" (a cada 8 s)
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
      // a cada 8 s (reserva do webhook, que o GLPI só entrega a cada ~1 min) só pergunta ao servidor se algo mudou no
      // GLPI (1 busca leve) e recarrega a lista inteira só se mudou; com a aba escondida não pergunta; por segurança
      // recarrega tudo a cada ~5 min mesmo sem mudança
      let volta = 0;
      const t = setInterval(async () => {
        if (fontesRef.current.size || document.hidden) return;
        volta++;
        try {
          const m = await api('/api/mudou', { glpi: { userToken: acessos.userToken } });
          setVerificadoEm(new Date());
          if (volta % 38 === 0 || m.assinatura !== assinaturaRef.current) buscar();
        } catch {
          // servidor fora por um instante: tenta de novo no próximo ciclo
        }
      }, 8000);
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
        fotoNome: atual.fotoNome !== undefined ? atual.fotoNome : '',
        fotoDepartamento: atual.fotoDepartamento !== undefined ? atual.fotoDepartamento : '',
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
      } catch (err) {
        setErroAuto(err.message);
        mudarAuto({ ativo: false });
      }
    }
    // com o automático ligado: renova a presença a cada 30 s (se o servidor recusar, desliga); ao desligar/fechar, solta e libera as reservas
    useEffect(() => {
      if (!auto.ativo) return undefined;
      const atualizarComputadores = () => api('/api/auto').then((x) => setComputadoresAuto((x.computadores || []).map((c) => c.por))).catch(() => {});
      const renovar = () => api('/api/auto/assumir', { clienteId: CLIENTE_ID, quem: lista.usuario && lista.usuario.nome }).then(atualizarComputadores).catch((err) => {
        if (/^HTTP|Failed|NetworkError/.test(err.message)) return; // servidor fora um instante: tenta de novo
        setErroAuto(err.message);
        mudarAuto({ ativo: false });
      });
      atualizarComputadores();
      const t = setInterval(renovar, 30000);
      const soltar = () => { try { fetch(SERVICO + '/api/auto/soltar', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: CLIENTE_ID }) }); } catch { /* sem rede */ } };
      window.addEventListener('beforeunload', soltar);
      return () => { clearInterval(t); window.removeEventListener('beforeunload', soltar); soltar(); setComputadoresAuto([]); };
    }, [auto.ativo]); // eslint-disable-line

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
        }).catch(() => {});
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

    if (!pronto) {
      return e('div', { style: { padding: '28px 24px 96px' } }, e(Hub.EditorAcessos, { exigirChamados: true, moldura: 'card' }));
    }

    // ---------- card de um chamado ----------
    function card(item, i) {
      const res = resultados[item.id];
      const execEste = execDoChamado(item.id);
      const rodandoEste = !!execEste;
      const c = escolha(item);
      const pendente = item.problemas.length ? null : lista.guardado ? TEXTO_AGUARDANDO : falta(item);
      const pode = !item.problemas.length && !pendente;

      let detalhes = null;
      if (item.tipo === 'fechamento' && item.periodo) {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 } }, [
          e('div', { key: 'p' }, [e('strong', { key: 's' }, item.periodo.rotulo), e('span', { key: 'o', style: { color: 'var(--muted)' } }, ' · ' + item.periodo.origem)]),
          e('div', { key: 'd', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } }, ['dataInicial', 'dataFinal'].map((k) =>
            e('input', { key: k, type: 'date', value: c[k] || '', onChange: (ev) => mudarEscolha(item.id, { [k]: ev.target.value }), style: { ...S.input, padding: '6px 8px', fontSize: 12 } })
          )),
        ]);
      } else if (item.tipo === 'foto_perfil' && item.foto && item.foto.multi) {
        const f = item.foto;
        const duvidosas = f.fotos.filter((x) => x.duvida);
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'r' }, [e('strong', { key: 'n' }, f.fotos.length + ' fotos de perfil'), e('span', { key: 'd', style: { color: 'var(--muted)' } }, ' neste chamado (uma arte por pessoa, todas anexadas)')]),
          e('div', { key: 'p', style: { color: 'var(--warn)', fontSize: 12 } }, 'Várias fotos: não roda no automático. Confira a lista abaixo (uma pessoa por linha: Nome | DEPARTAMENTO).'),
          duvidosas.length ? e('div', { key: 'm', style: { color: 'var(--warn)', fontSize: 12 } }, duvidosas.map((x) => `${x.nome}: ${x.motivos.join('; ')}`).join(' · ') + '. Edite a lista para liberar.') : null,
          e('textarea', { key: 'lista', rows: Math.min(10, f.fotos.length + 1), value: c.fotoLista, onChange: (ev) => mudarEscolha(item.id, { fotoLista: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' } }),
        ]);
      } else if (item.tipo === 'foto_perfil' && item.foto) {
        const f = item.foto;
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'r' }, [
            e('strong', { key: 'n' }, f.duvidaNome ? '(nome a informar)' : f.nome),
            e('span', { key: 'd', style: { color: 'var(--muted)' } }, ' · ' + (f.duvidaDepto ? '(departamento a informar)' : f.departamento)),
            !f.duvidaDepto && f.departamentoOrigem === 'planilha' ? e('span', { key: 'o', style: { color: 'var(--muted)' } }, ' (pela lista de funcionários)') : null,
          ]),
          e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Gera a foto de perfil (arte com nome e departamento), anexa no chamado e soluciona.'),
          (f.duvidaNome || f.duvidaDepto) && f.motivos.length ? e('div', { key: 'm', style: { color: 'var(--warn)', fontSize: 12 } }, 'Há dúvida (não roda no automático): ' + f.motivos.join('; ') + '. Preencha abaixo.') : null,
          f.outraPessoa && !f.duvidaDepto ? e('div', { key: 'o2', style: { color: 'var(--warn)', fontSize: 12 } }, 'A foto é para outra pessoa, não o solicitante.') : null,
          f.duvidaNome ? e('div', { key: 'nome' }, [
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Nome na foto'),
            e('input', { key: 'i', value: c.fotoNome, placeholder: f.analista ? 'Analista 4' : 'Primeiro e último nome', onChange: (ev) => mudarEscolha(item.id, { fotoNome: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }),
            f.sugestaoNome && !c.fotoNome ? e('button', { key: 's', style: { ...S.chip(false), marginTop: 6 }, onClick: () => mudarEscolha(item.id, { fotoNome: f.sugestaoNome }) }, 'Usar: ' + f.sugestaoNome) : null,
          ]) : null,
          f.duvidaDepto ? e('div', { key: 'dep' }, [
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Departamento na foto (MAIÚSCULO)'),
            e('input', { key: 'i', value: c.fotoDepartamento, placeholder: 'Ex.: CENTRAL DE RELACIONAMENTO', onChange: (ev) => mudarEscolha(item.id, { fotoDepartamento: ev.target.value.toUpperCase() }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }),
            f.sugestaoDepartamento && !c.fotoDepartamento ? e('button', { key: 's', style: { ...S.chip(false), marginTop: 6 }, onClick: () => mudarEscolha(item.id, { fotoDepartamento: f.sugestaoDepartamento }) }, 'Usar: ' + f.sugestaoDepartamento) : null,
          ]) : null,
        ]);
      } else if (item.tipo === 'senha_sistemas' || ehSenhaSga(item)) {
        detalhes = detalhesSenha(item);
      } else if (item.tipo === 'senha_crm') {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' } }, 'Responde que a senha do CRM não é alterada por aqui (usar "Esqueci minha senha") e soluciona o chamado.');
      } else if (item.tipo === 'erro_exportar_modelo') {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, item.placa ? `Placa ${item.placa}` : `Card ${item.codigoCard || 'Não informado'}`),
          item.descricaoErro ? e('div', { key: 'd', style: { color: 'var(--muted)' } }, item.descricaoErro) : null,
          e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Busca o código FIPE no card do PowerCRM (só roda com 1 card) e cadastra o modelo no SGA.'),
          e('div', { key: 'r', style: { color: 'var(--warn)', fontSize: 12 } }, 'Reconhecido pela descrição. Só cadastra se encontrar um único card e a FIPE; modelo já existente recebe a resposta "Modelo já cadastrado".'),
        ]);
      } else if (item.tipo === 'cadastro_modelo' && item.modelo) {
        const f = item.modelo.fipe;
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, `FIPE ${item.modelo.codigoFipe}`),
          f ? e('div', { key: 'm' }, `${f.marca} · ${f.modelo}`) : null,
          f ? e('div', { key: 't', style: { color: 'var(--muted)' } }, `${f.tipoNome}${f.combustivel ? ' · ' + f.combustivel : ''} · cadastra só no SGA`) : null,
          item.modelo.fipeErro ? e('div', { key: 'e', style: { color: 'var(--warn)' } }, 'Falha ao consultar a FIPE: ' + item.modelo.fipeErro) : null,
        ]);
      } else if (item.tipo === 'cadastro_consultor' && item.consultor) {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, item.consultor.nome || 'Não informado'),
          e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${item.consultor.cpfMascarado || 'Não informado'} · ${item.consultor.email || 'e-mail não informado'}`),
          item.cooperativa
            ? e('div', { key: 'k', style: { marginTop: 6 } }, [
                e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, `Cooperativa no SGA (o chamado informa "${item.cooperativa.informada}")`),
                e('select', { key: 's', value: c.cooperativa, onChange: (ev) => mudarEscolha(item.id, { cooperativa: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }, [
                  e('option', { key: '', value: '' }, 'Escolha a cooperativa…'),
                  item.cooperativa.sugestoes.length && !item.cooperativa.exata
                    ? e('optgroup', { key: 'sug', label: 'Parecidas com o que o chamado diz' }, item.cooperativa.sugestoes.map((n) => e('option', { key: n, value: n }, n)))
                    : null,
                  e('optgroup', { key: 'todas', label: 'Todas do SGA' }, item.cooperativa.opcoes.map((n) => e('option', { key: n, value: n }, n))),
                ]),
                item.cooperativa.exata ? e('div', { key: 'ok', style: { color: 'var(--muted)', fontSize: 11.5, marginTop: 3 } }, 'O nome do chamado é igual ao do SGA.') : null,
              ])
            : e('div', { key: 'k' }, 'Cooperativa: ' + (item.consultor.cooperativa || 'Não informado')),
          item.baseCrm
            ? e('div', { key: 'crm', style: { marginTop: 6 } }, [
                e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Base do PowerCRM'),
                e('select', { key: 's', value: c.baseCrm, onChange: (ev) => mudarEscolha(item.id, { baseCrm: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } },
                  item.baseCrm.opcoes.map((b, i) => e('option', { key: b, value: b }, i === 0 ? b + ' (principal)' : b))),
                e('div', { key: 'n', style: { color: 'var(--muted)', fontSize: 11.5, marginTop: 3 } }, item.baseCrm.pedida ? 'Base informada no chamado.' : 'O chamado não informa a base. Será usada a principal.'),
              ])
            : null,
        ]);
      } else if (item.altStatus && item.pessoa) {
        const p = item.pessoa;
        const sec = item.altStatus.secundarias.map((b) => b.chave);
        const sel = item.altStatus.todas.filter((b) => !sec.includes(b.chave) || c.extrasAlt.includes(b.chave)); // o que vai rodar
        const sga = sel.some((b) => b.temSga);
        const crm = sel.filter((b) => b.temPowercrm).map((b) => b.label);
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, p.nome || 'Não informado'),
          e('div', { key: 'b', style: { color: p.busca === 'CPF' ? 'var(--muted)' : 'var(--warn)' } }, p.busca === 'CPF' ? `Busca pelo CPF ${p.cpfMascarado}` : 'Busca pelo nome (o chamado não tem CPF)'),
          e('div', { key: 'q', style: { color: 'var(--muted)' } }, item.altStatus.qual === 'usuario' ? 'Colaborador interno' : 'Consultor/voluntário'),
          e('div', { key: 's' }, [sga ? 'SGA: inativar' : null, crm.length ? `PowerCRM (${crm.join(', ')}): bloquear` : null].filter(Boolean).join(' · ')),
          item.altStatus.secundarias.length ? e('div', { key: 'ex', style: { marginTop: 4 } }, [
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Também validar em (o chamado só cita as marcadas)'),
            e('div', { key: 'c', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, item.altStatus.secundarias.map((b) => {
              const marcada = c.extrasAlt.includes(b.chave);
              return e('button', { key: b.chave, style: S.chip(marcada), onClick: () => mudarEscolha(item.id, { extrasAlt: marcada ? c.extrasAlt.filter((x) => x !== b.chave) : [...c.extrasAlt, b.chave] }) }, b.label);
            })),
          ]) : null,
          p.outrosSistemas ? e('div', { key: 'o', style: { color: 'var(--warn)', fontSize: 12 } }, 'Cita chats e outros sistemas, que ficam fora (somente SGA e CRM). Vai como observação na solução.') : null,
        ]);
      } else if (item.tipo === 'cadastro_usuario' && item.usuario) {
        const u = item.usuario;
        const bases = (item.associacaoUsuario && item.associacaoUsuario.empresasCrm) || [];
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'i' }, [
            e('span', { key: 's', style: S.tag(u.sistema === 'SGA' ? '#3B82F6' : '#F5514D') }, u.sistema === 'CRM' ? 'PowerCRM' : u.sistema),
            ' ',
            e('strong', { key: 'n' }, u.nomeCadastro || u.nome || 'Não informado'), // como vai ficar cadastrado ("ARX - ...")
            e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${u.cpfMascarado || 'Não informado'} · ${u.email || 'e-mail não informado'}`),
            u.daPlanilha && u.planilha ? e('div', { key: 'pl', style: { color: 'var(--warn)', fontSize: 12 } }, `Dados da lista de funcionários (aba ${u.planilha.aba} · ${u.planilha.funcao || 'função não informada'}). Confira se a pessoa ainda está ativa e se o perfil está certo; este não roda no automático.${u.solicitanteDepto ? ` Solicitante do departamento ${u.solicitanteDepto}${u.avisoDepto ? ', diferente da aba da lista: confira o perfil' : ''}.` : ''}${u.ambos ? ' O chamado cita SGA e CRM; apenas o primeiro citado é processado.' : ''}` ) : null,
          ]),
          e('select', { key: 'perfil', value: c.roleId, onChange: (ev) => mudarEscolha(item.id, { roleId: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }, [
            e('option', { key: '', value: '' }, 'Perfil (departamento · role)…'),
            ...lista.perfis.map((p) => e('option', { key: p.id, value: p.id }, p.nome)),
          ]),
          u.sistema === 'SGA' ? e('div', { key: 'login' }, [
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Login no SGA'),
            e('input', { key: 'i', value: c.loginSga, onChange: (ev) => mudarEscolha(item.id, { loginSga: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }),
          ]) : null,
          u.sistema === 'CRM' && bases.length > 1 ? e('div', { key: 'bases' }, [
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Bases do PowerCRM (cria uma para cada marcada)'),
            e('div', { key: 'c', style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, bases.map((b) => {
              const sel = c.empresasCrm.includes(b);
              return e('button', { key: b, style: S.chip(sel), onClick: () => mudarEscolha(item.id, { empresasCrm: sel ? c.empresasCrm.filter((x) => x !== b) : [...c.empresasCrm, b] }) }, b);
            })),
          ]) : null,
        ]);
      }

      let rodape;
      if (res) {
        rodape = e('div', { key: 'res', style: { borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12.5 } }, [
          e('div', { key: 's', style: { fontWeight: 600, color: res.status === 'erro' ? 'var(--error)' : res.status === 'teste' || res.status === 'nao_rodou' || res.status === 'repetir' || res.status === 'pendencia' ? 'var(--warn)' : 'var(--accent)' } },
            res.status === 'teste'
              ? `Teste: execução ${res.ok ? 'sem erro' : 'com erro'}`
              : res.status === 'concluido'
                ? 'Solucionado no GLPI'
                : res.status === 'nao_rodou'
                  ? 'Não executado: configuração pendente'
                  : res.status === 'repetir'
                    ? 'Falha momentânea: nova tentativa automática (IA)'
                    : res.status === 'pendencia'
                      ? 'Pedido o que falta: chamado Pendente'
                    : 'Erro: devolutiva pendente no chamado'),
          e('pre', { key: 't', style: { whiteSpace: 'pre-wrap', margin: '6px 0 0', fontFamily: 'inherit', color: 'var(--muted)' } }, res.texto),
          res.status !== 'concluido'
            ? e('button', { key: 'again', style: { ...S.btnSec, marginTop: 8, width: '100%' }, onClick: () => { setResultados((r) => { const n = { ...r }; delete n[item.id]; return n; }); if (pode) setConfirmando(item.id); } }, [Icon('RefreshCw', 14), e('span', { key: 't' }, 'Rodar novamente')])
            : null,
        ]);
      } else if (rodandoEste) {
        rodape = e('div', { key: 'rod', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' } }, [
          e('span', { key: 'sp', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14)),
          e('span', { key: 't', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (execEste.linhas[execEste.linhas.length - 1] || 'Em execução…').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')),
        ]);
      } else if (confirmando === item.id) {
        rodape = e('div', { key: 'conf', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'q', style: { fontSize: 12.5, color: modoTeste ? 'var(--muted)' : 'var(--warn)' } }, modoTeste ? 'Rodar em modo teste (não escreve no GLPI)?' : 'Rodar em modo real? O chamado ficará atribuído ao titular do token e será solucionado no GLPI.'),
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 's', style: { ...S.btnPrim, flex: 1 }, onClick: () => rodar([item], { manual: true }) }, 'Confirmar'),
            e('button', { key: 'n', style: { ...S.btnSec, flex: 1 }, onClick: () => setConfirmando(null) }, 'Cancelar'),
          ]),
        ]);
      } else {
        const bloqueado = !pode;
        rodape = e('div', { key: 'btns', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, [
          pendente ? e('div', { key: 'f', style: { fontSize: 12, color: 'var(--warn)' } }, pendente) : null,
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 'r', disabled: bloqueado, style: { ...S.btnPrim, flex: 1, opacity: bloqueado ? 0.45 : 1, cursor: bloqueado ? 'not-allowed' : 'pointer' }, onClick: () => setConfirmando(item.id) }, [Icon('Activity', 14, 'var(--primary-fg)'), e('span', { key: 't' }, 'Rodar')]),
            e('button', { key: 'n', style: { ...S.btnSec, flex: 1 }, onClick: () => dispensar(item.id, !dispensados.includes(item.id)) }, dispensados.includes(item.id) ? 'Voltar para a lista' : 'Não rodar'),
          ]),
        ]);
      }

      return e('div', { key: item.id, style: { ...S.card, animationDelay: Math.min(i, 10) * 35 + 'ms', borderColor: rodandoEste ? 'var(--accent)' : 'var(--border)' } }, [
        e('div', { key: 'top', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
          e('div', { key: 'tipo', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0 } }, [
            e('span', { key: 't', style: S.tag(COR_TIPO[item.tipo] || '#6b7280') }, item.tipoNome),
            mostrarEntidade && item.entidade ? e('span', { key: 'ent', title: 'Entidade no GLPI', style: { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--muted)' } }, item.entidade) : null,
            rotuloConfianca(item) ? e('span', { key: 'conf', style: { display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: 'var(--warn-tint)', color: 'var(--warn)', border: '1px solid var(--warn)' } }, rotuloConfianca(item)) : null,
          ]),
          e('div', { key: 'n', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
            // o GLPI usa cookie SameSite=Strict: clicar aqui (de outro site) pode cair em "sessão expirou";
            // colar o link na barra de endereço sempre funciona
            e('button', { key: 'ver', title: 'Ler o chamado aqui no Hub (descrição, acompanhamentos e histórico da automação)', onClick: () => setVerChamado(item), style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' } }, [Icon('Eye', 13), e('span', { key: 't' }, 'Ver chamado')]),
            e('button', { key: 'c', title: 'Copiar o link do chamado (cole na barra de endereço; funciona mesmo quando o clique cai em "sessão expirou")', onClick: () => copiarLink(item), style: { background: 'none', border: 'none', cursor: 'pointer', color: linkCopiado === item.id ? 'var(--accent)' : 'var(--muted)', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' } }, [Icon('Copy', 12), e('span', { key: 't' }, linkCopiado === item.id ? 'Link copiado' : 'Copiar link')]),
            e('a', { key: 'a', href: item.link, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'underline' } }, '#' + item.id),
          ]),
        ]),
        e('div', { key: 'info' }, [
          e('div', { key: 'a', style: { fontWeight: 600, fontSize: 14 } }, item.categoria || '(sem categoria)'),
          e('div', { key: 't', style: { color: 'var(--muted)', fontSize: 12.5, marginTop: 3, lineHeight: 1.4 } }, item.titulo),
          e('div', { key: 'm', style: { color: 'var(--muted-soft)', fontSize: 11.5, marginTop: 4 } }, `${dataBr(item.abertoEm)} · ${item.requerente || ''} · ${item.statusNome}`),
        ]),
        avisoConfianca(item) ? e('div', { key: 'confianca', role: 'status', style: { background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 10, padding: '8px 10px', color: 'var(--warn)', fontSize: 12.5, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 2 } }, [
          e('strong', { key: 't' }, avisoConfianca(item).titulo),
          e('div', { key: 'o' }, avisoConfianca(item).orientacao),
        ]) : null,
        // opinião da IA local (Administração > IA): confirma, sugere outro tipo ou encerra reaberto
        item.ia || item.reabertoIa ? e('div', { key: 'ia', className: 'chamado-ia', style: { fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' } }, [
          e('span', { key: 'r', style: { fontWeight: 600, color: 'var(--text)' } }, 'IA:'),
          e('span', { key: 't' }, item.reabertoIa
            ? `reaberto com outro pedido (${item.reabertoIa.tipoNovoNome}); rodar encerra o chamado explicando.`
            : item.ia.concorda
              ? `confirma o tipo (${Math.round(item.ia.confianca * 100)}%)${item.validadoPorIa ? '; liberado para o automático' : ''}.`
              : `${item.ia.aplicar === 'auto' ? 'trocou o tipo' : 'sugere'} ${item.tipoNome || 'sem automação'} (${Math.round(item.ia.confianca * 100)}%)${item.ia.motivo ? ': ' + item.ia.motivo : ''}`),
        ]) : null,
        item.pedirPendencia && !res ? e('div', { key: 'pend', style: { fontSize: 12, color: 'var(--warn)' } }, `Falta ${item.pedirPendencia.faltas.join(' e ')} (não está na descrição, nos acompanhamentos nem nos prints). Rodar pede no chamado e deixa Pendente, sem atribuir.`) : null,
        item.identificadorAchadoEm ? e('div', { key: 'achado', style: { fontSize: 12, color: 'var(--muted)' } }, `Identificador achado ${item.identificadorAchadoEm === 'print' ? 'no print anexado' : 'nos acompanhamentos'}.`) : null,
        item.repetirIa && !res ? e('div', { key: 'rep', style: { fontSize: 12, color: 'var(--warn)' } }, `Nova tentativa automática ${item.repetirIa.tentativa}: ${item.repetirIa.motivo || 'falha momentânea'}.`) : null,
        detalhes,
        item.problemas.length ? e('div', { key: 'prob', style: { display: 'flex', flexDirection: 'column', gap: 3 } }, item.problemas.map((p, j) => e('div', { key: j, style: { fontSize: 12, color: 'var(--warn)' } }, '⚠ ' + p))) : null,
        item.ultimaExecucao ? e('div', { key: 'ult', style: { fontSize: 11.5, color: 'var(--muted-soft)' } }, `Última execução: ${NOME_EXEC[item.ultimaExecucao.status] || item.ultimaExecucao.status} · ${dataBr(item.ultimaExecucao.em)} · ${item.ultimaExecucao.por || ''}`) : null,
        rodape,
      ]);
    }

    // ---------- tela de cards ----------
    // Só aparece o que dá pra fazer; o resto (dados faltando, sistema não
    // automatizado...) fica atrás de um link, pra análise manual.
    const itensDaEntidade = Cache.puro.filtrarPorEntidade(lista.itens, entidadeAtiva);
    const possiveis = itensDaEntidade.filter((i) => !i.problemas.length && !dispensados.includes(i.id));
    const manuais = itensDaEntidade.filter((i) => i.problemas.length);
    const naoRodar = itensDaEntidade.filter((i) => !i.problemas.length && dispensados.includes(i.id));
    const visiveis = verOutros ? [...possiveis, ...naoRodar, ...manuais] : possiveis;
    // prontos pra rodar agora: sem pendência, sem resultado nesta tela e sem execução em andamento;
    // nenhum enquanto a lista for a guardada (só a lista confirmada pelo servidor roda)
    const prontosTodos = lista.guardado ? [] : possiveis.filter((i) => !falta(i) && !deveExcluirDoAutomatico(i) && !resultados[i.id] && !execDoChamado(i.id));

    // cartões da barra do topo: mesma altura e mesmo desenho
    const cartaoTopo = (ativo, cor, fundo = 'var(--accent-soft)') => ({ display: 'flex', alignItems: 'center', gap: 10, height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, fontSize: 12.5, border: '1px solid ' + (ativo ? cor : 'var(--border)'), background: ativo ? fundo : 'var(--card, transparent)' });
    const descreverAuto = (window.ChamadosAuto && window.ChamadosAuto.descreverAuto) || (() => ({}));
    const estadoAuto = descreverAuto({
      computadores: computadoresAuto, rodando: Object.values(execucoes).filter((x) => !x.fim).reduce((n, x) => n + x.ids.length, 0),
      ultima: ultimoAuto, filaWhatsapp, modoTeste, limite: auto.limite,
    });
    // faixa abaixo da barra: confirmação, erro e estado do automático
    const faixaAuto = (confirmandoAuto || auto.ativo || erroAuto) ? e('div', { key: 'faixa', style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', marginBottom: 16, borderRadius: 10, border: '1px solid ' + (confirmandoAuto ? 'var(--warn)' : 'var(--border)'), background: confirmandoAuto ? 'var(--warn-tint)' : 'transparent', fontSize: 12.5 } }, [
      confirmandoAuto ? e('div', { key: 'conf', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
        e('span', { key: 'q', style: { color: 'var(--warn)', fontWeight: 600, flex: '1 1 260px' } }, `Ligar o modo automático? Os chamados serão processados em modo real, até ${auto.limite} por vez, sem confirmação individual.`),
        e('button', { key: 's', style: S.btnPrim, onClick: () => { ligarAuto(); setConfirmandoAuto(false); } }, 'Ligar'),
        e('button', { key: 'n', style: S.btnSec, onClick: () => setConfirmandoAuto(false) }, 'Cancelar'),
      ]) : null,
      erroAuto ? e('div', { key: 'ea', style: { color: 'var(--warn)', fontSize: 12 } }, erroAuto) : null,
      auto.ativo ? e('div', { key: 'st', className: 'auto-estado', style: { display: 'flex', flexDirection: 'column', gap: 3 } }, [
        e('div', { key: 'tt', style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--text)' } }, [
          e('span', { key: 'p', 'aria-hidden': 'true', style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 } }),
          e('span', { key: 't' }, 'Modo automático ligado'),
        ]),
        estadoAuto.computadores ? e('div', { key: 'c', style: { color: 'var(--muted)', fontSize: 12 } }, estadoAuto.computadores) : null,
        e('div', { key: 'ag', style: { color: 'var(--muted)', fontSize: 12 } }, [estadoAuto.agora, estadoAuto.ultima, estadoAuto.whatsapp].filter(Boolean).join(' ')),
        estadoAuto.aviso ? e('div', { key: 'av', style: { color: 'var(--warn)', fontSize: 12, fontWeight: 600 } }, estadoAuto.aviso) : null,
        e('div', { key: 'm', style: { color: 'var(--muted-soft)', fontSize: 11.5 } }, 'Mantenha esta aba aberta: é este navegador que roda os chamados.'),
      ]) : null,
    ]) : null;

    const cabecalho = e('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' } }, [
      e('div', { key: 't' }, [
        e('div', { key: 'n', style: { fontWeight: 600, fontSize: 19 } }, 'Chamados'),
        e('div', { key: 's', style: { color: 'var(--muted-soft)', fontSize: 12.5, marginTop: 4 } }, lista.usuario ? [
          e('span', { key: 'a' }, `${possiveis.length} para rodar · ${plural(lista.totalAbertos, 'aberto', 'abertos')} ${mostrarEntidade ? 'em ' + plural(lista.entidades.length, 'entidade', 'entidades') : 'na entidade ' + (lista.entidades[0] || 'Sistemas')} · aprovação como ${lista.usuario.nome}`),
          // o tooltip do carimbo mostra quanto durou a leitura do GLPI (só quando o servidor mede)
          lista.em ? e('span', { key: 'em', title: (!lista.guardado && Cache.puro.textoTempos(lista.tempos)) || undefined }, ` · ${lista.guardado ? 'guardada às' : 'atualizado às'} ${lista.em.toLocaleTimeString('pt-BR')}`) : null,
          // ponto discreto: o aviso do GLPI (webhook) está chegando, a lista atualiza sozinha
          lista.aoVivo ? e('span', { key: 'ao-vivo', title: 'Atualização automática ligada', 'aria-label': 'Atualização automática ligada', role: 'img', style: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', marginLeft: 6, verticalAlign: 'middle' } }) : null,
          verificadoEm ? e('span', { key: 'v' }, ' · verificado ' + verificadoEm.toLocaleTimeString('pt-BR')) : null,
          // região viva sempre presente para o leitor de tela anunciar a troca
          e('span', { key: 'vivo', 'aria-live': 'polite', style: { marginLeft: 8, color: 'var(--muted)' } }, lista.guardado && !lista.erro ? 'Atualizando…' : ''),
        ] : [
          e('span', { key: 'a' }, 'Chamados do GLPI (entidade Sistemas) que as automações resolvem.'),
          e('span', { key: 'vivo', 'aria-live': 'polite' }, ''),
        ]),
      ]),
      e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
        e('label', { key: 'mt', title: modoTeste ? 'Modo teste: nada é escrito no GLPI' : 'Modo real: o resultado é gravado no GLPI', style: { ...cartaoTopo(modoTeste, 'var(--warn)', 'var(--warn-tint)'), cursor: 'pointer' } }, [
          e('input', { key: 'c', type: 'checkbox', checked: modoTeste, onChange: (ev) => { setModoTeste(ev.target.checked); gravar(KEY_MODO_TESTE, ev.target.checked); } }),
          e('span', { key: 't', style: { fontWeight: 600, color: modoTeste ? 'var(--warn)' : 'var(--text)' } }, 'Modo teste'),
          e('span', { key: 's', style: { fontSize: 11.5, color: modoTeste ? 'var(--warn)' : 'var(--muted-soft)' } }, modoTeste ? 'não escreve no GLPI' : 'gravando no GLPI'),
        ]),
        e('div', { key: 'auto', title: 'Quantos chamados este computador pega de cada vez. Com mais computadores ligados, cada um pega a sua parte.', style: cartaoTopo(auto.ativo, 'var(--accent)') }, [
          e('label', { key: 'l', style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer', color: auto.ativo ? 'var(--accent)' : 'var(--text)' } }, [
            e('input', { key: 'c', type: 'checkbox', checked: auto.ativo, onChange: (ev) => {
              if (!ev.target.checked) { mudarAuto({ ativo: false }); setConfirmandoAuto(false); setErroAuto(''); }
              else if (modoTeste) ligarAuto();
              else { setErroAuto(''); setConfirmandoAuto(true); }
            } }),
            e('span', { key: 't' }, 'Modo automático'),
          ]),
          e('span', { key: 'a', style: { color: 'var(--muted)', fontSize: 12 } }, 'até'),
          e('input', { key: 'n', type: 'number', min: 1, max: 20, value: auto.limite, onChange: (ev) => mudarAuto({ limite: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) }), style: { ...S.input, width: 52, padding: '3px 6px', fontSize: 12.5 } }),
          e('span', { key: 'b', style: { color: 'var(--muted)', fontSize: 12 } }, 'por vez'),
        ]),
        prontosTodos.length > 1
          ? confirmandoTodos
            ? e('div', { key: 'todos', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
                e('span', { key: 'q', style: { fontSize: 12.5, color: modoTeste ? 'var(--muted)' : 'var(--warn)' } }, `Rodar ${prontosTodos.length}${modoTeste ? ' em modo teste' : ' em modo real'}?`),
                e('button', { key: 's', style: S.btnPrim, onClick: () => rodar(prontosTodos) }, 'Confirmar'),
                e('button', { key: 'n', style: S.btnSec, onClick: () => setConfirmandoTodos(false) }, 'Cancelar'),
              ])
            : e('button', { key: 'todos', style: { ...S.btnPrim, height: 40 }, onClick: () => setConfirmandoTodos(true) }, [Icon('Activity', 14, 'var(--primary-fg)'), e('span', { key: 't' }, `Rodar todos os prontos (${prontosTodos.length})`)])
          : null,
        e('button', { key: 'cfg', style: { ...S.btnSec, height: 40 }, onClick: () => Hub.abrirEditor() }, [Icon('Pencil', 14), e('span', { key: 't' }, 'Acessos')]),
        e('button', { key: 'rf', style: { ...S.btnSec, height: 40 }, disabled: lista.carregando, onClick: buscar }, [
          e('span', { key: 'i', style: { display: 'flex', animation: lista.carregando ? 'spin 1s linear infinite' : 'none' } }, Icon('RefreshCw', 14)),
          e('span', { key: 't' }, lista.carregando ? 'Buscando…' : 'Atualizar'),
        ]),
      ]),
    ]);

    const horaGuardada = lista.em ? lista.em.toLocaleTimeString('pt-BR') : 'Não informado';
    const comListaGuardada = lista.guardado && lista.itens.length > 0;
    const avisoGuardada = lista.erro && comListaGuardada
      ? e('div', { key: 'aviso-guardada', role: 'alert', style: { fontSize: 12.5, color: 'var(--warn)', marginBottom: 14 } }, `Não foi possível atualizar a lista: ${lista.erro}. Mostrando a lista guardada às ${horaGuardada}. Nada roda até a lista ser atualizada.`)
      : null;
    // filtro por entidade: só existe com mais de uma entidade na lista
    const barraEntidade = mostrarEntidade
      ? e('div', { key: 'filtro-entidade', role: 'group', 'aria-label': 'Filtrar por entidade', style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 14 } }, [
        e('span', { key: 'l', style: { color: 'var(--muted)', fontSize: 11.5 } }, 'Entidade:'),
        e('button', { key: 'todas', 'aria-pressed': entidadeAtiva === '', style: S.chip(entidadeAtiva === ''), onClick: () => setFiltroEntidade('') }, 'Todas'),
        ...lista.entidades.map((nome) => e('button', { key: nome, 'aria-pressed': entidadeAtiva === nome, style: S.chip(entidadeAtiva === nome), onClick: () => setFiltroEntidade(nome) }, nome)),
      ])
      : null;

    let corpo;
    if (lista.erro && !comListaGuardada) {
      corpo = e('div', { key: 'erro', style: { color: 'var(--error)', fontSize: 13.5, padding: '20px 0' } }, 'Falha ao buscar os chamados: ' + lista.erro);
    } else if (!lista.usuario && lista.carregando) {
      corpo = e('div', { key: 'load', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-soft)', padding: '50px 20px' } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando chamados no GLPI…']);
    } else if (!visiveis.length) {
      corpo = e('div', { key: 'vazio', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 20px', color: 'var(--muted-soft)', textAlign: 'center' } }, [
        Icon('Inbox', 34, 'var(--muted-soft)', 1.3),
        e('div', { key: 't', style: { fontSize: 14 } }, 'Nenhum chamado disponível para rodar.'),
        e('div', { key: 's', style: { fontSize: 12.5 } }, 'Aparecem aqui: Fechamento p/ cobrança, Cadastro de consultor, Cadastro de usuário (SGA/CRM), Inativação de consultor e Bloqueio de acesso da entidade Sistemas.'),
      ]);
    } else {
      corpo = e('div', { key: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 } }, visiveis.map(card));
    }

    const extras = [];
    if (manuais.length || naoRodar.length) {
      extras.push(e('button', { key: 'outros', style: { ...S.link, marginTop: 14 }, onClick: () => setVerOutros((v) => !v) },
        verOutros ? 'Mostrar apenas os disponíveis para rodar' : `Exibir também ${manuais.length ? `${manuais.length} para análise manual` : ''}${manuais.length && naoRodar.length ? ' e ' : ''}${naoRodar.length ? `${naoRodar.length} ${naoRodar.length === 1 ? 'marcado' : 'marcados'} como "Não rodar"` : ''}`));
    }
    if (mensagensGerais.length) {
      extras.push(e('div', { key: 'msgs', style: { ...S.card, marginTop: 18 } }, mensagensGerais.map((m, i) =>
        e('div', { key: i }, [
          e('div', { key: 'l', style: S.label }, 'Mensagem geral do fechamento ' + m.periodo),
          e('textarea', { key: 't', readOnly: true, value: m.texto, rows: Math.min(18, m.texto.split('\n').length + 1), style: { ...S.input, resize: 'vertical' } }),
          e('button', { key: 'c', style: { ...S.link, marginTop: 6 }, onClick: () => navigator.clipboard && navigator.clipboard.writeText(m.texto) }, 'Copiar'),
        ])
      )));
    }
    const listaExec = Object.values(execucoes).reverse();
    if (listaExec.length) {
      extras.push(e('div', { key: 'execs', style: { ...S.card, marginTop: 18, gap: 8 } }, [
        e('div', { key: 'h', style: { fontWeight: 600, fontSize: 13.5 } }, `Execuções${rodandoAlgo ? ` · ${listaExec.filter((x) => !x.fim).length} em execução` : ''}`),
        ...listaExec.map((x) => {
          const aberto = !!logsAbertos[x.jobId];
          return e('div', { key: x.jobId, style: { borderTop: '1px solid var(--border)', paddingTop: 8 } }, [
            e('div', { key: 'r', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
              e('div', { key: 't', style: { fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 } }, [
                !x.fim ? e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 13)) : null,
                e('span', { key: 'n' }, `${x.ids.map((id) => '#' + id).join(', ')} · ${x.fim ? (x.fim.error ? 'erro' : 'concluída') : 'em execução…'}`),
              ]),
              e('div', { key: 'b', style: { display: 'flex', gap: 12 } }, [
                !x.fim ? e('button', { key: 'p', style: { ...S.link, color: 'var(--error)' }, onClick: () => fetch(`${SERVICO}/api/parar/${x.jobId}`, { method: 'POST' }).catch(() => {}) }, 'Parar') : null,
                e('button', { key: 'v', style: S.link, onClick: () => setLogsAbertos((l) => ({ ...l, [x.jobId]: !aberto })) }, aberto ? 'Ocultar log' : 'Ver log'),
              ]),
            ]),
            aberto ? e('pre', { key: 'l', style: { margin: '8px 0 0', maxHeight: 260, overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 11.5, fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'pre-wrap', color: 'var(--muted)' } }, x.linhas.join('\n') || 'Aguardando…') : null,
          ]);
        }),
      ]));
    }

    return e('div', { style: { padding: '28px 24px 96px', maxWidth: 1200, margin: '0 auto' } }, [cabecalho, faixaAuto, avisoGuardada, barraEntidade, corpo, ...extras, verChamado ? e(VerChamado, { key: 'ver-chamado', item: verChamado, userToken: acessos.userToken, onFechar: () => setVerChamado(null) }) : null]);
  }

  window.ChamadosView = ChamadosView;
  window.VerChamado = VerChamado; // a aba Resultados abre o mesmo painel
  window.ChamadosSenhas = { nomeSistema, avisoSenha, bloqueioSenha, detalhesSenha, SELOS_REGRA, rotuloConfianca, deveExcluirDoAutomatico, avisoConfianca, montarPedidoItem }; // testados em app/test
})();
