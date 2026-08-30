// Regenerates the Cluster logo mark and the extension icon PNGs.
//
//   npm i -D sharp        # one-off, not kept in package.json
//   node scripts/gen-logo.mjs
//
// Outputs:
//   icons/cluster-logo.svg   full mark, single-colour (currentColor), transparent
//   icons/cluster-mark.svg   reduced mark (one hexagon + envelope), for tiny sizes
//   public/icons/icon-{16,32,48,128}.png   transparent, mark in a neutral dark ink
//
// The mark: six rounded hexagon nodes in a ring linked around the perimeter and
// inward to a central envelope (flap cut out with fill-rule evenodd). One flat
// colour, transparent background, so it works on any surface in either theme.
// Distilled from the concept art — the tiny per-node glyphs in the source don't
// survive to 16px, so the ring itself carries the "cluster" idea.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const S = 256;
const CX = S / 2;
const CY = S / 2;
const R_RING = 84; // node-centre distance from canvas centre
const R_NODE = 27; // node centre to vertex (pointy-top hexagon)
const NODE_ROUND = 6; // corner rounding on the hexagons
const BAR = 9; // connector stroke width
const STUB = 10; // length of the inward nub poking from each node
const PNG_INK = "#202124"; // neutral dark ink for the rasterised toolbar icons

const deg = (d) => (d * Math.PI) / 180;
const round2 = (n) => Math.round(n * 100) / 100;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};
const fmt = (p) => `${round2(p[0])},${round2(p[1])}`;

// Node centres, clockwise from top.
const ANGLES = [-90, -30, 30, 90, 150, 210];
const nodes = ANGLES.map((a) => ({
  x: CX + R_RING * Math.cos(deg(a)),
  y: CY + R_RING * Math.sin(deg(a)),
}));

function roundedHexPath(cx, cy, r, round) {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const a = deg(-90 + i * 60);
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let d = "";
  for (let i = 0; i < 6; i++) {
    const p = verts[i];
    const prev = verts[(i + 5) % 6];
    const next = verts[(i + 1) % 6];
    const vIn = norm(sub(p, prev));
    const vOut = norm(sub(next, p));
    const a = [p[0] - vIn[0] * round, p[1] - vIn[1] * round];
    const b = [p[0] + vOut[0] * round, p[1] + vOut[1] * round];
    d += i === 0 ? `M ${fmt(a)} ` : `L ${fmt(a)} `;
    d += `Q ${fmt(p)} ${fmt(b)} `;
  }
  return d + "Z";
}

function rrect(x, y, w, h, r) {
  return (
    `M ${round2(x + r)} ${round2(y)} h ${round2(w - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${r} ` +
    `v ${round2(h - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${r} h ${round2(-(w - 2 * r))} ` +
    `a ${r} ${r} 0 0 1 ${-r} ${-r} v ${round2(-(h - 2 * r))} a ${r} ${r} 0 0 1 ${r} ${-r} Z`
  );
}

// --- central envelope: body + flap notch, one evenodd path ---
const ENV_W = 84;
const ENV_H = 56;
function envelopePath() {
  const x = CX - ENV_W / 2;
  const y = CY - ENV_H / 2 + 2;
  // V-notch cut from the top edge inward: reads as the open flap
  const flap =
    `M ${round2(x + 5)} ${round2(y - 4)} ` +
    `L ${CX} ${round2(y + ENV_H * 0.46)} ` +
    `L ${round2(x + ENV_W - 5)} ${round2(y - 4)} ` +
    `L ${round2(x + ENV_W - 5)} ${round2(y + 6)} ` +
    `L ${CX} ${round2(y + ENV_H * 0.46 + 12)} ` +
    `L ${round2(x + 5)} ${round2(y + 6)} Z`;
  return rrect(x, y, ENV_W, ENV_H, 8) + flap;
}

// --- connectors: ring edges + short inward nubs ---
function connectors(color) {
  let ring = "";
  let stubs = "";
  for (let i = 0; i < 6; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % 6];
    ring += `M ${round2(a.x)} ${round2(a.y)} L ${round2(b.x)} ${round2(b.y)} `;
    const dir = norm([CX - a.x, CY - a.y]);
    const sx = a.x + dir[0] * (R_NODE - 4);
    const sy = a.y + dir[1] * (R_NODE - 4);
    stubs += `M ${round2(sx)} ${round2(sy)} L ${round2(sx + dir[0] * STUB)} ${round2(sy + dir[1] * STUB)} `;
  }
  return `<path d="${ring}${stubs}" stroke="${color}" stroke-width="${BAR}" stroke-linecap="round" fill="none"/>`;
}

function buildSvg(color) {
  const hexes = nodes
    .map((n) => `<path d="${roundedHexPath(n.x, n.y, R_NODE, NODE_ROUND)}"/>`)
    .join("");
  const ns =
    connectors(color) +
    `<g fill="${color}">${hexes}</g>` +
    `<path d="${envelopePath()}" fill="${color}" fill-rule="evenodd"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${ns}</svg>`;
}

// Reduced mark for tiny sizes: one hexagon with the envelope cut out of it.
function buildMarkSvg(color) {
  const r = 112;
  const w = 118;
  const h = 80;
  const x = CX - w / 2;
  const y = CY - h / 2;
  const flap = `M ${x + 6} ${y + 8} L ${CX} ${round2(y + h * 0.52)} L ${x + w - 6} ${y + 8} L ${x + w - 6} ${y - 6} L ${x + 6} ${y - 6} Z`;
  const d = `${roundedHexPath(CX, CY, r, 20)} ${rrect(x, y, w, h, 12)} ${flap}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><path d="${d}" fill="${color}" fill-rule="evenodd"/></svg>`;
}

mkdirSync(resolve(root, "icons"), { recursive: true });
writeFileSync(resolve(root, "icons/cluster-logo.svg"), buildSvg("currentColor") + "\n");
writeFileSync(resolve(root, "icons/cluster-mark.svg"), buildMarkSvg("currentColor") + "\n");
console.log("wrote icons/cluster-logo.svg, icons/cluster-mark.svg");

const sharp = (await import("sharp")).default;
const fullPng = Buffer.from(buildSvg(PNG_INK));
const markPng = Buffer.from(buildMarkSvg(PNG_INK));
mkdirSync(resolve(root, "public/icons"), { recursive: true });
for (const [size, src] of [
  [16, markPng],
  [32, markPng],
  [48, fullPng],
  [128, fullPng],
]) {
  await sharp(src, { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, `public/icons/icon-${size}.png`));
  console.log(`wrote public/icons/icon-${size}.png`);
}
