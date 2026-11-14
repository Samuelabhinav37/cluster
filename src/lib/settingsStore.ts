import { log } from "./log";
import type { ScamWeek } from "./scamHistory";
import type { ProviderId } from "./providers/emailProvider";
import type { ClusterRule } from "./rules";
import type { ActionLogEntry } from "./actionLog";
import { normalizeEngagementRecord, type SenderEngagementMap } from "./engagementModel";
import { DEFAULT_INBOX_HOURS, type SortBucket, type SortOverride } from "./sortTaxonomy";
import type { QuarantineReviewMap } from "./quarantineReview";
import { withStorageLock } from "./storageLock";
import { migrateStoredLabelNames } from "./clusterLabels";
import { buildOnboardingPlan, type OnboardingAnswers } from "./onboardingPlan";
import { MAIL_INDEX_CAP, MAIL_INDEX_MAX } from "./mailIndex";

export type UnsubscribeMethod = "one-click" | "mailto";

export interface UnsubscribeRequestRecord {
  requestedAt: number;
  provider: ProviderId;
  /** How it was asked. Older records have none and were one-click. */
  method?: UnsubscribeMethod;
  /** The address a mailto request was sent from. */
  from?: string;
  sentMessageId?: string;
  /** Thread of the sent request, where a bounce would land. */
  sentThreadId?: string;
  /** The address a mailto request went to. */
  to?: string;
  /** The Gmail filter that files their later list mail (unsubscribeBackstop.ts). */
  filterId?: string;
  /** The Gmail filter sending their later mail to Trash, once they kept sending. */
  trashFilterId?: string;
}

export interface ClusterSettings {
  schemaVersion: number;
  scanWindowDays: number;
  /** Most emails the mail index reads: 20,000, or more when the user chose
   * "All" for a bigger mailbox in setup. */
  readCap: number;
  maxMessagesPerProvider: number;
  collapsedSenderCategories: string[];
  collapsedDomainCategories: string[];
  // Keyed the same way SenderSummary.key is built (`${provider}:${address}`).
  unsubscribeRequests: Record<string, UnsubscribeRequestRecord>;
  fastPermanentDeleteEnabled: boolean;
  onboardingDismissed: boolean;
  // Gmail-only — keyed by message id (see gmailApi.snoozeMessages).
  snoozedMessages: Record<string, { resurfaceAt: number; provider: ProviderId }>;
  /** Gmail-only: bring a sent thread back when nobody answered (replyReminders.ts).
   * `reminded` is threadId → the message last brought back, so each goes once. */
  replyReminders: { enabled: boolean; days: number; reminded: Record<string, string> };
  /** Protect's opt-in rules, run with auto-quarantine (background.ts runQuarantine):
   * held scams also go to Gmail's Spam, and mail failing DMARC (or both SPF
   * and DKIM) from someone you don't write to is held on that alone.
   * `strict` holds mail that only earns a warning too (verdict.ts). */
  securityRules: { toSpam: boolean; holdAuthFails: boolean; strict?: boolean };
  /** The newest security scan: Scan now on Security, or the background's daily one. */
  lastSecurityScan?: { at: number; found: number };
  /** Newsletters held out of the inbox and delivered on Saturday morning,
   * or every morning with `daily` (newsletterDay.ts). */
  newsletterDay: { enabled: boolean; lastDelivered: number; daily?: boolean };

