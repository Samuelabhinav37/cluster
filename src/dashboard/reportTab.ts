// Scam report (data-screen="report"). Built on this device from:
// - settings.scamHistory: what auto-quarantine held each week (scamHistory.ts)
// - settings.quarantineReview: what the user marked safe or kept held
// - this scan's senders with warning signs (verdict.ts)
// Charts are single series in one hue, each with a hover value and a table
// view, so no colour carries meaning on its own.
import { heldByWeek } from "../lib/scamHistory";
import type { SenderSummary } from "../lib/senderModel";
import { knownSenderSet } from "../lib/screener";
import type { ThreatSignalKind } from "../lib/threatSignals";
import { brandName, senderVerdict } from "../lib/verdict";
import { ctx } from "./state";

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
};

const BRAND_KINDS = new Set<ThreatSignalKind>(["brand-impersonation", "freemail-brand-claim", "lookalike-domain"]);

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

function hbars(container: HTMLElement, rows: [string, number][], unit: string, empty: string): void {
  container.replaceChildren();
  if (rows.length === 0) {
    container.appendChild(el("p", "lead-sm", empty));
    return;
  }
  const max = Math.max(...rows.map(([, n]) => n));
  for (const [label, n] of rows) {
    const row = el("div", "hbar");
    row.dataset.tip = `${label}: ${n} ${unit}`;
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = `${(n / max) * 100}%`;
    track.appendChild(fill);
    row.append(el("span", undefined, label), track, el("span", "n", String(n)));
    container.appendChild(row);
  }
}

function table(caption: string, rows: [string, number][]): HTMLTableElement {
  const t = document.createElement("table");
  t.className = "data";
  t.createCaption().textContent = caption;
  const head = t.insertRow();
  for (const text of ["Item", "Count"]) {
    const th = document.createElement("th");
    th.textContent = text;
    head.appendChild(th);
  }
  for (const [label, n] of rows) {
    const tr = t.insertRow();
    tr.insertCell().textContent = label;
    tr.insertCell().textContent = String(n);
  }
  return t;
}

export function renderScamReport(securitySenders: SenderSummary[]): void {
  wireTooltips();
  const weeks = heldByWeek(ctx.settings.scamHistory, WEEKS);
  const heldTotal = weeks.reduce((n, w) => n + w.held, 0);
  const verdicts = Object.values(ctx.settings.quarantineReview);
  const released = verdicts.filter((v) => v.verdict === "released").length;
  const confirmed = verdicts.filter((v) => v.verdict === "confirmed").length;

  const kpis = $("report-kpis");
  if (kpis) {
    kpis.replaceChildren(
      ...([
        ["Emails held", heldTotal, `last ${WEEKS} weeks`],
        ["You marked safe", released, "Cluster weighs them less"],
        ["You kept held", confirmed, "senders confirmed as scams"],
      ] as const).map(([k, v, d]) => {
        const card = el("div", "report-kpi");
        card.append(el("div", "k", k), el("div", "v", String(v)), el("div", "d", d));
        return card;
      }),
    );
  }

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
    sub.textContent =
      heldTotal > 0
        ? `Last ${WEEKS} weeks`
        : ctx.settings.autoQuarantineHighRisk
          ? "Nothing held yet. This fills in as Cluster holds scams."
          : "Scam holding is off, so nothing is held. Turn it on in Scams.";
  }

  // This scan's senders with warning signs, after verdict.ts rule 1.
  const known = knownSenderSet(ctx.settings);
  const brandCounts = new Map<string, number>();
  const kindCounts = new Map<ThreatSignalKind, number>();
  for (const sender of securitySenders) {
    const { signals } = senderVerdict(sender, {
      knownCorrespondent: known.has(sender.address.toLowerCase()),
      review: ctx.settings.quarantineReview[sender.key],
    });
    if (signals.length === 0) continue;
    const brand = signals.find((s) => BRAND_KINDS.has(s.kind))?.brand;
    if (brand) brandCounts.set(brandName(brand), (brandCounts.get(brandName(brand)) ?? 0) + 1);
    for (const kind of new Set(signals.map((s) => s.kind))) kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  const brandRows = [...brandCounts].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const kindRows: [string, number][] = [...kindCounts].sort((a, b) => b[1] - a[1]).map(([k, n]) => [KIND_NAME[k], n]);
  const brandsEl = $("report-brands");
  const kindsEl = $("report-kinds");
  if (brandsEl) hbars(brandsEl, brandRows, "senders", "No sender in this scan pretended to be a brand.");
  if (kindsEl) hbars(kindsEl, kindRows, "senders", "No warning signs in this scan.");

  const tableEl = $("report-table");
  if (tableEl) {
    tableEl.replaceChildren(
      table("Emails held each week", weeks.map((w, i) => [weekLabel(w.weekStart, i === weeks.length - 1), w.held])),
      table("Who they pretended to be", brandRows),
      table("Warning signs", kindRows),
    );
  }
}
