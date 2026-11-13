// Configuração do site. Nenhum valor aqui é secreto: tudo fica visível no navegador.
// A proteção dos dados vem do compartilhamento das planilhas no Google, não deste arquivo.

export const CONFIG = {
  // 'demo'  → usa data/demo.json e grava só no navegador (para testar sem configurar o Google).
  // 'sheets' → lê e grava nas planilhas do Google.
  modo: 'sheets',

  nomeComunidade: 'Liga OPTCG Caruaru',
  descricao: 'Comunidade de One Piece Card Game de Caruaru',

  google: {
    // Planilha pública: compartilhada como "Qualquer pessoa com o link: leitor"; admins como editores.
    planilhaPublicaId: '1k4ben262GgsXB-O1SOy4xI9VOJAkk8jYit7iVtnXM20',
    // Planilha administrativa: compartilhada SOMENTE com os administradores.
    planilhaAdminId: '1xkVt7t2qSIaCdK8bimNMUVXTi5RPzSkgQz83RghPgUM',
    // Planilha de pesquisas: o dono é o único editor (o Apps Script com a chave da IA fica nela);
    // os demais administradores são leitores. Vazio = aba Pesquisas mostra as instruções.
    planilhaPesquisaId: '1rUGXijyr-Q6Mkzb8KjEuzWZ6c0tK2Si-ZZHKTgwPNpE',
    // Chave de API restrita ao domínio do site e à Google Sheets API (só leitura pública).
    apiKey: 'AIzaSyB6zYqc2qAaZjPcUZxJsk4Xa2C0-hWin1c',
    // ID do cliente OAuth do tipo "Aplicativo da Web".
    // Projeto no Google Cloud (só para o link de "usuários de teste" na tela Administradores).
    projetoCloud: 'liga-optcg-caruaru',
    oauthClientId: '763568378352-glqmbqvhfv8k3kma532fjp68a0s9tb8a.apps.googleusercontent.com',
  },

  liga: {
    // Valor padrão; cada temporada pode definir o seu na coluna melhores_resultados.
    melhoresResultados: 6,
  },
};
