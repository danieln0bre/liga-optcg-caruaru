// Regras da liga. Funções puras: recebem dados e devolvem dados, sem acesso a rede ou DOM.
import { normalizar, normalizarMemberNumber, similaridade } from '../util/texto.js';

const num = (v, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};

export const torneioValido = (t) => String(t.status || 'confirmado') !== 'anulado';

/** Pontos de uma colocação: participantes - colocação + 1 (1º de 17 = 17; 17º = 1). */
export function pontosPorColocacao(colocacao, participantes) {
  const c = num(colocacao);
  const p = num(participantes);
  if (c < 1 || p < 1 || c > p) return 0;
  return p - c + 1;
}

/**
 * Resultados de uma temporada já com pontos calculados.
 * O número de participantes de cada torneio é a quantidade de resultados lançados nele.
 */
export function resultadosDaTemporada(temporadaId, torneios, resultados) {
  const validos = new Map(
    torneios.filter((t) => t.temporada_id === temporadaId && torneioValido(t)).map((t) => [t.id, t]),
  );
  const porTorneio = new Map();
  for (const r of resultados) {
    if (!validos.has(r.torneio_id)) continue;
    if (!porTorneio.has(r.torneio_id)) porTorneio.set(r.torneio_id, []);
    porTorneio.get(r.torneio_id).push(r);
  }
  const saida = [];
  for (const [torneioId, lista] of porTorneio) {
    const torneio = validos.get(torneioId);
    const participantes = lista.length;
    for (const r of lista) {
      saida.push({
        torneio_id: torneioId,
        torneio_nome: torneio.nome,
        data: torneio.data,
        jogador_id: r.jogador_id,
        colocacao: num(r.colocacao),
        participantes,
        pontos: pontosPorColocacao(r.colocacao, participantes),
      });
    }
  }
  return saida.sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

/**
 * Critérios de desempate, aplicados em ordem após a soma dos melhores resultados.
 * PROVISÓRIO: confirmar com a administração da liga e ajustar aqui.
 */
export const DESEMPATE_PADRAO = [
  { campo: 'vitorias', ordem: 'desc', rotulo: 'mais vitórias (1º lugar)' },
  { campo: 'melhorColocacao', ordem: 'asc', rotulo: 'melhor colocação' },
  { campo: 'pontosTotais', ordem: 'desc', rotulo: 'maior soma de todos os resultados' },
];

/**
 * Classificação da temporada.
 * @returns lista ordenada com { posicao, jogador_id, pontos, contam, descartados, ... }
 */
export function calcularRanking({ temporada, torneios, resultados, melhores, desempate = DESEMPATE_PADRAO }) {
  const limite = num(melhores ?? temporada?.melhores_resultados, 6) || 6;
  const linhas = resultadosDaTemporada(temporada.id, torneios, resultados);

  const porJogador = new Map();
  for (const r of linhas) {
    if (!porJogador.has(r.jogador_id)) porJogador.set(r.jogador_id, []);
    porJogador.get(r.jogador_id).push(r);
  }

  const ranking = [];
  for (const [jogadorId, lista] of porJogador) {
    // Ordena por pontos; em empate, o resultado mais recente fica na frente.
    const ordenados = [...lista].sort((a, b) => b.pontos - a.pontos || String(b.data).localeCompare(String(a.data)));
    const contam = ordenados.slice(0, limite);
    const descartados = ordenados.slice(limite);
    ranking.push({
      jogador_id: jogadorId,
      pontos: contam.reduce((s, r) => s + r.pontos, 0),
      pontosTotais: lista.reduce((s, r) => s + r.pontos, 0),
      participacoes: lista.length,
      vitorias: lista.filter((r) => r.colocacao === 1).length,
      melhorColocacao: Math.min(...lista.map((r) => r.colocacao)),
      contam,
      descartados,
    });
  }

  const comparar = (a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    for (const { campo, ordem } of desempate) {
      const d = ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo];
      if (d !== 0) return d;
    }
    return 0;
  };

  ranking.sort(comparar);
  ranking.forEach((linha, i) => {
    // Empate total em todos os critérios divide a posição.
    linha.posicao = i > 0 && comparar(ranking[i - 1], linha) === 0 ? ranking[i - 1].posicao : i + 1;
  });
  return ranking;
}

/**
 * Classificação final de uma temporada encerrada: usa a classificação congelada/importada
 * se existir; caso contrário, calcula a partir dos torneios.
 */
export function classificacaoFinal({ temporada, torneios, resultados, historico }) {
  const congelada = historico
    .filter((h) => h.temporada_id === temporada.id)
    .map((h) => ({ posicao: num(h.posicao), jogador_id: h.jogador_id, pontos: num(h.pontos), observacao: h.observacao || '' }))
    .sort((a, b) => a.posicao - b.posicao);
  if (congelada.length) return congelada;
  return calcularRanking({ temporada, torneios, resultados }).map((r) => ({
    posicao: r.posicao,
    jogador_id: r.jogador_id,
    pontos: r.pontos,
    observacao: '',
  }));
}

/** Separa pódio (posições 1 a 3) do restante. */
export function separarPodio(classificacao) {
  return {
    podio: classificacao.filter((c) => c.posicao <= 3),
    demais: classificacao.filter((c) => c.posicao > 3),
  };
}

