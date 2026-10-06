// Storage for the sender ledger (senderLedger.ts): one chrome.storage.local
// key, on this device only. Read, check and write happen under one lock so
// the dashboard and the background scan can't overwrite each other's update.
import { identityChanges, observeSenders, type SenderLedger } from "./senderLedger";
import type { SenderSummary } from "./senderModel";
import { withStorageLock } from "./storageLock";

const STORAGE_KEY = "senderLedger";
// Senders not heard from in this long are dropped, so the ledger can't grow forever.
const FORGET_AFTER_MS = 400 * 24 * 60 * 60 * 1000;

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function isLedger(value: unknown): value is SenderLedger {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Adds "identity-change" signals to `senders` (mutated in place, as
 * firstContact.ts does) by comparing each with its history, then records this
 * scan in that history. Warnings are judged against the history from before
 * this scan, so a new domain is reported, not silently learned.
 */
export async function applySenderLedger(senders: SenderSummary[], now: number = Date.now()): Promise<void> {
  if (!hasChromeStorage() || senders.length === 0) return;
  await withStorageLock(STORAGE_KEY, async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const ledger: SenderLedger = isLedger(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : {};
    for (const sender of senders) {
      for (const signal of identityChanges(ledger[sender.key], sender)) {
        if (!sender.threatSignals.some((s) => s.kind === signal.kind && s.brand === signal.brand)) {
          sender.threatSignals.push(signal);
        }
      }
    }
    const next = observeSenders(ledger, senders);
    for (const [key, entry] of Object.entries(next)) {
      if (now - entry.lastSeen > FORGET_AFTER_MS) delete next[key];
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
}
