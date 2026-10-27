// Body checks for mail that already looks suspicious (Stage G). The dashboard
// reads the newest message of each warned or held sender, at most 20 a scan,
// counts links whose text names a different site and links to known-bad
// sites, and keeps only those two counts. Never the body text, never the
// hosts. The background scan never reads bodies. A body is written by the
// sender, so these facts can only add a warning, never remove one.
import { isBlockedDomain } from "./blocklist";
import { findBlocklistedLinkTargets, findMismatchedLinks, type ExtractedLink } from "./linkMismatch";
import type { SenderSummary } from "./senderModel";
import type { ThreatSignal } from "./threatSignals";

export interface BodyCheck {
  at: number;
  mismatchedLinks: number;
  badLinks: number;
}

/** By `${provider}:${messageId}`. */
export type BodyCheckStore = Record<string, BodyCheck>;

const STORAGE_KEY = "bodyChecks";
const MAX_CHECKS = 500;
export const MAX_CHECKS_PER_SCAN = 20;

export function checkLinks(links: readonly ExtractedLink[], now = Date.now()): BodyCheck {
  return {
    at: now,
    mismatchedLinks: findMismatchedLinks([...links]).length,
    badLinks: findBlocklistedLinkTargets([...links], isBlockedDomain).length,
  };
}

export function bodyCheckKey(sender: SenderSummary, messageId: string): string {
  return `${sender.provider}:${messageId}`;
}

/** Adds the stored findings to each sender's warning signals. */
export function applyBodyChecks(senders: readonly SenderSummary[], store: BodyCheckStore): void {
  for (const sender of senders) {
    const domain = sender.address.slice(sender.address.lastIndexOf("@") + 1) || "unknown sender";
    for (const message of sender.messages) {
      const check = store[bodyCheckKey(sender, message.id)];
      if (!check) continue;
      const add = (kind: "link-mismatch" | "blocklisted-link") => {
        const existing = sender.threatSignals.find((s) => s.kind === kind);
        if (existing) {
          if (!existing.messageIds?.includes(message.id)) {
            existing.messageIds = [...(existing.messageIds ?? []), message.id];
          }
          return;
        }
        const signal: ThreatSignal = { kind, brand: domain, confidence: "high", messageIds: [message.id] };
        sender.threatSignals = [...sender.threatSignals, signal];
      };
      if (check.mismatchedLinks > 0) add("link-mismatch");
      if (check.badLinks > 0) add("blocklisted-link");
    }
  }
}

/** Newest-first store, cut to the most recent MAX_CHECKS. */
export function withCheck(store: BodyCheckStore, key: string, check: BodyCheck): BodyCheckStore {
  const entries = Object.entries({ ...store, [key]: check }).sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, MAX_CHECKS));
}

function normalizeBodyChecks(value: unknown): BodyCheckStore {
  if (typeof value !== "object" || value === null) return {};
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k, v]) => {
        const c = v as Partial<BodyCheck> | null;
        return k.length <= 300 && c !== null && ok(c.at) && ok(c.mismatchedLinks) && ok(c.badLinks);
      })
      .slice(0, MAX_CHECKS),
  ) as BodyCheckStore;
}

export async function loadBodyChecks(): Promise<BodyCheckStore> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeBodyChecks(data[STORAGE_KEY]);
}

export async function saveBodyChecks(store: BodyCheckStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}
