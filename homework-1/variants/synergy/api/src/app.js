import express from 'express';
import cors from 'cors';
import { createStore, filterTransactions } from './store.js';
import { ValidationError, validateTransaction, validateFilters, validateAccountId } from './validation.js';
import { balanceOf, summaryOf, interestOf } from './accounts.js';
import { toCsv } from './csv.js';
import { rateLimit } from './rateLimit.js';

const DEFAULT_RATE_LIMIT = 100;
const MAX_DAYS = 36_500;

function interestParams(query) {
  const rate = Number(query.rate);
  const days = Number(query.days);
  const details = [];
  if (query.rate === undefined || query.rate === '' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
    details.push({ field: 'rate', message: 'rate must be a number between 0 and 1' });
  }
  if (query.days === undefined || query.days === '' || !Number.isInteger(days) || days < 0 || days > MAX_DAYS) {
    details.push({ field: 'days', message: `days must be an integer between 0 and ${MAX_DAYS}` });
  }
  if (details.length) throw new ValidationError(details);
  return { rate, days };
}

/** @param {{rateLimitMax?: number}} options */
export function createApp({ rateLimitMax = DEFAULT_RATE_LIMIT } = {}) {
  const store = createStore();
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(rateLimit(rateLimitMax));
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/transactions', (req, res) => {
    res.status(201).json(store.add(validateTransaction(req.body)));
  });

  app.get('/transactions', (req, res) => {
    res.json(filterTransactions(store.all(), validateFilters(req.query)));
  });

  app.get('/transactions/export', (req, res) => {
    const filters = validateFilters(req.query);
    if (req.query.format !== 'csv') throw new ValidationError([{ field: 'format', message: 'format must be csv' }]);
    res.type('text/csv').attachment('transactions.csv').send(toCsv(filterTransactions(store.all(), filters)));
  });

  app.get('/transactions/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Transaction not found', details: [] });
    return res.json(record);
  });

  app.get('/accounts/:accountId/balance', (req, res) => {
    validateAccountId(req.params.accountId);
    res.json(balanceOf(store.all(), req.params.accountId));
  });

  app.get('/accounts/:accountId/summary', (req, res) => {
    validateAccountId(req.params.accountId);
    res.json(summaryOf(store.all(), req.params.accountId));
  });

  app.get('/accounts/:accountId/interest', (req, res) => {
    validateAccountId(req.params.accountId);
    const { rate, days } = interestParams(req.query);
    res.json(interestOf(store.all(), req.params.accountId, rate, days));
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found', details: [] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: 'Validation failed', details: err.details });
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Validation failed', details: [{ field: 'body', message: 'Malformed JSON' }] });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large', details: [] });
    process.stderr.write(`${err.stack}\n`);
    return res.status(500).json({ error: 'Internal server error', details: [] });
  });

  return app;
}
