'use strict';
const { randomUUID } = require('node:crypto');

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const TYPES = ['deposit', 'withdrawal', 'transfer'];
const STATUSES = ['pending', 'completed', 'failed'];
const ACCOUNT_RE = /^ACC-[A-Za-z0-9]{5}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 60 * 1000;

const err = (field, message) => ({ field, message });
const round2 = (n) => Math.round(n * 100) / 100;

function hasMax2Decimals(n) {
  const cents = n * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

function validateAccount(name, value, required) {
  if (value === undefined || value === null || value === '') {
    return required ? [err(name, `${name} is required for this transaction type`)] : [];
  }
  if (typeof value !== 'string' || !ACCOUNT_RE.test(value)) {
    return [err(name, 'Account must match format ACC-XXXXX (X = alphanumeric)')];
  }
  return [];
}

function validateTransaction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [err('body', 'Request body must be a JSON object')];
  }
  const details = [];
  const { amount, currency, type, status, fromAccount, toAccount } = body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    details.push(err('amount', 'Amount must be a positive number'));
  } else if (!hasMax2Decimals(amount)) {
    details.push(err('amount', 'Amount must have at most 2 decimal places'));
  }

  if (typeof currency !== 'string' || !CURRENCIES.has(currency)) {
    details.push(err('currency', 'Invalid currency code'));
  }

  if (!TYPES.includes(type)) {
    details.push(err('type', `Type must be one of: ${TYPES.join(', ')}`));
  } else {
    details.push(...validateAccount('fromAccount', fromAccount, type !== 'deposit'));
    details.push(...validateAccount('toAccount', toAccount, type !== 'withdrawal'));
    if (type === 'transfer' && fromAccount && fromAccount === toAccount) {
      details.push(err('toAccount', 'toAccount must differ from fromAccount'));
    }
  }

  if (status !== undefined && !STATUSES.includes(status)) {
    details.push(err('status', `Status must be one of: ${STATUSES.join(', ')}`));
  }
  return details;
}

function createStore() {
  const transactions = [];

  function balancesOf(accountId) {
    const totals = {};
    for (const t of transactions) {
      if (t.status !== 'completed') continue;
      if (t.toAccount === accountId) totals[t.currency] = (totals[t.currency] || 0) + t.amount;
      if (t.fromAccount === accountId) totals[t.currency] = (totals[t.currency] || 0) - t.amount;
    }
    return Object.entries(totals).map(([currency, balance]) => ({ currency, balance: round2(balance) }));
  }

  function balanceIn(accountId, currency) {
    const entry = balancesOf(accountId).find((b) => b.currency === currency);
    return entry ? entry.balance : 0;
  }

  function add(body) {
    const requested = body.status || 'completed';
    const debits = body.type !== 'deposit';
    // No overdrafts: a completed debit that exceeds the balance is recorded as failed.
    const insufficient = requested === 'completed' && debits &&
      balanceIn(body.fromAccount, body.currency) < body.amount;
    const tx = {
      id: randomUUID(),
      // Deposits have no source and withdrawals no destination: the irrelevant side is dropped.
      fromAccount: body.type === 'deposit' ? null : body.fromAccount,
      toAccount: body.type === 'withdrawal' ? null : body.toAccount,
      amount: body.amount,
      currency: body.currency,
      type: body.type,
      timestamp: new Date().toISOString(),
      status: insufficient ? 'failed' : requested,
      ...(insufficient && { failureReason: 'Insufficient funds' }),
    };
    transactions.push(tx);
    return tx;
  }

  const involves = (t, id) => t.fromAccount === id || t.toAccount === id;
  const knows = (id) => transactions.some((t) => involves(t, id));

  return { transactions, add, balancesOf, involves, knows };
}

function parseDateParam(name, value, endOfDay) {
  if (value === null) return { value: null };
  const iso = DATE_ONLY_RE.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return { error: err(name, `${name} must be an ISO 8601 date (e.g. 2024-01-31)`) };
  return { value: ms };
}

function filterTransactions(store, params) {
  const details = [];
  const accountId = params.get('accountId');
  const type = params.get('type');
  const status = params.get('status');
  if (accountId !== null && !ACCOUNT_RE.test(accountId)) {
    details.push(err('accountId', 'Account must match format ACC-XXXXX (X = alphanumeric)'));
  }
  if (type !== null && !TYPES.includes(type)) details.push(err('type', `Type must be one of: ${TYPES.join(', ')}`));
  if (status !== null && !STATUSES.includes(status)) {
    details.push(err('status', `Status must be one of: ${STATUSES.join(', ')}`));
  }
  const from = parseDateParam('from', params.get('from'), false);
  const to = parseDateParam('to', params.get('to'), true);
  if (from.error) details.push(from.error);
  if (to.error) details.push(to.error);
  if (details.length) return { details };

  const list = store.transactions.filter((t) => {
    const ts = Date.parse(t.timestamp);
    return (accountId === null || store.involves(t, accountId)) &&
      (type === null || t.type === type) &&
      (status === null || t.status === status) &&
      (from.value === null || ts >= from.value) &&
      (to.value === null || ts <= to.value);
  });
  return { list };
}

