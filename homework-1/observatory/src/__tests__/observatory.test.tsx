import { act, fireEvent, render, screen } from '@testing-library/react';
import { fmtTokens, fmtDuration, fmtUsd, fmtPct } from '../lib/format';
import Overview from '../pages/Overview';
import AppFrame from '../components/AppFrame';
import Timeline from '../components/Timeline';
import VariantPage from '../pages/Variant';
import { metrics, variant } from './fixture';

describe('format', () => {
  test('returns n/a for null', () => {
    expect(fmtTokens(null)).toBe('n/a');
    expect(fmtDuration(null)).toBe('n/a');
    expect(fmtUsd(null)).toBe('n/a');
    expect(fmtPct(null)).toBe('n/a');
  });
  test('formats values', () => {
    expect(fmtTokens(1_234_567)).toBe('1.23M');
    expect(fmtTokens(5_400)).toBe('5.4K');
    expect(fmtDuration(787)).toBe('13m 07s');
    expect(fmtUsd(1.2554)).toBe('$1.26');
  });
});

describe('Overview', () => {
  test('ranks variants by score and keeps unscored last', () => {
    render(<Overview metrics={metrics} onOpen={() => {}} />);
    const rows = screen.getAllByTestId('rank-row').map((r) => r.getAttribute('data-variant'));
    expect(rows).toEqual(['codex', 'synergy', 'opus']);
  });
  test('every metric cell shows a source badge and missing values read n/a', () => {
    render(<Overview metrics={metrics} onOpen={() => {}} />);
    expect(screen.getAllByText('actual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('estimated').length).toBeGreaterThan(0);
    expect(screen.getAllByText('manual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0);
    expect(screen.queryByText('NaN')).toBeNull();
  });
});

describe('AppFrame', () => {
  test('shows not-running state when probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<AppFrame url="http://localhost:5101" label="Codex" />);
    expect(await screen.findByText(/isn't running/)).toBeTruthy();
    expect(screen.queryByTitle('Codex app')).toBeNull();
    vi.unstubAllGlobals();
  });
  test('shows iframe when probe succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
    render(<AppFrame url="http://localhost:5101" label="Codex" />);
    expect(await screen.findByTitle('Codex app')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('Timeline', () => {
  test('play advances the cursor through events', () => {
    vi.useFakeTimers();
    render(<Timeline events={variant('codex').timeline} durationS={600} color="#fff" />);
    expect(screen.getByTestId('cursor').getAttribute('data-t')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(Number(screen.getByTestId('cursor').getAttribute('data-t'))).toBeGreaterThan(0);
    vi.useRealTimers();
  });
  test('clicking an event shows its detail', () => {
    render(<Timeline events={variant('codex').timeline} durationS={600} color="#fff" />);
    fireEvent.click(screen.getByRole('button', { name: /Write: app.js/ }));
    expect(screen.getByTestId('event-detail').textContent).toContain('200');
  });
});

describe('Variant page', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down'))));
  afterEach(() => vi.unstubAllGlobals());
  test('debate renders only for synergy', () => {
    const debate = { rounds: [{ author: 'Opus', round: 0, markdown: '# Plan A' }], decisions_md: '| a | b |' };
    const { unmount } = render(<VariantPage variant={variant('synergy', { debate })} weights={metrics.weights} />);
    expect(screen.getByText('How the two planners argued')).toBeTruthy();
    unmount();
    render(<VariantPage variant={variant('codex')} weights={metrics.weights} />);
    expect(screen.queryByText('How the two planners argued')).toBeNull();
  });
});
