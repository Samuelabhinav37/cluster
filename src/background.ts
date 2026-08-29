import { buildExpiryBuckets, totalExpiryCount } from "./lib/expiryTriage";
import { gmailProvider } from "./lib/providers/gmailProvider";
import { outlookProvider } from "./lib/providers/outlookProvider";
import type { EmailProvider } from "./lib/providers/emailProvider";
import { buildSenderSummaries, type SenderSummary } from "./lib/senderModel";
import { getSettings } from "./lib/settingsStore";
import { excludeSnoozedMessages } from "./lib/snoozeFilter";
import { resurfaceDueSnoozed } from "./lib/snoozeResurface";
import { flushAthenaSecurityEvents, queueAthenaSecurityEvents } from "./lib/athenaIntegration";

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
const ATHENA_ALARM = "declutter-athena-flush";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
  chrome.alarms.create(ATHENA_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
  chrome.alarms.create(ATHENA_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TRIAGE_ALARM) {
    resurfaceDueSnoozed(gmailProvider).catch((err) => console.error("Resurfacing snoozed mail failed", err));
    runBackgroundTriage();
  }
  if (alarm.name === ATHENA_ALARM) void flushAthenaSecurityEvents();
});

// Reports every sender threatSignals flagged (see senderModel.ts /
// threatSignals.ts) as a minimized Athena "warned" event -- queueAthenaSecurityEvent
// itself no-ops instantly when Athena isn't configured (the common case), so this
// runs unconditionally rather than checking twice. sourceEventId is deterministic
// per sender+signal (not per triage run), so re-flagging the same sender on the
// next 6-hourly triage is a safe, server-side-deduped no-op, not a repeat alert.
// This only ever reports -- it never labels, moves, or acts on the message itself;
// see threatSignals.ts's own header for why that's a deliberately separate,
// not-yet-built step.
async function reportThreatSignals(senders: SenderSummary[]) {
  const now = new Date().toISOString();
  const events = senders.flatMap((sender) =>
    sender.threatSignals.map((signal) => ({
      sourceEventId: `${sender.key}:${signal.kind}:${signal.brand}`,
      occurredAt: now,
      action: "warned" as const,
      severity: signal.confidence === "high" ? ("high" as const) : ("medium" as const),
      ruleId: `threat-signal:${signal.kind}`,
      targetIndicator: sender.address.slice(sender.address.lastIndexOf("@") + 1),
      evidence: { brand: signal.brand, kind: signal.kind },
    })),
  );
  await queueAthenaSecurityEvents(events);
}

async function runBackgroundTriage() {
  try {
    const candidates = [gmailProvider, outlookProvider];
    const connectedFlags = await Promise.all(candidates.map((p) => p.isConnected()));
    const connected: EmailProvider[] = candidates.filter((_, i) => connectedFlags[i]);
    if (connected.length === 0) return;

    const settings = await getSettings();
    let senders = await buildSenderSummaries(connected, settings.maxMessagesPerProvider, settings.scanWindowDays);
    const activeSnoozedIds = new Set(
      Object.entries(settings.snoozedMessages)
        .filter(([, v]) => v.resurfaceAt > Date.now())
        .map(([id]) => id),
    );
    senders = excludeSnoozedMessages(senders, activeSnoozedIds);
    await reportThreatSignals(senders);
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