  // ── Power features (Phases 2–6) ──────────────────────────────────────────
  /** Standing user rules — Auto Clean equivalent (see rules.ts / ruleRunner.ts). */
  rules: ClusterRule[];
  /** The Gmail filter standing in for each rule Gmail can run (ruleFilters.ts), by rule id. */
  ruleFilters?: Record<string, { id: string; spec: string }>;
  /** Shortcut keys the user changed, by shortcut id (keymap.ts). */
  keymap?: Record<string, string>;
  /** Single-key shortcuts on. Off leaves only Ctrl or Cmd shortcuts. */
  singleKeys?: boolean;
  /** Words from Kai questions linked to the answers picked (kaiMatch.ts). */
  kaiLearned?: Record<string, Record<string, { n: number; at: number }>>;
  /** Questions Kai couldn't answer, newest first, at most 50. */
  kaiMissed?: { q: string; at: number }[];
  /** Gmail's inbox unread count, one a day (inboxTrend.ts). */
  unreadSnapshots?: Record<string, number>;
  /** Rolling "here's what I did" log (see actionLog.ts). Capped at MAX_LOG_ENTRIES. */
  actionLog: ActionLogEntry[];
  /** Emails Cluster took out of the inbox since install (Home's "since you started"). */
  clearedTotal?: number;
  /** From-addresses the user has muted via the local BlackHole. */
  mutedSenders: string[];
  /** "This is a person" (true) / "Not a person" (false), by sender key. */
  personOverrides: Record<string, boolean>;
  /** Screener master switch (Phase 6). */
  screenerEnabled: boolean;
  /** Off: the Screener holds only lists and automated mail. */
  screenerHoldPeople: boolean;
  /** Addresses the user has explicitly let through the Screener. */
  screenerAllowlist: string[];
  /** Addresses currently held in the Screener label, awaiting a
   * decision — so the background sweep doesn't re-screen them and the tab can
   * tell "held" from "trusted". */
  screenedSenders: string[];
  /** Cache of people the user has emailed — the implicit Screener allowlist. */
  sentCorrespondents: { addresses: string[]; fetchedAt: number };
  /** One-line summary of the last background triage, shown in "Recently done". */
  lastTriageSummary: string;
  /** Which dashboard tab was last open. */
  activeTab: string;
  /** Dashboard colour theme. "system" follows prefers-color-scheme. */
  theme: "system" | "light" | "dark";
  /** First-run setup answer (setupTab.ts). "" until the user picks one. */
  persona: "" | "calm" | "business" | "safe" | "busy";
  /** Set once the user answered or dismissed the setup question. */
  setupDone: boolean;
  /** The first-run setup's answers, kept so Setup can reopen with them (onboardingPlan.ts). */
  onboarding?: { version: 1; answers: OnboardingAnswers; answeredAt: number };
  /** Sender domain → verdict on a brand it claimed (brandRegistry.ts). "real"
   * domains count as the brand's own from then on. */
  brandVerdicts?: Record<string, BrandVerdict>;
  /** Bigger text and a three-item nav (setupTab.ts). */
  simpleMode: boolean;
  /** Kai's corner button and tips. */
  showKai: boolean;
  /** Chrome notifications (optional "notifications" permission). */
  notifyScamHeld: boolean;
  notifyWeekly: boolean;
  /** When the last weekly summary went out, so it goes once a week. */
  lastWeeklyNotice: number;
  /** Put Home's Today list in the inbox as one email each morning (today.ts). */
  todayEmail: boolean;
  lastTodayEmail: number;
  /** Weekly counts of what auto-quarantine held, for the Scam report (scamHistory.ts). */
  scamHistory: ScamWeek[];

  // ── Security (Phase 2) ──────────────────────────────────────────────────
  /** Provider + sender address → epoch ms first seen. After the initial
   * baseline, an absent key is shown as new since tracking began. */
  knownSenders: Record<string, number>;
  /** False until the first recent-Inbox baseline has been stored. */
  knownSendersInitialized: boolean;
  /** Opaque Gmail history / Outlook delta checkpoints. */
  incrementalSyncCursors: Partial<Record<ProviderId, string>>;
  lastIncrementalSyncAt: number;
  /** Aggregate-only local learning state. Never contains message ids, subjects, or bodies. */
  senderEngagement: SenderEngagementMap;
  /** Opt-in: the background triage labels high-risk senders as suspicious and
   * files them out of the inbox (Gmail-only, reversible, never deletes). */
  autoQuarantineHighRisk: boolean;
  /** Senders currently auto-quarantined and awaiting a review-queue decision
   * (see quarantineReview.ts). Keyed by SenderSummary.key. Written by
   * background.ts's runQuarantine, cleared by the Security tab's
   * confirm/release actions. */
  quarantinedSenders: Record<string, { at: number; messageIds: string[] }>;
  /** Durable confirm/release verdict history feeding
   * quarantineReview.quarantineScoreAdjustment, so a released (false-
   * positive) sender isn't immediately re-quarantined next alarm cycle. */
  quarantineReview: QuarantineReviewMap;

