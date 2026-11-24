import type { Variant } from '../types';
import { colorOf, fmtDuration } from '../lib/format';

const KIND_SHAPE: Record<string, string> = { test_fail: 'tick-fail', test_pass: 'tick-pass', write: 'tick-write' };

/** All runs on one shared time axis: the race. Each tick is one agent action. */
export default function RaceLanes({ variants, onOpen }: { variants: Variant[]; onOpen: (id: string) => void }) {
  const longest = Math.max(60, ...variants.map((v) => v.duration_s ?? 0));
  const minutes = Math.ceil(longest / 60);
  const step = minutes > 12 ? 5 : minutes > 6 ? 2 : 1;
  const marks = Array.from({ length: Math.floor(minutes / step) + 1 }, (_, i) => i * step);
  return (
    <figure className="race" aria-label="Run timelines on a shared time axis">
      {variants.map((v) => (
        <button type="button" key={v.id} className="lane" onClick={() => onOpen(v.id)} style={{ ['--c' as string]: colorOf(v) }}>
          <span className="lane-name">{v.label}</span>
          <span className="lane-track">
            <span className="lane-bar" style={{ width: `${((v.duration_s ?? 0) / longest) * 100}%` }} />
            {v.timeline.map((e, i) => (
              <span key={i} className={`tick ${KIND_SHAPE[e.kind] ?? ''}`} style={{ left: `${(e.t / longest) * 100}%` }} />
            ))}
            <span className="lane-finish" style={{ left: `${((v.duration_s ?? 0) / longest) * 100}%` }}>{fmtDuration(v.duration_s)}</span>
          </span>
        </button>
      ))}
      <div className="axis" aria-hidden="true">
        {marks.map((m) => <span key={m} style={{ left: `${((m * 60) / longest) * 100}%` }}>{m}m</span>)}
      </div>
      <figcaption className="legend">
        <span><i className="tick" /> action</span>
        <span><i className="tick tick-write" /> file written</span>
        <span><i className="tick tick-pass" /> tests passed</span>
        <span><i className="tick tick-fail" /> tests failed</span>
      </figcaption>
    </figure>
  );
}
