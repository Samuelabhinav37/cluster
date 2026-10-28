// Scams screen (data-screen="impersonation"). Two lists, both in plain words
// from verdict.ts: "Held for you" (mail auto-quarantine moved, from the
// durable quarantinedSenders ledger) and "Check before you act" (senders in
// this scan with warning signs, still in the inbox). Per-card actions: It's
// fine, guided reporting, Deep scan and Block. The newest flagged message of a
// warned or held sender is also checked automatically, up to 20 a scan; these
// are the only places a message body is read (bodyChecks.ts).
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
import { rowMenu } from "./rowMenu";
import { brandHomeDomain } from "../lib/threatSignals";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { clusterLabelName } from "../lib/clusterLabels";
import { failsSenderChecks } from "../lib/emailAuth";
import { icon } from "./homeDashboard";
import {
  applyBodyChecks,
  bodyCheckKey,
  checkLinks,
  loadBodyChecks,
  MAX_CHECKS_PER_SCAN,
  saveBodyChecks,
  withCheck,
  type BodyCheckStore,
} from "../lib/bodyChecks";

let bodyChecks: BodyCheckStore = {};
let checkingBodies = false;

export async function initBodyChecks(): Promise<void> {
  bodyChecks = await loadBodyChecks().catch((err) => {
    log.error("Could not load body checks", err);
    return {};
  });
}

async function storeBodyCheck(key: string, check: ReturnType<typeof checkLinks>): Promise<void> {
  bodyChecks = withCheck(bodyChecks, key, check);
  await saveBodyChecks(bodyChecks).catch((err) => log.error("Could not save a body check", err));
}

const securitySectionEl = document.getElementById("security-section") as HTMLElement;
const securitySenderListEl = document.getElementById("security-sender-list") as HTMLUListElement;
const securityEmptyEl = document.getElementById("security-empty") as HTMLParagraphElement;
const securityLowListEl = document.getElementById("security-low-list") as HTMLElement;
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
    await storeBodyCheck(bodyCheckKey(sender, targetId), checkLinks(links));

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
  return sep === -1
    ? { providerId: "", address: key }
    : { providerId: key.slice(0, sep), address: key.slice(sep + 1) };
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
      sub.textContent = `${n} held ${timeAgo(record.at)}, in "${clusterLabelName("suspicious")}"`;
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

/** Guided reporting. Cluster never sends a report itself: it shows the
 * steps and the user acts in their own mail. */
