import { CURRENCIES } from './currencies.mjs';

export const ACCOUNT_PATTERN = /^ACC-[a-zA-Z0-9]{5}$/;
export const TYPES = ['deposit', 'withdrawal', 'transfer'];
export const STATUSES = ['pending', 'completed', 'failed'];
export const fieldError = (field, message) => ({ field, message });
export const validationError = details => ({ error: 'Validation failed', details });
export const MAX_AMOUNT = Math.floor(Number.MAX_SAFE_INTEGER / 100) / 100;
const MAX_CENTS = BigInt(Math.round(MAX_AMOUNT * 100));
const toCents = amount => BigInt(amount.toFixed(2).replace('.', ''));

export function transactionErrors(body) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return [fieldError('body', 'Body must be a JSON object')];
 const errors = [];
 if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
  errors.push(fieldError('amount', 'Amount must be a positive number'));
 } else if (body.amount > MAX_AMOUNT || !Number.isSafeInteger(Math.round(body.amount * 100))) {
  errors.push(fieldError('amount', `Amount must not exceed ${MAX_AMOUNT}`));
 } else if (Number(body.amount.toFixed(2)) !== body.amount) {
  errors.push(fieldError('amount', 'Amount must have at most 2 decimal places'));
 }
 if (!TYPES.includes(body.type)) errors.push(fieldError('type', 'Type must be deposit, withdrawal or transfer'));
 if (!CURRENCIES.has(body.currency)) errors.push(fieldError('currency', 'Invalid currency code'));
 for (const field of ['fromAccount', 'toAccount']) {
  const required = field === 'fromAccount' ? ['withdrawal', 'transfer'].includes(body.type) : ['deposit', 'transfer'].includes(body.type);
  if (required || (body[field] !== undefined && body[field] !== '')) {
   if (typeof body[field] !== 'string' || !ACCOUNT_PATTERN.test(body[field])) errors.push(fieldError(field, 'Account must match ACC-XXXXX (5 alphanumeric characters)'));
  }
 }
 if (body.type === 'transfer' && body.fromAccount && body.fromAccount === body.toAccount) errors.push(fieldError('toAccount', 'Transfer accounts must be different'));
 if (body.status !== undefined && !STATUSES.includes(body.status)) errors.push(fieldError('status', 'Status must be pending, completed or failed'));
 if (body.demo !== undefined && typeof body.demo !== 'boolean') errors.push(fieldError('demo', 'Demo must be a boolean'));
 return errors;
}

export function parseDateFilter(value, end = false) {
 if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
  const time = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return NaN;
  return time + (end ? 86_399_999 : 0);
 }
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
 const calendar = value.slice(0, 10);
 if (!Number.isFinite(parseDateFilter(calendar))) return NaN;
 return Date.parse(value);
}

export function parseFilters(params) {
 const errors = [];
 const accountId = params.get('accountId');
 const type = params.get('type');
 if (accountId !== null && !ACCOUNT_PATTERN.test(accountId)) errors.push(fieldError('accountId', 'Account must match ACC-XXXXX (5 alphanumeric characters)'));
 if (type !== null && !TYPES.includes(type)) errors.push(fieldError('type', 'Type must be deposit, withdrawal or transfer'));
 const from = params.has('from') ? parseDateFilter(params.get('from')) : -Infinity;
 const to = params.has('to') ? parseDateFilter(params.get('to'), true) : Infinity;
 if (Number.isNaN(from)) errors.push(fieldError('from', 'From must be a valid ISO date or datetime'));
 if (Number.isNaN(to)) errors.push(fieldError('to', 'To must be a valid ISO date or datetime'));
 if (from > to) errors.push(fieldError('to', 'To must be on or after from'));
 return { errors, accountId, type, from, to };
}

export function filterTransactions(transactions, filters) {
 return transactions.filter(item => (!filters.accountId || item.fromAccount === filters.accountId || item.toAccount === filters.accountId)
  && (!filters.type || item.type === filters.type)
  && Date.parse(item.timestamp) >= filters.from && Date.parse(item.timestamp) <= filters.to);
}

function accountCents(transactions, accountId) {
 const sums = new Map();
 for (const item of transactions) {
  if (item.status !== 'completed') continue;
  const credit = ['deposit', 'transfer'].includes(item.type) && item.toAccount === accountId;
  const debit = ['withdrawal', 'transfer'].includes(item.type) && item.fromAccount === accountId;
  if (!credit && !debit) continue;
  const cents = toCents(item.amount);
  const current = sums.get(item.currency) || { credit: 0n, debit: 0n };
  sums.set(item.currency, { credit: current.credit + (credit ? cents : 0n), debit: current.debit + (debit ? cents : 0n) });
 }
 return sums;
}

function centsByCurrency(transactions, accountId, direction) {
 return Object.fromEntries([...accountCents(transactions, accountId)]
  .filter(([, totals]) => direction === 'net' || totals[direction] !== 0n)
  .map(([currency, totals]) => [currency, Number(direction === 'net' ? totals.credit - totals.debit : totals[direction]) / 100]));
}

export function monetaryLimitErrors(transactions, candidate) {
 if (candidate.status !== 'completed') return [];
 const accounts = [...new Set([candidate.fromAccount, candidate.toAccount].filter(Boolean))];
 const exceedsLimit = accounts.some(accountId => [...accountCents([...transactions, candidate], accountId).values()]
  .some(totals => totals.credit > MAX_CENTS || totals.debit > MAX_CENTS));
 return exceedsLimit ? [fieldError('amount', `Cumulative completed credits or debits per account and currency must not exceed ${MAX_AMOUNT}`)] : [];
}

export function accountBalance(transactions, accountId) {
 return { accountId, balances: centsByCurrency(transactions, accountId, 'net') };
}

export function accountSummary(transactions, accountId) {
 const history = transactions.filter(item => item.fromAccount === accountId || item.toAccount === accountId);
 return { accountId, totalDeposits: centsByCurrency(transactions, accountId, 'credit'), totalWithdrawals: centsByCurrency(transactions, accountId, 'debit'), transactionCount: history.length,
  mostRecentTransactionDate: history.length ? history.reduce((latest, item) => item.timestamp > latest ? item.timestamp : latest, '') : null };
}

function decimalRatio(value) {
 const [mantissa, exponent = '0'] = value.toString().split('e');
 const [whole, fraction = ''] = mantissa.split('.');
 const scale = fraction.length - Number(exponent);
 const digits = BigInt(whole + fraction);
 return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}

function roundedRatio(numerator, denominator) {
 const absolute = numerator < 0n ? -numerator : numerator;
 const rounded = (absolute * 2n + denominator) / (denominator * 2n);
 return numerator < 0n ? -rounded : rounded;
}

export function interestResult(transactions, accountId, rate, days) {
 const { balances } = accountBalance(transactions, accountId);
 const [rateNumerator, rateDenominator] = decimalRatio(rate);
 const interest = Object.fromEntries([...accountCents(transactions, accountId)].map(([currency, totals]) => {
  const interestCents = roundedRatio((totals.credit - totals.debit) * rateNumerator * BigInt(days), rateDenominator * 365n);
  return [currency, Number(interestCents) / 100];
 }));
 return { accountId, rate, days, balances, interest };
}

export function exportCsv(transactions) {
 const fields = ['id', 'fromAccount', 'toAccount', 'amount', 'currency', 'type', 'timestamp', 'status', 'demo'];
 const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
 return fields.join(',') + '\r\n' + transactions.map(item => fields.map(key => cell(item[key])).join(',')).join('\r\n') + '\r\n';
}
