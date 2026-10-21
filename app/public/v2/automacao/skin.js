// Hub v2: layout novo nas telas das automações abertas pela /v2/ (o proxy injeta este script com ?v2=1).
// Todas: título no modelo novo e números dos passos discretos. Gerar foto de perfil: tela nova inteira, usando a API da
// própria automação (/api/foto.png para a prévia sem gravar, /api/start para gerar e /api/execucoes para o histórico).
(function () {
  const SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICONES = [
    [/senha/i, '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'],
    [/foto/i, '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'],
    [/vistoria/i, '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>'],
    [/modelo/i, '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H7.3a2 2 0 0 0-1.6.8L3 10.5l-1.4.6A1.5 1.5 0 0 0 1 12.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'],
    [/regiona/i, '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'],
    [/tabela/i, '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>'],
    [/planilha/i, '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 13v4"/>'],
    [/relat/i, '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>'],
    [/grupo|permiss/i, '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'],
    [/cooperativ/i, '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>'],
    [/cadastro|bloqueio|ativa/i, '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'],
  ];
  const PADRAO = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M7 10v4a2 2 0 0 0 2 2h5"/>';

  function tituloNovo() {
    const cab = document.querySelector('header.page-header');
    const titulo = cab && cab.querySelector('.page-title');
    if (!titulo || cab.querySelector('.v2-titulo')) return;
    const nome = (titulo.querySelector('h1') || {}).textContent || document.title;
    const icone = (ICONES.find(([r]) => r.test(nome)) || [null, PADRAO])[1];
    const caixa = document.createElement('div');
    caixa.className = 'v2-titulo';
    caixa.innerHTML = '<span class="v2-icone">' + SVG(icone) + '</span>';
    titulo.parentNode.insertBefore(caixa, titulo);
    caixa.appendChild(titulo);
  }

  // "1. Empresa e login" -> selo pequeno com o número + título
  function passosDiscretos(raiz) {
    (raiz || document).querySelectorAll('.card h2, section h2').forEach((h) => {
      if (h.querySelector('.v2-num')) return;
      const no = h.firstChild;
      if (!no || no.nodeType !== 3) return;
      const m = /^\s*(\d+)\.\s+/.exec(no.textContent);
      if (!m) return;
      no.textContent = no.textContent.slice(m[0].length);
      const n = document.createElement('span');
      n.className = 'v2-num';
      n.textContent = m[1];
      h.insertBefore(n, no);
    });
  }

  tituloNovo();
  passosDiscretos();
  // telas que montam partes depois (abas, cards que aparecem): aplica de novo
  new MutationObserver(() => passosDiscretos()).observe(document.body, { childList: true, subtree: true });

  if (document.getElementById('previaBox') && document.getElementById('nome') && document.getElementById('departamento')) fotoNova();

  // ------------------------------------------------------------ Gerar foto de perfil
  function fotoNova() {
    const wrap = document.querySelector('.wrap');
    const cab = wrap && wrap.querySelector('header.page-header');
    if (!wrap || !cab) return;
    // a tela antiga continua no DOM (escondida) para o app.js original não quebrar
    Array.from(wrap.children).forEach((el) => { if (el !== cab) el.hidden = true; });
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const DEPTOS = ['Comercial', 'Qualidade', 'Cadastro', 'Financeiro', 'Eventos', 'Assistência'];
    const ORIGEM = { tela: 'Tela', chamado: 'Chamado do GLPI', api: 'API' };
    const v2 = document.createElement('div');
    v2.className = 'v2f';
    v2.innerHTML = `
      <div class="v2f-abas" role="tablist">
        <button type="button" class="v2f-aba" role="tab" aria-selected="true" data-aba="uma">Uma foto</button>
        <button type="button" class="v2f-aba" role="tab" aria-selected="false" data-aba="varias">Várias fotos</button>
        <button type="button" class="v2f-aba" role="tab" aria-selected="false" data-aba="hist">Histórico <span class="n" id="v2fN">0</span></button>
      </div>
      <section data-painel="uma" class="v2f-grade">
        <form class="card" id="v2fForm" novalidate>
          <h2>1. Dados da foto</h2>
          <div class="v2f-campo">
            <label for="v2fNome">Nome (primeiro e último) <span id="v2fCN">0/60</span></label>
            <input id="v2fNome" maxlength="60" autocomplete="off" placeholder="Ester Dias" aria-describedby="v2fEN">
            <p class="v2f-erro" id="v2fEN" hidden></p>
          </div>
          <div class="v2f-campo">
            <label for="v2fDepto">Departamento <span id="v2fCD">0/60</span></label>
            <input id="v2fDepto" maxlength="60" autocomplete="off" placeholder="Qualidade" aria-describedby="v2fED">
            <p class="v2f-erro" id="v2fED" hidden></p>
            <div class="v2f-chips" id="v2fChips" aria-label="Departamentos usados com frequência"></div>
          </div>
          <p class="v2f-ajuda" style="margin-bottom:16px">O departamento é exibido em caixa alta e, se for extenso, quebra em duas linhas. A Assistência usa "ANALISTA 4" (o número) no lugar do nome. Nos chamados do GLPI, o departamento vem do nome do solicitante e o nome vem do texto do chamado.</p>
          <div class="v2f-botoes">
            <button type="submit" class="v2f-btn primario" id="v2fGerar">Gerar foto</button>
            <button type="button" class="v2f-btn" id="v2fLimpar">Limpar</button>
          </div>
          <ol class="v2f-passos" id="v2fPassos" hidden>
            <li data-p="0"><i></i>Conferindo nome e departamento</li>
            <li data-p="1"><i></i>Montando a arte em 1600 x 1600</li>
            <li data-p="2"><i></i>Foto pronta e guardada no histórico</li>
          </ol>
        </form>
        <section class="card">
          <h2>2. Prévia</h2>
          <div class="v2f-previa" id="v2fPrevia"><span class="vazio">A prévia aparece aqui enquanto você digita.</span></div>
          <div class="v2f-acoes-previa">
            <a class="v2f-btn" id="v2fBaixar" aria-disabled="true">Baixar PNG</a>
            <button type="button" class="v2f-btn" id="v2fCopiar" disabled>Copiar imagem</button>
          </div>
        </section>
      </section>
      <section data-painel="varias" class="card" hidden>
        <h2>Várias fotos de uma vez</h2>
        <div class="v2f-campo">
          <label for="v2fLote">Uma pessoa por linha, no formato Nome; Departamento <span id="v2fCL">0 linhas</span></label>
          <textarea id="v2fLote" rows="7" spellcheck="false" placeholder="Ester Dias; Qualidade&#10;Bruno Costa; Comercial"></textarea>
        </div>
        <div class="v2f-botoes"><button type="button" class="v2f-btn primario" id="v2fGerarLote" disabled>Gerar fotos</button></div>
        <div class="v2f-lote" id="v2fGrade"></div>
      </section>
      <section data-painel="hist" class="card" hidden>
        <div class="card-head"><h2>Histórico de execuções</h2><button type="button" class="v2f-btn" id="v2fAtualizar">Atualizar</button></div>
        <div style="overflow-x:auto"><table class="v2f-hist"><tbody id="v2fHist"></tbody></table></div>
      </section>
      <details class="card v2f-tec"><summary>Detalhes técnicos da execução</summary><div class="log" id="v2fLog"><div class="log-empty">O log da execução será exibido aqui.</div></div></details>`;
    cab.insertAdjacentElement('afterend', v2);

    const $ = (id) => document.getElementById(id);
    const nome = $('v2fNome');
    const depto = $('v2fDepto');
    const previa = $('v2fPrevia');
    const limpo = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    let gerada = null; // { url, arquivo } depois de "Gerar foto"
    let espera = null;
    let historico = [];
    passosDiscretos(v2);

    function log(msg, classe) {
      const el = $('v2fLog');
      if (el.querySelector('.log-empty')) el.innerHTML = '';
      const linha = document.createElement('div');
      linha.className = 'line' + (classe ? ' ' + classe : '');
      linha.innerHTML = '<span class="log-ts">[' + new Date().toLocaleTimeString('pt-BR') + ']</span> ' + esc(msg);
      el.appendChild(linha);
    }

    // abas
    v2.querySelectorAll('.v2f-aba').forEach((b) => b.addEventListener('click', () => {
      v2.querySelectorAll('.v2f-aba').forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
      v2.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.getAttribute('data-painel') !== b.getAttribute('data-aba'); });
      if (b.getAttribute('data-aba') === 'hist') carregarHistorico();
    }));

    // prévia ao vivo: a arte de verdade, desenhada pela automação sem gravar (/api/foto.png)
    const urlPrevia = (n, d, baixar) => '/api/foto.png?nome=' + encodeURIComponent(n) + '&departamento=' + encodeURIComponent(d) + (baixar ? '&baixar=1' : '');
    function mostrarPrevia() {
      const n = limpo(nome.value), d = limpo(depto.value);
      $('v2fCN').textContent = nome.value.length + '/60';
      $('v2fCD').textContent = depto.value.length + '/60';
      if (gerada) { gerada = null; }
      clearTimeout(espera);
      if (!n || !d) {
        previa.innerHTML = '<span class="vazio">A prévia aparece aqui enquanto você digita.</span>';
        habilitarAcoes(null);
        return;
      }
      espera = setTimeout(() => {
        let img = previa.querySelector('img');
        if (!img) { previa.innerHTML = '<img alt="Prévia da foto de perfil"><span class="v2f-selo" id="v2fSelo">Prévia ao vivo</span>'; img = previa.querySelector('img'); }
        img.classList.add('carregando');
        img.onload = () => img.classList.remove('carregando');
        img.onerror = () => { previa.innerHTML = '<span class="vazio">Não foi possível montar a prévia.</span>'; };
        img.src = urlPrevia(n, d);
        $('v2fSelo').textContent = 'Prévia ao vivo';
        $('v2fSelo').className = 'v2f-selo';
        habilitarAcoes(urlPrevia(n, d, true));
      }, 450);
    }
    function habilitarAcoes(urlBaixar) {
      const b = $('v2fBaixar');
      if (urlBaixar) { b.href = urlBaixar; b.removeAttribute('aria-disabled'); } else { b.removeAttribute('href'); b.setAttribute('aria-disabled', 'true'); }
      $('v2fCopiar').disabled = !urlBaixar || !(navigator.clipboard && window.ClipboardItem && window.isSecureContext);
      $('v2fCopiar').title = $('v2fCopiar').disabled && urlBaixar ? 'O navegador só copia imagens em endereço seguro (HTTPS)' : '';
    }
    nome.addEventListener('input', () => { validar(false); mostrarPrevia(); });
    depto.addEventListener('input', () => { validar(false); mostrarPrevia(); });
    DEPTOS.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'v2f-chip'; b.textContent = d;
      b.onclick = () => { depto.value = d; validar(false); mostrarPrevia(); depto.focus(); };
      $('v2fChips').appendChild(b);
    });
    function validar(mostrar) {
      const erros = { n: !limpo(nome.value) ? 'Informe o nome.' : '', d: !limpo(depto.value) ? 'Informe o departamento.' : '' };
      [['n', nome, 'v2fEN'], ['d', depto, 'v2fED']].forEach(([k, el, id]) => {
        if (!mostrar && el.getAttribute('aria-invalid') !== 'true') return;
        el.setAttribute('aria-invalid', erros[k] ? 'true' : 'false');
        $(id).hidden = !erros[k];
        $(id).textContent = erros[k];
      });
      return erros;
    }
    function passo(p, erro) {
      const lista = $('v2fPassos');
      lista.hidden = false;
      lista.querySelectorAll('li').forEach((li) => {
        const i = Number(li.getAttribute('data-p'));
        li.className = erro && i === p ? 'erro' : i < p || p === 3 ? 'feito' : i === p ? 'agora' : '';
        li.querySelector('i').textContent = li.className === 'feito' ? '✓' : li.className === 'erro' ? '!' : '';
      });
    }
    async function gerar(n, d) {
      const resp = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: n, departamento: d }) });
      const x = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(x.error || 'HTTP ' + resp.status);
      return x;
    }
    $('v2fForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const erros = validar(true);
      if (erros.n) return nome.focus();
      if (erros.d) return depto.focus();
      const n = limpo(nome.value), d = limpo(depto.value);
      $('v2fGerar').disabled = true;
      passo(0);
      log('Gerando a foto de ' + n + ' (' + d.toUpperCase() + ').');
      try {
        passo(1);
        const x = await gerar(n, d);
        gerada = x;
        previa.innerHTML = '<img alt="Foto de perfil gerada" src="' + esc(x.url) + '"><span class="v2f-selo ok" id="v2fSelo">Foto gerada</span>';
        habilitarAcoes(x.url + '?baixar=1');
        passo(3);
        log('Foto gerada (1600 x 1600): ' + x.arquivo, 'ok');
        carregarHistorico();
      } catch (err) {
        passo(1, true);
        log('Falha na geração: ' + err.message, 'err');
        $('v2fEN').hidden = false;
        $('v2fEN').textContent = err.message;
      } finally {
        $('v2fGerar').disabled = false;
      }
    });
    $('v2fLimpar').onclick = () => {
      nome.value = ''; depto.value = '';
      [nome, depto].forEach((el) => el.setAttribute('aria-invalid', 'false'));
      $('v2fEN').hidden = true; $('v2fED').hidden = true; $('v2fPassos').hidden = true;
      mostrarPrevia(); nome.focus();
    };
    $('v2fCopiar').onclick = async () => {
      try {
        const blob = await (await fetch($('v2fBaixar').href.replace(/([?&])baixar=1&?/, '$1').replace(/[?&]$/, ''))).blob();
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        $('v2fCopiar').textContent = 'Copiada';
      } catch {
        $('v2fCopiar').textContent = 'Não deu para copiar';
      }
      setTimeout(() => { $('v2fCopiar').textContent = 'Copiar imagem'; }, 1800);
    };

    // várias fotos: uma por linha, geradas uma depois da outra (cada uma vai para o histórico)
    const lote = $('v2fLote');
    const linhasLote = () => lote.value.split('\n').map(limpo).filter(Boolean);
    lote.addEventListener('input', () => { const n = linhasLote().length; $('v2fCL').textContent = n === 1 ? '1 linha' : n + ' linhas'; $('v2fGerarLote').disabled = !n; });
    $('v2fGerarLote').onclick = async () => {
      const grade = $('v2fGrade');
      grade.innerHTML = '';
      $('v2fGerarLote').disabled = true;
      const caixas = linhasLote().map((linha) => {
        const [n, d] = linha.split(';').map(limpo);
        const caixa = document.createElement('div');
        caixa.className = 'v2f-mini';
        caixa.innerHTML = '<div class="img">Na fila</div><div class="pe"><b></b><span class="v2f-sit">Na fila</span></div>';
        caixa.querySelector('b').textContent = n || 'Sem nome';
        grade.appendChild(caixa);
        return { caixa, n, d };
      });
      for (const { caixa, n, d } of caixas) {
        const sit = caixa.querySelector('.v2f-sit');
        if (!n || !d) { caixa.classList.add('erro'); sit.className = 'v2f-sit erro'; sit.textContent = !n ? 'Falta o nome' : 'Falta o departamento'; continue; }
        sit.className = 'v2f-sit rodando'; sit.textContent = 'Gerando';
        try {
          const x = await gerar(n, d);
          caixa.querySelector('.img').innerHTML = '<img alt="Foto de ' + esc(n) + '" src="' + esc(x.url) + '">';
          const a = document.createElement('a');
          a.className = 'v2f-btn'; a.style.height = '26px'; a.style.padding = '0 10px'; a.style.fontSize = '12px';
          a.href = x.url + '?baixar=1'; a.textContent = 'Baixar';
          sit.replaceWith(a);
          log('Foto gerada: ' + x.arquivo, 'ok');
        } catch (err) {
          caixa.classList.add('erro'); sit.className = 'v2f-sit erro'; sit.textContent = 'Erro';
          log('Falha em ' + n + ': ' + err.message, 'err');
        }
      }
      $('v2fGerarLote').disabled = false;
      carregarHistorico();
    };

    // histórico real da automação
    async function carregarHistorico() {
      const tb = $('v2fHist');
      try {
        historico = await (await fetch('/api/execucoes')).json();
      } catch {
        tb.innerHTML = '<tr><td class="v2f-ajuda">Não foi possível carregar o histórico.</td></tr>';
        return;
      }
      $('v2fN').textContent = historico.length;
      tb.innerHTML = historico.length ? '' : '<tr><td class="v2f-ajuda">Nenhuma execução realizada.</td></tr>';
      historico.forEach((x) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td style="width:56px"><a href="' + esc(x.url) + '" target="_blank" rel="noopener"><img src="' + esc(x.url) + '" alt="" loading="lazy"></a></td>' +
          '<td><b>' + esc(x.nome) + '</b> · ' + esc(String(x.departamento).toUpperCase()) + (x.teste ? '<span class="v2f-tag">Teste</span>' : '') +
          '<small>' + esc(x.inicio ? new Date(x.inicio).toLocaleString('pt-BR') : '') + ' · ' + esc(ORIGEM[x.origem] || x.origem) + (x.chamado ? ' #' + esc(x.chamado) : '') + '</small></td>' +
          '<td style="text-align:right;white-space:nowrap"><a class="v2f-btn" style="height:28px;font-size:12px" href="' + esc(x.url) + '?baixar=1">Baixar</a> <button type="button" class="v2f-btn" style="height:28px;font-size:12px">Usar de novo</button></td>';
        tr.querySelector('button').onclick = () => { nome.value = x.nome; depto.value = x.departamento; mostrarPrevia(); v2.querySelector('[data-aba="uma"]').click(); nome.focus(); };
        tb.appendChild(tr);
      });
    }
    $('v2fAtualizar').onclick = carregarHistorico;
    carregarHistorico();
  }
})();
