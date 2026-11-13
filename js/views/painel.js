// Aba "Painel" da administração: indicadores e gráficos sobre a comunidade.
import { html, formatarData } from '../util/html.js';
import { avatar, vazio } from '../ui/componentes.js';
import { graficoColunas, mapaCoortes } from '../ui/graficos.js';
import { CRITERIOS, ROTULO_SEGMENTO, coortes, distribuicaoFrequencia, indicadores, riscoEvasao, segmentos, serieParticipacao } from '../domain/gestao.js';

const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const ddmm = (iso) => formatarData(iso).slice(0, 5);

/** dados: abas carregadas; temporadaId: temporada escolhida no filtro. */
export function abaPainel(dados, temporadaId) {
  const temporadas = [...dados.temporadas].sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  if (!dados.torneios.length) return vazio('O painel aparece depois do primeiro torneio lançado.');
  const temporada = temporadas.find((t) => t.id === temporadaId) || temporadas[0];
  const ind = indicadores(dados, temporada?.id);
  const serie = serieParticipacao(dados, temporada?.id);
  const freq = distribuicaoFrequencia(dados, temporada?.id);
  const risco = riscoEvasao(dados);
  const seg = segmentos(dados);
  const contagemSeg = {};
  for (const s of seg.values()) contagemSeg[s] = (contagemSeg[s] || 0) + 1;
  const porId = new Map(dados.jogadores.map((j) => [j.id, j]));

  return html`
    <div class="toolbar filtros">
      <label class="inline">Temporada
        <select data-campo="painel-temporada">${temporadas.map((t) => html`<option value="${t.id}" ${t.id === temporada?.id ? 'selected' : ''}>${t.nome}</option>`)}</select>
      </label>
    </div>

    <div class="profile-record indicadores">
      <div><span class="value">${ind.ativos}</span><span class="label">jogadores ativos (últimos ${ind.janelaAtivos} torneios)</span></div>
      <div><span class="value">${ind.mediaParticipantes.toFixed(1).replace('.', ',')}</span><span class="label">média de participantes (${ind.torneiosTemporada} torneios)</span></div>
      <div><span class="value">${ind.novatos}</span><span class="label">novatos na temporada</span></div>
      <div><span class="value">${pct(ind.retencaoNovatos)}</span><span class="label">dos novatos voltaram</span></div>
      <div><span class="value">${ind.emRisco}</span><span class="label">em risco de evasão</span></div>
    </div>

    <section class="panel">
      ${graficoColunas({
        titulo: 'Participação por torneio',
        subtitulo: `${temporada?.nome || ''} · quem já jogava e quem estreou`,
        rotuloEixoX: 'Torneio',
        series: [
          { chave: 'recorrentes', nome: 'Já jogavam', cor: '--serie-1' },
          { chave: 'novatos', nome: 'Estreantes', cor: '--serie-2' },
        ],
        itens: serie.map((x) => ({ rotulo: ddmm(x.data), rotuloLongo: `${x.nome} (${formatarData(x.data)})`, valores: { recorrentes: x.recorrentes, novatos: x.novatos } })),
      })}
    </section>

    <div class="two-cols">
      <section class="panel">
        ${graficoColunas({
          titulo: 'Frequência na temporada',
          subtitulo: 'Quantos jogadores jogaram 1, 2, 3… torneios',
          rotuloEixoX: 'Torneios jogados',
          largura: 500,
          series: [{ chave: 'jogadores', nome: 'Jogadores', cor: '--serie-1' }],
          itens: freq.map((f) => ({ rotulo: String(f.torneios), rotuloLongo: `${f.torneios} ${f.torneios === 1 ? 'torneio' : 'torneios'}`, valores: { jogadores: f.jogadores } })),
        })}
      </section>
      <section class="panel">
        <figure class="grafico">
          <figcaption><strong>Segmentos da comunidade</strong><span class="sub">Todos os jogadores com resultado</span></figcaption>
          <div class="tbl-scroll"><table class="tbl compact">
            <thead><tr><th>Segmento</th><th class="num">Jogadores</th><th>Critério</th></tr></thead>
            <tbody>
              <tr><td>${ROTULO_SEGMENTO.frequente}</td><td class="num">${contagemSeg.frequente || 0}</td><td class="sub">presença ≥ ${pct(CRITERIOS.taxaFrequente)} nos últimos ${CRITERIOS.janelaFrequente} torneios</td></tr>
              <tr><td>${ROTULO_SEGMENTO.ocasional}</td><td class="num">${contagemSeg.ocasional || 0}</td><td class="sub">jogam, mas com menos regularidade</td></tr>
              <tr><td>${ROTULO_SEGMENTO.novato}</td><td class="num">${contagemSeg.novato || 0}</td><td class="sub">até ${CRITERIOS.maxPresencasNovato} torneios na vida</td></tr>
              <tr><td>${ROTULO_SEGMENTO.em_risco}</td><td class="num">${contagemSeg.em_risco || 0}</td><td class="sub">eram regulares e sumiram dos últimos ${CRITERIOS.janelaRisco}</td></tr>
            </tbody>
          </table></div>
        </figure>
      </section>
    </div>

    <section class="panel">
      ${mapaCoortes({ titulo: 'Retenção por mês de estreia', subtitulo: 'Todas as temporadas', linhas: coortes(dados) })}
    </section>

    <section class="panel">
      <h2>Risco de evasão</h2>
      <p class="hint">Jogadores com pelo menos ${CRITERIOS.minPresencasRisco} presenças e frequência de ${pct(CRITERIOS.taxaMinRisco)} ou mais que não
        aparecem nos últimos ${CRITERIOS.janelaRisco} torneios (alto) ou apareceram só uma vez neles (médio). Bom ponto de partida para um contato.</p>
      ${risco.length
        ? html`<div class="tbl-scroll"><table class="tbl compact">
            <thead><tr><th>Jogador</th><th>Risco</th><th class="num">Presenças</th><th class="num">Frequência</th><th>Última vez</th><th class="num">Torneios sem jogar</th><th></th></tr></thead>
            <tbody>${risco.map((r) => {
              const j = porId.get(r.jogador_id);
              return html`<tr>
                <td><span class="player-link">${avatar(j, 'p')}<span>${j?.nome || r.jogador_id}</span></span></td>
                <td><span class="status ${r.nivel === 'alto' ? 'bad' : 'warn'}">${r.nivel === 'alto' ? 'alto' : 'médio'}</span></td>
                <td class="num">${r.presencas}</td><td class="num">${pct(r.taxaHistorica)}</td>
                <td>${formatarData(r.ultimaPresenca)}</td><td class="num">${r.torneiosSemJogar}</td>
                <td class="num">${j ? html`<button class="btn small" data-acao="ver-ficha" data-id="${j.id}">Ficha</button>` : ''}</td>
              </tr>`;
            })}</tbody></table></div>`
        : html`<p class="muted">Ninguém em risco pelos critérios atuais.</p>`}
    </section>`;
}
