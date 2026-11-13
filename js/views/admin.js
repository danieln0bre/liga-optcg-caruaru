// Área de administração: login, lançamento de torneios, jogadores e temporadas.
import { html, formatarData } from '../util/html.js';
import { avatar, vazio, erro, carregando } from '../ui/componentes.js';
import { normalizar, normalizarMemberNumber, novoId } from '../util/texto.js';
import * as auth from '../auth/google.js';
import {
  calcularRanking,
  congelarClassificacao,
  interpretarClassificacaoColada,
  mapaMemberNumbers,
  pontosPorColocacao,
  sugerirJogador,
  temporadaAtiva,
  torneioValido,
} from '../domain/liga.js';
import { juntarPrints, classificacaoComoTexto } from '../domain/print-ranking.js';
import { normalizarEmail, podeRemover } from '../domain/acessos.js';
import { evolucaoPercentil } from '../domain/gestao.js';
import { graficoLinhaPercentual } from '../ui/graficos.js';
import { abaPainel } from './painel.js';
import { abaPesquisas } from './pesquisas.js';

const ABAS = [
  ['torneio', 'Lançar torneio'],
  ['painel', 'Painel'],
  ['pesquisas', 'Pesquisas'],
  ['torneios', 'Torneios'],
  ['jogadores', 'Jogadores'],
  ['temporadas', 'Temporadas'],
  ['acessos', 'Administradores'],
];

const NOVO = '__novo__';

