import { api } from './api.js';

const day = (n) => new Date(Date.UTC(2026, 9, 1 + n, 9 + (n % 8), 15)).toISOString();

// DEMO data: every record touches an ACC-DEMO* account and is badged in the UI.
export const DEMO_TRANSACTIONS = [
  { type: 'deposit', toAccount: 'ACC-DEMO1', amount: 5000, currency: 'USD', timestamp: day(0) },
  { type: 'deposit', toAccount: 'ACC-DEMO2', amount: 3200, currency: 'EUR', timestamp: day(1) },
  { type: 'deposit', toAccount: 'ACC-DEMO3', amount: 150000, currency: 'JPY', timestamp: day(2) },
  { type: 'transfer', fromAccount: 'ACC-DEMO1', toAccount: 'ACC-DEMO2', amount: 750.25, currency: 'USD', timestamp: day(3) },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO1', amount: 120, currency: 'USD', timestamp: day(4) },
  { type: 'transfer', fromAccount: 'ACC-DEMO2', toAccount: 'ACC-DEMO3', amount: 410, currency: 'EUR', timestamp: day(6) },
  { type: 'deposit', toAccount: 'ACC-DEMO1', amount: 980.4, currency: 'GBP', timestamp: day(8) },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO3', amount: 22000, currency: 'JPY', timestamp: day(9) },
  { type: 'transfer', fromAccount: 'ACC-DEMO1', toAccount: 'ACC-DEMO3', amount: 300, currency: 'USD', status: 'pending', timestamp: day(11) },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO2', amount: 99.99, currency: 'EUR', status: 'failed', timestamp: day(12) },
  { type: 'deposit', toAccount: 'ACC-DEMO2', amount: 1250, currency: 'USD', timestamp: day(14) },
  { type: 'transfer', fromAccount: 'ACC-DEMO2', toAccount: 'ACC-DEMO1', amount: 64.5, currency: 'GBP', status: 'failed', timestamp: day(15) },
];

/** Posts all DEMO records through the real API; returns {created, failed}. */
export async function loadDemo() {
  const results = await Promise.allSettled(DEMO_TRANSACTIONS.map((t) => api.create(t)));
  return {
    created: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
}
