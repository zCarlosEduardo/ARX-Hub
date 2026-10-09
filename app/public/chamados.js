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
  const KEY_DISPENSADOS = 'arxhub_chamados_dispensados';
  const KEY_MODO_TESTE = 'arxhub_chamados_modo_teste';
  // identifica esta aba pro servidor (a "vaga" do modo automático é de um computador de cada vez)
  const CLIENTE_ID = (() => {
    const novo = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      let v = sessionStorage.getItem('arxhub_chamados_cliente');
      if (!v) { v = novo(); sessionStorage.setItem('arxhub_chamados_cliente', v); }
      return v;
    } catch { return novo(); }
  })();
  const KEY_AUTO = 'arxhub_chamados_auto'; // só o limite e os tipos; "ligado" nunca volta sozinho
  const SERVICO = `${location.protocol}//${location.hostname}:4013`;

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
  const dataBr = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

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
  const COR_TIPO = { fechamento: '#F5A524', cadastro_consultor: '#6DBE6A', cadastro_usuario: '#3B82F6', inativacao_consultor: '#F5514D', bloqueio_acesso: '#8B5CF6', cadastro_modelo: '#14B8A6', erro_exportar_modelo: '#0EA5E9' };

  /** Login do SGA que cobre a empresa (o primeiro que a tiver marcada). */
  const loginDaEmpresa = (sgas, chave) => Hub.loginDaEmpresa(sgas, chave);

  // ---------- Aba ----------
  function ChamadosView() {
    const [acessos, setAcessos] = useState(Hub.ler);
    const [lista, setLista] = useState({ carregando: false, erro: null, itens: [], usuario: null, outros: 0, totalAbertos: 0, perfis: [], em: null });
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
    const [auto, setAuto] = useState(() => ({ limite: 5, fora: [], ...ler(KEY_AUTO, {}), ativo: false }));
    const [confirmandoAuto, setConfirmandoAuto] = useState(false);
    const [erroAuto, setErroAuto] = useState('');
    const autoRef = useRef(new Set()); // chamados que o automático já tentou nesta tela (não repete, mesmo com erro)
    const mudarAuto = (campos) => setAuto((a) => {
      const n = { ...a, ...campos };
      gravar(KEY_AUTO, { limite: n.limite, fora: n.fora });
      return n;
    });
    const fontesRef = useRef(new Map());
    const assinaturaRef = useRef(''); // assinatura dos chamados abertos na última atualização
    const rodandoAlgo = Object.values(execucoes).some((x) => !x.fim);
    const execDoChamado = (id) => Object.values(execucoes).find((x) => !x.fim && x.ids.includes(id)) || null;
    const pronto = !!acessos.pronto;

    // salvo em "Meus acessos" (cabeçalho), no botão "Acessos" daqui ou em outra aba
    useEffect(() => Hub.aoMudar(setAcessos), []);

    const buscar = useCallback(async () => {
      if (!acessos.userToken) return;
      setLista((l) => ({ ...l, carregando: true, erro: null }));
      try {
        const d = await api('/api/chamados', { glpi: { userToken: acessos.userToken } });
        assinaturaRef.current = d.assinatura || '';
        setLista({ carregando: false, erro: null, itens: d.itens, usuario: d.usuario, outros: d.outros, totalAbertos: d.totalAbertos, perfis: d.perfis || [], em: new Date() });
      } catch (err) {
        setLista((l) => ({ ...l, carregando: false, erro: err.message }));
      }
    }, [acessos.userToken]);

    // puxa ao entrar e de 2 em 2 minutos (menos durante uma execução)
    useEffect(() => {
      if (!pronto) return undefined;
      buscar();
      // a cada 30 s só pergunta ao servidor se algo mudou no GLPI (1 busca leve) e recarrega a lista
      // inteira só se mudou; por segurança recarrega tudo a cada 5 min mesmo sem mudança
      let volta = 0;
      const t = setInterval(async () => {
        if (fontesRef.current.size) return;
        volta++;
        try {
          const m = await api('/api/mudou', { glpi: { userToken: acessos.userToken } });
          if (volta % 10 === 0 || m.assinatura !== assinaturaRef.current) buscar();
        } catch {
          // servidor fora por um instante: tenta de novo no próximo ciclo
        }
      }, 30000);
      return () => clearInterval(t);
    }, [pronto, buscar]);
    useEffect(() => () => fontesRef.current.forEach((f) => f.close()), []);

    const escolha = (item) => {
      const atual = escolhas[item.id] || {};
      return {
        dataInicial: atual.dataInicial || (item.periodo && item.periodo.dataInicial),
        dataFinal: atual.dataFinal || (item.periodo && item.periodo.dataFinal),
        roleId: atual.roleId || '',
        extrasAlt: atual.extrasAlt || (item.altStatus ? item.altStatus.secundarias.filter((b) => b.citada).map((b) => b.chave) : []),
        baseCrm: atual.baseCrm !== undefined ? atual.baseCrm : (item.baseCrm && (item.baseCrm.pedida || item.baseCrm.principal)) || '',
        cooperativa: atual.cooperativa !== undefined ? atual.cooperativa : (item.cooperativa && (item.cooperativa.exata || (item.cooperativa.sugestoes.length === 1 ? item.cooperativa.sugestoes[0] : ''))) || '',
        loginSga: atual.loginSga !== undefined ? atual.loginSga : (item.usuario && item.usuario.loginSugerido) || '',
        empresasCrm: atual.empresasCrm || (item.associacaoUsuario && item.associacaoUsuario.empresasCrm.length === 1 ? item.associacaoUsuario.empresasCrm : []),
      };
    };
    const mudarEscolha = (id, campos) => setEscolhas((x) => ({ ...x, [id]: { ...(x[id] || {}), ...campos } }));

    /** O que ainda falta escolher no card pra poder rodar. */
    function falta(item) {
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

    async function rodar(itensParaRodar) {
      setConfirmando(null);
      setConfirmandoTodos(false);
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
            return { id: item.id, dataInicial: c.dataInicial, dataFinal: c.dataFinal, roleId: c.roleId ? Number(c.roleId) : undefined, loginSga: c.loginSga, empresasCrm: c.empresasCrm, cooperativa: c.cooperativa || undefined, baseCrm: c.baseCrm || undefined, extrasAlt: item.altStatus && item.altStatus.secundarias.length ? c.extrasAlt : undefined };
          }),
        });
        const jobId = d.jobId;
        // chamados que já estavam rodando em outra execução (outro computador): não rodam aqui
        const ign = new Map((d.ignorados || []).map((i) => [i.id, i.por]));
        if (ign.size) setResultados((r) => ({ ...r, ...Object.fromEntries([...ign].map(([id, por]) => [id, { ok: false, status: 'nao_rodou', texto: `Já estava sendo executado por outra execução${por ? ` (${por})` : ''}. Atualize a lista pra ver o resultado.` }])) }));
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
          else if (p.type === 'resultado') setResultados((r) => ({ ...r, [p.item.id]: p.item }));
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
            mudar((x) => ({ ...x, fim: x.fim || { error: 'conexão com o serviço caiu' } }));
          }
        };
      } catch (err) {
        setResultados((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, { ok: false, status: 'erro', texto: `Não iniciou: ${err.message}` }])) }));
      }
    }

    function dispensar(id, sim) {
      const novo = sim ? [...new Set([...dispensados, id])] : dispensados.filter((x) => x !== id);
      setDispensados(novo);
      gravar(KEY_DISPENSADOS, novo);
    }

    /** Pega a vaga do automático no servidor (só um computador de cada vez) e liga. */
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
    // com o automático ligado: renova a vaga a cada 30 s (se perder, desliga); ao desligar/fechar, solta
    useEffect(() => {
      if (!auto.ativo) return undefined;
      const renovar = () => api('/api/auto/assumir', { clienteId: CLIENTE_ID, quem: lista.usuario && lista.usuario.nome }).catch((err) => {
        if (/^HTTP|Failed|NetworkError/.test(err.message)) return; // servidor fora um instante: tenta de novo
        setErroAuto(err.message);
        mudarAuto({ ativo: false });
      });
      const t = setInterval(renovar, 30000);
      const soltar = () => { try { fetch(SERVICO + '/api/auto/soltar', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: CLIENTE_ID }) }); } catch { /* sem rede */ } };
      window.addEventListener('beforeunload', soltar);
      return () => { clearInterval(t); window.removeEventListener('beforeunload', soltar); soltar(); };
    }, [auto.ativo]); // eslint-disable-line

    // Automático: a cada atualização da lista (e quando uma execução termina), pega até
    // "limite" chamados prontos de uma vez. Pula: com pendência, dispensados, tipos
    // desmarcados, já tentados aqui e os que deram erro na última execução (esses voltam
    // só no "Rodar novamente", pra não ficar repetindo o mesmo erro).
    useEffect(() => {
      if (!auto.ativo || !pronto || lista.carregando || rodandoAlgo) return;
      const lote = lista.itens
        .filter((i) => !i.problemas.length && !i.porDescricao && !dispensados.includes(i.id) && !auto.fora.includes(i.tipo) && !autoRef.current.has(i.id) && !resultados[i.id] && !execDoChamado(i.id) && !falta(i)
          && !(i.ultimaExecucao && ['erro', 'executando'].includes(i.ultimaExecucao.status)))
        .slice(0, auto.limite);
      if (!lote.length) return;
      lote.forEach((i) => autoRef.current.add(i.id));
      rodar(lote);
    }, [auto, pronto, lista.carregando, lista.itens, rodandoAlgo, resultados, dispensados]); // eslint-disable-line

    if (!pronto) {
      return e('div', { style: { padding: '28px 24px 96px' } }, e(Hub.EditorAcessos, { exigirChamados: true, moldura: 'card' }));
    }

    // ---------- card de um chamado ----------
    function card(item, i) {
      const res = resultados[item.id];
      const execEste = execDoChamado(item.id);
      const rodandoEste = !!execEste;
      const c = escolha(item);
      const pendente = item.problemas.length ? null : falta(item);
      const pode = !item.problemas.length && !pendente;

      let detalhes = null;
      if (item.tipo === 'fechamento' && item.periodo) {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 } }, [
          e('div', { key: 'p' }, [e('strong', { key: 's' }, item.periodo.rotulo), e('span', { key: 'o', style: { color: 'var(--muted)' } }, ' · ' + item.periodo.origem)]),
          e('div', { key: 'd', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } }, ['dataInicial', 'dataFinal'].map((k) =>
            e('input', { key: k, type: 'date', value: c[k] || '', onChange: (ev) => mudarEscolha(item.id, { [k]: ev.target.value }), style: { ...S.input, padding: '6px 8px', fontSize: 12 } })
          )),
        ]);
      } else if (item.tipo === 'erro_exportar_modelo') {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, item.placa ? `Placa ${item.placa}` : `Card ${item.codigoCard || '?'}`),
          item.descricaoErro ? e('div', { key: 'd', style: { color: 'var(--muted)' } }, item.descricaoErro) : null,
          e('div', { key: 'p', style: { color: 'var(--muted)' } }, 'Busca o código FIPE no card do PowerCRM (só roda com 1 card) e cadastra o modelo no SGA.'),
          e('div', { key: 'r', style: { color: 'var(--warn)', fontSize: 12 } }, 'Reconhecido pela descrição: confira antes de rodar (fica fora do automático).'),
        ]);
      } else if (item.tipo === 'cadastro_modelo' && item.modelo) {
        const f = item.modelo.fipe;
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, `FIPE ${item.modelo.codigoFipe}`),
          f ? e('div', { key: 'm' }, `${f.marca} · ${f.modelo}`) : null,
          f ? e('div', { key: 't', style: { color: 'var(--muted)' } }, `${f.tipoNome}${f.combustivel ? ' · ' + f.combustivel : ''} · cadastra só no SGA`) : null,
          item.modelo.fipeErro ? e('div', { key: 'e', style: { color: 'var(--warn)' } }, 'Não consegui consultar a FIPE agora: ' + item.modelo.fipeErro) : null,
        ]);
      } else if (item.tipo === 'cadastro_consultor' && item.consultor) {
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5 } }, [
          e('strong', { key: 'n' }, item.consultor.nome || '?'),
          e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${item.consultor.cpfMascarado || '?'} · ${item.consultor.email || 'sem e-mail'}`),
          item.cooperativa
            ? e('div', { key: 'k', style: { marginTop: 6 } }, [
                e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, `Cooperativa no SGA — o chamado diz "${item.cooperativa.informada}"`),
                e('select', { key: 's', value: c.cooperativa, onChange: (ev) => mudarEscolha(item.id, { cooperativa: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } }, [
                  e('option', { key: '', value: '' }, 'Escolha a cooperativa…'),
                  item.cooperativa.sugestoes.length && !item.cooperativa.exata
                    ? e('optgroup', { key: 'sug', label: 'Parecidas com o que o chamado diz' }, item.cooperativa.sugestoes.map((n) => e('option', { key: n, value: n }, n)))
                    : null,
                  e('optgroup', { key: 'todas', label: 'Todas do SGA' }, item.cooperativa.opcoes.map((n) => e('option', { key: n, value: n }, n))),
                ]),
                item.cooperativa.exata ? e('div', { key: 'ok', style: { color: 'var(--muted)', fontSize: 11.5, marginTop: 3 } }, 'O nome do chamado é igual ao do SGA.') : null,
              ])
            : e('div', { key: 'k' }, 'Cooperativa: ' + (item.consultor.cooperativa || '?')),
          item.baseCrm
            ? e('div', { key: 'crm', style: { marginTop: 6 } }, [
                e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Base do PowerCRM'),
                e('select', { key: 's', value: c.baseCrm, onChange: (ev) => mudarEscolha(item.id, { baseCrm: ev.target.value }), style: { ...S.input, padding: '7px 9px', fontSize: 12.5 } },
                  item.baseCrm.opcoes.map((b, i) => e('option', { key: b, value: b }, i === 0 ? b + ' (principal)' : b))),
                e('div', { key: 'n', style: { color: 'var(--muted)', fontSize: 11.5, marginTop: 3 } }, item.baseCrm.pedida ? 'O chamado pede esta base.' : 'O chamado não diz a base: vale a principal.'),
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
          e('strong', { key: 'n' }, p.nome || '?'),
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
          p.outrosSistemas ? e('div', { key: 'o', style: { color: 'var(--warn)', fontSize: 12 } }, 'Cita chats/outros sistemas: ficam fora (só SGA e CRM); vai como observação na solução.') : null,
        ]);
      } else if (item.tipo === 'cadastro_usuario' && item.usuario) {
        const u = item.usuario;
        const bases = (item.associacaoUsuario && item.associacaoUsuario.empresasCrm) || [];
        detalhes = e('div', { key: 'det', style: { fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'i' }, [
            e('span', { key: 's', style: S.tag(u.sistema === 'SGA' ? '#3B82F6' : '#F5514D') }, u.sistema === 'CRM' ? 'PowerCRM' : u.sistema),
            ' ',
            e('strong', { key: 'n' }, u.nomeCadastro || u.nome || '?'), // como vai ficar cadastrado ("ARX - ...")
            e('div', { key: 'c', style: { color: 'var(--muted)' } }, `CPF ${u.cpfMascarado || '?'} · ${u.email || 'sem e-mail'}`),
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
            e('div', { key: 'l', style: { ...S.label, marginBottom: 4 } }, 'Base do PowerCRM'),
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
          e('div', { key: 's', style: { fontWeight: 600, color: res.status === 'erro' ? 'var(--error)' : res.status === 'teste' || res.status === 'nao_rodou' ? 'var(--warn)' : 'var(--accent)' } },
            res.status === 'teste'
              ? `Teste: ${res.ok ? 'daria certo' : 'daria erro'}`
              : res.status === 'concluido'
                ? 'Solucionado no GLPI'
                : res.status === 'nao_rodou'
                  ? 'Não rodou (falta configurar)'
                  : 'Erro: devolutiva no chamado (pendente)'),
          e('pre', { key: 't', style: { whiteSpace: 'pre-wrap', margin: '6px 0 0', fontFamily: 'inherit', color: 'var(--muted)' } }, res.texto),
          res.status !== 'concluido'
            ? e('button', { key: 'again', style: { ...S.btnSec, marginTop: 8, width: '100%' }, onClick: () => { setResultados((r) => { const n = { ...r }; delete n[item.id]; return n; }); if (pode) setConfirmando(item.id); } }, [Icon('RefreshCw', 14), e('span', { key: 't' }, 'Rodar novamente')])
            : null,
        ]);
      } else if (rodandoEste) {
        rodape = e('div', { key: 'rod', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' } }, [
          e('span', { key: 'sp', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 14)),
          e('span', { key: 't', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (execEste.linhas[execEste.linhas.length - 1] || 'Rodando…').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')),
        ]);
      } else if (confirmando === item.id) {
        rodape = e('div', { key: 'conf', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          e('div', { key: 'q', style: { fontSize: 12.5, color: modoTeste ? 'var(--muted)' : 'var(--warn)' } }, modoTeste ? 'Rodar em modo teste (não escreve no GLPI)?' : 'Rodar de verdade? O chamado fica atribuído a você e é solucionado no GLPI.'),
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 's', style: { ...S.btnPrim, flex: 1 }, onClick: () => rodar([item]) }, 'Sim, rodar'),
            e('button', { key: 'n', style: { ...S.btnSec, flex: 1 }, onClick: () => setConfirmando(null) }, 'Cancelar'),
          ]),
        ]);
      } else {
        const bloqueado = !pode;
        rodape = e('div', { key: 'btns', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, [
          pendente ? e('div', { key: 'f', style: { fontSize: 12, color: 'var(--warn)' } }, pendente) : null,
          e('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            e('button', { key: 'r', disabled: bloqueado, style: { ...S.btnPrim, flex: 1, opacity: bloqueado ? 0.45 : 1, cursor: bloqueado ? 'not-allowed' : 'pointer' }, onClick: () => setConfirmando(item.id) }, [Icon('Activity', 14, 'var(--primary-fg)'), e('span', { key: 't' }, 'Rodar')]),
            e('button', { key: 'n', style: { ...S.btnSec, flex: 1 }, onClick: () => dispensar(item.id, !dispensados.includes(item.id)) }, dispensados.includes(item.id) ? 'Voltar pra lista' : 'Não rodar'),
          ]),
        ]);
      }

      return e('div', { key: item.id, style: { ...S.card, animationDelay: Math.min(i, 10) * 35 + 'ms', borderColor: rodandoEste ? 'var(--accent)' : 'var(--border)' } }, [
        e('div', { key: 'top', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
          e('span', { key: 'tipo', style: S.tag(COR_TIPO[item.tipo] || '#6b7280') }, item.tipoNome),
          e('a', { key: 'n', href: item.link, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'underline' } }, '#' + item.id),
        ]),
        e('div', { key: 'info' }, [
          e('div', { key: 'a', style: { fontWeight: 600, fontSize: 14 } }, item.categoria || '(sem categoria)'),
          e('div', { key: 't', style: { color: 'var(--muted)', fontSize: 12.5, marginTop: 3, lineHeight: 1.4 } }, item.titulo),
          e('div', { key: 'm', style: { color: 'var(--muted-soft)', fontSize: 11.5, marginTop: 4 } }, `${dataBr(item.abertoEm)} · ${item.requerente || ''} · ${item.statusNome}`),
        ]),
        detalhes,
        item.problemas.length ? e('div', { key: 'prob', style: { display: 'flex', flexDirection: 'column', gap: 3 } }, item.problemas.map((p, j) => e('div', { key: j, style: { fontSize: 12, color: 'var(--warn)' } }, '⚠ ' + p))) : null,
        item.ultimaExecucao ? e('div', { key: 'ult', style: { fontSize: 11.5, color: 'var(--muted-soft)' } }, `Última execução: ${item.ultimaExecucao.status} · ${dataBr(item.ultimaExecucao.em)} · ${item.ultimaExecucao.por || ''}`) : null,
        rodape,
      ]);
    }

    // ---------- tela de cards ----------
    // Só aparece o que dá pra fazer; o resto (dados faltando, sistema não
    // automatizado...) fica atrás de um link, pra análise manual.
    const possiveis = lista.itens.filter((i) => !i.problemas.length && !dispensados.includes(i.id));
    const manuais = lista.itens.filter((i) => i.problemas.length);
    const naoRodar = lista.itens.filter((i) => !i.problemas.length && dispensados.includes(i.id));
    const visiveis = verOutros ? [...possiveis, ...naoRodar, ...manuais] : possiveis;
    // prontos pra rodar agora: sem pendência, sem resultado nesta tela e sem execução em andamento
    const prontosTodos = possiveis.filter((i) => !falta(i) && !resultados[i.id] && !execDoChamado(i.id));

    const cabecalho = e('div', { key: 'head', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' } }, [
      e('div', { key: 't' }, [
        e('div', { key: 'n', style: { fontWeight: 600, fontSize: 19 } }, 'Chamados'),
        e('div', { key: 's', style: { color: 'var(--muted-soft)', fontSize: 12.5, marginTop: 4 } },
          lista.usuario
            ? `${possiveis.length} pra rodar · ${lista.totalAbertos} abertos na entidade Sistemas · você aprova como ${lista.usuario.nome}${lista.em ? ' · atualizado ' + lista.em.toLocaleTimeString('pt-BR') : ''}`
            : 'Chamados do GLPI (entidade Sistemas) que as automações resolvem.'),
      ]),
      e('div', { key: 'a', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
        e('label', { key: 'mt', style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, padding: '7px 11px', borderRadius: 8, cursor: 'pointer', border: '1px dashed ' + (modoTeste ? 'var(--warn)' : 'var(--border)'), background: modoTeste ? 'var(--warn-tint)' : 'transparent', color: modoTeste ? 'var(--warn)' : 'var(--muted)' } }, [
          e('input', { key: 'c', type: 'checkbox', checked: modoTeste, onChange: (ev) => { setModoTeste(ev.target.checked); gravar(KEY_MODO_TESTE, ev.target.checked); } }),
          e('span', { key: 't' }, modoTeste ? 'Modo teste (não escreve no GLPI)' : 'Modo real'),
        ]),
        e('div', { key: 'auto', style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 11px', borderRadius: 8, border: '1px solid ' + (auto.ativo ? 'var(--accent)' : 'var(--border)'), fontSize: 12.5 } }, [
          e('div', { key: 'l1', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('label', { key: 'l', style: { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, cursor: 'pointer', color: auto.ativo ? 'var(--accent)' : 'var(--muted)' } }, [
              e('input', { key: 'c', type: 'checkbox', checked: auto.ativo, onChange: (ev) => {
                if (!ev.target.checked) { mudarAuto({ ativo: false }); setConfirmandoAuto(false); setErroAuto(''); }
                else if (modoTeste) ligarAuto();
                else { setErroAuto(''); setConfirmandoAuto(true); }
              } }),
              e('span', { key: 't' }, 'Modo automático'),
            ]),
            e('span', { key: 'a', style: { color: 'var(--muted)' } }, 'até'),
            e('input', { key: 'n', type: 'number', min: 1, max: 20, value: auto.limite, onChange: (ev) => mudarAuto({ limite: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) }), style: { ...S.input, width: 56, padding: '4px 6px', fontSize: 12.5 } }),
            e('span', { key: 'b', style: { color: 'var(--muted)' } }, 'por vez'),
          ]),
          confirmandoAuto ? e('div', { key: 'conf', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
            e('span', { key: 'q', style: { color: 'var(--warn)' } }, `Ligar? Vai rodar DE VERDADE, até ${auto.limite} por vez, sem pedir confirmação.`),
            e('button', { key: 's', style: S.btnPrim, onClick: () => { ligarAuto(); setConfirmandoAuto(false); } }, 'Ligar'),
            e('button', { key: 'n', style: S.btnSec, onClick: () => setConfirmandoAuto(false) }, 'Cancelar'),
          ]) : null,
          (() => {
            const tipos = [...new Map(lista.itens.filter((i) => i.tipo).map((i) => [i.tipo, i.tipoNome])).entries()];
            return tipos.length ? e('div', { key: 'tp', style: { display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' } }, [
              e('span', { key: 'l', style: { color: 'var(--muted)', fontSize: 11.5 } }, 'Rodam sozinhos:'),
              ...tipos.map(([tipo, nome]) => {
                const marcado = !auto.fora.includes(tipo);
                return e('button', { key: tipo, style: S.chip(marcado), onClick: () => mudarAuto({ fora: marcado ? [...auto.fora, tipo] : auto.fora.filter((x) => x !== tipo) }) }, nome);
              }),
            ]) : null;
          })(),
          erroAuto ? e('div', { key: 'ea', style: { color: 'var(--warn)', fontSize: 12 } }, erroAuto) : null,
          auto.ativo ? e('div', { key: 'st', style: { color: 'var(--muted-soft)', fontSize: 11.5 } }, `Ligado: a cada atualização (2 min) roda os prontos, até ${auto.limite} por vez. Deixe esta aba aberta.`) : null,
        ]),
        prontosTodos.length > 1
          ? confirmandoTodos
            ? e('div', { key: 'todos', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
                e('span', { key: 'q', style: { fontSize: 12.5, color: modoTeste ? 'var(--muted)' : 'var(--warn)' } }, `Rodar ${prontosTodos.length}${modoTeste ? ' em modo teste' : ' de verdade'}?`),
                e('button', { key: 's', style: S.btnPrim, onClick: () => rodar(prontosTodos) }, 'Sim'),
                e('button', { key: 'n', style: S.btnSec, onClick: () => setConfirmandoTodos(false) }, 'Cancelar'),
              ])
            : e('button', { key: 'todos', style: S.btnPrim, onClick: () => setConfirmandoTodos(true) }, [Icon('Activity', 14, 'var(--primary-fg)'), e('span', { key: 't' }, `Rodar todos os prontos (${prontosTodos.length})`)])
          : null,
        e('button', { key: 'cfg', style: S.btnSec, onClick: () => Hub.abrirEditor() }, [Icon('Pencil', 14), e('span', { key: 't' }, 'Acessos')]),
        e('button', { key: 'rf', style: S.btnSec, disabled: lista.carregando, onClick: buscar }, [
          e('span', { key: 'i', style: { display: 'flex', animation: lista.carregando ? 'spin 1s linear infinite' : 'none' } }, Icon('RefreshCw', 14)),
          e('span', { key: 't' }, lista.carregando ? 'Buscando…' : 'Atualizar'),
        ]),
      ]),
    ]);

    let corpo;
    if (lista.erro) {
      corpo = e('div', { key: 'erro', style: { color: 'var(--error)', fontSize: 13.5, padding: '20px 0' } }, 'Não consegui buscar os chamados: ' + lista.erro);
    } else if (!lista.usuario && lista.carregando) {
      corpo = e('div', { key: 'load', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted-soft)', padding: '50px 20px' } }, [e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 22, 'var(--accent)')), 'Buscando chamados no GLPI…']);
    } else if (!visiveis.length) {
      corpo = e('div', { key: 'vazio', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 20px', color: 'var(--muted-soft)', textAlign: 'center' } }, [
        Icon('Inbox', 34, 'var(--muted-soft)', 1.3),
        e('div', { key: 't', style: { fontSize: 14 } }, 'Nenhum chamado pra rodar agora.'),
        e('div', { key: 's', style: { fontSize: 12.5 } }, 'Aparecem aqui: Fechamento p/ cobrança, Cadastro de consultor, Cadastro de usuário (SGA/CRM), Inativação de consultor e Bloqueio de acesso da entidade Sistemas.'),
      ]);
    } else {
      corpo = e('div', { key: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 } }, visiveis.map(card));
    }

    const extras = [];
    if (manuais.length || naoRodar.length) {
      extras.push(e('button', { key: 'outros', style: { ...S.link, marginTop: 14 }, onClick: () => setVerOutros((v) => !v) },
        verOutros ? 'Mostrar só os que dá pra rodar' : `Ver também ${manuais.length ? `${manuais.length} que precisam de análise manual` : ''}${manuais.length && naoRodar.length ? ' e ' : ''}${naoRodar.length ? `${naoRodar.length} marcados como "Não rodar"` : ''}`));
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
        e('div', { key: 'h', style: { fontWeight: 600, fontSize: 13.5 } }, `Execuções${rodandoAlgo ? ` · ${listaExec.filter((x) => !x.fim).length} rodando` : ''}`),
        ...listaExec.map((x) => {
          const aberto = !!logsAbertos[x.jobId];
          return e('div', { key: x.jobId, style: { borderTop: '1px solid var(--border)', paddingTop: 8 } }, [
            e('div', { key: 'r', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } }, [
              e('div', { key: 't', style: { fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 } }, [
                !x.fim ? e('span', { key: 's', style: { display: 'flex', animation: 'spin 1s linear infinite' } }, Icon('Loader2', 13)) : null,
                e('span', { key: 'n' }, `${x.ids.map((id) => '#' + id).join(', ')} · ${x.fim ? (x.fim.error ? 'erro' : 'concluída') : 'rodando…'}`),
              ]),
              e('div', { key: 'b', style: { display: 'flex', gap: 12 } }, [
                !x.fim ? e('button', { key: 'p', style: { ...S.link, color: 'var(--error)' }, onClick: () => fetch(`${SERVICO}/api/parar/${x.jobId}`, { method: 'POST' }).catch(() => {}) }, 'Parar') : null,
                e('button', { key: 'v', style: S.link, onClick: () => setLogsAbertos((l) => ({ ...l, [x.jobId]: !aberto })) }, aberto ? 'Esconder log' : 'Ver log'),
              ]),
            ]),
            aberto ? e('pre', { key: 'l', style: { margin: '8px 0 0', maxHeight: 260, overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 11.5, fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'pre-wrap', color: 'var(--muted)' } }, x.linhas.join('\n') || 'Aguardando…') : null,
          ]);
        }),
      ]));
    }

    return e('div', { style: { padding: '28px 24px 96px', maxWidth: 1200, margin: '0 auto' } }, [cabecalho, corpo, ...extras]);
  }

  window.ChamadosView = ChamadosView;
})();