export function montarAdmin(raiz, { repo, config, aba, aoAlterarDados }) {
  const st = {
    usuario: null,
    dados: null,
    aba: ABAS.some(([id]) => id === aba) ? aba : 'torneio',
    mensagem: null, // { tipo: 'ok'|'erro', texto }
    conferencia: null, // rascunho de torneio ou importação em conferência
    jogadorEditando: null,
    filtroJogadores: '',
    ocupado: false,
    leituraPrint: null, // { lendo: 'mensagem' } durante o OCR; { avisos, total } depois
    acessos: null, // lista de quem tem acesso às planilhas (carregada sob demanda)
    painelTemporada: null, // filtro do painel (padrão: a mais recente)
  };

  const jogadoresPorId = () => new Map(st.dados.jogadores.map((j) => [j.id, j]));

  /* ---------------- sessão ---------------- */

  async function entrar() {
    st.mensagem = null;
    try {
      if (repo.modo === 'demo') {
        st.usuario = 'admin.demo@exemplo.com';
      } else {
        const { token, email } = await auth.entrar(config.google.oauthClientId);
        repo.definirToken(token);
        st.usuario = email;
      }
      await repo.verificarAcessoAdmin();
      await recarregar();
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        st.semAcesso = true;
      } else {
        st.mensagem = { tipo: 'erro', texto: e.message };
        st.usuario = null;
      }
    }
    render();
  }

  function sair() {
    auth.sair();
    repo.definirToken(null);
    Object.assign(st, { usuario: null, dados: null, semAcesso: false, conferencia: null, jogadorEditando: null, acessos: null });
    render();
  }

  async function recarregar() {
    st.dados = await repo.carregarAdmin();
    st.semAcesso = false;
  }

  /** Executa uma gravação com tratamento de erro e renovação do token expirado. */
  async function executar(acao, mensagemOk) {
    if (st.ocupado) return;
    st.ocupado = true;
    render();
    try {
      if (repo.modo === 'sheets' && !auth.sessaoAtual()) {
        const { token } = await auth.entrar(config.google.oauthClientId, { silencioso: true });
        repo.definirToken(token);
      }
      await acao();
      await recarregar();
      st.mensagem = { tipo: 'ok', texto: mensagemOk };
      aoAlterarDados?.();
    } catch (e) {
      st.mensagem = { tipo: 'erro', texto: `Não foi possível salvar: ${e.message}` };
    } finally {
      st.ocupado = false;
      render();
      raiz.scrollIntoView({ block: 'start' });
    }
  }

  /* ---------------- conferência de nomes (torneio e importação) ---------------- */

  function montarConferencia(texto, extra) {
    const linhas = interpretarClassificacaoColada(texto).map((l) => {
      const s = sugerirJogador(l.texto, st.dados.jogadores, st.dados.apelidos || [], {
        memberNumber: l.memberNumber,
        numeros: st.dados.numeros_membro || [],
      });
      return { ...l, escolha: s.jogador_id || NOVO, confianca: s.confianca, origem: s.origem, candidatos: s.candidatos };
    });
    return { ...extra, linhas };
  }

  function seletorJogador(linha, i) {
    const jogadores = [...st.dados.jogadores].sort((a, b) => a.nome.localeCompare(b.nome));
    const porId = jogadoresPorId();
    const candidatos = linha.candidatos.filter((c) => c.score >= 0.5).map((c) => porId.get(c.jogador_id)).filter(Boolean);
    return html`
      <select name="escolha-${i}" data-linha="${i}">
        <option value="${NOVO}" ${linha.escolha === NOVO ? 'selected' : ''}>+ Criar jogador "${linha.texto}"</option>
        ${candidatos.length ? html`<optgroup label="Sugestões">${candidatos.map((j) => html`<option value="${j.id}" ${linha.escolha === j.id ? 'selected' : ''}>${j.nome}</option>`)}</optgroup>` : ''}
        <optgroup label="Todos os jogadores">
          ${jogadores.map((j) => html`<option value="${j.id}" ${linha.escolha === j.id && !candidatos.includes(j) ? 'selected' : ''}>${j.nome}</option>`)}
        </optgroup>
      </select>`;
  }

  const ROTULO_CONFIANCA = { exata: 'nome exato', provavel: 'confira', nenhuma: 'novo?' };
  const rotuloConfianca = (l) => (l.origem === 'member_number' ? 'Member Number' : ROTULO_CONFIANCA[l.confianca]);

  function tabelaConferencia(conf, { mostrarPontosCalculados }) {
    const n = conf.linhas.length;
    return html`
      <div class="tbl-scroll"><table class="tbl compact">
        <thead><tr><th class="num">Pos.</th><th>Texto informado</th><th>Jogador</th><th></th><th class="num">Pontos</th></tr></thead>
        <tbody>${conf.linhas.map((l, i) => html`
          <tr>
            <td class="num">${l.colocacao}º</td>
            <td>${l.texto}${l.memberNumber ? html`<br><span class="sub">Member Number ${l.memberNumber}</span>` : ''}</td>
            <td>${seletorJogador(l, i)}</td>
            <td><span class="status ${l.confianca}">${rotuloConfianca(l)}</span></td>
            <td class="num">${mostrarPontosCalculados ? pontosPorColocacao(l.colocacao, n) : (l.pontos ?? '—')}</td>
          </tr>`)}</tbody>
      </table></div>`;
  }

  /** Lê as escolhas do formulário e devolve jogadores novos, apelidos e Member Numbers novos e o id de cada linha. */
  function resolverConferencia(form) {
    const conf = st.conferencia;
    const novosJogadores = [];
    const novosApelidos = [];
    const novosNumeros = [];
    const porId = jogadoresPorId();
    const numerosAtuais = mapaMemberNumbers(st.dados.numeros_membro || []);
    const ids = conf.linhas.map((l, i) => {
      const escolha = form.elements[`escolha-${i}`].value;
      l.escolha = escolha;
      // Member Number novo, ou que passa a apontar para outro jogador, fica salvo na planilha administrativa.
      const guardarNumero = (jogadorId) => {
        if (l.memberNumber && numerosAtuais.get(l.memberNumber) !== jogadorId) novosNumeros.push({ member_number: l.memberNumber, jogador_id: jogadorId });
      };
      if (escolha === NOVO) {
        const j = { id: novoId('j'), nome: l.texto, foto_url: '', deck_favorito: '', bio: '', ativo: 'sim' };
        novosJogadores.push(j);
        guardarNumero(j.id);
        return j.id;
      }
      guardarNumero(escolha);
      // Memoriza a grafia diferente como apelido, para o próximo lançamento reconhecer sozinho.
      const nomeOficial = normalizar(porId.get(escolha)?.nome);
      const jaExiste = (st.dados.apelidos || []).some((a) => a.jogador_id === escolha && normalizar(a.apelido) === normalizar(l.texto));
      if (normalizar(l.texto) !== nomeOficial && !jaExiste) novosApelidos.push({ apelido: l.texto, jogador_id: escolha });
      return escolha;
    });
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidos.length) {
      const nomes = [...new Set(repetidos)].map((id) => porId.get(id)?.nome || 'jogador novo');
      throw new Error(`O mesmo jogador aparece mais de uma vez: ${nomes.join(', ')}.`);
    }
    const numeros = conf.linhas.map((l) => l.memberNumber).filter(Boolean);
    const numerosRepetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    if (numerosRepetidos.length) {
      throw new Error(`O mesmo Member Number aparece mais de uma vez: ${[...new Set(numerosRepetidos)].join(', ')}.`);
    }
    return { ids, novosJogadores, novosApelidos, novosNumeros };
  }

  /* ---------------- abas ---------------- */

  function abaTorneio() {
    const ativa = temporadaAtiva(st.dados.temporadas);
    const temporadas = st.dados.temporadas.filter((t) => t.status === 'ativa');
    if (!temporadas.length) return vazio('Crie ou reabra uma temporada antes de lançar torneios (aba Temporadas).');

    const conf = st.conferencia?.tipo === 'torneio' ? st.conferencia : null;
    const hoje = new Date().toISOString().slice(0, 10);

    if (conf) {
      return html`
        <form data-form="confirmar-torneio" class="panel">
          <h2>Conferir: ${conf.nome}</h2>
          <p class="sub">${formatarData(conf.data)} · ${conf.linhas.length} participantes · ${st.dados.temporadas.find((t) => t.id === conf.temporada_id)?.nome}</p>
          <p class="hint">Confira cada nome. Linhas marcadas com "confira" foram associadas por semelhança.
            Quando a grafia for diferente do nome cadastrado, ela fica salva como apelido para os próximos lançamentos.</p>
          ${tabelaConferencia(conf, { mostrarPontosCalculados: true })}
          <div class="actions">
            <button type="button" class="btn" data-acao="voltar-torneio">Voltar e editar</button>
            <button class="btn primary" type="submit" ${st.ocupado ? 'disabled' : ''}>Registrar torneio</button>
          </div>
        </form>`;
    }

    return html`
      <form data-form="conferir-torneio" class="panel">
        <h2>Lançar resultado de torneio</h2>
        <div class="fields">
          <label>Temporada
            <select name="temporada_id" required>${temporadas.map((t) => html`<option value="${t.id}" ${t.id === ativa?.id ? 'selected' : ''}>${t.nome}</option>`)}</select>
          </label>
          <label>Data <input type="date" name="data" value="${st.rascunhoTorneio?.data || hoje}" required></label>
          <label>Nome do torneio <input name="nome" value="${st.rascunhoTorneio?.nome || ''}" placeholder="Local de sábado"></label>
        </div>
        <fieldset class="print-upload">
          <legend>Print do ranking (Bandai TCG+)</legend>
          <p class="hint">No app, abra o evento e a tela <strong>Ranking</strong>. Se a lista não couber numa tela, envie vários prints de uma vez.
            A leitura acontece neste navegador; a imagem não é enviada a nenhum servidor.</p>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-campo="prints" aria-label="Escolher prints do ranking" ${st.leituraPrint?.lendo ? 'disabled' : ''}>
          ${avisosPrint()}
        </fieldset>
        <label>Classificação final, um jogador por linha, do 1º ao último
          <textarea name="classificacao" rows="12" required placeholder="1. Rafael Torres&#10;2. Bianca Ferraz (0000123456)&#10;3. PH Sá">${st.rascunhoTorneio?.classificacao || ''}</textarea>
        </label>
        <p class="hint">Preenchida pelo print ou digitada. Numeração no início da linha é opcional; o Member Number entre parênteses
          ao fim do nome é usado para reconhecer o jogador e fica só na planilha administrativa.</p>
        <div class="actions"><button class="btn primary" type="submit">Conferir nomes</button></div>
      </form>`;
  }

  function avisosPrint() {
    const lp = st.leituraPrint;
    if (!lp) return '';
    if (lp.lendo) return html`<p class="notice" role="status" aria-live="polite">${lp.lendo}</p>`;
    if (lp.erro) return html`<p class="notice bad" role="alert">${lp.erro}</p>`;
    return html`
      <div class="notice ${lp.avisos.length ? '' : 'ok'}" role="status">
        <p>${lp.total} ${lp.total === 1 ? 'jogador lido' : 'jogadores lidos'}. Confira a lista abaixo antes de continuar.</p>
        ${lp.avisos.length ? html`<ul>${lp.avisos.map((a) => html`<li>${a}</li>`)}</ul>` : ''}
      </div>`;
  }

  /** Guarda o que já foi digitado no formulário de torneio (a tela é redesenhada durante a leitura). */
  function guardarRascunhoTorneio() {
    const form = raiz.querySelector('[data-form="conferir-torneio"]');
    if (form) st.rascunhoTorneio = Object.fromEntries(new FormData(form));
  }

  async function lerPrintsEnviados(arquivos) {
    if (!arquivos.length) return;
    guardarRascunhoTorneio();
    st.leituraPrint = { lendo: 'Preparando a leitura…' };
    render();
    try {
      // Carregado só quando necessário: o leitor tem alguns megabytes.
      const { lerPrints } = await import('../ocr/leitor-print.js');
      const leituras = await lerPrints(arquivos, (mensagem) => {
        st.leituraPrint = { lendo: mensagem };
        render();
      });
      const { jogadores, avisos } = juntarPrints(leituras);
      st.rascunhoTorneio = { ...st.rascunhoTorneio, classificacao: classificacaoComoTexto(jogadores) };
      st.leituraPrint = { avisos, total: jogadores.length };
    } catch (e) {
      st.leituraPrint = { erro: `Não foi possível ler o print: ${e.message}` };
    }
    render();
    raiz.querySelector('textarea[name="classificacao"]')?.focus();
  }

  function abaTorneios() {
    const porTemporada = st.dados.temporadas
      .filter((t) => st.dados.torneios.some((x) => x.temporada_id === t.id))
      .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    if (!porTemporada.length) return vazio('Nenhum torneio lançado.');
    const contagem = new Map();
    for (const r of st.dados.resultados) contagem.set(r.torneio_id, (contagem.get(r.torneio_id) || 0) + 1);

    return porTemporada.map((temp) => {
      const lista = st.dados.torneios.filter((t) => t.temporada_id === temp.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
      return html`
        <section class="panel">
          <h2>${temp.nome}</h2>
          <div class="tbl-scroll"><table class="tbl compact">
            <thead><tr><th>Data</th><th>Nome</th><th class="num">Participantes</th><th>Situação</th><th>Lançado por</th><th></th></tr></thead>
            <tbody>${lista.map((t) => html`
              <tr class="${torneioValido(t) ? '' : 'off'}">
                <td>${formatarData(t.data)}</td><td>${t.nome}</td><td class="num">${contagem.get(t.id) || 0}</td>
                <td>${torneioValido(t) ? 'confirmado' : 'anulado'}</td><td class="muted">${t.criado_por}</td>
                <td>${torneioValido(t)
                  ? html`<button class="btn small danger" data-acao="anular" data-id="${t.id}">Anular</button>`
                  : html`<button class="btn small" data-acao="reativar" data-id="${t.id}">Reativar</button>`}</td>
              </tr>`)}</tbody>
          </table></div>
        </section>`;
    });
  }

  function fichaJogador(j) {
    const ativa = temporadaAtiva(st.dados.temporadas);
    let resumo = '';
    if (ativa) {
      const torneios = st.dados.torneios.filter((t) => t.temporada_id === ativa.id && torneioValido(t)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      const meus = new Set(st.dados.resultados.filter((r) => r.jogador_id === j.id).map((r) => r.torneio_id));
      const presencas = torneios.map((t) => meus.has(t.id));
      const ultimos = presencas.slice(-4);
      const ranking = calcularRanking({ temporada: ativa, torneios: st.dados.torneios, resultados: st.dados.resultados });
      const linha = ranking.find((r) => r.jogador_id === j.id);
      resumo = html`
        <div class="profile-record">
          <div><span class="value">${presencas.filter(Boolean).length}/${torneios.length}</span><span class="label">presença na temporada</span></div>
          <div><span class="value">${ultimos.filter(Boolean).length}/${ultimos.length}</span><span class="label">nos últimos ${ultimos.length}</span></div>
          <div><span class="value">${linha ? `${linha.posicao}º` : '—'}</span><span class="label">posição atual</span></div>
        </div>
        <p class="presence" aria-label="Presença nos torneios da temporada">
          ${torneios.map((t, i) => html`<span class="dot ${presencas[i] ? 'on' : ''}" title="${formatarData(t.data)}: ${presencas[i] ? 'presente' : 'ausente'}"></span>`)}
        </p>`;
    }
    const notas = (st.dados.notas_jogador || []).filter((n) => n.jogador_id === j.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const apelidos = (st.dados.apelidos || []).filter((a) => a.jogador_id === j.id).map((a) => a.apelido);
    const numeros = numerosDoJogador(j.id);

    return html`
      <section class="panel">
        <h3>Ficha</h3>
        ${resumo}
        ${graficoPercentilJogador(j.id)}
        ${apelidos.length ? html`<p class="sub">Também aparece como: ${apelidos.join(', ')}</p>` : ''}
        <p class="sub">Member Number: ${numeros.length ? numeros.join(', ') : 'não informado'}</p>
        <h4>Anotações internas <span class="muted">(visíveis só para administradores)</span></h4>
        ${notas.length
          ? html`<ul class="notes">${notas.map((n) => html`<li><span class="sub">${formatarData(n.data)} · ${n.autor}</span><p>${n.texto}</p></li>`)}</ul>`
          : html`<p class="muted">Nenhuma anotação.</p>`}
        <form data-form="nota" class="note-form">
          <textarea name="texto" rows="2" required placeholder="Ex.: comentou que o horário de sábado é difícil."></textarea>
          <button type="submit" class="btn" ${st.ocupado ? 'disabled' : ''}>Adicionar anotação</button>
        </form>
      </section>`;
  }

  function graficoPercentilJogador(jogadorId) {
    const pontos = evolucaoPercentil(jogadorId, st.dados).map((p) => ({
      rotulo: formatarData(p.data).slice(0, 5),
      rotuloLongo: `${p.nome} (${formatarData(p.data)}): ${p.colocacao}º de ${p.participantes}`,
      valor: p.percentil,
    }));
    if (pontos.length < 2) return '';
    return graficoLinhaPercentual({ titulo: 'Evolução da colocação', subtitulo: 'Percentil por torneio: 100% = campeão, 0% = último', pontos: pontos.slice(-20), largura: 500 });
  }

  /** Member Numbers que hoje apontam para o jogador. */
  function numerosDoJogador(jogadorId) {
    return [...mapaMemberNumbers(st.dados.numeros_membro || [])].filter(([, id]) => id === jogadorId).map(([n]) => n);
  }

  function abaJogadores() {
    if (st.jogadorEditando) {
      const j = st.jogadorEditando;
      const novo = !st.dados.jogadores.some((x) => x.id === j.id);
      return html`
        <p><button class="plain link" data-acao="voltar-jogadores">← Todos os jogadores</button></p>
        <div class="two-cols">
          <form data-form="jogador" class="panel">
            <h2>${novo ? 'Novo jogador' : 'Editar perfil'}</h2>
            <div class="avatar-preview">${avatar(j, 'g')}</div>
            <label>Nome <input name="nome" value="${j.nome}" required maxlength="60"></label>
            <label>URL da foto (https) <input name="foto_url" type="url" value="${j.foto_url}" placeholder="https://..."></label>
            <label>Member Number <span class="muted">(10 dígitos, visível só para administradores)</span>
              <input name="member_number" inputmode="numeric" maxlength="10" value="${numerosDoJogador(j.id)[0] || ''}" placeholder="0000123456"></label>
            <label>Deck favorito <input name="deck_favorito" value="${j.deck_favorito}" maxlength="60"></label>
            <label>Bio <textarea name="bio" rows="3" maxlength="280">${j.bio}</textarea></label>
            <label class="inline"><input type="checkbox" name="ativo" ${j.ativo !== 'nao' ? 'checked' : ''}> Jogador ativo</label>
            <div class="actions"><button class="btn primary" type="submit" ${st.ocupado ? 'disabled' : ''}>Salvar</button></div>
          </form>
          ${novo ? '' : fichaJogador(j)}
        </div>`;
    }

    const filtro = normalizar(st.filtroJogadores);
    const lista = [...st.dados.jogadores]
      .filter((j) => !filtro || normalizar(j.nome).includes(filtro))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return html`
      <div class="toolbar">
        <input type="search" data-campo="filtro-jogadores" value="${st.filtroJogadores}" placeholder="Buscar jogador" aria-label="Buscar jogador">
        <button class="btn primary" data-acao="novo-jogador">Novo jogador</button>
      </div>
      <ul class="player-grid">${lista.map((j) => html`
        <li><button class="player-item" data-acao="editar-jogador" data-id="${j.id}">
          ${avatar(j, 'p')}<span>${j.nome}</span>${j.ativo === 'nao' ? html`<span class="status">inativo</span>` : ''}
          <span class="muted">${j.deck_favorito}</span>
        </button></li>`)}</ul>`;
  }

  function abaTemporadas() {
    const conf = st.conferencia?.tipo === 'importacao' ? st.conferencia : null;
    if (conf) {
      const temp = st.dados.temporadas.find((t) => t.id === conf.temporada_id);
      return html`
        <form data-form="confirmar-importacao" class="panel">
          <h2>Conferir classificação: ${temp?.nome}</h2>
          <p class="hint">A classificação gravada substitui qualquer classificação anterior desta liga.</p>
          ${tabelaConferencia(conf, { mostrarPontosCalculados: false })}
          <div class="actions">
            <button type="button" class="btn" data-acao="cancelar-importacao">Cancelar</button>
            <button class="btn primary" type="submit" ${st.ocupado ? 'disabled' : ''}>Gravar classificação</button>
          </div>
        </form>`;
    }

    const temporadas = [...st.dados.temporadas].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    const encerradas = temporadas.filter((t) => t.status === 'encerrada');
    return html`
      <section class="panel">
        <h2>Temporadas</h2>
        <div class="tbl-scroll"><table class="tbl compact">
          <thead><tr><th>Nome</th><th>Período</th><th>Situação</th><th class="num">Melhores resultados</th><th></th></tr></thead>
          <tbody>${temporadas.map((t) => html`
            <tr>
              <td>${t.nome}</td><td>${formatarData(t.inicio)} a ${formatarData(t.fim)}</td><td>${t.status}</td>
              <td class="num">${t.melhores_resultados}</td>
              <td>${t.status === 'ativa'
                ? html`<button class="btn small danger" data-acao="encerrar" data-id="${t.id}">Encerrar e congelar classificação</button>`
                : html`<button class="btn small" data-acao="reabrir" data-id="${t.id}">Reabrir</button>`}</td>
            </tr>`)}</tbody>
        </table></div>
      </section>

      <form data-form="temporada" class="panel">
        <h2>Nova temporada</h2>
        <div class="fields">
          <label>Nome <input name="nome" required placeholder="Liga 2027 — 1º semestre"></label>
          <label>Início <input type="date" name="inicio" required></label>
          <label>Fim <input type="date" name="fim" required></label>
          <label>Melhores resultados que contam <input type="number" name="melhores_resultados" min="1" value="${config.liga.melhoresResultados}" required></label>
        </div>
        <label class="inline"><input type="checkbox" name="encerrada"> Liga já encerrada (para cadastrar ligas antigas)</label>
        <div class="actions"><button class="btn primary" type="submit" ${st.ocupado ? 'disabled' : ''}>Criar temporada</button></div>
      </form>

      <form data-form="importar" class="panel">
        <h2>Cadastrar classificação de liga anterior</h2>
        <p class="hint">Para ligas que não têm os torneios no sistema. Um jogador por linha, na ordem final,
          no formato <code>Nome;pontos</code>.</p>
        ${encerradas.length
          ? html`
            <label>Liga <select name="temporada_id">${encerradas.map((t) => html`<option value="${t.id}">${t.nome}</option>`)}</select></label>
            <label>Classificação <textarea name="classificacao" rows="10" required placeholder="Rafael Torres;92&#10;Bianca Ferraz;85&#10;Lucas Andrade;80"></textarea></label>
            <div class="actions"><button class="btn primary" type="submit">Conferir nomes</button></div>`
          : html`<p class="muted">Crie antes uma temporada marcada como encerrada.</p>`}
      </form>`;
  }

  /* ---------------- administradores ---------------- */

  /** Token do Drive (no modo demo não há Drive). Deve ser chamado a partir de um clique: abre o consentimento. */
  async function tokenDrive() {
    return repo.modo === 'demo' ? null : auth.tokenDrive(config.google.oauthClientId);
  }

  async function carregarAcessos() {
    st.acessos = await repo.listarAcessos(await tokenDrive());
  }

  function abaAcessos() {
    const projeto = config.google?.projetoCloud;
    const linkTeste = projeto ? `https://console.cloud.google.com/auth/audience?project=${encodeURIComponent(projeto)}` : '';
    const lista = st.acessos;
    return html`
      <section class="panel">
        <h2>Liberar acesso de administrador</h2>
        <p class="hint">A pessoa passa a editar as planilhas pública e administrativa, ganha leitura na de pesquisas (vê os resultados,
          mas não o script nem a chave da IA) e recebe um convite do Google por e-mail.
          Só quem já é administrador consegue liberar ou remover acesso: quem confere isso é o próprio Google.
          Cada liberação fica registrada na auditoria.</p>
        <form data-form="liberar-acesso" class="toolbar">
          <input type="email" name="email" required autocomplete="off" placeholder="email@gmail.com" aria-label="E-mail da pessoa">
          <button class="btn primary" type="submit" ${st.ocupado ? 'disabled' : ''}>Liberar acesso</button>
        </form>
        ${repo.modo === 'sheets'
          ? html`<p class="hint">Na primeira vez, o Google pede uma permissão extra (gerenciar arquivos do Drive). Ela é usada só nesta tela,
              fica só na memória desta aba e expira em cerca de 1 hora.</p>`
          : ''}
        ${linkTeste
          ? html`<p class="hint">Enquanto o login do site estiver em modo <strong>Teste</strong> no Google Cloud, cadastre também o e-mail em
              <a href="${linkTeste}" target="_blank" rel="noopener">usuários de teste</a>; sem isso a pessoa não consegue entrar.</p>`
          : ''}
      </section>
      <section class="panel">
        <h2>Quem tem acesso</h2>
        ${lista
          ? html`<div class="tbl-scroll"><table class="tbl compact">
              <thead><tr><th>Pessoa</th><th>Planilha pública</th><th>Planilha administrativa</th><th>Pesquisas</th><th></th></tr></thead>
              <tbody>${lista.map((p) => html`
                <tr>
                  <td>${p.nome ? html`${p.nome}<br><span class="sub">${p.email}</span>` : p.email}</td>
                  <td>${p.publica || html`<span class="status bad">sem acesso</span>`}</td>
                  <td>${p.admin || html`<span class="status bad">sem acesso</span>`}</td>
                  <td>${p.pesquisa || html`<span class="muted">—</span>`}</td>
                  <td class="num">${podeRemover(p, st.usuario)
                    ? html`<button class="btn small danger" data-acao="remover-acesso" data-email="${p.email}">Remover</button>`
                    : html`<span class="muted">${p.proprietario ? 'proprietário' : 'você'}</span>`}</td>
                </tr>`)}</tbody>
            </table></div>`
          : html`<p class="hint">A lista vem do compartilhamento das planilhas no Google Drive.</p>
              <button class="btn" data-acao="carregar-acessos" ${st.ocupado ? 'disabled' : ''}>Carregar lista</button>`}
      </section>`;
  }

  /* ---------------- render ---------------- */

  function render() {
    const msg = st.mensagem
      ? st.mensagem.tipo === 'erro'
        ? erro(st.mensagem.texto)
        : html`<div class="notice ok" role="status">${st.mensagem.texto}</div>`
      : '';

    if (!st.usuario) {
      raiz.innerHTML = String(html`
        <section class="page narrow">
          ${msg}
          <div class="panel center">
            <h1>Administração</h1>
            <p>Acesso restrito aos administradores da liga. O acesso é concedido pelo compartilhamento das planilhas no Google.</p>
            <button class="btn primary" data-acao="entrar">${repo.modo === 'demo' ? 'Entrar (modo demonstração)' : 'Entrar com Google'}</button>
            ${repo.modo === 'demo' ? html`<p class="hint">No modo demonstração as alterações ficam só neste navegador.</p>` : ''}
          </div>
        </section>`);
      return;
    }

    if (st.semAcesso) {
      const g = config.google;
      raiz.innerHTML = String(html`
        <section class="page narrow">
          <div class="panel">
            <h1>Acesso pendente</h1>
            <p>A conta <strong>${st.usuario}</strong> ainda não tem acesso às planilhas da liga.</p>
            <ol>
              <li>Abra a <a href="https://docs.google.com/spreadsheets/d/${g.planilhaAdminId}/edit" target="_blank" rel="noopener">planilha administrativa</a> e clique em "Solicitar acesso".</li>
              <li>Faça o mesmo na <a href="https://docs.google.com/spreadsheets/d/${g.planilhaPublicaId}/edit" target="_blank" rel="noopener">planilha pública</a>, pedindo permissão de editor.</li>
              <li>Quando um administrador aprovar, entre novamente aqui.</li>
            </ol>
            <div class="actions"><button class="btn" data-acao="sair">Sair</button><button class="btn primary" data-acao="entrar">Tentar novamente</button></div>
          </div>
        </section>`);
      return;
    }

    // Logado, mas os dados das planilhas ainda estão chegando (ex.: troca de aba logo após o login).
    if (!st.dados) {
      raiz.innerHTML = String(html`<section class="page">${carregando()}</section>`);
      return;
    }

    const conteudo = {
      torneio: abaTorneio,
      painel: () => abaPainel(st.dados, st.painelTemporada),
      pesquisas: () => abaPesquisas(st.dados),
      torneios: abaTorneios,
      jogadores: abaJogadores,
      temporadas: abaTemporadas,
      acessos: abaAcessos,
    }[st.aba]();
    raiz.innerHTML = String(html`
      <section class="page">
        <header class="admin-head">
          <h1>Administração</h1>
          <span class="sub">${st.usuario}${repo.modo === 'demo' ? ' · modo demonstração' : ''}</span>
          ${repo.modo === 'demo' ? html`<button class="btn small" data-acao="restaurar-demo">Restaurar dados de exemplo</button>` : ''}
          <button class="btn small" data-acao="sair">Sair</button>
        </header>
        <nav class="tabs" aria-label="Seções da administração">
          ${ABAS.map(([id, rotulo]) => html`<a href="#/admin/${id}" class="${st.aba === id ? 'on' : ''}" ${st.aba === id ? html`aria-current="page"` : ''}>${rotulo}</a>`)}
        </nav>
        ${msg}
        ${st.ocupado ? html`<div class="notice" role="status">Salvando…</div>` : ''}
        ${conteudo}
      </section>`);
  }

  /* ---------------- eventos ---------------- */

  raiz.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    const { acao, id } = alvo.dataset;
    const temporada = () => st.dados.temporadas.find((t) => t.id === id);

    switch (acao) {
      case 'entrar': return entrar();
      case 'sair': return sair();
      case 'copiar-link-pesquisa': {
        const campo = raiz.querySelector('[data-campo="link-pesquisa"]');
        try {
          await navigator.clipboard.writeText(campo.value);
          st.mensagem = { tipo: 'ok', texto: 'Link copiado. Cole no grupo da liga.' };
        } catch {
          campo.select();
          st.mensagem = { tipo: 'erro', texto: 'Não foi possível copiar automaticamente: o link está selecionado, use Ctrl+C.' };
          return undefined;
        }
        return render();
      }
      case 'copiar-script-pesquisa':
        try {
          const resp = await fetch('scripts/apps-script/pesquisas.gs', { cache: 'no-store' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          await navigator.clipboard.writeText(await resp.text());
          st.mensagem = { tipo: 'ok', texto: 'Código copiado. Cole no editor do Apps Script e salve.' };
        } catch (e) {
          st.mensagem = { tipo: 'erro', texto: `Não foi possível copiar o código: ${e.message}` };
        }
        return render();
      case 'ver-ficha':
        st.jogadorEditando = { ...st.dados.jogadores.find((j) => j.id === id) };
        st.mensagem = null;
        location.hash = '#/admin/jogadores';
        return undefined;
      case 'carregar-acessos':
        return executar(carregarAcessos, 'Lista de acesso atualizada.');
      case 'remover-acesso': {
        const pessoa = st.acessos?.find((p) => p.email === alvo.dataset.email);
        if (!pessoa || !confirm(`Remover o acesso de ${pessoa.email} às duas planilhas da liga?`)) return undefined;
        return executar(async () => {
          await repo.removerAcesso(pessoa, await tokenDrive(), st.usuario);
          await carregarAcessos();
        }, `Acesso de ${pessoa.email} removido.`);
      }
      case 'restaurar-demo':
        if (!confirm('Descartar as alterações feitas neste navegador e voltar aos dados de exemplo?')) return;
        await repo.restaurar();
        await recarregar();
        st.mensagem = { tipo: 'ok', texto: 'Dados de exemplo restaurados.' };
        aoAlterarDados?.();
        return render();
      case 'voltar-torneio':
        st.conferencia = null;
        return render();
      case 'cancelar-importacao':
        st.conferencia = null;
        return render();
      case 'anular':
        if (!confirm('Anular este torneio? Ele deixa de contar pontos, mas continua registrado.')) return;
        return executar(() => repo.alterarStatusTorneio(id, 'anulado', st.usuario), 'Torneio anulado.');
      case 'reativar':
        return executar(() => repo.alterarStatusTorneio(id, 'confirmado', st.usuario), 'Torneio reativado.');
      case 'novo-jogador':
        st.jogadorEditando = { id: novoId('j'), nome: '', foto_url: '', deck_favorito: '', bio: '', ativo: 'sim' };
        st.mensagem = null;
        return render();
      case 'editar-jogador':
        st.jogadorEditando = { ...st.dados.jogadores.find((j) => j.id === id) };
        st.mensagem = null;
        return render();
      case 'voltar-jogadores':
        st.jogadorEditando = null;
        return render();
      case 'encerrar': {
        const t = temporada();
        if (!confirm(`Encerrar "${t.nome}"? A classificação atual será congelada no histórico.`)) return;
        const ranking = calcularRanking({ temporada: t, torneios: st.dados.torneios, resultados: st.dados.resultados });
        return executar(async () => {
          await repo.gravarClassificacaoHistorica(t.id, congelarClassificacao(t, ranking), [], st.usuario);
          await repo.salvarTemporada({ ...stripLinha(t), status: 'encerrada' }, st.usuario);
        }, 'Temporada encerrada e classificação congelada.');
      }
      case 'reabrir': {
        const t = temporada();
        if (!confirm(`Reabrir "${t.nome}"? A classificação congelada continua salva até um novo encerramento.`)) return;
        return executar(() => repo.salvarTemporada({ ...stripLinha(t), status: 'ativa' }, st.usuario), 'Temporada reaberta.');
      }
      default:
    }
  });

  raiz.addEventListener('change', (ev) => {
    if (ev.target.dataset.campo === 'painel-temporada') {
      st.painelTemporada = ev.target.value;
      render();
      return;
    }
    if (ev.target.dataset.campo === 'prints') lerPrintsEnviados([...ev.target.files]);
  });

  raiz.addEventListener('input', (ev) => {
    if (ev.target.dataset.campo === 'filtro-jogadores') {
      st.filtroJogadores = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const campo = raiz.querySelector('[data-campo="filtro-jogadores"]');
      campo.focus();
      campo.setSelectionRange(pos, pos);
    }
  });

  raiz.addEventListener('submit', (ev) => {
    const form = ev.target;
    const tipo = form.dataset.form;
    if (!tipo) return;
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    st.mensagem = null;

    try {
      switch (tipo) {
        case 'conferir-torneio': {
          st.rascunhoTorneio = f;
          const nome = f.nome.trim() || `Local de ${formatarData(f.data).slice(0, 5)}`;
          st.conferencia = montarConferencia(f.classificacao, { tipo: 'torneio', temporada_id: f.temporada_id, data: f.data, nome });
          if (st.conferencia.linhas.length < 2) throw new Error('Informe pelo menos dois jogadores.');
          const semNome = st.conferencia.linhas.filter((l) => l.texto === '(nome não lido)');
          if (semNome.length) {
            st.conferencia = null;
            throw new Error(`Complete o nome nas posições ${semNome.map((l) => `${l.colocacao}º`).join(', ')}.`);
          }
          return render();
        }
        case 'confirmar-torneio': {
          const conf = st.conferencia;
          const { ids, novosJogadores, novosApelidos, novosNumeros } = resolverConferencia(form);
          const torneio = { id: novoId('tor'), temporada_id: conf.temporada_id, data: conf.data, nome: conf.nome, status: 'confirmado' };
          const resultados = ids.map((jid, i) => ({ id: novoId('r'), torneio_id: torneio.id, jogador_id: jid, colocacao: String(conf.linhas[i].colocacao) }));
          return executar(async () => {
            await repo.registrarTorneio({ torneio, resultados, novosJogadores, novosApelidos, novosNumeros }, st.usuario);
            st.conferencia = null;
            st.rascunhoTorneio = null;
            st.leituraPrint = null;
          }, `Torneio "${torneio.nome}" registrado com ${resultados.length} jogadores.`);
        }
        case 'jogador': {
          const j = { ...st.jogadorEditando, nome: f.nome.trim(), foto_url: f.foto_url.trim(), deck_favorito: f.deck_favorito.trim(), bio: f.bio.trim(), ativo: f.ativo ? 'sim' : 'nao' };
          const duplicado = st.dados.jogadores.find((x) => x.id !== j.id && normalizar(x.nome) === normalizar(j.nome));
          if (duplicado) throw new Error(`Já existe um jogador chamado "${duplicado.nome}".`);
          const numero = normalizarMemberNumber(f.member_number);
          if (f.member_number.trim() && !numero) throw new Error('O Member Number deve ter exatamente 10 dígitos.');
          const donoAtual = numero ? mapaMemberNumbers(st.dados.numeros_membro || []).get(numero) : null;
          const outro = donoAtual && donoAtual !== j.id ? st.dados.jogadores.find((x) => x.id === donoAtual) : null;
          if (outro && !confirm(`O Member Number ${numero} está associado a "${outro.nome}". Passar para "${j.nome}"?`)) return undefined;
          return executar(async () => {
            await repo.salvarJogador(stripLinha(j), st.usuario);
            if (numero && donoAtual !== j.id) await repo.vincularMemberNumbers([{ member_number: numero, jogador_id: j.id }], st.usuario);
            st.jogadorEditando = null;
          }, `Perfil de ${j.nome} salvo.`);
        }
        case 'liberar-acesso': {
          const email = normalizarEmail(f.email);
          if (!email) throw new Error('Informe um e-mail válido.');
          const atual = st.acessos?.find((p) => p.email === email);
          if (atual?.completo) throw new Error(`${email} já tem acesso às duas planilhas.`);
          return executar(async () => {
            const token = await tokenDrive();
            await repo.liberarAcesso(email, token, st.usuario);
            st.acessos = await repo.listarAcessos(token);
          }, `Acesso liberado para ${email}. O Google enviou o convite por e-mail.`);
        }
        case 'nota': {
          const nota = { id: novoId('n'), jogador_id: st.jogadorEditando.id, data: new Date().toISOString().slice(0, 10), autor: st.usuario, texto: f.texto.trim() };
          return executar(() => repo.adicionarNota(nota, st.usuario), 'Anotação adicionada.');
        }
        case 'temporada': {
          if (f.fim < f.inicio) throw new Error('A data de fim é anterior à de início.');
          const temporada = { id: novoId('t'), nome: f.nome.trim(), inicio: f.inicio, fim: f.fim, status: f.encerrada ? 'encerrada' : 'ativa', melhores_resultados: f.melhores_resultados };
          const outraAtiva = temporadaAtiva(st.dados.temporadas);
          if (temporada.status === 'ativa' && outraAtiva && !confirm(`"${outraAtiva.nome}" ainda está ativa. O ranking público mostrará a temporada ativa mais recente. Continuar?`)) return undefined;
          return executar(() => repo.salvarTemporada(temporada, st.usuario), `Temporada "${temporada.nome}" criada.`);
        }
        case 'importar': {
          st.conferencia = montarConferencia(f.classificacao, { tipo: 'importacao', temporada_id: f.temporada_id });
          const semPontos = st.conferencia.linhas.filter((l) => l.pontos === null);
          if (semPontos.length) throw new Error(`Linhas sem pontuação (use Nome;pontos): ${semPontos.map((l) => l.texto).join(', ')}.`);
          return render();
        }
        case 'confirmar-importacao': {
          const conf = st.conferencia;
          const { ids, novosJogadores } = resolverConferencia(form);
          // Pontos iguais dividem a posição.
          const linhas = conf.linhas.map((l, i) => ({ temporada_id: conf.temporada_id, posicao: l.colocacao, jogador_id: ids[i], pontos: l.pontos, observacao: '' }));
          linhas.forEach((l, i) => {
            if (i > 0 && l.pontos === linhas[i - 1].pontos) l.posicao = linhas[i - 1].posicao;
          });
          return executar(async () => {
            await repo.gravarClassificacaoHistorica(conf.temporada_id, linhas, novosJogadores.map((j) => ({ ...j, ativo: 'nao' })), st.usuario);
            st.conferencia = null;
          }, 'Classificação gravada.');
        }
        default:
      }
    } catch (e) {
      st.mensagem = { tipo: 'erro', texto: e.message };
      render();
    }
    return undefined;
  });

  render();
  return {
    definirAba(novaAba) {
      if (ABAS.some(([id]) => id === novaAba)) st.aba = novaAba;
      st.conferencia = st.conferencia && st.aba === (st.conferencia.tipo === 'torneio' ? 'torneio' : 'temporadas') ? st.conferencia : null;
      st.mensagem = null;
      render();
    },
  };
}

function stripLinha(obj) {
  const { _linha, ...resto } = obj;
  return resto;
}

