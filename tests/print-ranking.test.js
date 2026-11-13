import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarPrintRanking, juntarPrints, classificacaoComoTexto, extrairMemberNumber } from '../js/domain/print-ranking.js';
import { interpretarClassificacaoColada } from '../js/domain/liga.js';

// Monta linhas no mesmo formato e geometria que o Tesseract devolve para a tela "Ranking" do
// Bandai TCG+ (print de celular, 738 px de largura). Nomes e números são fictícios.
function palavra(texto, x0, y0, largura = texto.length * 11, altura = 22) {
  return { texto, x0, y0, x1: x0 + largura, y1: y0 + altura };
}
function linha(palavras) {
  return {
    texto: palavras.map((p) => p.texto).join(' '),
    x0: Math.min(...palavras.map((p) => p.x0)),
    y0: Math.min(...palavras.map((p) => p.y0)),
    x1: Math.max(...palavras.map((p) => p.x1)),
    y1: Math.max(...palavras.map((p) => p.y1)),
    palavras,
  };
}
/** rows: [[textoDaPosicao, nome, memberNumber]] na ordem da tela. */
function print(rows, { cabecalho = true } = {}) {
  const linhas = [linha([palavra('12:02', 40, 22), palavra('99%', 620, 22)])];
  if (cabecalho) linhas.push(linha([palavra('Ranki', 38, 316), palavra('User', 240, 316), palavra('Name', 290, 316), palavra('Win', 520, 316), palavra('OMW%', 600, 316)]));
  rows.forEach(([pos, nome, numero], i) => {
    const y = 426 + i * 118;
    let x = 122;
    linhas.push(linha(nome.split(' ').map((t) => {
      const p = palavra(t, x, y);
      x = p.x1 + 8;
      return p;
    })));
    linhas.push(linha([...(pos ? [palavra(pos, 64, y + 6, 14)] : []), palavra('9', 540, y + 6, 12), palavra('66.7%', 605, y + 6, 70)]));
    linhas.push(linha([palavra('Member', 122, y + 45, 80), palavra('Number', 208, y + 45, 80), palavra(numero, 294, y + 45, 116)]));
  });
  linhas.push(linha([palavra('Home', 45, 1413), palavra('Decks', 488, 1413)]));
  return linhas;
}

const N = (i) => String(1000 + i).padStart(10, '0');
const SETE = [
  ['O', 'joao', N(1)],
  ['', 'lil Puu #Rafa', N(2)],
  ['®', 'Nami Y', N(3)],
  ['4', 'Alê Souza', N(4)],
  ['5', 'Lucas lima', N(5)],
  ['6', 'GabC', N(6)],
  ['7', 'Alex', N(7)],
];

test('lê nome, posição e Member Number de um print completo', () => {
  const { jogadores, avisos } = interpretarPrintRanking(print(SETE));
  assert.deepEqual(
    jogadores.map((j) => [j.colocacao, j.nome, j.memberNumber]),
    SETE.map(([, nome, numero], i) => [i + 1, nome, numero]),
  );
  // As posições 1–3 ficam em círculos coloridos e o OCR erra; a ordem da tabela resolve sem aviso.
  assert.deepEqual(avisos, []);
});

test('print rolado começa na posição lida, não em 1º', () => {
  const { jogadores, avisos } = interpretarPrintRanking(print(SETE.slice(4), { cabecalho: false }));
  assert.deepEqual(jogadores.map((j) => j.colocacao), [5, 6, 7]);
  assert.deepEqual(avisos, []);
});

test('sem nenhuma posição legível, assume 1º lugar e avisa', () => {
  const rows = SETE.slice(0, 3).map(([, n, m]) => ['', n, m]);
  const { jogadores, avisos } = interpretarPrintRanking(print(rows));
  assert.deepEqual(jogadores.map((j) => j.colocacao), [1, 2, 3]);
  assert.equal(avisos.length, 1);
});

test('posição lida que contradiz a ordem gera aviso', () => {
  const rows = SETE.slice(3, 6).map((r) => [...r]);
  rows[1][0] = '8'; // OCR leu 8 em vez de 5
  const { jogadores, avisos } = interpretarPrintRanking(print(rows, { cabecalho: false }));
  assert.deepEqual(jogadores.map((j) => j.colocacao), [4, 5, 6]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Lucas lima/);
});

test('junta prints sobrepostos sem repetir jogadores', () => {
  const a = interpretarPrintRanking(print(SETE.slice(0, 4)));
  const b = interpretarPrintRanking(print(SETE.slice(2), { cabecalho: false }));
  const { jogadores, avisos, faltando } = juntarPrints([a, b]);
  assert.deepEqual(jogadores.map((j) => j.colocacao), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(faltando, []);
  assert.deepEqual(avisos, []);
});

test('aponta posições faltando entre os prints', () => {
  const a = interpretarPrintRanking(print(SETE.slice(0, 3)));
  const b = interpretarPrintRanking(print(SETE.slice(4), { cabecalho: false }));
  const { faltando, avisos } = juntarPrints([a, b]);
  assert.deepEqual(faltando, [4]);
  assert.ok(avisos.some((x) => x.includes('4º')));
});

test('print sem jogadores avisa que não é a tela certa', () => {
  const { jogadores, avisos } = interpretarPrintRanking([linha([palavra('Match', 40, 100), palavra('History', 120, 100)])]);
  assert.equal(jogadores.length, 0);
  assert.equal(avisos.length, 1);
});

test('Member Number tolera confusões do OCR e o texto volta para a conferência', () => {
  assert.equal(extrairMemberNumber('00O0310001'), '0000310001');
  assert.equal(extrairMemberNumber('Number: 0000l10009'), '0000110009');
  const { jogadores } = interpretarPrintRanking(print(SETE.slice(0, 2)));
  const texto = classificacaoComoTexto(jogadores);
  assert.equal(texto, `1. joao (${N(1)})\n2. lil Puu #Rafa (${N(2)})`);
  assert.deepEqual(
    interpretarClassificacaoColada(texto).map((l) => [l.colocacao, l.texto, l.memberNumber]),
    [[1, 'joao', N(1)], [2, 'lil Puu #Rafa', N(2)]],
  );
});
