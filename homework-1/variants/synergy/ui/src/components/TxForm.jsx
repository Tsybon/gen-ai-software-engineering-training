import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';

const EMPTY = { type: 'deposit', fromAccount: '', toAccount: '', amount: '', currency: 'USD', status: 'completed' };
const SIDES = { deposit: ['toAccount'], withdrawal: ['fromAccount'], transfer: ['fromAccount', 'toAccount'] };

export default function TxForm({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (f) => errors.find((d) => d.field === f)?.message;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setBanner('');
    const body = { type: form.type, amount: form.amount === '' ? undefined : Number(form.amount), currency: form.currency.trim(), status: form.status };
    for (const side of SIDES[form.type]) body[side] = form[side].trim();
    try {
      const created = await api.create(body);
      onCreated(created);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErrors(ex.details);
        setBanner(ex.details.length ? `${ex.message}: ${ex.details.length} issue(s)` : ex.message);
      } else setBanner(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="new-tx" onSubmit={submit} noValidate>
        <header><h2 id="new-tx">New transaction</h2><button type="button" className="icon" aria-label="Close" onClick={onClose}>×</button></header>
        {banner && <div className="banner danger" role="alert">{banner}</div>}
        <fieldset className="segmented wide">
          <legend>Type</legend>
          {Object.keys(SIDES).map((t) => (
            <button ref={t === 'deposit' ? first : null} type="button" key={t} aria-pressed={form.type === t} onClick={() => setForm({ ...form, type: t })}>{t}</button>
          ))}
        </fieldset>
        {SIDES[form.type].map((side) => (
          <label key={side}>
            <span>{side === 'fromAccount' ? 'From account' : 'To account'}</span>
            <input className="mono" placeholder="ACC-12345" value={form[side]} onChange={set(side)} aria-invalid={!!err(side)} />
            {err(side) && <small className="err">{err(side)}</small>}
          </label>
        ))}
        <div className="row">
          <label>
            <span>Amount</span>
            <input className="mono" inputMode="decimal" placeholder="100.50" value={form.amount} onChange={set('amount')} aria-invalid={!!err('amount')} />
            {err('amount') && <small className="err">{err('amount')}</small>}
          </label>
          <label>
            <span>Currency</span>
            <input className="mono" maxLength={3} value={form.currency} onChange={set('currency')} aria-invalid={!!err('currency')} />
            {err('currency') && <small className="err">{err('currency')}</small>}
          </label>
        </div>
        <label>
          <span>Status</span>
          <select value={form.status} onChange={set('status')}>
            <option value="completed">completed</option><option value="pending">pending</option><option value="failed">failed</option>
          </select>
        </label>
        {errors.filter((d) => !['amount', 'currency', 'fromAccount', 'toAccount'].includes(d.field)).map((d) => (
          <small className="err" key={d.field}>{d.field}: {d.message}</small>
        ))}
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        </footer>
      </form>
    </div>
  );
}
