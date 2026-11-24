import { createApp } from './app.js';

const port = Number(process.env.API_PORT ?? 3003);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 100);

createApp({ rateLimitMax }).listen(port, '0.0.0.0', () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});
