import { fmtMoney, fmtTime, isDemo } from '../api.js';
import { StatusPill, TypeBadge, DemoBadge } from './Badges.jsx';

export default function TxTable({ rows, onOpen }) {
  return (
    <div className="table-wrap">
      <table className="tx">
        <thead>
          <tr><th>Time</th><th>Type</th><th>From → To</th><th className="num">Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} tabIndex={0} onClick={() => onOpen(t.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}>
              <td data-label="Time">{fmtTime(t.timestamp)}</td>
              <td data-label="Type"><TypeBadge type={t.type} /> {isDemo(t) && <DemoBadge />}</td>
              <td data-label="Accounts" className="mono">{t.fromAccount ?? '—'} → {t.toAccount ?? '—'}</td>
              <td data-label="Amount" className="num mono">{fmtMoney(t.amount, t.currency)}</td>
              <td data-label="Status"><StatusPill status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
