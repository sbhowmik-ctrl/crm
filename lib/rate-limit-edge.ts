import type { NextRequest } from "next/server";

/**
 * In-memory sliding-window limiter for Edge middleware.
 * Counts are per runtime isolate (not shared across serverless instances).
 * For distributed deployments, consider Upstash Redis + @upstash/ratelimit.
 */

const store = new Map<string, number[]>();

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function windowMs(): number {
  return envInt("RATE_LIMIT_WINDOW_MS", 60_000);
}

function maxForPath(pathname: string): number {
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return envInt("RATE_LIMIT_AUTH_MAX", 40);
  }
  return envInt("RATE_LIMIT_MAX", 200);
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export type RateLimitOutcome = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
};

export function rateLimitRequest(request: NextRequest): RateLimitOutcome {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
    return { ok: true, limit: 0, remaining: 0, retryAfterSec: 0 };
  }

  const pathname = request.nextUrl.pathname;
  const limit = maxForPath(pathname);
  const window = windowMs();
  const key = `${clientIp(request)}:${pathname.startsWith("/login") || pathname.startsWith("/register") ? "auth" : "app"}`;
  const now = Date.now();
  const windowStart = now - window;

  let hits = store.get(key) ?? [];
  hits = hits.filter((t) => t > windowStart);

  if (hits.length >= limit) {
    const oldest = Math.min(...hits);
    const resetAt = oldest + window;
    const retryAfterMs = Math.max(0, resetAt - now);
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    store.set(key, hits);
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSec,
    };
  }

  hits.push(now);
  store.set(key, hits);

  // Prune stale keys occasionally to bound memory (simple sweep)
  if (store.size > 10_000) {
    for (const [k, ts] of store) {
      const pruned = ts.filter((t) => t > windowStart);
      if (pruned.length === 0) store.delete(k);
      else store.set(k, pruned);
    }
  }

  return {
    ok: true,
    limit,
    remaining: limit - hits.length,
    retryAfterSec: 0,
  };
}
