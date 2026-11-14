// A flight recorder for Cluster's long jobs. Each run (a background sweep,
// the first read, a Rescan) writes what it did step by step: counts, time,
// and why a step failed. A watchdog marks a run that went quiet as stalled.
// The dashboard turns the last report into one plain sentence, and Settings
// lists the last runs with Copy for bug reports. Kept in storage.local only.

import { withStorageLock } from "./storageLock";

export type RunKind = "sweep" | "read" | "rescan";
export type RunStatus = "running" | "ok" | "partial" | "failed" | "stalled";

export interface RunStep {
  name: string;
  ms: number;
  ok: boolean;
  /** Plain words: "Gmail said too many requests". */
  error?: string;
  counts?: Record<string, number>;
}

export interface RunReport {
  id: string;
  kind: RunKind;
  build: string;
  startedAt: number;
  endedAt?: number;
  /** Last sign of life; the watchdog compares it with STALL_MS. */
  beatAt: number;
  status: RunStatus;
  /** The step running now, or the one a stall stopped in. */
  current?: string;
  steps: RunStep[];
  /** Finished fine with nothing to do. Only the newest quiet run is kept, so
   * 5-minute sweeps don't push real runs out of the history. */
  quiet?: boolean;
}

const KEY = "runReports";
const LOCK = "run-reports";
export const MAX_REPORTS = 20;
/** Quiet this long while "running" means the worker died or hung. */
export const STALL_MS = 10 * 60 * 1000;

async function load(): Promise<RunReport[]> {
  const got = await chrome.storage.local.get(KEY);
  return Array.isArray(got[KEY]) ? (got[KEY] as RunReport[]) : [];
}

async function save(fn: (reports: RunReport[]) => RunReport[]): Promise<void> {
  await withStorageLock(LOCK, async () => {
    await chrome.storage.local.set({ [KEY]: fn(await load()).slice(-MAX_REPORTS) });
  });
}

/** Newest last. */
export function getRunReports(): Promise<RunReport[]> {
  return load().catch(() => []);
}

export function onRunReportsChange(fn: (reports: RunReport[]) => void): void {
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) fn((changes[KEY].newValue as RunReport[] | undefined) ?? []);
  });
}

