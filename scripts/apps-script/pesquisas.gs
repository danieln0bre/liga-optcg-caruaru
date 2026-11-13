/**
 * Pesquisa com os jogadores: Google Form + análise das respostas com o Claude.
 *
 * Instalação (uma vez), na PLANILHA DE PESQUISAS: Extensões → Apps Script → cole este arquivo.
 * Essa planilha tem só você como editor; os outros administradores são leitores. Quem só lê não
 * abre o editor de scripts, então só você vê a chave da API.
 *   1. Configurações do projeto → Propriedades do script → adicione:
 *        ANTHROPIC_API_KEY   = sua chave da API da Anthropic (fica só aqui, nunca no site)
 *        PLANILHA_PUBLICA_ID = ID da planilha pública (torneios e resultados, para o segmento)
 *        PLANILHA_ADMIN_ID   = ID da planilha administrativa (Member Numbers, para identificar o jogador)
 *      Opcional: MODELO (padrão claude-opus-5-5; ex.: claude-haiku-5-5 para gastar menos).
 *   2. Execute configurarPesquisa() e autorize. Ele cria o formulário, as abas pesquisa_* e os gatilhos.
 *   3. O link para compartilhar aparece na aba "Pesquisas" do site (e no registro de execução).
 *
 * Privacidade: para a API vão só os textos das respostas e o segmento do jogador. Nome, nick e
 * Member Number ficam apenas nas planilhas da liga (usados para identificar o jogador).
 *
 * Os segmentos seguem js/domain/gestao.js (CRITERIOS). Mantenha os dois iguais; o teste
 * tests/apps-script.test.js compara as duas implementações.
 */

const ABAS_PESQUISA = {
  pesquisa_config: ['chave', 'valor'],
  pesquisa_analise: ['resposta_id', 'data', 'identificacao', 'jogador_id', 'segmento', 'nota', 'sentimento', 'temas', 'resumo', 'citacao', 'status'],
  pesquisa_relatorio: ['gerado_em', 'tema', 'respostas', 'segmentos', 'dor', 'sugestao', 'esforco', 'impacto'],
};

const TEMAS = ['horario', 'local_estrutura', 'formato_torneio', 'premiacao', 'ambiente_comunidade', 'novatos_aprendizado', 'custo', 'comunicacao', 'regras_arbitragem', 'metagame_decks', 'outro'];

const CRITERIOS_SEGMENTO = {
  janelaRisco: 4,
  minPresencasRisco: 3,
  taxaMinRisco: 0.5,
  maxPresencasNovato: 2,
  taxaFrequente: 0.5,
  janelaFrequente: 8,
};

// Eventos fixos da liga (linhas da pergunta sobre horários). Ajuste aqui se a agenda mudar
// e rode atualizarPerguntasHorario() para refazer a pergunta no formulário.
const EVENTOS = ['Torneio semanal: sábado de manhã', 'Torneio de domingo de manhã (quando tem)', 'Freeplay: segunda à noite, no Sushi'];
const OPCOES_HORARIO = ['Agrada', 'Mais ou menos', 'Não consigo ir'];
const TITULO_HORARIO_ANTIGO = 'Quais horários funcionam melhor para você?';

const PERGUNTAS = {
  identificacao: 'Seu nick no Bandai TCG+ ou nome (opcional)',
  memberNumber: 'Member Number do Bandai TCG+ (opcional, 10 dígitos)',
  tempo: 'Há quanto tempo você joga One Piece Card Game?',
  frequencia: 'Com que frequência você vai aos torneios da liga?',
  nota: 'De 0 a 10, quanto você recomendaria a liga a um amigo?',
  gosta: 'O que você mais gosta na liga?',
  atrapalha: 'O que mais atrapalha ou desanima você a jogar?',
  faria: 'O que faria você ir a mais torneios?',
  horarios: 'Os horários dos torneios agradam você?',
  horarioIdeal: 'Se algum horário não funciona para você, qual funcionaria melhor? (opcional)',
  extra: 'Quer dizer mais alguma coisa?',
};

