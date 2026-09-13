/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Regression guard for the bug fixed in "Fix plan A4": subscriptionsTab.ts's
// "Unsubscribe + clean..." button built its trash target list from a
// scan-time snapshot and never re-checked Gmail live before deleting, unlike
// every other trash-executing button. This locks the invariant so a future
// new "trash" button can't silently reintroduce the same gap: every call
// site that reaches provider.trashMessages (directly, or via
// createDurableJob({ operation: "trash" })) must have a filterOutProtected
// call reachable in an enclosing scope, earlier in the source.
//
// This is a source-text check, not a real scope/AST analysis -- it walks
// outward through enclosing `{...}` blocks (a plain brace-depth climb, so it
// also passes through object-literal braces harmlessly) looking for
// `filterOutProtected` textually before the trash call. That's enough to
// catch the actual failure mode (a handler that never calls it at all)
// without needing a JS parser dependency.

const sources: Record<string, string> = import.meta.glob("./*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const nonTestFiles = Object.entries(sources).filter(([path]) => !path.endsWith(".test.ts"));

const TRASH_CALL_PATTERNS = [/\.trashMessages\(/g, /operation:\s*"trash"/g];
const GUARD = "filterOutProtected";
// How many enclosing `{...}` levels to climb looking for the guard, before
// giving up. Generous: real handlers here nest at most a handful deep
// (button.onclick -> renderConfirmStep's callback -> a few statements).
const MAX_CLIMB = 12;

/** True if `needle` appears in some enclosing brace-scope of `source` that
 * contains position `at`, climbing outward up to MAX_CLIMB levels. */
function guardedByEnclosingScope(source: string, at: number, needle: string): boolean {
  let cursor = at;
  for (let level = 0; level < MAX_CLIMB && cursor > 0; level++) {
    let depth = 0;
    let start = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      const ch = source[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          start = i;
          break;
        }
        depth--;
      }
    }
    if (start === -1) break;
    if (source.slice(start, at).includes(needle)) return true;
    cursor = start;
  }
  return false;
}

describe("every dashboard trash call site is protection-guarded", () => {
  for (const [path, source] of nonTestFiles) {
    for (const pattern of TRASH_CALL_PATTERNS) {
      const matches = [...source.matchAll(pattern)];
      for (const match of matches) {
        const at = match.index!;
        const line = source.slice(0, at).split("\n").length;
        it(`${path}:${line} (\`${match[0]}\`) has ${GUARD} in an enclosing scope`, () => {
          expect(guardedByEnclosingScope(source, at, GUARD)).toBe(true);
        });
      }
    }
  }

  it("found at least the known call sites (sanity check the scan itself isn't silently empty)", () => {
    const total = nonTestFiles.reduce(
      (n, [, source]) =>
        n + TRASH_CALL_PATTERNS.reduce((m, p) => m + [...source.matchAll(p)].length, 0),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(4);
  });
});
