const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;
const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

/** Signed cents effect of a completed record on an account (credit positive, debit negative). */
function effectCents(r, accountId) {
  if (r.status !== 'completed') return 0;
  const cents = toCents(r.amount);
  if (r.type === 'deposit') return r.toAccount === accountId ? cents : 0;
  if (r.type === 'withdrawal') return r.fromAccount === accountId ? -cents : 0;
  return (r.toAccount === accountId ? cents : 0) - (r.fromAccount === accountId ? cents : 0);
}

const touches = (r, accountId) => r.fromAccount === accountId || r.toAccount === accountId;

export function balanceOf(records, accountId) {
  const cents = {};
  for (const r of records) {
    if (!touches(r, accountId)) continue;
    cents[r.currency] = (cents[r.currency] ?? 0) + effectCents(r, accountId);
  }
  return { accountId, balances: mapValues(cents, fromCents) };
}

export function summaryOf(records, accountId) {
  const credits = {};
  const debits = {};
  let count = 0;
  let latest = null;
  for (const r of records) {
    if (!touches(r, accountId)) continue;
    count += 1;
    if (latest === null || Date.parse(r.timestamp) > Date.parse(latest)) latest = r.timestamp;
    const effect = effectCents(r, accountId);
    if (effect > 0) credits[r.currency] = (credits[r.currency] ?? 0) + effect;
    if (effect < 0) debits[r.currency] = (debits[r.currency] ?? 0) - effect;
  }
  return {
    accountId,
    totalDeposits: mapValues(credits, fromCents),
    totalWithdrawals: mapValues(debits, fromCents),
    transactionCount: count,
    mostRecentTransactionDate: latest,
  };
}

export function interestOf(records, accountId, rate, days) {
  const { balances } = balanceOf(records, accountId);
  const results = Object.entries(balances).map(([currency, balance]) => {
    const interest = Math.round(balance * rate * days / 365 * 100) / 100;
    return { currency, balance, interest, projectedBalance: fromCents(toCents(balance) + toCents(interest)) };
  });
  return { accountId, rate, days, results };
}