/* ===================== Instalação ===================== */

function configurarPesquisa() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  criarAbasPesquisa_(planilha);
  const props = PropertiesService.getScriptProperties();
  let form;
  const existente = props.getProperty('FORM_ID');
  if (existente) {
    form = FormApp.openById(existente);
  } else {
    form = FormApp.create('Pesquisa da comunidade — Liga OPTCG Caruaru');
    form.setDescription('Leva 3 minutos. As respostas ajudam a organização a melhorar a liga. Identificação é opcional.');
    form.setCollectEmail(false);
    form.addTextItem().setTitle(PERGUNTAS.identificacao);
    form.addTextItem().setTitle(PERGUNTAS.memberNumber)
      .setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\d{10}$').setHelpText('Use os 10 dígitos, ex.: 0000123456').build());
    form.addMultipleChoiceItem().setTitle(PERGUNTAS.tempo).setChoiceValues(['Menos de 3 meses', 'De 3 a 12 meses', 'Mais de 1 ano']).setRequired(true);
    form.addMultipleChoiceItem().setTitle(PERGUNTAS.frequencia).setChoiceValues(['Quase todos', 'Mais ou menos metade', 'Raramente', 'Ainda não fui']).setRequired(true);
    form.addScaleItem().setTitle(PERGUNTAS.nota).setBounds(0, 10).setLabels('Nada provável', 'Muito provável').setRequired(true);
    form.addParagraphTextItem().setTitle(PERGUNTAS.gosta);
    form.addParagraphTextItem().setTitle(PERGUNTAS.atrapalha);
    form.addParagraphTextItem().setTitle(PERGUNTAS.faria);
    adicionarPerguntasHorario_(form);
    form.addParagraphTextItem().setTitle(PERGUNTAS.extra);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, planilha.getId());
    props.setProperty('FORM_ID', form.getId());
  }
  gravarConfig_(planilha, {
    url_formulario: form.getPublishedUrl(),
    url_edicao: form.getEditUrl(),
    configurado_em: new Date().toISOString(),
  });

  ScriptApp.getProjectTriggers().forEach((g) => ScriptApp.deleteTrigger(g));
  ScriptApp.newTrigger('aoResponder').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('analisarPendentes').timeBased().everyHours(6).create(); // repescagem de falhas
  ScriptApp.newTrigger('gerarRelatorio').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Formulário: ' + form.getPublishedUrl());
}

function adicionarPerguntasHorario_(form) {
  const grade = form.addGridItem().setTitle(PERGUNTAS.horarios).setRows(EVENTOS).setColumns(OPCOES_HORARIO);
  const texto = form.addParagraphTextItem().setTitle(PERGUNTAS.horarioIdeal);
  return [grade, texto];
}

/**
 * Troca a pergunta antiga de horários (ou a atual, se a agenda mudou) pela grade com os eventos
 * da liga, na mesma posição do formulário. Pode ser executada mais de uma vez.
 */
function atualizarPerguntasHorario() {
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
  const titulos = [TITULO_HORARIO_ANTIGO, PERGUNTAS.horarios, PERGUNTAS.horarioIdeal];
  let posicao = -1;
  form.getItems().filter((it) => titulos.indexOf(it.getTitle()) >= 0).forEach((it) => {
    if (posicao < 0) posicao = it.getIndex();
    form.deleteItem(it);
  });
  const novas = adicionarPerguntasHorario_(form);
  // moveItem só aceita Item genérico ou índices; GridItem/ParagraphTextItem vão pelo índice.
  if (posicao >= 0) novas.forEach((it, k) => form.moveItem(it.getIndex(), posicao + k));
  Logger.log('Pergunta de horários atualizada: ' + EVENTOS.join(' | '));
}

