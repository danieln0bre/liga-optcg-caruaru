/**
 * Cria as abas e os cabeçalhos das planilhas da liga.
 *
 * Uso: abra a planilha no Google Sheets → Extensões → Apps Script, cole este arquivo,
 * salve e execute UMA vez a função correspondente:
 *   - criarAbasPublicas  → na planilha pública
 *   - criarAbasAdmin     → na planilha administrativa
 *
 * Mantenha os cabeçalhos iguais a js/data/esquema.js.
 */

const ESQUEMA_PUBLICO = {
  jogadores: ['id', 'nome', 'foto_url', 'deck_favorito', 'bio', 'ativo', 'criado_em'],
  temporadas: ['id', 'nome', 'inicio', 'fim', 'status', 'melhores_resultados'],
  torneios: ['id', 'temporada_id', 'data', 'nome', 'status', 'criado_por', 'criado_em'],
  resultados: ['id', 'torneio_id', 'jogador_id', 'colocacao'],
  classificacao_historica: ['temporada_id', 'posicao', 'jogador_id', 'pontos', 'observacao'],
};

const ESQUEMA_ADMIN = {
  apelidos: ['apelido', 'jogador_id', 'criado_por', 'criado_em'],
  // Member Number do Bandai TCG+ (10 dígitos). Fica só na planilha administrativa.
  numeros_membro: ['member_number', 'jogador_id', 'criado_por', 'criado_em'],
  notas_jogador: ['id', 'jogador_id', 'data', 'autor', 'texto'],
  auditoria: ['data', 'usuario', 'acao', 'detalhe'],
};

function criarAbasPublicas() {
  criarAbas_(ESQUEMA_PUBLICO);
}

function criarAbasAdmin() {
  criarAbas_(ESQUEMA_ADMIN);
}

function criarAbas_(esquema) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const padrao = planilha.getSheets()[0];
  const nomePadrao = padrao.getName();

  Object.keys(esquema).forEach(function (nome) {
    const colunas = esquema[nome];
    const aba = planilha.getSheetByName(nome) || planilha.insertSheet(nome);
    aba.getRange('A:Z').setNumberFormat('@'); // texto puro: o Sheets não converte datas e números
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight('bold');
    aba.setFrozenRows(1);
  });

  // Remove a aba inicial vazia ("Página1"/"Sheet1"), se não fizer parte do esquema.
  if (!esquema[nomePadrao] && padrao.getLastRow() === 0) {
    planilha.deleteSheet(padrao);
  }
}
