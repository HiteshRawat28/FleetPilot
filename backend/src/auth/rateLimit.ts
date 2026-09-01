import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key: (request: Request) => string;
};

type Entry = { count: number; resetAt: number };

export function privacyHash(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, Entry>();
  return (request, response, next) => {
    const now = Date.now();
    if (entries.size > 10_000) {
      for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
    }
    const key = options.key(request);
    const current = entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + options.windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    entries.set(key, entry);
    response.setHeader('X-RateLimit-Limit', String(options.max));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - entry.count)));
    if (entry.count <= options.max) return next();
    response.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    response.status(429).json({ message: 'Too many requests. Please try again later.' });
  };
}
