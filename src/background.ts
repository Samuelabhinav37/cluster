import { idsSafeToMoveOut } from "./lib/protectionPolicy";
import { log } from "./lib/log";
import { buildExpiryBuckets, totalExpiryCount } from "./lib/expiryTriage";
import { gmailProvider } from "./lib/providers/gmailProvider";
import { outlookProvider } from "./lib/providers/outlookProvider";
import type { EmailProvider, ProviderId } from "./lib/providers/emailProvider";
import { applyRules } from "./lib/ruleRunner";
import { knownSenderSet, pendingScreenerSenders, refreshSentCorrespondents } from "./lib/screener";
import { markFirstContact } from "./lib/firstContact";
import { refreshBrandDomains } from "./lib/threatSignals";
import { senderVerdict } from "./lib/verdict";
import { refreshMalwareBlocklist } from "./lib/blocklist";
import { refreshSpamList } from "./lib/spamList";
import { appendActionLog, makeLogId } from "./lib/actionLog";
import { buildSenderSummaries, type SenderSummary } from "./lib/senderModel";
import type { ClusterSettings } from "./lib/settingsStore";
import { getSettings, mutateSettings, updateSettings } from "./lib/settingsStore";
import { excludeSnoozedMessages } from "./lib/snoozeFilter";
import { resurfaceDueSnoozed } from "./lib/snoozeResurface";
import { flushAthenaSecurityEvents, queueAthenaSecurityEvents } from "./lib/athenaIntegration";
import { buildIncrementalSenderSummaries } from "./lib/incrementalSync";
import { gmailQuotaHeadroom } from "./lib/gmailQuotaLedger";
import { runInboxTimeLimits } from "./lib/inboxTimeLimitsRunner";
import { loadMetadataCache, saveMetadataCache } from "./lib/metadataCache";
import { resumeInterruptedJobs } from "./lib/durableJobs";
import { updateEngagementObservations } from "./lib/engagementModel";
import { getRuleCompletionKeys, recordRuleCompletions } from "./lib/ruleCompletionLedger";
import { loadPublicSuffixList } from "./lib/publicSuffix";
import { applySenderLedger } from "./lib/senderLedgerStore";

async function openDashboard() {
  const url = chrome.runtime.getURL("src/dashboard/index.html");
  const existing = await chrome.tabs.query({ url });
  if (existing[0]?.id) {
    chrome.tabs.update(existing[0].id, { active: true });
  } else {
    chrome.tabs.create({ url });
  }
}

chrome.action.onClicked.addListener(() => void openDashboard());

