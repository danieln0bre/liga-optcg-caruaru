// Acesso de baixo nível à Google Sheets API v4 (REST), sem bibliotecas.

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class ErroSheets extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** auth: { apiKey } para leitura pública ou { token } para chamadas do administrador. */
async function chamar(url, { auth, method = 'GET', body } = {}) {
  const u = new URL(url);
  const headers = {};
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  else if (auth?.apiKey) u.searchParams.set('key', auth.apiKey);
  if (body) headers['Content-Type'] = 'application/json';

  const resp = await fetch(u, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!resp.ok) {
    let mensagem = `Erro ${resp.status} na Google Sheets API`;
    try {
      const json = await resp.json();
      if (json?.error?.message) mensagem = json.error.message;
    } catch {
      /* corpo não é JSON */
    }
    throw new ErroSheets(resp.status, mensagem);
  }
  return resp.json();
}

/** Converte linhas (primeira = cabeçalho) em objetos. Guarda o número da linha na planilha em _linha. */
export function linhasParaObjetos(valores = []) {
  const [cabecalho = [], ...linhas] = valores;
  return linhas
    .map((linha, i) => {
      const obj = { _linha: i + 2 };
      cabecalho.forEach((col, j) => {
        obj[col] = linha[j] ?? '';
      });
      return obj;
    })
    .filter((obj) => cabecalho.some((col) => String(obj[col]).trim() !== ''));
}

export function objetoParaLinha(obj, colunas) {
  return colunas.map((c) => (obj[c] === undefined || obj[c] === null ? '' : String(obj[c])));
}

/** Lê várias abas inteiras de uma vez. Devolve { aba: [objetos] }. */
export async function lerAbas(planilhaId, abas, auth) {
  const u = new URL(`${BASE}/${planilhaId}/values:batchGet`);
  for (const aba of abas) u.searchParams.append('ranges', aba);
  u.searchParams.set('majorDimension', 'ROWS');
  const json = await chamar(u.toString(), { auth });
  const saida = {};
  (json.valueRanges || []).forEach((vr, i) => {
    saida[abas[i]] = linhasParaObjetos(vr.values);
  });
  return saida;
}

/** Acrescenta linhas ao fim de uma aba. */
export async function acrescentar(planilhaId, aba, colunas, objetos, auth) {
  if (!objetos.length) return;
  const url = `${BASE}/${planilhaId}/values/${encodeURIComponent(aba)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await chamar(url, { auth, method: 'POST', body: { values: objetos.map((o) => objetoParaLinha(o, colunas)) } });
}

/** Sobrescreve uma linha existente (número da linha na planilha, começando em 1). */
export async function atualizarLinha(planilhaId, aba, numeroLinha, colunas, objeto, auth) {
  const url = `${BASE}/${planilhaId}/values/${encodeURIComponent(aba)}!A${numeroLinha}?valueInputOption=RAW`;
  await chamar(url, { auth, method: 'PUT', body: { values: [objetoParaLinha(objeto, colunas)] } });
}

/** Apaga o conteúdo de linhas (a linha fica vazia e é ignorada na leitura). */
export async function limparLinhas(planilhaId, aba, numerosLinha, auth) {
  if (!numerosLinha.length) return;
  const ranges = numerosLinha.map((n) => `${aba}!A${n}:Z${n}`);
  await chamar(`${BASE}/${planilhaId}/values:batchClear`, { auth, method: 'POST', body: { ranges } });
}

/** Lê só a célula A1 — usado para conferir se o usuário tem acesso à planilha. */
export async function testarAcesso(planilhaId, auth) {
  await chamar(`${BASE}/${planilhaId}/values/A1`, { auth });
}
