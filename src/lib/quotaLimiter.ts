// A rolling-window rate limiter for Gmail's per-user "quota unit" ceiling.
// Gmail bills each method a fixed cost (messages.get = 20, messages.list = 5,
// batchModify = 50, …) and caps a user at 6,000 units per minute on newer
// Cloud projects. A full scan is mostly messages.get and easily exceeds that,
// and Gmail rejects the overflow with a 403 `rateLimitExceeded`. Callers pass
// the real per-call cost to take(); this paces outgoing calls so a scan
// self-throttles just under the limit instead of failing — slower, but it
// finishes.
export class QuotaLimiter {
  private readonly budget: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  // Parallel arrays: when each spend happened, and how much it cost. Pruned to
  // the window on every take().
  private times: number[] = [];
  private costs: number[] = [];

  constructor(
    unitsPerWindow: number,
    windowMs = 60_000,
    deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.budget = unitsPerWindow;
    this.windowMs = windowMs;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Resolves once `cost` units fit within the budget for the current window,
   * having recorded the spend. Returns how long it waited (0 if immediate). */
  async take(cost: number): Promise<number> {
    let waited = 0;
    for (;;) {
      const now = this.now();
      this.prune(now);
      const used = this.costs.reduce((sum, c) => sum + c, 0);
      if (used + cost <= this.budget || this.times.length === 0) {
        this.times.push(now);
        this.costs.push(cost);
        return waited;
      }
      // Wait for the oldest spend to age out of the window, then re-check.
      const wait = Math.max(this.windowMs - (now - this.times[0]) + 10, 50);
      await this.sleep(wait);
      waited += wait;
    }
  }

  private prune(now: number): void {
    while (this.times.length > 0 && now - this.times[0] > this.windowMs) {
      this.times.shift();
      this.costs.shift();
    }
  }
}
