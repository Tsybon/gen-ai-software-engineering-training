import { useEffect, useState } from 'react';
import type { Metrics } from './types';
import { colorOf } from './lib/format';
import Overview from './pages/Overview';
import VariantPage from './pages/Variant';

const TAB_ORDER = ['codex', 'opus', 'synergy'];
const readTab = () => window.location.hash.replace('#/', '') || 'overview';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; metrics: Metrics };

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState(readTab);

  useEffect(() => {
    fetch('./metrics.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`metrics.json returned HTTP ${r.status}`); return r.json(); })
      .then((metrics: Metrics) => setLoad({ state: 'ready', metrics }))
      .catch((e: Error) => setLoad({ state: 'error', message: e.message }));
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: string) => { window.location.hash = `#/${id}`; window.scrollTo({ top: 0 }); };

  if (load.state === 'loading') return <main className="shell"><p className="muted">Loading metrics…</p></main>;
  if (load.state === 'error') {
    return (
      <main className="shell">
        <h1>Metrics are missing</h1>
        <p>{load.message}. Generate them with <code>cd benchmark && uv run python -m collector.build</code>, then reload.</p>
      </main>
    );
  }
  const { metrics } = load;
  const tabs = TAB_ORDER.map((id) => metrics.variants.find((v) => v.id === id)).filter((v) => v !== undefined);
  const current = metrics.variants.find((v) => v.id === tab);
  return (
    <div className="shell">
      <nav className="topbar" aria-label="Sections">
        <a className="brand" href="#/overview">AI Engineering Observatory</a>
        <div className="tabs" role="tablist">
          <a role="tab" aria-selected={!current} href="#/overview" className="tab">Overview</a>
          {tabs.map((v) => (
            <a key={v.id} role="tab" aria-selected={tab === v.id} href={`#/${v.id}`} className="tab" style={{ ['--c' as string]: colorOf(v) }}>
              <i aria-hidden="true" />{v.label}
            </a>
          ))}
        </div>
      </nav>
      <main>
        {current ? <VariantPage key={current.id} variant={current} weights={metrics.weights} /> : <Overview metrics={metrics} onOpen={go} />}
      </main>
      <footer className="foot">
        Homework 1, GenAI Software Engineering. Metrics generated {new Date(metrics.generated_at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC from local agent logs.
      </footer>
    </div>
  );
}