  // ── Sort my inbox (Phase 3) ─────────────────────────────────────────────
  autoSort: {
    /** Bucket ids (see sortTaxonomy.ts) the user has enabled for sorting. */
    enabledBuckets: string[];
    /** Per-bucket override of the "file out of inbox" default. */
    fileOutByBucket: Record<string, boolean>;
    /** Save a standing rule per enabled bucket so the 6-hourly sweep keeps
     * sorting new mail. */
    keepSorting: boolean;
    /** Also auto-trash one-time codes older than 2 days (standing rule). */
    expireOtp: boolean;
    /** Ids of the Gmail filters Cluster created for server-side "keep sorting",
     * per domain-category bucket (see serverSort.ts). Deleted/recreated when the
     * bucket's config changes; cleared when keep-sorting is turned off. */
    filterIdsByBucket: Record<string, string[]>;
    /** Same, for Outlook inbox messageRules. */
    ruleIdsByBucket: Record<string, string[]>;
    /** Fingerprint of what each stored Gmail filter does (categoryFilters.specKey),
     * so a sync only replaces filters whose settings changed. */
    filterSpecByBucket: Record<string, string>;
    /** Inbox time limits: Gmail filters label every category on arrival and
     * the background sweep moves mail out once its category's limit passes. */
    timeLimitsEnabled: boolean;
    /** Hours new mail stays in the inbox, per category. 0 = straight to the
     * label; null = stays in the inbox. Defaults: DEFAULT_INBOX_HOURS. */
    inboxHoursByBucket: Record<string, number | null>;
    /** Kinds set to Off on Organize: no label, no filter, never moved. */
    labelsOff: string[];
    /** The last time-limit sweep: when, and how many messages it moved. */
    lastSweep: { at: number; moved: number };
    /** Messages past their limit that a sweep kept in the inbox (risky, or a
     * person's own note), so later sweeps don't re-read them. Capped. */
    keptInInboxIds: string[];
    /** When labels began skipping the inbox (0 = they don't). Unread mail
     * filed after this was never shown, so it says nothing about what you
     * open (senderProfile, neverRead). */
    skipInboxSince: number;
    /** Catch-up labelling of older inbox mail (inboxTimeLimits.tagOlderInbox):
     * 0 or -1 = not started, -2 = done, else the next page ends at this time (ms). */
    tagBackBefore: number;
    /** Inbox mail that fits no label goes to the Screener after a few hours
     * (inboxTimeLimits.holdUnsortedInbox). */
    holdUnsorted: boolean;
    /** Where the next Screener page ends (epoch seconds, 0 = the newest mail). */
    holdBefore: number;
    /** LABEL_RULES_VERSION the inbox was last relabelled from the mail index
     * under; a newer version relabels it once (inboxTimeLimitsRunner). */
    labelledVersion: number;
    /** LABEL_RULES_VERSION of the last label-by-search pass (0 = never). */
    searchedVersion: number;
    /** When all read mail (archived too) was last checked for missing labels. */
    lastRelabelAt: number;
    /** Label swaps made in Gmail, per sender, not yet learned (learnFromMoves.ts). */
    moveVotes: Record<string, { bucket: SortBucket; n: number }>;
  };
  /** Per-sender "wrong bucket?" corrections from the sort preview, keyed by
   * lowercased from-address → a bucket to force, or "never" to skip. Consulted
   * by buildSortPlan (see sortTaxonomy.effectiveBucket). */
  sortOverrides: Record<string, SortOverride>;
  /** True once the first-run "reuse your existing labels/filters" card has been
   * shown and dismissed (see seedFromExisting.ts). */
  seededFromExisting: boolean;
  /** The user closed the "Tidy up Cluster's labels" card without applying. */
  labelTidyDismissed: boolean;
  /** The user said to keep labels that aren't Cluster's; Sort stops asking. */
  keepOtherLabels: boolean;

