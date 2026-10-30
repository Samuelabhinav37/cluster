// Protect's brand check: senders that use a company's name from an address the
// brand registry doesn't list ("Doesn't match"), what the user or a mark
// certificate settled ("Checked"), and the certified companies in this
// mailbox ("Verified senders"). Check reads the one domain's BIMI certificate
// (markCheck.ts); Trust and Block are the user's call when there is none.
import { applyBrandVerdicts } from "../lib/brandRegistry";
import { checkMark, type MarkCheckResult } from "../lib/markCheck";
import { mutateSettings, type BrandVerdict } from "../lib/settingsStore";
import type { SenderSummary } from "../lib/senderModel";
import { clusterLabelName } from "../lib/clusterLabels";
import { log } from "../lib/log";
import { brandName as title } from "../lib/verdict";
import { certifiedCompany, senderTile } from "./senderTile";
import { ctx, providerById } from "./state";
import { logAction } from "./recentTab";
import { infoButton, renderConfirmStep } from "./ui";

// Only a sender on its own domain can hold a certificate. A brand claim from
// free mail is a scam card, never a domain verdict (it would vouch for gmail.com).
const BRAND_KINDS = new Set(["brand-impersonation"]);

const domainOf = (address: string) => address.slice(address.lastIndexOf("@") + 1).toLowerCase();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string, className: string, run: () => void): HTMLButtonElement {
  const b = Object.assign(el("button", className, text), { type: "button" as const });
  b.onclick = run;
  return b;
}

/** The brand a sender claims, or undefined when it claims none. */
export function claimedBrand(sender: SenderSummary): string | undefined {
  return sender.threatSignals.find((s) => BRAND_KINDS.has(s.kind) && s.brand)?.brand;
}

/** Senders claiming a brand from an unlisted domain that nobody has settled yet. */
export function mismatchedSenders(senders: SenderSummary[]): SenderSummary[] {
  const verdicts = ctx.settings.brandVerdicts ?? {};
  return senders.filter((s) => claimedBrand(s) && !verdicts[domainOf(s.address)]);
}

/** What a check found that still needs the user, keyed by sender. */
const results = new Map<string, MarkCheckResult>();
const busy = new Set<string>();

async function saveVerdict(domain: string, verdict: BrandVerdict): Promise<void> {
  ctx.settings = await mutateSettings((s) => ({
    ...s,
    brandVerdicts: { ...s.brandVerdicts, [domain]: verdict },
  }));
  applyBrandVerdicts(ctx.settings.brandVerdicts);
}

async function runCheck(sender: SenderSummary, brand: string, redraw: () => void): Promise<void> {
  busy.add(sender.key);
  redraw();
  const domain = domainOf(sender.address);
  try {
    const result = await checkMark(domain, brand);
    if (result.verdict === "real") {
      await saveVerdict(domain, {
        brand,
        verdict: "real",
        by: "certificate",
        company: result.company,
        at: Date.now(),
      });
      await logAction("labelSuspicious", `Checked ${domain}: certified to ${result.company}`);
    } else results.set(sender.key, result);
  } catch (err) {
    log.error("Brand check failed", err);
    results.set(sender.key, { verdict: "failed", reason: String(err) });
  } finally {
    busy.delete(sender.key);
    redraw();
  }
}

function resultChip(result: MarkCheckResult): HTMLElement {
  switch (result.verdict) {
    case "other-company":
      return el("span", "chip chip-danger", `Certified to ${result.company}`);
    case "no-certificate":
      return el("span", "chip", "No certificate");
    default:
      return el("span", "chip", "Couldn't check");
  }
}

