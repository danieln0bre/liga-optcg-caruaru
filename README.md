# Liga OPTCG Caruaru

Site de gestão da comunidade de One Piece Card Game de Caruaru: ranking público da liga, histórico de ligas com pódio, perfil dos jogadores e área de administração para lançar resultados e acompanhar os jogadores. Funciona sem servidor próprio: é uma página estática (GitHub Pages) que lê e grava em planilhas do Google.

```
Visitante  ──(CSV público, sem chave)───►  Planilha pública
Admin      ──(login Google, OAuth)───────►  Planilha pública (editor) + Planilha administrativa
```

Quem controla o acesso é o compartilhamento das planilhas. Mesmo que alguém encontre o endereço da área de administração, sem permissão nas planilhas todas as chamadas voltam com erro 403.

O projeto nasceu de uma cópia do **OPCGRanking** (Next.js + Supabase, ranking por MMR a partir do print do *Match History*). Daquele projeto vieram a estrutura de CSS e o tema escuro com destaque dourado (`css/estilo.css` usa os mesmos tokens e primitivas do `globals.css` dele: `.panel`, `.btn`, `.tbl`, `.chip`, `.status`, `.avatar`, `label.field`), a ideia e a técnica do OCR no navegador ancorado no Member Number e o modo demonstração; os dados dele não são reaproveitados. Matchups, MMR, Card Kaizoku, contestação de deck e lojas ficaram só no projeto original.

## O que funciona

**Público**
- Ranking da temporada ativa: pódio, tabela com pontos, torneios jogados, vitórias e os pontos de cada resultado, com os descartados esmaecidos, e o texto explicando pontuação e desempate.
- Ligas anteriores, com campeão, vice e 3º lugar em destaque e o restante da classificação abaixo.
- Perfil do jogador: foto, deck favorito, bio, desempenho na temporada atual e posição em cada liga encerrada.

**Administração**
- **Lançar torneio pelo print da tela Ranking do Bandai TCG+.** O administrador envia um ou mais prints (quando a lista não cabe numa tela), o texto é lido no próprio navegador e vira a classificação, com nome e Member Number de cada jogador. Depois vem a tela de conferência. Também é possível colar ou digitar a classificação.
- Conferência de nomes: cada linha é associada a um jogador pelo **Member Number** já conhecido, por nome exato, por apelido ou por semelhança, com o grau de confiança e a opção de criar um jogador novo. O mesmo jogador (ou o mesmo Member Number) não pode aparecer duas vezes. Ao confirmar, grafias diferentes viram apelidos e os Member Numbers novos são guardados.
- Anulação e reativação de torneios.
- Jogadores: busca, criação, edição de perfil e Member Number, e a ficha interna com presença na temporada e nos últimos torneios, posição atual, apelidos conhecidos e anotações internas.
- Temporadas: criação (inclusive já encerrada, para ligas antigas), encerramento que congela a classificação, reabertura e cadastro da classificação de ligas antigas no formato `Nome;pontos`.
- **Administradores**: liberar acesso de administrador digitando um e-mail (a pessoa vira editora das duas planilhas e recebe o convite do Google), ver quem tem acesso e remover. Usa a Google Drive API com a permissão pedida só nessa tela; quem autoriza é o Google, então só quem já é editor consegue liberar ou remover.
- **Painel**: jogadores ativos, média de participantes, novatos e quantos voltaram, participação por torneio separando estreantes, frequência na temporada, segmentos (frequentes, ocasionais, novatos, em risco), retenção por mês de estreia e lista de risco de evasão. A ficha de cada jogador mostra a evolução do percentil de colocação. Critérios em `CRITERIOS` (`js/domain/gestao.js`).
- **Pesquisas**: Google Form criado por um Apps Script na planilha administrativa; cada resposta é analisada pelo Claude (temas, sentimento, resumo) e um relatório diário cruza as dores com os segmentos e sugere ações. A tela mostra o link para compartilhar, NPS, sugestões, temas por segmento e as respostas. Ver "Pesquisa com os jogadores".
- Auditoria de todas as gravações e renovação silenciosa do token antes de gravar.

