import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pontosPorColocacao,
  calcularRanking,
  classificacaoFinal,
  separarPodio,
  interpretarClassificacaoColada,
  sugerirJogador,
  mapaMemberNumbers,
} from '../js/domain/liga.js';

test('pontuação é a colocação inversa', () => {
  assert.equal(pontosPorColocacao(1, 17), 17);
  assert.equal(pontosPorColocacao(2, 17), 16);
  assert.equal(pontosPorColocacao(17, 17), 1);
  assert.equal(pontosPorColocacao(18, 17), 0);
  assert.equal(pontosPorColocacao(0, 17), 0);
});

// Monta um torneio com os jogadores na ordem de colocação.
function torneio(id, data, ordem, extra = {}) {
  return {
    torneio: { id, temporada_id: 's1', data, nome: id, status: 'confirmado', ...extra },
    resultados: ordem.map((j, i) => ({ torneio_id: id, jogador_id: j, colocacao: String(i + 1) })),
  };
}

function montar(lista) {
  return {
    torneios: lista.map((t) => t.torneio),
    resultados: lista.flatMap((t) => t.resultados),
  };
}

test('conta apenas os N melhores resultados', () => {
  // A vence 8 torneios de 4 pessoas (4 pts cada); só 6 contam = 24.
  const lista = Array.from({ length: 8 }, (_, i) => torneio(`t${i}`, `2026-01-0${i + 1}`, ['A', 'B', 'C', 'D']));
  const { torneios, resultados } = montar(lista);
  const r = calcularRanking({ temporada: { id: 's1', melhores_resultados: '6' }, torneios, resultados });
  const a = r.find((x) => x.jogador_id === 'A');
  assert.equal(a.pontos, 24);
  assert.equal(a.pontosTotais, 32);
  assert.equal(a.contam.length, 6);
  assert.equal(a.descartados.length, 2);
  assert.deepEqual(r.map((x) => x.jogador_id), ['A', 'B', 'C', 'D']);
});

test('participantes vêm da quantidade de resultados do torneio', () => {
  const { torneios, resultados } = montar([torneio('t1', '2026-01-01', ['A', 'B', 'C'])]);
  const r = calcularRanking({ temporada: { id: 's1' }, torneios, resultados });
  assert.deepEqual(r.map((x) => x.pontos), [3, 2, 1]);
});

test('torneio anulado não conta', () => {
  const { torneios, resultados } = montar([
    torneio('t1', '2026-01-01', ['A', 'B']),
    torneio('t2', '2026-01-02', ['B', 'A'], { status: 'anulado' }),
  ]);
  const r = calcularRanking({ temporada: { id: 's1' }, torneios, resultados });
  assert.equal(r[0].jogador_id, 'A');
  assert.equal(r[0].pontos, 2);
});

test('desempate por vitórias e posição compartilhada em empate total', () => {
  // A: 1º de 2 (2) + 2º de 3 (2) = 4, uma vitória. B: 3º de 4 (2) + 3º de 4 (2) = 4, sem vitória.
  const { torneios, resultados } = montar([
    torneio('t1', '2026-01-01', ['A', 'X']),
    torneio('t2', '2026-01-02', ['Y', 'A', 'Z']),
    torneio('t3', '2026-01-03', ['W', 'V', 'B', 'U']),
    torneio('t4', '2026-01-04', ['W', 'V', 'B', 'U']),
  ]);
  const r = calcularRanking({ temporada: { id: 's1' }, torneios, resultados });
  const pos = Object.fromEntries(r.map((x) => [x.jogador_id, x.posicao]));
  assert.ok(pos.A < pos.B, 'A deve ficar à frente de B por ter vitória');

  const empate = montar([torneio('t1', '2026-01-01', ['P', 'Q']), torneio('t2', '2026-01-02', ['Q', 'P'])]);
  const r2 = calcularRanking({ temporada: { id: 's1' }, ...empate });
  assert.equal(r2[0].posicao, 1);
  assert.equal(r2[1].posicao, 1);
});

