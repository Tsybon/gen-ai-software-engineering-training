import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, fieldsOf } from './helpers.js';

const transfer = { fromAccount: 'ACC-12345', toAccount: 'ACC-67890', amount: 100.5, currency: 'USD', type: 'transfer' };

test('POST /transactions creates a transfer with generated id, timestamp and completed status', async () => {
  const { post } = setup();
  const res = await post(transfer);
  assert.equal(res.status, 201);
  assert.match(res.body.id, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)));
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.amount, 100.5);
  assert.equal(res.body.fromAccount, 'ACC-12345');
});

test('POST ignores client id and unknown fields', async () => {
  const { post } = setup();
  const res = await post({ ...transfer, id: 'mine', foo: 1 });
  assert.equal(res.status, 201);
  assert.notEqual(res.body.id, 'mine');
  assert.equal(res.body.foo, undefined);
});

test('POST accepts a valid client timestamp and status', async () => {
  const { post } = setup();
  const res = await post({ ...transfer, timestamp: '2024-01-15T10:00:00Z', status: 'pending' });
  assert.equal(res.status, 201);
  assert.equal(res.body.timestamp, '2024-01-15T10:00:00.000Z');
  assert.equal(res.body.status, 'pending');
});

test('GET /transactions lists and GET /transactions/:id returns one', async () => {
  const { api, post } = setup();
  const created = (await post(transfer)).body;
  const list = await api.get('/transactions');
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  const one = await api.get(`/transactions/${created.id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(one.body, created);
});

test('GET /transactions/:id returns 404 envelope for unknown id', async () => {
  const { api } = setup();
  const res = await api.get('/transactions/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Transaction not found', details: [] });
});

test('negative amount gives exact validation envelope', async () => {
  const { post } = setup();
  const res = await post({ ...transfer, amount: -5, currency: 'XYZ' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
  assert.deepEqual(res.body.details, [
    { field: 'amount', message: 'Amount must be a positive number' },
    { field: 'currency', message: 'Invalid currency code' },
  ]);
});

for (const [amount, message] of [
  [0, 'Amount must be a positive number'],
  ['100', 'Amount must be a positive number'],
  [10.555, 'Amount must have at most 2 decimal places'],
  [1e-12, 'Amount must have at most 2 decimal places'],
  [1_000_000_000.01, 'Amount must not exceed 1000000000'],
  [undefined, 'Amount is required'],
]) {
  test(`amount ${String(amount)} is rejected: ${message}`, async () => {
    const { post } = setup();
    const res = await post({ ...transfer, amount });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details, [{ field: 'amount', message }]);
  });
}

test('amount with exactly 2 decimals is accepted', async () => {
  const { post } = setup();
  assert.equal((await post({ ...transfer, amount: 0.01 })).status, 201);
});

for (const bad of ['ACC-12', 'acc-12345', 'ACC-1234!', 'ACC-123456', 'XYZ-12345']) {
  test(`account ${bad} is rejected`, async () => {
    const { post } = setup();
    const res = await post({ ...transfer, fromAccount: bad });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details, [{ field: 'fromAccount', message: 'Account must match format ACC-XXXXX' }]);
  });
}

test('alphanumeric account ACC-AB12C is accepted', async () => {
  const { post } = setup();
  assert.equal((await post({ ...transfer, fromAccount: 'ACC-AB12C' })).status, 201);
});

for (const currency of ['usd', 'XTS', 'ABC', '']) {
  test(`currency "${currency}" is rejected`, async () => {
    const { post } = setup();
    const res = await post({ ...transfer, currency });
    assert.equal(res.status, 400);
    assert.deepEqual(fieldsOf(res), ['currency']);
  });
}

for (const currency of ['EUR', 'GBP', 'JPY', 'UAH', 'XAU']) {
  test(`currency ${currency} is accepted`, async () => {
    const { post } = setup();
    assert.equal((await post({ ...transfer, currency })).status, 201);
  });
}

test('invalid type, status and timestamp are reported together', async () => {
  const { post } = setup();
  const res = await post({ ...transfer, type: 'loan', status: 'done', timestamp: 'yesterday' });
  assert.equal(res.status, 400);
  assert.deepEqual(fieldsOf(res), ['type', 'status', 'timestamp']);
});

test('required accounts per type', async () => {
  const { post } = setup();
  const dep = await post({ amount: 1, currency: 'USD', type: 'deposit' });
  assert.deepEqual(fieldsOf(dep), ['toAccount']);
  const wd = await post({ amount: 1, currency: 'USD', type: 'withdrawal' });
  assert.deepEqual(fieldsOf(wd), ['fromAccount']);
  const same = await post({ ...transfer, toAccount: 'ACC-12345' });
  assert.deepEqual(same.body.details, [{ field: 'toAccount', message: 'fromAccount and toAccount must differ' }]);
});

test('malformed JSON gives 400 envelope', async () => {
  const { api } = setup();
  const res = await api.post('/transactions').set('Content-Type', 'application/json').send('{bad');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Validation failed', details: [{ field: 'body', message: 'Malformed JSON' }] });
});

test('CORS header is present', async () => {
  const { api } = setup();
  const res = await api.get('/transactions').set('Origin', 'http://localhost:5100');
  assert.equal(res.headers['access-control-allow-origin'], '*');
});
