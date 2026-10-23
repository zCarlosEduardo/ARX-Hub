// Guarda os passos da gravação ligada (chrome.storage.local "atual"). Só aceita passo vindo das páginas do SGA e do
// PowerCRM, e limpa o formato de novo (o conteúdo da página não é confiável). Uma fila evita perder passo quando chegam juntos.
importScripts('mascarar.js');
const M = self.ArxMascara;
const MAX_PASSOS = 2000;
let fila = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.tipo !== 'passo' || !sender.tab || !M.siteGravavel(sender.url || '')) return;
  const passo = M.limparPasso(msg.passo);
  if (!passo) return;
  fila = fila.then(async () => {
    const { atual } = await chrome.storage.local.get('atual');
    if (!atual || atual.passos.length >= MAX_PASSOS) return;
    const ultimo = atual.passos[atual.passos.length - 1];
    // a mesma página informada duas vezes seguidas (recarga do SPA) conta uma vez
    if (ultimo && passo.acao === 'pagina' && ultimo.acao === 'pagina' && ultimo.url === passo.url) return;
    atual.passos.push({ ...passo, em: Date.now() });
    await chrome.storage.local.set({ atual });
  }).catch((err) => console.error('[arx-gravador]', err.message));
});