**Modo demonstração**: com `modo: 'demo'` em `js/config.js`, o site usa `data/demo.json` (dados fictícios), a administração entra sem login e as alterações ficam só no navegador, com botão para restaurar os dados de exemplo.

## Regras da liga

| Regra | Onde fica |
|---|---|
| Pontos por torneio = participantes − colocação + 1 | `pontosPorColocacao` |
| Participantes = resultados lançados no torneio (quem aparece na classificação final conta, inclusive drops) | `resultadosDaTemporada` |
| Pontuação = soma dos N melhores resultados (N por temporada, padrão 6) | `calcularRanking` |
| Desempate: mais vitórias → melhor colocação → maior soma de todos os resultados; empate total divide a posição | `DESEMPATE_PADRAO` |
| Torneio anulado não soma, mas continua registrado | `torneioValido` |
| Liga encerrada usa a classificação congelada antes do cálculo | `classificacaoFinal` |

Tudo em `js/domain/liga.js`: funções puras, sem rede nem DOM, com testes.

## Estrutura

```
index.html                 página única; rotas por #hash; Content Security Policy
css/estilo.css
js/
  app.js                   inicialização e rotas
  config.js                IDs das planilhas, client ID, modo demo/sheets
  domain/liga.js           regras da liga e associação de nomes (puro, testado)
  domain/print-ranking.js  interpretação do print do Ranking (puro, testado)
  ocr/leitor-print.js      OCR no navegador (Tesseract.js) → domain/print-ranking.js
  data/esquema.js          abas e colunas das planilhas
  data/sheets-api.js       chamadas REST à Google Sheets API
  data/repositorio.js      mesma interface para demo e Sheets
  auth/google.js           login com Google Identity Services (token só em memória)
  views/publico.js         ranking, histórico, perfil
  views/admin.js           administração
  ui/componentes.js        avatar, pódio etc.
  util/                    escape de HTML, normalização de texto, Member Number
vendor/tesseract/          Tesseract.js 5.1.1 + dados de inglês e português (servidos pelo site)
data/demo.json             dados fictícios do modo demonstração
docs/esquema-planilhas.md  descrição de cada aba e coluna
scripts/
  criar-abas.gs            cria abas e cabeçalhos nas planilhas (Apps Script)
  gerar-demo.mjs           gera data/demo.json
  servidor.mjs             servidor estático local, sem dependências
  apps-script/pesquisas.gs Google Form + análise das respostas com o Claude (roda no Google, não no site)
tests/                     regras, gestão, print, acessos, Apps Script e teste de fumaça
```

Não há etapa de build: são módulos ES carregados direto pelo navegador. A única dependência (`playwright-core`) é de desenvolvimento, para o teste de fumaça.

## Rodar localmente

Requer Node 20 ou superior.

```bash
npm run serve          # http://localhost:8080
```

Em modo demo, a administração entra sem login. Para testar a leitura de print, abra *Administração → Lançar torneio* e envie um print da tela *Ranking* de um evento no app Bandai TCG+.

## Testes

```bash
npm install            # só na primeira vez (playwright-core)
npm test
```

- `tests/liga.test.js`: regras da seção de pontuação, desempate, anulação, classificação congelada, classificação colada, associação por nome, apelido e Member Number.
- `tests/print-ranking.test.js`: leitura do print com posições ilegíveis, print rolado, junção de vários prints e posições faltando. Usa linhas sintéticas com a mesma geometria do OCR real, sem nomes ou números verdadeiros.
- `tests/fumaca.test.js`: abre as páginas públicas e a administração no modo demo, no Chrome instalado, e falha com qualquer erro no console. Sem Chrome, o teste é pulado; `NAVEGADOR=msedge npm test` usa o Edge.

O workflow `.github/workflows/testes.yml` roda os mesmos testes a cada push.

## Leitura do print do ranking

