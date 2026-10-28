// Chrome notifications the user turned on in Settings (settingsMore.ts).
// "notifications" is an optional permission: without it these do nothing.
import { heldByWeek } from "./scamHistory";
import type { ClusterSettings } from "./settingsStore";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The weekly summary's text when one is due (Monday, a week since the last), else null. */
export function weeklySummary(settings: ClusterSettings, now = Date.now()): string | null {
  if (!settings.notifyWeekly || new Date(now).getDay() !== 1) return null;
  if (now - settings.lastWeeklyNotice < 6 * DAY_MS) return null;
  const done = settings.actionLog.filter((e) => now - e.at < 7 * DAY_MS).length;
  // Monday's own week has barely started, so count last week's holds.
  const held = heldByWeek(settings.scamHistory, 2, now)[0].held;
  return `Last week Cluster did ${done} thing${done === 1 ? "" : "s"} for you and held ${held} scam${held === 1 ? "" : "s"}.`;
}

export async function notify(id: string, message: string): Promise<void> {
  if (!chrome.notifications || !(await chrome.permissions.contains({ permissions: ["notifications"] }))) return;
  chrome.notifications.create(id, { type: "basic", iconUrl: "icons/icon-128.png", title: "Cluster", message });
}
