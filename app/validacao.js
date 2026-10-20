// Validação pura das entradas das rotas de automação (sem Express nem banco),
// para poder testar com `node --test`.
const LIMITES = {
  name: 120, url: 2048, container: 120, description: 500, categoriaTamanho: 40, categoriasMax: 20,
};
const COR_RE = /^#[0-9a-fA-F]{6}$/;
const ICONE_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

function validarId(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw);
  if (!/^[1-9][0-9]{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

// Devolve a URL normalizada (trim) ou null. Só valida o formato: não restringe hosts.
function validarUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > LIMITES.url) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

function textoOpcional(valor, campo, max) {
  if (valor === undefined || valor === null) return { v: '' };
  if (typeof valor !== 'string') return { erro: `${campo} deve ser texto` };
  const t = valor.trim();
  if (t.length > max) return { erro: `${campo} deve ter no máximo ${max} caracteres` };
  return { v: t };
}

function validarAutomacao(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.name !== 'string' || !b.name.trim()) return { ok: false, error: 'name e url são obrigatórios' };
  const name = b.name.trim();
  if (name.length > LIMITES.name) return { ok: false, error: `name deve ter no máximo ${LIMITES.name} caracteres` };
  if (typeof b.url !== 'string' || !b.url.trim()) return { ok: false, error: 'name e url são obrigatórios' };
  const url = validarUrl(b.url);
  if (!url) return { ok: false, error: 'url deve ser um endereço http ou https válido' };

  const container = textoOpcional(b.container, 'container', LIMITES.container);
  if (container.erro) return { ok: false, error: container.erro };
  const description = textoOpcional(b.description, 'description', LIMITES.description);
  if (description.erro) return { ok: false, error: description.erro };

  let icon = 'Workflow';
  if (b.icon !== undefined && b.icon !== null && b.icon !== '') {
    if (typeof b.icon !== 'string' || !ICONE_RE.test(b.icon)) return { ok: false, error: 'icon inválido' };
    icon = b.icon;
  }
  let color = '#1E4A9E';
  if (b.color !== undefined && b.color !== null && b.color !== '') {
    if (typeof b.color !== 'string' || !COR_RE.test(b.color)) return { ok: false, error: 'color deve estar no formato #RRGGBB' };
    color = b.color;
  }
  let categories = [];
  if (b.categories !== undefined && b.categories !== null) {
    if (!Array.isArray(b.categories) || b.categories.length > LIMITES.categoriasMax) {
      return { ok: false, error: `categories deve ser uma lista com no máximo ${LIMITES.categoriasMax} itens` };
    }
    for (const c of b.categories) {
      if (typeof c !== 'string' || !c || c.length > LIMITES.categoriaTamanho) {
        return { ok: false, error: `cada categoria deve ser texto de até ${LIMITES.categoriaTamanho} caracteres` };
      }
    }
    categories = b.categories;
  }
  let vncPorta = null;
  if (b.vncPorta !== undefined && b.vncPorta !== null && b.vncPorta !== '') {
    vncPorta = Number(b.vncPorta);
    if (!Number.isInteger(vncPorta) || vncPorta < 1 || vncPorta > 65535) return { ok: false, error: 'a porta da tela ao vivo deve ser um número de 1 a 65535' };
  }
  return { ok: true, valor: { name, url, container: container.v, description: description.v, icon, color, categories, vncPorta } };
}

function validarUrlTeste(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'url é obrigatória' };
  const url = validarUrl(raw);
  if (!url) return { ok: false, error: 'url deve ser um endereço http ou https válido' };
  return { ok: true, valor: url };
}

module.exports = { validarId, validarUrl, validarAutomacao, validarUrlTeste, LIMITES };
