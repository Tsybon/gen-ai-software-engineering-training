import { CURRENCIES } from './currencies.js';

export const ACCOUNT_RE = /^ACC-[A-Za-z0-9]{5}$/;
export const TYPES = ['deposit', 'withdrawal', 'transfer'];
export const STATUSES = ['pending', 'completed', 'failed'];
export const MAX_AMOUNT = 1_000_000_000;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const ACCOUNT_MSG = 'Account must match format ACC-XXXXX';
const REQUIRED_SIDES = { deposit: ['toAccount'], withdrawal: ['fromAccount'], transfer: ['fromAccount', 'toAccount'] };

export class ValidationError extends Error {
  /** @param {{field: string, message: string}[]} details */
  constructor(details) {
    super('Validation failed');
    this.details = details;
  }
}

const isBlank = (v) => v === undefined || v === null;

function amountError(amount) {
  if (isBlank(amount)) return 'Amount is required';
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 'Amount must be a positive number';
  if (!AMOUNT_RE.test(String(amount))) return 'Amount must have at most 2 decimal places';
  if (amount > MAX_AMOUNT) return `Amount must not exceed ${MAX_AMOUNT}`;
  return null;
}

function accountErrors(body, type) {
  const required = REQUIRED_SIDES[type] ?? [];
  const errors = [];
  for (const field of ['fromAccount', 'toAccount']) {
    const value = body[field];
    if (isBlank(value)) {
      if (required.includes(field)) errors.push({ field, message: `${field} is required for ${type}` });
    } else if (typeof value !== 'string' || !ACCOUNT_RE.test(value)) {
      errors.push({ field, message: ACCOUNT_MSG });
    }
  }
  if (type === 'transfer' && errors.length === 0 && body.fromAccount === body.toAccount) {
    errors.push({ field: 'toAccount', message: 'fromAccount and toAccount must differ' });
  }
  return errors;
}

/** Strict ISO 8601 parse; returns epoch ms or null. Rejects impossible calendar dates. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const dateOnly = DATE_ONLY_RE.test(value);
  if (!dateOnly && !DATETIME_RE.test(value)) return null;
  const ms = Date.parse(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(ms)) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

/** Validates a POST body and returns a clean transaction input (unknown fields dropped). */
export function validateTransaction(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError([{ field: 'body', message: 'Body must be a JSON object' }]);
  }
  const details = [];
  const amountMsg = amountError(body.amount);
  if (amountMsg) details.push({ field: 'amount', message: amountMsg });
  if (isBlank(body.currency)) details.push({ field: 'currency', message: 'Currency is required' });
  else if (!CURRENCIES.has(body.currency)) details.push({ field: 'currency', message: 'Invalid currency code' });
  const typeOk = TYPES.includes(body.type);
  if (!typeOk) details.push({ field: 'type', message: 'Type must be one of deposit, withdrawal, transfer' });
  if (!isBlank(body.status) && !STATUSES.includes(body.status)) {
    details.push({ field: 'status', message: 'Status must be one of pending, completed, failed' });
  }
  if (!isBlank(body.timestamp) && parseIsoDate(body.timestamp) === null) {
    details.push({ field: 'timestamp', message: 'Timestamp must be a valid ISO 8601 datetime' });
  }
  if (typeOk) details.push(...accountErrors(body, body.type));
  else details.push(...accountErrors(body, null));
  if (details.length) throw new ValidationError(details);
  return {
    fromAccount: body.fromAccount ?? null,
    toAccount: body.toAccount ?? null,
    amount: body.amount,
    currency: body.currency,
    type: body.type,
    status: body.status ?? 'completed',
    timestamp: isBlank(body.timestamp) ? null : new Date(parseIsoDate(body.timestamp)).toISOString(),
  };
}

const lastValue = (v) => (Array.isArray(v) ? v[v.length - 1] : v);

/** Validates list/export filters; returns {accountId, type, fromMs, toMs} (null = no filter). */
export function validateFilters(query) {
  const accountId = lastValue(query.accountId);
  const type = lastValue(query.type);
  const from = lastValue(query.from);
  const to = lastValue(query.to);
  const details = [];
  if (accountId !== undefined && !ACCOUNT_RE.test(accountId)) details.push({ field: 'accountId', message: ACCOUNT_MSG });
  if (type !== undefined && !TYPES.includes(type)) details.push({ field: 'type', message: 'Type must be one of deposit, withdrawal, transfer' });
  const fromMs = from === undefined ? null : parseIsoDate(from);
  if (from !== undefined && fromMs === null) details.push({ field: 'from', message: 'from must be a date (YYYY-MM-DD) or ISO 8601 datetime' });
  let toMs = to === undefined ? null : parseIsoDate(to);
  if (to !== undefined && toMs === null) details.push({ field: 'to', message: 'to must be a date (YYYY-MM-DD) or ISO 8601 datetime' });
  if (toMs !== null && DATE_ONLY_RE.test(to)) toMs += 86_400_000 - 1;
  if (fromMs !== null && toMs !== null && fromMs > toMs) details.push({ field: 'to', message: 'to must not be before from' });
  if (details.length) throw new ValidationError(details);
  return { accountId: accountId ?? null, type: type ?? null, fromMs, toMs };
}

export function validateAccountId(accountId) {
  if (!ACCOUNT_RE.test(accountId)) throw new ValidationError([{ field: 'accountId', message: ACCOUNT_MSG }]);
}
