export interface Tokens {
  input: number;
  cache_read: number;
  cache_write: number;
  output: number;
  reasoning: number;
}

export type EventKind = 'read' | 'write' | 'command' | 'test_fail' | 'test_pass' | 'message';

export interface TimelineEvent {
  t: number;
  kind: EventKind;
  label: string;
  tokens: number | null;
}

export interface AcceptanceTest {
  name: string;
  passed: boolean;
  message: string | null;
}

export interface Acceptance {
  passed: number;
  total: number;
  tests: AcceptanceTest[];
}

export interface Limits {
  codex_5h_pct: number | null;
  codex_week_pct: number | null;
  claude_session_pct: number | null;
  claude_week_pct: number | null;
}

export interface Debate {
  rounds: { author: string; round: number; markdown: string }[];
  decisions_md: string | null;
}

export interface Variant {
  id: string;
  label: string;
  app_url: string;
  models: string[];
  tokens: Tokens | null;
  tokens_by_model: Record<string, Tokens> | null;
  duration_s: number | null;
  paused_s: number | null;
  cost_usd: number | null;
  limits: Limits | null;
  limits_score_pct: number | null;
  acceptance: Acceptance | null;
  pass_rate: number | null;
  code: { loc: number; files: number; has_tests: boolean } | null;
  score: number | null;
  rank?: number;
  timeline: TimelineEvent[];
  debate: Debate | null;
  run: { start: string; end: string } | null;
}

export interface Weights {
  correctness: number;
  cost: number;
  time: number;
  limits: number;
}

export interface Metrics {
  generated_at: string;
  weights: Weights;
  prices: { retrieved?: string; notes?: string[]; sources?: Record<string, string> };
  variants: Variant[];
}
