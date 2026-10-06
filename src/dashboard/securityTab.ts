// Scams screen (data-screen="impersonation"). Two lists, both in plain words
// from verdict.ts: "Held for you" (mail auto-quarantine moved, from the
// durable quarantinedSenders ledger) and "Check before you act" (senders in
// this scan with warning signs, still in the inbox). Per-card actions: It's
// fine, guided reporting, Deep scan (the one place the dashboard fetches a
// message body) and Block. See threatSignals.ts / verdict.ts / linkMismatch.ts.
import { log } from "../lib/log";
import { findBlocklistedLinkTargets, findMismatchedLinks } from "../lib/linkMismatch";
import { isBlockedDomain } from "../lib/blocklist";
import { MAX_REASONS, senderVerdict, type Verdict, type VerdictTier } from "../lib/verdict";
import { knownSenderSet } from "../lib/screener";
import { queueAthenaSecurityEvent } from "../lib/athenaIntegration";
import { mutateSettings } from "../lib/settingsStore";
import { recordQuarantineVerdict } from "../lib/quarantineReview";
import type { SenderSummary } from "../lib/senderModel";
import type { ProviderId } from "../lib/providers/emailProvider";
import { renderConfirmStep } from "./ui";
import { senderTile } from "./senderTile";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { clusterLabelName } from "../lib/clusterLabels";

const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;
const quarantineReviewSectionEl = document.getElementById("quarantine-review-section") as HTMLElement;
const quarantineReviewListEl = document.getElementById("quarantine-review-list") as HTMLUListElement;
const quarantineReviewCountEl = document.getElementById("quarantine-review-count") as HTMLElement | null;

// messageIds is in fetch order, not date order -- pick the genuinely most
// recent message so "checks the most recent message" is true.
function newestMessageId(sender: SenderSummary): string | undefined {
  if (sender.messages.length === 0) return sender.messageIds[0];
  return [...sender.messages].sort((a, b) => b.receivedAt - a.receivedAt)[0].id;
}

// Deep scan is the one place this dashboard fetches a message body
// (format=full, via getMessageLinks) -- deliberately manual, one message
// at a time, never part of the automatic triage. See linkMismatch.ts.
async function runDeepScan(sender: SenderSummary, resultEl: HTMLElement): Promise<void> {
  const provider = providerById.get(sender.provider);
  const targetId = newestMessageId(sender);
  if (!provider?.getMessageLinks || !targetId) return;
  resultEl.textContent = "Scanning…";
  try {
    const token = await provider.getAuthToken(false);
    const links = await provider.getMessageLinks(token, targetId);
    const suspicious = findMismatchedLinks(links);
    const blocked = findBlocklistedLinkTargets(links, isBlockedDomain);

    const findings = [
      ...suspicious.map((link) => `"${link.displayedDomain}" actually points to ${link.actualDomain}`),
      ...blocked.map((host) => `links to ${host}, a known-bad domain`),
    ];
    if (findings.length === 0) {
      resultEl.textContent = "No mismatched or known-bad links found in the most recent message.";
      return;
    }
    resultEl.textContent = findings.join("; ");

    const domain = sender.address.slice(sender.address.lastIndexOf("@") + 1);
    const now = new Date().toISOString();
    if (suspicious.length > 0) {
      void queueAthenaSecurityEvent({
        sourceEventId: `${sender.key}:link-mismatch:${targetId}`,
        occurredAt: now,
        action: "warned",
        severity: "high",
        ruleId: "threat-signal:link-mismatch",
        targetIndicator: domain,
        evidence: { kind: "link-mismatch", count: suspicious.length },
      });
    }
    if (blocked.length > 0) {
      void queueAthenaSecurityEvent({
        sourceEventId: `${sender.key}:blocklisted-link:${targetId}`,
        occurredAt: now,
        action: "warned",
        severity: "high",
        ruleId: "threat-signal:blocklisted-link",
        targetIndicator: domain,
        evidence: { kind: "blocklisted-link", hosts: blocked },
      });
    }
  } catch (err) {
    resultEl.textContent = "Scan failed, try again.";
    log.error(err);
  }
}

