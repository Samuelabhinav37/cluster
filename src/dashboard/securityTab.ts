// Security tab: the "Possible impersonation" list. Read-only threat-signal
// detail plus two manual, per-sender actions — "Label as suspicious" and
// "Deep scan" (the one place the dashboard fetches a message body). Never
// automatic, never a standing filter — see threatSignals.ts / linkMismatch.ts.
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
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { clusterLabelName } from "../lib/clusterLabels";

const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;
const quarantineReviewSectionEl = document.getElementById("quarantine-review-section") as HTMLElement;
const quarantineReviewListEl = document.getElementById("quarantine-review-list") as HTMLUListElement;

// "SPF ✓ · DKIM ✓ · DMARC —" — a plain-language read on what the mail
// provider's Authentication-Results header actually said about this sender.
function authChip(v: SenderSummary["authVerdicts"]): string {
  const mark = (verdict: string) => (verdict === "pass" ? "✓" : verdict === "fail" ? "✗" : "—");
  return `SPF ${mark(v.spf)} · DKIM ${mark(v.dkim)} · DMARC ${mark(v.dmarc)}`;
}

function compareCell(className: string, key: string, value: string, note: string): HTMLDivElement {
  const cell = document.createElement("div");
  cell.className = className;
  for (const [cls, text] of [
    ["k", key],
    ["v", value],
    ["n", note],
  ] as const) {
    const part = document.createElement("div");
    part.className = cls;
    part.textContent = text;
    cell.appendChild(part);
  }
  return cell;
}

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
// runQuarantine), keyed the same way SenderSummary.key is built.
export function renderQuarantineReview() {
  const entries = Object.entries(ctx.settings.quarantinedSenders);
  quarantineReviewSectionEl.hidden = entries.length === 0;
  if (entries.length === 0) return;

  quarantineReviewListEl.replaceChildren(
    ...entries.map(([key, record]) => {
      const { providerId, address } = parseSenderKey(key);
      const provider = providerById.get(providerId as ProviderId);
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${address} — quarantined ${record.messageIds.length} message${record.messageIds.length === 1 ? "" : "s"} `;
      li.appendChild(text);

      const removeEntry = async () => {
        ctx.settings = await mutateSettings((current) => {
          const next = { ...current.quarantinedSenders };
          delete next[key];
          return { ...current, quarantinedSenders: next };
        });
      };

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Confirm — keep filed";
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        ctx.settings = await mutateSettings((current) => ({
          ...current,
          quarantineReview: recordQuarantineVerdict(current.quarantineReview, key, "confirmed"),
        }));
        await removeEntry();
        await logAction("labelSuspicious", `Confirmed ${address} as high-risk, kept filed out of the inbox`);
        renderQuarantineReview();
      };

      const releaseBtn = document.createElement("button");
      releaseBtn.textContent = "Release — false positive";
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
          renderQuarantineReview();
        } catch (err) {
          releaseBtn.disabled = false;
          log.error("Release from quarantine failed", err);
        }
      };
      if (!provider?.unlabelSuspicious) releaseBtn.disabled = true;

      li.append(confirmBtn, releaseBtn);
      return li;
    }),
  );
}

const CONFIDENCE_LABEL: Record<VerdictTier, string> = {
  hold: "High confidence",
  warn: "Needs your eyes",
  none: "Worth a look",
};

const ICON_WARNING =
  '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 5.6v5M10 13.6h.01"></path><circle cx="10" cy="10" r="7"></circle></svg>';
const ICON_INFO =
  '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"></circle><path d="M10 6.6v4M10 13.4h.01"></path></svg>';

export function renderSecuritySection(senders: SenderSummary[]) {
  renderQuarantineReview();
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

function buildThreatCard(sender: SenderSummary, verdict: Verdict): HTMLElement {
  const li = document.createElement("li");
  li.className = "glass-card";

  // Header: danger tile + quoted display name + confidence pill
  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.alignItems = "center";
  head.style.gap = "13px";
  head.style.flexWrap = "wrap";
  const tile = document.createElement("span");
  tile.className = "tile-danger";
  tile.innerHTML = ICON_WARNING;
  const name = document.createElement("span");
  name.style.font = "600 22px/1.2 var(--font-display)";
  name.style.letterSpacing = "-.021em";
  name.textContent = `"${sender.displayName || sender.address}"`;
  const conf = document.createElement("span");
  conf.className = "pill danger";
  conf.textContent = CONFIDENCE_LABEL[verdict.tier];
  head.append(tile, name, conf);
  li.appendChild(head);

  // Compare grid: claims to be / actually sent from
  const claimedBrand = sender.threatSignals.find((s) => s.brand)?.brand;
  const grid = document.createElement("div");
  grid.className = "compare-grid";
  // Display names and addresses come from the sender, so they go in as
  // text, never as HTML.
  const claim = compareCell(
    "compare-cell",
    "Claims to be",
    claimedBrand ?? (sender.displayName || "someone you know"),
    sender.firstContact
      ? "New since Cluster started tracking"
      : "Display name matches a contact or a known brand",
  );
  const actual = compareCell("compare-cell bad", "Actually sent from", sender.address, authChip(sender.authVerdicts));
  grid.append(claim, actual);
  li.appendChild(grid);

  // Evidence list: the strongest plain reasons, then anything that weighed
  // in the sender's favour. Reason text quotes sender-chosen domains, so it
  // goes in as text, never as HTML.
  const shown = [...verdict.reasons.slice(0, MAX_REASONS), ...verdict.trustReasons];
  if (shown.length > 0) {
    const evidence = document.createElement("div");
    evidence.className = "evidence-list";
    for (const reason of shown) {
      const item = document.createElement("div");
      item.className = "item";
      const icon = document.createElement("span");
      icon.innerHTML = ICON_INFO;
      icon.style.display = "inline-flex";
      const text = document.createElement("span");
      text.textContent = reason.text;
      item.append(icon, text);
      evidence.appendChild(item);
    }
    li.appendChild(evidence);
  }

  // Actions
  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "10px";
  actions.style.alignItems = "center";
  actions.style.flexWrap = "wrap";
  const provider = providerById.get(sender.provider);

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

  if (provider?.getMessageLinks) {
    const scanResult = document.createElement("span");
    scanResult.className = "recent-detail";
    const scanBtn = document.createElement("button");
    scanBtn.className = "btn";
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
  spacer.style.flex = "1";
  const genuine = document.createElement("button");
  genuine.className = "btn";
  genuine.textContent = "This is genuinely them";
  genuine.onclick = () => {
    li.hidden = true;
  };
  actions.append(spacer, genuine);
  li.appendChild(actions);

  return li;
}
