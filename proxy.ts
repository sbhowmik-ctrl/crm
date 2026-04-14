/**
 * proxy.ts — Edge-compatible route protection + rate limiting.
 *
 * Uses NextAuth(authConfig) — authConfig has zero Node.js imports, so this
 * file is safe to run in the Edge runtime.
 *
 * Route access logic lives in authConfig.callbacks.authorized (auth.config.ts).
 *
 * Only `/api/auth/*` is excluded from this middleware so Auth.js client calls
 * keep working; other routes (including `/api/events`) are protected and
 * rate-limited. See `lib/rate-limit-edge.ts` for tuning env vars.
 */
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { rateLimitRequest } from "@/lib/rate-limit-edge";

export const { auth: proxy } = NextAuth(authConfig);

/** NextAuth `auth` as middleware — runtime supports (req, event); types omit this overload. */
const authMiddleware = proxy as unknown as NextMiddleware;

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const rl = rateLimitRequest(request);
  if (!rl.ok) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(rl.retryAfterSec),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": "0",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const res = await authMiddleware(request, event);
  if (res && rl.limit > 0) {
    res.headers.set("X-RateLimit-Limit", String(rl.limit));
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  }
  return res ?? new Response(null, { status: 500 });
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
