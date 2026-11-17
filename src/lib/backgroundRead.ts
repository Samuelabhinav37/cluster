// The first mail read, carried on by the background worker while no Cluster
// page is reading. The dashboard used to be the only reader, so closing its
// window paused the read and reopening it listed the whole mailbox again.
// Rows are saved in small batches (mailSync.ts), so stopping between batches
// loses nothing: when the dashboard opens, this run hands the read back.
import { waitForGmailHeadroom } from "./gmailQuotaLedger";
import { learnFromLabelMoves, readLabeller } from "./inboxTimeLimitsRunner";
import { applyIndexedCorrespondents, mailIndexLockKey } from "./indexTriage";
import { log } from "./log";
import { openMailIndex, type MailIndexStore } from "./mailIndex";
import { indexNeedsBuild, syncMailIndex } from "./mailSync";
import type { EmailProvider } from "./providers/emailProvider";
import type { ClusterSettings } from "./settingsStore";
import { tryWithStorageLock } from "./storageLock";

/** idle: nothing owed. busy: a page is reading (or holds the lock).
 * handed-off: a page opened mid-read and takes over. */
export type BackgroundReadOutcome = "idle" | "busy" | "handed-off" | "done" | "failed";

class HandOff extends Error {}

export interface BackgroundReadOptions {
  /** True while a Cluster dashboard tab is open; that page does the reading. */
  pageOpen: () => Promise<boolean>;
  store?: MailIndexStore;
  /** How often to look for an opened page. The check is also a Chrome API
   * call, which keeps the service worker awake through long quota waits. */
  pollMs?: number;
  now?: () => number;
}

export async function continueMailRead(
  provider: EmailProvider,
  settings: Pick<ClusterSettings, "scanWindowDays" | "readCap">,
  { pageOpen, store, pollMs = 15_000, now }: BackgroundReadOptions,
): Promise<BackgroundReadOutcome> {
  const index = store ?? (await openMailIndex());
  if (!indexNeedsBuild(await index.getState(provider.id), settings.scanWindowDays, settings.readCap)) return "idle";
  if (await pageOpen()) return "busy";
  const token = await provider.getAuthToken(false).catch(() => null);
  if (!token) return "idle";

  let stop = false;
  const watch = setInterval(() => {
    void pageOpen().then((open) => {
      if (open) stop = true;
    });
  }, pollMs);
  // Thrown between saved batches, so the page picks up exactly where this left off.
  const check = () => {
    if (stop) throw new HandOff();
  };
  const gmail = provider.id === "gmail";
  const labeller = gmail ? await readLabeller().catch(() => null) : null;
  try {
    const result = await tryWithStorageLock(mailIndexLockKey(provider), () =>
      syncMailIndex(provider, token, index, {
        windowDays: settings.scanWindowDays,
        cap: settings.readCap,
        now,
        onProgress: check,
        waitForHeadroom: gmail
          ? async () => {
              check();
              await waitForGmailHeadroom();
              check();
            }
          : undefined,
        onLabelMoves: gmail ? (moves) => learnFromLabelMoves(token, moves) : undefined,
        onSentReady: async () => {
          await applyIndexedCorrespondents([provider], index).catch((err) =>
            log.error("Could not update people you write to", err),
          );
          await labeller?.onSentReady();
        },
        onRead: labeller?.onRead,
        onPlanned: labeller?.onPlanned,
      }),
    );
    return result === undefined ? "busy" : "done";
  } catch (err) {
    if (err instanceof HandOff) return "handed-off";
    log.error(`Background mail read failed for ${provider.id}`, err);
    return "failed";
  } finally {
    clearInterval(watch);
    await labeller?.flush().catch((err) => log.error("Could not label mail read in the background", err));
  }
}
