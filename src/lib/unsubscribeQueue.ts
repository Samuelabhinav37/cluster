// The queue of unsubscribe emails the user approved on the confirmation
// sheet. Each one is saved before it is sent, keyed so the same request can't
// go out twice, and the queue resumes after the service worker restarts.
// Sends are spaced out and capped per run and per day, and the run stops on
// signs of trouble, so a long list never looks like bulk mail from the
// user's account.
import type { ProviderId } from "./providers/emailProvider";
import { tryWithStorageLock, withStorageLock } from "./storageLock";
import type { UnsubscribeMail } from "./unsubscribeMail";

const QUEUE_KEY = "clusterUnsubscribeQueue";
const RUN_LOCK = "unsubscribe-queue-run";
const MAX_ITEMS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SEND_SPACING_MS = 3_000;
export const MAX_PER_RUN = 20;
export const DAILY_CAP = 100;
/** A run stops after this many bounces in the last day. */
export const BOUNCE_STOP = 2;
/** A run stops after this many failed sends in a row. */
export const FAILURE_STOP = 2;

export type QueueStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  /** Sending is blocked for this account; the user sends it from a compose window. */
  | "fallback"
  | "bounced";

export interface QueueItem extends UnsubscribeMail {
  /** `${provider}:${to}:${day}`, so one request per list per day. */
  key: string;
  provider: ProviderId;
  senderKey: string;
  status: QueueStatus;
  createdAt: number;
  sentAt?: number;
  sentMessageId?: string;
  /** Thread of the sent copy; a bounce lands in the same thread. */
  sentThreadId?: string;
  error?: string;
}

export interface NewQueueItem extends UnsubscribeMail {
  provider: ProviderId;
  senderKey: string;
}

export type SendErrorKind = "blocked" | "limit" | "other";

export interface QueueDeps {
  send(item: QueueItem): Promise<{ id: string; threadId?: string }>;
  /** Whether a copy already went out (checked for items cut off mid-send). */
  alreadySent(item: QueueItem): Promise<boolean>;
  /** Sorts a send error: blocked by an admin, over a sending limit, or other. */
  classify(error: unknown): SendErrorKind;
  now?(): number;
  sleep?(ms: number): Promise<void>;
}

export interface QueueRunResult {
  sent: QueueItem[];
  failed: QueueItem[];
  fallback: QueueItem[];
  /** Why the run ended early, if it did. */
  stopped?: "busy" | "limit" | "blocked" | "bounces" | "errors" | "daily-cap";
}

function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function queueKey(provider: ProviderId, to: string, at: number): string {
  return `${provider}:${to.toLowerCase()}:${dayOf(at)}`;
}

async function readQueue(): Promise<QueueItem[]> {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(data[QUEUE_KEY]) ? (data[QUEUE_KEY] as QueueItem[]) : [];
}

async function mutateQueue<T>(mutate: (items: QueueItem[]) => { items: QueueItem[]; result: T }): Promise<T> {
  return withStorageLock(QUEUE_KEY, async () => {
    const { items, result } = mutate(await readQueue());
    await chrome.storage.local.set({ [QUEUE_KEY]: items.slice(-MAX_ITEMS) });
    return result;
  });
}

async function update(key: string, patch: Partial<QueueItem>): Promise<void> {
  await mutateQueue((items) => ({
    items: items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    result: undefined,
  }));
}

export function listUnsubscribeQueue(): Promise<QueueItem[]> {
  return readQueue();
}

/** Adds approved emails. One already queued or sent today for the same
 * address is skipped, so a double click can't send twice. */
export async function enqueueUnsubscribeMails(items: readonly NewQueueItem[], now = Date.now()): Promise<QueueItem[]> {
  return mutateQueue((existing) => {
    const keys = new Set(existing.filter((i) => i.status !== "failed").map((i) => i.key));
    const added: QueueItem[] = [];
    for (const item of items) {
      const key = queueKey(item.provider, item.to, now);
      if (keys.has(key)) continue;
      keys.add(key);
      added.push({ ...item, key, status: "queued", createdAt: now });
    }
    const kept = existing.filter((i) => !(i.status === "failed" && added.some((a) => a.key === i.key)));
    return { items: [...kept, ...added], result: added };
  });
}

