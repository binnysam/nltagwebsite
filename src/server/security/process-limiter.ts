/**
 * In-memory token bucket, one per Node process (R4). Address-independent by design: it never sees
 * an email address or a client IP, so it cannot become an account oracle or an IP-keyed limit.
 * With N processes the effective limit is N × rate (documented as "per process").
 */
export interface BucketRule {
  /** Tokens added per second. */
  ratePerSecond: number;
  /** Bucket size (largest burst). */
  burst: number;
}

export class ProcessLimiter {
  private tokens: number;
  private last: number;

  constructor(
    readonly rule: BucketRule,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.tokens = rule.burst;
    this.last = clock();
  }

  /** Takes one token if available. Never awaits, so concurrent callers cannot overdraw. */
  take(): boolean {
    const now = this.clock();
    this.tokens = Math.min(this.rule.burst, this.tokens + ((now - this.last) / 1000) * this.rule.ratePerSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Seconds until one token is available (for Retry-After). */
  retryAfterSeconds(): number {
    return Math.max(1, Math.ceil((1 - this.tokens) / this.rule.ratePerSecond));
  }
}
