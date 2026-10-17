// Non-functional: Gmail quota cost of a default cold scan.
//
// Gmail allows this project 6,000 units per user per minute (new GCP
// projects; see research/2026-09-06-gmail-quota-403-audit.md) and the shared
// ledger paces to 5,500. A cold dashboard scan with default settings must fit
// in one window, or the first-run experience stalls for a minute mid-scan.
// This drives the REAL gmailProvider + gmailApi + quota ledger against a fake
// Gmail REST backend with a large mailbox, and sums the documented unit cost
// of every request actually made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCombinedSenderSummaries } from "../lib/senderModel";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { gmailQuotaCost } from "../lib/gmailApi";
import { clearGmailQuotaLedger, _internals } from "../lib/gmailQuotaLedger";

const DEFAULT_MAX_MESSAGES = 150; // settingsStore DEFAULT_SETTINGS.maxMessagesPerProvider
const DEFAULT_WINDOW_DAYS = 180; // settingsStore DEFAULT_SETTINGS.scanWindowDays
const SECURITY_SCAN_MAX_MESSAGES = 100; // dashboard.ts

const MAILBOX_SIZE = 2_000;
const requests: { method: string; path: string }[] = [];

function fakeGmail(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const method = (init.method ?? "GET").toUpperCase();
  const path = url.pathname.replace("/gmail/v1", "");
  requests.push({ method, path: path + url.search });
  const json = (o: unknown) => Promise.resolve(new Response(JSON.stringify(o), { status: 200 }));

  if (path === "/users/me/messages") {
    const max = Number(url.searchParams.get("maxResults") ?? 100);
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    const q = url.searchParams.get("q") ?? "";
    const total = q.includes("filename:") ? 3 : MAILBOX_SIZE;
    const ids = Array.from({ length: Math.max(0, Math.min(max, total - start)) }, (_, i) => ({
      id: `id${start + i}`,
      threadId: `t${start + i}`,
    }));
    return json({ messages: ids, nextPageToken: start + max < total ? String(start + max) : undefined });
  }
  const m = path.match(/^\/users\/me\/messages\/([^/]+)$/);
  if (m) {
    const n = Number(m[1].slice(2));
    return json({
      id: m[1],
      labelIds: ["INBOX", n % 2 ? "CATEGORY_PROMOTIONS" : "CATEGORY_UPDATES", "UNREAD"],
      internalDate: String(Date.now() - n * 3_600_000),
      sizeEstimate: 10_000,
      payload: {
        headers: [
          { name: "From", value: `"List ${n % 60}" <news@list${n % 60}.example>` },
          { name: "Subject", value: "Weekly update" },
          { name: "Authentication-Results", value: "mx.google.com; dkim=pass; spf=pass; dmarc=pass" },
        ],
      },
    });
  }
  return json({});
}

function fakeArea() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => (store.has(k) ? { [k]: structuredClone(store.get(k)) } : {}),
    set: async (o: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(o)) store.set(k, structuredClone(v));
    },
    remove: async (k: string) => void store.delete(k),
  };
}

beforeEach(async () => {
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn(fakeGmail));
  vi.stubGlobal("chrome", {
    runtime: {},
    storage: { local: fakeArea(), session: fakeArea() },
    identity: { getAuthToken: (_o: unknown, cb: (t: string) => void) => cb("token") },
  });
  await clearGmailQuotaLedger();
});

describe("cold scan quota cost (default settings)", () => {
  it("fits inside one ledger window with room to spare, without the ledger ever pausing", async () => {
    const t0 = performance.now();
    const result = await buildCombinedSenderSummaries(
      [gmailProvider],
      DEFAULT_MAX_MESSAGES,
      DEFAULT_WINDOW_DAYS,
      SECURITY_SCAN_MAX_MESSAGES,
    );
    const elapsed = performance.now() - t0;

    const units = requests.reduce((sum, r) => sum + gmailQuotaCost(r.path, r.method), 0);
    const gets = requests.filter((r) => /\/messages\/id\d+/.test(r.path)).length;

    expect(result.scannedCount).toBe(DEFAULT_MAX_MESSAGES);
    expect(result.capHit).toBe(true); // a 2,000-message mailbox is sampled
    expect(gets).toBe(DEFAULT_MAX_MESSAGES); // one metadata read per message, no duplicates
    expect(units, `${units} units over ${requests.length} requests`).toBeLessThanOrEqual(_internals.BUDGET * 0.6);
    // A pause would mean sleeping ~60 s; finishing in seconds proves none happened.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("a warm rescan pays only list cost, not 20 units per message again", async () => {
    const cache = new Map();
    await buildCombinedSenderSummaries([gmailProvider], DEFAULT_MAX_MESSAGES, DEFAULT_WINDOW_DAYS, 100, undefined, cache);
    requests.length = 0;
    await buildCombinedSenderSummaries([gmailProvider], DEFAULT_MAX_MESSAGES, DEFAULT_WINDOW_DAYS, 100, undefined, cache);
    const units = requests.reduce((sum, r) => sum + gmailQuotaCost(r.path, r.method), 0);
    expect(requests.filter((r) => /\/messages\/id\d+/.test(r.path))).toHaveLength(0);
    expect(units).toBeLessThanOrEqual(20);
  });

  it("documents the ceiling: the widest allowed scan (5,000) needs many windows — the reason the default is small", () => {
    const perMessage = gmailQuotaCost("/users/me/messages/abc", "GET");
    const windows = Math.ceil((5_000 * perMessage) / _internals.BUDGET);
    expect(windows).toBeGreaterThanOrEqual(18); // ≈ 18+ minutes of paced fetching
  });
});
