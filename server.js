// Serveur du jeu : fichiers statiques + relais de parties (WebSocket sur /ws).
// node server.js  (puis ouvrir http://localhost:5173)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRelay } from './relay.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const port = process.env.PORT || 5173;
// seuls ces fichiers sont servis (pas package.json, relay.js, notes…)
const PUBLIC = /^\/(index\.html|style\.css|icon\.svg|manifest\.webmanifest|js\/[\w.-]+\.js)$/;

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/');
  if (p === '/') p = '/index.html';
  if (!PUBLIC.test(p)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'Content-Type': (types[extname(p)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
attachRelay(server);
server.listen(port, () => console.log(`http://localhost:${port}`));