  // ── Flat-label collision guard ─────────────────────────────────────────
  /** Canonical names of Gmail labels Cluster itself created. Lets us tell
   * "this is our label, reuse it" from "the user already had a label with
   * this name" (see labelResolver.ts). */
  clusterOwnedLabels: string[];
  /** Desired label name → the name to actually use, once the user has
   * resolved a clash with one of their own labels. `"Shopping"` maps to
   * either `"Shopping"` (reuse theirs) or `"Shopping · sorted"` (keep separate). */
  labelChoices: Record<string, string>;

  // ── Overview trend ─────────────────────────────────────────────────────
  /** One deterministic inbox-health score per ISO week, oldest first, capped
   * at the last 12 weeks — feeds the Overview screen's trend chart. Written
   * once per scan when the current week has no entry yet (see
   * inboxHealth.recordHealthSnapshot). */
  healthHistory: HealthSnapshot[];
}

export interface BrandVerdict {
  /** Hand-list brand the sender claimed, e.g. "paypal". */
  brand: string;
  verdict: "real" | "fake";
  /** "certificate" when the one-tap check decided (markCheck.ts). */
  by: "certificate" | "you";
  /** Legal name a certificate named. */
  company?: string;
  at: number;
}

export interface HealthSnapshot {
  /** ISO week, e.g. "2026-W37". */
  week: string;
  /** 0–100, from inboxHealth.inboxHealthScore. */
  score: number;
}

const STORAGE_KEY = "clusterSettings";
/** A scan window that reaches the first email (Gmail began in 2004). */
export const ALL_MAIL_DAYS = 36500;
export const CURRENT_SETTINGS_SCHEMA_VERSION = 18;

