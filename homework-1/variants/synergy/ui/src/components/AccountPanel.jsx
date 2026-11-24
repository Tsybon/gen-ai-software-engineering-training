import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtTime } from '../api.js';

const ACC_RE = /^ACC-[A-Za-z0-9]{5}$/;

export default function AccountPanel({ account, onAccount, refreshKey }) {
  const [input, setInput] = useState(account);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rate, setRate] = useState('0.05');
  const [days, setDays] = useState('30');
  const [interest, setInterest] = useState(null);
  const [interestError, setInterestError] = useState('');

  useEffect(() => { setInput(account); }, [account]);
  useEffect(() => {
    if (!account) { setData(null); return undefined; }
    let live = true;
    setError('');
    setInterest(null);
    Promise.all([api.balance(account), api.summary(account)])
      .then(([balance, summary]) => live && setData({ balance, summary }))
      .catch((e) => live && setError(e.details?.[0]?.message ?? e.message));
    return () => { live = false; };
  }, [account, refreshKey]);

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim();
    if (!ACC_RE.test(v)) { setError('Account must match format ACC-XXXXX'); return; }
    onAccount(v);
  };
  const calc = async () => {
    setInterestError('');
    try { setInterest(await api.interest(account, rate, days)); } catch (e) { setInterestError(e.details?.map((d) => d.message).join('; ') || e.message); }
  };

  const balances = data ? Object.entries(data.balance.balances).sort(([a], [b]) => a.localeCompare(b)) : [];
  return (
    <section className="panel accounts" aria-label="Account balances">
      <header className="panel-head"><h2>Accounts</h2></header>
      <form className="acc-lookup" onSubmit={submit}>
        <input className="mono" placeholder="ACC-12345" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Account ID" />
        <button className="btn" type="submit">Look up</button>
      </form>
      {error && <small className="err">{error}</small>}
      {!account && !error && <p className="muted small">Enter an account or click one in a transaction to see balances by currency.</p>}
      {data && (
        <>
          {balances.length === 0 && <p className="muted small">No transactions for {account} yet — balance is empty.</p>}
          <div className="balances">
            {balances.map(([cur, amount]) => (
              <div key={cur} className={`balance ${amount < 0 ? 'neg' : ''}`}>
                <span className="cur">{cur}</span>
                <span className="mono amt">{fmtMoney(amount, cur)}</span>
                <span className="muted small">in {fmtMoney(data.summary.totalDeposits[cur] ?? 0, cur)} · out {fmtMoney(data.summary.totalWithdrawals[cur] ?? 0, cur)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">{data.summary.transactionCount} transactions · last {data.summary.mostRecentTransactionDate ? fmtTime(data.summary.mostRecentTransactionDate) : '—'}</p>
          {balances.length > 0 && (
            <div className="interest">
              <label><span>Rate</span><input className="mono" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
              <label><span>Days</span><input className="mono" value={days} onChange={(e) => setDays(e.target.value)} /></label>
              <button type="button" className="btn" onClick={calc}>Project interest</button>
              {interestError && <small className="err">{interestError}</small>}
              {interest && (
                <ul className="interest-list">
                  {interest.results.map((r) => <li key={r.currency} className="mono">+{fmtMoney(r.interest, r.currency)} → {fmtMoney(r.projectedBalance, r.currency)}</li>)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
