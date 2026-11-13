// Aba "Pesquisas" da administração: link do formulário, respostas analisadas pelo Apps Script
// (scripts/apps-script/pesquisas.gs) e sugestões de ação cruzadas com os segmentos de jogadores.
import { html, formatarData, urlSegura } from '../util/html.js';
import { graficoColunas } from '../ui/graficos.js';
import { ROTULO_SEGMENTO, segmentos } from '../domain/gestao.js';

export const ROTULO_TEMA = {
  horario: 'Horário',
  local_estrutura: 'Local e estrutura',
  formato_torneio: 'Formato do torneio',
  premiacao: 'Premiação',
  ambiente_comunidade: 'Ambiente',
  novatos_aprendizado: 'Acolhimento de novatos',
  custo: 'Custo',
  comunicacao: 'Comunicação',
  regras_arbitragem: 'Regras e arbitragem',
  metagame_decks: 'Metagame e decks',
  outro: 'Outros',
};
const ROTULO_CURTO = { ...ROTULO_TEMA, local_estrutura: 'Local', formato_torneio: 'Formato', novatos_aprendizado: 'Novatos', regras_arbitragem: 'Regras', metagame_decks: 'Metagame' };
const ORDEM_SEGMENTOS = ['novato', 'em_risco', 'ocasional', 'frequente', 'desconhecido'];
const COR_ESFORCO = { baixo: 'ok', medio: 'warn', alto: 'bad' };
const COR_IMPACTO = { alto: 'ok', medio: 'warn', baixo: '' };

const temasDe = (linha) => String(linha.temas || '').split(',').map((t) => t.trim()).filter(Boolean);

/** NPS: % de notas 9–10 menos % de notas 0–6. */
export function calcularNps(notas) {
  const validas = notas.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
  if (!validas.length) return null;
  return Math.round(((validas.filter((n) => n >= 9).length - validas.filter((n) => n <= 6).length) / validas.length) * 100);
}

function instrucoes() {
  return html`<section class="panel">
    <h2>Pesquisa com os jogadores</h2>
    <p>A pesquisa ainda não foi instalada. Ela usa um Google Form e um Apps Script na planilha de pesquisas,
      que analisa cada resposta com IA e gera sugestões de ação. A chave da IA fica no Apps Script, nunca no site.
      Só o dono edita essa planilha; os outros administradores são leitores e não veem o script.</p>
    <ol class="passos">
      <li>Abra a planilha <strong>Liga OPTCG — pesquisas</strong> → <em>Extensões → Apps Script</em>, apague o conteúdo do editor e cole o código do script
        (<code>scripts/apps-script/pesquisas.gs</code>). <button class="btn small" data-acao="copiar-script-pesquisa">Copiar código do script</button></li>
      <li>Em <em>Configurações do projeto → Propriedades do script</em>, adicione <code>ANTHROPIC_API_KEY</code> (sua chave da API da Anthropic)
        , <code>PLANILHA_PUBLICA_ID</code> e <code>PLANILHA_ADMIN_ID</code> (IDs das outras duas planilhas).</li>
      <li>Execute a função <code>configurarPesquisa</code> e autorize. O formulário, as abas e os gatilhos são criados.</li>
      <li>Volte aqui e recarregue: o link para compartilhar aparece nesta tela.</li>
    </ol>
  </section>`;
}

