// Regras do ARX Gravador, sem depender do navegador (testadas em app/test/extensao-gravador.test.js): o que cada passo
// guarda e como os dados pessoais saem mascarados ANTES de serem gravados. Nada digitado em texto livre é guardado: só o
// tipo do dado (CPF, e-mail, placa...) ou o tamanho do texto.
(function (raiz) {
  // a ordem importa: CNPJ antes de CPF e de número solto; e-mail antes de telefone
  const PADROES = [
    [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
    [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
    [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
    [/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]'],
    [/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/gi, '[placa]'],
    [/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[chassi]'],
    [/\d{4,}/g, '[número]'],
  ];

  /** Texto de tela (rótulo, botão, título, opção): troca os dados pessoais pelo tipo e corta em `max`. */
  function mascararTexto(t, max = 80) {
    let s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    for (const [rx, troca] of PADROES) s = s.replace(rx, troca);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /** Valor digitado num campo: senha nunca; dado reconhecido vira o tipo; texto livre vira só o tamanho. */
  function valorDoCampo({ tipo, valor, marcado }) {
    if (tipo === 'checkbox' || tipo === 'radio') return marcado ? 'marcado' : 'desmarcado';
    if (tipo === 'password') return '[senha]';
    const v = String(valor == null ? '' : valor).trim();
    if (!v) return '[vazio]';
    const m = mascararTexto(v, 200);
    if (/^(\[[a-zúéç]+\][\s./-]*)+$/i.test(m)) return m; // só dados reconhecidos (ex.: "[cpf]", "[número]/[número]")
    if (tipo === 'date' || /^\d{2}\/\d{2}\/\d{4}$/.test(v)) return '[data]';
    return `[texto de ${v.length} ${v.length === 1 ? 'caractere' : 'caracteres'}]`;
  }

  /** Endereço da página: caminho mascarado e só os NOMES dos parâmetros (o valor vira o tipo). */
  function enderecoMascarado(href) {
    let u;
    try { u = new URL(href); } catch { return ''; }
    const params = [...new Set(u.searchParams.keys())].map((k) => `${mascararTexto(k, 30)}=…`);
    return u.origin + mascararTexto(u.pathname, 160) + (params.length ? '?' + params.join('&') : '');
  }

  /** Só estes sites são gravados. */
  function siteGravavel(href) {
    try {
      const u = new URL(href);
      return u.protocol === 'https:' && (/\.hinova\.com\.br$/.test(u.hostname) || u.hostname === 'app.powercrm.com.br');
    } catch {
      return false;
    }
  }

  /** Passo vindo da página: confere o formato e limita o tamanho de cada campo (a página não é confiável). */
  function limparPasso(p) {
    if (!p || typeof p !== 'object') return null;
    const ACOES = ['pagina', 'clique', 'campo', 'tecla'];
    if (!ACOES.includes(p.acao)) return null;
    const s = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
    return { acao: p.acao, url: s(p.url, 300), titulo: s(p.titulo, 120), alvo: p.alvo && typeof p.alvo === 'object' ? { tag: s(p.alvo.tag, 20), tipo: s(p.alvo.tipo, 20), id: s(p.alvo.id, 80), nome: s(p.alvo.nome, 80), rotulo: s(p.alvo.rotulo, 120), seletor: s(p.alvo.seletor, 200) } : null, valor: s(p.valor, 200), tecla: s(p.tecla, 20) };
  }

  /** Uma linha legível do passo, para a lista da janela e para o roteiro exportado. */
  function descreverPasso(p) {
    const alvo = p.alvo ? (p.alvo.rotulo || p.alvo.nome || p.alvo.id || p.alvo.tag) : '';
    if (p.acao === 'pagina') return `Abriu ${p.titulo || p.url}`;
    if (p.acao === 'clique') return `Clicou em "${alvo}"`;
    if (p.acao === 'campo') return `Preencheu "${alvo}" com ${p.valor}`;
    if (p.acao === 'tecla') return `Apertou ${p.tecla} em "${alvo}"`;
    return '';
  }

  const api = { mascararTexto, valorDoCampo, enderecoMascarado, siteGravavel, limparPasso, descreverPasso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ArxMascara = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
