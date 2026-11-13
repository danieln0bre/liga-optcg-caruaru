// Métricas de gestão da comunidade (painel da administração). Funções puras, sem rede nem DOM.
// Usam todos os torneios válidos (de todas as temporadas): presença e evasão são da comunidade,
// não de uma liga só. Os parâmetros ficam em CRITERIOS para ajuste num único ponto.
import { torneioValido } from './liga.js';

export const CRITERIOS = {
  janelaAtivos: 4, // ativo = jogou em pelo menos um dos últimos N torneios
  janelaRisco: 4, // em risco = sumiu dos últimos N torneios...
  minPresencasRisco: 3, // ...depois de pelo menos N presenças...
  taxaMinRisco: 0.5, // ...com presença de pelo menos 50% enquanto jogava
  maxPresencasNovato: 2, // novato = até N presenças na vida
  taxaFrequente: 0.5, // frequente = presença >= 50% nos últimos 8 torneios
  janelaFrequente: 8,
  mesesCoorte: 6, // colunas do mapa de retenção
};

const mes = (data) => String(data).slice(0, 7); // AAAA-MM

/** Torneios válidos em ordem cronológica e presenças de cada jogador (índices nessa ordem). */
export function linhaDoTempo({ torneios, resultados }) {
  const lista = torneios
    .filter(torneioValido)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  const indice = new Map(lista.map((t, i) => [t.id, i]));
  const presencas = new Map(); // jogador_id → Set(índices)
  const participantes = new Array(lista.length).fill(0);
  for (const r of resultados) {
    const i = indice.get(r.torneio_id);
    if (i === undefined) continue;
    participantes[i]++;
    if (!presencas.has(r.jogador_id)) presencas.set(r.jogador_id, new Set());
    presencas.get(r.jogador_id).add(i);
  }
  return { torneios: lista, presencas, participantes };
}

/** Participação por torneio, separando quem estreou naquele dia. Opcionalmente só de uma temporada. */
export function serieParticipacao(dados, temporadaId = null) {
  const { torneios, presencas, participantes } = linhaDoTempo(dados);
  const estreia = new Map(); // índice do torneio → quantos estrearam
  for (const set of presencas.values()) {
    const primeiro = Math.min(...set);
    estreia.set(primeiro, (estreia.get(primeiro) || 0) + 1);
  }
  return torneios
    .map((t, i) => ({ id: t.id, data: t.data, nome: t.nome, temporada_id: t.temporada_id, total: participantes[i], novatos: estreia.get(i) || 0 }))
    .map((x) => ({ ...x, recorrentes: x.total - x.novatos }))
    .filter((x) => !temporadaId || x.temporada_id === temporadaId);
}

/** Quantos jogadores jogaram 1, 2, 3… torneios na temporada. */
export function distribuicaoFrequencia(dados, temporadaId) {
  const { torneios, presencas } = linhaDoTempo(dados);
  const daTemporada = new Set(torneios.map((t, i) => (t.temporada_id === temporadaId ? i : -1)).filter((i) => i >= 0));
  const contagem = new Map();
  for (const set of presencas.values()) {
    const n = [...set].filter((i) => daTemporada.has(i)).length;
    if (n) contagem.set(n, (contagem.get(n) || 0) + 1);
  }
  const max = Math.max(0, ...contagem.keys());
  return Array.from({ length: max }, (_, i) => ({ torneios: i + 1, jogadores: contagem.get(i + 1) || 0 }));
}

/**
 * Retenção por coorte: jogadores agrupados pelo mês da estreia; para cada mês seguinte,
 * a fração que jogou pelo menos um torneio naquele mês. null = mês ainda não aconteceu.
 */
export function coortes(dados, { meses = CRITERIOS.mesesCoorte } = {}) {
  const { torneios, presencas } = linhaDoTempo(dados);
  if (!torneios.length) return [];
  const indiceMes = (m) => {
    const [a, mm] = m.split('-').map(Number);
    return a * 12 + (mm - 1);
  };
  const ultimoMes = indiceMes(mes(torneios.at(-1).data));
  const grupos = new Map();
  for (const set of presencas.values()) {
    const mesesJogados = new Set([...set].map((i) => indiceMes(mes(torneios[i].data))));
    const inicio = Math.min(...mesesJogados);
    if (!grupos.has(inicio)) grupos.set(inicio, []);
    grupos.get(inicio).push(mesesJogados);
  }
  return [...grupos]
    .sort((a, b) => a[0] - b[0])
    .map(([inicio, jogadores]) => ({
      coorte: `${Math.floor(inicio / 12)}-${String((inicio % 12) + 1).padStart(2, '0')}`,
      tamanho: jogadores.length,
      retencao: Array.from({ length: meses }, (_, k) =>
        inicio + k > ultimoMes ? null : jogadores.filter((m) => m.has(inicio + k)).length / jogadores.length,
      ),
    }));
}

