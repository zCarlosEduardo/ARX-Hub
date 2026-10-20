// Registro das execuções manuais: o proxy (proxy.js) avisa quando a tela de uma automação inicia uma execução e repassa
// o SSE de logs que o navegador abre; aqui gravamos em hub_execucoes e acompanhamos até o fim. Nenhuma automação muda.
//
// Como o fim é descoberto (nesta ordem): GET /api/status/:jobId da própria automação, consultado pelo Hub (não liga a
// tela ao vivo, que só transmite com visualizador no SSE); sem essa rota, o evento `done` do SSE que passa pelo proxy;
// nos cadastros em Python (sem jobId), o campo `executando` da rota de config. Sem resposta em 6 h: "desconhecido".
const { rotaDeInicio, ehModoTeste, itensDoInicio, lerResultado } = require('./execucoes');

const LIMITE_MS = 6 * 60 * 60 * 1000;

const jsonOuNada = (buf) => {
  try {
    return buf && buf.length ? JSON.parse(buf.toString('utf8')) : null;
  } catch {
    return null; // corpo que não é JSON (multipart, zip): o início é lido pelos cabeçalhos
  }
};

/** Leitor de SSE em pedaços: junta as linhas e chama `aoEvento(objeto)` para cada `data:` com JSON. */
function criarLeitorSse(aoEvento) {
  let resto = '';
  return (pedaco) => {
    resto += pedaco.toString('utf8');
    const blocos = resto.split('\n\n');
    resto = blocos.pop();
    for (const bloco of blocos) {
      const dados = bloco.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!dados) continue;
      try {
        aoEvento(JSON.parse(dados));
      } catch {
        // linha de texto (cadastros em Python) ou JSON quebrado: não é o evento final
      }
    }
    if (resto.length > 1e6) resto = ''; // quadro de tela ao vivo gigante sem fim de bloco: não acumula memória
  };
}

/**
 * @param {{ repo: {inserir, finalizar, marcarInterrompidas}, buscar?: Function, intervaloMs?: number, limiteMs?: number }} deps
 *   buscar(url) -> Promise<{status, json}> (padrão: fetch com tempo limite)
 */
