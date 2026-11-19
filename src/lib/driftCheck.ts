// Plan 4.8: once a day, the 200 newest emails' real Gmail labels against what
// the engine says they should carry. A silent sorting break (a filter Gmail
// dropped, a sweep that stopped) shows up here as a rising mismatch count.
import { categoryLabelName } from "./categoryFilters";
import { clusterLabelName } from "./clusterLabels";
import { listLabels } from "./gmailApi";
import { readIndexedSenders } from "./indexTriage";
import { decideAll, engineContext, type EmailDecision } from "./mailEngine";
import { openMailIndex, type MailIndexStore } from "./mailIndex";
import { gmailProvider } from "./providers/gmailProvider";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { getSettings } from "./settingsStore";

export interface DriftResult {
  at: number;
  checked: number;
  wrong: number;
  /** Up to 5, for Diagnostics: sender, the label it should have, what it has. */
  examples: { from: string; want: string; got: string }[];
}

export const DRIFT_KEY = "clusterDrift";
const DAY_MS = 86_400_000;
const SAMPLE = 200;
/** Newer mail may not be labelled yet (filters and the sweep run every few minutes). */
const SETTLE_MS = 15 * 60_000;
/** Above this share, the check fails and the supervisor warns. */
export const DRIFT_LIMIT = 0.02;

/** Compares the newest settled emails the engine files under a label. */
export function labelDrift(
  rows: readonly NormalizedMessageMetadata[],
  decided: ReadonlyMap<string, EmailDecision>,
  nameOfId: ReadonlyMap<string, string>,
  wantName: (d: EmailDecision) => string | null,
  now: number,
): Omit<DriftResult, "at"> {
  const recent = rows
    .filter((r) => now - r.receivedAt >= SETTLE_MS && !r.labelIds?.some((l) => l === "SPAM" || l === "TRASH"))
    .sort((a, b) => b.receivedAt - a.receivedAt);
  let checked = 0;
  let wrong = 0;
  const examples: DriftResult["examples"] = [];
  for (const r of recent) {
    if (checked >= SAMPLE) break;
    const d = decided.get(r.id);
    const want = d && wantName(d);
    if (!want) continue;
    checked++;
    const names = (r.labelIds ?? []).map((id) => nameOfId.get(id) ?? id);
    if (names.includes(want)) continue;
    wrong++;
    if (examples.length < 5) examples.push({ from: r.fromAddress, want, got: names.filter((n) => !/^[A-Z_]+$/.test(n)).join(", ") || "no label" });
  }
  return { checked, wrong, examples };
}

export async function getDrift(): Promise<DriftResult | undefined> {
  return (await chrome.storage.local.get(DRIFT_KEY))[DRIFT_KEY] as DriftResult | undefined;
}

/** Daily; throws above DRIFT_LIMIT so the supervisor counts it as failing. */
export async function runDriftCheck(store?: MailIndexStore, now = Date.now()): Promise<void> {
  const last = await getDrift();
  if (last && now - last.at < DAY_MS) return;
  const settings = await getSettings();
  if (!settings.autoSort.timeLimitsEnabled || !(await gmailProvider.isConnected())) return;
  const index = store ?? (await openMailIndex());
  const rows = await index.all("gmail");
  const { cleanup } = await readIndexedSenders([gmailProvider], { scanWindowDays: settings.scanWindowDays, securityWindowDays: 0, securityMax: 0 }, index);
  const decided = decideAll(cleanup, engineContext(settings));
  const token = await gmailProvider.getAuthToken(false);
  const nameOfId = new Map((await listLabels(token)).map((l) => [l.id, l.name]));
  const personal = clusterLabelName("personal");
  const want = (d: EmailDecision) =>
    d.place === "personal" ? personal : d.place && d.place !== "screener" && d.place !== "spam" ? categoryLabelName(d.place, settings.labelChoices) : null;
  const result: DriftResult = { at: now, ...labelDrift(rows, decided, nameOfId, want, now) };
  await chrome.storage.local.set({ [DRIFT_KEY]: result });
  if (result.checked >= 50 && result.wrong / result.checked > DRIFT_LIMIT)
    throw new Error(`labels differ on ${result.wrong} of ${result.checked} recent emails`);
}