const DEFAULT_SETTINGS: ClusterSettings = {
  schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  // All mail, back to the first email (see ALL_MAIL_DAYS); readCap bounds the count.
  scanWindowDays: ALL_MAIL_DAYS,
  readCap: MAIL_INDEX_CAP,
  // Each message is a 20-unit Gmail messages.get against a 6,000-unit/min
  // per-user ceiling (the ledger paces to 5,500). 150 here + the 100-message
  // security lane keeps a cold first scan inside roughly one quota window, so
  // it finishes in under a minute instead of stalling mid-scan for the window
  // to clear. Raise it in Settings for a deeper (and slower, paced) scan.
  maxMessagesPerProvider: 150,
  collapsedSenderCategories: [],
  collapsedDomainCategories: [],
  unsubscribeRequests: {},
  fastPermanentDeleteEnabled: false,
  onboardingDismissed: false,
  snoozedMessages: {},
  replyReminders: { enabled: false, days: 3, reminded: {} },
  securityRules: { toSpam: false, holdAuthFails: false },
  newsletterDay: { enabled: false, lastDelivered: 0 },
  rules: [],
  ruleFilters: {},
  keymap: {},
  singleKeys: true,
  actionLog: [],
  mutedSenders: [],
  personOverrides: {},
  screenerEnabled: false,
  screenerHoldPeople: true,
  screenerAllowlist: [],
  screenedSenders: [],
  sentCorrespondents: { addresses: [], fetchedAt: 0 },
  lastTriageSummary: "",
  activeTab: "overview",
  theme: "system",
  persona: "",
  setupDone: false,
  simpleMode: false,
  showKai: true,
  notifyScamHeld: false,
  notifyWeekly: false,
  lastWeeklyNotice: 0,
  todayEmail: false,
  lastTodayEmail: 0,
  scamHistory: [],
  knownSenders: {},
  knownSendersInitialized: false,
  incrementalSyncCursors: {},
  lastIncrementalSyncAt: 0,
  senderEngagement: {},
  autoQuarantineHighRisk: false,
  quarantinedSenders: {},
  quarantineReview: {},
  autoSort: {
    enabledBuckets: [],
    fileOutByBucket: {},
    keepSorting: false,
    expireOtp: false,
    filterIdsByBucket: {},
    ruleIdsByBucket: {},
    filterSpecByBucket: {},
    timeLimitsEnabled: false,
    inboxHoursByBucket: { ...DEFAULT_INBOX_HOURS },
    labelsOff: [],
    lastSweep: { at: 0, moved: 0 },
    keptInInboxIds: [],
    skipInboxSince: 0,
    tagBackBefore: 0,
    holdUnsorted: true,
    holdBefore: 0,
    labelledVersion: 0,
    searchedVersion: 0,
    lastRelabelAt: 0,
    moveVotes: {},
  },
  sortOverrides: {},
  seededFromExisting: false,
  labelTidyDismissed: false,
  keepOtherLabels: false,
  clusterOwnedLabels: [],
  labelChoices: {},
  healthHistory: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function migrateSettings(value: unknown): Record<string, unknown> {
  let stored = isRecord(value) ? { ...value } : {};
  let version = typeof stored.schemaVersion === "number" ? stored.schemaVersion : 0;
  if (version > CURRENT_SETTINGS_SCHEMA_VERSION) {
    throw new Error(
      `Settings schema ${version} is newer than this Cluster build supports (${CURRENT_SETTINGS_SCHEMA_VERSION})`,
    );
  }
  while (version < CURRENT_SETTINGS_SCHEMA_VERSION) {
    if (version === 0) {
      stored = { ...stored, schemaVersion: 1 };
      version = 1;
    } else if (version === 1) {
      stored = {
        ...stored,
        schemaVersion: 2,
        incrementalSyncCursors: {},
        lastIncrementalSyncAt: 0,
      };
      version = 2;
    } else if (version === 2) {
      stored = {
        ...stored,
        schemaVersion: 3,
        senderEngagement: {},
      };
      version = 3;
    } else if (version === 3) {
      stored = {
        ...stored,
        schemaVersion: 4,
        clusterOwnedLabels: [],
        labelChoices: {},
      };
      version = 4;
    } else if (version === 4) {
      stored = {
        ...stored,
        schemaVersion: 5,
        sortOverrides: {},
      };
      version = 5;
    } else if (version === 5) {
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      stored = {
        ...stored,
        schemaVersion: 6,
        autoSort: { ...autoSort, filterIdsByBucket: {} },
      };
      version = 6;
    } else if (version === 6) {
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      stored = {
        ...stored,
        schemaVersion: 7,
        autoSort: { ...autoSort, ruleIdsByBucket: {} },
      };
      version = 7;
    } else if (version === 7) {
      stored = { ...stored, schemaVersion: 8, seededFromExisting: false };
      version = 8;
    } else if (version === 8) {
      stored = { ...stored, schemaVersion: 9, theme: "system" };
      version = 9;
    } else if (version === 9) {
      stored = { ...stored, schemaVersion: 10, quarantinedSenders: {}, quarantineReview: {} };
      version = 10;
    } else if (version === 10) {
      stored = { ...stored, schemaVersion: 11, healthHistory: [] };
      version = 11;
    } else if (version === 11) {
      stored = { ...migrateStoredLabelNames(stored), schemaVersion: 12 };
      version = 12;
    } else if (version === 12) {
      // Inbox time limits: defaults come from normalisation; off until the
      // user turns them on.
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      stored = {
        ...stored,
        schemaVersion: 13,
        autoSort: { ...autoSort, filterSpecByBucket: {}, timeLimitsEnabled: false },
      };
      version = 13;
    } else if (version === 13) {
      // Engagement now comes from the mail index; keep only the feedback
      // counts of each sender's record.
      const engagement = isRecord(stored.senderEngagement) ? stored.senderEngagement : {};
      const feedback: SenderEngagementMap = {};
      for (const [key, record] of Object.entries(engagement)) {
        const normalized = normalizeEngagementRecord(record);
        if (normalized) feedback[key] = normalized;
      }
      stored = { ...stored, schemaVersion: 14, senderEngagement: feedback };
      version = 14;
    } else if (version === 14) {
      // Every label now leaves the inbox an hour after it's labelled; mail
      // that already skips the inbox (0) keeps doing so.
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      const hours = isRecord(autoSort.inboxHoursByBucket) ? { ...autoSort.inboxHoursByBucket } : {};
      for (const b of Object.keys(hours)) if (hours[b] !== 0) hours[b] = 1;
      stored = { ...stored, schemaVersion: 15, autoSort: { ...autoSort, inboxHoursByBucket: hours } };
      version = 15;
    } else if (version === 15) {
      // Promotions, newsletters and social skip the inbox on arrival: the
      // Gmail filter moves them on Google's side, so it works with Chrome
      // closed and can't stall the way the timed move-out did (Nov 2026).
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      const hours = isRecord(autoSort.inboxHoursByBucket) ? { ...autoSort.inboxHoursByBucket } : {};
      // Only where times were saved: a fresh install gets these from setup.
      for (const b of ["promotions", "newsletter", "social"]) if (b in hours) hours[b] = 0;
      stored = { ...stored, schemaVersion: 16, autoSort: { ...autoSort, inboxHoursByBucket: hours } };
      version = 16;
    } else if (version === 16) {
      // Every label skips the inbox now; the user turns one back per label.
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      const hours = isRecord(autoSort.inboxHoursByBucket) ? { ...autoSort.inboxHoursByBucket } : {};
      for (const b of Object.keys(hours)) hours[b] = 0;
      stored = { ...stored, schemaVersion: 17, autoSort: { ...autoSort, inboxHoursByBucket: hours } };
      version = 17;
    } else if (version === 17) {
      // Labelled mail from starred threads and senders you've written to now
      // leaves the inbox too: forget the mail earlier sweeps kept for that.
      // (Mail put back with Undo is forgotten once as well.)
      const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
      stored = {
        ...stored,
        schemaVersion: 18,
        autoSort: "keptInInboxIds" in autoSort ? { ...autoSort, keptInInboxIds: [] } : autoSort,
      };
      version = 18;
    }
  }
  return stored;
}

function normalizeSettings(value: unknown): ClusterSettings {
  const stored = migrateSettings(value);
  const sentCorrespondents = isRecord(stored.sentCorrespondents) ? stored.sentCorrespondents : {};
  const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
  const answers = isRecord(stored.onboarding) && isRecord(stored.onboarding.answers) ? stored.onboarding.answers : null;
  // A label added after setup takes the time setup's answers give it, not the bare default.
  const setupHours = answers && Array.isArray(answers.keep) ? buildOnboardingPlan(answers as unknown as OnboardingAnswers).hours : {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    readCap: Math.min(MAIL_INDEX_MAX, Math.max(MAIL_INDEX_CAP, Number(stored.readCap) || MAIL_INDEX_CAP)),
    sentCorrespondents: {
      ...DEFAULT_SETTINGS.sentCorrespondents,
      ...sentCorrespondents,
    } as ClusterSettings["sentCorrespondents"],
    autoSort: {
      ...DEFAULT_SETTINGS.autoSort,
      ...autoSort,
      fileOutByBucket: {
        ...DEFAULT_SETTINGS.autoSort.fileOutByBucket,
        ...(isRecord(autoSort.fileOutByBucket) ? autoSort.fileOutByBucket : {}),
      },
      filterIdsByBucket: {
        ...DEFAULT_SETTINGS.autoSort.filterIdsByBucket,
        ...(isRecord(autoSort.filterIdsByBucket) ? autoSort.filterIdsByBucket : {}),
      },
      ruleIdsByBucket: {
        ...DEFAULT_SETTINGS.autoSort.ruleIdsByBucket,
        ...(isRecord(autoSort.ruleIdsByBucket) ? autoSort.ruleIdsByBucket : {}),
      },
      filterSpecByBucket: isRecord(autoSort.filterSpecByBucket) ? autoSort.filterSpecByBucket : {},
      // Every category has a limit, including ones added after the user saved.
      inboxHoursByBucket: {
        ...DEFAULT_SETTINGS.autoSort.inboxHoursByBucket,
        ...setupHours,
        ...(isRecord(autoSort.inboxHoursByBucket) ? autoSort.inboxHoursByBucket : {}),
      },
    } as ClusterSettings["autoSort"],
  };
}

async function readSettings(): Promise<{ settings: ClusterSettings; needsMigration: boolean }> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = data[STORAGE_KEY];
  const rawVersion = isRecord(raw) && typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  return {
    settings: normalizeSettings(raw),
    needsMigration: rawVersion !== CURRENT_SETTINGS_SCHEMA_VERSION,
  };
}

