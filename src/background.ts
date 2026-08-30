import { log } from "./lib/log";
import { buildExpiryBuckets, totalExpiryCount } from "./lib/expiryTriage";
import { gmailProvider } from "./lib/providers/gmailProvider";
import { outlookProvider } from "./lib/providers/outlookProvider";
import type { EmailProvider, ProviderId } from "./lib/providers/emailProvider";
import { applyRules } from "./lib/ruleRunner";
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "./lib/screener";
import { markFirstContact } from "./lib/firstContact";
import { riskTier, senderRiskScore } from "./lib/threatSignals";
import { appendActionLog, makeLogId } from "./lib/actionLog";
import { buildSenderSummaries, type SenderSummary } from "./lib/senderModel";
import type { ClusterSettings } from "./lib/settingsStore";
import { getSettings, updateSettings } from "./lib/settingsStore";
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
const TRIAGE_ALARM = "cluster-triage";
const ATHENA_ALARM = "cluster-athena-flush";

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
    resurfaceDueSnoozed(gmailProvider).catch((err) => log.error("Resurfacing snoozed mail failed", err));
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

// Screener: hold mail from senders the user has never corresponded with. Opt-in
// (settings.screenerEnabled). Refreshes the sent-correspondent allowlist on a
// TTL, then moves each newly-unknown sender's mail under Cluster/Screener and
// records it in screenedSenders so it isn't re-screened. Returns how many
// senders are currently held, for the badge.
async function runScreener(settings: ClusterSettings, senders: SenderSummary[]): Promise<number> {
  if (!settings.screenerEnabled || !gmailProvider.screenSender) return 0;
  const token = await gmailProvider.getAuthToken(false).catch(() => null);
  if (!token) return 0;

  let sent = settings.sentCorrespondents;
  if (sentCorrespondentsStale(settings) && gmailProvider.listSentCorrespondents) {
    try {
      sent = { addresses: await gmailProvider.listSentCorrespondents(token), fetchedAt: Date.now() };
      await updateSettings({ sentCorrespondents: sent });
    } catch (err) {
      log.error("Screener: sent-correspondent refresh failed", err);
    }
  }

  const known = knownSenderSet({ ...settings, sentCorrespondents: sent });
  const excluded = new Set([...settings.mutedSenders, ...settings.screenedSenders].map((a) => a.toLowerCase()));
  const pending = pendingScreenerSenders(senders, known, excluded);

  const screened: string[] = [];
  for (const s of pending) {
    try {
      await gmailProvider.screenSender(token, s.address, s.messageIds);
      screened.push(s.address);
    } catch (err) {
      log.error("Screener: failed to hold", s.address, err);
    }
  }
  if (screened.length > 0) {
    await updateSettings({ screenedSenders: [...settings.screenedSenders, ...screened] });
  }
  return settings.screenedSenders.length + screened.length;
}

// Opt-in protective action (settings.autoQuarantineHighRisk). For senders the
// threat scorer puts in the "high" tier, label their mail Cluster/Possible
// Phishing and file it out of the inbox -- Gmail-only, never deletes, and
// reversible from the Recently-done tab (label-removal undo). Off by default.
async function runQuarantine(settings: ClusterSettings, senders: SenderSummary[]): Promise<number> {
  if (!settings.autoQuarantineHighRisk || !gmailProvider.labelSuspicious) return 0;
  const targets = senders.filter(
    (s) => s.provider === "gmail" && riskTier(senderRiskScore(s.threatSignals)) === "high",
  );
  if (targets.length === 0) return 0;

  const token = await gmailProvider.getAuthToken(false).catch(() => null);
  if (!token) return 0;

  const ids: string[] = [];
  for (const sender of targets) {
    const protectedSet = new Set(sender.protectedMessageIds);
    ids.push(...sender.messageIds.filter((id) => !protectedSet.has(id)));
  }
  if (ids.length === 0) return 0;

  try {
    await gmailProvider.labelSuspicious(token, ids);
    await appendActionLog([
      {
        id: makeLogId("labelSuspicious"),
        at: Date.now(),
        kind: "labelSuspicious",
        summary: `Auto-quarantined ${ids.length} message${ids.length === 1 ? "" : "s"} from ${targets.length} high-risk sender${targets.length === 1 ? "" : "s"}`,
        undo: { provider: "gmail", ids, via: "unlabel-suspicious" },
      },
    ]);
    return ids.length;
  } catch (err) {
    log.error("Auto-quarantine failed", err);
    return 0;
  }
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

    const firstContact = markFirstContact(senders, settings.knownSenders);
    if (firstContact.firstContactCount > 0) {
      await updateSettings({ knownSenders: firstContact.updatedKnownSenders });
    }

    await reportThreatSignals(senders);
    const quarantined = await runQuarantine(settings, senders);

    // Standing user rules (Auto Clean). Operates on the in-memory scan, so the
    // expiry badge below can momentarily still count a message a trash-rule
    // just removed — it self-corrects on the next 6-hourly sweep.
    const providerById = new Map<ProviderId, EmailProvider>([
      [gmailProvider.id, gmailProvider],
      [outlookProvider.id, outlookProvider],
    ]);
    const ruleResults = await applyRules(settings.rules, senders, providerById);
    const ruleMoved = ruleResults.reduce(
      (sum, r) => sum + [...r.movedByProvider.values()].reduce((a, b) => a + b, 0),
      0,
    );

    const held = await runScreener(settings, senders);
    const total = totalExpiryCount(buildExpiryBuckets(senders));

    await updateSettings({
      lastTriageSummary:
        `${new Date().toLocaleString()} — ${ruleMoved} actioned by rules, ${total} ready to clean up` +
        `${held > 0 ? `, ${held} held by Screener` : ""}` +
        `${quarantined > 0 ? `, ${quarantined} auto-quarantined` : ""}`,
    });

    const badgeCount = total + held;
    if (badgeCount > 0) {
      await chrome.action.setBadgeText({ text: badgeCount > 99 ? "99+" : String(badgeCount) });
      await chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    log.error("Background triage failed", err);
  }
}
