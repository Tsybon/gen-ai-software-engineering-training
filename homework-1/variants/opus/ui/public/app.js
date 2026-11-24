'use strict';
const API = ((window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || 'http://localhost:3002').replace(/\/$/, '');
const DEMO_PREFIX = 'ACC-DEMO';
const $ = (sel) => document.querySelector(sel);

const state = { all: [], view: [], online: null, selectedAccount: null };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isDemo = (t) => [t.fromAccount, t.toAccount].some((a) => a && a.startsWith(DEMO_PREFIX));
const money = (n, ccy) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(n); }
  catch { return `${Number(n).toFixed(2)} ${ccy}`; }
};
const fmtDate = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

class ApiError extends Error {
  constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.body = body; }
}

async function api(path, init) {
  let res;
  try {
    res = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json' } });
  } catch {
    setOnline(false);
    throw new ApiError(0, { error: 'API unreachable' });
  }
  setOnline(true);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  const pill = $('#apiStatus');
  pill.className = `pill ${online ? 'pill-ok' : 'pill-bad'}`;
  pill.textContent = online ? 'API online' : 'API offline';
  const banner = $('#errorBanner');
  banner.hidden = online;
  if (!online) {
    banner.innerHTML = `<strong>Can't reach the API</strong> at <code>${esc(API)}</code>. Check that it is running, then press Refresh.`;
  }
}

/* ---------- Data loading ---------- */
function filterQuery() {
  const fd = new FormData($('#filters'));
  const qs = new URLSearchParams();
  for (const [k, v] of fd) if (v.trim()) qs.set(k, v.trim());
  return qs.toString();
}

async function refresh() {
  const qs = filterQuery();
  $('#exportBtn').href = `${API}/transactions/export?format=csv${qs ? `&${qs}` : ''}`;
  $('#filterError').hidden = true;
  try {
    const [all, view] = await Promise.all([api('/transactions'), qs ? api(`/transactions?${qs}`) : null]);
    state.all = all;
    state.view = view || all;
  } catch (e) {
    if (e.status === 400) {
      $('#filterError').textContent = e.body.details.map((d) => d.message).join(' · ');
      $('#filterError').hidden = false;
      state.view = [];
    } else {
      state.all = [];
      state.view = [];
    }
  }
  renderKpis();
  renderTable();
  renderChips();
}

/* ---------- KPIs ---------- */
function renderKpis() {
  const all = state.all;
  const count = (s) => all.filter((t) => t.status === s).length;
  const volume = {};
  const used = {};
  for (const t of all) {
    if (t.status !== 'completed') continue;
    volume[t.currency] = (volume[t.currency] || 0) + t.amount;
    used[t.currency] = (used[t.currency] || 0) + 1;
  }
  // Amounts in different currencies are not comparable, so lead with the most-used currency.
  const vols = Object.entries(volume).sort((a, b) => used[b[0]] - used[a[0]] || a[0].localeCompare(b[0]));

  $('#kpiCount').textContent = state.online === false ? '—' : all.length;
  $('#kpiCountSub').textContent = `${count('completed')} completed`;
  $('#kpiVolume').textContent = vols.length ? money(vols[0][1], vols[0][0]) : '—';
  $('#kpiVolumeSub').textContent = vols.length > 1
    ? vols.slice(1, 4).map(([c, v]) => money(v, c)).join(' · ')
    : vols.length ? 'single currency' : 'no completed transactions';
  $('#kpiPending').textContent = state.online === false ? '—' : count('pending');
  $('#kpiFailed').textContent = state.online === false ? '—' : count('failed');
  $('#kpiFailedSub').textContent = all.length ? `${((count('failed') / all.length) * 100).toFixed(1)}% failure rate` : '';
  if (state.online === false) { $('#kpiCountSub').textContent = 'no data'; $('#kpiVolumeSub').textContent = 'no data'; }
}

/* ---------- Table ---------- */
function matchesSearch(t, q) {
  if (!q) return true;
  return [t.id, t.fromAccount, t.toAccount, t.amount, t.currency, t.type, t.status]
    .some((v) => String(v ?? '').toLowerCase().includes(q));
}

function rowHtml(t) {
  const inbound = t.type === 'deposit';
  const sign = t.type === 'deposit' ? '+' : t.type === 'withdrawal' ? '−' : '';
  return `<tr tabindex="0" data-id="${esc(t.id)}">
    <td data-label="Date" class="mono">${esc(fmtDate(t.timestamp))}</td>
    <td data-label="Type"><span class="type-dot t-${esc(t.type)}"></span>${esc(t.type)}${isDemo(t) ? ' <span class="demo-tag">DEMO</span>' : ''}</td>
    <td data-label="From → To" class="mono">${esc(t.fromAccount || '—')}<span class="arrow">→</span>${esc(t.toAccount || '—')}</td>
    <td data-label="Amount" class="num amt ${inbound ? 'amt-in' : 'amt-out'}">${sign}${esc(money(t.amount, t.currency))}</td>
    <td data-label="Status"><span class="badge st-${esc(t.status)}">${esc(t.status)}</span></td>
  </tr>`;
}

