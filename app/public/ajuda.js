// Botão "?" do Hub: abre os tutoriais em vídeo pelo arx-ajuda.js (cópia de ARX-Automacoes/shared/ui/arx-ajuda.js;
// altere lá e copie). A área da aba aberta vem primeiro na lista; sem tutoriais no servidor, o botão não aparece.
(function () {
  const { createElement: e, useState, useEffect } = React;
  const AREAS = ['geral', 'alertas', 'meus-acessos', 'chamados', 'conversas', 'resultados', 'administracao'];
  const AREA_DA_ABA = { chamados: 'chamados', conversas: 'conversas', resultados: 'resultados', admin: 'administracao' };

  function AjudaBotao({ aba }) {
    const [disponivel, setDisponivel] = useState(false);
    useEffect(() => {
      if (window.ArxAjuda) window.ArxAjuda.disponivel(AREAS).then(setDisponivel);
    }, []);
    if (!disponivel) return null;
    const primeira = AREA_DA_ABA[aba] || 'geral';
    const areas = [primeira, ...AREAS.filter((a) => a !== primeira)];
    return e('button', {
      type: 'button', className: 'arx-ajuda-btn', title: 'Como usar o Hub', 'aria-label': 'Como usar o Hub: tutoriais em vídeo',
      onClick: () => window.ArxAjuda.abrir(areas),
    }, '?');
  }

  window.AjudaBotao = AjudaBotao;
})();
