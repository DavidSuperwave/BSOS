/**
 * In-Memory Rate Limiter
 *
 * Lightweight token-bucket rate limiter for API routes.
 * No external dependencies (no Redis). Suitable for single-instance
 * deployments (Railway, Docker). For multi-instance, swap for Redis-based.
 *
 * Usage:
 *   const limiter = createRateLimiter({ limit: 20, window: 60 });
 *
 *   export async function POST(req: NextRequest) {
 *     const ip = req.headers.get("x-forwarded-for") || "unknown";
 *     const { allowed, remaining, resetIn } = limiter.check(ip);
 *     if (!allowed) return rateLimitResponse(resetIn);
 *     // ... handle request
 *   }
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until reset */
  resetIn: number;
}

const stores: Map<string, RateLimitEntry>[] = [];

// Periodic cleanup to prevent memory leaks — runs every 5 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    stores.forEach((store) => {
      store.forEach((entry, key) => {
        // Remove entries that haven't been seen in 10 minutes
        if (now - entry.lastRefill > 600_000) {
          store.delete(key);
        }
      });
    });
  }, 300_000);
  // Don't keep process alive just for cleanup
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

export function createRateLimiter(config: RateLimiterConfig) {
  const store = new Map<string, RateLimitEntry>();
  stores.push(store);
  ensureCleanup();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const windowMs = config.window * 1000;

      let entry = store.get(key);

      if (!entry) {
        entry = { tokens: config.limit - 1, lastRefill: now };
        store.set(key, entry);
        return { allowed: true, remaining: entry.tokens, resetIn: config.window };
      }

      // Refill tokens based on elapsed time
      const elapsed = now - entry.lastRefill;
      const refill = Math.floor((elapsed / windowMs) * config.limit);

      if (refill > 0) {
        entry.tokens = Math.min(config.limit, entry.tokens + refill);
        entry.lastRefill = now;
      }

      if (entry.tokens <= 0) {
        const resetIn = Math.ceil(
          (windowMs - (now - entry.lastRefill)) / 1000
        );
        return { allowed: false, remaining: 0, resetIn: Math.max(1, resetIn) };
      }

      entry.tokens--;
      return {
        allowed: true,
        remaining: entry.tokens,
        resetIn: Math.ceil((windowMs - (now - entry.lastRefill)) / 1000),
      };
    },
  };
}

/**
 * Extract a rate limit key from a request.
 * Uses X-Forwarded-For (Railway/proxy), falls back to "unknown".
 */
export function rateLimitKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Standard 429 response with Retry-After header.
 */
export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Reset": String(retryAfterSeconds),
      },
    }
  );
}
