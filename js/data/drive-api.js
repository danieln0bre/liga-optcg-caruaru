// Compartilhamento das planilhas pela Google Drive API v3 (REST), usado só na tela "Administradores".
// Quem autoriza é o Google: só consegue listar, liberar ou remover acesso quem já é editor da planilha.
import { ErroSheets } from './sheets-api.js';

const BASE = 'https://www.googleapis.com/drive/v3/files';

async function chamar(url, token, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!resp.ok) {
    let mensagem = `Erro ${resp.status} na Google Drive API`;
    try {
      const json = await resp.json();
      if (json?.error?.message) mensagem = json.error.message;
    } catch {
      /* corpo não é JSON */
    }
    throw new ErroSheets(resp.status, mensagem);
  }
  return resp.status === 204 ? null : resp.json();
}

export async function listarPermissoes(arquivoId, token) {
  const u = new URL(`${BASE}/${encodeURIComponent(arquivoId)}/permissions`);
  u.searchParams.set('fields', 'permissions(id,type,role,emailAddress,displayName)');
  u.searchParams.set('supportsAllDrives', 'true');
  const json = await chamar(u.toString(), token);
  return json.permissions || [];
}

/** Dá acesso de editor a um e-mail. O Google envia o convite por e-mail com a mensagem informada. */
export function compartilharComEditor(arquivoId, email, token, mensagem) {
  return compartilhar(arquivoId, email, 'writer', token, mensagem);
}

/** role: 'writer' (editor) ou 'reader' (leitor). Só manda e-mail de convite quando há mensagem (um convite por pessoa). */
export async function compartilhar(arquivoId, email, role, token, mensagem) {
  const u = new URL(`${BASE}/${encodeURIComponent(arquivoId)}/permissions`);
  u.searchParams.set('sendNotificationEmail', mensagem ? 'true' : 'false');
  u.searchParams.set('supportsAllDrives', 'true');
  if (mensagem) u.searchParams.set('emailMessage', mensagem);
  return chamar(u.toString(), token, { method: 'POST', body: { type: 'user', role, emailAddress: email } });
}

export async function removerPermissao(arquivoId, permissaoId, token) {
  const u = new URL(`${BASE}/${encodeURIComponent(arquivoId)}/permissions/${encodeURIComponent(permissaoId)}`);
  u.searchParams.set('supportsAllDrives', 'true');
  return chamar(u.toString(), token, { method: 'DELETE' });
}
