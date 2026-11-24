import { Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Variant } from '../types';
import { colorOf, fmtTokens } from '../lib/format';

const GRID = '#26324a';
const AXIS = { fill: '#8c97ad', fontSize: 12 };
const TOOLTIP = { contentStyle: { background: '#182132', border: '1px solid #26324a', borderRadius: 8 }, labelStyle: { color: '#e8ecf4' } };

/** 0..1, higher is better: pass rate as-is; cost/time/limits min-max inverted. */
function normalized(variants: Variant[]) {
  const inv = (pick: (v: Variant) => number | null) => {
    const vals = variants.map(pick).filter((x): x is number => x !== null);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return (v: Variant) => {
      const x = pick(v);
      if (x === null || !vals.length) return 0;
      return hi === lo ? 1 : 1 - (x - lo) / (hi - lo);
    };
  };
  const cost = inv((v) => v.cost_usd);
  const time = inv((v) => v.duration_s);
  const limits = inv((v) => v.limits_score_pct);
  return [
    { axis: 'Correctness', ...Object.fromEntries(variants.map((v) => [v.id, v.pass_rate ?? 0])) },
    { axis: 'Cheaper', ...Object.fromEntries(variants.map((v) => [v.id, cost(v)])) },
    { axis: 'Faster', ...Object.fromEntries(variants.map((v) => [v.id, time(v)])) },
    { axis: 'Lighter on limits', ...Object.fromEntries(variants.map((v) => [v.id, limits(v)])) },
  ];
}

export function ScoreRadar({ variants }: { variants: Variant[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={normalized(variants)} outerRadius="72%">
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="axis" tick={AXIS} />
        {variants.map((v) => (
          <Radar key={v.id} name={v.label} dataKey={v.id} stroke={colorOf(v)} fill={colorOf(v)} fillOpacity={0.12} strokeWidth={2} />
        ))}
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Tooltip {...TOOLTIP} formatter={(x: number) => `${Math.round(x * 100)}%`} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function TokenBars({ variants }: { variants: Variant[] }) {
  const data = variants.map((v) => ({
    name: v.label,
    'Uncached input': v.tokens?.input ?? 0,
    'Cache writes': v.tokens?.cache_write ?? 0,
    Output: v.tokens?.output ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} tickFormatter={(x: number) => fmtTokens(x)} axisLine={false} tickLine={false} width={56} />
        <Tooltip {...TOOLTIP} formatter={(x: number) => fmtTokens(x)} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="Uncached input" stackId="t" fill="#4d6a96" />
        <Bar dataKey="Cache writes" stackId="t" fill="#8aa4cc" />
        <Bar dataKey="Output" stackId="t" fill="#e8ecf4" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CacheBars({ variants }: { variants: Variant[] }) {
  const data = variants.map((v) => ({ name: v.label, id: v.id, 'Cache reads': v.tokens?.cache_read ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} tickFormatter={(x: number) => fmtTokens(x)} axisLine={false} tickLine={false} width={56} />
        <Tooltip {...TOOLTIP} formatter={(x: number) => fmtTokens(x)} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="Cache reads" radius={[4, 4, 0, 0]}>
          {data.map((d) => <Cell key={d.id} fill={colorOf({ id: d.id })} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
