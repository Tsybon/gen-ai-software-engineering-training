import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtTime, isDemo } from '../api.js';
import { StatusPill, TypeBadge, DemoBadge } from './Badges.jsx';

export default function TxDrawer({ id, onClose, onAccount }) {
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setTx(null);
    setError('');
    api.get(id).then((t) => live && setTx(t)).catch((e) => live && setError(e.status === 404 ? 'Transaction not found — the link may be stale (data resets on API restart).' : e.message));
    return () => { live = false; };
  }, [id]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(id); setCopied(true); } catch { setCopied(false); }
  };
  const acc = (a) => (a ? <button type="button" className="link mono" onClick={() => onAccount(a)}>{a}</button> : '—');

  return (
    <div className="overlay drawer-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Transaction details">
        <header><h2>Transaction</h2><button type="button" className="icon" aria-label="Close" onClick={onClose}>×</button></header>
        {error && <div className="banner danger" role="alert">{error}</div>}
        {!tx && !error && <div className="skeleton tall" />}
        {tx && (
          <>
            <div className="drawer-amount mono">{fmtMoney(tx.amount, tx.currency)}</div>
            <div className="drawer-tags"><TypeBadge type={tx.type} /><StatusPill status={tx.status} />{isDemo(tx) && <DemoBadge />}</div>
            <dl className="details">
              <dt>ID</dt><dd className="mono id">{tx.id} <button type="button" className="link" onClick={copy}>{copied ? 'copied' : 'copy'}</button></dd>
              <dt>From</dt><dd>{acc(tx.fromAccount)}</dd>
              <dt>To</dt><dd>{acc(tx.toAccount)}</dd>
              <dt>Currency</dt><dd className="mono">{tx.currency}</dd>
              <dt>Timestamp</dt><dd>{fmtTime(tx.timestamp)}<br /><span className="muted mono small">{tx.timestamp}</span></dd>
              <dt>Balance effect</dt><dd>{tx.status === 'completed' ? 'Applied' : 'Not applied (only completed transactions move balances)'}</dd>
            </dl>
          </>
        )}
      </aside>
    </div>
  );
}
