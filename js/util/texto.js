// Utilitários de texto sem dependência de DOM (usados também nos testes em Node).

/** Normaliza para comparação: sem acentos, minúsculo, só letras/números separados por espaço. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** Similaridade entre 0 e 1 entre dois textos já normalizados. */
export function similaridade(a, b) {
  if (!a || !b) return 0;
  const base = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  // Bônus quando um nome abreviado bate com o início do outro ("joao s" x "joao silva").
  const ta = a.split(' ');
  const tb = b.split(' ');
  const primeiroIgual = ta[0] === tb[0] && ta[0].length >= 3;
  // Cada sobrenome presente nos dois deve ser prefixo do outro ("s" e "silva").
  const abreviacaoCompativel =
    primeiroIgual &&
    ta.length > 1 &&
    tb.length > 1 &&
    ta.slice(1).every((t, i) => tb[i + 1] === undefined || tb[i + 1].startsWith(t) || t.startsWith(tb[i + 1]));
  return abreviacaoCompativel ? Math.max(base, 0.8) : base;
}

/**
 * Member Number do Bandai TCG+: exatamente 10 dígitos (com zeros à esquerda).
 * Devolve os 10 dígitos ou '' se o texto não for um número válido.
 */
export function normalizarMemberNumber(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  return digitos.length === 10 ? digitos : '';
}

/** Gera um ID curto com prefixo, ex.: "j_k3x9a2pq". */
export function novoId(prefixo) {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const corpo = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  return `${prefixo}_${corpo}${Date.now().toString(36).slice(-3)}`;
}

/** Iniciais para avatar sem foto. */
export function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
