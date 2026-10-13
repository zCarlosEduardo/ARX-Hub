// Cálculos puros dos gráficos da aba Resultados (séries, escalas, percentuais, geometria das colunas).
// Sem DOM e sem React: o front carrega este arquivo como script (window.GraficosDados) e os testes
// em app/test/graficos-dados.test.js o carregam com require.
(function (raiz) {
  const NF = (n, opcoes) => Number(n).toLocaleString('pt-BR', opcoes);
  const num = (n) => NF(Number(n) || 0);
  const inteiro = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

  /** "1 queda" / "2 quedas" (com separador de milhar). */
  function plural(n, um, varios) {
    return `${num(n)} ${n === 1 ? um : varios}`;
  }

  /** Topo "redondo" do eixo (4, 5, 10, 20, 25, 50, 100...), nunca abaixo de 4. */
  function topoEixo(max) {
    const m = Number(max);
    if (!Number.isFinite(m) || m <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= m) return k * p;
    return 10 * p;
  }

  /** Valores das linhas de grade (inteiros) de 0 até o topo. */
  function ticksEixo(topo) {
    for (const n of [4, 5, 2, 3, 1]) {
      if (Number.isInteger(topo / n)) return Array.from({ length: n + 1 }, (_, i) => (topo / n) * i);
    }
    return [0, topo];
  }

  /** Topo do eixo de taxa (fração de 0 a 1). */
  function topoPercentual(maxFracao) {
    const m = Number(maxFracao);
    if (!Number.isFinite(m) || m <= 0.1) return 0.1;
    return [0.2, 0.4, 0.5, 1].find((t) => t >= m) || 1;
  }

  function ticksPercentual(topo) {
    return topo >= 1 ? [0, 0.25, 0.5, 0.75, 1] : [0, topo / 2, topo];
  }

  /** parte/todo, ou null quando não há base. */
  function fracao(parte, todo) {
    const t = Number(todo);
    if (!Number.isFinite(t) || t <= 0) return null;
    return inteiro(parte) / t;
  }

  function formatarPct(x, casas) {
    if (x === null || x === undefined || !Number.isFinite(Number(x))) return 'Sem dados';
    return NF(Number(x) * 100, { maximumFractionDigits: casas === undefined ? 1 : casas }) + '%';
  }

  const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

  const paraUtc = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const deUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
  const DIA = 86400000;
  const somaDias = (iso, n) => deUtc(paraUtc(iso) + n * DIA);
  /** Segunda-feira da semana de uma data (yyyy-mm-dd). */
  function segundaDa(iso) {
    const d = new Date(paraUtc(iso));
    return somaDias(iso, -((d.getUTCDay() + 6) % 7));
  }
  const fimDaSemana = (iso) => somaDias(iso, 6);

  /** Pontos do gráfico semanal a partir de semanas[] do resumo. */
  function pontosSemanas(semanas) {
    if (!Array.isArray(semanas)) return [];
    return semanas.map((s) => {
      const concluido = inteiro(s.concluido);
      const erro = inteiro(s.erro);
      const executando = inteiro(s.executando);
      const finalizadas = concluido + erro;
      return {
        chave: s.semana,
        semana: s.semana,
        rotulo: dataCurta(s.semana),
        periodo: `${dataBr(s.semana)} a ${dataBr(fimDaSemana(s.semana))}`,
        valores: { concluido, erro, executando },
        concluido,
        erro,
        executando,
        finalizadas,
        soma: finalizadas + executando,
        taxaErro: fracao(erro, finalizadas),
      };
    });
  }

  function resumoSemanas(pontos) {
    const r = { semanas: pontos.length, concluido: 0, erro: 0, executando: 0, inicio: '', fim: '', maior: null };
    if (!pontos.length) return r;
    r.inicio = pontos[0].rotulo;
    r.fim = pontos[pontos.length - 1].rotulo;
    for (const p of pontos) {
      r.concluido += p.concluido;
      r.erro += p.erro;
      r.executando += p.executando;
      if (p.soma > 0 && (!r.maior || p.soma > r.maior.soma)) r.maior = { rotulo: p.rotulo, soma: p.soma };
    }
    return r;
  }

  /** De quantos em quantos pontos mostrar o rótulo do eixo X para não sobrepor. */
  function passoRotulos(quantidade, largura, larguraRotulo) {
    if (!(quantidade > 0) || !(largura > 0)) return 1;
    return Math.max(1, Math.ceil((quantidade * (larguraRotulo || 44)) / largura));
  }

  /**
   * Segmentos de uma coluna empilhada, de baixo para cima.
   * base = y da linha de base; altura = altura útil do plot; gap = vão entre segmentos.
   * Devolve [{ chave, valor, y, h, topo }]; "topo" marca o último segmento (o de cima).
   */
  function empilhar(valores, series, topoEscala, altura, base, gap) {
    const visiveis = series.filter((s) => inteiro((valores || {})[s.chave]) > 0);
    let acumulado = 0;
    return visiveis.map((s, i) => {
      const valor = inteiro(valores[s.chave]);
      const h = Math.max(3, (valor / topoEscala) * altura);
      const temAcima = i < visiveis.length - 1;
      const vao = temAcima ? gap : 0;
      const seg = { chave: s.chave, valor, y: base - acumulado - h + vao, h: Math.max(1, h - vao), topo: !temAcima };
      acumulado += h;
      return seg;
    });
  }

  /** Caminho SVG de um retângulo com os dois cantos de cima arredondados (raio r). */
  function caminhoColuna(x, y, w, h, r) {
    const raio = Math.max(0, Math.min(r || 0, h, w / 2));
    if (!raio) return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
    return `M${x},${y + h} L${x},${y + raio} Q${x},${y} ${x + raio},${y} L${x + w - raio},${y} Q${x + w},${y} ${x + w},${y + raio} L${x + w},${y + h} Z`;
  }

  /** Média de execuções finalizadas por semana do período anterior (para a linha de referência). */
  function mediaSemanalAnterior(anterior) {
    if (!anterior || !anterior.periodo || !anterior.totais) return null;
    const { desde, ate } = anterior.periodo;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(ate)) || desde > ate) return null;
    const total = inteiro(anterior.totais.concluido) + inteiro(anterior.totais.erro);
    if (!total) return null;
    let semanas = 0;
    for (let s = segundaDa(desde); s <= ate; s = somaDias(s, 7)) semanas++;
    return { media: total / semanas, semanas, total };
  }

  /** Tipos de chamado ordenados por volume, com taxa de erro e participação no total. */
  function ordenarTipos(tipos, nomes) {
    if (!Array.isArray(tipos)) return [];
    const soma = tipos.reduce((s, t) => s + inteiro(t.total), 0);
    return tipos
      .map((t) => {
        const concluido = inteiro(t.concluido);
        const erro = inteiro(t.erro);
        const finalizadas = concluido + erro;
        return {
          tipo: t.tipo,
          nome: t.nome || (nomes && nomes[t.tipo]) || t.tipo,
          total: inteiro(t.total),
          concluido,
          erro,
          executando: inteiro(t.executando),
          finalizadas,
          taxaErro: t.taxaErro === undefined ? fracao(erro, finalizadas) : t.taxaErro,
          pctDoTotal: fracao(t.total, soma),
        };
      })
      .sort((a, b) => b.total - a.total || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  /** Associações com mais erros (e, no empate, mais volume). Só as `limite` primeiras entram no gráfico. */
  function rankingAssociacoes(associacoes, limite) {
    const todas = (Array.isArray(associacoes) ? associacoes : [])
      .filter((a) => inteiro(a.total) > 0)
      .map((a) => {
        const concluido = inteiro(a.concluido);
        const erro = inteiro(a.erro);
        return { nome: a.nome, associacaoId: a.associacaoId, total: inteiro(a.total), concluido, erro, finalizadas: concluido + erro, taxaErro: fracao(erro, concluido + erro) };
      })
      .sort((a, b) => b.erro - a.erro || b.total - a.total || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const n = limite || 8;
    return { itens: todas.slice(0, n), restantes: Math.max(0, todas.length - n), total: todas.length };
  }

  /** Motivos de erro com a participação de cada um nos erros do período. */
  function motivosComPercentual(motivos, totalErros) {
    if (!Array.isArray(motivos)) return [];
    const soma = motivos.reduce((s, m) => s + inteiro(m.total), 0);
    const base = inteiro(totalErros) > 0 ? inteiro(totalErros) : soma;
    return motivos.map((m) => ({ ...m, pct: Math.min(1, fracao(m.total, base) || 0) }));
  }

  /** Duração para rótulo de eixo: 0, 30 s, 10 min, 1,5 h. */
  function formatarDuracaoCurta(seg) {
    if (seg === null || seg === undefined || !Number.isFinite(Number(seg))) return 'Sem dados';
    const s = Number(seg);
    if (s === 0) return '0';
    if (s < 60) return `${NF(s)} s`;
    if (s < 3600) return `${NF(s / 60, { maximumFractionDigits: 0 })} min`;
    return `${NF(s / 3600, { maximumFractionDigits: 1 })} h`;
  }

  /** Duração para texto de tooltip: 45 s, 10 min, 1 h 30 min. */
  function duracaoLonga(seg) {
    if (seg === null || seg === undefined || !Number.isFinite(Number(seg))) return 'Sem dados';
    const s = Math.round(Number(seg));
    if (s < 90) return `${s} s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  /** Escala (em segundos) para um eixo de duração: minutos até 1 h, horas acima. */
  function escalaDuracao(maxSeg) {
    const max = Number(maxSeg) > 0 ? Number(maxSeg) : 0;
    const unidade = max <= 3600 ? 60 : 3600;
    const topoUnidades = topoEixo(Math.ceil(max / unidade));
    return { topo: topoUnidades * unidade, ticks: ticksEixo(topoUnidades).map((t) => t * unidade) };
  }

  /** Texto de leitura (aria-label) do gráfico semanal de colunas. */
  function descricaoColunas(pontos, referencia) {
    const r = resumoSemanas(pontos);
    if (!r.semanas) return 'Gráfico de colunas por semana, sem dados.';
    const partes = [
      `Gráfico de colunas empilhadas por semana, de ${r.inicio} a ${r.fim} (${plural(r.semanas, 'semana', 'semanas')}).`,
      `Total: ${plural(r.concluido, 'concluída', 'concluídas')}, ${plural(r.erro, 'com erro', 'com erro')}${r.executando ? `, ${plural(r.executando, 'em execução', 'em execução')}` : ''}.`,
    ];
    if (r.maior) partes.push(`Semana com mais execuções: ${r.maior.rotulo}, com ${num(r.maior.soma)}.`);
    if (referencia) partes.push(`Média semanal do período anterior: ${NF(referencia.media, { maximumFractionDigits: 1 })} execuções finalizadas.`);
    return partes.join(' ');
  }

  /** Texto de leitura (aria-label) do gráfico de linha da taxa de erro semanal. */
  function descricaoTaxa(pontos) {
    const r = resumoSemanas(pontos);
    const com = pontos.filter((p) => p.taxaErro !== null);
    if (!com.length) return 'Gráfico de linha da taxa de erro por semana, sem execuções finalizadas.';
    const maior = com.reduce((m, p) => (p.taxaErro > m.taxaErro ? p : m), com[0]);
    return `Gráfico de linha da taxa de erro por semana, de ${r.inicio} a ${r.fim}. Taxa geral: ${formatarPct(fracao(r.erro, r.erro + r.concluido))}. Maior taxa: ${maior.rotulo}, com ${formatarPct(maior.taxaErro)}.`;
  }

  /** Texto de leitura de uma série diária. pontos: [{ rotulo, valor }]. */
  function descricaoDias(pontos, titulo, formatar) {
    const soma = pontos.reduce((s, p) => s + inteiro(p.valor), 0);
    if (!pontos.length || !soma) return `${titulo}: nenhum registro no período.`;
    const maior = pontos.reduce((m, p) => (p.valor > m.valor ? p : m), pontos[0]);
    return `${titulo}, de ${pontos[0].rotulo} a ${pontos[pontos.length - 1].rotulo} (${plural(pontos.length, 'dia', 'dias')}). Total: ${formatar(soma)}. Maior valor: ${maior.rotulo}, com ${formatar(maior.valor)}.`;
  }

  const api = {
    descricaoColunas, descricaoTaxa, descricaoDias,
    plural, topoEixo, ticksEixo, topoPercentual, ticksPercentual, fracao, formatarPct, dataCurta, dataBr, fimDaSemana, segundaDa,
    pontosSemanas, resumoSemanas, passoRotulos, empilhar, caminhoColuna, mediaSemanalAnterior, ordenarTipos, rankingAssociacoes,
    motivosComPercentual, formatarDuracaoCurta, duracaoLonga, escalaDuracao,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.GraficosDados = api;
})(typeof window !== 'undefined' ? window : this);