function criarAbasPesquisa_(planilha) {
  Object.keys(ABAS_PESQUISA).forEach((nome) => {
    const colunas = ABAS_PESQUISA[nome];
    const aba = planilha.getSheetByName(nome) || planilha.insertSheet(nome);
    aba.getRange('A:Z').setNumberFormat('@');
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight('bold');
    aba.setFrozenRows(1);
  });
}

function gravarConfig_(planilha, valores) {
  const aba = planilha.getSheetByName('pesquisa_config');
  const atuais = linhasComoObjetos_(aba);
  Object.keys(valores).forEach((chave) => {
    const i = atuais.findIndex((l) => l.chave === chave);
    if (i >= 0) aba.getRange(i + 2, 2).setValue(String(valores[chave]));
    else aba.appendRow([chave, String(valores[chave])]);
  });
}

/* ===================== Análise de cada resposta ===================== */

function aoResponder() {
  analisarPendentes();
}

function analisarPendentes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
    const aba = planilha.getSheetByName('pesquisa_analise');
    const analisadas = linhasComoObjetos_(aba);
    const feitas = new Set(analisadas.filter((l) => l.status === 'ok').map((l) => l.resposta_id));
    const contexto = carregarContextoJogadores_();

    form.getResponses().forEach((resposta) => {
      const id = resposta.getId();
      if (feitas.has(id)) return;
      const r = respostaComoObjeto_(resposta);
      const jogadorId = identificarJogador_(r.identificacao, r.memberNumber, contexto);
      const segmento = jogadorId ? contexto.segmentos[jogadorId] || 'desconhecido' : 'desconhecido';
      let analise;
      try {
        analise = classificarResposta_(r, segmento);
      } catch (e) {
        analise = { sentimento: '', temas: [], resumo: '', citacao: '', status: 'erro: ' + String(e.message || e).slice(0, 200) };
      }
      const linha = [id, resposta.getTimestamp().toISOString(), r.identificacao, jogadorId || '', segmento, String(r.nota),
        analise.sentimento, (analise.temas || []).join(','), analise.resumo, analise.citacao, analise.status || 'ok'];
      const existente = analisadas.findIndex((l) => l.resposta_id === id);
      if (existente >= 0) aba.getRange(existente + 2, 1, 1, linha.length).setValues([linha]);
      else aba.appendRow(linha);
    });
  } finally {
    lock.releaseLock();
  }
}

function respostaComoObjeto_(resposta) {
  const porTitulo = {};
  resposta.getItemResponses().forEach((ir) => {
    const item = ir.getItem();
    porTitulo[item.getTitle()] = item.getType() === FormApp.ItemType.GRID
      ? descreverGrade_(item.asGridItem().getRows(), ir.getResponse())
      : ir.getResponse();
  });
  const pegar = (k) => {
    const v = porTitulo[PERGUNTAS[k]];
    return Array.isArray(v) ? v.join(', ') : (v || '');
  };
  return {
    identificacao: String(pegar('identificacao')).trim(),
    memberNumber: String(pegar('memberNumber')).replace(/\D/g, ''),
    tempo: pegar('tempo'),
    frequencia: pegar('frequencia'),
    nota: Number(pegar('nota')),
    gosta: pegar('gosta'),
    atrapalha: pegar('atrapalha'),
    faria: pegar('faria'),
    horarios: pegar('horarios'),
    horarioIdeal: pegar('horarioIdeal'),
    extra: pegar('extra'),
  };
}

/** Grade "evento × opção" em texto: "Torneio semanal: Agrada; Freeplay: Não consigo ir". */
function descreverGrade_(linhas, respostas) {
  return linhas.map((l, i) => l + ' → ' + ((respostas || [])[i] || 'sem resposta')).join('; ');
}

