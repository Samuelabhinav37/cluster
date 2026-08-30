// Regenerates the Cluster logo mark and the extension icon PNGs.
//
//   npm i -D sharp        # one-off, not kept in package.json
//   node scripts/gen-logo.mjs
//
// Outputs:
//   icons/cluster-logo.svg          white mark, transparent background
//   public/icons/icon-{16,32,48,128}.png   mark on a dark rounded tile (toolbar)
//
// The mark: six rounded hexagon nodes in a ring (lock, folder, shield, G,
// shield, G), connected around the ring and inward to a central envelope with
// a sync arc. Derived from the blueprint concept art, stripped to clean vector.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const S = 256;
const CX = S / 2;
const CY = S / 2;
const R_RING = 84; // node-centre distance from canvas centre
const R_NODE = 30; // node centre to vertex (pointy-top hexagon)
const NODE_ROUND = 6; // corner rounding on the hexagons
const BAR = 9; // connector stroke width
const STUB = 12; // length of the inward nub poking from each node

const deg = (d) => (d * Math.PI) / 180;

// Node centres, clockwise from top.
const ANGLES = [-90, -30, 30, 90, 150, 210];
const nodes = ANGLES.map((a) => ({
  x: CX + R_RING * Math.cos(deg(a)),
  y: CY + R_RING * Math.sin(deg(a)),
}));

function roundedHexPath(cx, cy, r, round) {
  // Pointy-top hexagon, vertices every 60deg starting at -90.
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

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};
const fmt = (p) => `${round2(p[0])},${round2(p[1])}`;
const round2 = (n) => Math.round(n * 100) / 100;

// --- glyphs, each drawn inside a node, ~26px box, as chunky white shapes ---
function glyph(kind, cx, cy) {
  const g = (inner) => `<g transform="translate(${round2(cx)} ${round2(cy)})" fill="#0d0d0f">${inner}</g>`;
  switch (kind) {
    case "lock":
      return g(
        `<rect x="-9" y="-1" width="18" height="14" rx="3"/>` +
          `<path d="M -6 -1 v -5 a 6 6 0 0 1 12 0 v 5" fill="none" stroke="#0d0d0f" stroke-width="3.4"/>`,
      );
    case "folder":
      return g(
        `<path d="M -11 -8 h 7 l 3 3 h 12 a 2.5 2.5 0 0 1 2.5 2.5 v 10 a 2.5 2.5 0 0 1 -2.5 2.5 h -22 a 2.5 2.5 0 0 1 -2.5 -2.5 v -13 a 2.5 2.5 0 0 1 2.5 -2.5 z"/>`,
      );
    case "shield":
      return g(`<path d="M 0 -11 l 10 4 v 8 c 0 7 -5 11 -10 13 c -5 -2 -10 -6 -10 -13 v -8 z"/>`);
    case "g":
      return g(
        `<path d="M 11 -3 a 12 12 0 1 0 1 9 h -9 v -5.4 h 14.4" fill="none" stroke="#0d0d0f" stroke-width="4.2"/>`,
      );
    default:
      return "";
  }
}

const NODE_KINDS = ["lock", "folder", "shield", "g", "shield", "g"];

// --- central envelope ---
const ENV_W = 84;
const ENV_H = 56;
const envelope = () => {
  const x = CX - ENV_W / 2;
  const y = CY - ENV_H / 2 + 2;
  return (
    `<g>` +
    // dark "moat" so the white body separates from the connector nubs behind it
    `<rect x="${x - 6}" y="${y - 6}" width="${ENV_W + 12}" height="${ENV_H + 12}" rx="12" fill="#0d0d0f"/>` +
    // envelope body
    `<rect x="${x}" y="${y}" width="${ENV_W}" height="${ENV_H}" rx="8" fill="#fff"/>` +
    // flap, cut as a dark hole
    `<path d="M ${x + 4} ${y + 4} L ${CX} ${y + ENV_H / 2 + 2} L ${x + ENV_W - 4} ${y + 4}" fill="none" stroke="#0d0d0f" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</g>`
  );
};

// --- connectors: ring edges + short inward nubs, behind the nodes ---
function connectors() {
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
  return (
    `<path d="${ring}" stroke="#fff" stroke-width="${BAR}" stroke-linecap="round"/>` +
    `<path d="${stubs}" stroke="#fff" stroke-width="${BAR}" stroke-linecap="round"/>`
  );
}

function buildSvg({ tile }) {
  const marks =
    connectors() +
    nodes
      .map(
        (n, i) =>
          `<path d="${roundedHexPath(n.x, n.y, R_NODE, NODE_ROUND)}" fill="#fff" stroke="#0d0d0f" stroke-width="2.5"/>` +
          glyph(NODE_KINDS[i], n.x, n.y),
      )
      .join("") +
    envelope();

  const bg = tile
    ? `<rect width="${S}" height="${S}" rx="56" fill="#0d0d0f"/>`
    : "";
  const pad = tile ? `<g transform="translate(${S * 0.09} ${S * 0.09}) scale(0.82)">${marks}</g>` : marks;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${bg}${pad}</svg>`;
}

// A reduced mark for tiny sizes: one rounded hexagon holding an envelope.
// The full six-node ring turns to mush below ~32px.
function buildSimpleSvg({ tile }) {
  const r = 108;
  const hex = roundedHexPath(CX, CY, r, 18);
  const w = 96;
  const h = 66;
  const x = CX - w / 2;
  const y = CY - h / 2;
  // dark envelope, solid body + a wedge flap cut back to white, well inside the hex
  const env =
    `<path d="M ${x} ${y + 10} a 10 10 0 0 1 10 -10 h ${w - 20} a 10 10 0 0 1 10 10 v ${h - 20} a 10 10 0 0 1 -10 10 h ${-(w - 20)} a 10 10 0 0 1 -10 -10 z" fill="#0d0d0f"/>` +
    `<path d="M ${x + 4} ${y + 6} L ${CX} ${y + h / 2 - 2} L ${x + w - 4} ${y + 6} L ${x + w - 4} ${y - 4} L ${x + 4} ${y - 4} Z" fill="#fff"/>` +
    `<path d="M ${x + 4} ${y + 6} L ${CX} ${y + h / 2 - 2} L ${x + w - 4} ${y + 6}" fill="none" stroke="#0d0d0f" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`;
  const bg = tile ? `<rect width="${S}" height="${S}" rx="56" fill="#0d0d0f"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${bg}<path d="${hex}" fill="#fff"/>${env}</svg>`;
}

mkdirSync(resolve(root, "icons"), { recursive: true });
writeFileSync(resolve(root, "icons/cluster-logo.svg"), buildSvg({ tile: false }) + "\n");
writeFileSync(resolve(root, "icons/cluster-mark.svg"), buildSimpleSvg({ tile: false }) + "\n");
console.log("wrote icons/cluster-logo.svg, icons/cluster-mark.svg");

// rasterize the dark-tile icons: full mark at 48/128, reduced mark at 16/32
const sharp = (await import("sharp")).default;
const fullTile = Buffer.from(buildSvg({ tile: true }));
const simpleTile = Buffer.from(buildSimpleSvg({ tile: true }));
mkdirSync(resolve(root, "public/icons"), { recursive: true });
for (const [size, src] of [
  [16, simpleTile],
  [32, simpleTile],
  [48, fullTile],
  [128, fullTile],
]) {
  await sharp(src, { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, `public/icons/icon-${size}.png`));
  console.log(`wrote public/icons/icon-${size}.png`);
}