function mismatchRow(sender: SenderSummary, redraw: () => void): HTMLElement {
  const brand = claimedBrand(sender)!;
  const domain = domainOf(sender.address);
  const row = el("div", "mm-row");
  const who = el("div", "mm-who");
  who.append(el("b", "", title(brand)), el("span", "mm-addr", sender.address));
  const acts = el("div", "mm-acts");
  row.append(
    senderTile(sender.address, sender.displayName, "sz-30"),
    who,
    el("span", "mm-num", String(sender.messageIds.length)),
    acts,
  );

  const result = results.get(sender.key);
  if (!result) {
    const check = button(
      busy.has(sender.key) ? "Checking" : "Check",
      "btn",
      () => void runCheck(sender, brand, redraw),
    );
    check.disabled = busy.has(sender.key);
    acts.append(check);
    return row;
  }
  // The certificate's host blocks cross-origin reads until Chrome allows it,
  // and Chrome only asks from a click, so this is its own button.
  if (result.verdict === "needs-permission") {
    acts.append(
      button("Allow", "btn", async () => {
        if (await chrome.permissions.request({ origins: [result.origin] })) {
          results.delete(sender.key);
          void runCheck(sender, brand, redraw);
        }
      }),
    );
    return row;
  }
  const trust = button("Trust", "btn", async () => {
    await saveVerdict(domain, { brand, verdict: "real", by: "you", at: Date.now() });
    await logAction("labelSuspicious", `Trusted ${domain} as ${title(brand)}`);
    results.delete(sender.key);
    redraw();
  });
  const block = button("Block", "btn btn-danger", () => {
    const provider = providerById.get(sender.provider);
    const settle = async () => {
      await saveVerdict(domain, { brand, verdict: "fake", by: "you", at: Date.now() });
      results.delete(sender.key);
    };
    if (!provider?.labelSuspicious) return void settle().then(redraw);
    const n = sender.messageIds.length;
    renderConfirmStep(
      acts,
      redraw,
      `Move ${n} email${n === 1 ? "" : "s"} to "${clusterLabelName("suspicious")}"?`,
      true,
      async () => {
        const token = await provider.getAuthToken(false);
        await provider.labelSuspicious!(token, sender.messageIds);
        await settle();
        await logAction("labelSuspicious", `Blocked ${domain} pretending to be ${title(brand)}`);
        setTimeout(redraw, 1200);
        return "Blocked ✓";
      },
    );
  });
  acts.append(resultChip(result), trust, block);
  return row;
}

function checkedRow(domain: string, v: BrandVerdict): HTMLElement {
  const row = el("div", "mm-row");
  const who = el("div", "mm-who");
  who.append(el("b", "", title(v.brand)), el("span", "mm-addr", domain));
  const acts = el("div", "mm-acts");
  acts.append(
    el("span", v.verdict === "fake" ? "chip chip-danger" : "chip", v.verdict === "fake" ? "Blocked" : "Real"),
  );
  row.append(senderTile(`no-reply@${domain}`, title(v.brand), "sz-30"), who, el("span", "mm-num"), acts);
  return row;
}

/** Fills #brand-check. Called with each Protect render. */
export function renderBrandCheck(senders: SenderSummary[]): void {
  const root = document.getElementById("brand-check");
  if (!root) return;
  const redraw = () => renderBrandCheck(senders);
  const parts: HTMLElement[] = [];

  const mismatched = mismatchedSenders(senders);
  if (mismatched.length > 0) {
    const head = el("div", "section-head");
    const h = el("h2", "section-label", "Doesn't match");
    const [info, pop] = infoButton(
      "These use a company's name but write from an address the company doesn't list. Check reads the address's trademark certificate, which only the real owner can get. Only the domain name leaves your computer.",
      "About Doesn't match",
    );
    h.append(info);
    head.append(h);
    const unchecked = mismatched.filter((s) => !results.has(s.key) && !busy.has(s.key));
    if (unchecked.length > 1)
      head.append(
        button("Check all", "btn btn-accent-solid", () => {
          for (const s of unchecked) void runCheck(s, claimedBrand(s)!, redraw);
        }),
      );
    const card = el("div", "glass-card mm-card");
    card.append(...mismatched.map((s) => mismatchRow(s, redraw)));
    parts.push(head, pop, card);
  }

  const checked = Object.entries(ctx.settings.brandVerdicts ?? {}).sort((a, b) => b[1].at - a[1].at);
  if (checked.length > 0) {
    const card = el("div", "glass-card mm-card");
    card.append(...checked.slice(0, 20).map(([d, v]) => checkedRow(d, v)));
    parts.push(el("h2", "section-label", "Checked"), card);
  }

  // One cell per certified company that writes to you, busiest first.
  const seen = new Map<string, { name: string; legal: string; address: string; n: number }>();
  for (const s of senders) {
    const company = certifiedCompany(s.address);
    if (!company) continue;
    const cur = seen.get(company.id);
    if (cur) cur.n += s.messageIds.length;
    // The name the mail shows ("LinkedIn"), not the certificate's legal one.
    else
      seen.set(company.id, {
        name: s.displayName || company.name,
        legal: company.name,
        address: s.address,
        n: s.messageIds.length,
      });
  }
  if (seen.size > 0) {
    const h = el("h2", "section-label", "Verified senders");
    const [info, pop] = infoButton(
      "A certificate authority checked each company's trademark before tying its name and logo to these addresses.",
      "About Verified senders",
    );
    h.append(info);
    const grid = el("div", "verified-grid");
    for (const c of [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 18)) {
      const cell = el("div", "glass-card vcell");
      cell.title = `Certified to ${c.legal}`;
      cell.append(senderTile(c.address, c.name, "sz-26"), el("span", "", c.name));
      grid.append(cell);
    }
    parts.push(h, pop, grid);
  }
  root.replaceChildren(...parts);
}
