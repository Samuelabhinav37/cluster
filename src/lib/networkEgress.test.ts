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

// Markup / stylesheet sources, scanned for asset references that would pull
// bytes from somewhere other than the extension's own origin at page load.
const markupFiles: Record<string, string> = import.meta.glob("../**/*.{html,css}", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Ways to reach the network that aren't `fetch(` — none of these should appear
// anywhere under src/. Kept as source substrings so the check is greppable and
// doesn't depend on a DOM/runtime being present.
const FORBIDDEN_EGRESS_APIS = [
  "XMLHttpRequest",
  "sendBeacon",
  "new WebSocket",
  "new EventSource",
  "new Image(", // an <img> src is an uncredentialed GET to anywhere — pixel tracking
];

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

  it("uses no network API other than fetch()", () => {
    const offenders: string[] = [];
    for (const [path, text] of nonTestFiles) {
      for (const api of FORBIDDEN_EGRESS_APIS) {
        if (text.includes(api)) offenders.push(`${rel(path)} uses ${api}`);
      }
      // Dynamic import() can pull a remote module; static `import x from` and
      // `import.meta` are fine. Match `import(` not preceded by a word char.
      if (/(^|[^.\w])import\s*\(/.test(text)) offenders.push(`${rel(path)} uses dynamic import()`);
    }
    expect(offenders).toEqual([]);
  });

  it("loads no markup or stylesheet asset from off-origin", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(markupFiles)) {
      if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(text)) {
        offenders.push(`${rel(path)} has an absolute src/href`);
      }
      if (/@import|url\(\s*["']?(?:https?:)?\/\//i.test(text)) {
        offenders.push(`${rel(path)} has an off-origin @import or url()`);
      }
    }
    // Sanity-check the glob actually matched the dashboard files.
    expect(Object.keys(markupFiles).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  // The dashboard loads exactly one off-origin asset by design: a sender-
  // domain favicon (senderLogos.faviconUrl, rendered by senderTile.ts). Both
  // the host literal and the <img> construction are pinned to their one file
  // each, so a second off-origin asset can't slip in unreviewed. This is the
  // documented exception in docs/privacy.md and the sidebar note.
  it("references the favicon host only from senderLogos.ts", () => {
    const referrers = nonTestFiles
      .filter(([, text]) => text.includes("www.google.com/s2/favicons"))
      .map(([path]) => rel(path))
      .sort();
    expect(referrers).toEqual(["lib/senderLogos.ts"]);
  });

  it("constructs an off-origin <img> only in senderTile.ts", () => {
    const referrers = nonTestFiles
      .filter(([, text]) => /createElement\(\s*["']img["']\s*\)/.test(text))
      .map(([path]) => rel(path))
      .sort();
    expect(referrers).toEqual(["dashboard/senderTile.ts"]);
  });

  it("would catch a newly introduced off-origin reference (red-case fixture)", () => {
    const badHtml = '<img src="https://tracker.example/pixel.gif" />';
    const badCss = '@import url("https://fonts.evil.example/x.css");';
    expect(/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(badHtml)).toBe(true);
    expect(/@import|url\(\s*["']?(?:https?:)?\/\//i.test(badCss)).toBe(true);
  });
});
