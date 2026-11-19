// Crash reports: uncaught errors from the dashboard and the service worker,
// kept on this device (last MAX_CRASHES, repeats counted). Nothing is sent on
// its own. Diagnostics' "Send report" opens a GitHub issue you read first.
import { withStorageLock } from "./storageLock";

export interface Crash {
  where: "dashboard" | "background";
  message: string;
  stack?: string;
  at: number;
  times: number;
}

const KEY = "clusterCrashes";
export const MAX_CRASHES = 20;
export const ISSUE_URL = "https://github.com/Samuelabhinav37/cluster/issues/new";
/** GitHub rejects very long prefilled URLs; past this the report is cut. */
const MAX_BODY = 6000;

/** Strips what could identify you: email addresses and sign-in tokens. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\bya29\.[\w-]+/g, "<token>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <token>");
}

export async function getCrashes(): Promise<Crash[]> {
  return ((await chrome.storage.local.get(KEY))[KEY] as Crash[] | undefined) ?? [];
}

export async function clearCrashes(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Newest first; the same error again bumps its count and time instead of a new row. */
export function addCrash(list: readonly Crash[], c: Omit<Crash, "times">): Crash[] {
  const message = redact(c.message).slice(0, 500);
  const stack = c.stack ? redact(c.stack).slice(0, 1500) : undefined;
  const same = list.find((x) => x.where === c.where && x.message === message);
  const rest = list.filter((x) => x !== same);
  return [{ where: c.where, message, stack, at: c.at, times: (same?.times ?? 0) + 1 }, ...rest].slice(0, MAX_CRASHES);
}

export async function recordCrash(where: Crash["where"], error: unknown): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  try {
    await withStorageLock(KEY, async () => {
      await chrome.storage.local.set({ [KEY]: addCrash(await getCrashes(), { where, message: e.message || e.name, stack: e.stack, at: Date.now() }) });
    });
  } catch {
    // Storage gone (extension reloading): the console still has it.
  }
}

/** Catch every uncaught error and rejected promise in this page or worker. */
export function installCrashHandlers(where: Crash["where"]): void {
  if (typeof self === "undefined") return; // node tests
  self.addEventListener("error", (ev) => void recordCrash(where, (ev as ErrorEvent).error ?? (ev as ErrorEvent).message));
  self.addEventListener("unhandledrejection", (ev) => void recordCrash(where, (ev as PromiseRejectionEvent).reason));
}

/** The issue body: build, browser, crashes, then the run log. Already redacted. */
export function reportBody(build: string, crashes: readonly Crash[], runs: string): string {
  const lines = [
    `Cluster ${build}`,
    `Browser: ${navigator.userAgent}`,
    "",
    "What were you doing when it happened?",
    "",
    "",
    `### Crashes (${crashes.length})`,
    ...crashes.map((c) => `- ${new Date(c.at).toISOString()} ${c.where}, ${c.times}x: ${c.message}\n\`\`\`\n${c.stack ?? ""}\n\`\`\``),
    "",
    "### Recent runs",
    "```",
    redact(runs),
    "```",
  ];
  const body = lines.join("\n");
  return body.length > MAX_BODY ? body.slice(0, MAX_BODY) + "\n…(cut, use Copy for the full log)" : body;
}

export function issueUrl(body: string): string {
  return `${ISSUE_URL}?${new URLSearchParams({ title: "Crash report", labels: "crash", body })}`;
}
