// Testa as funções puras do Apps Script de pesquisas (scripts/apps-script/pesquisas.gs) carregando o
// arquivo num contexto isolado do Node. As funções que dependem do Google (SpreadsheetApp, FormApp,
// UrlFetchApp) não são chamadas aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { segmentos, CRITERIOS } from '../js/domain/gestao.js';

const codigo = readFileSync(new URL('../scripts/apps-script/pesquisas.gs', import.meta.url), 'utf8');
const gs = vm.createContext({});
vm.runInContext(`${codigo}\n;globalThis.__exp = { segmentarJogadores_, interpretarRespostaClaude_, agregarAnalises_, montarRequisicaoClaude_, montarPromptResposta_, identificarJogador_, descreverGrade_, CRITERIOS_SEGMENTO, ESQUEMA_CLASSIFICACAO, TEMAS };`, gs);
const G = gs.__exp;
const demo = JSON.parse(readFileSync(new URL('../data/demo.json', import.meta.url), 'utf8'));

test('critérios de segmento iguais aos do site', () => {
  for (const chave of Object.keys(G.CRITERIOS_SEGMENTO)) assert.equal(G.CRITERIOS_SEGMENTO[chave], CRITERIOS[chave], chave);
});

test('segmentos do Apps Script batem com os do site (dados de demonstração)', () => {
  const doSite = Object.fromEntries(segmentos(demo));
  const doScript = G.segmentarJogadores_(demo.torneios, demo.resultados, G.CRITERIOS_SEGMENTO);
  assert.deepEqual({ ...doScript }, doSite);
  assert.ok(Object.values(doSite).includes('em_risco'), 'a demo precisa ter alguém em risco para o teste valer');
});

test('prompt da resposta não leva nome nem Member Number', () => {
  const prompt = G.montarPromptResposta_({ identificacao: 'Fulano da Silva', memberNumber: '0000123456', nota: 7, atrapalha: 'horário ruim' }, 'novato');
  assert.ok(!prompt.includes('Fulano'));
  assert.ok(!prompt.includes('0000123456'));
  assert.match(prompt, /novato/);
  assert.match(prompt, /horário ruim/);
});

test('requisição para a API: modelo padrão, esforço, formato JSON e fallback', () => {
  const corpo = G.montarRequisicaoClaude_('sistema', 'texto', G.ESQUEMA_CLASSIFICACAO, 'low', null);
  assert.equal(corpo.model, 'claude-opus-5-5');
  assert.equal(corpo.output_config.effort, 'low');
  assert.equal(corpo.output_config.format.type, 'json_schema');
  assert.equal(corpo.fallbacks, 'default');
  assert.ok(!('thinking' in corpo) && !('temperature' in corpo));
  const haiku = G.montarRequisicaoClaude_('s', 't', {}, 'low', 'claude-haiku-5-5');
  assert.equal(haiku.model, 'claude-haiku-5-5');
  assert.ok(!('fallbacks' in haiku), 'Haiku não tem fallback no servidor');
});

test('interpreta a resposta da API e trata recusa e erro HTTP', () => {
  const ok = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"sentimento":"negativo","temas":["horario"],"resumo":"x","citacao":""}' }] });
  assert.deepEqual([...G.interpretarRespostaClaude_(200, ok).temas], ['horario']);
  assert.throws(() => G.interpretarRespostaClaude_(200, JSON.stringify({ stop_reason: 'refusal', content: [] })), /recusada/);
  assert.throws(() => G.interpretarRespostaClaude_(401, JSON.stringify({ error: { message: 'invalid x-api-key' } })), /401/);
  assert.throws(() => G.interpretarRespostaClaude_(200, JSON.stringify({ stop_reason: 'max_tokens', content: [] })), /cortada/);
});

test('agrega temas por segmento e calcula NPS', () => {
  const ag = G.agregarAnalises_([
    { status: 'ok', nota: '10', segmento: 'novato', temas: 'horario,novatos_aprendizado', resumo: 'a' },
    { status: 'ok', nota: '5', segmento: 'em_risco', temas: 'horario', resumo: 'b' },
    { status: 'ok', nota: '8', segmento: 'frequente', temas: '', resumo: '' },
    { status: 'erro: x', nota: '0', segmento: 'novato', temas: 'custo', resumo: 'c' },
  ]);
  assert.equal(ag.total, 3);
  assert.equal(ag.nps, 0); // 1 promotor, 1 detrator, 3 notas
  assert.equal(ag.temas[0].tema, 'horario');
  assert.deepEqual({ ...ag.temas[0].segmentos }, { novato: 1, em_risco: 1 });
});

test('identifica jogador por Member Number e depois por nome sem acento', () => {
  const ctx = { numeros: { '0000000001': 'j_01' }, jogadores: [{ id: 'j_02', nome: 'Júlia Nunes' }] };
  assert.equal(G.identificarJogador_('qualquer', '0000000001', ctx), 'j_01');
  assert.equal(G.identificarJogador_('julia nunes', '', ctx), 'j_02');
  assert.equal(G.identificarJogador_('', '', ctx), '');
});

test('pergunta de horários: grade por evento vira texto para a análise', () => {
  const texto = G.descreverGrade_(['Sábado de manhã', 'Domingo de manhã', 'Freeplay segunda'], ['Agrada', null, 'Não consigo ir']);
  assert.equal(texto, 'Sábado de manhã → Agrada; Domingo de manhã → sem resposta; Freeplay segunda → Não consigo ir');
  const prompt = G.montarPromptResposta_({ nota: 8, horarios: texto, horarioIdeal: 'sábado à tarde' }, 'frequente');
  assert.match(prompt, /agradam\? Sábado de manhã → Agrada/);
  assert.match(prompt, /funcionaria melhor: sábado à tarde/);
});
