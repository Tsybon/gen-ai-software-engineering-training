const WINDOW_MS = 60_000;

/** Fixed-window per-IP limiter. OPTIONS and /health are exempt. */
export function rateLimit(max, now = () => Date.now()) {
  let windowStart = now();
  let counts = new Map();
  return (req, res, next) => {
    if (req.method === 'OPTIONS' || req.path === '/health') return next();
    const t = now();
    if (t - windowStart >= WINDOW_MS) {
      windowStart = t;
      counts = new Map();
    }
    const used = (counts.get(req.ip) ?? 0) + 1;
    counts.set(req.ip, used);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - used)));
    if (used > max) {
      res.set('Retry-After', String(Math.ceil((windowStart + WINDOW_MS - t) / 1000)));
      return res.status(429).json({ error: 'Too many requests', details: [] });
    }
    return next();
  };
}
