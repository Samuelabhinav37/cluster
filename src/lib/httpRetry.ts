export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
// A per-minute quota response can carry a Retry-After of 30-60s. Waiting that
// long inside a scan of hundreds of messages would freeze the UI, so the wait
// is capped and the caller surfaces a "rate-limited, try again shortly" error
// if the bounded retries don't clear it.
const MAX_RETRY_WAIT_MS = 10_000;

// Gmail returns a per-user rate-limit as HTTP 403 (not 429) with one of these
// reasons in the JSON body. Treat it like a 429: back off and retry.
const RATE_LIMIT_BODY_RE =
  /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED|"reason":\s*"rateLimit/i;

// Only rate-limiting and transient server errors are worth retrying. A plain
// 401/403 (bad token, real permission denial) won't fix itself by waiting.
async function isRetryableResponse(res: Response): Promise<boolean> {
  if (res.status === 429 || res.status >= 500) return true;
  if (res.status !== 403) return false;
  try {
    // Peek a clone so the caller can still read the body for its error message.
    return RATE_LIMIT_BODY_RE.test(await res.clone().text());
  } catch {
    return false;
  }
}

function backoffDelayMs(attempt: number, baseDelayMs: number, random: () => number): number {
  return baseDelayMs * 2 ** attempt * (0.5 + random());
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const random = opts.random ?? Math.random;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await delay(backoffDelayMs(attempt, baseDelayMs, random));
      continue;
    }

    if (res.ok || attempt >= maxRetries || !(await isRetryableResponse(res))) {
      return res;
    }

    const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
    await delay(Math.min(retryAfterMs ?? backoffDelayMs(attempt, baseDelayMs, random), MAX_RETRY_WAIT_MS));
  }
}
