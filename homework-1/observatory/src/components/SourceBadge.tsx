export type Source = 'actual' | 'estimated' | 'manual';

const HINT: Record<Source, string> = {
  actual: 'Read from agent logs or measured by the acceptance suite',
  estimated: 'Tokens × public API list price — the runs used subscriptions, so this is not an invoice',
  manual: 'Typed in from /usage snapshots taken before and after each run',
};

export default function SourceBadge({ source }: { source: Source }) {
  return <span className={`src src-${source}`} title={HINT[source]}>{source}</span>;
}
