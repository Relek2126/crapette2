// Petit serveur statique pour tester en local : node server.js  (puis ouvrir http://localhost:5173)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const port = process.env.PORT || 5173;

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p === '/' || p === '\\') p = '/index.html';
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'Content-Type': (types[extname(p)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
