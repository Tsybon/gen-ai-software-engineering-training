import type { Metrics, Variant } from '../types';

const tokens = { input: 100, cache_read: 1000, cache_write: 10, output: 50, reasoning: 0 };

export function variant(id: string, overrides: Partial<Variant> = {}): Variant {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), app_url: `http://localhost:510${id.length}`, models: ['m'],
    tokens, tokens_by_model: { m: tokens }, duration_s: 600, paused_s: 0, cost_usd: 1.5,
    limits: { codex_5h_pct: null, codex_week_pct: null, claude_session_pct: 3, claude_week_pct: 1 },
    limits_score_pct: 1, acceptance: { passed: 9, total: 10, tests: [{ name: 'test_create', passed: true, message: null }] },
    pass_rate: 0.9, code: { loc: 1000, files: 20, has_tests: true }, score: 80, rank: 1,
    timeline: [{ t: 0, kind: 'read', label: 'Read: BRIEF.md', tokens: 10 }, { t: 60, kind: 'write', label: 'Write: app.js', tokens: 200 }],
    debate: null, run: { start: '2026-11-24T20:00:00Z', end: '2026-11-24T20:10:00Z' },
    ...overrides,
  };
}

export const metrics: Metrics = {
  generated_at: '2026-11-24T22:00:00Z',
  weights: { correctness: 0.5, cost: 0.2, time: 0.2, limits: 0.1 },
  prices: { retrieved: '2026-11-24', notes: [], sources: {} },
  variants: [
    variant('synergy', { score: 70, rank: 2 }),
    variant('codex', { score: 90, rank: 1 }),
    variant('opus', { score: null, rank: undefined, acceptance: null, pass_rate: null, cost_usd: null, tokens: null }),
  ],
};
