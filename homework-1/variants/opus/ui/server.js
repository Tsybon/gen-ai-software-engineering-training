'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.UI_PORT) || 5102;
const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${Number(process.env.API_PORT) || 3002}`;
const root = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(`window.APP_CONFIG = ${JSON.stringify({ apiBaseUrl })};`);
  }
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(data);
  });
}).listen(port, () => console.log(`UI on http://localhost:${port} (API: ${apiBaseUrl})`));
