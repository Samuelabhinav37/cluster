// Security's charts and Warning signs page. Built on this device from:
// - settings.scamHistory: what auto-quarantine held each week (scamHistory.ts)
// - settings.quarantineReview: what the user marked safe or kept held
// - this scan's senders with warning signs (verdict.ts)
// Charts are single series in one hue, each with a hover value and a table
// view, so no colour carries meaning on its own.
import { heldByWeek } from "../lib/scamHistory";
import type { SenderSummary } from "../lib/senderModel";
import { engineContext, riskOf } from "../lib/mailEngine";
import { SCAN_CHECKS, scanCheckCounts } from "../lib/securityScan";
import type { ThreatSignalKind } from "../lib/threatSignals";
import { senderName } from "../lib/senderListView";
import { ctx } from "./state";
import { listGroup, listRow } from "./listRow";
import { senderTile } from "./senderTile";

const WEEKS = 8;

/** Short names for the warning signs, for chart labels. */
const KIND_NAME: Record<ThreatSignalKind, string> = {
  "blocklisted-domain": "On a scam list",
  "freemail-brand-claim": "Brand from a free email account",
  "brand-impersonation": "Name doesn't match the address",
  "lookalike-domain": "Address looks like a brand",
  "failed-authentication": "Failed the sender check",
  "reply-to-mismatch": "Replies go elsewhere",
  "punycode-domain": "Disguised characters",
  "lure-language": "Pushes you to act fast",
  "link-mismatch": "Link goes somewhere else",
  "risky-attachment": "Risky attachment",
  "identity-change": "Familiar sender changed",
  "provider-flagged": "Outlook flagged it",
  "blocklisted-link": "Links to a scam site",
  "name-match": "Familiar name, new address",
  "alias-lookalike": "Looks like a contact's address",
  campaign: "Same subject from many strangers",
};


const $ = (id: string) => document.getElementById(id);

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function weekLabel(weekStart: number, last: boolean): string {
  return last ? "This week" : new Date(weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

let tip: HTMLElement | null = null;
function wireTooltips(): void {
  if (tip) return;
  tip = el("div", "chart-tip");
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener("mousemove", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
    if (!tip) return;
    if (!target) {
      tip.hidden = true;
      return;
    }
    tip.textContent = target.dataset.tip ?? "";
    tip.hidden = false;
    tip.style.left = `${Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${event.clientY - 36}px`;
  });
}

// The senders behind each warning sign, for the Warning signs page.
let signSenders = new Map<ThreatSignalKind, { sender: SenderSummary; why: string }[]>();
let openSender: (key: string) => void = () => {};

/** A tile's own page on Protect: Scams per week, or Warning signs. */
function showProtectPage(page: "held" | "signs" | null): void {
  const screen = document.querySelector<HTMLElement>('section.screen[data-screen="impersonation"]');
  const root = $("protect-page");
  if (!screen || !root) return;
  screen.classList.toggle("paged", page !== null);
  root.hidden = page === null;
  if (page === null) return root.replaceChildren();
  const back = el("button", "cu-back", "‹ Security");
  (back as HTMLButtonElement).type = "button";
  back.onclick = () => showProtectPage(null);
  if (page === "held") {
    const chart = $("report-held-card")!.cloneNode(true) as HTMLElement;
    chart.removeAttribute("id");
    chart.classList.remove("row-link");
    chart.querySelector("h2")?.remove();
    for (const n of Array.from(chart.querySelectorAll("[id]"))) n.removeAttribute("id");
    root.replaceChildren(back, el("h2", "cu-page-title", "Scams per week"), chart);
    return;
  }
  const groups = [...signSenders].sort((a, b) => b[1].length - a[1].length);
  root.replaceChildren(
    back,
    el("h2", "cu-page-title", "Warning signs"),
    ...groups.flatMap(([kind, rows]) => {
      const section = el("section", "ios-section");
      section.append(
        el("h2", "ios-head", `${KIND_NAME[kind]} · ${rows.length}`),
        listGroup(
          rows.map(({ sender, why }) =>
            listRow({
              lead: senderTile(sender.address, sender.displayName, "sz-30"),
              title: senderName(sender),
              sub: why,
              href: () => openSender(sender.key),
            }),
          ),
          { inset: true },
        ),
      );
      return [section];
    }),
  );
}

/** The two tiles open their pages; a row on a page opens its emails in Details. */
export function wireProtectPages(open: (senderKey: string) => void): void {
  openSender = open;
  for (const [id, page] of [["report-held-card", "held"], ["report-signs-card", "signs"]] as const) {
    const card = $(id);
    if (!card) continue;
    card.classList.add("row-link");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.onclick = () => showProtectPage(page);
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showProtectPage(page);
      }
    };
  }
}

