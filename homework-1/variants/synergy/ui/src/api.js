export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3003').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.details = body?.details ?? [];
  }
}

export class NetworkError extends Error {}

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch {
    throw new NetworkError(`API unreachable at ${API_BASE}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

const qs = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  health: () => call('/health'),
  list: (filters) => call(`/transactions${qs(filters)}`),
  get: (id) => call(`/transactions/${encodeURIComponent(id)}`),
  create: (body) => call('/transactions', { method: 'POST', body: JSON.stringify(body) }),
  balance: (acc) => call(`/accounts/${encodeURIComponent(acc)}/balance`),
  summary: (acc) => call(`/accounts/${encodeURIComponent(acc)}/summary`),
  interest: (acc, rate, days) => call(`/accounts/${encodeURIComponent(acc)}/interest${qs({ rate, days })}`),
  exportUrl: (filters) => `${API_BASE}/transactions/export${qs({ ...filters, format: 'csv' })}`,
};

export const isDemo = (t) => [t.fromAccount, t.toAccount].some((a) => a?.startsWith('ACC-DEMO'));

export const fmtMoney = (amount, currency) =>
  `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const fmtTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