export async function getSettings(): Promise<ClusterSettings> {
  const read = await readSettings();
  if (!read.needsMigration) return read.settings;
  return withStorageLock(STORAGE_KEY, async () => {
    const latest = await readSettings();
    if (latest.needsMigration) {
      await chrome.storage.local.set({ [STORAGE_KEY]: latest.settings });
    }
    return latest.settings;
  });
}

export async function mutateSettings(
  mutate: (current: ClusterSettings) => ClusterSettings,
): Promise<ClusterSettings> {
  return withStorageLock(STORAGE_KEY, async () => {
    const current = (await readSettings()).settings;
    const next = normalizeSettings(mutate(current));
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    void pushSynced(next);
    return next;
  });
}

export function updateSettings(partial: Partial<ClusterSettings>): Promise<ClusterSettings> {
  return mutateSettings((current) => ({ ...current, ...partial }));
}

// ── Sync across devices ─────────────────────────────────────────────────────
// The user's choices follow them through Chrome sync (chrome.storage.sync), so
// a second computer or a reinstall skips setup and keeps what Cluster learned.
// Per-device state (the mail index, activity, filter ids, sweep bookkeeping)
// stays local. Each choice is its own item: Chrome caps one at 8 KB.
// shortcut: a choice over 8 KB (a huge rule list) stays on this device; split it if that happens.

