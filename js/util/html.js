// Template de HTML com escape automático. Todo valor interpolado é escapado,
// exceto o que já vier de outro html`` (marcado como Seguro). Evita XSS vindo das planilhas.

class Seguro {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapar = (v) => String(v).replace(/[&<>"']/g, (c) => MAPA[c]);

function valorParaHtml(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Seguro) return v.texto;
  if (Array.isArray(v)) return v.map(valorParaHtml).join('');
  return escapar(v);
}

export function html(partes, ...valores) {
  let saida = partes[0];
  valores.forEach((v, i) => {
    saida += valorParaHtml(v) + partes[i + 1];
  });
  return new Seguro(saida);
}

/** Aceita apenas URLs https (fotos de perfil); qualquer outra coisa vira vazio. */
export function urlSegura(url) {
  try {
    const u = new URL(String(url ?? '').trim());
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}
