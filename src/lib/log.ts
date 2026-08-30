// One place for diagnostic output. `error` always goes through (it lands in the
// service-worker / dashboard console, the only place a user or dev can inspect
// an MV3 extension). `info` / `warn` are quiet unless DEBUG is flipped, so the
// normal console isn't noisy. No transport, no storage — nothing leaves the
// browser, same as everything else here.
const DEBUG = false;

export const log = {
  info: (...args: unknown[]): void => {
    if (DEBUG) console.info("[cluster]", ...args);
  },
  warn: (...args: unknown[]): void => {
    if (DEBUG) console.warn("[cluster]", ...args);
  },
  error: (...args: unknown[]): void => {
    console.error("[cluster]", ...args);
  },
};