test('classificação congelada tem prioridade sobre o cálculo', () => {
  const { torneios, resultados } = montar([torneio('t1', '2026-01-01', ['A', 'B'])]);
  const historico = [
    { temporada_id: 's1', posicao: '1', jogador_id: 'B', pontos: '50' },
    { temporada_id: 's1', posicao: '2', jogador_id: 'A', pontos: '40' },
  ];
  const final = classificacaoFinal({ temporada: { id: 's1' }, torneios, resultados, historico });
  assert.equal(final[0].jogador_id, 'B');
  const { podio, demais } = separarPodio(final);
  assert.equal(podio.length, 2);
  assert.equal(demais.length, 0);
});

test('interpreta classificação colada com prefixos e pontos', () => {
  const linhas = interpretarClassificacaoColada('1º João Silva\n2. Maria\n\n3) Pedro;12\n4 - Ana');
  assert.deepEqual(
    linhas.map((l) => [l.colocacao, l.texto, l.pontos]),
    [
      [1, 'João Silva', null],
      [2, 'Maria', null],
      [3, 'Pedro', 12],
      [4, 'Ana', null],
    ],
  );
});

test('sugere jogador por nome exato, apelido e semelhança', () => {
  const jogadores = [
    { id: 'j1', nome: 'João Silva' },
    { id: 'j2', nome: 'Maria Oliveira' },
  ];
  const apelidos = [{ apelido: 'joaozin_op', jogador_id: 'j1' }];
  assert.equal(sugerirJogador('joao silva', jogadores, apelidos).confianca, 'exata');
  assert.equal(sugerirJogador('JOAOZIN_OP', jogadores, apelidos).jogador_id, 'j1');
  const abreviado = sugerirJogador('João S.', jogadores, apelidos);
  assert.equal(abreviado.jogador_id, 'j1');
  assert.equal(abreviado.confianca, 'provavel');
  assert.equal(sugerirJogador('Carlos', jogadores, apelidos).confianca, 'nenhuma');
});

test('lê Member Number opcional ao fim do nome', () => {
  const linhas = interpretarClassificacaoColada(
    '1. luffy (0000310001)\n2. zé Gomu #Mugi 0000310002\n3 Nami X [0000310003]\n4. Alê Souza\n5. Nome;12',
  );
  assert.deepEqual(
    linhas.map((l) => [l.colocacao, l.texto, l.memberNumber, l.pontos]),
    [
      [1, 'luffy', '0000310001', null],
      [2, 'zé Gomu #Mugi', '0000310002', null],
      [3, 'Nami X', '0000310003', null],
      [4, 'Alê Souza', '', null],
      [5, 'Nome', '', 12],
    ],
  );
});

test('Member Number conhecido tem prioridade sobre o nome', () => {
  const jogadores = [
    { id: 'j1', nome: 'Daniel Nobre' },
    { id: 'j2', nome: 'luffy' },
  ];
  const numeros = [{ member_number: '0000310001', jogador_id: 'j1', criado_em: '2026-01-01' }];
  const s = sugerirJogador('luffy', jogadores, [], { memberNumber: '0000310001', numeros });
  assert.equal(s.jogador_id, 'j1');
  assert.equal(s.confianca, 'exata');
  assert.equal(s.origem, 'member_number');
  // Número desconhecido: cai na busca por nome.
  const porNome = sugerirJogador('luffy', jogadores, [], { memberNumber: '0000999999', numeros });
  assert.equal(porNome.jogador_id, 'j2');
  assert.equal(porNome.origem, 'nome');
});

test('associação mais recente do Member Number prevalece', () => {
  const mapa = mapaMemberNumbers([
    { member_number: '0000310001', jogador_id: 'j2', criado_em: '2026-02-01T00:00:00Z' },
    { member_number: '0000310001', jogador_id: 'j1', criado_em: '2026-01-01T00:00:00Z' },
    { member_number: '123', jogador_id: 'j3', criado_em: '2026-01-01T00:00:00Z' },
  ]);
  assert.equal(mapa.get('0000310001'), 'j2');
  assert.equal(mapa.size, 1);
});
