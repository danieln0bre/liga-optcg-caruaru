// Páginas públicas: ranking atual, histórico de ligas e perfil do jogador.
import { html, formatarData } from '../util/html.js';
import { avatar, linkJogador, podio, vazio } from '../ui/componentes.js';
import {
  calcularRanking,
  classificacaoFinal,
  separarPodio,
  temporadaAtiva,
  temporadasEncerradas,
  resultadosDaTemporada,
  historicoDoJogador,
  torneioValido,
  DESEMPATE_PADRAO,
} from '../domain/liga.js';

const porId = (lista) => new Map(lista.map((x) => [x.id, x]));

function chipsResultados(linha) {
  const chips = [
    ...linha.contam.map((r) => html`<span class="chip" title="${r.torneio_nome} — ${r.colocacao}º de ${r.participantes}">${r.pontos}</span>`),
    ...linha.descartados.map((r) => html`<span class="chip off" title="Descartado: ${r.torneio_nome} — ${r.colocacao}º de ${r.participantes}">${r.pontos}</span>`),
  ];
  return html`<span class="chips">${chips}</span>`;
}

export function paginaRanking(dados, config) {
  const temporada = temporadaAtiva(dados.temporadas);
  if (!temporada) {
    return html`<section class="page">${vazio('Nenhuma temporada em andamento no momento.')}
      <p class="center"><a href="#/historico">Ver ligas anteriores</a></p></section>`;
  }
  const jogadores = porId(dados.jogadores);
  const melhores = Number(temporada.melhores_resultados) || config.liga.melhoresResultados;
  const ranking = calcularRanking({ temporada, torneios: dados.torneios, resultados: dados.resultados, melhores });
  const torneios = dados.torneios.filter((t) => t.temporada_id === temporada.id && torneioValido(t));
  const ultimo = torneios.map((t) => t.data).sort().at(-1);
  const { podio: topo } = separarPodio(ranking);

  const linhas = ranking.map(
    (r) => html`
      <tr class="${r.posicao <= 3 ? `top top-${r.posicao}` : ''}">
        <td class="num pos">${r.posicao}º</td>
        <td>${linkJogador(jogadores.get(r.jogador_id), r.jogador_id)}</td>
        <td class="num strong">${r.pontos}</td>
        <td class="num">${r.participacoes}</td>
        <td class="num hide-mobile">${r.vitorias}</td>
        <td class="hide-mobile">${chipsResultados(r)}</td>
      </tr>`,
  );

  return html`
    <section class="page">
      <header class="page-head">
        <p class="eyebrow">Temporada em andamento</p>
        <h1>${temporada.nome}</h1>
        <p class="sub">
          ${formatarData(temporada.inicio)} a ${formatarData(temporada.fim)} ·
          ${torneios.length} ${torneios.length === 1 ? 'torneio' : 'torneios'} ·
          ${ranking.length} jogadores${ultimo ? html` · último torneio em ${formatarData(ultimo)}` : ''}
        </p>
      </header>

      ${ranking.length ? podio(topo, jogadores) : vazio('Ainda não há resultados nesta temporada.')}

      ${ranking.length
        ? html`
          <div class="tbl-scroll panel ranking">
            <table class="tbl">
              <thead>
                <tr>
                  <th class="num">Pos.</th><th>Jogador</th><th class="num">Pontos</th>
                  <th class="num">Torneios</th><th class="num hide-mobile">Vitórias</th>
                  <th class="hide-mobile">Resultados</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>
          <details class="rules">
            <summary>Como a pontuação funciona</summary>
            <p>Em cada torneio, o jogador recebe pontos iguais à sua colocação invertida: num torneio de 17 pessoas,
              o 1º lugar recebe 17 pontos e o 17º recebe 1.</p>
            <p>Para a classificação, contam os <strong>${melhores} melhores resultados</strong> de cada jogador na temporada.
              Os resultados descartados aparecem esmaecidos na coluna de resultados.</p>
            <p>Desempate, nesta ordem: ${DESEMPATE_PADRAO.map((d) => d.rotulo).join('; ')}.</p>
          </details>`
        : ''}
    </section>`;
}

export function paginaHistorico(dados) {
  const encerradas = temporadasEncerradas(dados.temporadas);
  const jogadores = porId(dados.jogadores);
  if (!encerradas.length) return html`<section class="page">${vazio('Ainda não há ligas encerradas.')}</section>`;

  const cartoes = encerradas.map((temporada) => {
    const final = classificacaoFinal({ temporada, torneios: dados.torneios, resultados: dados.resultados, historico: dados.classificacao_historica });
    const { podio: topo } = separarPodio(final);
    const itens = topo.map((c) => html`
      <li class="mini-podium-${c.posicao}">
        <span class="medal">${c.posicao}º</span>
        ${avatar(jogadores.get(c.jogador_id), 'p')}
        <span>${jogadores.get(c.jogador_id)?.nome || c.jogador_id}</span>
      </li>`);
    return html`
      <a class="league-card" href="#/historico/${encodeURIComponent(temporada.id)}">
        <h2>${temporada.nome}</h2>
        <p class="sub">${formatarData(temporada.inicio)} a ${formatarData(temporada.fim)} · ${final.length} jogadores</p>
        <ol class="mini-podium">${itens}</ol>
        <span class="more">Ver classificação completa →</span>
      </a>`;
  });

  return html`
    <section class="page">
      <header class="page-head">
        <p class="eyebrow">Histórico</p>
        <h1>Ligas anteriores</h1>
      </header>
      <div class="league-grid">${cartoes}</div>
    </section>`;
}

