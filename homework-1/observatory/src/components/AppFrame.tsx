import { useEffect, useState } from 'react';

const PROBE_TIMEOUT_MS = 2000;
type State = 'probing' | 'up' | 'down';

/** Embeds a variant's live UI; probes first so a stopped app shows instructions, not a blank frame. */
export default function AppFrame({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<State>('probing');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    setState('probing');
    fetch(url, { mode: 'no-cors', signal: ctrl.signal })
      .then(() => live && setState('up'))
      .catch(() => live && setState('down'))
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); ctrl.abort(); };
  }, [url, attempt]);

  if (state === 'up') {
    return (
      <div className="frame">
        <div className="frame-bar"><span>{url}</span><a href={url} target="_blank" rel="noreferrer">Open in new tab</a></div>
        <iframe title={`${label} app`} src={url} />
      </div>
    );
  }
  return (
    <div className="frame frame-empty" role="status">
      {state === 'probing' ? <p>Looking for the {label} app at {url}…</p> : (
        <>
          <p className="frame-title">The {label} app isn't running.</p>
          <p>Start all three builds with <code>./demo/run.sh</code>, then check again.</p>
          <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>Check again</button>
        </>
      )}
    </div>
  );
}