const CSV_FIELDS = ['id', 'fromAccount', 'toAccount', 'amount', 'currency', 'type', 'timestamp', 'status'];
function toCsv(list) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_FIELDS.join(','), ...list.map((t) => CSV_FIELDS.map((f) => cell(t[f])).join(','))].join('\n') + '\n';
}

function summaryOf(store, accountId) {
  const mine = store.transactions.filter((t) => store.involves(t, accountId));
  const byCurrency = {};
  for (const t of mine) {
    if (t.status !== 'completed') continue;
    const c = (byCurrency[t.currency] ||= { currency: t.currency, totalDeposits: 0, totalWithdrawals: 0 });
    // Inbound money (deposits, incoming transfers) counts as deposits; outbound as withdrawals.
    if (t.toAccount === accountId) c.totalDeposits = round2(c.totalDeposits + t.amount);
    if (t.fromAccount === accountId) c.totalWithdrawals = round2(c.totalWithdrawals + t.amount);
  }
  const latest = mine.reduce((max, t) => (t.timestamp > max ? t.timestamp : max), null);
  return {
    accountId,
    totalsByCurrency: Object.values(byCurrency),
    transactionCount: mine.length,
    mostRecentTransactionDate: latest,
  };
}

function createRateLimiter(limit, now = Date.now) {
  const hits = new Map();
  return (ip) => {
    const t = now();
    let entry = hits.get(ip);
    if (!entry || t - entry.start >= RATE_WINDOW_MS) {
      entry = { start: t, count: 0 };
      hits.set(ip, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetMs: entry.start + RATE_WINDOW_MS - t };
  };
}

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json', ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

const validationFailed = (res, details) => send(res, 400, { error: 'Validation failed', details });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function createApp({ rateLimit = 100 } = {}) {
  const store = createStore();
  const limiter = createRateLimiter(rateLimit);

  async function route(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const q = url.searchParams;

    if (parts[0] === 'health' && parts.length === 1 && req.method === 'GET') return send(res, 200, { status: 'ok' });

    if (parts[0] === 'transactions') {
      if (parts.length === 1 && req.method === 'POST') {
        let body;
        try { body = await readJson(req); } catch (e) {
          return validationFailed(res, [err('body', e.message === 'Invalid JSON' ? 'Request body must be valid JSON' : e.message)]);
        }
        const details = validateTransaction(body);
        if (details.length) return validationFailed(res, details);
        return send(res, 201, store.add(body));
      }
      if (parts.length === 1 && req.method === 'GET') {
        const { list, details } = filterTransactions(store, q);
        return details ? validationFailed(res, details) : send(res, 200, list);
      }
      if (parts.length === 2 && parts[1] === 'export' && req.method === 'GET') {
        const format = q.get('format') || 'csv';
        if (format !== 'csv') return validationFailed(res, [err('format', 'Only format=csv is supported')]);
        const { list, details } = filterTransactions(store, q);
        if (details) return validationFailed(res, details);
        return send(res, 200, toCsv(list), {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="transactions.csv"',
        });
      }
      if (parts.length === 2 && req.method === 'GET') {
        const tx = store.transactions.find((t) => t.id === parts[1]);
        return tx ? send(res, 200, tx) : send(res, 404, { error: 'Transaction not found' });
      }
    }

    if (parts[0] === 'accounts' && parts.length === 3 && req.method === 'GET') {
      const accountId = parts[1];
      if (!ACCOUNT_RE.test(accountId)) {
        return validationFailed(res, [err('accountId', 'Account must match format ACC-XXXXX (X = alphanumeric)')]);
      }
      if (!['balance', 'summary', 'interest'].includes(parts[2])) return send(res, 404, { error: 'Not found' });
      if (!store.knows(accountId)) return send(res, 404, { error: 'Account not found' });

      if (parts[2] === 'balance') return send(res, 200, { accountId, balances: store.balancesOf(accountId) });
      if (parts[2] === 'summary') return send(res, 200, summaryOf(store, accountId));
      return interest(res, accountId, q);
    }

    return send(res, 404, { error: 'Not found' });
  }

  function interest(res, accountId, q) {
    const rate = Number(q.get('rate'));
    const days = Number(q.get('days'));
    const details = [];
    if (q.get('rate') === null || !Number.isFinite(rate) || rate < 0) details.push(err('rate', 'Rate must be a non-negative number (e.g. 0.05)'));
    if (q.get('days') === null || !Number.isInteger(days) || days <= 0) details.push(err('days', 'Days must be a positive integer'));
    if (details.length) return validationFailed(res, details);
    const interestByCurrency = store.balancesOf(accountId).map(({ currency, balance }) => ({
      currency,
      balance,
      interest: round2(Math.max(balance, 0) * rate * (days / 365)),
    }));
    return send(res, 200, { accountId, rate, days, formula: 'balance * rate * days / 365', interestByCurrency });
  }

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After, Content-Disposition');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const rl = limiter(req.socket.remoteAddress || 'unknown');
    res.setHeader('X-RateLimit-Limit', String(rateLimit));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      return send(res, 429, { error: 'Too Many Requests' }, { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) });
    }

    try {
      await route(req, res, new URL(req.url, 'http://localhost'));
    } catch (e) {
      console.error('Unhandled error:', e);
      if (!res.headersSent) send(res, 500, { error: 'Internal server error' });
    }
  };
}

module.exports = { createApp, validateTransaction, createRateLimiter, toCsv };
