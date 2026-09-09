// Security tab: the "Possible impersonation" list. Read-only threat-signal
// detail plus two manual, per-sender actions — "Label as suspicious" and
// "Deep scan" (the one place the dashboard fetches a message body). Never
// automatic, never a standing filter — see threatSignals.ts / linkMismatch.ts.
import { log } from "../lib/log";
import { findBlocklistedLinkTargets, findMismatchedLinks } from "../lib/linkMismatch";
import { isBlockedDomain } from "../lib/blocklist";
import { riskTier, senderRiskScore } from "../lib/threatSignals";
import { queueAthenaSecurityEvent } from "../lib/athenaIntegration";
import { mutateSettings } from "../lib/settingsStore";
import { recordQuarantineVerdict } from "../lib/quarantineReview";
import type { SenderSummary } from "../lib/senderModel";
import type { ProviderId } from "../lib/providers/emailProvider";
import { renderConfirmStep } from "./ui";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";

const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;
const quarantineReviewSectionEl = document.getElementById("quarantine-review-section") as HTMLElement;
const quarantineReviewListEl = document.getElementById("quarantine-review-list") as HTMLUListElement;

function describeSignal(s: SenderSummary["threatSignals"][number]): string {
  switch (s.kind) {
    case "freemail-brand-claim":
      return `claims to be ${s.brand}, sent from a free-mail address`;
    case "brand-impersonation":
      return `claims to be ${s.brand}, domain doesn't match`;
    case "lookalike-domain":
      return `domain closely resembles ${s.brand}'s real domain`;
    case "failed-authentication":
      return `failed DMARC authentication (claimed domain: ${s.brand})`;
    case "blocklisted-domain":
      return `sending domain (${s.brand}) is on a known-bad domain list`;
    case "reply-to-mismatch":
      return `replies would go to a personal address (${s.brand}), not the sender's domain`;
    case "punycode-domain":
      return `sender domain (${s.brand}) uses punycode — a common homograph trick`;
    case "lure-language":
      return `subject uses urgency / credential-request language`;
    case "link-mismatch":
      return `a link's visible text doesn't match where it actually goes`;
    case "risky-attachment":
      return `sent a risky-shaped attachment (.html/.iso/macro Office/double extension) without authenticating`;
    default: {
      const unreachable: never = s.kind;
      return unreachable;
    }
  }
}

// "SPF ✓ · DKIM ✓ · DMARC —" — a plain-language read on what the mail
// provider's Authentication-Results header actually said about this sender.
function authChip(v: SenderSummary["authVerdicts"]): string {
  const mark = (verdict: string) => (verdict === "pass" ? "✓" : verdict === "fail" ? "✗" : "—");
  return `SPF ${mark(v.spf)} · DKIM ${mark(v.dkim)} · DMARC ${mark(v.dmarc)}`;
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

export function renderSecuritySection(senders: SenderSummary[]) {
  renderQuarantineReview();
  // Rank by combined risk so a sender tripping several signals (or a
  // freemail brand claim) sorts above one with a lone medium signal.
  const flagged = senders
    .filter((s) => s.threatSignals.length > 0)
    .map((sender) => ({ sender, score: senderRiskScore(sender.threatSignals) }))
    .sort((a, b) => b.score - a.score);
  securitySectionEl.hidden = flagged.length === 0;
  securityEmptyEl.hidden = flagged.length > 0;
  if (flagged.length === 0) return;

  securitySenderListEl.replaceChildren(
    ...flagged.map(({ sender, score }) => {
      const li = document.createElement("li");
      const label = sender.threatSignals.map(describeSignal).join("; ");
      const tierEl = document.createElement("strong");
      tierEl.textContent = `${riskTier(score).toUpperCase()} risk`;
      const text = document.createElement("span");
      const firstContact = sender.firstContact ? " · new since Cluster started tracking" : "";
      text.textContent = ` — ${sender.displayName || sender.address} <${sender.address}> — ${label} `;
      const meta = document.createElement("span");
      meta.className = "hint";
      meta.textContent = `[${authChip(sender.authVerdicts)}]${firstContact} `;
      li.append(tierEl, text, meta);

      const provider = providerById.get(sender.provider);
      if (provider?.labelSuspicious) {
        const slot = document.createElement("span");
        const btn = document.createElement("button");
        btn.textContent = "Label as suspicious";
        const reset = () => {
          slot.innerHTML = "";
          slot.appendChild(btn);
        };
        btn.onclick = () => {
          renderConfirmStep(
            slot,
            reset,
            `Move ${sender.messageIds.length} message${sender.messageIds.length === 1 ? "" : "s"} from ${sender.address} to a "Possible Phishing" label, out of the inbox?`,
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
        li.appendChild(slot);
      }

      if (provider?.getMessageLinks) {
        const scanResult = document.createElement("span");
        scanResult.className = "hint";
        const scanBtn = document.createElement("button");
        scanBtn.textContent = "Deep scan (checks links in the most recent message)";
        scanBtn.onclick = async () => {
          scanBtn.disabled = true;
          await runDeepScan(sender, scanResult);
          scanBtn.disabled = false;
        };
        li.append(scanBtn, scanResult);
      }
      return li;
    }),
  );
}