1. No app Bandai TCG+, o organizador abre o evento e a tela **Ranking** (classificação final).
2. Na administração, em *Lançar torneio*, envia o print (ou vários, se a lista não couber numa tela).
3. O texto é reconhecido **no navegador** com Tesseract.js. A imagem não sai do computador e não há custo de API.
4. Cada jogador é ancorado no Member Number de 10 dígitos. O nome é o texto logo acima do número e a posição é o número à esquerda. As posições do pódio ficam em círculos coloridos que o OCR costuma errar, então a posição é inferida pela ordem da tabela, e uma posição lida que contradiz a ordem gera aviso.
5. O resultado preenche a caixa de classificação (`1. nome (0000123456)`), que o administrador pode corrigir antes da conferência de nomes.

Com o print de exemplo do app (7 jogadores), a leitura acertou todos os nomes, posições e números em cerca de 2 s. Prints de outros aparelhos, outros idiomas do app e listas longas (vários prints) ainda precisam ser testados com casos reais.

## Member Number

O Member Number identifica o jogador mesmo que ele troque de nick no app, mas é um dado pessoal. Por isso fica **somente na planilha administrativa** (aba `numeros_membro`) e nunca aparece no site público. Se o mesmo número aparecer em mais de uma linha, vale a mais recente: é assim que se corrige uma associação errada sem apagar histórico.

## Configurar com o Google

### 1. Planilhas
1. Crie duas planilhas: **Liga OPTCG — pública** e **Liga OPTCG — administração**.
2. Em cada uma, abra *Extensões → Apps Script*, cole `scripts/criar-abas.gs` e execute uma vez `criarAbasPublicas` (na pública) ou `criarAbasAdmin` (na administrativa).
3. Compartilhamento:
   - Pública: *Qualquer pessoa com o link → Leitor*; administradores como *Editor*.
   - Administrativa: somente os administradores, como *Editor*.

   Uma alternativa prática é criar um Grupo do Google para os administradores e compartilhar as duas planilhas com ele. Para dar ou tirar acesso, basta mexer no grupo.
4. Anote o ID de cada planilha: é o trecho da URL entre `/d/` e `/edit`.

### 2. Google Cloud
1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto e ative a **Google Sheets API** e a **Google Drive API** (esta só para a tela Administradores).
2. *Tela de consentimento OAuth*: tipo **Externo**. Enquanto o app estiver em modo **Teste**, só entram as contas cadastradas como usuários de teste (até 100), o que basta para poucos administradores. O site não usa refresh tokens, então a expiração de 7 dias desse modo não afeta o login.
3. *Credenciais → Criar credenciais → ID do cliente OAuth*, tipo **Aplicativo da Web**. Em *Origens JavaScript autorizadas*:
   - `https://SEU-USUARIO.github.io`
   - `http://localhost:8080` (para testes locais)
Não é preciso criar chave de API. Os visitantes leem a planilha pública em CSV pelo endpoint `gviz/tq` do Google Sheets, que funciona para planilhas compartilhadas como "qualquer pessoa com o link" e responde com CORS. O site confere o cabeçalho de cada aba, porque esse endpoint devolve a primeira aba quando o nome não existe. O client ID fica visível no código, e isso é esperado: ele só funciona nas origens cadastradas.

### 3. `js/config.js`
Preencha os valores de `google` (`planilhaPesquisaId` é opcional: só para a aba Pesquisas) e troque `modo` para `'sheets'`. O teste de fumaça força o modo demo no navegador de teste, então continua valendo depois dessa troca.

## Publicar no GitHub Pages

1. Envie o projeto para um repositório no GitHub.
2. *Settings → Pages → Build and deployment*: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Não há build: o Pages serve os arquivos como estão. O `.nojekyll` evita o processamento pelo Jekyll. A pasta `vendor/tesseract` (cerca de 12 MB) só é baixada quando um administrador envia um print.

## Primeiro acesso de um administrador

Um administrador já ativo pode liberar outro em *Administração → Administradores* digitando o e-mail. Enquanto o login estiver em modo Teste no Google Cloud, o e-mail também precisa ser cadastrado como usuário de teste (a tela tem o link). Sem essa tela, o caminho é:


