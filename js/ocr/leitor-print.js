// Leitura do print do Ranking do Bandai TCG+ no navegador, com Tesseract.js servido pelo próprio site
// (vendor/tesseract). Nada sai do computador do administrador: sem servidor e sem API paga.
// A interpretação do que foi lido fica em js/domain/print-ranking.js (função pura, com testes).
import { interpretarPrintRanking } from '../domain/print-ranking.js';

const BASE = new URL('../../vendor/tesseract/', import.meta.url).href;
const ESCALA = 2; // ampliar ajuda o OCR com a fonte pequena do celular
const LIMIAR = 200; // abaixo disso vira preto: some com as bordas cinza-claro da tabela

let carregando = null;

function carregarTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  carregando ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${BASE}tesseract.min.js`;
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => {
      carregando = null;
      reject(new Error('Não foi possível carregar o leitor de imagens.'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

// createImageBitmap não precisa de URL blob: (que a Content Security Policy bloqueia em img-src).
async function abrirImagem(arquivo) {
  try {
    return await createImageBitmap(arquivo);
  } catch {
    throw new Error(`Não foi possível abrir "${arquivo.name}". Envie um print em PNG ou JPG.`);
  }
}

/** Imagem ampliada e binarizada: texto preto em fundo branco. */
function preparar(img) {
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * ESCALA);
  c.height = Math.round(img.height * ESCALA);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const cinza = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = cinza < LIMIAR ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

const caixa = (b) => ({ x0: b.x0 / ESCALA, y0: b.y0 / ESCALA, x1: b.x1 / ESCALA, y1: b.y1 / ESCALA });

/** Converte o resultado do Tesseract no formato de linhas usado por interpretarPrintRanking. */
function linhasDoTesseract(data) {
  return (data.blocks || [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .map((l) => ({
      texto: l.text.trim(),
      ...caixa(l.bbox),
      palavras: l.words.map((w) => ({ texto: w.text.trim(), ...caixa(w.bbox) })).filter((w) => w.texto),
    }))
    .filter((l) => l.texto);
}

/**
 * Lê um ou mais prints, na ordem recebida.
 * @param aoProgredir (mensagem) => void
 * @returns {Promise<Array<{ jogadores, avisos }>>} uma leitura por print
 */
export async function lerPrints(arquivos, aoProgredir = () => {}) {
  aoProgredir('Carregando o leitor de imagens…');
  const Tesseract = await carregarTesseract();
  const worker = await Tesseract.createWorker(['eng', 'por'], 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE,
    langPath: `${BASE}lang`,
    workerBlobURL: false, // worker servido do próprio site: compatível com a Content Security Policy
    gzip: true,
  });
  try {
    const leituras = [];
    for (const [i, arquivo] of [...arquivos].entries()) {
      aoProgredir(arquivos.length > 1 ? `Lendo print ${i + 1} de ${arquivos.length}…` : 'Lendo o print…');
      const img = await abrirImagem(arquivo);
      const { data } = await worker.recognize(preparar(img), {}, { blocks: true });
      img.close();
      const linhas = linhasDoTesseract(data);
      if (globalThis.__OCR_DEBUG__) console.log('OCR', JSON.stringify(linhas.map((l) => [Math.round(l.y0), l.texto])));
      leituras.push(interpretarPrintRanking(linhas));
    }
    return leituras;
  } finally {
    await worker.terminate();
  }
}
