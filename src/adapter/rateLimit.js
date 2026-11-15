/**
 * Rate Limiter for Tool Adapter
 * Token bucket implementation
 */

import { getRateLimitConfig } from './config.js';

class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate; // tokens per ms
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, remaining: this.tokens };
    }
    return {
      allowed: false,
      remaining: this.tokens,
      retryAfterMs: Math.ceil((tokens - this.tokens) / this.refillRate),
    };
  }

  getStatus() {
    this.refill();
    return {
      remaining: this.tokens,
      capacity: this.capacity,
      resetAt: this.lastRefill + (this.capacity - this.tokens) / this.refillRate,
    };
  }
}

/**
 * Rate Limiter with per-tool buckets
 */
export class RateLimiter {
  constructor(config = {}) {
    this.buckets = new Map();
    this.config = config;
  }

  /**
   * Get or create bucket for a tool
   */
  getBucket(toolName) {
    if (!this.buckets.has(toolName)) {
      const { requests, windowMs } = getRateLimitConfig(toolName);
      const refillRate = requests / windowMs; // tokens per ms
      this.buckets.set(toolName, new TokenBucket(requests, refillRate));
    }
    return this.buckets.get(toolName);
  }

  /**
   * Check rate limit for a tool
   * @returns {Object} { allowed, remaining, retryAfterMs }
   */
  checkLimit(toolName) {
    const bucket = this.getBucket(toolName);
    return bucket.consume(1);
  }

  /**
   * Get rate limit status for all tools
   */
  getStatus() {
    const status = {};
    for (const [toolName, bucket] of this.buckets) {
      status[toolName] = bucket.getStatus();
    }
    return status;
  }

  /**
   * Reset rate limit for a tool (for testing)
   */
  reset(toolName) {
    if (toolName) {
      this.buckets.delete(toolName);
    } else {
      this.buckets.clear();
    }
  }
}

// Singleton instance
let rateLimiterInstance = null;

/**
 * Get or create rate limiter instance
 */
export function getRateLimiter() {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter() {
  rateLimiterInstance = new RateLimiter();
}