export function paginaLiga(dados, temporadaId) {
  const temporada = dados.temporadas.find((t) => t.id === temporadaId);
  if (!temporada) return html`<section class="page">${vazio('Liga não encontrada.')}</section>`;
  const jogadores = porId(dados.jogadores);
  const final = classificacaoFinal({ temporada, torneios: dados.torneios, resultados: dados.resultados, historico: dados.classificacao_historica });
  const { podio: topo, demais } = separarPodio(final);

  const linhas = demais.map((c) => html`
    <tr>
      <td class="num pos">${c.posicao}º</td>
      <td>${linkJogador(jogadores.get(c.jogador_id), c.jogador_id)}</td>
      <td class="num strong">${c.pontos}</td>
    </tr>`);

  return html`
    <section class="page">
      <p><a href="#/historico">← Ligas anteriores</a></p>
      <header class="page-head">
        <p class="eyebrow">${temporada.status === 'ativa' ? 'Em andamento' : 'Liga encerrada'}</p>
        <h1>${temporada.nome}</h1>
        <p class="sub">${formatarData(temporada.inicio)} a ${formatarData(temporada.fim)} · ${final.length} jogadores</p>
      </header>
      ${final.length ? podio(topo, jogadores) : vazio('Classificação ainda não cadastrada.')}
      ${demais.length
        ? html`<div class="tbl-scroll panel ranking"><table class="tbl">
            <thead><tr><th class="num">Pos.</th><th>Jogador</th><th class="num">Pontos</th></tr></thead>
            <tbody>${linhas}</tbody></table></div>`
        : ''}
    </section>`;
}

export function paginaJogador(dados, jogadorId) {
  const jogador = dados.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) return html`<section class="page">${vazio('Jogador não encontrado.')}</section>`;

  const temporada = temporadaAtiva(dados.temporadas);
  let blocoTemporada = '';
  if (temporada) {
    const ranking = calcularRanking({ temporada, torneios: dados.torneios, resultados: dados.resultados });
    const linha = ranking.find((r) => r.jogador_id === jogadorId);
    const totalTorneios = dados.torneios.filter((t) => t.temporada_id === temporada.id && torneioValido(t)).length;
    const meus = resultadosDaTemporada(temporada.id, dados.torneios, dados.resultados)
      .filter((r) => r.jogador_id === jogadorId)
      .reverse();
    const contam = new Set((linha?.contam || []).map((r) => r.torneio_id));

    blocoTemporada = html`
      <section class="panel">
        <h2>${temporada.nome}</h2>
        ${linha
          ? html`
            <div class="profile-record">
              <div><span class="value">${linha.posicao}º</span><span class="label">posição</span></div>
              <div><span class="value">${linha.pontos}</span><span class="label">pontos</span></div>
              <div><span class="value">${linha.participacoes}/${totalTorneios}</span><span class="label">torneios jogados</span></div>
              <div><span class="value">${linha.vitorias}</span><span class="label">vitórias</span></div>
            </div>
            <div class="tbl-scroll"><table class="tbl compact">
              <thead><tr><th>Data</th><th>Torneio</th><th class="num">Colocação</th><th class="num">Pontos</th><th></th></tr></thead>
              <tbody>${meus.map((r) => html`
                <tr class="${contam.has(r.torneio_id) ? '' : 'off'}">
                  <td>${formatarData(r.data)}</td><td>${r.torneio_nome}</td>
                  <td class="num">${r.colocacao}º de ${r.participantes}</td><td class="num strong">${r.pontos}</td>
                  <td class="muted">${contam.has(r.torneio_id) ? '' : 'descartado'}</td>
                </tr>`)}</tbody>
            </table></div>`
          : html`<p class="muted">Ainda não jogou nesta temporada.</p>`}
      </section>`;
  }

  const historico = historicoDoJogador(jogadorId, {
    temporadas: dados.temporadas,
    torneios: dados.torneios,
    resultados: dados.resultados,
    historico: dados.classificacao_historica,
  });

  return html`
    <section class="page">
      <header class="profile-head">
        ${avatar(jogador, 'g')}
        <div>
          <h1>${jogador.nome}</h1>
          ${jogador.deck_favorito ? html`<p class="sub">Deck favorito: <strong>${jogador.deck_favorito}</strong></p>` : ''}
          ${jogador.bio ? html`<p class="bio">${jogador.bio}</p>` : ''}
        </div>
      </header>
      ${blocoTemporada}
      <section class="panel">
        <h2>Ligas anteriores</h2>
        ${historico.length
          ? html`<ul class="past-list">${historico.map((h) => html`
              <li class="${h.posicao <= 3 ? `top-${h.posicao}` : ''}">
                <a href="#/historico/${encodeURIComponent(h.temporada.id)}">${h.temporada.nome}</a>
                <span>${h.posicao}º de ${h.total} · ${h.pontos} pts</span>
              </li>`)}</ul>`
          : html`<p class="muted">Sem participação em ligas encerradas.</p>`}
      </section>
    </section>`;
}
