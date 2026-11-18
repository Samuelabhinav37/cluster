// The first read, shown like a file copy (docs/ui-glitch-plan-2026-11-18.md,
// Step 1b). On the left an isometric wireframe of a mail stack with a scan
// plane sweeping through it, in the style of sui.io's line drawings: thin grey
// lines, dashed construction lines, one accent colour, mono chips. On the right
// what a copy window says: percent, a bar, emails and time left, what's being
// read now, the speed, and senders found. Motion is CSS only and stops under
// prefers-reduced-motion. Everything shown comes from the read itself.

import { senderTile } from "./senderTile";

export interface ScanState {
  done: number;
  total: number;
  /** What is being read: "Reading your mail", "Reading your sent mail" … */
  label?: string;
  /** The dashboard's time left ("about 6 min left"), empty until it knows. */
  eta?: string;
  /** The newest message in the last batch read. */
  latest?: { name: string; address: string; receivedAt: number };
  /** Distinct senders read so far. */
  senders?: number;
}

const SVG = "http://www.w3.org/2000/svg";
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
/** Isometric projection: x right-back, y left-back, z up. */
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * COS, (x + y) * SIN - z];
const pt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
/** A flat rhombus at height z, w by d. */
const rhombus = (w: number, d: number, z: number) =>
  `M${pt(iso(0, 0, z))}L${pt(iso(w, 0, z))}L${pt(iso(w, d, z))}L${pt(iso(0, d, z))}Z`;