export function abaPesquisas(dados) {
  const config = Object.fromEntries((dados.pesquisa_config || []).map((c) => [c.chave, c.valor]));
  const linkForm = urlSegura(config.url_formulario);
  if (!linkForm) return instrucoes();

  const analises = (dados.pesquisa_analise || []).filter((l) => l.status === 'ok');
  const comErro = (dados.pesquisa_analise || []).filter((l) => l.status && l.status !== 'ok');
  // Segmento atual (o painel recalcula); para quem não foi identificado, vale o gravado na análise.
  const segAtual = segmentos(dados);
  const segmentoDe = (l) => (l.jogador_id && segAtual.get(l.jogador_id)) || l.segmento || 'desconhecido';
  const nps = calcularNps(analises.map((l) => l.nota));
  const negativas = analises.filter((l) => l.sentimento === 'negativo').length;

  const contagem = new Map();
  const cruzado = new Map(); // tema → { segmento: n }
  for (const l of analises) {
    for (const t of temasDe(l)) {
      contagem.set(t, (contagem.get(t) || 0) + 1);
      const porSeg = cruzado.get(t) || {};
      porSeg[segmentoDe(l)] = (porSeg[segmentoDe(l)] || 0) + 1;
      cruzado.set(t, porSeg);
    }
  }
  const temas = [...contagem].sort((a, b) => b[1] - a[1]);
  const relatorio = dados.pesquisa_relatorio || [];

  return html`
    <section class="panel compartilhar">
      <h2>Pesquisa com os jogadores</h2>
      <p class="hint">Compartilhe o link no grupo da liga. Cada resposta é analisada automaticamente (temas, sentimento e resumo);
        o relatório com sugestões é atualizado uma vez por dia.</p>
      <div class="toolbar">
        <input type="text" readonly value="${linkForm}" aria-label="Link do formulário" data-campo="link-pesquisa">
        <button class="btn primary" data-acao="copiar-link-pesquisa">Copiar link</button>
        <a class="btn" href="${linkForm}" target="_blank" rel="noopener">Abrir</a>
        ${urlSegura(config.url_edicao) ? html`<a class="btn" href="${urlSegura(config.url_edicao)}" target="_blank" rel="noopener">Editar perguntas</a>` : ''}
      </div>
    </section>

    <div class="profile-record indicadores">
      <div><span class="value">${analises.length}</span><span class="label">respostas analisadas</span></div>
      <div><span class="value">${nps === null ? '—' : nps}</span><span class="label">NPS (−100 a 100)</span></div>
      <div><span class="value">${analises.length ? `${Math.round((negativas / analises.length) * 100)}%` : '—'}</span><span class="label">respostas negativas</span></div>
      <div><span class="value">${config.relatorio_em ? formatarData(config.relatorio_em) : '—'}</span><span class="label">último relatório</span></div>
    </div>
    ${comErro.length ? html`<div class="notice bad">${comErro.length} resposta(s) não puderam ser analisadas. O Apps Script tenta de novo a cada 6 horas;
      o motivo fica na coluna <code>status</code> da aba <code>pesquisa_analise</code>.</div>` : ''}

    ${relatorio.length
      ? html`<section class="panel">
          <h2>Sugestões de ação</h2>
          <p class="hint">Geradas por IA a partir das respostas, priorizando novatos e jogadores em risco. São um ponto de partida para a organização decidir, não decisões prontas.</p>
          <div class="sugestoes">${relatorio.map((r) => html`
            <article class="sugestao">
              <header><strong>${ROTULO_TEMA[r.tema] || r.tema}</strong><span class="sub">${r.respostas} ${r.respostas === '1' ? 'resposta' : 'respostas'} · ${r.segmentos}</span></header>
              <p class="dor">${r.dor}</p>
              <p>${r.sugestao}</p>
              <p class="chips"><span class="status ${COR_IMPACTO[r.impacto] || ''}">impacto ${r.impacto}</span>
                <span class="status ${COR_ESFORCO[r.esforco] || ''}">esforço ${r.esforco}</span></p>
            </article>`)}</div>
        </section>`
      : ''}

    <section class="panel">
      ${graficoColunas({
        titulo: 'Temas mais citados',
        subtitulo: 'Cada resposta pode citar até 3 temas',
        rotuloEixoX: 'Tema',
        series: [{ chave: 'n', nome: 'Respostas', cor: '--serie-1' }],
        itens: temas.map(([t, n]) => ({ rotulo: ROTULO_CURTO[t] || t, rotuloLongo: ROTULO_TEMA[t] || t, valores: { n } })),
      })}
      ${temas.length
        ? html`<h3>Temas por segmento</h3>
          <div class="tbl-scroll"><table class="tbl compact">
            <thead><tr><th>Tema</th>${ORDEM_SEGMENTOS.map((s) => html`<th class="num">${ROTULO_SEGMENTO[s]}</th>`)}<th class="num">Total</th></tr></thead>
            <tbody>${temas.map(([t, n]) => html`<tr><td>${ROTULO_TEMA[t] || t}</td>
              ${ORDEM_SEGMENTOS.map((s) => html`<td class="num ${cruzado.get(t)?.[s] ? '' : 'muted'}">${cruzado.get(t)?.[s] || 0}</td>`)}
              <td class="num strong">${n}</td></tr>`)}</tbody>
          </table></div>`
        : ''}
    </section>

    <section class="panel">
      <h2>Respostas</h2>
      ${analises.length
        ? html`<div class="tbl-scroll"><table class="tbl compact">
            <thead><tr><th>Data</th><th>Quem</th><th>Segmento</th><th class="num">Nota</th><th>Sentimento</th><th>Temas</th><th>Resumo</th></tr></thead>
            <tbody>${[...analises].sort((a, b) => String(b.data).localeCompare(String(a.data))).map((l) => html`<tr>
              <td>${formatarData(l.data)}</td>
              <td>${l.identificacao || html`<span class="muted">anônimo</span>`}</td>
              <td>${ROTULO_SEGMENTO[segmentoDe(l)] || segmentoDe(l)}</td>
              <td class="num">${l.nota}</td>
              <td><span class="status ${l.sentimento === 'positivo' ? 'ok' : l.sentimento === 'negativo' ? 'bad' : 'warn'}">${l.sentimento}</span></td>
              <td>${temasDe(l).map((t) => ROTULO_TEMA[t] || t).join(', ')}</td>
              <td>${l.resumo}${l.citacao ? html`<br><span class="sub">“${l.citacao}”</span>` : ''}</td>
            </tr>`)}</tbody></table></div>`
        : html`<p class="muted">Nenhuma resposta ainda.</p>`}
    </section>`;
}
