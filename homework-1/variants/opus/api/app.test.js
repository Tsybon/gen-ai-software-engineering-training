'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp, createRateLimiter } = require('./app');

async function withServer(opts, fn) {
  const server = http.createServer(createApp(opts)).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init = {}) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
      body: init.body && JSON.stringify(init.body),
    });
    const text = await r.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* csv */ }
    return { status: r.status, body, headers: r.headers };
  };
  try { await fn(call); } finally { server.close(); }
}
const post = (body) => ({ method: 'POST', body });

test('core flow: create, list, get, balance, filters, summary, interest, csv', () => withServer({}, async (call) => {
  const dep = await call('/transactions', post({ toAccount: 'ACC-AAAAA', amount: 100.5, currency: 'USD', type: 'deposit' }));
  assert.equal(dep.status, 201);
  assert.equal(dep.body.status, 'completed');
  assert.equal(dep.body.fromAccount, null);
  assert.equal(dep.headers.get('access-control-allow-origin'), '*');

  const tr = await call('/transactions', post({ fromAccount: 'ACC-AAAAA', toAccount: 'ACC-BBBBB', amount: 40, currency: 'USD', type: 'transfer' }));
  assert.equal(tr.body.status, 'completed');
  await call('/transactions', post({ toAccount: 'ACC-AAAAA', amount: 10, currency: 'EUR', type: 'deposit', status: 'pending' }));
  const over = await call('/transactions', post({ fromAccount: 'ACC-BBBBB', amount: 1000, currency: 'USD', type: 'withdrawal' }));
  assert.equal(over.body.status, 'failed');

  assert.equal((await call('/transactions')).body.length, 4);
  assert.equal((await call(`/transactions/${tr.body.id}`)).body.id, tr.body.id);
  assert.equal((await call('/transactions/nope')).status, 404);

  const bal = await call('/accounts/ACC-AAAAA/balance');
  assert.deepEqual(bal.body.balances, [{ currency: 'USD', balance: 60.5 }]);
  assert.equal((await call('/accounts/ACC-ZZZZZ/balance')).status, 404);
  assert.equal((await call('/accounts/bad/balance')).status, 400);

  assert.equal((await call('/transactions?accountId=ACC-BBBBB')).body.length, 2);
  assert.equal((await call('/transactions?type=transfer&accountId=ACC-AAAAA')).body.length, 1);
  assert.equal((await call('/transactions?from=2000-01-01&to=2000-01-31')).body.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await call(`/transactions?from=${today}&to=${today}`)).body.length, 4);
  assert.equal((await call('/transactions?type=bogus')).status, 400);

  const sum = await call('/accounts/ACC-AAAAA/summary');
  assert.deepEqual(sum.body.totalsByCurrency, [{ currency: 'USD', totalDeposits: 100.5, totalWithdrawals: 40 }]);
  assert.equal(sum.body.transactionCount, 3);

  const int = await call('/accounts/ACC-AAAAA/interest?rate=0.05&days=365');
  assert.equal(int.body.interestByCurrency[0].interest, 3.03);
  assert.equal((await call('/accounts/ACC-AAAAA/interest?rate=x')).status, 400);

  const csv = await call('/transactions/export?format=csv');
  assert.equal(csv.status, 200);
  assert.equal(csv.body.split('\n')[0], 'id,fromAccount,toAccount,amount,currency,type,timestamp,status');
}));

test('validation errors use the required shape', () => withServer({}, async (call) => {
  const r = await call('/transactions', post({ toAccount: 'ACC-1', amount: -5, currency: 'XXX1', type: 'deposit' }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Validation failed');
  assert.deepEqual(r.body.details.map((d) => d.field).sort(), ['amount', 'currency', 'toAccount']);
  assert.ok(r.body.details.find((d) => d.field === 'amount').message.includes('positive'));

  const dec = await call('/transactions', post({ toAccount: 'ACC-12345', amount: 1.234, currency: 'USD', type: 'deposit' }));
  assert.equal(dec.body.details[0].field, 'amount');
  const str = await call('/transactions', post({ toAccount: 'ACC-12345', amount: '5', currency: 'USD', type: 'deposit' }));
  assert.equal(str.status, 400);
  const same = await call('/transactions', post({ fromAccount: 'ACC-12345', toAccount: 'ACC-12345', amount: 5, currency: 'USD', type: 'transfer' }));
  assert.equal(same.status, 400);
}));

test('rate limiter returns 429 after the limit', () => withServer({ rateLimit: 2 }, async (call) => {
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/health')).status, 429);
}));

test('rate limiter window resets', () => {
  let now = 0;
  const limit = createRateLimiter(1, () => now);
  assert.equal(limit('ip').allowed, true);
  assert.equal(limit('ip').allowed, false);
  now = 60_000;
  assert.equal(limit('ip').allowed, true);
});
