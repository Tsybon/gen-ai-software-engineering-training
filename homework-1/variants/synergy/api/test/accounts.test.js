import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('balance reflects completed deposit, withdrawal and transfer per currency', async () => {
  const { api, post, deposit } = setup();
  await deposit('ACC-AAAAA', 100);
  await deposit('ACC-AAAAA', 50, { currency: 'EUR' });
  await post({ fromAccount: 'ACC-AAAAA', amount: 20.25, currency: 'USD', type: 'withdrawal' });
  await post({ fromAccount: 'ACC-AAAAA', toAccount: 'ACC-BBBBB', amount: 30, currency: 'USD', type: 'transfer' });
  const a = await api.get('/accounts/ACC-AAAAA/balance');
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { accountId: 'ACC-AAAAA', balances: { USD: 49.75, EUR: 50 } });
  const b = await api.get('/accounts/ACC-BBBBB/balance');
  assert.deepEqual(b.body.balances, { USD: 30 });
});

test('pending and failed transactions do not change balance but keep a zero entry', async () => {
  const { api, deposit } = setup();
  await deposit('ACC-AAAAA', 100, { status: 'pending' });
  await deposit('ACC-AAAAA', 100, { status: 'failed' });
  const res = await api.get('/accounts/ACC-AAAAA/balance');
  assert.deepEqual(res.body.balances, { USD: 0 });
});

test('cents arithmetic: 0.1 + 0.2 = 0.3', async () => {
  const { api, deposit } = setup();
  await deposit('ACC-AAAAA', 0.1);
  await deposit('ACC-AAAAA', 0.2);
  assert.deepEqual((await api.get('/accounts/ACC-AAAAA/balance')).body.balances, { USD: 0.3 });
});

test('overdraft is allowed and balance goes negative', async () => {
  const { api, post } = setup();
  const res = await post({ fromAccount: 'ACC-AAAAA', amount: 10, currency: 'USD', type: 'withdrawal' });
  assert.equal(res.body.status, 'completed');
  assert.deepEqual((await api.get('/accounts/ACC-AAAAA/balance')).body.balances, { USD: -10 });
});

test('unseen account has empty balances; malformed account gives 400', async () => {
  const { api } = setup();
  assert.deepEqual((await api.get('/accounts/ACC-ZZZZZ/balance')).body, { accountId: 'ACC-ZZZZZ', balances: {} });
  const bad = await api.get('/accounts/123/balance');
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.details, [{ field: 'accountId', message: 'Account must match format ACC-XXXXX' }]);
});

test('summary totals credits and debits per currency', async () => {
  const { api, post, deposit } = setup();
  await deposit('ACC-AAAAA', 100, { timestamp: '2024-01-01T00:00:00Z' });
  await post({ fromAccount: 'ACC-BBBBB', toAccount: 'ACC-AAAAA', amount: 5, currency: 'USD', type: 'transfer', timestamp: '2024-01-02T00:00:00Z' });
  await post({ fromAccount: 'ACC-AAAAA', amount: 20, currency: 'USD', type: 'withdrawal', timestamp: '2024-01-03T00:00:00Z' });
  await deposit('ACC-AAAAA', 999, { status: 'failed', timestamp: '2024-01-04T00:00:00Z' });
  const res = await api.get('/accounts/ACC-AAAAA/summary');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    accountId: 'ACC-AAAAA',
    totalDeposits: { USD: 105 },
    totalWithdrawals: { USD: 20 },
    transactionCount: 4,
    mostRecentTransactionDate: '2024-01-04T00:00:00.000Z',
  });
});

test('summary for unseen account', async () => {
  const { api } = setup();
  assert.deepEqual((await api.get('/accounts/ACC-ZZZZZ/summary')).body, {
    accountId: 'ACC-ZZZZZ', totalDeposits: {}, totalWithdrawals: {}, transactionCount: 0, mostRecentTransactionDate: null,
  });
});

test('simple interest per currency', async () => {
  const { api, deposit } = setup();
  await deposit('ACC-AAAAA', 1000);
  const res = await api.get('/accounts/ACC-AAAAA/interest?rate=0.05&days=30');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    accountId: 'ACC-AAAAA', rate: 0.05, days: 30,
    results: [{ currency: 'USD', balance: 1000, interest: 4.11, projectedBalance: 1004.11 }],
  });
});

test('interest validates rate and days', async () => {
  const { api } = setup();
  const res = await api.get('/accounts/ACC-AAAAA/interest?rate=abc&days=1.5');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.details.map((d) => d.field), ['rate', 'days']);
});

test('CSV export with filters, quoting, and route before /:id', async () => {
  const { api, deposit } = setup();
  await deposit('ACC-AAAAA', 12.5);
  await deposit('ACC-BBBBB', 1);
  const res = await api.get('/transactions/export?format=csv&accountId=ACC-AAAAA');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment; filename="transactions.csv"/);
  const lines = res.text.trim().split('\r\n');
  assert.equal(lines[0], 'id,fromAccount,toAccount,amount,currency,type,timestamp,status');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /,,ACC-AAAAA,12\.50,USD,deposit,/);
  assert.equal((await api.get('/transactions/export?format=xml')).status, 400);
});

test('rate limit returns 429 after the limit, /health exempt', async () => {
  const { api } = setup({ rateLimitMax: 3 });
  for (let i = 0; i < 3; i++) assert.equal((await api.get('/transactions')).status, 200);
  const res = await api.get('/transactions');
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: 'Too many requests', details: [] });
  assert.ok(Number(res.headers['retry-after']) > 0);
  assert.equal((await api.get('/health')).status, 200);
});
