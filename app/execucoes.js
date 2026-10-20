// Execuções manuais: rodadas a partir da tela da automação (dados colocados por alguém), registradas pelo proxy do Hub.
// As rodadas pelos chamados do GLPI (100% automáticas) ficam no banco-central e não passam por aqui. Funções puras.

const SITUACOES_FINAIS = ['concluido', 'erro', 'parado'];

/**
 * Resumo do período para a aba Resultados.
 * @param {Array<{automacaoId, automacaoNome, quem, quemGlpiId, inicio, fim, situacao, itens, concluidos, erros, modoTeste}>} linhas
 * @param {Object<string, number|null>} minutosPorAutomacao  minutos que um item levaria à mão (null = sem tempo definido)
 * @param {{incluirTeste?: boolean}} opcoes
 */
function resumirExecucoes(linhas, minutosPorAutomacao, { incluirTeste = false } = {}) {
  const validas = (linhas || []).filter((l) => incluirTeste || !l.modoTeste);
  const porAutomacao = new Map();
  const porPessoa = new Map();
  const totais = { execucoes: 0, rodando: 0, itens: 0, concluidos: 0, erros: 0, testes: 0, duracaoTotalSeg: 0, finalizadas: 0 };
  let minutos = 0;

  for (const l of validas) {
    const minItem = Number(minutosPorAutomacao[String(l.automacaoId)]) || 0;
    const concluidos = Number(l.concluidos) || 0;
    const erros = Number(l.erros) || 0;
    const itens = Number(l.itens) || concluidos + erros;
    // modo teste não economiza tempo: não fez o trabalho de verdade
    const economia = l.modoTeste ? 0 : concluidos * minItem;
    totais.execucoes += 1;
    if (!SITUACOES_FINAIS.includes(l.situacao)) totais.rodando += 1;
    totais.itens += itens;
    totais.concluidos += concluidos;
    totais.erros += erros;
    if (l.modoTeste) totais.testes += 1;
    if (l.fim && l.inicio) {
      totais.duracaoTotalSeg += Math.max(0, (new Date(l.fim) - new Date(l.inicio)) / 1000);
      totais.finalizadas += 1;
    }
    minutos += economia;

    const ka = String(l.automacaoId);
    const a = porAutomacao.get(ka) || { automacaoId: l.automacaoId, nome: l.automacaoNome, execucoes: 0, itens: 0, concluidos: 0, erros: 0, minutosPorItem: minItem || null, minutosEconomizados: 0 };
    a.execucoes += 1;
    a.itens += itens;
    a.concluidos += concluidos;
    a.erros += erros;
    a.minutosEconomizados += economia;
    porAutomacao.set(ka, a);

    const kp = l.quemGlpiId != null ? `id:${l.quemGlpiId}` : `nome:${l.quem || ''}`;
    const p = porPessoa.get(kp) || { nome: l.quem || 'Sem identificação', execucoes: 0, concluidos: 0, erros: 0 };
    p.execucoes += 1;
    p.concluidos += concluidos;
    p.erros += erros;
    porPessoa.set(kp, p);
  }

  const arred = (x) => Math.round(x * 10) / 10;
  return {
    totais: {
      execucoes: totais.execucoes,
      rodando: totais.rodando,
      itens: totais.itens,
      concluidos: totais.concluidos,
      erros: totais.erros,
      testes: totais.testes,
      duracaoMediaSeg: totais.finalizadas ? Math.round(totais.duracaoTotalSeg / totais.finalizadas) : null,
    },
    tempoEconomizado: { estimativa: true, minutos: arred(minutos), horas: arred(minutos / 60) },
    porAutomacao: [...porAutomacao.values()].map((a) => ({ ...a, minutosEconomizados: arred(a.minutosEconomizados) })).sort((x, y) => y.execucoes - x.execucoes),
    porPessoa: [...porPessoa.values()].sort((x, y) => y.execucoes - x.execucoes),
  };
}

// ---------- leitura do que as automações devolvem (formatos medidos em cada uma, sem mudar nenhuma) ----------

const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Situação de um item: 'erro', 'teste' (preencheu sem salvar), 'pulado' (não fez nada) ou 'ok'.
 * Valores reais: alterada, desbloqueado, ja_desbloqueado, ativado, inativado, "já estava ativo", criada, corrigida,
 * conforme, ja_existe, cadastrado, ja_existia, ok, parcial, finalizar, seguir_visto (ok); erro, "não encontrado",
 * "múltiplos encontrados", cancelado, divergente, nao_existe, nao_localizado (erro); "teste (não salvou)", teste.
 */
