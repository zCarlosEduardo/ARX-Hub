// Decide o que gravar depois de uma varredura: só as automações cujo status mudou.
// `resultados` é um Map id -> status recém-verificado.
function calcularMudancas(automacoes, resultados) {
  const mudancas = [];
  for (const a of automacoes) {
    const novo = resultados.get(a.id);
    if (novo && novo !== a.status) mudancas.push({ id: a.id, url: a.url, status: novo });
  }
  return mudancas;
}

module.exports = { calcularMudancas };
