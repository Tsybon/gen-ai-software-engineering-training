const icons = {
  activity:'M3 12h4l3-8 4 16 3-8h4', wallet:'M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6m18 7h-5v4h5m-2-2h.01',
  arrows:'M7 3v17m-4-4 4 4 4-4M17 21V4m-4 4 4-4 4 4', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', plus:'M12 5v14M5 12h14',
  chart:'M4 3v17h17M8 15v-4m5 4V7m5 8V5', clock:'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
  layers:'m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5', refresh:'M20 7v5h-5M4 17v-5h5m10-3a8 8 0 0 0-13-3L4 9m1 6a8 8 0 0 0 13 3l2-3',
  search:'m21 21-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', arrow:'M5 12h14m-5-5 5 5-5 5', close:'m6 6 12 12M6 18 18 6', info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  deposit:'M12 3v14m-5-5 5 5 5-5M4 18v3h16v-3', withdrawal:'M12 18V4m-5 5 5-5 5 5M4 18v3h16v-3', transfer:'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4', chevron:'m9 5 7 7-7 7'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.activity}"/></svg>`;
function renderIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); }); }
renderIcons();
document.querySelectorAll('[data-error]').forEach(el => {
  el.id = `error-${el.dataset.error}`;
  document.querySelector(`[name="${el.dataset.error}"]`)?.setAttribute('aria-describedby', el.id);
});
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API = window.APP_CONFIG.apiBaseUrl.replace(/\/$/, '');
let allTransactions = [];
let filteredTransactions = [];
let currentRequest = 0;
let balanceRequest = 0;
let detailsRequest = 0;
let createSession = 0;
let toastTimeout;
let debounceTimeout;
const number = value => new Intl.NumberFormat('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(value);
const date = value => new Intl.DateTimeFormat('en-GB', { month:'short', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
const status = value => `<span class="status ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch(`${API}${path}`, { ...options, signal:AbortSignal.timeout(10000) }); }
  catch { throw new Error('The API is unreachable. Check the server and API_BASE_URL, then try again.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.details = body.details || []; error.status = response.status; throw error;
  }
  return body;
}
function setConnection(online) {
  $('connection').className = `connection ${online ? 'online' : 'offline'}`;
  $('connection').innerHTML = `<i></i>${online ? 'API connected' : 'API offline'}`;
}
function showApiError(error) {
  setConnection(false); $('api-error').hidden = false; $('api-error-message').textContent = error.message;
}
function filterQuery() {
  const query = new URLSearchParams();
  for (const [id, key] of [['account-filter','accountId'],['type-filter','type'],['from-filter','from'],['to-filter','to']]) {
    if ($(id).value.trim()) query.set(key, $(id).value.trim());
  }
  return query;
}
function totalsByCurrency(transactions) {
  return transactions.filter(t => t.status === 'completed').reduce((totals, transaction) => ({ ...totals, [transaction.currency]:(totals[transaction.currency] || 0) + Math.round(transaction.amount * 100) }), {});
}
function renderMetrics() {
  const completed = allTransactions.filter(t => t.status === 'completed').length;
  const failed = allTransactions.filter(t => t.status === 'failed').length;
  const totals = Object.entries(totalsByCurrency(allTransactions)).sort((a,b) => b[1]-a[1]);
  $('total-count').textContent = allTransactions.length.toLocaleString();
  $('nav-count').textContent = allTransactions.length;
  $('completed-count').textContent = `${completed.toLocaleString()} completed`;
  $('pending-count').textContent = allTransactions.filter(t => t.status === 'pending').length.toLocaleString();
  $('failed-count').textContent = failed.toLocaleString();
  $('failed-note').textContent = failed ? `${(100*failed/allTransactions.length).toFixed(1)}% of all transactions` : 'No failed transactions';
  $('total-volume').textContent = totals.length ? totals.length > 1 ? `${totals.length} currencies` : `${number(totals[0][1]/100)} ${totals[0][0]}` : '—';
  $('total-volume').title = totals.map(([currency,total]) => `${number(total/100)} ${currency}`).join(' · ');
  $('volume-note').textContent = totals.length > 1 ? 'See currency totals below' : 'Completed amounts · no conversion';
  const maximum = totals[0]?.[1] || 1;
  $('currency-volume').innerHTML = totals.length ? totals.map(([currency,total]) => `<div class="currency-row"><span>${escapeHtml(currency)}</span><div class="volume-track"><div class="volume-fill" style="width:${total/maximum*100}%"></div></div><strong>${number(total/100)}</strong></div>`).join('') : '<div class="quiet volume-empty">Currency activity will appear after your first completed transaction.</div>';
}
function renderTransactions() {
  const search = $('search').value.trim().toLowerCase();
  const visible = filteredTransactions.filter(t => [t.id,t.fromAccount,t.toAccount,t.currency,t.status].some(value => String(value || '').toLowerCase().includes(search)));
  $('transactions').innerHTML = [...visible].reverse().map(t => `<tr><td><div class="transaction-main"><span class="tx-icon ${escapeHtml(t.type)}">${svg(t.type)}</span><div><button class="tx-id" data-detail="${escapeHtml(t.id)}" title="${escapeHtml(t.id)}">${escapeHtml(t.id.slice(0,8))}${t.demo ? '<span class="demo-label">DEMO</span>' : ''}</button><div class="tx-time">${escapeHtml(date(t.timestamp))}</div></div></div></td><td class="type-name">${escapeHtml(t.type)}</td><td class="account-cell ${t.fromAccount ? '' : 'external-cell'}">${escapeHtml(t.fromAccount || 'External')}</td><td class="account-cell ${t.toAccount ? '' : 'external-cell'}">${escapeHtml(t.toAccount || 'External')}</td><td class="amount-col"><span class="amount-value">${number(t.amount)}</span><span class="currency-tag">${escapeHtml(t.currency)}</span></td><td>${status(t.status)}</td><td><button class="icon-button row-details" data-detail="${escapeHtml(t.id)}" aria-label="View transaction ${escapeHtml(t.id.slice(0,8))}">${svg('chevron')}</button></td></tr>`).join('');
  $('history-count').textContent = visible.length;
  $('table-count').textContent = `Showing ${visible.length} of ${allTransactions.length} transactions`;
  $('empty').hidden = visible.length > 0;
  const hasFilters = search || filterQuery().size > 0;
  $('clear-filters').hidden = !hasFilters;
  if (!visible.length) {
    $('empty').querySelector('h3').textContent = hasFilters ? 'No matching transactions' : 'Your ledger starts here';
    $('empty').querySelector('p').textContent = hasFilters ? 'Try another account, type or date range, or clear your filters.' : 'Create your first transaction or explore a clearly labelled demo dataset.';
    $('empty-create').hidden = !!hasFilters;
  }
}
async function refresh() {
  const revision = ++currentRequest;
  $('refresh').disabled = true;
  try {
    const all = await request('/transactions');
    const query = filterQuery();
    const filtered = query.size ? await request(`/transactions?${query}`) : all;
    if (revision !== currentRequest) return;
    allTransactions = all; filteredTransactions = filtered;
    $('api-error').hidden = true; $('filter-error').hidden = true;
    setConnection(true); renderMetrics(); renderTransactions();
    if (all.some(t => t.demo)) { demoLoaded = true; $('demo').disabled = true; $('demo').textContent = 'Demo data loaded'; }
    if ($('balance-account').value && $('balance-account').checkValidity()) await loadBalance();
  } catch (error) {
    if (revision !== currentRequest) return;
    if (error.status === 400) {
      setConnection(true); $('filter-error').textContent = error.details.map(d => d.message).join(' · ') || error.message; $('filter-error').hidden = false;
      filteredTransactions = []; renderTransactions();
    } else showApiError(error);
  } finally { if (revision === currentRequest) $('refresh').disabled = false; }
}
function openCreate() {
  createSession++;
  clearFormErrors();
  $('create-error').hidden = true;
  $('create-dialog').showModal();
}
function updateTypeFields() {
  const type = $('create-type').value;
  const form = $('transaction-form');
  form.elements.fromAccount.disabled = type === 'deposit';
  form.elements.toAccount.disabled = type === 'withdrawal';
  $('from-field').hidden = type === 'deposit';
  $('to-field').hidden = type === 'withdrawal';
  $('from-field').classList.toggle('full', type === 'withdrawal');
  $('to-field').classList.toggle('full', type === 'deposit');
}
function clearFormErrors() {
  document.querySelectorAll('[data-error]').forEach(el => { el.textContent = ''; });
  $('transaction-form').querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  $('create-error').hidden = true;
}
$('transaction-form').addEventListener('submit', async event => {
  event.preventDefault(); clearFormErrors();
  const form = event.currentTarget;
  const session = createSession;
  const values = Object.fromEntries(new FormData(form));
  const body = { ...values, amount:values.amount === '' ? null : Number(values.amount) };
  $('submit-transaction').disabled = true;
  try {
    await request('/transactions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (session === createSession) { $('create-dialog').close(); form.reset(); updateTypeFields(); }
    notify('Transaction created successfully.'); await refresh();
  } catch (error) {
    if (session !== createSession) return;
    if (error.details?.length) {
      for (const detail of error.details) {
        const target = form.querySelector(`[data-error="${detail.field}"]`);
        if (target) { target.textContent = detail.message; form.elements[detail.field]?.setAttribute('aria-invalid','true'); }
      }
      form.querySelector('[aria-invalid=true]')?.focus();
    }
    $('create-error').textContent = error.details?.length ? 'Please correct the highlighted fields.' : error.message;
    $('create-error').hidden = false;
  } finally { $('submit-transaction').disabled = false; }
});
async function openDetails(id) {
  const revision = ++detailsRequest;
  $('details-content').innerHTML = '<p class="quiet" style="padding:0 25px 25px">Loading transaction…</p>';
  $('details-dialog').showModal();
  try {
    const t = await request(`/transactions/${encodeURIComponent(id)}`);
    if (revision !== detailsRequest) return;
    const rows = [['Transaction ID',t.id],['Type',t.type],['From account',t.fromAccount || 'External'],['To account',t.toAccount || 'External'],['Recorded at',`${date(t.timestamp)} (local time)`],['Balance impact',t.status === 'completed' ? 'Applied' : 'Not applied'],...(t.demo ? [['Dataset','DEMO']] : [])];
    $('details-content').innerHTML = `<div class="details-amount"><strong>${number(t.amount)} <span class="currency-tag">${escapeHtml(t.currency)}</span></strong>${status(t.status)}</div><dl class="detail-list">${rows.map(([label,value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd class="${label === 'Transaction ID' ? 'full-id' : ''}">${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  } catch (error) { if (revision !== detailsRequest) return; $('details-content').innerHTML = `<p class="inline-error">${escapeHtml(error.message)}</p>`; }
}
async function loadBalance() {
  const account = $('balance-account').value;
  const revision = ++balanceRequest;
  $('balance-result').textContent = 'Loading balances…';
  try {
    const result = await request(`/accounts/${encodeURIComponent(account)}/balance`);
    if (revision !== balanceRequest) return;
    const entries = Object.entries(result.balances);
    $('balance-result').innerHTML = entries.length ? entries.map(([currency,amount]) => `<div class="balance-currency"><span>${escapeHtml(currency)}</span><strong>${number(amount)}</strong></div>`).join('') : '<p class="quiet">No completed activity for this account. Its balance is zero in every currency.</p>';
  } catch (error) { if (revision === balanceRequest) $('balance-result').innerHTML = `<p class="inline-error">${escapeHtml(error.details?.map(d => d.message).join(' · ') || error.message)}</p>`; }
}
$('balance-form').addEventListener('submit', event => { event.preventDefault(); loadBalance(); });
$('balance-account').addEventListener('input', () => { balanceRequest++; $('balance-result').innerHTML = '<p class="quiet">Select Look up to view this account’s balances.</p>'; });
$('transactions').addEventListener('click', event => { const button = event.target.closest('[data-detail]'); if (button) openDetails(button.dataset.detail); });
$('create').addEventListener('click', openCreate); $('empty-create').addEventListener('click', openCreate);
$('create-type').addEventListener('change', () => { clearFormErrors(); updateTypeFields(); });
$('transaction-form').addEventListener('input', event => {
  const field = event.target;
  field.removeAttribute('aria-invalid');
  const error = $('transaction-form').querySelector(`[data-error="${field.name}"]`);
  if (error) error.textContent = '';
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close(); } }));
$('filters').addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounceTimeout); refresh(); });
$('search').addEventListener('input', renderTransactions);
for (const id of ['account-filter','type-filter','from-filter','to-filter']) $(id).addEventListener(id === 'account-filter' ? 'input' : 'change', () => { clearTimeout(debounceTimeout); debounceTimeout = setTimeout(refresh, id === 'account-filter' ? 350 : 0); });
$('clear-filters').addEventListener('click', () => { $('filters').reset(); clearTimeout(debounceTimeout); refresh(); });
$('refresh').addEventListener('click', refresh); $('retry').addEventListener('click', refresh);
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const query = filterQuery(); query.set('format','csv');
    const response = await fetch(`${API}/transactions/export?${query}`, { signal:AbortSignal.timeout(10000) });
    if (!response.ok) { const body=await response.json(); throw new Error(body.details?.map(d => d.message).join(' · ') || body.error || 'Export failed'); }
    const blob = await response.blob();
    const link = document.createElement('a'); const url=URL.createObjectURL(blob);
    link.href=url; link.download='ledger-transactions.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    notify('CSV exported using account, type and date filters.');
  } catch (error) { notify(`Export failed: ${error.message}`); }
  finally { $('export').disabled = false; }
});
const demoRecords = [
  {type:'deposit',toAccount:'ACC-10001',amount:24500,currency:'USD',status:'completed'},
  {type:'deposit',toAccount:'ACC-10002',amount:18250,currency:'EUR',status:'completed'},
  {type:'transfer',fromAccount:'ACC-10001',toAccount:'ACC-10003',amount:1250,currency:'USD',status:'completed'},
  {type:'withdrawal',fromAccount:'ACC-10002',amount:480,currency:'EUR',status:'completed'},
  {type:'transfer',fromAccount:'ACC-10003',toAccount:'ACC-10004',amount:850,currency:'GBP',status:'pending'},
  {type:'deposit',toAccount:'ACC-10001',amount:6800,currency:'GBP',status:'completed'},
  {type:'withdrawal',fromAccount:'ACC-10001',amount:325,currency:'USD',status:'failed'},
  {type:'transfer',fromAccount:'ACC-10002',toAccount:'ACC-10004',amount:2340.5,currency:'EUR',status:'completed'}
];
let demoLoaded = false;
$('demo').addEventListener('click', async () => {
  if (demoLoaded) return;
  $('demo').disabled = true;
  let created = 0;
  try {
    for (const record of demoRecords) { await request('/transactions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...record,demo:true})}); created++; }
    demoLoaded = true; $('demo').textContent = 'Demo data loaded';
    $('balance-account').value='ACC-10001';
    notify('8 DEMO transactions added. All demo records are labelled.');
  } catch (error) { notify(`${created} DEMO records added. ${error.message}`); }
  finally { $('demo').disabled = demoLoaded; await refresh(); }
});
updateTypeFields();
refresh();