export function temporadaAtiva(temporadas) {
  const ativas = temporadas.filter((t) => t.status === 'ativa');
  return ativas.sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))[0] || null;
}

export function temporadasEncerradas(temporadas) {
  return temporadas
    .filter((t) => t.status === 'encerrada')
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
}

/**
 * Lê uma classificação colada (um jogador por linha, na ordem de colocação).
 * Aceita prefixos como "1.", "1º", "1 -", "1)", um Member Number de 10 dígitos opcional
 * ao fim do nome ("luffy (0000310001)", "luffy 0000310001", "luffy #0000310001")
 * e um sufixo de pontos ";12" opcional.
 */
export function interpretarClassificacaoColada(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linha, i) => {
      let resto = linha.replace(/^\d{1,3}\s*(º|°|o\b|\.|\)|-|–)?\s+/i, '').replace(/^\d{1,3}\s*(º|°|\.|\)|-|–)\s*/i, '');
      let pontos = null;
      const m = resto.match(/^(.*?)[;\t]\s*(\d+)\s*$/);
      if (m) {
        resto = m[1].trim();
        pontos = Number(m[2]);
      }
      let memberNumber = '';
      const mm = resto.match(/^(.*?)\s*[([#]?\s*(\d{10})\s*[)\]]?\s*$/);
      if (mm && mm[1].trim()) {
        resto = mm[1].trim();
        memberNumber = mm[2];
      }
      return { colocacao: i + 1, texto: resto, pontos, memberNumber };
    })
    .filter((l) => l.texto);
}

/**
 * Mapa Member Number → jogador_id a partir da aba numeros_membro.
 * Se o mesmo número aparecer mais de uma vez, vale a linha mais recente (é assim que se corrige uma associação).
 */
export function mapaMemberNumbers(numeros = []) {
  const ordenados = [...numeros].sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  const mapa = new Map();
  for (const n of ordenados) {
    const numero = normalizarMemberNumber(n.member_number);
    if (numero && n.jogador_id) mapa.set(numero, n.jogador_id);
  }
  return mapa;
}

/**
 * Sugere o jogador correspondente a um nome lido de um print ou colado.
 * Ordem: Member Number já conhecido → nome exato ou apelido → semelhança.
 * @param opcoes { memberNumber, numeros } — numeros são as linhas da aba numeros_membro.
 * @returns { jogador_id|null, confianca: 'exata'|'provavel'|'nenhuma', origem, candidatos: [{jogador_id, score}] }
 */
export function sugerirJogador(texto, jogadores, apelidos = [], { memberNumber = '', numeros = [] } = {}) {
  const numero = normalizarMemberNumber(memberNumber);
  if (numero) {
    const jogadorId = mapaMemberNumbers(numeros).get(numero);
    if (jogadorId && jogadores.some((j) => j.id === jogadorId)) {
      return { jogador_id: jogadorId, confianca: 'exata', origem: 'member_number', candidatos: [{ jogador_id: jogadorId, score: 1 }] };
    }
  }

  const alvo = normalizar(texto);
  if (!alvo) return { jogador_id: null, confianca: 'nenhuma', origem: 'nome', candidatos: [] };

  const nomes = [
    ...jogadores.map((j) => ({ jogador_id: j.id, nome: normalizar(j.nome) })),
    ...apelidos.map((a) => ({ jogador_id: a.jogador_id, nome: normalizar(a.apelido) })),
  ];

  const exato = nomes.find((n) => n.nome === alvo);
  if (exato) return { jogador_id: exato.jogador_id, confianca: 'exata', origem: 'nome', candidatos: [{ jogador_id: exato.jogador_id, score: 1 }] };

  const melhorPorJogador = new Map();
  for (const n of nomes) {
    const score = similaridade(alvo, n.nome);
    if (score > (melhorPorJogador.get(n.jogador_id) ?? 0)) melhorPorJogador.set(n.jogador_id, score);
  }
  const candidatos = [...melhorPorJogador]
    .map(([jogador_id, score]) => ({ jogador_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const melhor = candidatos[0];
  if (melhor && melhor.score >= 0.75) return { jogador_id: melhor.jogador_id, confianca: 'provavel', origem: 'nome', candidatos };
  return { jogador_id: null, confianca: 'nenhuma', origem: 'nome', candidatos };
}

/** Linhas a gravar em classificacao_historica ao encerrar uma temporada. */
export function congelarClassificacao(temporada, ranking) {
  return ranking.map((r) => ({
    temporada_id: temporada.id,
    posicao: r.posicao,
    jogador_id: r.jogador_id,
    pontos: r.pontos,
    observacao: '',
  }));
}

/** Histórico de um jogador em todas as temporadas encerradas. */
export function historicoDoJogador(jogadorId, { temporadas, torneios, resultados, historico }) {
  return temporadasEncerradas(temporadas)
    .map((temporada) => {
      const final = classificacaoFinal({ temporada, torneios, resultados, historico });
      const linha = final.find((c) => c.jogador_id === jogadorId);
      return linha ? { temporada, posicao: linha.posicao, pontos: linha.pontos, total: final.length } : null;
    })
    .filter(Boolean);
}