function renderTable() {
  const q = $('#fSearch').value.trim().toLowerCase();
  const rows = state.view.filter((t) => matchesSearch(t, q)).slice().reverse();
  $('#txBody').innerHTML = rows.map(rowHtml).join('');
  $('#txMeta').textContent = state.all.length ? `${rows.length} of ${state.all.length}` : '';

  const empty = $('#txEmpty');
  empty.hidden = rows.length > 0;
  if (rows.length) return;
  if (state.online === false) {
    empty.innerHTML = '<strong>API unreachable</strong>Transactions will appear once the API is back.<br><button class="btn" type="button" data-action="refresh">Retry</button>';
  } else if (!state.all.length) {
    empty.innerHTML = '<strong>No transactions yet</strong>Create one with the form, or load clearly-labelled sample data.<br><button class="btn" type="button" data-action="sample">Load sample data <span class="demo-tag">DEMO</span></button>';
  } else {
    empty.innerHTML = '<strong>No matches</strong>Nothing fits the current search and filters.<br><button class="btn" type="button" data-action="clear">Clear filters</button>';
  }
}

/* ---------- Details ---------- */
async function openDetails(id) {
  const dlg = $('#details');
  const body = $('#detailsBody');
  body.innerHTML = '<p class="empty-sm">Loading…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const t = await api(`/transactions/${encodeURIComponent(id)}`);
    const fields = [
      ['ID', t.id], ['Type', t.type], ['Status', t.status], ['From', t.fromAccount || '—'], ['To', t.toAccount || '—'],
      ['Amount', t.amount], ['Currency', t.currency], ['Timestamp', t.timestamp],
      ...(t.failureReason ? [['Failure reason', t.failureReason]] : []),
    ];
    body.innerHTML = `
      <p class="details-amount">${esc(money(t.amount, t.currency))}</p>
      <p><span class="badge st-${esc(t.status)}">${esc(t.status)}</span> ${isDemo(t) ? '<span class="demo-tag">DEMO</span>' : ''}</p>
      <dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  } catch (e) {
    body.innerHTML = `<p class="field-error">${esc(e.status === 404 ? 'Transaction not found.' : e.message)}</p>`;
  }
}

/* ---------- Create form ---------- */
function syncFormFields() {
  const type = new FormData($('#txForm')).get('type');
  $('[data-for="fromAccount"]').hidden = type === 'deposit';
  $('[data-for="toAccount"]').hidden = type === 'withdrawal';
}

function clearFormErrors() {
  document.querySelectorAll('#txForm [data-error]').forEach((el) => { el.textContent = ''; });
  document.querySelectorAll('#txForm input.invalid').forEach((el) => el.classList.remove('invalid'));
  $('#formResult').textContent = '';
  $('#formResult').className = 'form-result';
}

async function submitForm(ev) {
  ev.preventDefault();
  clearFormErrors();
  const form = ev.target;
  const fd = new FormData(form);
  const type = fd.get('type');
  const rawAmount = fd.get('amount').trim();
  const payload = {
    type,
    // Send the raw value as a number when numeric so the API (not the UI) owns validation.
    amount: rawAmount !== '' && !Number.isNaN(Number(rawAmount)) ? Number(rawAmount) : rawAmount,
    currency: fd.get('currency').trim().toUpperCase(),
    status: fd.get('status'),
  };
  if (type !== 'deposit') payload.fromAccount = fd.get('fromAccount').trim();
  if (type !== 'withdrawal') payload.toAccount = fd.get('toAccount').trim();

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const t = await api('/transactions', { method: 'POST', body: JSON.stringify(payload) });
    const result = $('#formResult');
    result.className = `form-result ${t.status === 'failed' ? 'bad' : 'ok'}`;
    result.textContent = t.status === 'failed'
      ? `Recorded as failed: ${t.failureReason || 'rejected'}.`
      : `Created ${t.type} ${money(t.amount, t.currency)} (${t.status}).`;
    form.amount.value = '';
    await refresh();
    if (state.selectedAccount) loadBalance(state.selectedAccount);
  } catch (e) {
    if (e.status === 400 && e.body?.details) {
      for (const d of e.body.details) {
        const slot = form.querySelector(`[data-error="${d.field}"]`) || form.querySelector('[data-error="body"]');
        slot.textContent = slot.textContent ? `${slot.textContent} ${d.message}` : d.message;
        form.elements[d.field]?.classList?.add('invalid');
      }
    } else {
      $('#formResult').className = 'form-result bad';
      $('#formResult').textContent = e.status === 429 ? 'Rate limit reached — wait a minute and retry.' : `Could not create: ${e.message}`;
    }
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Balances ---------- */
function renderChips() {
  const accounts = [...new Set(state.all.flatMap((t) => [t.fromAccount, t.toAccount]).filter(Boolean))].sort();
  $('#accountChips').innerHTML = accounts.slice(0, 16).map((a) =>
    `<button type="button" class="chip${a === state.selectedAccount ? ' active' : ''}" data-account="${esc(a)}">${esc(a)}</button>`).join('');
}

async function loadBalance(accountId) {
  state.selectedAccount = accountId;
  renderChips();
  const out = $('#balResult');
  out.innerHTML = '<p class="empty-sm">Loading…</p>';
  try {
    const [bal, sum] = await Promise.all([
      api(`/accounts/${encodeURIComponent(accountId)}/balance`),
      api(`/accounts/${encodeURIComponent(accountId)}/summary`),
    ]);
    const demo = accountId.startsWith(DEMO_PREFIX) ? ' <span class="demo-tag">DEMO</span>' : '';
    out.innerHTML = bal.balances.length
      ? `<ul class="bal-list">${bal.balances.map((b) => `<li><span class="ccy">${esc(b.currency)}</span><span class="val ${b.balance < 0 ? 'neg' : ''}">${esc(money(b.balance, b.currency))}</span></li>`).join('')}</ul>`
      : '<p class="empty-sm">No completed transactions yet — balance is zero.</p>';
    out.innerHTML += `<p class="bal-meta"><span class="mono">${esc(accountId)}</span>${demo} · ${sum.transactionCount} transactions · last ${sum.mostRecentTransactionDate ? esc(fmtDate(sum.mostRecentTransactionDate)) : '—'}</p>`;
  } catch (e) {
    const msg = e.status === 404 ? 'No transactions found for this account.'
      : e.status === 400 ? (e.body?.details?.[0]?.message || 'Invalid account ID.')
      : e.message;
    out.innerHTML = `<p class="field-error">${esc(msg)}</p>`;
  }
}

/* ---------- Sample data ---------- */
const SAMPLE = [
  { type: 'deposit', toAccount: 'ACC-DEMO1', amount: 5000, currency: 'USD' },
  { type: 'deposit', toAccount: 'ACC-DEMO2', amount: 2500, currency: 'EUR' },
  { type: 'deposit', toAccount: 'ACC-DEMO3', amount: 1200.5, currency: 'GBP' },
  { type: 'transfer', fromAccount: 'ACC-DEMO1', toAccount: 'ACC-DEMO2', amount: 750.25, currency: 'USD' },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO1', amount: 320, currency: 'USD' },
  { type: 'deposit', toAccount: 'ACC-DEMO4', amount: 150000, currency: 'JPY' },
  { type: 'transfer', fromAccount: 'ACC-DEMO2', toAccount: 'ACC-DEMO3', amount: 400, currency: 'EUR' },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO3', amount: 99.99, currency: 'GBP', status: 'pending' },
  { type: 'withdrawal', fromAccount: 'ACC-DEMO4', amount: 9000, currency: 'USD' },
  { type: 'transfer', fromAccount: 'ACC-DEMO3', toAccount: 'ACC-DEMO1', amount: 250, currency: 'GBP' },
];

async function loadSample(btn) {
  if (btn) btn.disabled = true;
  try {
    for (const tx of SAMPLE) await api('/transactions', { method: 'POST', body: JSON.stringify(tx) });
  } catch (e) {
    $('#formResult').className = 'form-result bad';
    $('#formResult').textContent = `Sample data load stopped: ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
    await refresh();
  }
}

