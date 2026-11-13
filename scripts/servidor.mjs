// Servidor estático mínimo para desenvolvimento local (sem dependências).
// Uso: node scripts/servidor.mjs [porta]   → http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.md': 'text/plain; charset=utf-8',
  '.gs': 'text/plain; charset=utf-8',
};

export function iniciarServidor(porta = 8080) {
  const servidor = createServer(async (req, res) => {
    try {
      const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let arquivo = normalize(join(RAIZ, caminho));
      if (!arquivo.startsWith(normalize(RAIZ)) || arquivo.split(sep).includes('node_modules')) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(arquivo).catch(() => null))?.isDirectory()) arquivo = join(arquivo, 'index.html');
      const corpo = await readFile(arquivo);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    }
  });
  return new Promise((resolve) => servidor.listen(porta, () => resolve(servidor)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const porta = Number(process.argv[2]) || 8080;
  await iniciarServidor(porta);
  console.log(`Liga OPTCG Caruaru em http://localhost:${porta}`);
}
