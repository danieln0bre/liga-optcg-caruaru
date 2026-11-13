// Abas e colunas das planilhas. A primeira linha de cada aba deve conter exatamente estes cabeçalhos.
// Ver docs/esquema-planilhas.md para a descrição de cada coluna.

export const ESQUEMA_PUBLICO = {
  jogadores: ['id', 'nome', 'foto_url', 'deck_favorito', 'bio', 'ativo', 'criado_em'],
  temporadas: ['id', 'nome', 'inicio', 'fim', 'status', 'melhores_resultados'],
  torneios: ['id', 'temporada_id', 'data', 'nome', 'status', 'criado_por', 'criado_em'],
  resultados: ['id', 'torneio_id', 'jogador_id', 'colocacao'],
  classificacao_historica: ['temporada_id', 'posicao', 'jogador_id', 'pontos', 'observacao'],
};

export const ESQUEMA_ADMIN = {
  apelidos: ['apelido', 'jogador_id', 'criado_por', 'criado_em'],
  // Member Number do Bandai TCG+ (10 dígitos). Fica só na planilha administrativa.
  numeros_membro: ['member_number', 'jogador_id', 'criado_por', 'criado_em'],
  notas_jogador: ['id', 'jogador_id', 'data', 'autor', 'texto'],
  auditoria: ['data', 'usuario', 'acao', 'detalhe'],
};

// Abas criadas pelo Apps Script da pesquisa (scripts/apps-script/pesquisas.gs) na PLANILHA DE PESQUISAS
// (terceira planilha; só o dono edita). São opcionais: antes de instalar a pesquisa elas não existem.
export const ESQUEMA_PESQUISA = {
  pesquisa_config: ['chave', 'valor'],
  pesquisa_analise: ['resposta_id', 'data', 'identificacao', 'jogador_id', 'segmento', 'nota', 'sentimento', 'temas', 'resumo', 'citacao', 'status'],
  pesquisa_relatorio: ['gerado_em', 'tema', 'respostas', 'segmentos', 'dor', 'sugestao', 'esforco', 'impacto'],
};