function parseSenderKey(key: string): { providerId: string; address: string } {
  const sep = key.indexOf(":");
  return sep === -1 ? { providerId: "", address: key } : { providerId: key.slice(0, sep), address: key.slice(sep + 1) };
}

// Auto-quarantine files a sender's mail out of the inbox, so a quarantined
// sender's mail usually stops matching the security scan's own `in:inbox`
// query -- meaning renderSecuritySection's `senders` argument can't be relied
// on to still contain them. Rendered straight from the durable
// quarantinedSenders ledger instead (see quarantineReview.ts / background.ts's
// runQuarantine), keyed the same way SenderSummary.key is built. When the
// sender is still in this scan, its plain reasons are shown too.
export function renderQuarantineReview(senders: SenderSummary[] = []) {
  const entries = Object.entries(ctx.settings.quarantinedSenders);
  quarantineReviewSectionEl.hidden = entries.length === 0;
  const heldCount = entries.reduce((n, [, r]) => n + r.messageIds.length, 0);
  if (quarantineReviewCountEl) {
    quarantineReviewCountEl.textContent = `${heldCount} email${heldCount === 1 ? "" : "s"} from ${entries.length} sender${entries.length === 1 ? "" : "s"}`;
  }
  if (entries.length === 0) return;
  const byKey = new Map(senders.map((s) => [s.key, s]));
  const known = knownSenderSet(ctx.settings);

  quarantineReviewListEl.replaceChildren(
    ...entries.map(([key, record]) => {
      const { providerId, address } = parseSenderKey(key);
      const provider = providerById.get(providerId as ProviderId);
      const sender = byKey.get(key);
      const li = document.createElement("li");
      li.className = "glass-card scam-card";

      const head = document.createElement("div");
      head.className = "scam-head";
      const id = document.createElement("div");
      id.className = "scam-id";
      const title = document.createElement("div");
      title.className = "scam-subj";
      title.textContent = sender?.displayName ? `${sender.displayName} <${address}>` : address;
      const sub = document.createElement("div");
      sub.className = "scam-from";
      const n = record.messageIds.length;
      sub.textContent = `${n} email${n === 1 ? "" : "s"} held ${timeAgo(record.at)}. They're in the "${clusterLabelName("suspicious")}" label.`;
      id.append(title, sub);
      const chip = document.createElement("span");
      chip.className = "risk-chip hold";
      chip.textContent = "Held";
      head.append(senderTile(address, sender?.displayName, "sz-34"), id, chip);
      li.appendChild(head);

      if (sender) {
        const verdict = senderVerdict(sender, {
          knownCorrespondent: known.has(address.toLowerCase()),
          review: ctx.settings.quarantineReview[key],
        });
        li.appendChild(reasonList(verdict));
      }

      const removeEntry = async () => {
        ctx.settings = await mutateSettings((current) => {
          const next = { ...current.quarantinedSenders };
          delete next[key];
          return { ...current, quarantinedSenders: next };
        });
      };

      const actions = document.createElement("div");
      actions.className = "scam-actions";

      const releaseBtn = document.createElement("button");
      releaseBtn.className = "btn";
      releaseBtn.textContent = "Not a scam, put it back";
      releaseBtn.onclick = async () => {
        if (!provider?.unlabelSuspicious) return;
        releaseBtn.disabled = true;
        try {
          const token = await provider.getAuthToken(false);
          await provider.unlabelSuspicious(token, record.messageIds);
          ctx.settings = await mutateSettings((current) => ({
            ...current,
            quarantineReview: recordQuarantineVerdict(current.quarantineReview, key, "released"),
          }));
          await removeEntry();
          await logAction("labelSuspicious", `Released ${address} from quarantine, back in the inbox`);
          renderQuarantineReview(senders);
        } catch (err) {
          releaseBtn.disabled = false;
          log.error("Release from quarantine failed", err);
        }
      };
      if (!provider?.unlabelSuspicious) releaseBtn.disabled = true;

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "btn btn-ghost";
      confirmBtn.textContent = "Keep it held";
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        ctx.settings = await mutateSettings((current) => ({
          ...current,
          quarantineReview: recordQuarantineVerdict(current.quarantineReview, key, "confirmed"),
        }));
        await removeEntry();
        await logAction("labelSuspicious", `Confirmed ${address} as high-risk, kept filed out of the inbox`);
        renderQuarantineReview(senders);
      };

      const report = reportSteps();
      actions.append(releaseBtn, report.button, confirmBtn);
      li.append(report.steps, actions);
      return li;
    }),
  );
}