function classificarItem(status) {
  const s = norm(status);
  if (/teste|simulac/.test(s)) return 'teste';
  if (/^pulado|^pendente/.test(s)) return 'pulado';
  if (/erro|falh|nao encontrado|nao_encontrado|multiplos|cancelad|divergente|nao_existe|nao_localizado/.test(s)) return 'erro';
  return 'ok';
}

/**
 * Situação final e contagem de itens a partir do retorno da automação: o JSON de GET /api/status/:jobId ou o evento
 * `done` do SSE (mais os itens que vieram em eventos `resultado` antes dele, em `itensSse`).
 * @returns {{situacao: 'concluido'|'erro'|'parado', itens: number, concluidos: number, erros: number, teste: boolean}}
 */
function lerResultado(fim, itensSse = []) {
  const f = fim && typeof fim === 'object' ? fim : {};
  let lista = null;
  if (Array.isArray(f.results) && f.results.length) lista = f.results;
  else if (f.resultado && typeof f.resultado === 'object') lista = [f.resultado];
  else if (f.execucao && Array.isArray(f.execucao.grupos)) lista = f.execucao.grupos.map((g) => ({ status: g && g.erro ? 'erro' : 'ok' }));
  else if (itensSse.length) lista = itensSse;

  let itens = 0;
  let concluidos = 0;
  let erros = 0;
  let testes = 0;
  if (lista) {
    for (const it of lista) {
      const c = classificarItem(it && typeof it === 'object' ? it.status || (it.ok === false ? 'erro' : 'ok') : it);
      if (c === 'pulado') continue;
      itens += 1;
      if (c === 'erro') erros += 1;
      else if (c === 'teste') testes += 1;
      else concluidos += 1;
    }
  } else if (typeof f.ok === 'boolean') {
    itens = 1;
    if (f.ok) concluidos = 1;
    else erros = 1;
  } else if (Number.isFinite(Number(f.total)) && f.total !== undefined) {
    itens = Number(f.total);
    concluidos = Number.isFinite(Number(f.salvas)) && f.salvas !== undefined ? Number(f.salvas) : itens;
    erros = Math.max(0, itens - concluidos);
  }
  const situacao = f.error ? 'erro' : f.parada ? 'parado' : 'concluido';
  return { situacao, itens, concluidos, erros, teste: testes > 0 && concluidos === 0 && erros === 0 };
}

/**
 * Este pedido inicia uma execução? Rotas medidas nas automações. Devolve como acompanhar o fim:
 * 'job' (tem jobId), 'flask' (cadastros em Python: consulta `executando` na rota de config) ou 'na-hora'.
 */
function rotaDeInicio(metodo, caminho) {
  if (metodo !== 'POST') return null;
  const p = String(caminho || '').split('?')[0];
  if (/^\/api\/start$/.test(p) || /^\/api\/associacoes\/\d+\/(atualizar|buscar-grupos)$/.test(p) || p === '/api/buscar-tudo') return { tipo: 'job' };
  if (p === '/api/jobs') return { tipo: 'flask', config: '/api/config' };
  const m = /^\/api\/interno\/(sga|crm)\/jobs$/.exec(p);
  if (m) return { tipo: 'flask', config: `/api/interno/${m[1]}/config` };
  if (p === '/api/gerar' || p === '/api/produtos/gerar') return { tipo: 'na-hora' };
  return null;
}

/** Modo teste pelo corpo do início: só quando a tela manda o campo (o padrão de cada automação não é visível aqui). */
function ehModoTeste(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  return (c.modoTeste !== undefined && c.modoTeste !== false) || (c.dryRun !== undefined && c.dryRun !== false) || c.teste === true;
}

/** Quantos itens um início síncrono ou dos cadastros em Python informa (lista ou número). */
function itensDoInicio(resposta, cabecalhos = {}) {
  const r = resposta && typeof resposta === 'object' ? resposta : {};
  for (const k of ['consultores', 'usuarios', 'total']) {
    if (Array.isArray(r[k])) return r[k].length;
    if (Number.isFinite(Number(r[k])) && r[k] !== undefined && r[k] !== null) return Number(r[k]);
  }
  const h = Number(cabecalhos['x-arquivos'] || cabecalhos['x-linhas']);
  return Number.isFinite(h) && h > 0 ? h : 1;
}

module.exports = { resumirExecucoes, SITUACOES_FINAIS, classificarItem, lerResultado, rotaDeInicio, ehModoTeste, itensDoInicio };