/** Top-level choices that follow the user. */
const SYNCED_KEYS = [
  "scanWindowDays",
  "readCap",
  "theme",
  "showKai",
  "simpleMode",
  "persona",
  "setupDone",
  "onboarding",
  "onboardingDismissed",
  "notifyScamHeld",
  "notifyWeekly",
  "todayEmail",
  "autoQuarantineHighRisk",
  "securityRules",
  "screenerEnabled",
  "screenerHoldPeople",
  "screenerAllowlist",
  "mutedSenders",
  "personOverrides",
  "sortOverrides",
  "labelChoices",
  "rules",
  "keymap",
  "singleKeys",
  "brandVerdicts",
] as const satisfies readonly (keyof ClusterSettings)[];

/** The choices inside autoSort; the rest of it is bookkeeping. */
const SYNCED_AUTOSORT = ["timeLimitsEnabled", "inboxHoursByBucket", "labelsOff", "holdUnsorted", "enabledBuckets", "keepSorting", "expireOtp"] as const;

const SYNC_PREFIX = "settings:";
/** The schema the synced copy was written at. Without it, a copy written by
 * an older version laid its old choices back over a migrated computer. */
const SYNC_SCHEMA_KEY = `${SYNC_PREFIX}schema`;
/** Sync shipped at schema 15, before copies carried their version. */
const SYNC_FIRST_SCHEMA = 15;

/** Synced items written at an older schema, brought up to this one. */
function migrateSyncedItems(items: Record<string, unknown>): Record<string, unknown> {
  const stored = items[SYNC_SCHEMA_KEY];
  const version = typeof stored === "number" ? stored : SYNC_FIRST_SCHEMA;
  if (version >= CURRENT_SETTINGS_SCHEMA_VERSION) return items;
  const raw: Record<string, unknown> = { schemaVersion: version };
  for (const [key, value] of Object.entries(items)) if (key !== SYNC_SCHEMA_KEY) raw[key.slice(SYNC_PREFIX.length)] = value;
  const migrated = migrateSettings(raw);
  return Object.fromEntries(Object.keys(raw).filter((k) => k !== "schemaVersion").map((k) => [SYNC_PREFIX + k, migrated[k]]));
}
const SYNC_ITEM_MAX = 8000;

