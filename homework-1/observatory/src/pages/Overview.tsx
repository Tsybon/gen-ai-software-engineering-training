import type { Metrics } from '../types';
import { byRank, colorOf, fmtDuration, fmtUsd } from '../lib/format';
import RaceLanes from '../components/RaceLanes';
import ComparisonTable from '../components/ComparisonTable';
import { CacheBars, ScoreRadar, TokenBars } from '../components/Charts';
import SourceBadge from '../components/SourceBadge';

function verdict(m: Metrics): string {
  const [first, second] = byRank(m.variants).filter((v) => v.score !== null);
  if (!first) return 'Runs are recorded; the acceptance suite has not scored them yet.';
  if (!second) return `${first.label} is the only scored build so far.`;
  return `${first.label} wins with ${first.score} points, ${(first.score! - second.score!).toFixed(1)} ahead of ${second.label}.`;
}

export default function Overview({ metrics, onOpen }: { metrics: Metrics; onOpen: (id: string) => void }) {
  const ranked = byRank(metrics.variants);
  const w = metrics.weights;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>One banking API, built three ways.</h1>
          <p className="lede">
            Codex alone, Opus alone, and the two arguing their way to one plan. Same brief, same hidden test suite,
            every number read from the agents' own logs. {verdict(metrics)}
          </p>
        </div>
        <ol className="podium" aria-label="Ranking">
          {ranked.map((v) => (
            <li key={v.id} data-testid="rank-row" data-variant={v.id} style={{ ['--c' as string]: colorOf(v) }}>
              <button type="button" onClick={() => onOpen(v.id)}>
                <span className="podium-rank">{v.rank ?? '–'}</span>
                <span className="podium-name">{v.label}</span>
                <span className="podium-score">{v.score === null ? 'n/a' : v.score.toFixed(1)}</span>
                <span className="podium-meta">
                  {v.acceptance ? `${v.acceptance.passed}/${v.acceptance.total} tests` : 'n/a tests'}, {fmtDuration(v.duration_s)}, {fmtUsd(v.cost_usd)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="block">
        <header className="block-head">
          <h2>The race</h2>
          <p>Every tick is one action an agent took, placed on the minute it happened. Click a lane to open that build.</p>
        </header>
        <RaceLanes variants={metrics.variants} onOpen={onOpen} />
      </section>

      <section className="block grid-2">
        <div>
          <header className="block-head"><h2>Where each build is strong</h2><p>Higher is better on every axis, scaled across the three builds.</p></header>
          <ScoreRadar variants={ranked} />
        </div>
        <div>
          <header className="block-head"><h2>Tokens spent</h2><p>Cache reads are shown separately below — they dwarf everything else.</p></header>
          <TokenBars variants={ranked} />
        </div>
      </section>

      <section className="block grid-2">
        <div>
          <header className="block-head"><h2>Cache reads</h2><p>Context re-read on every turn. Cheap per token, but the bulk of the volume.</p></header>
          <CacheBars variants={ranked} />
        </div>
        <div className="method">
          <h2>How the score is built</h2>
          <p>
            Correctness {w.correctness * 100}% (share of hidden acceptance tests passed), cost {w.cost * 100}%,
            time {w.time * 100}%, subscription limits {w.limits * 100}%. Cost, time and limits are scaled between the
            cheapest/fastest/lightest build (full marks) and the most expensive one (zero).
          </p>
          <ul className="sources">
            <li><SourceBadge source="actual" /> read from Codex and Claude Code session logs, or measured by the test suite.</li>
            <li><SourceBadge source="estimated" /> tokens multiplied by public API list prices (retrieved {metrics.prices.retrieved ?? 'n/a'}). The runs used subscriptions, so nobody was billed this.</li>
            <li><SourceBadge source="manual" /> Claude <code>/usage</code> percentages typed in before and after each run.</li>
          </ul>
        </div>
      </section>

      <section className="block">
        <header className="block-head"><h2>Side by side</h2></header>
        <ComparisonTable variants={ranked} />
      </section>
    </>
  );
}
