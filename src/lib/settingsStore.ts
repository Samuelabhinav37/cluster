import type { ProviderId } from "./providers/emailProvider";
import type { DeclutterRule } from "./rules";
import type { ActionLogEntry } from "./actionLog";

export interface DeclutterSettings {
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
  rules: DeclutterRule[];
  /** Rolling "here's what I did" log (see actionLog.ts). Capped at MAX_LOG_ENTRIES. */
  actionLog: ActionLogEntry[];
  /** From-addresses the user has muted via the local BlackHole. */
  mutedSenders: string[];
  /** Screener master switch (Phase 6). */
  screenerEnabled: boolean;
  /** Addresses the user has explicitly let through the Screener. */
  screenerAllowlist: string[];
  /** Cache of people the user has emailed — the implicit Screener allowlist. */
  sentCorrespondents: { addresses: string[]; fetchedAt: number };
  /** One-line summary of the last background triage, shown in "Recently done". */
  lastTriageSummary: string;
  /** Which dashboard tab was last open. */
  activeTab: string;
  /** Collapsed Smart View chips (Phase 5). */
  collapsedSmartViews: string[];
}

const STORAGE_KEY = "declutterSettings";

const DEFAULT_SETTINGS: DeclutterSettings = {
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
  sentCorrespondents: { addresses: [], fetchedAt: 0 },
  lastTriageSummary: "",
  activeTab: "cleanup",
  collapsedSmartViews: [],
};

export async function getSettings(): Promise<DeclutterSettings> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY] as Partial<DeclutterSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(partial: Partial<DeclutterSettings>): Promise<DeclutterSettings> {
  const next = { ...(await getSettings()), ...partial };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
