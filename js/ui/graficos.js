// Gráficos em SVG gerados como texto (sem biblioteca: a Content Security Policy só permite scripts do site).
// Specs: colunas de até 24px com ponta arredondada de 4px e base reta, 2px de folga entre segmentos,
// linhas de 2px, grade de 1px sólida e discreta, legenda quando há 2+ séries, valores no hover
// (área de toque da altura toda) e sempre uma tabela com os mesmos dados.
import { html } from '../util/html.js';

// Largura do desenho em px: o SVG é exibido nesse tamanho (texto em tamanho real), com rolagem horizontal no celular.
const LARGURA_PADRAO = 1080;
const H = 220;
const M = { top: 16, right: 12, bottom: 34, left: 36 };
const LARG_MAX = 24;

/** Escala "bonita" para o eixo y: teto e passo redondos. */
function escala(max, passos = 4) {
  if (max <= 0) return { teto: 1, passo: 1 };
  const bruto = max / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) || bruto;
  return { teto: Math.ceil(max / passo) * passo, passo };
}

/** Caminho de uma coluna com só o topo arredondado (raio 4) e base reta. */
function coluna(x, y, w, h, arredondar = true) {
  if (h <= 0) return '';
  const r = arredondar ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function eixoY(teto, passo, y, W) {
  const linhas = [];
  for (let v = 0; v <= teto + 1e-9; v += passo) {
    const yy = y(v);
    linhas.push(html`<line class="grade" x1="${M.left}" x2="${W - M.right}" y1="${yy}" y2="${yy}"></line>
      <text class="eixo" x="${M.left - 6}" y="${yy + 4}" text-anchor="end">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`);
  }
  return linhas;
}

function legenda(series) {
  return html`<ul class="legenda">${series.map((s) => html`<li><span class="amostra" style="background:var(${s.cor})"></span>${s.nome}</li>`)}</ul>`;
}

function tabela(colunas, linhas, resumo) {
  return html`<details class="dados-grafico"><summary>Ver dados em tabela</summary>
    <div class="tbl-scroll"><table class="tbl compact"><caption class="sr-only">${resumo}</caption>
      <thead><tr>${colunas.map((c, i) => html`<th class="${i ? 'num' : ''}">${c}</th>`)}</tr></thead>
      <tbody>${linhas.map((l) => html`<tr>${l.map((v, i) => html`<td class="${i ? 'num' : ''}">${v}</td>`)}</tr>`)}</tbody>
    </table></div></details>`;
}

/**
 * Colunas (uma ou mais séries empilhadas).
 * itens: [{ rotulo, rotuloLongo?, valores: { chave: n } }]; series: [{ chave, nome, cor: '--var' }] na ordem da pilha.
 */
export function graficoColunas({ titulo, subtitulo, itens, series, rotuloEixoX = '', largura = LARGURA_PADRAO }) {
  const W = largura;
  if (!itens.length) return html`<figure class="grafico"><figcaption><strong>${titulo}</strong></figcaption><p class="hint">Sem dados ainda.</p></figure>`;
  const totais = itens.map((it) => series.reduce((s, se) => s + (it.valores[se.chave] || 0), 0));
  const { teto, passo } = escala(Math.max(...totais));
  const larguraPlot = W - M.left - M.right;
  const banda = larguraPlot / itens.length;
  const larg = Math.min(LARG_MAX, banda * 0.6);
  const y = (v) => M.top + (H - M.top - M.bottom) * (1 - v / teto);
  const cada = Math.max(1, Math.ceil(itens.length / 12)); // rótulos do eixo x sem encavalar

  const marcas = itens.map((it, i) => {
    const x = M.left + banda * i + (banda - larg) / 2;
    let base = 0;
    const segs = series.map((se, k) => {
      const v = it.valores[se.chave] || 0;
      const y0 = y(base + v);
      const h = y(base) - y0 - (k > 0 && v ? 2 : 0); // 2px de folga entre segmentos
      base += v;
      const topo = series.slice(k + 1).every((s2) => !(it.valores[s2.chave] || 0));
      return v ? html`<path d="${coluna(x, y0, larg, Math.max(0, h), topo)}" style="fill:var(${se.cor})"></path>` : '';
    });
    const dica = [it.rotuloLongo || it.rotulo, ...series.map((se) => `${se.nome}: ${it.valores[se.chave] || 0}`), series.length > 1 ? `Total: ${totais[i]}` : '']
      .filter(Boolean)
      .join('\n');
    return html`<g class="marca">${segs}
      <rect class="alvo" x="${M.left + banda * i}" y="${M.top}" width="${banda}" height="${H - M.top - M.bottom}"><title>${dica}</title></rect>
      ${i % cada === 0 ? html`<text class="eixo" x="${x + larg / 2}" y="${H - M.bottom + 16}" text-anchor="middle">${it.rotulo}</text>` : ''}</g>`;
  });

  return html`<figure class="grafico">
    <figcaption><strong>${titulo}</strong>${subtitulo ? html`<span class="sub">${subtitulo}</span>` : ''}</figcaption>
    ${series.length > 1 ? legenda(series) : ''}
    <div class="svg-rolagem"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${titulo}">
      ${eixoY(teto, passo, y, W)}
      <line class="base" x1="${M.left}" x2="${W - M.right}" y1="${y(0)}" y2="${y(0)}"></line>
      ${marcas}
      ${rotuloEixoX ? html`<text class="eixo" x="${M.left + larguraPlot / 2}" y="${H - 2}" text-anchor="middle">${rotuloEixoX}</text>` : ''}
    </svg></div>
    ${tabela(
      [rotuloEixoX || 'Item', ...series.map((s) => s.nome), ...(series.length > 1 ? ['Total'] : [])],
      itens.map((it, i) => [it.rotuloLongo || it.rotulo, ...series.map((s) => it.valores[s.chave] || 0), ...(series.length > 1 ? [totais[i]] : [])]),
      titulo,
    )}
  </figure>`;
}

/** Linha única com valores de 0 a 1 (percentual). pontos: [{ rotulo, rotuloLongo?, valor }]. */
export function graficoLinhaPercentual({ titulo, subtitulo, pontos, largura = LARGURA_PADRAO }) {
  const W = largura;
  if (pontos.length < 2) return html`<figure class="grafico"><figcaption><strong>${titulo}</strong></figcaption><p class="hint">São precisos pelo menos dois torneios.</p></figure>`;
  const larguraPlot = W - M.left - M.right;
  const x = (i) => M.left + (larguraPlot * i) / (pontos.length - 1);
  const y = (v) => M.top + (H - M.top - M.bottom) * (1 - v);
  const d = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join('');
  const area = `${d}L${x(pontos.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ultimo = pontos.at(-1);
  const cada = Math.max(1, Math.ceil(pontos.length / 10));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const grade = [0, 0.25, 0.5, 0.75, 1].map((v) => html`<line class="grade" x1="${M.left}" x2="${W - M.right}" y1="${y(v)}" y2="${y(v)}"></line>
    <text class="eixo" x="${M.left - 6}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`);
  const banda = larguraPlot / (pontos.length - 1);
  return html`<figure class="grafico">
    <figcaption><strong>${titulo}</strong>${subtitulo ? html`<span class="sub">${subtitulo}</span>` : ''}</figcaption>
    <div class="svg-rolagem"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${titulo}">
      ${grade}
      <path class="area" d="${area}"></path>
      <path class="linha" d="${d}"></path>
      ${pontos.map((p, i) => html`<g class="marca">
        <rect class="alvo" x="${x(i) - banda / 2}" y="${M.top}" width="${banda}" height="${H - M.top - M.bottom}"><title>${p.rotuloLongo || p.rotulo}: ${pct(p.valor)}</title></rect>
        ${i % cada === 0 ? html`<text class="eixo" x="${x(i)}" y="${H - M.bottom + 16}" text-anchor="middle">${p.rotulo}</text>` : ''}</g>`)}
      <circle class="ponto" cx="${x(pontos.length - 1)}" cy="${y(ultimo.valor)}" r="4"></circle>
      <text class="valor" x="${x(pontos.length - 1) - 8}" y="${y(ultimo.valor) - 10}" text-anchor="end">${pct(ultimo.valor)}</text>
    </svg></div>
    ${tabela(['Torneio', 'Percentil'], pontos.map((p) => [p.rotuloLongo || p.rotulo, pct(p.valor)]), titulo)}
  </figure>`;
}

/**
 * Mapa de calor da retenção por coorte (tabela HTML, rampa sequencial de um tom).
 * linhas: [{ coorte, tamanho, retencao: [0..1 | null] }]
 */
export function mapaCoortes({ titulo, subtitulo, linhas }) {
  if (!linhas.length) return html`<figure class="grafico"><figcaption><strong>${titulo}</strong></figcaption><p class="hint">Sem dados ainda.</p></figure>`;
  const meses = linhas[0].retencao.length;
  const passo = (v) => Math.min(6, Math.floor(v * 6.999)); // 7 tons: 0..6
  return html`<figure class="grafico">
    <figcaption><strong>${titulo}</strong>${subtitulo ? html`<span class="sub">${subtitulo}</span>` : ''}</figcaption>
    <div class="tbl-scroll"><table class="tbl compact coortes">
      <thead><tr><th>Estreia</th><th class="num">Jogadores</th>${Array.from({ length: meses }, (_, k) => html`<th class="num">${k === 0 ? 'Mês 0' : `+${k}`}</th>`)}</tr></thead>
      <tbody>${linhas.map((l) => html`<tr><td>${l.coorte}</td><td class="num">${l.tamanho}</td>
        ${l.retencao.map((v, k) => (v === null
          ? html`<td class="num muted">—</td>`
          : html`<td class="num calor calor-${passo(v)}" title="Estreia ${l.coorte}, mês +${k}: ${Math.round(v * 100)}% voltaram">${Math.round(v * 100)}%</td>`))}</tr>`)}</tbody>
    </table></div>
    <p class="hint">Cada linha agrupa quem estreou naquele mês; as colunas mostram a fração que jogou de novo nos meses seguintes.</p>
  </figure>`;
}