const SHEETS = 9;
const W = 120;
const D = 84;
const GAP = 13;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** The scene: a base grid, a stack of mail sheets, a scan plane and two chips. */
function scene(): { svg: SVGSVGElement; chipTop: SVGTextElement; chipBase: SVGTextElement } {
  const svg = el("svg", { viewBox: "-190 -175 380 320", class: "scn-scene", "aria-hidden": "true" });
  const base = el("g", { class: "scn-base" });
  // Construction grid on the floor, wider than the stack.
  for (let i = -1; i <= 6; i++) {
    const a = iso(i * 24 - 12, -30, 0);
    const b = iso(i * 24 - 12, D + 30, 0);
    base.append(el("path", { d: `M${pt(a)}L${pt(b)}`, class: "scn-dash" }));
  }
  for (let j = -1; j <= 4; j++) {
    const a = iso(-30, j * 24 - 6, 0);
    const b = iso(W + 30, j * 24 - 6, 0);
    base.append(el("path", { d: `M${pt(a)}L${pt(b)}`, class: "scn-dash" }));
  }
  base.append(el("path", { d: rhombus(W, D, 0), class: "scn-floor" }));
  // Corner posts, dashed, like the wireframe box around sui's cubes.
  const top = SHEETS * GAP + 10;
  for (const [x, y] of [[0, 0], [W, 0], [W, D], [0, D]] as const) {
    base.append(el("path", { d: `M${pt(iso(x, y, 0))}L${pt(iso(x, y, top))}`, class: "scn-dash" }));
  }
  svg.append(base);

  const stack = el("g", { class: "scn-stack" });
  for (let i = 0; i < SHEETS; i++) {
    const z = 6 + i * GAP;
    const sheet = el("g", { class: "scn-sheet", style: `--i:${SHEETS - 1 - i}` });
    sheet.append(el("path", { d: rhombus(W, D, z), class: "scn-paper" }));
    // The envelope flap: two lines from the back corners to the middle.
    const mid = iso(W / 2, D * 0.55, z);
    sheet.append(el("path", { d: `M${pt(iso(0, 0, z))}L${pt(mid)}L${pt(iso(W, 0, z))}`, class: "scn-flap" }));
    stack.append(sheet);
  }
  svg.append(stack);

  // The scan plane: an outline and a glow under it, moving down the stack.
  const plane = el("g", { class: "scn-plane", style: `--travel:${(SHEETS - 1) * GAP}px` });
  plane.append(el("path", { d: rhombus(W + 16, D + 16, top).replace(/^M/, "M"), class: "scn-glow", transform: `translate(${pt(iso(-8, -8, 0))})` }));
  plane.append(el("path", { d: rhombus(W + 16, D + 16, top), class: "scn-ring", transform: `translate(${pt(iso(-8, -8, 0))})` }));
  svg.append(plane);

  const chip = (x: number, y: number, anchor: string) => {
    const g = el("g", { class: "scn-chip" });
    const text = el("text", { x, y, "text-anchor": anchor });
    g.append(text);
    return { g, text };
  };
  const t = chip(...iso(-14, D + 4, top - 4), "end");
  const b = chip(...iso(W + 14, 4, 0), "start");
  svg.append(t.g, b.g);
  return { svg, chipTop: t.text, chipBase: b.text };
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

export interface ScanStage {
  el: HTMLElement;
  update(state: ScanState): void;
}

/** Builds the stage; `update` it on every progress beat. */
export function scanStage(): ScanStage {
  const root = document.createElement("section");
  root.className = "scan-stage";
  root.setAttribute("aria-label", "Reading your mail");
  const card = document.createElement("div");
  card.className = "scn-card";
  const { svg, chipTop, chipBase } = scene();
  card.append(svg);

  const panel = document.createElement("div");
  panel.className = "scn-panel";
  const pct = Object.assign(document.createElement("div"), { className: "scn-pct" });
  const title = Object.assign(document.createElement("h2"), { className: "scn-title", textContent: "Reading your mail" });
  const track = Object.assign(document.createElement("div"), { className: "scn-track read-track" });
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Emails read");
  const fill = document.createElement("i");
  track.append(fill);
  const line = Object.assign(document.createElement("p"), { className: "scn-line" });
  line.setAttribute("role", "status");
  const now = Object.assign(document.createElement("div"), { className: "scn-now" });
  const nowLabel = Object.assign(document.createElement("span"), { className: "scn-k", textContent: "Now reading" });
  const nowWho = Object.assign(document.createElement("span"), { className: "scn-who" });
  now.append(nowLabel, nowWho);
  const facts = Object.assign(document.createElement("dl"), { className: "scn-facts" });
  const speedDd = document.createElement("dd");
  const sendersDd = document.createElement("dd");
  const spark = el("svg", { viewBox: "0 0 120 28", class: "scn-spark", "aria-hidden": "true", preserveAspectRatio: "none" });
  const sparkLine = el("polyline", { points: "" });
  spark.append(sparkLine);
  const speedDt = Object.assign(document.createElement("dt"), { textContent: "Speed" });
  const sendersDt = Object.assign(document.createElement("dt"), { textContent: "Senders found" });
  facts.append(
    speedDt,
    speedDd,
    sendersDt,
    sendersDd,
  );
  const speedBox = document.createElement("div");
  speedBox.className = "scn-speed";
  speedBox.append(facts, spark);
  panel.append(pct, title, track, line, now, speedBox);
  root.append(card, panel);

  // Speed from the last few beats, so one slow batch doesn't swing the estimate.
  const samples: Array<[number, number]> = [];
  const rates: number[] = [];
  let lastWho = "";

  return {
    el: root,
    update(s) {
      const t = Date.now();
      samples.push([t, s.done]);
      while (samples.length > 2 && t - samples[0][0] > 15_000) samples.shift();
      const [t0, d0] = samples[0];
      const rate = t > t0 ? ((s.done - d0) / (t - t0)) * 1000 : 0;
      if (rate > 0) {
        rates.push(rate);
        if (rates.length > 30) rates.shift();
      }
      const counting = s.done < s.total;
      const label = s.label ?? "Reading your mail";
      const share = s.total > 0 ? Math.min(1, s.done / s.total) : 0;
      title.textContent = label;
      pct.textContent = counting ? `${Math.floor(share * 100)}%` : "";
      fill.style.width = `${(share * 100).toFixed(1)}%`;
      // Between phases "150 of 150" looks finished: hide the count; a step with
      // no count (labelling) keeps a moving bar so it never looks stuck.
      const busy = !counting && label !== "Reading your mail";
      track.hidden = !counting && !busy;
      track.classList.toggle("is-busy", busy);
      track.setAttribute("aria-valuenow", String(s.done));
      track.setAttribute("aria-valuemax", String(Math.max(s.done, s.total)));
      line.textContent = counting ? [`${s.done.toLocaleString()} of ${s.total.toLocaleString()} emails`, s.eta].filter(Boolean).join(" · ") : "";
      chipBase.textContent = counting ? `${s.done.toLocaleString()} / ${s.total.toLocaleString()}` : "";
      if (s.latest && s.latest.address !== lastWho) {
        lastWho = s.latest.address;
        const month = MONTH.format(s.latest.receivedAt);
        const name = s.latest.name || s.latest.address;
        const words = Object.assign(document.createElement("span"), { textContent: `${name} · ${month}` });
        nowWho.replaceChildren(senderTile(s.latest.address, s.latest.name, "sz-26"), words);
        chipTop.textContent = `${name.toUpperCase().slice(0, 22)} · ${month.toUpperCase()}`;
      }
      speedDd.textContent = rate > 0 ? `${Math.round(rate)} emails a second` : "";
      sendersDd.textContent = s.senders ? s.senders.toLocaleString() : "";
      // A row with no number yet stays out of sight rather than showing a blank.
      speedDt.hidden = speedDd.hidden = !speedDd.textContent;
      sendersDt.hidden = sendersDd.hidden = !sendersDd.textContent;
      spark.style.visibility = rates.length > 1 ? "" : "hidden";
      now.hidden = !lastWho;
      const max = Math.max(1, ...rates);
      sparkLine.setAttribute(
        "points",
        rates.map((r, i) => `${((i / 29) * 120).toFixed(1)},${(26 - (r / max) * 24).toFixed(1)}`).join(" "),
      );
    },
  };
}
