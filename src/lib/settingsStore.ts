import type { ProviderId } from "./providers/emailProvider";

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
