export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

// Only rate-limiting and transient server errors are worth retrying — a 4xx
// auth failure (401/403) means the token is bad and retrying won't fix it.
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attempt;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
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

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await delay(backoffDelayMs(attempt, baseDelayMs));
      continue;
    }

    if (res.ok || !isRetryableStatus(res.status) || attempt >= maxRetries) {
      return res;
    }

    const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
    await delay(retryAfterMs ?? backoffDelayMs(attempt, baseDelayMs));
  }
}
