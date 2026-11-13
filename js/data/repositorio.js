// Repositório de dados: mesma interface para o modo demonstração e para o Google Sheets.
import { ESQUEMA_PUBLICO, ESQUEMA_ADMIN, ESQUEMA_PESQUISA } from './esquema.js';
import * as api from './sheets-api.js';
import * as drive from './drive-api.js';
import { combinarAcessos } from '../domain/acessos.js';

const ABAS_PUBLICAS = Object.keys(ESQUEMA_PUBLICO);
const ABAS_ADMIN = Object.keys(ESQUEMA_ADMIN);
const ABAS_PESQUISA = Object.keys(ESQUEMA_PESQUISA);
const agora = () => new Date().toISOString();

const CONVITE = 'Você recebeu acesso de administrador da liga. Entre na área de Administração do site com esta conta Google.';

export function criarRepositorio(config) {
  return config.modo === 'sheets' ? new RepositorioSheets(config.google) : new RepositorioDemo();
}

/* ------------------------------------------------------------------ */
/* Google Sheets                                                       */
/* ------------------------------------------------------------------ */

class RepositorioSheets {
  constructor(google) {
    this.g = google;
    this.auth = null; // { token } depois do login do administrador
  }

  get modo() {
    return 'sheets';
  }

  definirToken(token) {
    this.auth = token ? { token } : null;
  }

  async carregarPublico() {
    // Com login, lê com o token (dados mais frescos e sem depender da chave de API).
    const auth = this.auth || { apiKey: this.g.apiKey };
    return api.lerAbas(this.g.planilhaPublicaId, ABAS_PUBLICAS, auth);
  }

  /** Lança ErroSheets com status 403/404 quando o usuário não tem acesso. */
  async verificarAcessoAdmin() {
    await api.testarAcesso(this.g.planilhaAdminId, this.auth);
  }

  async carregarAdmin() {
    const [publico, admin, pesquisa] = await Promise.all([
      this.carregarPublico(),
      api.lerAbas(this.g.planilhaAdminId, ABAS_ADMIN, this.auth),
      // Abas da pesquisa só existem depois de instalar o Apps Script; sem elas, segue vazio.
      this.g.planilhaPesquisaId
        ? api.lerAbas(this.g.planilhaPesquisaId, ABAS_PESQUISA, this.auth).catch(() => Object.fromEntries(ABAS_PESQUISA.map((a) => [a, []])))
        : Object.fromEntries(ABAS_PESQUISA.map((a) => [a, []])),
    ]);
    return { ...publico, ...admin, ...pesquisa };
  }

