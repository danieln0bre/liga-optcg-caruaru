// Regras da tela "Administradores": quem tem acesso às planilhas e quem pode ser liberado ou removido.
// Funções puras; o acesso ao Google Drive fica em js/data/drive-api.js.

/** E-mail em formato válido, normalizado (minúsculo, sem espaços). Devolve '' se inválido. */
export function normalizarEmail(texto) {
  const email = String(texto ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

const PAPEL = { owner: 'proprietário', organizer: 'proprietário', fileOrganizer: 'editor', writer: 'editor', commenter: 'comentarista', reader: 'leitor' };

/**
 * Junta as permissões das duas planilhas numa lista por pessoa.
 * Só entram permissões de usuários (type "user"); "qualquer pessoa com o link" e grupos ficam de fora.
 * @param publica, admin: [{ id, type, role, emailAddress, displayName }] (formato da Drive API)
 * pesquisa (opcional): permissões da planilha de pesquisas, onde os administradores são leitores.
 * @returns [{ email, nome, publica, admin, pesquisa: papel|null, proprietario, completo, ids: {publica, admin, pesquisa} }]
 */
export function combinarAcessos(publica = [], admin = [], pesquisa = []) {
  const pessoas = new Map();
  const incluir = (lista, planilha) => {
    for (const p of lista) {
      if (p.type !== 'user' || !p.emailAddress) continue;
      const email = p.emailAddress.toLowerCase();
      const pessoa = pessoas.get(email) || { email, nome: '', publica: null, admin: null, pesquisa: null, proprietario: false, ids: {} };
      pessoa.nome ||= p.displayName || '';
      pessoa[planilha] = PAPEL[p.role] || p.role;
      pessoa.ids[planilha] = p.id;
      if (p.role === 'owner' || p.role === 'organizer') pessoa.proprietario = true;
      pessoas.set(email, pessoa);
    }
  };
  incluir(publica, 'publica');
  incluir(admin, 'admin');
  incluir(pesquisa, 'pesquisa');
  return [...pessoas.values()]
    .map((p) => ({ ...p, completo: ['editor', 'proprietário'].includes(p.publica) && ['editor', 'proprietário'].includes(p.admin) }))
    .sort((a, b) => Number(b.proprietario) - Number(a.proprietario) || a.email.localeCompare(b.email));
}

/**
 * Pode remover esta pessoa? Nunca o proprietário (o Google nem deixa) nem você mesmo
 * (perderia o acesso no meio da sessão).
 */
export function podeRemover(pessoa, usuarioAtual) {
  return !pessoa.proprietario && pessoa.email !== String(usuarioAtual || '').toLowerCase();
}