/* ---------- Wiring ---------- */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

document.addEventListener('DOMContentLoaded', () => {
  const refetch = debounce(refresh, 250);
  $('#filters').addEventListener('input', (e) => (e.target.id === 'fSearch' ? renderTable() : refetch()));
  $('#filters').addEventListener('change', (e) => { if (e.target.id !== 'fSearch') refetch(); });
  $('#filters').addEventListener('reset', () => setTimeout(refresh, 0));
  $('#filters').addEventListener('submit', (e) => e.preventDefault());

  $('#txBody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetails(tr.dataset.id); });
  $('#txBody').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetails(tr.dataset.id); }
  });
  $('#details').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === e.currentTarget) e.currentTarget.close();
  });

  $('#txEmpty').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') refresh();
    if (action === 'sample') loadSample(e.target.closest('button'));
    if (action === 'clear') $('#filters').reset();
  });

  $('#txForm').addEventListener('change', syncFormFields);
  $('#txForm').addEventListener('submit', submitForm);
  syncFormFields();

  $('#balForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#balAccount').value.trim();
    if (id) loadBalance(id);
  });
  $('#accountChips').addEventListener('click', (e) => {
    const a = e.target.closest('[data-account]')?.dataset.account;
    if (a) { $('#balAccount').value = a; loadBalance(a); }
  });

  $('#sampleBtn').addEventListener('click', (e) => loadSample(e.currentTarget));
  $('#refreshBtn').addEventListener('click', refresh);
  refresh();
});
