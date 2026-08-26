import type { EmailProvider } from "./providers/emailProvider";
import { getSettings, updateSettings } from "./settingsStore";

// Called from both background.ts's triage alarm (every 6h) and the
// dashboard's own startup, so an expired snooze gets its Gmail INBOX label
// back promptly rather than only on the alarm's cadence.
export async function resurfaceDueSnoozed(provider: EmailProvider): Promise<number> {
  if (!provider.resurfaceMessages) return 0;

  const settings = await getSettings();
  const now = Date.now();
  const due = Object.entries(settings.snoozedMessages).filter(([, v]) => v.resurfaceAt <= now);
  if (due.length === 0) return 0;

  const token = await provider.getAuthToken(false);
  await provider.resurfaceMessages(
    token,
    due.map(([id]) => id),
  );

  const remaining = { ...settings.snoozedMessages };
  for (const [id] of due) delete remaining[id];
  await updateSettings({ snoozedMessages: remaining });

  return due.length;
}