/** Só o conteúdo da resposta e o segmento: nada que identifique a pessoa. */
function montarPromptResposta_(r, segmento) {
  return [
    'Resposta de um jogador à pesquisa da liga local de One Piece Card Game.',
    'Segmento do jogador: ' + segmento + '.',
    'Joga há: ' + (r.tempo || 'não informado') + '. Frequência declarada: ' + (r.frequencia || 'não informada') + '.',
    'Nota de recomendação (0 a 10): ' + r.nota + '.',
    'O que mais gosta: ' + (r.gosta || '-'),
    'O que atrapalha ou desanima: ' + (r.atrapalha || '-'),
    'O que faria ir a mais torneios: ' + (r.faria || '-'),
    'Os horários dos torneios agradam? ' + (r.horarios || '-'),
    'Horário que funcionaria melhor: ' + (r.horarioIdeal || '-'),
    'Comentário livre: ' + (r.extra || '-'),
  ].join('\n');
}

const SISTEMA_CLASSIFICACAO =
  'Você ajuda a organização de uma liga local de One Piece Card Game a entender o feedback dos jogadores. ' +
  'Classifique a resposta: sentimento geral, até 3 temas das dores ou pedidos (use "outro" só se nenhum servir), ' +
  'um resumo objetivo em português de até 25 palavras focado no que a pessoa precisa, e uma citação curta e literal ' +
  'da resposta que melhor represente a dor principal (vazia se não houver). Não invente o que não foi dito. ' +
  'Remova da citação qualquer nome próprio de pessoa.';

const ESQUEMA_CLASSIFICACAO = {
  type: 'object',
  properties: {
    sentimento: { type: 'string', enum: ['positivo', 'neutro', 'negativo', 'misto'] },
    temas: { type: 'array', items: { type: 'string', enum: TEMAS } },
    resumo: { type: 'string' },
    citacao: { type: 'string' },
  },
  required: ['sentimento', 'temas', 'resumo', 'citacao'],
  additionalProperties: false,
};

function classificarResposta_(r, segmento) {
  const json = chamarClaude_(SISTEMA_CLASSIFICACAO, montarPromptResposta_(r, segmento), ESQUEMA_CLASSIFICACAO, 'low');
  return { sentimento: json.sentimento, temas: (json.temas || []).slice(0, 3), resumo: json.resumo, citacao: json.citacao, status: 'ok' };
}

/* ===================== Relatório: dores por tema × segmento e sugestões ===================== */

/** Agrega as análises (função pura). */
function agregarAnalises_(linhas) {
  const ok = linhas.filter((l) => l.status === 'ok');
  const notas = ok.map((l) => Number(l.nota)).filter((n) => !isNaN(n));
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  const porTema = {};
  ok.forEach((l) => {
    String(l.temas || '').split(',').filter(Boolean).forEach((tema) => {
      porTema[tema] = porTema[tema] || { tema: tema, respostas: 0, segmentos: {}, resumos: [] };
      porTema[tema].respostas++;
      porTema[tema].segmentos[l.segmento] = (porTema[tema].segmentos[l.segmento] || 0) + 1;
      if (porTema[tema].resumos.length < 15 && l.resumo) porTema[tema].resumos.push('[' + l.segmento + '] ' + l.resumo);
    });
  });
  return {
    total: ok.length,
    nps: notas.length ? Math.round(((promotores - detratores) / notas.length) * 100) : null,
    temas: Object.keys(porTema).map((k) => porTema[k]).sort((a, b) => b.respostas - a.respostas),
  };
}

const SISTEMA_RELATORIO =
  'Você assessora a organização de uma liga local de One Piece Card Game (cidade do interior, torneios semanais em loja, ' +
  'pontuação acumulada por temporada). A partir das dores agregadas por tema e por segmento de jogadores ' +
  '(frequente, ocasional, novato, em_risco, desconhecido), descreva cada dor relevante e proponha ações concretas, ' +
  'baratas e viáveis para organizadores voluntários. Priorize o que afeta novatos e jogadores em risco de evasão. ' +
  'Não invente números: use só os dados recebidos. Responda em português.';