function timeAgo(at: number): string {
  const days = Math.floor((Date.now() - at) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Up to MAX_REASONS plain reasons, then anything weighed in the sender's
 * favour. Reasons quote sender-chosen domains, so they go in as text. */
function reasonList(verdict: Verdict): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "reasons";
  for (const reason of verdict.reasons.slice(0, MAX_REASONS)) {
    const li = document.createElement("li");
    li.textContent = reason.text;
    ul.appendChild(li);
  }
  for (const reason of verdict.trustReasons) {
    const li = document.createElement("li");
    li.className = "trust";
    li.textContent = reason.text;
    ul.appendChild(li);
  }
  return ul;
}

/** Guided reporting. Cluster has no send permission and never sends
 * anything itself: it shows the steps and the user acts in their own mail. */
function reportSteps(): { button: HTMLButtonElement; steps: HTMLOListElement } {
  const steps = document.createElement("ol");
  steps.className = "report-steps";
  steps.hidden = true;
  for (const text of [
    "Open the email in Gmail or Outlook.",
    "Gmail: press ⋮ More, then Report phishing. Outlook: Report, then Report phishing. This teaches their filter and protects everyone.",
    "Optional: forward it as an attachment to reportphishing@apwg.org, which shares it with banks and browser makers.",
    "Cluster never sends anything for you.",
  ]) {
    const li = document.createElement("li");
    li.textContent = text;
    steps.appendChild(li);
  }
  const button = document.createElement("button");
  button.className = "btn btn-ghost";
  button.textContent = "Report it…";
  button.setAttribute("aria-expanded", "false");
  button.onclick = () => {
    steps.hidden = !steps.hidden;
    button.setAttribute("aria-expanded", String(!steps.hidden));
  };
  return { button, steps };
}

const TIER_CHIP: Record<VerdictTier, [string, string]> = {
  hold: ["hold", "High risk"],
  warn: ["warn", "Check before you act"],
  none: ["none", "Worth a look"],
};

export function renderSecuritySection(senders: SenderSummary[]) {
  renderQuarantineReview(senders);
  // Rank by combined risk so a sender tripping several signals (or a
  // freemail brand claim) sorts above one with a lone medium signal.
  const known = knownSenderSet(ctx.settings);
  const flagged = senders
    .map((sender) => ({
      sender,
      verdict: senderVerdict(sender, {
        knownCorrespondent: known.has(sender.address.toLowerCase()),
        review: ctx.settings.quarantineReview[sender.key],
      }),
    }))
    // A known correspondent whose only "signal" was a brand-like name has
    // nothing left to show (verdict.ts rule 1).
    .filter(({ verdict }) => verdict.signals.length > 0)
    .sort((a, b) => b.verdict.score - a.verdict.score);
  securitySectionEl.hidden = flagged.length === 0;
  securityEmptyEl.hidden = flagged.length > 0;
  if (flagged.length === 0) return;

  securitySenderListEl.replaceChildren(
    ...flagged.map(({ sender, verdict }) => buildThreatCard(sender, verdict)),
  );
}

/** The subject to show: the newest message a warning came from, else the
 * newest message from this sender. */
function headlineMessage(sender: SenderSummary, verdict: Verdict) {
  const flagged = new Set(verdict.signals.flatMap((s) => s.messageIds ?? []));
  const pool = sender.messages.filter((m) => flagged.size === 0 || flagged.has(m.id));
  return [...(pool.length > 0 ? pool : sender.messages)].sort((a, b) => b.receivedAt - a.receivedAt)[0];
}

function buildThreatCard(sender: SenderSummary, verdict: Verdict): HTMLElement {
  const li = document.createElement("li");
  li.className = "glass-card scam-card";

  // Subject, sender and date, then the risk chip. Everything here comes from
  // the sender, so it goes in as text, never as HTML.
  const head = document.createElement("div");
  head.className = "scam-head";
  const id = document.createElement("div");
  id.className = "scam-id";
  const message = headlineMessage(sender, verdict);
  const title = document.createElement("div");
  title.className = "scam-subj";
  title.textContent = message?.subject ? `"${message.subject}"` : `"${sender.displayName || sender.address}"`;
  const from = document.createElement("div");
  from.className = "scam-from";
  const when = message ? ` · ${new Date(message.receivedAt).toLocaleDateString()}` : "";
  from.textContent = `From ${sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address}${when}`;
  id.append(title, from);
  const [chipClass, chipText] = TIER_CHIP[verdict.tier];
  const chip = document.createElement("span");
  chip.className = `risk-chip ${chipClass}`;
  chip.textContent = chipText;
  head.append(senderTile(sender.address, sender.displayName, "sz-34"), id, chip);
  li.appendChild(head);

  li.appendChild(reasonList(verdict));

  // A familiar sender whose identity changed is the invoice-fraud shape:
  // the safe move is a call on a number the user already has.
  if (verdict.signals.some((s) => s.kind === "identity-change")) {
    const card = document.createElement("div");
    card.className = "callback";
    const b = document.createElement("b");
    b.textContent = "Before you pay anything";
    const text = document.createElement("span");
    text.textContent =
      "Call them on a number you already have, not one in this email. A change of bank details by email is the most common invoice scam.";
    const wrap = document.createElement("div");
    wrap.append(b, text);
    card.appendChild(wrap);
    li.appendChild(card);
  }

  const report = reportSteps();
  li.appendChild(report.steps);

  const actions = document.createElement("div");
  actions.className = "scam-actions";
  const provider = providerById.get(sender.provider);

  const genuine = document.createElement("button");
  genuine.className = "btn";
  genuine.textContent = "It's fine";
  genuine.title = "Cluster will weigh this sender's warnings less from now on";
  genuine.onclick = async () => {
    genuine.disabled = true;
    ctx.settings = await mutateSettings((current) => ({
      ...current,
      quarantineReview: recordQuarantineVerdict(current.quarantineReview, sender.key, "released"),
    }));
    await logAction("labelSuspicious", `Marked ${sender.address} as fine`);
    li.hidden = true;
  };
  actions.append(genuine, report.button);

  if (provider?.getMessageLinks) {
    const scanResult = document.createElement("span");
    scanResult.className = "recent-detail";
    const scanBtn = document.createElement("button");
    scanBtn.className = "btn btn-ghost";
    scanBtn.textContent = "Deep scan";
    scanBtn.title = "Checks links in the most recent message";
    scanBtn.onclick = async () => {
      scanBtn.disabled = true;
      await runDeepScan(sender, scanResult);
      scanBtn.disabled = false;
    };
    actions.append(scanBtn, scanResult);
  }

  const spacer = document.createElement("span");
  spacer.className = "grow";
  actions.appendChild(spacer);

  if (provider?.labelSuspicious) {
    const slot = document.createElement("span");
    slot.className = "confirm-slot";
    const btn = document.createElement("button");
    btn.className = "btn btn-danger";
    btn.textContent = "Block sender";
    const reset = () => {
      slot.innerHTML = "";
      slot.appendChild(btn);
    };
    btn.onclick = () => {
      renderConfirmStep(
        slot,
        reset,
        `Move ${sender.messageIds.length} message${sender.messageIds.length === 1 ? "" : "s"} from ${sender.address} to the "${clusterLabelName("suspicious")}" label, out of the inbox?`,
        false,
        async () => {
          const token = await provider.getAuthToken(false);
          await provider.labelSuspicious!(token, sender.messageIds);
          await logAction(
            "labelSuspicious",
            `Labelled ${sender.messageIds.length} from ${sender.address} as suspicious`,
          );
          return "Labeled ✓";
        },
      );
    };
    slot.appendChild(btn);
    actions.appendChild(slot);
  }
  li.appendChild(actions);

  return li;
}

