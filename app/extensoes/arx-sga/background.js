// Service worker da extensão ARX SGA. Guarda a chave do cofre só na sessão do navegador (chrome.storage.session, some ao
// fechar o navegador) e entrega o login de uma empresa apenas ao script das páginas do SGA (*.hinova.com.br). Também apaga
// os cookies do SGA quando a página mostra o erro de cookies acumulados.
importScripts('regras.js', 'modulo.js', 'empresasSga.js');
const R = self.ArxRegras;
const EMPRESAS = module.exports.EMPRESAS_SGA;

const doSga = (url) => { try { return new URL(url).hostname.endsWith('.hinova.com.br'); } catch (e) { return false; } };

/** Logins abertos com a chave da sessão; null quando o cofre está travado (ou nem existe). */
async function loginsAbertos() {
  const { chave } = await chrome.storage.session.get('chave');
  const { cofre } = await chrome.storage.local.get('cofre');
  if (!chave || !cofre) return null;
  try {
    return await R.decifrar(await R.importarChave(chave), cofre);
  } catch (e) {
    await chrome.storage.session.remove('chave'); // chave de um cofre antigo: trava
    return null;
  }
}

/** Apaga os cookies de todos os servidores do SGA (hinova.com.br): é o acúmulo deles que gera o erro "too large". */
async function limparCookiesDoSga() {
  const cookies = await chrome.cookies.getAll({ domain: 'hinova.com.br' });
  await Promise.all(cookies.map((c) => chrome.cookies.remove({ url: `https://${c.domain.replace(/^\./, '')}${c.path}`, name: c.name, storeId: c.storeId })));
  return cookies.length;
}

async function atender(msg, sender) {
  if (sender.id !== chrome.runtime.id) return { erro: 'Origem não autorizada.' };
  const daJanela = !sender.tab; // a janelinha da extensão
  if (!daJanela && !doSga(sender.url)) return { erro: 'Origem não autorizada.' };

  if (msg.tipo === 'limpar-cookies') return { removidos: await limparCookiesDoSga() };

  if (msg.tipo === 'credencial' && !daJanela) {
    const { auto } = await chrome.storage.local.get('auto');
    if (auto === false) return { desligado: true };
    const chave = R.empresaDaBase(R.baseDaUrl(sender.url), EMPRESAS);
    if (!chave) return { desconhecida: true };
    const logins = await loginsAbertos();
    if (!logins) return { travado: true };
    const l = R.loginDaEmpresa(logins, chave);
    return l ? { login: { usuario: l.usuario, senha: l.senha } } : { semLogin: true };
  }
  return { erro: 'Pedido desconhecido.' };
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  atender(msg || {}, sender).then(responder, (e) => responder({ erro: e.message }));
  return true; // resposta assíncrona
});