/**
 * Jogadores em risco de evasão: tinham presença regular e não aparecem nos últimos torneios.
 * alto = sumiu de todos os últimos N; medio = só uma presença nos últimos N, com histórico forte.
 */
export function riscoEvasao(dados, criterios = CRITERIOS) {
  const { torneios, presencas } = linhaDoTempo(dados);
  const total = torneios.length;
  const N = criterios.janelaRisco;
  if (total <= N) return [];
  const corte = total - N; // índices >= corte são "recentes"
  const saida = [];
  for (const [jogadorId, set] of presencas) {
    const antigas = [...set].filter((i) => i < corte);
    if (antigas.length < criterios.minPresencasRisco) continue;
    const primeiro = Math.min(...set);
    const taxa = antigas.length / Math.max(1, corte - primeiro);
    const recentes = set.size - antigas.length;
    let nivel = null;
    if (recentes === 0 && taxa >= criterios.taxaMinRisco) nivel = 'alto';
    else if (recentes === 1 && taxa >= criterios.taxaMinRisco + 0.15) nivel = 'medio';
    if (!nivel) continue;
    const ultima = Math.max(...set);
    saida.push({
      jogador_id: jogadorId,
      nivel,
      presencas: set.size,
      taxaHistorica: taxa,
      ultimaPresenca: torneios[ultima].data,
      torneiosSemJogar: total - 1 - ultima,
    });
  }
  const peso = { alto: 0, medio: 1 };
  return saida.sort((a, b) => peso[a.nivel] - peso[b.nivel] || b.taxaHistorica - a.taxaHistorica || b.presencas - a.presencas);
}

/** Segmento de cada jogador, usado no painel e para cruzar com as respostas das pesquisas. */
export function segmentos(dados, criterios = CRITERIOS) {
  const { torneios, presencas } = linhaDoTempo(dados);
  const risco = new Map(riscoEvasao(dados, criterios).map((r) => [r.jogador_id, r.nivel]));
  const inicioJanela = Math.max(0, torneios.length - criterios.janelaFrequente);
  const tamanhoJanela = torneios.length - inicioJanela;
  const mapa = new Map();
  for (const [jogadorId, set] of presencas) {
    let segmento;
    if (risco.get(jogadorId) === 'alto') segmento = 'em_risco';
    else if (set.size <= criterios.maxPresencasNovato) segmento = 'novato';
    else if ([...set].filter((i) => i >= inicioJanela).length / Math.max(1, tamanhoJanela) >= criterios.taxaFrequente) segmento = 'frequente';
    else segmento = 'ocasional';
    mapa.set(jogadorId, segmento);
  }
  return mapa;
}

export const ROTULO_SEGMENTO = { frequente: 'Frequentes', ocasional: 'Ocasionais', novato: 'Novatos', em_risco: 'Em risco', desconhecido: 'Não identificados' };

/** Números do topo do painel. */
export function indicadores(dados, temporadaId, criterios = CRITERIOS) {
  const { torneios, presencas } = linhaDoTempo(dados);
  const inicioAtivos = Math.max(0, torneios.length - criterios.janelaAtivos);
  const ativos = [...presencas.values()].filter((set) => [...set].some((i) => i >= inicioAtivos)).length;

  const serie = serieParticipacao(dados, temporadaId);
  const mediaParticipantes = serie.length ? serie.reduce((s, x) => s + x.total, 0) / serie.length : 0;

  // Novatos da temporada: estrearam num torneio dela. Retidos: voltaram pelo menos mais uma vez.
  const daTemporada = new Set(torneios.map((t, i) => (t.temporada_id === temporadaId ? i : -1)).filter((i) => i >= 0));
  const novatos = [...presencas.values()].filter((set) => daTemporada.has(Math.min(...set)));
  const retidos = novatos.filter((set) => set.size >= 2).length;

  return {
    ativos,
    janelaAtivos: Math.min(criterios.janelaAtivos, torneios.length),
    torneiosTemporada: serie.length,
    mediaParticipantes,
    novatos: novatos.length,
    retencaoNovatos: novatos.length ? retidos / novatos.length : null,
    emRisco: riscoEvasao(dados, criterios).filter((r) => r.nivel === 'alto').length,
  };
}

/**
 * Percentil de colocação de um jogador em cada torneio: 1 = campeão, 0 = último.
 * Compara torneios de tamanhos diferentes melhor que a colocação crua.
 */
export function evolucaoPercentil(jogadorId, dados) {
  const { torneios, participantes } = linhaDoTempo(dados);
  const indice = new Map(torneios.map((t, i) => [t.id, i]));
  return dados.resultados
    .filter((r) => r.jogador_id === jogadorId && indice.has(r.torneio_id))
    .map((r) => {
      const i = indice.get(r.torneio_id);
      const n = participantes[i];
      const c = Number(r.colocacao);
      return { data: torneios[i].data, nome: torneios[i].nome, colocacao: c, participantes: n, percentil: n > 1 ? 1 - (c - 1) / (n - 1) : 1 };
    })
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}
