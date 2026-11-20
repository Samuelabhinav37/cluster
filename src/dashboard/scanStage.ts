// The first read, shown like a file copy (docs/ui-glitch-plan-2026-11-18.md,
// Step 1b). On the left the untangle cube (untangleCube.ts): a scrambled cube
// in thin isometric lines that turns itself solved as the mail is read. On the right
// what a copy window says: percent, a bar, emails and time left, what's being
// read now, the speed, and senders found. Motion is CSS only and stops under
// prefers-reduced-motion. Everything shown comes from the read itself.

import { senderTile } from "./senderTile";
import { SETUP_SHARE, sharedCube } from "./untangleCube";

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

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
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
  // The cube from setup's scan, carrying on where it left off.
  const cube = sharedCube();
  card.append(cube.el);
  // Take the cube back the moment this card comes on screen (after setup, under the tour),
  // not at the next progress update, so the card is never an empty box.
  if (typeof IntersectionObserver === "function")
    new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting) && cube.el.parentNode !== card) card.append(cube.el);
    }).observe(card);

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
      // The cube is shared (the sidebar card borrows it on other pages): take it back while on screen.
      // Only while visible: drawn behind setup, it must not take the cube from setup's scan.
      if (root.offsetParent !== null && cube.el.parentNode !== card) card.append(cube.el);
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
      // Each phase counts from 0 again (the quick count hits "150 of 150" in a
      // second), so the cube spends its turns across the phases and only
      // solves once labels go on.
      if (label === "Reading your mail") cube.progress(SETUP_SHARE + share * (0.7 - SETUP_SHARE));
      else if (label === "Reading your sent mail") cube.progress(0.7 + share * 0.2);
      else if (label === "Putting labels on your inbox") cube.progress(1);
      if (s.latest && s.latest.address !== lastWho) {
        lastWho = s.latest.address;
        const month = MONTH.format(s.latest.receivedAt);
        const name = s.latest.name || s.latest.address;
        const words = Object.assign(document.createElement("span"), { textContent: `${name} · ${month}` });
        nowWho.replaceChildren(senderTile(s.latest.address, s.latest.name, "sz-26"), words);
      }
      speedDd.textContent = rate > 0 ? `${Math.round(rate)} ${Math.round(rate) === 1 ? "email" : "emails"} a second` : "";
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