function reportSteps(): { button: HTMLButtonElement; steps: HTMLOListElement } {
  const steps = document.createElement("ol");
  steps.className = "report-steps";
  steps.hidden = true;
  for (const text of [
    "Open the email in Gmail or Outlook.",
    "Gmail: ⋮ More, then Report phishing. Outlook: Report, then Report phishing.",
    "Optional: forward it as an attachment to reportphishing@apwg.org.",
  ]) {
    const li = document.createElement("li");
    li.textContent = text;
    steps.appendChild(li);
  }
  const button = document.createElement("button");
  button.className = "btn btn-ghost";
  button.textContent = "Report it";
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

export function renderSecuritySection(senders: SenderSummary[], autoCheck = true) {
  applyBodyChecks(senders, bodyChecks);
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

  // Two tiers: warned or held first, lone weak signs under "Worth a look".
  const high = flagged.filter(({ verdict }) => verdict.tier !== "none");
  const low = flagged.filter(({ verdict }) => verdict.tier === "none");
  securitySenderListEl.replaceChildren(
    ...high.map(({ sender, verdict }) => buildThreatCard(sender, verdict)),
  );
  securityLowListEl.replaceChildren(...low.map(({ sender, verdict }) => buildThreatCard(sender, verdict)));
  document.getElementById("security-high")!.hidden = high.length === 0;
  document.getElementById("security-low")!.hidden = low.length === 0;
  if (autoCheck && !checkingBodies) {
    checkingBodies = true;
    void checkFlaggedBodies(senders, flagged).finally(() => (checkingBodies = false));
  }
}

/** Reads the flagged message of warned and held senders not checked yet, at
 * most 20, and redraws once if any turned up bad links. */
async function checkFlaggedBodies(
  senders: SenderSummary[],
  flagged: { sender: SenderSummary; verdict: Verdict }[],
): Promise<void> {
  const todo = flagged
    .filter(({ verdict }) => verdict.tier !== "none")
    .map(({ sender, verdict }) => ({ sender, id: headlineMessage(sender, verdict)?.id }))
    .filter(
      ({ sender, id }) =>
        id && providerById.get(sender.provider)?.getMessageLinks && !bodyChecks[bodyCheckKey(sender, id)],
    )
    .slice(0, MAX_CHECKS_PER_SCAN);
  let found = false;
  for (const { sender, id } of todo) {
    const provider = providerById.get(sender.provider)!;
    try {
      const token = await provider.getAuthToken(false);
      const check = checkLinks(await provider.getMessageLinks!(token, id!));
      await storeBodyCheck(bodyCheckKey(sender, id!), check);
      if (check.mismatchedLinks > 0 || check.badLinks > 0) found = true;
    } catch (err) {
      log.error("Could not check a flagged message's links", err);
    }
  }
  if (found) renderSecuritySection(senders, false);
}

/** The subject to show: the newest message a warning came from, else the
 * newest message from this sender. */
function headlineMessage(sender: SenderSummary, verdict: Verdict) {
  const flagged = new Set(verdict.signals.flatMap((s) => s.messageIds ?? []));
  const pool = sender.messages.filter((m) => flagged.size === 0 || flagged.has(m.id));
  return [...(pool.length > 0 ? pool : sender.messages)].sort((a, b) => b.receivedAt - a.receivedAt)[0];
}

/** The brand a scam pretends to be, with a red badge (like Apple Passwords
 * showing each site's icon); the sender's own tile when no brand is named. */
function fakedBrandTile(sender: SenderSummary): HTMLElement {
  const brand = sender.threatSignals.find((s) => s.brand)?.brand;
  const domain = brand ? brandHomeDomain(brand) : undefined;
  const name = brand ? brand.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
  const tile = domain
    ? senderTile(`no-reply@${domain}`, name, "sz-34")
    : senderTile(sender.address, sender.displayName, "sz-34");
  const wrap = document.createElement("span");
  wrap.className = "faked-brand";
  const badge = document.createElement("span");
  badge.className = "faked-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = "!";
  wrap.append(tile, badge);
  return wrap;
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
  const when = message ? ` · ${new Date(message.receivedAt).toLocaleDateString()}` : "";
  const fromText = `From ${sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address}${when}`;
  // One line under the subject: the strongest reason. The rest sit under ⋯.
  const why = document.createElement("div");
  why.className = "scam-from";
  why.textContent = verdict.reasons[0]?.text ?? fromText;
  id.append(title, why);
  const [chipClass, chipText] = TIER_CHIP[verdict.tier];
  const chip = document.createElement("span");
  chip.className = `risk-chip ${chipClass}`;
  chip.textContent = chipText;
  const quick = document.createElement("button");
  quick.type = "button";
  quick.className = "btn";
  // A chevron opens the reasons; ⋯ (added below) holds the other actions.
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn-icon scam-chev";
  toggle.setAttribute("aria-label", "Why");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "›";
  const more = document.createElement("div");
  more.className = "scam-more";
  more.hidden = true;
  const expand = () => {
    more.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  toggle.onclick = () => {
    more.hidden = !more.hidden;
    toggle.setAttribute("aria-expanded", String(!more.hidden));
  };
  head.append(fakedBrandTile(sender), id, quick, toggle);
  li.appendChild(head);
  li.appendChild(more);

  const fromLine = document.createElement("p");
  fromLine.className = "scam-from";
  fromLine.append(chip, " ", fromText);
  more.append(fromLine, reasonList(verdict));

  // A familiar sender whose identity changed is the invoice-fraud shape:
  // the safe move is a call on a number the user already has.
  if (verdict.signals.some((s) => s.kind === "identity-change")) {
    const card = document.createElement("div");
    card.className = "callback";
    const b = document.createElement("b");
    b.textContent = "Before you pay anything";
    const text = document.createElement("span");
    text.textContent = "Call them on a number you already have, not one in this email.";
    const wrap = document.createElement("div");
    wrap.append(b, text);
    card.appendChild(wrap);
    li.insertBefore(card, more);
  }

  const report = reportSteps();
  more.appendChild(report.steps);

  const actions = document.createElement("div");
  actions.className = "scam-actions";
  const provider = providerById.get(sender.provider);

  const genuine = document.createElement("button");
  genuine.className = "btn";
  genuine.textContent = "It's fine";
  genuine.title = "Cluster will remember this sender";
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
  more.appendChild(actions);

  // The row's own button: block (its confirm opens below) for real warnings,
  // "It's fine" for a lone weak sign.
  const blockBtn = Array.from(actions.querySelectorAll("button")).find(
    (b) => b.textContent === "Block sender",
  );
  const target = verdict.tier !== "none" && blockBtn ? blockBtn : genuine;
  quick.textContent = target === genuine ? "It's fine" : "Block";
  if (target !== genuine) quick.classList.add("btn-danger");
  // Opens the reasons with just the step that's running below them.
  const only = (button: HTMLElement, ...also: HTMLElement[]) => {
    expand();
    for (const child of Array.from(actions.children) as HTMLElement[]) {
      child.hidden = !(child === button || child.contains(button) || also.includes(child));
    }
    button.click();
  };
  const scanBtn = Array.from(actions.querySelectorAll("button")).find((b) => b.textContent === "Deep scan");
  quick.onclick = () => (target === genuine ? genuine.click() : only(target));
  head.appendChild(
    rowMenu([
      ...(target === genuine ? [] : [{ label: "It's fine", run: () => genuine.click() }]),
      { label: "Report", run: () => only(report.button) },
      ...(scanBtn
        ? [{ label: "Deep scan", run: () => only(scanBtn, scanBtn.nextElementSibling as HTMLElement) }]
        : []),
      ...(blockBtn && target !== blockBtn
        ? ["sep" as const, { label: "Block sender", danger: true, run: () => only(blockBtn) }]
        : []),
    ]),
  );
  // Until an action runs, the reasons show without the old button row.
  for (const child of Array.from(actions.children) as HTMLElement[]) child.hidden = true;

  return li;
}

// ── Checkup: what Cluster looked for, Google Security Checkup style ──────
const FAKE_KINDS = new Set(["brand-impersonation", "freemail-brand-claim", "lookalike-domain"]);

export interface CheckRow {
  ic: string;
  name: string;
  value: string;
  warn: boolean;
}

/** One row per check, with how many senders tripped it. */
export function securityChecks(senders: readonly SenderSummary[], held: number): CheckRow[] {
  const count = (hit: (s: SenderSummary) => boolean) => senders.filter(hit).length;
  const has = (kinds: Set<string> | string) => (s: SenderSummary) =>
    s.threatSignals.some((x) => (typeof kinds === "string" ? x.kind === kinds : kinds.has(x.kind)));
  const row = (ic: string, name: string, n: number): CheckRow => ({
    ic,
    name,
    value: n > 0 ? n.toLocaleString() : "None",
    warn: n > 0,
  });
  const judged = count((s) => s.authVerdicts.dmarc !== "unknown" || s.authVerdicts.spf !== "unknown");
  const forged = count(failsSenderChecks);
  return [
    {
      ic: "shield-check",
      name: "Sender checks",
      value: forged > 0 ? `${forged.toLocaleString()} failed` : judged > 0 ? "All passed" : "Not checked yet",
      warn: forged > 0,
    },
    row("tag", "Fake brand names", count(has(FAKE_KINDS))),
    row("reply", "Replies sent elsewhere", count(has("reply-to-mismatch"))),
    row("link", "Known bad links", count(has("blocklisted-link"))),
    { ic: "inbox", name: "Held so far", value: held.toLocaleString(), warn: false },
  ];
}

export function renderSecurityChecks(senders: readonly SenderSummary[], held: number): void {
  const host = document.getElementById("protect-checks");
  if (!host) return;
  host.replaceChildren(
    ...securityChecks(senders, held).map((c) => {
      const row = document.createElement("div");
      row.className = "ios-row";
      const mark = document.createElement("span");
      mark.className = `app-ic ${c.warn ? "app-warn" : "app-ok"}`;
      mark.append(icon(c.ic));
      const name = document.createElement("span");
      name.className = "grow";
      name.textContent = c.name;
      const value = document.createElement("span");
      value.className = `ios-value${c.warn ? " warn" : ""}`;
      value.textContent = c.value;
      row.append(mark, name, value);
      return row;
    }),
  );
}
