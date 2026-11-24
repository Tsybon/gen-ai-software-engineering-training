'use strict';
const http = require('node:http');
const { createApp } = require('./app');

const port = Number(process.env.API_PORT) || 3002;
const rateLimit = Number(process.env.RATE_LIMIT_PER_MINUTE) || 100;

http.createServer(createApp({ rateLimit })).listen(port, () => {
  console.log(`API listening on http://localhost:${port} (rate limit ${rateLimit}/min per IP)`);
});
