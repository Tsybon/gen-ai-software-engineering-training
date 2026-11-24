const HEADER = ['id', 'fromAccount', 'toAccount', 'amount', 'currency', 'type', 'timestamp', 'status'];

const cell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** RFC 4180 CSV with CRLF line endings. */
export function toCsv(records) {
  const rows = records.map((r) => HEADER.map((h) => cell(h === 'amount' ? r.amount.toFixed(2) : r[h])).join(','));
  return [HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}
