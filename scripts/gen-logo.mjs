// Regenerates the Cluster logo and the extension icon PNGs.
//
//   npm i --no-save sharp   # one-off, not kept in package.json
//   node scripts/gen-logo.mjs
//
// Outputs:
//   icons/cluster-logo.svg                 the logo, 32x32 viewBox
//   icons/google-consent-logo-120.png      Google sign-in screen logo (120x120, Branding page)
//   public/icons/icon-{16,32,48,128}.png   toolbar and notification icons
//
// The logo is Moat's sibling: Moat's near-black rounded tile and its white
// constellation, drawn Cluster's way. One big white hexagon holds the envelope,
// three smaller grey hexagons hang off it on soft lines. The greys are white
// at Moat's node opacities over the tile, as solid colours, so a node's fill
// and its rounding outline match exactly.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TILE = "#030307";
const LINE = "rgba(255,255,255,.55)";
const r2 = (n) => Math.round(n * 100) / 100;

/** White at `opacity` over the tile, as a solid colour. */
function grey(opacity) {
  const v = (base) => Math.round(255 * opacity + base * (1 - opacity)).toString(16).padStart(2, "0");
  return `#${v(3)}${v(3)}${v(7)}`;
}

/** Pointy-top hexagon of radius r at (x, y); the stroke rounds its corners. */
function hex(x, y, r, fill) {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${r2(x + r * Math.cos(a))},${r2(y + r * Math.sin(a))}`;
  });
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="${r2(r * 0.28)}" stroke-linejoin="round"/>`;
}

/** The envelope, in tile colour, w wide and centred on (x, y). */
function envelope(x, y, w) {
  const h = w * 0.68;
  const l = x - w / 2;
  const t = y - h / 2;
  return (
    `<rect x="${r2(l)}" y="${r2(t)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(w * 0.1)}" fill="${TILE}"/>` +
    `<path d="M${r2(l + w * 0.08)},${r2(t + h * 0.12)} L${r2(x)},${r2(t + h * 0.62)} L${r2(l + w * 0.92)},${r2(t + h * 0.12)}" fill="none" stroke="#fff" stroke-width="${r2(w * 0.12)}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

const line = (a, b) =>
  `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`;

function buildSvg() {
  const lead = [17.5, 15];
  const satellites = [
    { at: [8, 8.5], r: 2.4, opacity: 0.8 },
    { at: [8.5, 23.5], r: 2.0, opacity: 0.66 },
    { at: [25, 25], r: 2.2, opacity: 0.72 },
  ];
  const body =
    satellites.map((s) => line(lead, s.at)).join("") +
    satellites.map((s) => hex(s.at[0], s.at[1], s.r, grey(s.opacity))).join("") +
    hex(lead[0], lead[1], 6.2, "#fff") +
    envelope(lead[0], lead[1] + 0.2, 6.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="geometricPrecision"><rect width="32" height="32" rx="7" fill="${TILE}"/>${body}</svg>`;
}

const svg = buildSvg();
writeFileSync(resolve(root, "icons/cluster-logo.svg"), svg + "\n");
console.log("wrote icons/cluster-logo.svg");

const sharp = (await import("sharp")).default;
const src = Buffer.from(svg);
const outputs = [
  ...[16, 32, 48, 128].map((size) => [size, `public/icons/icon-${size}.png`]),
  [120, "icons/google-consent-logo-120.png"],
];
for (const [size, path] of outputs) {
  await sharp(src, { density: 72 * Math.ceil((size * 4) / 32) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, path));
  console.log(`wrote ${path}`);
}