// Background pre-triage: periodically counts mail that's aged past its
// retention window (see retentionPolicy.ts) and surfaces the count as a
// badge — never deletes anything itself. Actual deletion always happens
// from the dashboard's "Ready to clean up" section, behind one confirm.
const TRIAGE_ALARM = "cluster-triage";
const ATHENA_ALARM = "cluster-athena-flush";
const JOBS_ALARM = "cluster-jobs";
const DATASET_ALARM = "cluster-dataset-refresh";
// Inbox time limits: label what Gmail filters missed and move mail whose
// category's time is up out of the inbox (see inboxTimeLimits.ts). No-op
// unless the user turned time limits on.
const INBOX_LIMITS_ALARM = "cluster-inbox-limits";
const SECURITY_SCAN_WINDOW_DAYS = 30;
const SECURITY_SCAN_MAX_MESSAGES = 100;
const providerById = new Map<ProviderId, EmailProvider>([
  [gmailProvider.id, gmailProvider],
  [outlookProvider.id, outlookProvider],
]);

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 5, periodInMinutes: 360 });
  chrome.alarms.create(ATHENA_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  chrome.alarms.create(JOBS_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  chrome.alarms.create(DATASET_ALARM, { delayInMinutes: 10, periodInMinutes: 1440 });
  chrome.alarms.create(INBOX_LIMITS_ALARM, { delayInMinutes: 2, periodInMinutes: 15 });
  // A fresh install used to open nothing, leaving the user to find an
  // unpinned icon in the puzzle menu. Open the dashboard, whose connect gate
  // is the welcome screen. Updates and Chrome updates stay silent.
  if (details?.reason === "install") void openDashboard();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TRIAGE_ALARM, { delayInMinutes: 5, periodInMinutes: 360 });
  chrome.alarms.create(ATHENA_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  chrome.alarms.create(JOBS_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  chrome.alarms.create(DATASET_ALARM, { delayInMinutes: 10, periodInMinutes: 1440 });
  chrome.alarms.create(INBOX_LIMITS_ALARM, { delayInMinutes: 2, periodInMinutes: 15 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  // Domain matching needs the Public Suffix List. It's a local file and
  // loads once per service-worker start, so waiting for it is quick.
  void loadPublicSuffixList().then(() => handleAlarm(alarm));
});

function handleAlarm(alarm: chrome.alarms.Alarm): void {
  if (alarm.name === TRIAGE_ALARM) {
    resurfaceDueSnoozed(gmailProvider).catch((err) => log.error("Resurfacing snoozed mail failed", err));
    runBackgroundTriage();
  }
  if (alarm.name === ATHENA_ALARM) void flushAthenaSecurityEvents();
  if (alarm.name === JOBS_ALARM) {
    void resumeInterruptedJobs(providerById).catch((err) => log.error("Resuming durable jobs failed", err));
  }
  if (alarm.name === DATASET_ALARM) void refreshPublicDatasets();
  if (alarm.name === INBOX_LIMITS_ALARM) void runInboxTimeLimitsIfQuota();
}

async function runInboxTimeLimitsIfQuota(): Promise<void> {
  try {
    // Same guard as triage: don't add to a scan already near Gmail's
    // per-minute ceiling; the next 15-minute tick tries again.
    if ((await gmailQuotaHeadroom()) < 1500) return;
    await runInboxTimeLimits();
  } catch (err) {
    log.error("Inbox time limits failed", err);
  }
}

// Daily: pulls Cluster's own published brand-domain and blocklist datasets
// (see remoteDataset.ts) so impersonation/spam detection stay current
// without waiting for a new extension release. Each call is independently
// rate-limited and never throws -- one failing fetch can't block the others,
// and every dataset already has a bundled fallback that works without this
// ever succeeding.
async function refreshPublicDatasets(): Promise<void> {
  await Promise.all([
    refreshBrandDomains().catch((err) => log.error("Brand-domain dataset refresh failed", err)),
    refreshMalwareBlocklist().catch((err) => log.error("Malware blocklist refresh failed", err)),
    refreshSpamList().catch((err) => log.error("Spam list refresh failed", err)),
  ]);
}

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
// (settings.screenerEnabled) -- the sent-correspondent refresh itself now runs
// unconditionally (see the caller), since that signal also feeds the general
// protection gate (protectionPolicy.ts), not just this feature. Moves each
// newly-unknown sender's mail under the Screener label/folder (per that
// sender's own provider) and records it in screenedSenders so it isn't
// re-screened. Returns how many senders are currently held, for the badge.
async function runScreener(
  settings: ClusterSettings,
  senders: SenderSummary[],
  sentCorrespondents: ClusterSettings["sentCorrespondents"],
): Promise<number> {
  if (!settings.screenerEnabled) return 0;

  const known = knownSenderSet({ ...settings, sentCorrespondents });
  const excluded = new Set(
    [...settings.mutedSenders, ...settings.screenedSenders].map((a) => a.toLowerCase()),
  );
  const pending = pendingScreenerSenders(senders, known, excluded);

  const screened: string[] = [];
  const tokenByProvider = new Map<ProviderId, string | null>();
  for (const s of pending) {
    const provider = providerById.get(s.provider);
    if (!provider?.screenSender) continue;
    if (!tokenByProvider.has(s.provider)) {
      tokenByProvider.set(s.provider, await provider.getAuthToken(false).catch(() => null));
    }
    const token = tokenByProvider.get(s.provider);
    if (!token) continue;
    try {
      await provider.screenSender(token, s.address, idsSafeToMoveOut(s));
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
// threat scorer puts in the "high" tier, label their mail "Possible Phishing"
// and file it out of the inbox -- per the sender's own provider, never
// deletes, and reversible from the Recently-done tab / Security tab's
// quarantine review queue (label-removal undo). Off by default.
async function runQuarantine(settings: ClusterSettings, senders: SenderSummary[]): Promise<number> {
  if (!settings.autoQuarantineHighRisk) return 0;
  // senderVerdict (verdict.ts) holds only on two kinds of signal or one
  // decisive one, judges each message on its own evidence, and weighs a
  // sender the user released lower. Only the messages that earn a hold move,
  // so someone the user writes to can have one hijacked email held while the
  // rest of their mail stays. Starred and other protected mail never moves,
  // and a message already held isn't labelled again, so a user who put it
  // back in Gmail isn't overruled on the next cycle.
  const known = knownSenderSet(settings);
  const heldIds = new Map<string, string[]>();
  for (const s of senders) {
    if (!providerById.get(s.provider)?.labelSuspicious) continue;
    const verdict = senderVerdict(s, {
      knownCorrespondent: known.has(s.address.toLowerCase()),
      review: settings.quarantineReview[s.key],
    });
    const protectedSet = new Set(s.protectedMessageIds);
    const alreadyHeld = new Set(settings.quarantinedSenders[s.key]?.messageIds ?? []);
    const ids = verdict.heldMessageIds.filter((id) => !protectedSet.has(id) && !alreadyHeld.has(id));
    if (ids.length > 0) heldIds.set(s.key, ids);
  }
  const targets = senders.filter((s) => heldIds.has(s.key));
  if (targets.length === 0) return 0;

  const targetsByProvider = new Map<ProviderId, SenderSummary[]>();
  for (const sender of targets) {
    if (!targetsByProvider.has(sender.provider)) targetsByProvider.set(sender.provider, []);
    targetsByProvider.get(sender.provider)!.push(sender);
  }

  let totalQuarantined = 0;
  for (const [providerId, providerTargets] of targetsByProvider) {
    const provider = providerById.get(providerId);
    if (!provider?.labelSuspicious) continue;
    const token = await provider.getAuthToken(false).catch(() => null);
    if (!token) continue;

    const ids: string[] = [];
    const idsBySender = new Map<string, string[]>();
    for (const sender of providerTargets) {
      const senderIds = heldIds.get(sender.key) ?? [];
      ids.push(...senderIds);
      idsBySender.set(sender.key, senderIds);
    }
    if (ids.length === 0) continue;

    try {
      await provider.labelSuspicious(token, ids);
      const now = Date.now();
      await appendActionLog([
        {
          id: makeLogId("labelSuspicious"),
          at: now,
          kind: "labelSuspicious",
          summary: `Auto-quarantined ${ids.length} message${ids.length === 1 ? "" : "s"} from ${providerTargets.length} high-risk sender${providerTargets.length === 1 ? "" : "s"}`,
          undo: { provider: providerId, ids, via: "unlabel-suspicious" },
        },
      ]);
      await mutateSettings((current) => ({
        ...current,
        quarantinedSenders: {
          ...current.quarantinedSenders,
          ...Object.fromEntries(
            [...idsBySender].map(([key, senderIds]) => [
              key,
              // Keep earlier holds for this sender: the review queue releases all of them.
              { at: now, messageIds: [...new Set([...(current.quarantinedSenders[key]?.messageIds ?? []), ...senderIds])] },
            ]),
          ),
        },
      }));
      totalQuarantined += ids.length;
    } catch (err) {
      log.error("Auto-quarantine failed", providerId, err);
      // Do not advance the incremental security cursor for this provider's
      // scope. The next alarm replays these messages and retries.
      throw err;
    }
  }
  return totalQuarantined;
}

async function runBackgroundTriage() {
  try {
    const candidates = [gmailProvider, outlookProvider];
    const connectedFlags = await Promise.all(candidates.map((p) => p.isConnected()));
    const connected: EmailProvider[] = candidates.filter((_, i) => connectedFlags[i]);
    if (connected.length === 0) return;

    // Don't pile a full background scan on top of a dashboard scan that's
    // already near Gmail's per-minute ceiling — skip this cycle and let the
    // 6-hourly alarm try again later.
    if ((await gmailQuotaHeadroom()) < 1500) {
      log.error("Background triage skipped: Gmail quota headroom low");
      return;
    }

    const settings = await getSettings();
    // Shared across the cleanup scan and the security lane so a message that
    // shows up in both (recent inbox promo mail, or a full security-baseline
    // rebuild) is fetched once — and seeded from the warm cache the dashboard
    // and previous triage runs persist, so a 6-hourly pass mostly pays only
    // for mail that arrived since.
    const scanCache = await loadMetadataCache();
    let senders = await buildSenderSummaries(
      connected,
      settings.maxMessagesPerProvider,
      settings.scanWindowDays,
      undefined,
      "cleanup",
      scanCache,
    );
    const securitySync = await buildIncrementalSenderSummaries(
      connected,
      settings.incrementalSyncCursors,
      Math.min(settings.maxMessagesPerProvider, SECURITY_SCAN_MAX_MESSAGES),
      Math.min(settings.scanWindowDays, SECURITY_SCAN_WINDOW_DAYS),
      "security",
      undefined,
      scanCache,
    );
    const securitySenders = securitySync.senders;
    void saveMetadataCache(scanCache);
    const activeSnoozedIds = new Set(
      Object.entries(settings.snoozedMessages)
        .filter(([, v]) => v.resurfaceAt > Date.now())
        .map(([id]) => id),
    );
    senders = excludeSnoozedMessages(senders, activeSnoozedIds);

    await mutateSettings((current) => ({
      ...current,
      senderEngagement: updateEngagementObservations(current.senderEngagement, senders),
    }));

    const firstContact = markFirstContact(
      securitySenders,
      settings.knownSenders,
      Date.now(),
      settings.knownSendersInitialized,
    );
    if (!settings.knownSendersInitialized || firstContact.firstContactCount > 0) {
      await mutateSettings((current) => ({
        ...current,
        knownSenders: { ...current.knownSenders, ...firstContact.updatedKnownSenders },
        knownSendersInitialized: true,
      }));
    }

    // Before reporting or quarantining, so a familiar sender's change of
    // signing or reply domain is part of the picture (senderLedger.ts).
    await applySenderLedger(securitySenders);
    await reportThreatSignals(securitySenders);
    const quarantined = await runQuarantine(settings, securitySenders);
    await mutateSettings((current) => ({
      ...current,
      incrementalSyncCursors: {
        ...current.incrementalSyncCursors,
        ...securitySync.cursors,
      },
      lastIncrementalSyncAt: Date.now(),
    }));

    // Standing user rules (Auto Clean). Operates on the in-memory scan, so the
    // expiry badge below can momentarily still count a message a trash-rule
    // just removed — it self-corrects on the next 6-hourly sweep.
    const completedRuleKeys = await getRuleCompletionKeys().catch((error) => {
      log.error("Could not read rule completion ledger", error);
      return new Set<string>();
    });
    const ruleResults = await applyRules(settings.rules, senders, providerById, {
      previouslyCompletedKeys: completedRuleKeys,
    });
    await recordRuleCompletions(
      ruleResults.map((result) => ({
        rule: result.rule,
        idsByProvider: result.completedIdsByProvider,
      })),
    ).catch((error) => log.error("Could not record rule completions", error));
    const ruleMoved = ruleResults.reduce(
      (sum, r) => sum + [...r.movedByProvider.values()].reduce((a, b) => a + b, 0),
      0,
    );
    const ruleDeferred = ruleResults.reduce((sum, result) => sum + result.deferredByLimitCount, 0);
    const ruleSkipped = ruleResults.reduce((sum, result) => sum + result.previouslyCompletedCount, 0);

    const sentCorrespondents = await refreshSentCorrespondents(settings, providerById);
    const held = await runScreener(settings, senders, sentCorrespondents);
    const total = totalExpiryCount(buildExpiryBuckets(senders));

    await updateSettings({
      lastTriageSummary:
        `${new Date().toLocaleString()} — ${ruleMoved} actioned by rules${ruleSkipped > 0 ? `, ${ruleSkipped} already completed` : ""}${ruleDeferred > 0 ? `, ${ruleDeferred} deferred by safety limits` : ""}, ${total} ready to clean up` +
        `, ${securitySync.changedMessageCount} security change${securitySync.changedMessageCount === 1 ? "" : "s"} checked` +
        `${securitySync.resetProviders.length > 0 ? ` (${securitySync.resetProviders.join(", ")} baseline refreshed)` : ""}` +
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
