// Dependency-free dev gateway: same routes as gateway/nginx.conf, for running without Docker.
//   node tools/dev-gateway.mjs            -> http://localhost:8080
// Env: CATALOG_URL, SPOTS_URL, LIVE_URL (defaults localhost:3001-3003), STATIC_DIR (default frontend/dist)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.resolve(process.env.STATIC_DIR || path.join(root, 'frontend/dist'));
const routes = {
  '/api/catalog/': process.env.CATALOG_URL || 'http://127.0.0.1:3001',
  '/api/spots/': process.env.SPOTS_URL || 'http://127.0.0.1:3002',
  '/api/live/': process.env.LIVE_URL || 'http://127.0.0.1:3003'
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const prefix = Object.keys(routes).find(p => req.url.startsWith(p));
  if (prefix) {
    const target = new URL(routes[prefix]);
    const up = http.request({ hostname: target.hostname, port: target.port, path: '/' + req.url.slice(prefix.length), method: req.method, headers: { ...req.headers, host: target.host } }, r => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"bad_gateway"}'); });
    req.pipe(up);
    return;
  }
  let file = path.join(STATIC, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(STATIC)) { res.writeHead(403); res.end(); return; }
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(STATIC, 'index.html'); }
  try { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(Number(process.env.PORT || 8080), () => console.log(`Zil dev gateway on http://localhost:${process.env.PORT || 8080}`));
