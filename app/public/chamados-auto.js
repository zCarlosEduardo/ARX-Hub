// Textos do estado do modo automático da aba Chamados. Funções puras (sem React nem DOM) para poder testar com `node --test`.
(function () {
  const inteiro = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0);
  const chamados = (n) => `${n} ${n === 1 ? 'chamado' : 'chamados'}`;

  /**
   * @param {{computadores?: string[], rodando?: number, ultima?: {hora: string, quantos: number}|null,
   *          filaWhatsapp?: number, modoTeste?: boolean, limite?: number}} e
   * @returns {{computadores: string, agora: string, ultima: string|null, whatsapp: string|null, aviso: string|null}}
   */
  function descreverAuto(e) {
    const nomes = Array.isArray(e.computadores) ? e.computadores.filter(Boolean) : [];
    const limite = Math.max(1, inteiro(e.limite) || 1);
    const rodando = inteiro(e.rodando);
    const fila = inteiro(e.filaWhatsapp);
    const computadores = nomes.length > 1
      ? `${nomes.length} computadores no automático: ${nomes.join(', ')}. Cada um pega a sua parte, até ${chamados(limite)} por vez.`
      : `Só este computador está no automático. Pega até ${chamados(limite)} por vez.`;
    return {
      computadores,
      agora: rodando > 0 ? `Executando ${chamados(rodando)} agora.` : 'Aguardando chamados prontos.',
      ultima: e.ultima ? `Última rodada às ${e.ultima.hora} com ${chamados(inteiro(e.ultima.quantos))}.` : null,
      whatsapp: fila > 0 ? `${fila} ${fila === 1 ? 'pedido' : 'pedidos'} do WhatsApp na fila.` : null,
      aviso: e.modoTeste ? 'Modo teste ligado: nada é escrito no GLPI.' : null,
    };
  }

  window.ChamadosAuto = { descreverAuto };
})();
