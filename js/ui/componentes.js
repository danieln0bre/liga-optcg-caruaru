import { html, urlSegura } from '../util/html.js';
import { iniciais } from '../util/texto.js';

export function avatar(jogador, tamanho = 'm') {
  const foto = urlSegura(jogador?.foto_url);
  const nome = jogador?.nome || 'Jogador removido';
  if (foto) {
    return html`<img class="avatar avatar-${tamanho}" src="${foto}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  // Cor estável a partir do id, para os avatares sem foto não ficarem todos iguais.
  let h = 2166136261;
  for (const c of String(jogador?.id || nome)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const matiz = (h >>> 0) % 360;
  return html`<span class="avatar avatar-${tamanho} avatar-initials" style="--matiz:${matiz}" aria-hidden="true">${iniciais(nome)}</span>`;
}

export function linkJogador(jogador, idFallback) {
  if (!jogador) return html`<span class="muted">Jogador ${idFallback}</span>`;
  return html`<a class="player-link" href="#/jogador/${encodeURIComponent(jogador.id)}">${avatar(jogador, 'p')}<span>${jogador.nome}</span></a>`;
}

const ROTULO_PODIO = { 1: 'Campeão', 2: 'Vice', 3: '3º lugar' };

/** Pódio com 1º ao centro. classificacao: [{posicao, jogador_id, pontos}] já filtrada para posições 1-3. */
export function podio(classificacao, jogadoresPorId) {
  // Primeiro colocado ao centro, os demais alternando esquerda/direita (funciona também com empates).
  const ordenada = [...classificacao].sort((a, b) => a.posicao - b.posicao);
  const visual = [];
  ordenada.forEach((c, i) => (i % 2 === 1 ? visual.unshift(c) : visual.push(c)));
  const blocos = visual.map((c) => {
    const pos = c.posicao;
    const j = jogadoresPorId.get(c.jogador_id);
    return html`
      <a class="podium-item podium-${pos}" href="#/jogador/${encodeURIComponent(c.jogador_id)}">
        ${avatar(j, pos === 1 ? 'g' : 'm')}
        <span class="podium-name">${j?.nome || c.jogador_id}</span>
        <span class="podium-points">${c.pontos} pts</span>
        <span class="podium-step"><span class="podium-label">${ROTULO_PODIO[pos]}</span></span>
      </a>`;
  });
  if (!blocos.length) return '';
  return html`<div class="podium" style="--colunas:${Math.max(3, blocos.length)}" aria-label="Pódio">${blocos}</div>`;
}

export function vazio(mensagem) {
  return html`<div class="empty">${mensagem}</div>`;
}

export function carregando() {
  return html`<div class="empty" aria-busy="true">Carregando…</div>`;
}

export function erro(mensagem) {
  return html`<div class="notice bad" role="alert">${mensagem}</div>`;
}
