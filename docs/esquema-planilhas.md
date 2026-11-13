# Esquema das planilhas

O sistema usa duas planilhas do Google. A separação existe porque a primeira é legível por qualquer pessoa (é ela que alimenta o site público) e a segunda contém informações internas.

Todas as células são gravadas como texto. A primeira linha de cada aba é o cabeçalho e precisa ter exatamente os nomes abaixo, na mesma ordem. O script `scripts/criar-abas.gs` cria tudo automaticamente.

## Planilha pública

Compartilhamento: **qualquer pessoa com o link → leitor**; administradores → **editor**.

### `jogadores`
| Coluna | Descrição |
|---|---|
| `id` | Identificador gerado pelo sistema (`j_...`). Nunca editar à mão. |
| `nome` | Nome exibido no site. |
| `foto_url` | Endereço `https://` de uma imagem. Outros protocolos são ignorados. |
| `deck_favorito` | Texto livre. |
| `bio` | Texto livre, até 280 caracteres pelo formulário. |
| `ativo` | `sim` ou `nao`. |
| `criado_em` | Data/hora ISO. |

### `temporadas`
| Coluna | Descrição |
|---|---|
| `id` | `t_...` |
| `nome` | Ex.: "Liga 2027 — 1º semestre". |
| `inicio`, `fim` | Datas `AAAA-MM-DD`. |
| `status` | `ativa` ou `encerrada`. O ranking público mostra a temporada ativa mais recente. |
| `melhores_resultados` | Quantos resultados contam na pontuação (hoje, 6). |

### `torneios`
| Coluna | Descrição |
|---|---|
| `id` | `tor_...` |
| `temporada_id` | Referência a `temporadas.id`. |
| `data` | `AAAA-MM-DD`. |
| `nome` | Ex.: "Local de 15/11". |
| `status` | `confirmado` ou `anulado`. Torneios anulados não somam pontos, mas continuam registrados. |
| `criado_por`, `criado_em` | Quem lançou e quando. |

### `resultados`
| Coluna | Descrição |
|---|---|
| `id` | `r_...` |
| `torneio_id` | Referência a `torneios.id`. |
| `jogador_id` | Referência a `jogadores.id`. |
| `colocacao` | 1 para o campeão. |

Os pontos não são gravados: o sistema calcula `participantes − colocação + 1`, em que o número de participantes é a quantidade de linhas do torneio nesta aba.

### `classificacao_historica`
Classificação final congelada de cada liga encerrada. É preenchida de duas formas: ao encerrar uma temporada pelo sistema, ou ao cadastrar manualmente o resultado de uma liga antiga.

| Coluna | Descrição |
|---|---|
| `temporada_id` | Referência a `temporadas.id`. |
| `posicao` | Posição final; empates repetem o número. |
| `jogador_id` | Referência a `jogadores.id`. |
| `pontos` | Pontuação final. |
| `observacao` | Livre. |

## Planilha administrativa

Compartilhamento: **somente administradores**, como editores. Nunca usar "qualquer pessoa com o link".

### `apelidos`
Grafias alternativas de cada jogador (`Bia F.`, `rafa_torres`). São criadas automaticamente quando, na conferência de um torneio, um nome diferente do cadastrado é associado a um jogador.

| `apelido` | `jogador_id` | `criado_por` | `criado_em` |
|---|---|---|---|

### `numeros_membro`
Member Number do Bandai TCG+ de cada jogador (10 dígitos, com zeros à esquerda). Fica **somente** nesta planilha: o número não aparece no site público. É gravado na conferência de um torneio lançado pelo print do ranking (ou digitado na ficha do jogador) e, a partir daí, identifica o jogador mesmo que ele troque de nick no app.

Se o mesmo número aparecer em mais de uma linha, vale a mais recente (`criado_em`). É assim que o sistema corrige uma associação errada sem apagar histórico.

| `member_number` | `jogador_id` | `criado_por` | `criado_em` |
|---|---|---|---|

### `notas_jogador`
Anotações internas da ficha do jogador.

| `id` | `jogador_id` | `data` | `autor` | `texto` |
|---|---|---|---|---|

### `auditoria`
Registro de toda gravação feita pelo sistema.

| `data` | `usuario` | `acao` | `detalhe` |
|---|---|---|---|

## Planilha de pesquisas

Compartilhamento: **somente o dono como editor**; os demais administradores como **leitores**. O Apps Script da pesquisa (com a chave da IA) fica nesta planilha, e quem só lê não consegue abrir o editor de scripts.

As abas abaixo só existem depois de executar `configurarPesquisa` em `scripts/apps-script/pesquisas.gs`. O site funciona sem elas.

| Aba | Colunas |
|---|---|
| `pesquisa_config` | `chave`, `valor` (link do formulário, link de edição, data do último relatório, NPS) |
| `pesquisa_analise` | `resposta_id`, `data`, `identificacao`, `jogador_id`, `segmento`, `nota`, `sentimento`, `temas`, `resumo`, `citacao`, `status` |
| `pesquisa_relatorio` | `gerado_em`, `tema`, `respostas`, `segmentos`, `dor`, `sugestao`, `esforco`, `impacto` (substituída a cada relatório) |

As respostas brutas ficam na aba que o Google Forms cria ao ligar o formulário à planilha.

## Edição manual

Corrigir dados direto na planilha é possível, com dois cuidados: não alterar a coluna `id` e não apagar linhas de `jogadores` que tenham resultados (o site passa a mostrar "Jogador j_..." no lugar do nome). Para indicar que alguém deixou de jogar, use `ativo = nao`; os resultados antigos continuam valendo.
