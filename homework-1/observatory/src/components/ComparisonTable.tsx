import type { ReactNode } from 'react';
import type { Variant } from '../types';
import { colorOf, fmtDuration, fmtPct, fmtTokens, fmtUsd } from '../lib/format';
import SourceBadge, { type Source } from './SourceBadge';

interface Row {
  label: string;
  source: Source;
  value: (v: Variant) => ReactNode;
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'n/a' : `+${n}`);

const ROWS: Row[] = [
  { label: 'Acceptance tests passed', source: 'actual', value: (v) => (v.acceptance ? `${v.acceptance.passed} / ${v.acceptance.total}` : 'n/a') },
  { label: 'Wall-clock time', source: 'actual', value: (v) => fmtDuration(v.duration_s) },
  { label: 'Input tokens (uncached)', source: 'actual', value: (v) => fmtTokens(v.tokens?.input) },
  { label: 'Cache reads', source: 'actual', value: (v) => fmtTokens(v.tokens?.cache_read) },
  { label: 'Cache writes', source: 'actual', value: (v) => fmtTokens(v.tokens?.cache_write) },
  { label: 'Output tokens', source: 'actual', value: (v) => fmtTokens(v.tokens?.output) },
  { label: 'API-price equivalent', source: 'estimated', value: (v) => fmtUsd(v.cost_usd) },
  { label: 'Codex weekly limit, pct points', source: 'actual', value: (v) => pct(v.limits?.codex_week_pct) },
  { label: 'Claude weekly limit, pct points', source: 'manual', value: (v) => pct(v.limits?.claude_week_pct) },
  { label: 'Claude 5-hour session, pct points', source: 'manual', value: (v) => pct(v.limits?.claude_session_pct) },
  { label: 'Lines of code', source: 'actual', value: (v) => v.code?.loc.toLocaleString('en-US') ?? 'n/a' },
  { label: 'Ships its own tests', source: 'actual', value: (v) => (v.code ? (v.code.has_tests ? 'yes' : 'no') : 'n/a') },
  { label: 'Score, of 100', source: 'estimated', value: (v) => (v.score === null ? 'n/a' : v.score.toFixed(1)) },
];

export default function ComparisonTable({ variants }: { variants: Variant[] }) {
  return (
    <div className="table-scroll">
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {variants.map((v) => <th scope="col" key={v.id} style={{ color: colorOf(v) }}>{v.label}</th>)}
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {variants.map((v) => <td key={v.id}>{row.value(v)}</td>)}
              <td><SourceBadge source={row.source} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
