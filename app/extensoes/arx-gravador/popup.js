// Janela do ARX Gravador: começar e parar a gravação de um atendimento, ver os passos e exportar o roteiro (.json).
const M = window.ArxMascara;
const tela = document.getElementById('tela');
const estado = document.getElementById('estado');
document.getElementById('versao').textContent = 'Versão ' + chrome.runtime.getManifest().version;
const MAX_GRAVACOES = 50;

function el(tag, attrs = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'texto') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of [].concat(filhos)) if (f) n.append(f);
  return n;
}
const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function baixar(g) {
  const roteiro = { ...g, passos: g.passos.map((p) => ({ ...p, descricao: M.descreverPasso(p) })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(roteiro, null, 2)], { type: 'application/json' }));
  const nome = `gravacao-${M.mascararTexto(g.tarefa, 40).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'atendimento'}-${new Date(g.inicio).toISOString().slice(0, 10)}.json`;
  el('a', { href: url, download: nome }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function listaPassos(passos) {
  if (!passos.length) return el('p', { class: 'dica', texto: 'Nenhum passo ainda. Use o SGA ou o PowerCRM normalmente.' });
  return el('ol', { class: 'passos' }, passos.slice(-200).map((p) => el('li', { texto: M.descreverPasso(p) })));
}

async function desenhar() {
  const { atual, gravacoes = [] } = await chrome.storage.local.get(['atual', 'gravacoes']);
  tela.replaceChildren();
  estado.textContent = atual ? `Gravando: ${plural(atual.passos.length, 'passo', 'passos')}` : 'Parado';
  estado.className = 'estado' + (atual ? ' gravando' : '');

  if (atual) {
    tela.append(el('section', { class: 'caixa' }, [
      el('h2', { texto: atual.tarefa }),
      el('p', { class: 'dica', texto: (atual.chamado ? `Chamado ${atual.chamado}. ` : '') + 'Faça o atendimento no SGA ou no PowerCRM. Senha e texto digitado não são gravados.' }),
      listaPassos(atual.passos),
      el('div', { class: 'acoes' }, [
        el('button', { type: 'button', class: 'texto perigo', texto: 'Descartar', onclick: async () => { await chrome.storage.local.remove('atual'); desenhar(); } }),
        el('button', { type: 'button', class: 'primario', texto: 'Parar e salvar', onclick: async () => {
          const lista = [{ ...atual, fim: Date.now() }, ...gravacoes].slice(0, MAX_GRAVACOES);
          await chrome.storage.local.set({ gravacoes: lista });
          await chrome.storage.local.remove('atual');
          desenhar();
        } }),
      ]),
    ]));
  } else {
    const tarefa = el('input', { type: 'text', id: 'tarefa', maxlength: '80', placeholder: 'Ex.: Desbloquear usuário do SGA', required: true });
    const chamado = el('input', { type: 'text', id: 'chamado', maxlength: '10', inputmode: 'numeric', placeholder: 'Opcional' });
    const erro = el('p', { class: 'msg erro', role: 'alert', hidden: true });
    tela.append(el('form', { class: 'caixa', onsubmit: async (ev) => {
      ev.preventDefault();
      const t = M.mascararTexto(tarefa.value, 80);
      if (!t) { erro.textContent = 'Diga o que você vai fazer.'; erro.hidden = false; return; }
      const n = chamado.value.replace(/\D/g, '').slice(0, 10);
      await chrome.storage.local.set({ atual: { tarefa: t, chamado: n, inicio: Date.now(), passos: [] } });
      desenhar();
    } }, [
      el('h2', { texto: 'Gravar um atendimento' }),
      el('p', { class: 'dica', texto: 'Grava as telas, os cliques e os campos usados no SGA e no PowerCRM para montar uma automação depois.' }),
      el('label', { for: 'tarefa' }, ['O que você vai fazer', tarefa]),
      el('label', { for: 'chamado' }, ['Número do chamado', chamado]),
      erro,
      el('div', { class: 'acoes' }, el('button', { type: 'submit', class: 'primario', texto: 'Começar a gravar' })),
    ]));
  }

  const caixa = el('section', { class: 'caixa' }, [el('h2', { texto: 'Gravações salvas' })]);
  if (!gravacoes.length) caixa.append(el('p', { class: 'dica', texto: 'Nenhuma gravação salva.' }));
  gravacoes.forEach((g, i) => {
    const detalhe = el('div', { hidden: true }, listaPassos(g.passos));
    caixa.append(el('div', { class: 'gravacao' }, [
      el('div', { class: 'linha' }, [
        el('div', { class: 'esp' }, [el('b', { texto: g.tarefa }), el('p', { class: 'dica', texto: `${dataHora(g.inicio)} · ${plural(g.passos.length, 'passo', 'passos')}${g.chamado ? ` · chamado ${g.chamado}` : ''}` })]),
        el('button', { type: 'button', class: 'texto', texto: 'Ver', 'aria-expanded': 'false', onclick: (ev) => { detalhe.hidden = !detalhe.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!detalhe.hidden)); } }),
        el('button', { type: 'button', class: 'texto', texto: 'Exportar', onclick: () => baixar(g) }),
        el('button', { type: 'button', class: 'texto perigo', texto: 'Apagar', 'aria-label': `Apagar ${g.tarefa}`, onclick: async () => { await chrome.storage.local.set({ gravacoes: gravacoes.filter((_, j) => j !== i) }); desenhar(); } }),
      ]),
      detalhe,
    ]));
  });
  tela.append(caixa);
}

chrome.storage.onChanged.addListener((mud, area) => { if (area === 'local' && (mud.atual || mud.gravacoes)) desenhar(); });
desenhar();