  async #auditar(usuario, acao, detalhe) {
    await api.acrescentar(this.g.planilhaAdminId, 'auditoria', ESQUEMA_ADMIN.auditoria, [
      { data: agora(), usuario, acao, detalhe: typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe) },
    ], this.auth);
  }

  /** Atualiza a linha cujo id coincide; relê a aba para não depender de números de linha antigos. */
  async #atualizarPorId(aba, objeto) {
    const { [aba]: linhas } = await api.lerAbas(this.g.planilhaPublicaId, [aba], this.auth);
    const existente = linhas.find((l) => l.id === objeto.id);
    if (!existente) return false;
    await api.atualizarLinha(this.g.planilhaPublicaId, aba, existente._linha, ESQUEMA_PUBLICO[aba], { ...existente, ...objeto }, this.auth);
    return true;
  }

  async salvarJogador(jogador, usuario) {
    const atualizado = jogador.id && (await this.#atualizarPorId('jogadores', jogador));
    if (!atualizado) {
      await api.acrescentar(this.g.planilhaPublicaId, 'jogadores', ESQUEMA_PUBLICO.jogadores, [{ ...jogador, criado_em: agora() }], this.auth);
    }
    await this.#auditar(usuario, atualizado ? 'editar_jogador' : 'criar_jogador', { id: jogador.id, nome: jogador.nome });
  }

  async registrarTorneio({ torneio, resultados, novosJogadores, novosApelidos, novosNumeros = [] }, usuario) {
    const pid = this.g.planilhaPublicaId;
    // Ordem: jogadores novos → torneio → resultados. Se algo falhar no meio, o torneio
    // pode ficar sem resultados; ele aparece na lista e pode ser anulado e lançado de novo.
    await api.acrescentar(pid, 'jogadores', ESQUEMA_PUBLICO.jogadores, novosJogadores.map((j) => ({ ...j, criado_em: agora() })), this.auth);
    await api.acrescentar(pid, 'torneios', ESQUEMA_PUBLICO.torneios, [{ ...torneio, criado_por: usuario, criado_em: agora() }], this.auth);
    await api.acrescentar(pid, 'resultados', ESQUEMA_PUBLICO.resultados, resultados, this.auth);
    await api.acrescentar(this.g.planilhaAdminId, 'apelidos', ESQUEMA_ADMIN.apelidos,
      novosApelidos.map((a) => ({ ...a, criado_por: usuario, criado_em: agora() })), this.auth);
    await api.acrescentar(this.g.planilhaAdminId, 'numeros_membro', ESQUEMA_ADMIN.numeros_membro,
      novosNumeros.map((n) => ({ ...n, criado_por: usuario, criado_em: agora() })), this.auth);
    await this.#auditar(usuario, 'registrar_torneio', { id: torneio.id, nome: torneio.nome, participantes: resultados.length });
  }

  /** Associa Member Numbers a jogadores (só na planilha administrativa). A linha mais recente prevalece. */
  async vincularMemberNumbers(lista, usuario) {
    await api.acrescentar(this.g.planilhaAdminId, 'numeros_membro', ESQUEMA_ADMIN.numeros_membro,
      lista.map((n) => ({ ...n, criado_por: usuario, criado_em: agora() })), this.auth);
    await this.#auditar(usuario, 'vincular_member_number', { jogadores: lista.map((n) => n.jogador_id) });
  }

  async alterarStatusTorneio(id, status, usuario) {
    await this.#atualizarPorId('torneios', { id, status });
    await this.#auditar(usuario, 'status_torneio', { id, status });
  }

  async salvarTemporada(temporada, usuario) {
    const atualizado = await this.#atualizarPorId('temporadas', temporada);
    if (!atualizado) {
      await api.acrescentar(this.g.planilhaPublicaId, 'temporadas', ESQUEMA_PUBLICO.temporadas, [temporada], this.auth);
    }
    await this.#auditar(usuario, atualizado ? 'editar_temporada' : 'criar_temporada', temporada);
  }

  /** Substitui a classificação histórica de uma temporada. */
  async gravarClassificacaoHistorica(temporadaId, linhas, novosJogadores, usuario) {
    const pid = this.g.planilhaPublicaId;
    const { classificacao_historica: atuais } = await api.lerAbas(pid, ['classificacao_historica'], this.auth);
    const antigas = atuais.filter((l) => l.temporada_id === temporadaId).map((l) => l._linha);
    await api.acrescentar(pid, 'jogadores', ESQUEMA_PUBLICO.jogadores, novosJogadores.map((j) => ({ ...j, criado_em: agora() })), this.auth);
    await api.limparLinhas(pid, 'classificacao_historica', antigas, this.auth);
    await api.acrescentar(pid, 'classificacao_historica', ESQUEMA_PUBLICO.classificacao_historica, linhas, this.auth);
    await this.#auditar(usuario, 'gravar_classificacao_historica', { temporadaId, linhas: linhas.length });
  }

  /* ---------- Administradores (compartilhamento das planilhas pelo Drive) ---------- */

  async listarAcessos(tokenDrive) {
    const [publica, admin, pesquisa] = await Promise.all([
      drive.listarPermissoes(this.g.planilhaPublicaId, tokenDrive),
      drive.listarPermissoes(this.g.planilhaAdminId, tokenDrive),
      this.g.planilhaPesquisaId ? drive.listarPermissoes(this.g.planilhaPesquisaId, tokenDrive).catch(() => []) : [],
    ]);
    return combinarAcessos(publica, admin, pesquisa);
  }

  /** Editor nas duas planilhas. Primeiro a administrativa: sem ela, o acesso não serve para nada. */
  async liberarAcesso(email, tokenDrive, usuario) {
    await drive.compartilharComEditor(this.g.planilhaAdminId, email, tokenDrive, CONVITE);
    await drive.compartilharComEditor(this.g.planilhaPublicaId, email, tokenDrive);
    // Pesquisas: só leitura, para ver os resultados no site sem acesso ao script (e à chave da IA).
    if (this.g.planilhaPesquisaId) await drive.compartilhar(this.g.planilhaPesquisaId, email, 'reader', tokenDrive);
    await this.#auditar(usuario, 'liberar_acesso', { email });
  }

  async removerAcesso(pessoa, tokenDrive, usuario) {
    if (pessoa.ids.admin) await drive.removerPermissao(this.g.planilhaAdminId, pessoa.ids.admin, tokenDrive);
    if (pessoa.ids.publica) await drive.removerPermissao(this.g.planilhaPublicaId, pessoa.ids.publica, tokenDrive);
    if (pessoa.ids.pesquisa && this.g.planilhaPesquisaId) await drive.removerPermissao(this.g.planilhaPesquisaId, pessoa.ids.pesquisa, tokenDrive);
    await this.#auditar(usuario, 'remover_acesso', { email: pessoa.email });
  }

  async adicionarNota(nota, usuario) {
    await api.acrescentar(this.g.planilhaAdminId, 'notas_jogador', ESQUEMA_ADMIN.notas_jogador, [nota], this.auth);
    await this.#auditar(usuario, 'nota_jogador', { jogador_id: nota.jogador_id });
  }
}

