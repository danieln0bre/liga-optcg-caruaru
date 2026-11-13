// Acesso de baixo nível à Google Sheets API v4 (REST), sem bibliotecas.

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class ErroSheets extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** auth: { token } do administrador logado. (A leitura pública não usa a API: ver lerAbasCsv.) */
async function chamar(url, { auth, method = 'GET', body } = {}) {
  const u = new URL(url);
  const headers = {};
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
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

/* ---------- Leitura pública sem chave de API ---------- */
// Planilhas compartilhadas como "qualquer pessoa com o link" podem ser lidas em CSV pelo endpoint
// gviz do Google Sheets, que responde com CORS. Assim o site não precisa de chave de API nenhuma.
// As abas são formatadas como texto puro (scripts/criar-abas.gs), então o gviz não converte tipos.

/** Converte CSV (RFC 4180: aspas, "" escapado, quebras de linha dentro de aspas) em matriz de strings. */
export function interpretarCsv(texto) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  const s = String(texto ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/**
 * Lê uma aba pública como CSV. `colunas` é o cabeçalho esperado: se a aba não existir, o gviz
 * devolve a PRIMEIRA aba da planilha em silêncio, e o cabeçalho diferente denuncia isso.
 */
export async function lerAbaCsv(planilhaId, aba, colunas) {
  const u = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(planilhaId)}/gviz/tq`);
  u.searchParams.set('tqx', 'out:csv');
  u.searchParams.set('headers', '1');
  u.searchParams.set('sheet', aba);
  const resp = await fetch(u, { credentials: 'omit' });
  const texto = resp.ok ? await resp.text() : '';
  const tipo = resp.headers.get('content-type') || '';
  if (!resp.ok || !tipo.includes('text/csv')) {
    // Planilha não pública devolve a página de login (HTML) em vez de CSV.
    throw new ErroSheets(resp.ok ? 403 : resp.status, 'Não foi possível ler a planilha pública. Ela está compartilhada como "qualquer pessoa com o link"?');
  }
  const valores = interpretarCsv(texto);
  const cabecalho = (valores[0] || []).map((c) => c.trim());
  if (colunas.some((c) => !cabecalho.includes(c))) {
    throw new ErroSheets(404, `A aba "${aba}" não foi encontrada na planilha pública (ou o cabeçalho está diferente).`);
  }
  valores[0] = cabecalho;
  return linhasParaObjetos(valores);
}

/** Lê várias abas públicas em paralelo. esquema: { aba: [colunas] }. Devolve { aba: [objetos] }. */
export async function lerAbasCsv(planilhaId, esquema) {
  const abas = Object.keys(esquema);
  const listas = await Promise.all(abas.map((aba) => lerAbaCsv(planilhaId, aba, esquema[aba])));
  return Object.fromEntries(abas.map((aba, i) => [aba, listas[i]]));
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
