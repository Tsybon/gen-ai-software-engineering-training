import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApiServer } from './api/server.mjs';

const port = (value, fallback) => {
  const result = Number(value || fallback);
  if (!Number.isInteger(result) || result < 1 || result > 65535) throw new Error('Ports must be integers from 1 to 65535');
  return result;
};
const apiPort = port(process.env.API_PORT, 3001);
const uiPort = port(process.env.UI_PORT, 5101);
if (apiPort === uiPort) throw new Error('API_PORT and UI_PORT must differ');
const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${apiPort}`;
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const routes = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/fonts/plex-regular.ttf':['fonts/plex-regular.ttf','font/ttf'], '/fonts/plex-medium.ttf':['fonts/plex-medium.ttf','font/ttf'], '/fonts/plex-semibold.ttf':['fonts/plex-semibold.ttf','font/ttf'] };
const ui = http.createServer(async (req, res) => {
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Invalid request URL'); }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(`window.APP_CONFIG = ${JSON.stringify({ apiBaseUrl }).replace(/</g, '\\u003c')};`);
  }
  const route = routes[path];
  if (!route) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await readFile(`${publicRoot}${route[0]}`);
    res.writeHead(200, { 'Content-Type': `${route[1]}; charset=utf-8` });
    res.end(data);
  } catch (error) {
    console.error(error);
    res.writeHead(500); res.end('Unable to load the interface');
  }
});
const api = createApiServer();
for (const [server, name, listenPort] of [[api, 'API', apiPort], [ui, 'UI', uiPort]]) {
  server.on('error', error => { console.error(`${name}: ${error.message}`); api.close(); ui.close(); process.exitCode = 1; });
  server.listen(listenPort, '0.0.0.0', () => console.log(`${name} ready at http://localhost:${listenPort}`));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { api.close(); ui.close(); });
