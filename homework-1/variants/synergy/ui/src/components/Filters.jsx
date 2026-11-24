const TYPES = ['', 'deposit', 'withdrawal', 'transfer'];

export default function Filters({ filters, onChange, search, onSearch, exportUrl, error }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value.trim() });
  const fieldError = (f) => error?.find((d) => d.field === f)?.message;
  return (
    <section className="filters" aria-label="Filters">
      <label className="f-search">
        <span>Search loaded</span>
        <input type="search" placeholder="id, account, currency…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </label>
      <label>
        <span>Account</span>
        <input placeholder="ACC-12345" value={filters.accountId} onChange={set('accountId')} aria-invalid={!!fieldError('accountId')} />
        {fieldError('accountId') && <small className="err">{fieldError('accountId')}</small>}
      </label>
      <fieldset className="segmented">
        <legend>Type</legend>
        {TYPES.map((t) => (
          <button type="button" key={t || 'all'} aria-pressed={filters.type === t} onClick={() => onChange({ ...filters, type: t })}>
            {t || 'all'}
          </button>
        ))}
      </fieldset>
      <label>
        <span>From</span>
        <input type="date" value={filters.from} onChange={set('from')} />
      </label>
      <label>
        <span>To</span>
        <input type="date" value={filters.to} onChange={set('to')} aria-invalid={!!fieldError('to')} />
        {fieldError('to') && <small className="err">{fieldError('to')}</small>}
      </label>
      <div className="f-actions">
        <button type="button" className="btn ghost" onClick={() => { onChange({ accountId: '', type: '', from: '', to: '' }); onSearch(''); }}>Clear</button>
        <a className="btn ghost" href={exportUrl} download>Export CSV</a>
      </div>
    </section>
  );
}