/* ------------------------------------------------------------------ */
/* Demonstração (dados locais, gravação só no navegador)               */
/* ------------------------------------------------------------------ */

const CHAVE_DEMO = 'liga-optcg-demo-v1';

class RepositorioDemo {
  constructor() {
    this.dados = null;
  }

  get modo() {
    return 'demo';
  }

  definirToken() {}

  async #garantir() {
    if (this.dados) return;
    try {
      const salvo = localStorage.getItem(CHAVE_DEMO);
      if (salvo) {
        this.dados = JSON.parse(salvo);
        return;
      }
    } catch {
      /* armazenamento indisponível: segue com o arquivo */
    }
    const resp = await fetch('data/demo.json');
    this.dados = await resp.json();
  }

  #persistir() {
    try {
      localStorage.setItem(CHAVE_DEMO, JSON.stringify(this.dados));
    } catch {
      /* sem persistência: os dados valem até recarregar a página */
    }
  }

  async restaurar() {
    try {
      localStorage.removeItem(CHAVE_DEMO);
    } catch {
      /* ignorado */
    }
    this.dados = null;
    await this.#garantir();
  }

  #copia(abas) {
    return Object.fromEntries(abas.map((a) => [a, structuredClone(this.dados[a] || [])]));
  }

  async carregarPublico() {
    await this.#garantir();
    return this.#copia(ABAS_PUBLICAS);
  }

  async verificarAcessoAdmin() {}

  async carregarAdmin() {
    await this.#garantir();
    return this.#copia([...ABAS_PUBLICAS, ...ABAS_ADMIN, ...ABAS_PESQUISA]);
  }

  #auditar(usuario, acao, detalhe) {
    (this.dados.auditoria ||= []).push({ data: agora(), usuario, acao, detalhe: JSON.stringify(detalhe) });
  }

  #upsert(aba, objeto) {
    const lista = (this.dados[aba] ||= []);
    const i = lista.findIndex((l) => l.id === objeto.id);
    if (i >= 0) lista[i] = { ...lista[i], ...objeto };
    else lista.push(objeto);
    return i >= 0;
  }

  async salvarJogador(jogador, usuario) {
    await this.#garantir();
    const existia = this.#upsert('jogadores', { criado_em: agora(), ...jogador });
    this.#auditar(usuario, existia ? 'editar_jogador' : 'criar_jogador', { id: jogador.id });
    this.#persistir();
  }

  async registrarTorneio({ torneio, resultados, novosJogadores, novosApelidos, novosNumeros = [] }, usuario) {
    await this.#garantir();
    this.dados.jogadores.push(...novosJogadores.map((j) => ({ ...j, criado_em: agora() })));
    this.dados.torneios.push({ ...torneio, criado_por: usuario, criado_em: agora() });
    this.dados.resultados.push(...resultados);
    (this.dados.apelidos ||= []).push(...novosApelidos.map((a) => ({ ...a, criado_por: usuario, criado_em: agora() })));
    (this.dados.numeros_membro ||= []).push(...novosNumeros.map((n) => ({ ...n, criado_por: usuario, criado_em: agora() })));
    this.#auditar(usuario, 'registrar_torneio', { id: torneio.id });
    this.#persistir();
  }

  async vincularMemberNumbers(lista, usuario) {
    await this.#garantir();
    (this.dados.numeros_membro ||= []).push(...lista.map((n) => ({ ...n, criado_por: usuario, criado_em: agora() })));
    this.#auditar(usuario, 'vincular_member_number', { jogadores: lista.map((n) => n.jogador_id) });
    this.#persistir();
  }

  async alterarStatusTorneio(id, status, usuario) {
    await this.#garantir();
    this.#upsert('torneios', { id, status });
    this.#auditar(usuario, 'status_torneio', { id, status });
    this.#persistir();
  }

  async salvarTemporada(temporada, usuario) {
    await this.#garantir();
    this.#upsert('temporadas', temporada);
    this.#auditar(usuario, 'salvar_temporada', temporada);
    this.#persistir();
  }

  async gravarClassificacaoHistorica(temporadaId, linhas, novosJogadores, usuario) {
    await this.#garantir();
    this.dados.jogadores.push(...novosJogadores.map((j) => ({ ...j, criado_em: agora() })));
    this.dados.classificacao_historica = this.dados.classificacao_historica.filter((l) => l.temporada_id !== temporadaId);
    this.dados.classificacao_historica.push(...linhas);
    this.#auditar(usuario, 'gravar_classificacao_historica', { temporadaId });
    this.#persistir();
  }

  // Na demonstração, a lista de acesso é simulada (sem Drive).
  async listarAcessos() {
    await this.#garantir();
    const lista = this.dados.acessos || [];
    return combinarAcessos(
      lista.map((a, i) => ({ id: `p${i}`, type: 'user', role: a.proprietario ? 'owner' : 'writer', emailAddress: a.email, displayName: a.nome })),
      lista.map((a, i) => ({ id: `a${i}`, type: 'user', role: a.proprietario ? 'owner' : 'writer', emailAddress: a.email, displayName: a.nome })),
      lista.map((a, i) => ({ id: `q${i}`, type: 'user', role: a.proprietario ? 'owner' : 'reader', emailAddress: a.email, displayName: a.nome })),
    );
  }

  async liberarAcesso(email, _token, usuario) {
    await this.#garantir();
    const lista = (this.dados.acessos ||= []);
    if (!lista.some((a) => a.email === email)) lista.push({ email, nome: '', proprietario: false });
    this.#auditar(usuario, 'liberar_acesso', { email });
    this.#persistir();
  }

  async removerAcesso(pessoa, _token, usuario) {
    await this.#garantir();
    this.dados.acessos = (this.dados.acessos || []).filter((a) => a.email !== pessoa.email);
    this.#auditar(usuario, 'remover_acesso', { email: pessoa.email });
    this.#persistir();
  }

  async adicionarNota(nota, usuario) {
    await this.#garantir();
    (this.dados.notas_jogador ||= []).push(nota);
    this.#auditar(usuario, 'nota_jogador', { jogador_id: nota.jogador_id });
    this.#persistir();
  }
}
