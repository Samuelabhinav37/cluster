/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Locks the project's core promise: the extension talks to a fixed, tiny set
// of hosts and nothing else. No server of our own, no analytics, no "phone
// home". These tests fail the moment a new `fetch` call site or a new remote
// host literal appears anywhere under src/ — which forces a deliberate review
// of whether it belongs, rather than letting egress creep in unnoticed.

// Source files as raw text, loaded through vite so this needs no node fs types.
const sources: Record<string, string> = import.meta.glob("../**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

// import.meta.glob keys are relative to this file (src/lib/): "./x.ts" for a
// sibling, "./providers/x.ts" for a subdir, "../x.ts" for something in src/.
// Normalise them all to a single src/-relative form.
function rel(path: string): string {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("../")) return p.slice(3);
  if (p.startsWith("./")) return `lib/${p.slice(2)}`;
  return p;
}

const nonTestFiles = Object.entries(sources).filter(
  ([path]) => !path.endsWith(".test.ts") && !path.endsWith(".d.ts"),
);

// Every non-test file under src/ that contains a direct `fetch(` call. Adding a
// file here is the conscious act: a reviewer has to agree the new call site is
// legitimate and points somewhere allowed. gmailApi.ts / outlookProvider.ts are
// deliberately NOT here — they go through fetchWithRetry, so a raw fetch(
// appearing in either would (correctly) fail this test.
const ALLOWED_FETCH_CALLERS = [
  "lib/athenaIntegration.ts", // managed-policy Athena URL, opt-in only
  "lib/httpRetry.ts", // the shared wrapper every fixed-endpoint API call flows through
  "lib/providers/msalAuth.ts", // login.microsoftonline.com token endpoint
  "lib/unsubscribe.ts", // user-approved unsubscribe origin, one click at a time
];

// Hosts allowed to appear as URL-shaped string literals in fixed-endpoint
// files. The first three are actual request targets; the last two are Google
// OAuth *scope identifiers* (URNs that happen to be URL-shaped), never fetched.
const ALLOWED_HOSTS = [
  "gmail.googleapis.com",
  "graph.microsoft.com",
  "login.microsoftonline.com",
  "www.googleapis.com", // OAuth scope URN prefix, e.g. .../auth/gmail.modify
  "mail.google.com", // restricted-scope URN for opt-in permanent delete
];

describe("network egress invariant", () => {
  it("only a known allowlist of files calls fetch() directly", () => {
    // `fetch(` with no gap — the comment "…bigger fetch (format=full…" in
    // emailProvider.ts is not a call site and must not count.
    const callers = nonTestFiles
      .filter(([, text]) => /\bfetch\(/.test(text))
      .map(([path]) => rel(path))
      .sort();
    expect(callers).toEqual([...ALLOWED_FETCH_CALLERS].sort());
  });

  it("fixed-endpoint files reference no host other than the allowed set", () => {
    const fixedEndpointFiles = [
      "lib/gmailApi.ts",
      "lib/providers/outlookProvider.ts",
      "lib/providers/msalAuth.ts",
    ];
    const seen = new Set<string>();
    for (const [path, text] of nonTestFiles) {
      if (!fixedEndpointFiles.includes(rel(path))) continue;
      seen.add(rel(path));
      const hosts = [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
      for (const host of hosts) {
        expect(ALLOWED_HOSTS, `${rel(path)} references disallowed host ${host}`).toContain(host);
      }
    }
    // Guard against a path-convention change silently turning this into a no-op.
    expect([...seen].sort()).toEqual([...fixedEndpointFiles].sort());
  });
});
