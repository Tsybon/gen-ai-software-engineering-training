import { fmtMoney } from '../api.js';

/** Ledger-wide: inflow = deposits, outflow = withdrawals; account-scoped: credits/debits incl. transfers. */
function flows(transactions, accountId) {
  const inflow = {};
  const outflow = {};
  const add = (bucket, t) => { bucket[t.currency] = (bucket[t.currency] ?? 0) + Math.round(t.amount * 100); };
  for (const t of transactions) {
    if (t.status !== 'completed') continue;
    if (accountId) {
      if (t.toAccount === accountId) add(inflow, t);
      if (t.fromAccount === accountId) add(outflow, t);
    } else if (t.type === 'deposit') add(inflow, t);
    else if (t.type === 'withdrawal') add(outflow, t);
  }
  return { inflow, outflow };
}

function MoneyLines({ cents }) {
  const entries = Object.entries(cents).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <div className="kpi-value muted">—</div>;
  return (
    <ul className="kpi-lines">
      {entries.map(([cur, c]) => <li key={cur}>{fmtMoney(c / 100, cur)}</li>)}
    </ul>
  );
}

export default function KpiCards({ transactions, accountId }) {
  const { inflow, outflow } = flows(transactions, accountId);
  const failed = transactions.filter((t) => t.status === 'failed').length;
  const pending = transactions.filter((t) => t.status === 'pending').length;
  const scope = accountId ? `for ${accountId}` : 'all accounts';
  return (
    <section className="kpis" aria-label="Key metrics">
      <article className="kpi">
        <h3>Transactions</h3>
        <div className="kpi-value">{transactions.length}</div>
        <p className="kpi-foot">{pending} pending · {scope}</p>
      </article>
      <article className="kpi">
        <h3>{accountId ? 'Credits' : 'Inflow'} <span className="muted">completed</span></h3>
        <MoneyLines cents={inflow} />
      </article>
      <article className="kpi">
        <h3>{accountId ? 'Debits' : 'Outflow'} <span className="muted">completed</span></h3>
        <MoneyLines cents={outflow} />
      </article>
      <article className={`kpi ${failed ? 'kpi-danger' : ''}`}>
        <h3>Failed</h3>
        <div className="kpi-value">{failed}</div>
        <p className="kpi-foot">not applied to balances</p>
      </article>
    </section>
  );
}