export function renderSecurityCharts(securitySenders: SenderSummary[]): void {
  wireTooltips();
  const weeks = heldByWeek(ctx.settings.scamHistory, WEEKS);
  const heldTotal = weeks.reduce((n, w) => n + w.held, 0);
  const bars = $("report-held-bars");
  const labels = $("report-held-labels");
  const sub = $("report-held-sub");
  if (bars && labels && sub) {
    const max = Math.max(1, ...weeks.map((w) => w.held));
    bars.setAttribute("aria-label", `Emails held each week, last ${WEEKS} weeks: ${weeks.map((w) => w.held).join(", ")}`);
    bars.replaceChildren(
      ...weeks.map((w, i) => {
        const bar = el("div", "vbar");
        const label = weekLabel(w.weekStart, i === weeks.length - 1);
        bar.dataset.tip = `${label === "This week" ? "This week" : `Week of ${label}`}: ${w.held} held`;
        const fill = el("i");
        fill.style.height = `${w.held === 0 ? 0 : Math.max((w.held / max) * 100, 4)}%`;
        bar.appendChild(fill);
        if (w.held > 0 && (w.held === max || i === weeks.length - 1)) {
          const val = el("span", "val", String(w.held));
          val.style.bottom = `${(w.held / max) * 100}%`;
          bar.appendChild(val);
        }
        return bar;
      }),
    );
    labels.replaceChildren(...weeks.map((w, i) => el("span", undefined, i % 2 === 1 || i === weeks.length - 1 ? weekLabel(w.weekStart, i === weeks.length - 1) : "")));
    sub.textContent = `Last ${WEEKS} weeks`;
    // An empty chart says nothing; it shows once something has been held.
    const card = $("report-held-card");
    if (card) card.hidden = heldTotal === 0;
  }

  // This scan's senders with warning signs, after verdict.ts rule 1.
  const known = engineContext(ctx.settings);
  const kindCounts = new Map<ThreatSignalKind, number>();
  signSenders = new Map();
  for (const sender of securitySenders) {
    const { signals, reasons } = riskOf(sender, known);
    if (signals.length === 0) continue;
    for (const kind of new Set(signals.map((s) => s.kind))) {
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
      const why = reasons.find((r) => r.kind === kind)?.text ?? KIND_NAME[kind];
      signSenders.set(kind, [...(signSenders.get(kind) ?? []), { sender, why }]);
    }
  }
  const scanned = ctx.senders.length;
  const failed = kindCounts.get("failed-authentication") ?? 0;
  const pct = $("report-checks-pct");
  const pctSub = $("report-checks-sub");
  if (pct && pctSub) {
    // A ratio against a 100% target: the one place a gauge fits
    // (research/2026-10-29-dashboard-examples-muzli.md).
    const passed = scanned > 0 ? Math.round(((scanned - failed) / scanned) * 100) : 0;
    pct.textContent = scanned > 0 ? `${passed}%` : "–";
    pctSub.textContent = scanned > 0 ? `of senders passed · ${failed} of ${scanned} failed` : "";
    const gauge = $("report-checks-gauge");
    if (gauge) {
      gauge.setAttribute("aria-label", `${passed}% of senders passed`);
      gauge.replaceChildren(
        ...Array.from({ length: 20 }, (_, i) => {
          const tick = document.createElement("i");
          if (scanned > 0 && i < Math.round(passed / 5)) tick.className = "on";
          return tick;
        }),
      );
    }
  }
  const kindsEl = $("report-kinds");
  if (kindsEl) paintChecks(kindsEl, scanCheckCounts(securitySenders, known));
  if (!$("protect-page")?.hidden && $("protect-page")?.querySelector(".cu-page-title")?.textContent === "Warning signs")
    showProtectPage("signs");

}

/** Security's Checks card: every check Cluster runs and what it found. `null` while a scan runs. */
export function paintChecks(list: HTMLElement, counts: readonly number[] | null): void {
  list.replaceChildren(
    ...SCAN_CHECKS.map(({ label }, i) => {
      const n = counts?.[i];
      const li = el("li", n === undefined ? "is-running" : n > 0 ? "is-found" : "is-ok");
      li.append(el("i"), el("span", "sec-check-name", label), el("b", undefined, n === undefined ? "Checking" : n === 0 ? "Passed" : `${n} ${n === 1 ? "sender" : "senders"}`));
      return li;
    }),
  );
}