const ESQUEMA_RELATORIO = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tema: { type: 'string', enum: TEMAS },
          dor: { type: 'string' },
          segmentos: { type: 'string' },
          sugestao: { type: 'string' },
          esforco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
          impacto: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
        },
        required: ['tema', 'dor', 'segmentos', 'sugestao', 'esforco', 'impacto'],
        additionalProperties: false,
      },
    },
  },
  required: ['itens'],
  additionalProperties: false,
};

function montarPromptRelatorio_(agregado) {
  const blocos = agregado.temas.map((t) =>
    '## Tema: ' + t.tema + ' (' + t.respostas + ' respostas)\nPor segmento: ' + JSON.stringify(t.segmentos) + '\nResumos:\n- ' + t.resumos.join('\n- '));
  return 'Total de respostas analisadas: ' + agregado.total + '. NPS: ' + agregado.nps + '.\n\n' + blocos.join('\n\n') +
    '\n\nPara cada tema com pelo menos uma resposta, descreva a dor e dê de 1 a 3 sugestões (uma por item).';
}

function gerarRelatorio() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const agregado = agregarAnalises_(linhasComoObjetos_(planilha.getSheetByName('pesquisa_analise')));
  if (!agregado.total) return;
  const json = chamarClaude_(SISTEMA_RELATORIO, montarPromptRelatorio_(agregado), ESQUEMA_RELATORIO, 'medium');
  const contagem = {};
  agregado.temas.forEach((t) => { contagem[t.tema] = t.respostas; });
  const agora = new Date().toISOString();
  const linhas = (json.itens || []).map((i) => [agora, i.tema, String(contagem[i.tema] || 0), i.segmentos, i.dor, i.sugestao, i.esforco, i.impacto]);
  const aba = planilha.getSheetByName('pesquisa_relatorio');
  if (aba.getLastRow() > 1) aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).clearContent();
  if (linhas.length) aba.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
  gravarConfig_(planilha, { relatorio_em: agora, nps: agregado.nps === null ? '' : agregado.nps });
}

/* ===================== Claude (HTTP: o Apps Script não tem SDK oficial) ===================== */

function chamarClaude_(sistema, texto, esquema, esforco) {
  const props = PropertiesService.getScriptProperties();
  const chave = props.getProperty('ANTHROPIC_API_KEY');
  if (!chave) throw new Error('Defina ANTHROPIC_API_KEY nas propriedades do script.');
  const corpo = montarRequisicaoClaude_(sistema, texto, esquema, esforco, props.getProperty('MODELO'));
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': chave,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });
  return interpretarRespostaClaude_(resp.getResponseCode(), resp.getContentText());
}

function montarRequisicaoClaude_(sistema, texto, esquema, esforco, modelo) {
  const m = modelo || 'claude-opus-5-5';
  const corpo = {
    model: m,
    max_tokens: 16000,
    system: sistema,
    output_config: { effort: esforco, format: { type: 'json_schema', schema: esquema } },
    messages: [{ role: 'user', content: texto }],
  };
  // Se um classificador de segurança recusar, a própria API tenta de novo num modelo alternativo.
  if (/^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/.test(m)) corpo.fallbacks = 'default';
  return corpo;
}

/** Valida a resposta HTTP e devolve o JSON estruturado (função pura). */
function interpretarRespostaClaude_(status, texto) {
  let json;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error('Resposta inválida da API (HTTP ' + status + ')');
  }
  if (status !== 200) throw new Error('API ' + status + ': ' + ((json.error && json.error.message) || texto).slice(0, 200));
  if (json.stop_reason === 'refusal') throw new Error('A análise foi recusada pelo modelo.');
  if (json.stop_reason === 'max_tokens') throw new Error('Resposta cortada (max_tokens).');
  const bloco = (json.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem texto.');
  return JSON.parse(bloco.text);
}