1. A pessoa entra em *Administração* e faz login com o Google.
2. Sem acesso às planilhas, o site mostra a tela de "acesso pendente" com os links das duas. Ela clica em "Solicitar acesso" em cada uma (a API do Drive não permite que o site envie essa solicitação).
3. O dono aprova pelo Drive (ou adiciona a pessoa ao grupo) e, se o app estiver em modo Teste, cadastra o e-mail como usuário de teste no Google Cloud.

## Pesquisa com os jogadores

O site não chama a IA: a chave da Anthropic fica nas propriedades de um Apps Script (`scripts/apps-script/pesquisas.gs`) ligado a uma **terceira planilha, "Liga OPTCG — pesquisas"**. Só o dono edita essa planilha; os outros administradores recebem acesso de **leitor** (a tela Administradores já faz isso). Quem só lê vê os resultados no site, mas não abre o editor de scripts, então não vê a chave. A planilha administrativa continua com todos os admins como editores, porque o login e o lançamento de torneios gravam nela.

1. Planilha de pesquisas → *Extensões → Apps Script*. Cole o script (a aba *Pesquisas* do site tem o botão "Copiar código do script").
2. *Configurações do projeto → Propriedades do script*: `ANTHROPIC_API_KEY` (crie em console.anthropic.com, de preferência numa chave exclusiva, num workspace com limite mensal de gasto), `PLANILHA_PUBLICA_ID` e `PLANILHA_ADMIN_ID`. Opcional: `MODELO` (padrão `claude-opus-5-5`; `claude-haiku-5-5` custa bem menos e costuma bastar para classificar respostas curtas).
3. Execute `configurarPesquisa` e autorize. Ele cria o formulário (respostas na própria planilha de pesquisas), as abas `pesquisa_config`, `pesquisa_analise` e `pesquisa_relatorio` e três gatilhos: análise a cada resposta, repescagem a cada 6 horas e relatório diário às 6h.

O que vai para a API: só os textos das respostas e o segmento do jogador. Nome, nick e Member Number ficam na planilha e servem apenas para descobrir o segmento. Cada resposta custa uma chamada curta (esforço baixo) e o relatório, uma chamada por dia. O Apps Script repete a lógica de segmentos de `js/domain/gestao.js`; `tests/apps-script.test.js` garante que as duas dão o mesmo resultado.

## Segurança

- Todo texto vindo das planilhas é escapado antes de ir para a página (`js/util/html.js`), e fotos só aceitam `https://`.
- Content Security Policy: scripts só do próprio site e de `accounts.google.com/gsi/client`. O OCR respeita a política: o Tesseract é servido de `vendor/`, o worker é carregado do próprio site (sem `blob:`) e a imagem é aberta com `createImageBitmap`.
- O token de acesso fica só na memória da aba e expira em cerca de 1 hora. A permissão do Drive (ampla, porque o Google não oferece uma limitada a dois arquivos criados fora do app) só é pedida na tela Administradores e usada só pelas chamadas de compartilhamento; nada vai para `localStorage` além dos dados do modo demo.
- Gravações releem a aba e localizam a linha pelo `id` antes de atualizar, e cada planilha é lida com uma única chamada `values:batchGet`.
- Nenhum segredo no repositório. Chaves de serviços de IA, se forem usadas no futuro, ficarão num Google Apps Script.

## Decisões pendentes

- **Desempate**: provisório (mais vitórias → melhor colocação → soma de todos os resultados). Ajuste em `DESEMPATE_PADRAO` (`js/domain/liga.js`); o texto da página de ranking acompanha a mudança.
- **Drops e atrasos**: hoje, quem aparece na classificação final conta como participante, seja colada ou lida do print. Falta confirmar com um evento real se o Ranking do Bandai TCG+ inclui quem deu drop; se não incluir, o administrador acrescenta essas linhas antes da conferência.

## Próximas etapas (fora desta fase)

1. Dashboards de gestão: retenção de novatos, risco de evasão, frequência por coorte, evolução por percentil de colocação.
2. Formulários de feedback (Google Forms) com classificação automática por tema e sugestões de ação.
3. Se o OCR local não der conta de prints de outros aparelhos, um Apps Script com modelo de visão pode substituir `js/ocr/leitor-print.js`, mantendo a mesma tela de conferência.