/** The synced items for these settings, keyed as stored in chrome.storage.sync. */
export function syncedItems(settings: ClusterSettings): Record<string, unknown> {
  const items: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) if (settings[key] !== undefined) items[SYNC_PREFIX + key] = settings[key];
  const autoSort: Record<string, unknown> = {};
  for (const key of SYNCED_AUTOSORT) autoSort[key] = settings.autoSort[key];
  items[`${SYNC_PREFIX}autoSort`] = autoSort;
  return items;
}

/** Settings with the synced items laid over them. */
export function applySyncedItems(settings: ClusterSettings, items: Record<string, unknown>): ClusterSettings {
  const next: Record<string, unknown> = { ...settings };
  for (const key of SYNCED_KEYS) if (SYNC_PREFIX + key in items) next[key] = items[SYNC_PREFIX + key];
  const autoSort = items[`${SYNC_PREFIX}autoSort`];
  if (isRecord(autoSort)) next.autoSort = { ...settings.autoSort, ...autoSort };
  return next as unknown as ClusterSettings;
}

function syncArea(): chrome.storage.StorageArea | undefined {
  return globalThis.chrome?.storage?.sync;
}

/** Set once this context has taken the synced choices. Until then it never
 * pushes: a new computer's defaults would overwrite the user's choices. */
let pulled = false;

/** Writes the choices that changed; unchanged ones cost no sync write. */
async function pushSynced(settings: ClusterSettings): Promise<void> {
  const area = syncArea();
  if (!area || !pulled) return;
  try {
    const items = { ...syncedItems(settings), [SYNC_SCHEMA_KEY]: CURRENT_SETTINGS_SCHEMA_VERSION };
    const stored = await area.get(Object.keys(items));
    const changed: Record<string, unknown> = {};
    const tooBig: string[] = [];
    for (const [key, value] of Object.entries(items)) {
      const json = JSON.stringify(value);
      if (json.length > SYNC_ITEM_MAX) {
        // Past sync's item limit it stays on this computer. Its old synced
        // copy is dropped: pulled back at every start, it undid newer choices.
        if (key in stored) tooBig.push(key);
        continue;
      }
      if (json !== JSON.stringify(stored[key])) changed[key] = value;
    }
    if (tooBig.length > 0) await area.remove(tooBig);
    if (Object.keys(changed).length > 0) await area.set(changed);
  } catch (err) {
    // Sync is a convenience: a full quota or an offline browser keeps working locally.
    log.error("Settings sync push failed", err);
  }
}

/** Lays the synced choices over this device's settings. Run at startup and
 * when another device changes them. */
export async function pullSyncedSettings(): Promise<void> {
  const area = syncArea();
  if (!area) return;
  const all = await area.get(null);
  const items = Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(SYNC_PREFIX)));
  if (Object.keys(items).length > 0) {
    await withStorageLock(STORAGE_KEY, async () => {
      const current = (await readSettings()).settings;
      const next = normalizeSettings(applySyncedItems(current, migrateSyncedItems(items)));
      if (JSON.stringify(next) !== JSON.stringify(current)) await chrome.storage.local.set({ [STORAGE_KEY]: next });
    });
  }
  // First pull on a computer that already had choices: share them.
  const first = !pulled;
  pulled = true;
  if (first) await pushSynced((await readSettings()).settings);
}

/** Keeps this device in step while it runs. */
export function followSyncedSettings(): void {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "sync" && Object.keys(changes).some((key) => key.startsWith(SYNC_PREFIX))) void pullSyncedSettings();
  });
}

/** For "Erase all": the synced copy goes too, or it would come straight back. */
export async function clearSyncedSettings(): Promise<void> {
  const area = syncArea();
  if (!area) return;
  const all = await area.get(null);
  await area.remove(Object.keys(all).filter((key) => key.startsWith(SYNC_PREFIX)));
}
