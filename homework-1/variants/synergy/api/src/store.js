import { randomUUID } from 'node:crypto';

/** In-memory transaction store. Records are frozen; the list is append-only. */
export function createStore() {
  let records = [];
  return {
    add(input) {
      const record = Object.freeze({
        id: randomUUID(),
        fromAccount: input.fromAccount,
        toAccount: input.toAccount,
        amount: input.amount,
        currency: input.currency,
        type: input.type,
        timestamp: input.timestamp ?? new Date().toISOString(),
        status: input.status,
      });
      records = [...records, record];
      return record;
    },
    get: (id) => records.find((r) => r.id === id) ?? null,
    all: () => records,
  };
}

/** Newest first; ties keep reverse insertion order. */
export function filterTransactions(records, { accountId, type, fromMs, toMs }) {
  return records
    .map((r, i) => ({ r, i, t: Date.parse(r.timestamp) }))
    .filter(({ r, t }) =>
      (!accountId || r.fromAccount === accountId || r.toAccount === accountId) &&
      (!type || r.type === type) &&
      (fromMs === null || t >= fromMs) &&
      (toMs === null || t <= toMs))
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .map(({ r }) => r);
}
