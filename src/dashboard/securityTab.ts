// Security tab: the "Possible impersonation" list. Read-only threat-signal
// detail plus two manual, per-sender actions — "Label as suspicious" and
// "Deep scan" (the one place the dashboard fetches a message body). Never
// automatic, never a standing filter — see threatSignals.ts / linkMismatch.ts.
import { log } from "../lib/log";
import { findBlocklistedLinkTargets, findMismatchedLinks } from "../lib/linkMismatch";
import { isBlockedDomain } from "../lib/blocklist";
import { riskTier, senderRiskScore } from "../lib/threatSignals";
import { queueAthenaSecurityEvent } from "../lib/athenaIntegration";
import type { SenderSummary } from "../lib/senderModel";
import { renderConfirmStep } from "./ui";
import { providerById } from "./state";
import { logAction } from "./recentTab";

const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;

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

export function renderSecuritySection(senders: SenderSummary[]) {
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
