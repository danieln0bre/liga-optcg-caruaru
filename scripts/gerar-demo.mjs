// Gera data/demo.json com jogadores e torneios fictícios. Uso: node scripts/gerar-demo.mjs
import { writeFileSync } from 'node:fs';
import { calcularRanking, congelarClassificacao } from '../js/domain/liga.js';

let semente = 20261113;
const aleatorio = () => {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
};
const embaralhar = (lista) => {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const nomes = [
  'Rafael Torres', 'Lucas Andrade', 'Bianca Ferraz', 'Thiago Moura', 'Gabriel Lins', 'Ana Beatriz Rocha',
  'Pedro Henrique Sá', 'Mateus Cavalcanti', 'Igor Barros', 'Júlia Nunes', 'Felipe Araújo', 'Caio Menezes',
  'Vinícius Lopes', 'Larissa Pontes', 'Diego Farias', 'Renan Siqueira', 'Arthur Vasconcelos', 'Marcos Tavares',
  'Heitor Brandão', 'Sofia Queiroz',
];
const decks = ['Enel (roxo)', 'Lucci (preto)', 'Nami (azul)', 'Shanks (vermelho)', 'Bonney (verde)', 'Moria (preto)', 'Kid (vermelho)', 'Hancock (azul)', ''];
const bios = [
  'Joga desde o lançamento da OP-01.',
  'Organiza os encontros de quinta.',
  'Prefere decks de controle.',
  '',
  '',
  'Começou em 2026 e não perde uma local.',
];

const jogadores = nomes.map((nome, i) => ({
  id: `j_${String(i + 1).padStart(2, '0')}`,
  nome,
  foto_url: '',
  deck_favorito: decks[i % decks.length],
  bio: bios[i % bios.length],
  ativo: 'sim',
  criado_em: '2025-07-01T12:00:00.000Z',
}));

// Força relativa de cada jogador (só para gerar resultados plausíveis).
const forca = Object.fromEntries(jogadores.map((j, i) => [j.id, 1 - i / nomes.length + aleatorio() * 0.5]));

const temporadas = [
  { id: 't_2025_2', nome: 'Liga 2025 — 2º semestre', inicio: '2025-07-01', fim: '2025-12-20', status: 'encerrada', melhores_resultados: '6' },
  { id: 't_2026_1', nome: 'Liga 2026 — 1º semestre', inicio: '2026-01-10', fim: '2026-06-27', status: 'encerrada', melhores_resultados: '6' },
  { id: 't_2026_2', nome: 'Liga 2026 — 2º semestre', inicio: '2026-07-04', fim: '2026-12-19', status: 'ativa', melhores_resultados: '6' },
];

const torneios = [];
const resultados = [];
let seqResultado = 1;

function gerarTorneios(temporada, datas, poolIds, foraDoTorneio = () => []) {
  datas.forEach((data, i) => {
    const id = `${temporada.id}_tor${i + 1}`;
    torneios.push({ id, temporada_id: temporada.id, data, nome: `Local de ${data.split('-').reverse().slice(0, 2).join('/')}`, status: 'confirmado', criado_por: 'demo@exemplo.com', criado_em: `${data}T15:00:00.000Z` });
    const quantos = 10 + Math.floor(aleatorio() * 8); // 10 a 17
    const fora = new Set(foraDoTorneio(i, datas.length));
    const presentes = embaralhar(poolIds.filter((p) => !fora.has(p))).slice(0, quantos);
    const ordem = presentes
      .map((pid) => ({ pid, nota: forca[pid] + aleatorio() * 0.9 }))
      .sort((a, b) => b.nota - a.nota);
    ordem.forEach(({ pid }, pos) => {
      resultados.push({ id: `r_${String(seqResultado++).padStart(4, '0')}`, torneio_id: id, jogador_id: pid, colocacao: String(pos + 1) });
    });
  });
}

const sabados = (inicio, quantidade, intervaloDias = 14) =>
  Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(`${inicio}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * intervaloDias);
    return d.toISOString().slice(0, 10);
  });

const ids = jogadores.map((j) => j.id);
// 2025.2: só classificação final importada (sem torneios), como acontecerá com as ligas antigas.
const classificacao_historica = embaralhar(ids.slice(0, 14))
  .sort((a, b) => forca[b] - forca[a])
  .map((jid, i) => ({ temporada_id: 't_2025_2', posicao: String(i + 1), jogador_id: jid, pontos: String(Math.max(6, 92 - i * 6 - Math.floor(aleatorio() * 4))), observacao: '' }));

// 2026.1: torneios completos e classificação congelada no encerramento.
gerarTorneios(temporadas[1], sabados('2026-01-17', 11), ids.slice(0, 17));
const ranking2026_1 = calcularRanking({ temporada: temporadas[1], torneios, resultados });
classificacao_historica.push(...congelarClassificacao(temporadas[1], ranking2026_1).map((l) => ({ ...l, posicao: String(l.posicao), pontos: String(l.pontos) })));

// 2026.2: temporada em andamento.
// Na temporada atual: j_18–j_20 estreiam aos poucos (j_20 joga só uma vez), e j_05/j_09, que eram
// regulares, somem dos últimos 4 torneios (aparecem no painel como risco de evasão).
const estreia = { j_18: 2, j_19: 4, j_20: 6 };
gerarTorneios(temporadas[2], sabados('2026-07-11', 9), ids, (i, n) => [
  ...Object.entries(estreia).filter(([, inicio]) => i < inicio).map(([id]) => id),
  ...(i > 6 ? ['j_20'] : []),
  ...(i >= n - 4 ? ['j_05', 'j_09'] : []),
]);

const apelidos = [
  { apelido: 'rafa_torres', jogador_id: 'j_01', criado_por: 'demo@exemplo.com', criado_em: '2026-07-11T15:00:00.000Z' },
  { apelido: 'Bia F.', jogador_id: 'j_03', criado_por: 'demo@exemplo.com', criado_em: '2026-07-11T15:00:00.000Z' },
  { apelido: 'PH Sá', jogador_id: 'j_07', criado_por: 'demo@exemplo.com', criado_em: '2026-07-11T15:00:00.000Z' },
];

// Member Numbers fictícios (só na planilha administrativa) para os 15 primeiros jogadores.
const numeros_membro = jogadores.slice(0, 15).map((j, i) => ({
  member_number: String(100001 + i * 7919).padStart(10, '0'),
  jogador_id: j.id,
  criado_por: 'demo@exemplo.com',
  criado_em: '2026-07-11T15:00:00.000Z',
}));

// Quem tem acesso às planilhas (simulado na demonstração; no modo sheets vem do Google Drive).
const acessos = [
  { email: 'admin.demo@exemplo.com', nome: 'Admin Demo', proprietario: true },
  { email: 'organizador@exemplo.com', nome: 'Organizador', proprietario: false },
];

// Pesquisa fictícia já analisada (no modo sheets, quem preenche estas abas é o Apps Script).
const pesquisa_config = [
  { chave: 'url_formulario', valor: 'https://docs.google.com/forms/d/e/EXEMPLO/viewform' },
  { chave: 'url_edicao', valor: 'https://docs.google.com/forms/d/EXEMPLO/edit' },
  { chave: 'relatorio_em', valor: '2026-11-10T09:00:00.000Z' },
  { chave: 'nps', valor: '27' },
];
const respostasDemo = [
  ['j_18', 'novato', 9, 'positivo', 'novatos_aprendizado', 'Quer uma mesa para aprender regras antes do torneio.', 'Na primeira vez fiquei perdido com as regras'],
  ['j_19', 'novato', 6, 'misto', 'novatos_aprendizado,custo', 'Acha caro montar deck competitivo; pede deck emprestado para começar.', 'Não tenho deck bom ainda'],
  ['j_20', 'novato', 4, 'negativo', 'ambiente_comunidade,novatos_aprendizado', 'Sentiu-se deslocado por perder rápido para jogadores experientes.', 'Perdi todas e ninguém explicou nada'],
  ['j_05', 'em_risco', 5, 'negativo', 'horario', 'Sábado às 10h conflita com o trabalho; preferiria à tarde.', 'O horário de sábado de manhã não dá mais'],
  ['j_09', 'em_risco', 6, 'misto', 'horario,formato_torneio', 'Torneios longos demais; sugere menos rodadas ou corte de tempo.', 'Acaba muito tarde'],
  ['j_01', 'frequente', 10, 'positivo', 'premiacao', 'Gosta da liga; sugere premiação simbólica para o top 8 da temporada.', ''],
  ['j_02', 'frequente', 9, 'positivo', 'comunicacao', 'Pede aviso das datas com mais antecedência no grupo.', 'Às vezes só fico sabendo no dia'],
  ['j_03', 'frequente', 8, 'neutro', 'regras_arbitragem', 'Quer um juiz de referência para resolver dúvidas na hora.', ''],
  ['j_07', 'frequente', 9, 'positivo', 'metagame_decks', 'Sugere evento casual com decks fora do meta.', ''],
  ['j_12', 'ocasional', 7, 'misto', 'horario,local_estrutura', 'Loja fica cheia e quente; horário da tarde ajudaria.', 'Fica muito apertado'],
  ['j_15', 'ocasional', 7, 'neutro', 'comunicacao', 'Não sabia como funcionava a pontuação da liga.', ''],
  ['', 'desconhecido', 3, 'negativo', 'ambiente_comunidade', 'Relata comentários desagradáveis de alguns jogadores em partidas.', 'Tem gente que zoa quem perde'],
];
const pesquisa_analise = respostasDemo.map(([jogador_id, segmento, nota, sentimento, temas, resumo, citacao], i) => ({
  resposta_id: `resp_${i + 1}`, data: `2026-11-0${(i % 9) + 1}T20:00:00.000Z`, identificacao: jogador_id ? (jogadores.find((j) => j.id === jogador_id)?.nome || '') : '',
  jogador_id, segmento, nota: String(nota), sentimento, temas, resumo, citacao, status: 'ok',
}));
const pesquisa_relatorio = [
  ['novatos_aprendizado', '3', 'novato (3)', 'Novatos chegam sem saber as regras e perdem rápido, sem acolhimento.', 'Mesa de iniciantes 30 min antes do torneio, com um veterano voluntário e decks emprestados.', 'baixo', 'alto'],
  ['horario', '3', 'em_risco (2), ocasional (1)', 'O horário de sábado de manhã afasta quem trabalha; torneios terminam tarde.', 'Testar um torneio mensal no sábado à tarde e limitar a 4 rodadas com relógio.', 'medio', 'alto'],
  ['ambiente_comunidade', '2', 'novato (1), desconhecido (1)', 'Há relatos de zoação com quem perde, o que desanima novatos.', 'Publicar um código de conduta curto e lembrar na abertura do torneio; organizador conversa com os envolvidos.', 'baixo', 'alto'],
  ['comunicacao', '2', 'frequente (1), ocasional (1)', 'Datas e regras da pontuação não chegam a todos.', 'Fixar no grupo o calendário do mês e o link do ranking com a explicação da pontuação.', 'baixo', 'medio'],
].map(([tema, respostas, segmentos, dor, sugestao, esforco, impacto]) => ({ gerado_em: '2026-11-10T09:00:00.000Z', tema, respostas, segmentos, dor, sugestao, esforco, impacto }));

const notas_jogador = [
  { id: 'n_01', jogador_id: 'j_14', data: '2026-10-03', autor: 'demo@exemplo.com', texto: 'Comentou que o horário de sábado às 10h é difícil por causa do trabalho.' },
];

const demo = { jogadores, temporadas, torneios, resultados, classificacao_historica, apelidos, numeros_membro, notas_jogador, acessos, pesquisa_config, pesquisa_analise, pesquisa_relatorio, auditoria: [] };
writeFileSync(new URL('../data/demo.json', import.meta.url), JSON.stringify(demo, null, 1));
console.log(`demo.json: ${jogadores.length} jogadores, ${torneios.length} torneios, ${resultados.length} resultados`);
