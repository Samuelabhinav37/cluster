import type { ProviderId } from "./providers/emailProvider";
import type { ClusterRule } from "./rules";
import type { ActionLogEntry } from "./actionLog";
import type { SenderEngagementMap } from "./engagementModel";
import type { SortOverride } from "./sortTaxonomy";
import { withStorageLock } from "./storageLock";

export interface ClusterSettings {
  schemaVersion: number;
  scanWindowDays: number;
  maxMessagesPerProvider: number;
  collapsedSenderCategories: string[];
  collapsedDomainCategories: string[];
  // Keyed the same way SenderSummary.key is built (`${provider}:${address}`).
  unsubscribeRequests: Record<string, { requestedAt: number; provider: ProviderId }>;
  fastPermanentDeleteEnabled: boolean;
  onboardingDismissed: boolean;
  // Gmail-only — keyed by message id (see gmailApi.snoozeMessages).
  snoozedMessages: Record<string, { resurfaceAt: number; provider: ProviderId }>;

  // ── Power features (Phases 2–6) ──────────────────────────────────────────
  /** Standing user rules — Auto Clean equivalent (see rules.ts / ruleRunner.ts). */
  rules: ClusterRule[];
  /** Rolling "here's what I did" log (see actionLog.ts). Capped at MAX_LOG_ENTRIES. */
  actionLog: ActionLogEntry[];
  /** From-addresses the user has muted via the local BlackHole. */
  mutedSenders: string[];
  /** Screener master switch (Phase 6). */
  screenerEnabled: boolean;
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
  };
  /** Per-sender "wrong bucket?" corrections from the sort preview, keyed by
   * lowercased from-address → a bucket to force, or "never" to skip. Consulted
   * by buildSortPlan (see sortTaxonomy.effectiveBucket). */
  sortOverrides: Record<string, SortOverride>;
  /** True once the first-run "reuse your existing labels/filters" card has been
   * shown and dismissed (see seedFromExisting.ts). */
  seededFromExisting: boolean;

  // ── Flat-label collision guard ─────────────────────────────────────────
  /** Canonical names of Gmail labels Cluster itself created. Lets us tell
   * "this is our label, reuse it" from "the user already had a label with
   * this name" (see labelResolver.ts). */
  clusterOwnedLabels: string[];
  /** Desired label name → the name to actually use, once the user has
   * resolved a clash with one of their own labels. `"Shopping"` maps to
   * either `"Shopping"` (reuse theirs) or `"Shopping (Cluster)"` (keep separate). */
  labelChoices: Record<string, string>;
}

const STORAGE_KEY = "clusterSettings";
export const CURRENT_SETTINGS_SCHEMA_VERSION = 8;

const DEFAULT_SETTINGS: ClusterSettings = {
  schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  scanWindowDays: 180,
  maxMessagesPerProvider: 500,
  collapsedSenderCategories: [],
  collapsedDomainCategories: [],
  unsubscribeRequests: {},
  fastPermanentDeleteEnabled: false,
  onboardingDismissed: false,
  snoozedMessages: {},
  rules: [],
  actionLog: [],
  mutedSenders: [],
  screenerEnabled: false,
  screenerAllowlist: [],
  screenedSenders: [],
  sentCorrespondents: { addresses: [], fetchedAt: 0 },
  lastTriageSummary: "",
  activeTab: "cleanup",
  knownSenders: {},
  knownSendersInitialized: false,
  incrementalSyncCursors: {},
  lastIncrementalSyncAt: 0,
  senderEngagement: {},
  autoQuarantineHighRisk: false,
  autoSort: {
    enabledBuckets: [],
    fileOutByBucket: {},
    keepSorting: false,
    expireOtp: false,
    filterIdsByBucket: {},
    ruleIdsByBucket: {},
  },
  sortOverrides: {},
  seededFromExisting: false,
  clusterOwnedLabels: [],
  labelChoices: {},
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
    }
  }
  return stored;
}

function normalizeSettings(value: unknown): ClusterSettings {
  const stored = migrateSettings(value);
  const sentCorrespondents = isRecord(stored.sentCorrespondents) ? stored.sentCorrespondents : {};
  const autoSort = isRecord(stored.autoSort) ? stored.autoSort : {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
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
    return next;
  });
}

export function updateSettings(partial: Partial<ClusterSettings>): Promise<ClusterSettings> {
  return mutateSettings((current) => ({ ...current, ...partial }));
}
