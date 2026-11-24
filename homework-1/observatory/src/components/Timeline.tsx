import { useEffect, useState } from 'react';
import type { TimelineEvent } from '../types';
import { fmtDuration, fmtTokens } from '../lib/format';

const SPEED = 60; // 1 s of playback = 1 min of the run
const TICK_MS = 100;
const KIND_LABEL: Record<string, string> = {
  read: 'Read', write: 'Wrote', command: 'Ran', test_fail: 'Tests failed', test_pass: 'Tests passed', message: 'Agent message',
};

interface Props {
  events: TimelineEvent[];
  durationS: number | null;
  color: string;
}

/** Replays a session from its log: a cursor sweeps the run, events light up as it passes them. */
export default function Timeline({ events, durationS, color }: Props) {
  const total = Math.max(durationS ?? 0, events.at(-1)?.t ?? 0, 1);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setCursor((c) => {
        const next = c + (SPEED * TICK_MS) / 1000;
        if (next >= total) { setPlaying(false); return total; }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, total]);

  const toggle = () => {
    if (!playing && cursor >= total) setCursor(0);
    setPlaying((p) => !p);
  };
  const shown = events.filter((e) => e.t <= cursor);
  const detail = selected === null ? shown.at(-1) : events[selected];

  if (!events.length) return <p className="muted">No log events were recorded for this run.</p>;
  return (
    <div className="replay" style={{ ['--c' as string]: color }}>
      <div className="replay-controls">
        <button type="button" className="btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={total} step={1} value={Math.round(cursor)} aria-label="Replay position"
          onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} />
        <span className="replay-clock">{fmtDuration(Math.round(cursor))} / {fmtDuration(Math.round(total))}</span>
      </div>
      <div className="replay-track">
        <span className="replay-cursor" data-testid="cursor" data-t={Math.round(cursor)} style={{ left: `${(cursor / total) * 100}%` }} />
        {events.map((e, i) => (
          <button type="button" key={i} aria-label={`${fmtDuration(e.t)} ${e.label}`}
            className={`dot dot-${e.kind} ${e.t <= cursor ? 'lit' : ''} ${selected === i ? 'sel' : ''}`}
            style={{ left: `${(e.t / total) * 100}%` }} onClick={() => { setSelected(i); setCursor(e.t); setPlaying(false); }} />
        ))}
      </div>
      <div className="replay-detail" data-testid="event-detail" aria-live="polite">
        {detail ? (
          <>
            <strong>{KIND_LABEL[detail.kind] ?? detail.kind}</strong> at {fmtDuration(detail.t)}
            {detail.tokens !== null && <> · {fmtTokens(detail.tokens)} output tokens on that step</>}
            <code>{detail.label}</code>
          </>
        ) : <span className="muted">Press Play to replay the session, or click any point.</span>}
      </div>
      <p className="muted small">{shown.length} of {events.length} actions so far</p>
    </div>
  );
}