function criarRegistroExecucoes({ repo, buscar, intervaloMs = 10000, limiteMs = LIMITE_MS, log = console.error }) {
  const buscarJson = buscar || (async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  const acompanhando = new Map(); // `${automacaoId}:${jobId}` -> estado

  const urlDe = (automacao, caminho) => String(automacao.url).replace(/\/+$/, '') + caminho;

  async function finalizar(estado, r, detalhe) {
    if (estado.fim) return;
    estado.fim = true;
    clearTimeout(estado.timer);
    acompanhando.delete(estado.chave);
    try {
      await repo.finalizar(estado.id, { ...r, detalhe: detalhe || '' });
    } catch (err) {
      log('[execucoes] não gravou o fim', err && err.message);
    }
  }

  function agendar(estado, verificar) {
    if (estado.fim) return;
    if (Date.now() - estado.inicio > limiteMs) {
      finalizar(estado, { situacao: 'desconhecido', itens: estado.itens || 0, concluidos: 0, erros: 0 }, 'Sem retorno da automação em 6 horas.');
      return;
    }
    estado.timer = setTimeout(() => verificar().catch(() => agendar(estado, verificar)), intervaloMs);
    if (estado.timer.unref) estado.timer.unref();
  }

  function acompanharJob(estado) {
    const verificar = async () => {
      if (estado.fim) return;
      const { status, json } = await buscarJson(urlDe(estado.automacao, `/api/status/${encodeURIComponent(estado.jobId)}`));
      if (status === 404) {
        // automação sem /api/status/:jobId: o fim vem pelo SSE; aqui só vigia o prazo de 6 h
        const vigiar = async () => agendar(estado, vigiar);
        return agendar(estado, vigiar);
      }
      if (json && json.running === false) return finalizar(estado, lerResultado(json, estado.itensSse));
      agendar(estado, verificar);
    };
    agendar(estado, verificar);
  }

  function acompanharFlask(estado, rotaConfig) {
    const verificar = async () => {
      if (estado.fim) return;
      const { json } = await buscarJson(urlDe(estado.automacao, rotaConfig));
      if (json && json.executando === false) {
        // os cadastros em Python não devolvem resultado por item: conta o que foi pedido como concluído
        return finalizar(estado, { situacao: 'concluido', itens: estado.itens, concluidos: estado.itens, erros: 0 }, 'Resultado por item não informado pela automação.');
      }
      agendar(estado, verificar);
    };
    agendar(estado, verificar);
  }

  /** Chamado pelo proxy quando um POST da tela termina. Grava a execução se a rota for de início. */
  async function aoIniciar({ automacao, quem, caminho, status, cabecalhos, corpoPedido, corpoResposta }) {
    const rota = rotaDeInicio('POST', caminho);
    if (!rota || status >= 300) return; // 4xx: entrada inválida ou automação ocupada; nada rodou
    const pedido = jsonOuNada(corpoPedido);
    const resposta = jsonOuNada(corpoResposta);
    const base = { automacao, quem, modoTeste: ehModoTeste(pedido) };
    try {
      const jobId = resposta && resposta.jobId ? String(resposta.jobId) : null;
      if (rota.tipo === 'job' && jobId) {
        const id = await repo.inserir({ ...base, jobId, situacao: 'rodando', itens: Number(resposta.total) || 0 });
        const estado = { id, chave: `${automacao.id}:${jobId}`, automacao, jobId, itensSse: [], inicio: Date.now(), fim: false };
        acompanhando.set(estado.chave, estado);
        acompanharJob(estado);
      } else if (rota.tipo === 'flask') {
        const itens = itensDoInicio(resposta);
        const id = await repo.inserir({ ...base, jobId: '', situacao: 'rodando', itens });
        acompanharFlask({ id, chave: `${automacao.id}:flask:${rota.config}`, automacao, itens, inicio: Date.now(), fim: false }, rota.config);
      } else {
        // resposta na hora (gerar foto, gerar planilhas): já terminou
        const itens = itensDoInicio(resposta, cabecalhos);
        await repo.inserir({ ...base, jobId: '', situacao: 'concluido', itens, concluidos: itens, fim: true });
      }
    } catch (err) {
      log('[execucoes] não gravou o início', err && err.message);
    }
  }

  /** Chamado pelo proxy para cada SSE de logs que passa (GET /api/logs/:jobId). Devolve o leitor dos pedaços ou null. */
  function abrirSse({ automacao, caminho }) {
    const m = /^\/api\/logs\/([^/?]+)/.exec(String(caminho || ''));
    if (!m) return null;
    const chave = `${automacao.id}:${decodeURIComponent(m[1])}`;
    if (!acompanhando.has(chave)) return null;
    return criarLeitorSse((evento) => {
      const estado = acompanhando.get(chave);
      if (!estado) return;
      if (evento.type === 'resultado' && evento.item) estado.itensSse.push(evento.item);
      else if (evento.type === 'done') finalizar(estado, lerResultado(evento, estado.itensSse));
    });
  }

  /** Na subida do Hub: o que estava sendo acompanhado se perdeu (memória); marca como desconhecido. */
  async function aoSubir() {
    try {
      await repo.marcarInterrompidas();
    } catch (err) {
      log('[execucoes] não marcou as interrompidas', err && err.message);
    }
  }

  return { aoIniciar, abrirSse, aoSubir, emAndamento: () => acompanhando.size };
}

/** Repositório Postgres (hub_execucoes). */
function repoExecucoes(pool) {
  return {
    async inserir({ automacao, quem, jobId, situacao, itens = 0, concluidos = 0, erros = 0, modoTeste = false, fim = false }) {
      const { rows } = await pool.query(
        `INSERT INTO hub_execucoes (automacao_id, automacao_nome, quem, quem_glpi_id, job_id, situacao, itens, concluidos, erros, modo_teste, fim)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $11 THEN now() END) RETURNING id`,
        [automacao.id, automacao.name || '', quem ? quem.nome || '' : '', quem && quem.id != null ? quem.id : null, jobId || '', situacao, itens, concluidos, erros, modoTeste, fim]
      );
      return Number(rows[0].id);
    },
    async finalizar(id, { situacao, itens, concluidos, erros, teste, detalhe }) {
      await pool.query(
        `UPDATE hub_execucoes SET fim = now(), situacao = $2, itens = GREATEST(itens, $3), concluidos = $4, erros = $5,
           modo_teste = modo_teste OR $6, detalhe = $7 WHERE id = $1`,
        [id, situacao, itens || 0, concluidos || 0, erros || 0, !!teste, detalhe || '']
      );
    },
    async marcarInterrompidas() {
      await pool.query(
        "UPDATE hub_execucoes SET situacao = 'desconhecido', fim = now(), detalhe = 'O Hub reiniciou durante a execução; o resultado não foi acompanhado.' WHERE situacao = 'rodando'"
      );
    },
  };
}

module.exports = { criarRegistroExecucoes, repoExecucoes, criarLeitorSse };
