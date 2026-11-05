// Overview charts (approved mockup research/2026-11-05-redesign-mockup.html).
// Each returns an element. The SVG strings hold only numbers and fixed words,
// never mail data, so building them as markup is safe.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu" … "Today" for the last seven days, today last. */
export function dayLabels(now: number): string[] {
  const today = new Date(now).getDay();
  return Array.from({ length: 7 }, (_, i) => (i === 6 ? "Today" : DAY_NAMES[(today - 6 + i + 7) % 7]));
}

const div = (cls: string, html = ""): HTMLDivElement => {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  return d;
};

/** Catmull-Rom through the points, as cubic Bézier segments. */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c = (a: number) => a.toFixed(1);
    d += `C${c(p1[0] + (p2[0] - p0[0]) / 6)},${c(p1[1] + (p2[1] - p0[1]) / 6)} ${c(p2[0] - (p3[0] - p1[0]) / 6)},${c(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

let gid = 0;

/** This week as a filled curve over last week's pale area; hover shows the day's count. */
export function areaChart(cur: number[], prev: number[], days: string[], unit: string): HTMLElement {
  const id = `ova${++gid}`, W = 300, H = 150;
  const max = Math.max(10, Math.ceil(Math.max(...cur, ...prev) / 10) * 10);
  const xy = (a: number[]) => a.map((v, i) => [+((i * W) / (a.length - 1)).toFixed(1), +(H - (v / max) * (H - 10)).toFixed(1)] as [number, number]);
  const fill = (c: [number, number][]) => `${smooth(c)}L${W},${H}L0,${H}Z`;
  const grid = [0, 0.5, 1].map((f) => `<line x1="0" x2="${W}" y1="${H - f * (H - 10)}" y2="${H - f * (H - 10)}" class="ov-grid"/>`).join("");
  const root = div("ov-area", `<div class="ov-yax"><span>${max}</span><span>${max / 2}</span><span>0</span></div>
    <div class="ov-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${fill(xy(prev))}" class="ov-prev"/><path d="${fill(xy(cur))}" fill="url(#${id})"/><path d="${smooth(xy(cur))}" class="ov-line"/>
    </svg><span class="ov-guide"></span><span class="ov-knob"></span><span class="ov-tip"></span></div>
    <div class="ov-xax">${days.map((d) => `<span>${d}</span>`).join("")}</div>`);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `${unit} each day: ${cur.join(", ")}`);
  const plot = root.querySelector<HTMLElement>(".ov-plot")!;
  const show = (i: number) => {
    const x = (i / (cur.length - 1)) * 100, y = (1 - (cur[i] / max) * ((H - 10) / H)) * 100;
    root.classList.add("hov");
    for (const sel of [".ov-guide", ".ov-knob", ".ov-tip"]) root.querySelector<HTMLElement>(sel)!.style.left = `${x}%`;
    root.querySelector<HTMLElement>(".ov-knob")!.style.top = `${y}%`;
    const tip = root.querySelector<HTMLElement>(".ov-tip")!;
    tip.style.top = `${y}%`;
    const day = document.createElement("small");
    day.textContent = days[i];
    tip.replaceChildren(day, `${cur[i]} ${unit}`);
  };
  plot.onmousemove = (e) => {
    const r = plot.getBoundingClientRect();
    if (r.width > 0) show(Math.round(((e.clientX - r.left) / r.width) * (cur.length - 1)));
  };
  plot.onmouseleave = () => root.classList.remove("hov");
  return root;
}

/** Thin line for this week, last week dashed behind it. */
export function lineChart(cur: number[], prev: number[], days: string[]): HTMLElement {
  const max = Math.max(1, ...cur, ...prev), W = 300, H = 128;
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${((i * W) / (a.length - 1)).toFixed(1)},${(H - (v / max) * (H - 8)).toFixed(1)}`).join("");
  const root = div("ov-line-chart", `<span class="ov-ymax">${max}</span><span class="ov-ymin">0</span>
    <svg viewBox="0 0 ${W} ${H + 2}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${H}" y2="${H}" class="ov-base"/>
    <path d="${path(prev)}" class="ov-dash"/><path d="${path(cur)}" class="ov-line"/></svg>
    <div class="ov-ax"><span>${days[0]}</span><span>${days[6]}</span></div>`);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Each day: ${cur.join(", ")}`);
  return root;
}

/** Ring with gaps, the total in the middle. */
export function donutChart(parts: Array<[label: string, count: number, color: string]>, middle: string): HTMLElement {
  const total = parts.reduce((a, [, n]) => a + n, 0) || 1, R = 52, C = 2 * Math.PI * R, gap = parts.filter((p) => p[1] > 0).length > 1 ? 4 : 0;
  let off = 0;
  const arcs = parts
    .filter(([, n]) => n > 0)
    .map(([, n, c]) => {
      const len = (n / total) * C;
      const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${c}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 1)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len;
      return a;
    })
    .join("");
  const root = div("ov-donut", `<svg viewBox="0 0 140 140" aria-hidden="true"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--neutral-fill)" stroke-width="20"/>${arcs}</svg><div class="ov-mid"><b></b><span></span></div>`);
  root.querySelector("b")!.textContent = parts.reduce((a, [, n]) => a + n, 0).toLocaleString();
  root.querySelector(".ov-mid span")!.textContent = middle;
  return root;
}

/** Rounded hatched bars per day, today solid with its value. */
export function barChart(vals: number[], days: string[]): HTMLElement {
  const max = Math.max(...vals, 1);
  const root = div("ov-bars", vals
    .map((v, i) => `<div class="ov-b${i === vals.length - 1 ? " on" : ""}"><span class="ov-pill">${v}</span><i style="height:${Math.max((v / max) * 100, 4)}%"></i><small>${days[i]}</small></div>`)
    .join(""));
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Each day: ${vals.join(", ")}`);
  return root;
}

/** A row of small ticks, the first `n / max` of them filled. */
export function ticks(n: number, max: number): HTMLElement {
  const N = 28, on = Math.round((n / Math.max(max, 1)) * N);
  return div("ov-ticks", Array.from({ length: N }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join(""));
}
