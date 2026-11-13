import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coortes,
  distribuicaoFrequencia,
  evolucaoPercentil,
  indicadores,
  riscoEvasao,
  segmentos,
  serieParticipacao,
} from '../js/domain/gestao.js';

// Monta torneios a partir de { data: [jogadores na ordem de colocação] }.
function montar(mapa, temporada = 's1', extra = {}) {
  const torneios = [];
  const resultados = [];
  Object.entries(mapa).forEach(([data, ordem], i) => {
    const id = `t${i}`;
    torneios.push({ id, temporada_id: temporada, data, nome: id, status: extra[data] || 'confirmado' });
    ordem.forEach((j, k) => resultados.push({ id: `${id}-${j}`, torneio_id: id, jogador_id: j, colocacao: String(k + 1) }));
  });
  return { torneios, resultados };
}

test('participação por torneio separa quem estreou', () => {
  const dados = montar({ '2026-01-03': ['A', 'B'], '2026-01-10': ['A', 'C', 'D'], '2026-01-17': ['B', 'C'] });
  assert.deepEqual(serieParticipacao(dados).map((x) => [x.total, x.novatos, x.recorrentes]), [[2, 2, 0], [3, 2, 1], [2, 0, 2]]);
});

test('torneio anulado não conta presença', () => {
  const dados = montar({ '2026-01-03': ['A'], '2026-01-10': ['A', 'B'] }, 's1', { '2026-01-03': 'anulado' });
  const serie = serieParticipacao(dados);
  assert.equal(serie.length, 1);
  assert.equal(serie[0].novatos, 2);
});

test('distribuição de frequência na temporada', () => {
  const dados = montar({ '2026-01-03': ['A', 'B'], '2026-01-10': ['A', 'C'], '2026-01-17': ['A'] });
  assert.deepEqual(distribuicaoFrequencia(dados, 's1'), [{ torneios: 1, jogadores: 2 }, { torneios: 2, jogadores: 0 }, { torneios: 3, jogadores: 1 }]);
});

test('retenção por coorte mensal, com meses futuros nulos', () => {
  const dados = montar({ '2026-01-03': ['A', 'B'], '2026-02-07': ['A', 'C'], '2026-03-07': ['C'] });
  const c = coortes(dados, { meses: 4 });
  assert.equal(c[0].coorte, '2026-01');
  assert.equal(c[0].tamanho, 2);
  assert.deepEqual(c[0].retencao, [1, 0.5, 0, null]);
  assert.deepEqual(c[1].retencao, [1, 1, null, null]);
});

test('risco de evasão: frequente que sumiu é alto; quem jogou pouco não entra', () => {
  // A joga os 6 primeiros e some nos 4 últimos; B joga tudo; C jogou só 2 vezes.
  const datas = Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const mapa = Object.fromEntries(datas.map((d, i) => [d, [...(i < 6 ? ['A'] : []), 'B', ...(i < 2 ? ['C'] : [])]]));
  const r = riscoEvasao(montar(mapa));
  assert.deepEqual(r.map((x) => [x.jogador_id, x.nivel, x.torneiosSemJogar]), [['A', 'alto', 4]]);
  const seg = segmentos(montar(mapa));
  assert.equal(seg.get('A'), 'em_risco');
  assert.equal(seg.get('B'), 'frequente');
  assert.equal(seg.get('C'), 'novato');
});

test('indicadores da temporada', () => {
  const dados = montar({ '2026-01-03': ['A', 'B'], '2026-01-10': ['A', 'C'], '2026-01-17': ['A', 'B', 'C', 'D'] });
  const i = indicadores(dados, 's1');
  assert.equal(i.torneiosTemporada, 3);
  assert.equal(i.mediaParticipantes, 8 / 3);
  assert.equal(i.novatos, 4);
  assert.equal(i.retencaoNovatos, 0.75); // D só jogou uma vez
  assert.equal(i.ativos, 4);
});

test('percentil de colocação: campeão 1, último 0', () => {
  const dados = montar({ '2026-01-03': ['A', 'B', 'C'], '2026-01-10': ['C', 'A'] });
  assert.deepEqual(evolucaoPercentil('A', dados).map((x) => x.percentil), [1, 0]);
  assert.deepEqual(evolucaoPercentil('B', dados).map((x) => x.percentil), [0.5]);
});