/* ===================== Jogadores: identificação e segmento ===================== */

function carregarContextoJogadores_() {
  const props = PropertiesService.getScriptProperties();
  const idPublica = props.getProperty('PLANILHA_PUBLICA_ID');
  const vazio = { jogadores: [], numeros: {}, segmentos: {} };
  if (!idPublica) return vazio;
  const publica = SpreadsheetApp.openById(idPublica);
  const jogadores = linhasComoObjetos_(publica.getSheetByName('jogadores'));
  const torneios = linhasComoObjetos_(publica.getSheetByName('torneios'));
  const resultados = linhasComoObjetos_(publica.getSheetByName('resultados'));
  const numeros = {};
  const idAdmin = props.getProperty('PLANILHA_ADMIN_ID');
  const abaNumeros = idAdmin ? SpreadsheetApp.openById(idAdmin).getSheetByName('numeros_membro') : null;
  linhasComoObjetos_(abaNumeros)
    .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
    .forEach((n) => { numeros[String(n.member_number)] = n.jogador_id; });
  return { jogadores: jogadores, numeros: numeros, segmentos: segmentarJogadores_(torneios, resultados, CRITERIOS_SEGMENTO) };
}

function normalizarTexto_(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Member Number tem prioridade; depois nome exato (sem acento e maiúsculas). */
function identificarJogador_(identificacao, memberNumber, contexto) {
  if (memberNumber && contexto.numeros[memberNumber]) return contexto.numeros[memberNumber];
  const alvo = normalizarTexto_(identificacao);
  if (!alvo) return '';
  const j = contexto.jogadores.find((x) => normalizarTexto_(x.nome) === alvo);
  return j ? j.id : '';
}

/** Mesmo critério de segmentos() em js/domain/gestao.js (função pura). */
function segmentarJogadores_(torneios, resultados, c) {
  const lista = torneios
    .filter((t) => String(t.status || 'confirmado') !== 'anulado')
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  const indice = {};
  lista.forEach((t, i) => { indice[t.id] = i; });
  const presencas = {};
  resultados.forEach((r) => {
    const i = indice[r.torneio_id];
    if (i === undefined) return;
    (presencas[r.jogador_id] = presencas[r.jogador_id] || {})[i] = true;
  });
  const total = lista.length;
  const corte = total - c.janelaRisco;
  const inicioJanela = Math.max(0, total - c.janelaFrequente);
  const tamanhoJanela = total - inicioJanela;
  const saida = {};
  Object.keys(presencas).forEach((jogadorId) => {
    const idx = Object.keys(presencas[jogadorId]).map(Number);
    let risco = false;
    if (total > c.janelaRisco) {
      const antigas = idx.filter((i) => i < corte);
      const primeiro = Math.min.apply(null, idx);
      const taxa = antigas.length / Math.max(1, corte - primeiro);
      risco = antigas.length >= c.minPresencasRisco && idx.length === antigas.length && taxa >= c.taxaMinRisco;
    }
    if (risco) saida[jogadorId] = 'em_risco';
    else if (idx.length <= c.maxPresencasNovato) saida[jogadorId] = 'novato';
    else if (idx.filter((i) => i >= inicioJanela).length / Math.max(1, tamanhoJanela) >= c.taxaFrequente) saida[jogadorId] = 'frequente';
    else saida[jogadorId] = 'ocasional';
  });
  return saida;
}

/* ===================== Utilitários ===================== */

function linhasComoObjetos_(aba) {
  if (!aba || aba.getLastRow() < 2) return [];
  const valores = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getDisplayValues();
  const cabecalho = valores[0];
  return valores.slice(1)
    .filter((l) => l.some((v) => String(v).trim() !== ''))
    .map((l) => {
      const o = {};
      cabecalho.forEach((c, i) => { o[c] = l[i]; });
      return o;
    });
}
