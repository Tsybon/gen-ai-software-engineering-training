import type { Tokens, Variant } from '../types';

export const NA = 'n/a';

export function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return NA;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function fmtDuration(s: number | null | undefined): string {
  if (s === null || s === undefined) return NA;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function fmtUsd(n: number | null | undefined): string {
  return n === null || n === undefined ? NA : `$${n.toFixed(2)}`;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? NA : `${n.toFixed(digits)}%`;
}

export const totalTokens = (t: Tokens | null): number | null =>
  t ? t.input + t.cache_read + t.cache_write + t.output : null;

/** Colour identity per variant — Synergy is the blend of the other two. */
export const VARIANT_COLOR: Record<string, string> = {
  codex: '#5ec8e5',
  opus: '#b89cff',
  synergy: '#f2c14e',
};

export const colorOf = (v: Pick<Variant, 'id'>): string => VARIANT_COLOR[v.id] ?? '#e8ecf4';

/** Scored variants by rank first, unscored after in original order. */
export function byRank(variants: Variant[]): Variant[] {
  return [...variants].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
}
