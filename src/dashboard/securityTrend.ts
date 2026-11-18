// Security's second row, in the Dashboard's style: threats each day as a stacked
// chart (what Inky, Lastline and Google's security dashboard lead with), and the
// brands senders pretended to be, ranked like Top senders.
import { engineContext, riskOf } from "../lib/mailEngine";
import type { SenderSummary } from "../lib/senderModel";
import { brandHomeDomain } from "../lib/threatSignals";
import { brandName } from "../lib/verdict";
import { chartLegend, chartStats, dayChart, type ChartSeries } from "./homeDashboard";
import { senderTile } from "./senderTile";
import { ctx } from "./state";

const DAY = 86_400_000;
const DAYS = 30;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Which of the last `DAYS` days (0 = oldest) a time falls on, or -1. */
function dayIndex(t: number, today: number): number {
  const i = DAYS - 1 - Math.floor((today - new Date(t).setHours(0, 0, 0, 0)) / DAY);
  return i >= 0 && i < DAYS ? i : -1;
}

export interface SecurityTrend {
  scams: number[];
  warnings: number[];
  held: number[];
  /** Brand name → emails faking it, and the sender with the most of them. */
  brands: Map<string, { count: number; brand: string; sender: SenderSummary }>;
}

/** Emails each day from senders Cluster holds (scams) or warns about, emails it
 * held, and the brands the warned senders claimed. */
export function securityTrend(senders: readonly SenderSummary[], now: number): SecurityTrend {
  const today = new Date(now).setHours(0, 0, 0, 0);
  const scams = new Array<number>(DAYS).fill(0);
  const warnings = new Array<number>(DAYS).fill(0);
  const held = new Array<number>(DAYS).fill(0);
  const brands: SecurityTrend["brands"] = new Map();
  const risk = engineContext(ctx.settings);
  for (const sender of senders) {
    const verdict = riskOf(sender, risk);
    if (verdict.tier === "none") continue;
    const into = verdict.tier === "hold" ? scams : warnings;
    let recent = 0;
    for (const m of sender.messages) {
      const i = dayIndex(m.receivedAt, today);
      if (i < 0) continue;
      into[i] += 1;
      recent += 1;
    }
    const brand = verdict.signals.find((s) => s.brand)?.brand;
    if (brand && recent) {
      const name = brandName(brand);
      const was = brands.get(name);
      if (!was) brands.set(name, { count: recent, brand, sender });
      else {
        was.count += recent;
        if (recent > sender.messages.length - recent) was.sender = sender;
      }
    }
  }
  for (const record of Object.values(ctx.settings.quarantinedSenders)) {
    const i = dayIndex(record.at, today);
    if (i >= 0) held[i] += record.messageIds.length;
  }
  return { scams, warnings, held, brands };
}

/** Draws the Threats chart and the faked brands into `#sec-trend`. */
export function renderSecurityTrend(senders: readonly SenderSummary[], openSender: (key: string) => void): void {
  const root = document.getElementById("sec-trend");
  if (!root) return;
  const now = Date.now();
  const t = securityTrend(senders, now);
  const series: ChartSeries[] = [
    { key: "scams", label: "Scams", color: "#ff453a", counts: t.scams },
    { key: "warnings", label: "Warnings", color: "#ff9f0a", counts: t.warnings },
    { key: "held", label: "Held", color: "#bf5af2", counts: t.held },
  ];
  const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
  const total = sum(t.scams) + sum(t.warnings) + sum(t.held);

  const chartCard = el("section", "ov-card sec-chart");
  const head = el("div", "mr-head");
  head.append(el("h2", "mr-title", "Threats"), el("span", "mr-range", `Last ${DAYS} days`));
  const chart = dayChart(series, now);
  const body = el("div", "mr-body");
  const top = [...t.brands.values()].sort((a, b) => b.count - a.count);
  body.append(
    chartStats([
      ["Total", total.toLocaleString()],
      ["Per week", Math.round(total / (DAYS / 7)).toLocaleString()],
      ...(top[0] ? [["Most faked", brandName(top[0].brand)] as [string, string]] : []),
    ]),
    chart,
  );
  chartCard.append(head, body, chartLegend(series, chart));

  const brandCard = el("section", "ov-card ov-top10 sec-brands");
  const bhead = el("div", "mr-head");
  bhead.append(el("h2", "mr-title", "Who they pretend to be"), el("span", "mr-range", `Last ${DAYS} days`));
  brandCard.append(bhead);
  if (top.length === 0) brandCard.append(el("p", "ov-empty", "No one is pretending to be a company you know."));
  else {
    const list = el("ol", "t10-list");
    const max = top[0].count;
    for (const b of top.slice(0, 5)) {
      const name = brandName(b.brand);
      const li = el("li");
      const row = el("button", "t10-row");
      row.type = "button";
      row.setAttribute("aria-label", `${name}: open the emails`);
      row.onclick = () => openSender(b.sender.key);
      const who = el("span", "t10-who");
      const bar = el("i", "t10-bar");
      bar.style.width = `${Math.max(4, (b.count / max) * 100)}%`;
      who.append(el("span", "t10-name", name), bar);
      const domain = brandHomeDomain(b.brand);
      row.append(
        domain ? senderTile(`no-reply@${domain}`, name, "sz-30") : senderTile(b.sender.address, name, "sz-30"),
        who,
        el("span", "t10-n", b.count.toLocaleString()),
      );
      li.append(row);
      list.append(li);
    }
    brandCard.append(list);
  }
  root.replaceChildren(chartCard, brandCard);
}