/** Called by the reply watcher when a request bounced. */
export async function markUnsubscribeBounced(key: string): Promise<void> {
  await update(key, { status: "bounced" });
}

/**
 * Sends queued emails, one at a time. Safe to call from several places: a
 * run already in progress makes the others return "busy".
 */
export async function runUnsubscribeQueue(deps: QueueDeps): Promise<QueueRunResult> {
  const result = await tryWithStorageLock(RUN_LOCK, () => runLocked(deps));
  return result ?? { sent: [], failed: [], fallback: [], stopped: "busy" };
}

async function runLocked(deps: QueueDeps): Promise<QueueRunResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: QueueRunResult = { sent: [], failed: [], fallback: [] };

  // An item left "sending" was cut off mid-send. Send it again only if no
  // copy reached Sent.
  for (const item of (await readQueue()).filter((i) => i.status === "sending")) {
    const sent = await deps.alreadySent(item).catch(() => true);
    await update(item.key, sent ? { status: "sent", sentAt: item.sentAt ?? now() } : { status: "queued" });
  }

  let failuresInRow = 0;
  let attempts = 0;
  for (;;) {
    const items = await readQueue();
    const next = items.find((i) => i.status === "queued");
    if (!next) break;
    const recent = items.filter((i) => (i.sentAt ?? 0) > now() - DAY_MS);
    if (recent.filter((i) => i.status === "bounced").length >= BOUNCE_STOP) return { ...out, stopped: "bounces" };
    if (recent.filter((i) => i.provider === next.provider && i.from === next.from).length >= DAILY_CAP) {
      return { ...out, stopped: "daily-cap" };
    }
    if (attempts >= MAX_PER_RUN) break;
    if (attempts > 0) await sleep(SEND_SPACING_MS);
    attempts += 1;

    await update(next.key, { status: "sending", sentAt: now() });
    try {
      const { id, threadId } = await deps.send(next);
      const done = { ...next, status: "sent" as const, sentAt: now(), sentMessageId: id, sentThreadId: threadId };
      await update(next.key, done);
      out.sent.push(done);
      failuresInRow = 0;
    } catch (err) {
      const kind = deps.classify(err);
      const message = err instanceof Error ? err.message : String(err);
      if (kind === "limit") {
        await update(next.key, { status: "queued", sentAt: undefined });
        return { ...out, stopped: "limit" };
      }
      if (kind === "blocked") {
        // Nothing more can be sent from this account; hand the rest over.
        const left = (await readQueue()).filter(
          (i) => (i.status === "queued" || i.key === next.key) && i.provider === next.provider,
        );
        for (const item of left) await update(item.key, { status: "fallback", error: message, sentAt: undefined });
        out.fallback.push(...left.map((i) => ({ ...i, status: "fallback" as const })));
        return { ...out, stopped: "blocked" };
      }
      const failed = { ...next, status: "failed" as const, error: message, sentAt: undefined };
      await update(next.key, failed);
      out.failed.push(failed);
      failuresInRow += 1;
      if (failuresInRow >= FAILURE_STOP) return { ...out, stopped: "errors" };
    }
  }
  return out;
}

const LIMIT_RE = /limit|quota|rate/i;

/** Gmail send errors: 429, or a 403 that names a limit, means "over a
 * sending limit, try later"; any other 403 means sending is blocked for the
 * account (often a Workspace admin policy). */
export function classifyGmailSendError(error: unknown): SendErrorKind {
  const status = (error as { status?: unknown })?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429) return "limit";
  if (status === 403) return LIMIT_RE.test(message) ? "limit" : "blocked";
  return "other";
}
