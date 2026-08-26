import { buildExpiryBuckets, totalExpiryCount } from "./lib/expiryTriage";
import { gmailProvider } from "./lib/providers/gmailProvider";
import { outlookProvider } from "./lib/providers/outlookProvider";
import type { EmailProvider } from "./lib/providers/emailProvider";
import { buildSenderSummaries } from "./lib/senderModel";
import { getSettings } from "./lib/settingsStore";

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("src/dashboard/index.html");
  const existing = await chrome.tabs.query({ url });
  if (existing[0]?.id) {
    chrome.tabs.update(existing[0].id, { active: true });
  } else {
    chrome.tabs.create({ url });
  }
});

// Background pre-triage: periodically counts mail that's aged past its
// retention window (see retentionPolicy.ts) and surfaces the count as a
// badge — never deletes anything itself. Actual deletion always happens
// from the dashboard's "Ready to clean up" section, behind one confirm.
const TRIAGE_ALARM = "declutter-triage";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TRIAGE_ALARM) runBackgroundTriage();
});

async function runBackgroundTriage() {
  try {
    const candidates = [gmailProvider, outlookProvider];
    const connectedFlags = await Promise.all(candidates.map((p) => p.isConnected()));
    const connected: EmailProvider[] = candidates.filter((_, i) => connectedFlags[i]);
    if (connected.length === 0) return;

    const settings = await getSettings();
    const senders = await buildSenderSummaries(connected, settings.maxMessagesPerProvider, settings.scanWindowDays);
    const total = totalExpiryCount(buildExpiryBuckets(senders));

    if (total > 0) {
      await chrome.action.setBadgeText({ text: total > 99 ? "99+" : String(total) });
      await chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.error("Background triage failed", err);
  }
}
