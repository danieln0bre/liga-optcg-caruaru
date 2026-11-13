// Login do administrador com Google Identity Services (modelo de token, sem servidor).
// O token dura cerca de 1 hora e fica só na memória da aba; ao expirar, pede-se outro.

const ESCOPOS = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let clienteToken = null;
let sessao = null; // { token, expiraEm, email }

function carregarScriptGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Não foi possível carregar o login do Google.'));
    document.head.appendChild(s);
  });
}

async function obterEmail(token) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('Não foi possível identificar a conta Google.');
  const json = await resp.json();
  return json.email;
}

/**
 * Abre o login do Google (ou renova o token silenciosamente se já houver consentimento).
 * @returns {Promise<{token, email}>}
 */
export async function entrar(clientId, { silencioso = false } = {}) {
  await carregarScriptGoogle();
  return new Promise((resolve, reject) => {
    clienteToken = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPOS,
      callback: async (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        try {
          const email = await obterEmail(resp.access_token);
          sessao = { token: resp.access_token, expiraEm: Date.now() + (Number(resp.expires_in) - 60) * 1000, email };
          resolve({ token: sessao.token, email });
        } catch (e) {
          reject(e);
        }
      },
      error_callback: (e) => reject(new Error(e?.message || 'Login cancelado.')),
    });
    clienteToken.requestAccessToken({ prompt: silencioso ? '' : 'select_account' });
  });
}

/*
 * Permissão do Google Drive, pedida só na tela "Administradores" (para compartilhar as planilhas).
 * O Drive não tem um escopo "só estes dois arquivos" para planilhas criadas fora do app, então o
 * escopo é amplo: por isso ele não entra no login normal, o token fica num lugar separado, só em
 * memória, e é usado apenas pelas chamadas de compartilhamento.
 */
const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive';
let sessaoDrive = null; // { token, expiraEm }

export async function tokenDrive(clientId) {
  if (sessaoDrive && Date.now() < sessaoDrive.expiraEm) return sessaoDrive.token;
  await carregarScriptGoogle();
  return new Promise((resolve, reject) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPO_DRIVE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, ESCOPO_DRIVE)) {
          reject(new Error('A permissão do Google Drive não foi concedida.'));
          return;
        }
        sessaoDrive = { token: resp.access_token, expiraEm: Date.now() + (Number(resp.expires_in) - 60) * 1000 };
        resolve(sessaoDrive.token);
      },
      error_callback: (e) => reject(new Error(e?.message || 'Autorização cancelada.')),
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

export function sessaoAtual() {
  if (!sessao || Date.now() > sessao.expiraEm) return null;
  return { token: sessao.token, email: sessao.email };
}

export function sair() {
  if (sessao?.token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(sessao.token, () => {});
  }
  sessao = null;
  sessaoDrive = null;
}