/** Why it failed, in words a person reads. */
export function plainError(err: unknown): string {
  // GmailApiError carries the HTTP status; read it without importing gmailApi.
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 0;
  if (status) {
    if (status === 429) return "Gmail said too many requests";
    if (status === 401) return "Google sign-in expired";
    if (status === 403) return "Gmail refused (permission or daily limit)";
    if (status === 404) return "Gmail couldn't find it (deleted, or history too old)";
    if (status >= 500) return "Gmail had a server error";
    return `Gmail error ${status}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|network|offline/i.test(message)) return "No internet connection";
  if (/not signed in|auth|token/i.test(message)) return "Google sign-in expired";
  return message.slice(0, 160);
}

export interface Run {
  readonly report: RunReport;
  /** Runs one step; a failure is recorded and `fallback` returned, so later steps still run. */
  step<T>(name: string, fallback: T, fn: () => Promise<T>, counts?: (value: T) => Record<string, number>): Promise<T>;
  /** Like step, but a failure is recorded and thrown on to the caller. */
  track<T>(name: string, fn: () => Promise<T>, counts?: (value: T) => Record<string, number>): Promise<T>;
  /** Sign of life during a long step (the read calls it on progress). */
  beat(counts?: Record<string, number>): void;
  /** True when no step in `names` failed. */
  succeeded(...names: string[]): boolean;
  finish(): Promise<RunReport>;
}

const BEAT_EVERY_MS = 30_000;

export async function startRun(kind: RunKind, now = Date.now): Promise<Run> {
  const report: RunReport = {
    id: `${kind}-${now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    build: typeof __BUILD__ === "string" ? __BUILD__ : "dev",
    startedAt: now(),
    beatAt: now(),
    status: "running",
    steps: [],
  };
  const write = () =>
    save((all) => [...all.filter((r) => r.id !== report.id), { ...report, steps: [...report.steps] }]).catch(() => {});
  let lastWrite = 0;
  const persist = async (force = false) => {
    if (!force && now() - lastWrite < BEAT_EVERY_MS) return;
    lastWrite = now();
    await write();
  };
  await persist(true);
  const run = async <T>(name: string, fn: () => Promise<T>, counts?: (value: T) => Record<string, number>): Promise<T> => {
    const started = now();
    report.current = name;
    report.beatAt = started;
    await persist(true);
    const settle = (step: RunStep) => {
      report.steps = [...report.steps.filter((s) => s.name !== `${name} (so far)`), step];
    };
    try {
      const value = await fn();
      settle({ name, ms: now() - started, ok: true, counts: counts?.(value) });
      return value;
    } catch (err) {
      settle({ name, ms: now() - started, ok: false, error: plainError(err) });
      throw err;
    } finally {
      report.beatAt = now();
      await persist(true);
    }
  };
  return {
    report,
    step: (name, fallback, fn, counts) => run(name, fn, counts).catch(() => fallback),
    track: run,
    beat(counts) {
      report.beatAt = now();
      if (counts && report.current) {
        const live = report.steps.find((s) => s.name === `${report.current} (so far)`);
        if (live) live.counts = counts;
        else report.steps.push({ name: `${report.current} (so far)`, ms: 0, ok: true, counts });
      }
      void persist();
    },
    succeeded(...names) {
      return !report.steps.some((s) => !s.ok && names.includes(s.name));
    },
    async finish() {
      report.steps = report.steps.filter((s) => !s.name.endsWith(" (so far)"));
      const failed = report.steps.filter((s) => !s.ok).length;
      report.status = failed === 0 ? "ok" : failed === report.steps.length ? "failed" : "partial";
      report.endedAt = now();
      report.current = undefined;
      report.quiet = report.status === "ok" && report.steps.every((s) => Object.values(s.counts ?? {}).every((n) => !n));
      if (report.quiet) {
        await save((all) => [...all.filter((r) => !r.quiet && r.id !== report.id), { ...report }]).catch(() => {});
      } else {
        await persist(true);
      }
      return report;
    },
  };
}

/** Marks runs that went quiet as stalled, keeping the step they stopped in. Returns them. */
export async function markStalled(now = Date.now()): Promise<RunReport[]> {
  const stalled: RunReport[] = [];
  await save((all) =>
    all.map((r) => {
      if (r.status !== "running" || now - r.beatAt < STALL_MS) return r;
      const s: RunReport = { ...r, status: "stalled", endedAt: r.beatAt };
      stalled.push(s);
      return s;
    }),
  ).catch(() => {});
  return stalled;
}

const STEP_WORDS: Record<string, string> = {
  "filter sync": "updating Gmail filters",
  "search labelling": "labelling by search",
  tagging: "labelling new mail",
  sweep: "moving labelled mail out",
  hold: "holding unsorted mail",
  "index build": "reading your mail",
  "older inbox": "labelling older mail",
  relabel: "relabelling the inbox",
};

const words = (step: string) => STEP_WORDS[step] ?? step;

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "under a minute" : m === 1 ? "1 min" : `${m} min`;
}

function total(report: RunReport, key: string): number {
  return report.steps.reduce((n, s) => n + (s.counts?.[key] ?? 0), 0);
}

/** One sentence for the dashboard: what happened, and why it stopped if it did. */
export function describeRun(report: RunReport): string {
  const took = minutes((report.endedAt ?? report.beatAt) - report.startedAt);
  const done: string[] = [];
  const labelled = total(report, "labelled");
  const moved = total(report, "moved");
  const held = total(report, "held");
  const read = total(report, "read");
  if (read) done.push(`read ${read.toLocaleString()} emails`);
  if (labelled) done.push(`labelled ${labelled.toLocaleString()}`);
  if (moved) done.push(`moved ${moved.toLocaleString()} out of the inbox`);
  if (held) done.push(`held ${held.toLocaleString()} in the Screener`);
  const what = done.length ? done.join(", ") : "nothing needed doing";
  const lead = what.charAt(0).toUpperCase() + what.slice(1);
  const failed = report.steps.filter((s) => !s.ok);
  switch (report.status) {
    case "running":
      return `Working: ${words(report.current ?? "starting")}.`;
    case "stalled":
      return `Stopped while ${words(report.current ?? "working")}, with no sign of life for 10 minutes. It starts again on the next run.`;
    case "ok":
      return `${lead} in ${took}.`;
    default:
      return `${lead} in ${took}. ${failed.map((s) => `${capital(words(s.name))} failed: ${s.error}.`).join(" ")}`;
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The full log, for Copy in Settings. */
export function reportText(reports: RunReport[]): string {
  return reports
    .map((r) => {
      const head = `${new Date(r.startedAt).toISOString()} ${r.kind} ${r.status} build ${r.build}`;
      const steps = r.steps.map(
        (s) =>
          `  ${s.ok ? "ok  " : "FAIL"} ${s.name} ${Math.round(s.ms / 1000)}s` +
          (s.counts ? ` ${JSON.stringify(s.counts)}` : "") +
          (s.error ? ` ${s.error}` : ""),
      );
      return [head, ...steps, r.current ? `  (in ${r.current})` : ""].filter(Boolean).join("\n");
    })
    .join("\n");
}
