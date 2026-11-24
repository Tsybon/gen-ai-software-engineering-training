import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

async function seed() {
  const ctx = setup();
  await ctx.deposit('ACC-AAAAA', 100, { timestamp: '2024-01-01T00:00:00Z' });
  await ctx.post({ fromAccount: 'ACC-AAAAA', toAccount: 'ACC-BBBBB', amount: 10, currency: 'USD', type: 'transfer', timestamp: '2024-01-31T23:30:00Z' });
  await ctx.post({ fromAccount: 'ACC-BBBBB', amount: 5, currency: 'USD', type: 'withdrawal', timestamp: '2024-02-01T00:00:00Z' });
  return ctx;
}

const ids = (res) => res.body.map((t) => `${t.type}`);

test('filter by accountId matches either side', async () => {
  const { api } = await seed();
  const res = await api.get('/transactions?accountId=ACC-BBBBB');
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res).sort(), ['transfer', 'withdrawal']);
});

test('filter by type', async () => {
  const { api } = await seed();
  assert.deepEqual(ids(await api.get('/transactions?type=transfer')), ['transfer']);
});

test('date range is inclusive and date-only "to" covers the whole day', async () => {
  const { api } = await seed();
  const res = await api.get('/transactions?from=2024-01-01&to=2024-01-31');
  assert.deepEqual(ids(res).sort(), ['deposit', 'transfer']);
});

test('filters combine with AND', async () => {
  const { api } = await seed();
  const res = await api.get('/transactions?accountId=ACC-AAAAA&type=transfer&from=2024-01-15&to=2024-02-28');
  assert.deepEqual(ids(res), ['transfer']);
});

test('list is newest first', async () => {
  const { api } = await seed();
  assert.deepEqual(ids(await api.get('/transactions')), ['withdrawal', 'transfer', 'deposit']);
});

test('bad filter values give 400 with field names', async () => {
  const { api } = await seed();
  const res = await api.get('/transactions?accountId=bad&type=loan&from=2024-13-01');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.details.map((d) => d.field), ['accountId', 'type', 'from']);
  const reversed = await api.get('/transactions?from=2024-02-01&to=2024-01-01');
  assert.deepEqual(reversed.body.details.map((d) => d.field), ['to']);
});

test('unknown query params are ignored and repeated key uses last value', async () => {
  const { api } = await seed();
  assert.equal((await api.get('/transactions?_=123')).body.length, 3);
  assert.deepEqual(ids(await api.get('/transactions?type=deposit&type=transfer')), ['transfer']);
});
