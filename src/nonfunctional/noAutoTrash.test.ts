// Plan step 3.3 (Rule 1): marketing is labelled, never trashed or unsubscribed
// without you. A tripwire over the source: every place that can trash mail,
// unsubscribe, or send mail is listed here with who starts it. A new call
// site fails this test until someone checks it and adds it on purpose.
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Source files as raw text through vite (no node fs types), keyed "../lib/x.ts".
const sources: Record<string, string> = import.meta.glob("../**/*.ts", { query: "?raw", import: "default", eager: true });

const PATTERN = /\.trashMessages\(|fireOneClickUnsubscribe\(|executeBulkUnsubscribe\(|runUnsubscribeQueue\(|insertMessage\(|action: "trash"/g;

const ALLOWED: Record<string, [count: number, why: string]> = {
  "background.ts": [1, "insertMessage: the Today email, off unless turned on in Settings"],
  "dashboard/screenerTab.ts": [1, "Block on a Screener row, pressed by you"],
  "dashboard/sortInbox.ts": [1, "the 'expire one-time codes' rule: codes only, off unless turned on"],
  "dashboard/subscriptionsTab.ts": [1, "Unsubscribe, ticked and confirmed by you"],
  "dashboard/unsubscribeSheet.ts": [1, "Send on the unsubscribe emails sheet"],
  "lib/durableJobs.ts": [1, "runs a Trash you confirmed (bulkActions, Never-read)"],
  "lib/ruleRunner.ts": [1, "your own rules"],
  "lib/unsubscribeGmail.ts": [1, "resumes emails you pressed Send on"],
};

describe("nothing trashes or unsubscribes on its own (plan step 3.3)", () => {
  it("every call site is a known one that you start", () => {
    const found: Record<string, number> = {};
    for (const [key, text] of Object.entries(sources)) {
      if (/\.test\.ts$|testHarness|\.d\.ts$/.test(key)) continue;
      const rel = key.replace(/^\.\.\//, "");
      // Definitions, not callers.
      if (["lib/gmailApi.ts", "lib/unsubscribe.ts", "lib/unsubscribeQueue.ts", "lib/providers/gmailProvider.ts", "lib/providers/outlookProvider.ts", "lib/providers/emailProvider.ts"].includes(rel)) continue;
      const n = text.replace(/function \w+\(/g, "").match(PATTERN)?.length ?? 0;
      if (n > 0) found[rel] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([f, [n]]) => [f, n])));
  });
});
