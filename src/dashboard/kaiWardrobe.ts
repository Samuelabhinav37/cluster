// Hats and glasses for Kai (2026-11-20 review: "more engaging"). Drawn as one
// SVG over Kai's head in the head image's own units (1000 x 968.6, eyes at
// x 343 and 655, y 443), so they move, tilt and squash with it. Each piece
// drops on with a small bounce (dashboard.css, .kai-wear). Kai wears them for
// a moment: reading glasses while it reads your mail, a party hat at the end.
import type { KaiInstance } from "./kai/kaiLife";

export type KaiHat = "party" | "beanie" | "crown";
export type KaiGlasses = "round" | "shades";

const NS = "http://www.w3.org/2000/svg";

const HATS: Record<KaiHat, string> = {
  // A striped cone tipped to one side, so the antenna still shows.
  party: `<g transform="rotate(-20 300 60)"><path d="M170 70 300 -300 430 70Z" fill="#f5f5f7"/><path d="M226 -90 374 -90 400 -10 200 -10ZM272 -220 328 -220 350 -160 250 -160Z" fill="#1c1c1f"/><path d="M150 60h300a14 14 0 0 1 0 28H150a14 14 0 0 1 0-28z" fill="#d4d4d8"/><circle cx="300" cy="-312" r="40" fill="#fff"/></g>`,
  // A knit beanie over the top of the head; the antenna pokes out.
  beanie: `<path d="M70 150Q70 -170 500 -170T930 150Z" fill="#3a3a41"/><path d="M200 -90v220M330 -140v270M500 -160v290M670 -140v270M800 -90v220" stroke="#2c2c31" stroke-width="18" stroke-linecap="round"/><rect x="50" y="80" width="900" height="120" rx="48" fill="#52525b"/><path d="M110 140h780" stroke="#3f3f46" stroke-width="10" stroke-dasharray="4 30" stroke-linecap="round"/>`,
  // A small gold crown, a bit to one side.
  crown: `<g transform="rotate(-10 500 40)"><path d="M300 70 280 -110 390 -20 500 -150 610 -20 720 -110 700 70Z" fill="#e8c66a" stroke="#b8923a" stroke-width="12" stroke-linejoin="round"/><circle cx="500" cy="-150" r="26" fill="#f5f5f7"/><circle cx="280" cy="-110" r="20" fill="#f5f5f7"/><circle cx="720" cy="-110" r="20" fill="#f5f5f7"/></g>`,
};

const GLASSES: Record<KaiGlasses, string> = {
  // Round reading glasses: thin light frames, clear lenses.
  round: `<g fill="rgba(255,255,255,.07)" stroke="#e4e4e7" stroke-width="20"><circle cx="343" cy="450" r="132"/><circle cx="655" cy="450" r="132"/></g><path d="M475 440q24-22 48 0M211 430 90 395M787 430l123-35" fill="none" stroke="#e4e4e7" stroke-width="20" stroke-linecap="round"/>`,
  // Black shades that hide the eyes; a white glint on each lens.
  shades: `<g fill="#0a0a0b" stroke="#2a2a2e" stroke-width="14"><rect x="190" y="360" width="300" height="190" rx="70"/><rect x="510" y="360" width="300" height="190" rx="70"/></g><path d="M490 420h20M190 400 90 380M810 400l100-20" stroke="#2a2a2e" stroke-width="22" stroke-linecap="round"/><path d="M240 405l60-30M560 405l60-30" stroke="#fff" stroke-opacity=".55" stroke-width="18" stroke-linecap="round"/>`,
};

function layer(kai: KaiInstance, slot: "hat" | "glasses"): SVGSVGElement | null {
  const head = kai.root.querySelector(".kai-head");
  if (!head) return null;
  let svg = head.querySelector<SVGSVGElement>(`.kai-wear.is-${slot}`);
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", `kai-wear is-${slot}`);
    svg.setAttribute("viewBox", "0 0 1000 968.6");
    svg.setAttribute("aria-hidden", "true");
    head.append(svg);
  }
  return svg;
}

function put(kai: KaiInstance | null, slot: "hat" | "glasses", markup: string | null): void {
  if (!kai) return;
  const svg = layer(kai, slot);
  if (!svg) return;
  if (!markup) {
    svg.classList.remove("on");
    return;
  }
  // Static markup from this file only; parsed as SVG, never assigned as HTML.
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${markup}</svg>`, "image/svg+xml");
  svg.replaceChildren(...Array.from(doc.documentElement.childNodes, (n) => document.importNode(n, true)));
  svg.classList.remove("on");
  void svg.getBoundingClientRect(); // restart the drop-on
  svg.classList.add("on");
}

/** Puts a hat on Kai, or takes it off with null. */
export const wearHat = (kai: KaiInstance | null, hat: KaiHat | null) => put(kai, "hat", hat && HATS[hat]);
/** Puts glasses on Kai, or takes them off with null. */
export const wearGlasses = (kai: KaiInstance | null, glasses: KaiGlasses | null) => put(kai, "glasses", glasses && GLASSES[glasses]);

const CLOSET: Array<() => [KaiHat | null, KaiGlasses | null]> = [
  () => ["beanie", null],
  () => ["crown", null],
  () => ["party", null],
  () => [null, null],
];

/** Clicking Kai tries on the next outfit, with a hop and a pleased face. */
export function dressUpOnClick(kai: KaiInstance | null): void {
  if (!kai) return;
  let at = 0;
  kai.root.style.cursor = "pointer";
  kai.root.addEventListener("click", () => {
    const [hat, glasses] = CLOSET[at++ % CLOSET.length]();
    wearHat(kai, hat);
    wearGlasses(kai, glasses);
    kai.do("hop");
    kai.setMood(glasses === "shades" ? "smug" : hat ? "proud" : "happy", 1600);
  });
}
