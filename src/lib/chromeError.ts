// chrome.runtime.lastError is a plain `{ message }` object, not an Error.
// Rejecting with it directly loses the message for any `err instanceof Error`
// check downstream (the dashboard's top-level catch showed "unknown error" for
// a cancelled Google sign-in). Read it inside the callback and wrap it.
export function lastErrorAsError(fallback: string): Error {
  const message = chrome.runtime.lastError?.message;
  return new Error(message || fallback);
}

/** True when the user closed or refused the Google/Microsoft sign-in prompt
 * (Chrome words it "The user did not approve access." and similar), as
 * opposed to a real failure such as the auth page not loading. */
export function isAuthCancelled(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /did not approve|turned down|user denied|cancel+ed|closed by the user/i.test(message);
}
