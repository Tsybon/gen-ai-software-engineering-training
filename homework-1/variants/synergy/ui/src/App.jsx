import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, API_BASE, ApiError, isDemo } from './api.js';
import { loadDemo } from './demo.js';
import KpiCards from './components/KpiCards.jsx';
import Filters from './components/Filters.jsx';
import TxTable from './components/TxTable.jsx';
import TxForm from './components/TxForm.jsx';
import TxDrawer from './components/TxDrawer.jsx';
import AccountPanel from './components/AccountPanel.jsx';

const HEALTH_POLL_MS = 15_000;
const FILTER_DEBOUNCE_MS = 250;
const EMPTY_FILTERS = { accountId: '', type: '', from: '', to: '' };

const readTxParam = () => new URLSearchParams(window.location.search).get('transaction');
function writeTxParam(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('transaction', id); else url.searchParams.delete('transaction');
  window.history.replaceState(null, '', url);
}

function useHealth() {
  const [online, setOnline] = useState(null);
  useEffect(() => {
    const check = () => api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    check();
    const id = setInterval(check, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, []);
  return online;
}

export default function App() {
  const online = useHealth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(readTxParam);
  const [account, setAccount] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      api.list(filters)
        .then((data) => { if (live) { setRows(data); setState('ready'); setError(null); } })
        .catch((e) => { if (live) { setState(e instanceof ApiError ? 'invalid' : 'offline'); setError(e); } });
    }, FILTER_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(id); };
  }, [filters, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const open = useCallback((id) => { setOpenId(id); writeTxParam(id); }, []);
  const close = useCallback(() => { setOpenId(null); writeTxParam(null); }, []);
  const pickAccount = (acc) => { setAccount(acc); close(); };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => [t.id, t.fromAccount, t.toAccount, t.currency, t.status, t.type].some((v) => v?.toLowerCase().includes(q)));
  }, [rows, search]);

  const hasDemo = rows.some(isDemo);
  async function seed() {
    setNotice('Loading DEMO data…');
    const { created, failed } = await loadDemo();
    setNotice(failed ? `DEMO: ${created} created, ${failed} failed` : `DEMO: ${created} sample transactions created`);
    refresh();
  }

  const filtered = Object.values(filters).some(Boolean);
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">◆</span>
          <div><h1>Ledger Console</h1><p className="muted small">In-memory transactions API</p></div>
        </div>
        <div className="top-actions">
          <span className={`status-dot ${online === false ? 'off' : online ? 'on' : ''}`} aria-live="polite">
            {online === null ? 'checking API' : online ? 'API online' : 'API offline'}
          </span>
          <button type="button" className="btn ghost" onClick={seed} disabled={hasDemo || state === 'offline'} title={hasDemo ? 'DEMO data already loaded' : 'Create sample records labelled DEMO'}>
            Load DEMO data
          </button>
          <button type="button" className="btn primary" onClick={() => setCreating(true)} disabled={state === 'offline'}>+ New transaction</button>
        </div>
      </header>
      {notice && <div className="banner info" role="status">{notice} <button type="button" className="link" onClick={() => setNotice('')}>dismiss</button></div>}

      {state === 'offline' ? (
        <div className="banner danger big" role="alert">
          <strong>API unreachable.</strong> Tried <code>{API_BASE}</code>. Start the API with <code>run.sh</code>, then
          <button type="button" className="btn" onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <KpiCards transactions={rows} accountId={filters.accountId && !error ? filters.accountId : ''} />
          <main className="layout">
            <section className="panel">
              <header className="panel-head">
                <h2>Transactions</h2>
                <span className="muted small">{search ? `${visible.length} of ${rows.length} loaded` : `${rows.length} shown`}</span>
              </header>
              <Filters filters={filters} onChange={setFilters} search={search} onSearch={setSearch}
                exportUrl={api.exportUrl(filters)} error={state === 'invalid' ? error?.details : null} />
              {state === 'loading' && <div className="skeleton-list"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
              {state === 'invalid' && <div className="banner danger" role="alert">Filters rejected by API: {error.details.map((d) => d.message).join('; ')}</div>}
              {state === 'ready' && rows.length === 0 && !filtered && (
                <div className="empty">
                  <p className="empty-title">No transactions yet</p>
                  <p className="muted">Create one, or load clearly-labelled DEMO data to explore.</p>
                  <div className="empty-actions">
                    <button type="button" className="btn primary" onClick={() => setCreating(true)}>+ New transaction</button>
                    <button type="button" className="btn ghost" onClick={seed}>Load DEMO data</button>
                  </div>
                </div>
              )}
              {state === 'ready' && visible.length === 0 && (filtered || search) && (
                <div className="empty">
                  <p className="empty-title">Nothing matches these filters</p>
                  <button type="button" className="btn ghost" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); }}>Reset filters</button>
                </div>
              )}
              {state === 'ready' && visible.length > 0 && <TxTable rows={visible} onOpen={open} />}
            </section>
            <AccountPanel account={account} onAccount={setAccount} refreshKey={refreshKey} />
          </main>
        </>
      )}

      {creating && <TxForm onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); setNotice(`Created ${t.type} ${t.id.slice(0, 8)}…`); refresh(); }} />}
      {openId && <TxDrawer id={openId} onClose={close} onAccount={pickAccount} />}
    </div>
  );
}
