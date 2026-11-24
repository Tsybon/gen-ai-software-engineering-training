import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Variant, Weights } from '../types';
import { colorOf, fmtDuration, fmtPct, fmtTokens, fmtUsd, totalTokens } from '../lib/format';
import AppFrame from '../components/AppFrame';
import Timeline from '../components/Timeline';
import SourceBadge, { type Source } from '../components/SourceBadge';

const BLURB: Record<string, string> = {
  codex: 'Codex CLI alone, fully autonomous, from the shared brief.',
  opus: 'One Claude Opus 5.5 agent alone, fully autonomous, from the shared brief.',
  synergy: 'An Opus planner and a Codex planner wrote rival plans and critiqued each other; the orchestrator decided and built it.',
};

function Stat({ label, value, source }: { label: string; value: string; source: Source }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <SourceBadge source={source} />
    </div>
  );
}

export default function VariantPage({ variant: v, weights }: { variant: Variant; weights: Weights }) {
  const failing = v.acceptance?.tests.filter((t) => !t.passed) ?? [];
  const lim = v.limits;
  return (
    <div className="variant" style={{ ['--c' as string]: colorOf(v) }}>
      <header className="variant-head">
        <h1>{v.label}</h1>
        <p className="lede">{BLURB[v.id]} Models: {v.models.join(', ') || 'n/a'}.</p>
      </header>

      <section className="stats">
        <Stat label="Score" value={v.score === null ? 'n/a' : `${v.score.toFixed(1)}`} source="estimated" />
        <Stat label="Hidden tests" value={v.acceptance ? `${v.acceptance.passed}/${v.acceptance.total}` : 'n/a'} source="actual" />
        <Stat label="Time" value={fmtDuration(v.duration_s)} source="actual" />
        <Stat label="Tokens, all kinds" value={fmtTokens(totalTokens(v.tokens))} source="actual" />
        <Stat label="Output tokens" value={fmtTokens(v.tokens?.output)} source="actual" />
        <Stat label="API-price equivalent" value={fmtUsd(v.cost_usd)} source="estimated" />
        <Stat label="Codex week limit" value={lim?.codex_week_pct == null ? 'n/a' : `+${lim.codex_week_pct} pts`} source="actual" />
        <Stat label="Claude week limit" value={lim?.claude_week_pct == null ? 'n/a' : `+${lim.claude_week_pct} pts`} source="manual" />
      </section>

      <section className="block">
        <header className="block-head"><h2>The app it built</h2><p>Live, against its own API. Every feature you see was written by this setup.</p></header>
        <AppFrame url={v.app_url} label={v.label} />
      </section>

      <section className="block">
        <header className="block-head"><h2>Session replay</h2><p>Reconstructed from the agent logs at 60× speed.</p></header>
        <Timeline events={v.timeline} durationS={v.duration_s} color={colorOf(v)} />
      </section>

      <section className="block">
        <header className="block-head">
          <h2>Hidden acceptance suite</h2>
          <p>Written from TASKS.md after all three runs; no builder saw it. Weight in the score: {fmtPct(weights.correctness * 100)}.</p>
        </header>
        {!v.acceptance ? <p className="muted">Not run yet. Run <code>uv run python run_acceptance.py</code> in <code>benchmark/</code>.</p> : (
          <>
            {failing.length === 0 ? <p className="ok">All {v.acceptance.total} tests pass.</p> : (
              <ul className="failures">
                {failing.map((t) => <li key={t.name}><code>{t.name}</code><span>{t.message ?? 'failed'}</span></li>)}
              </ul>
            )}
            <details className="all-tests">
              <summary>All {v.acceptance.tests.length} tests</summary>
              <ul>{v.acceptance.tests.map((t) => <li key={t.name} className={t.passed ? 'pass' : 'fail'}>{t.passed ? '✓' : '✗'} {t.name}</li>)}</ul>
            </details>
          </>
        )}
      </section>

      {v.debate && (
        <section className="block">
          <header className="block-head"><h2>How the two planners argued</h2><p>Plans first, then each critiqued the other. The decisions table is what got built.</p></header>
          <div className="debate">
            {v.debate.rounds.map((r) => (
              <details key={`${r.author}-${r.round}`} className={`turn turn-${r.author.toLowerCase()}`}>
                <summary>{r.round === 0 ? `${r.author}'s plan` : `${r.author} critiques, round ${r.round}`}</summary>
                <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{r.markdown}</Markdown></div>
              </details>
            ))}
            {v.debate.decisions_md && (
              <details className="turn turn-decision" open>
                <summary>Orchestrator's decisions</summary>
                <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{v.debate.decisions_md}</Markdown></div>
              </details>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
