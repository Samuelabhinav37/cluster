// Bundle-size budget for the built extension. Run after `npm run build`
// (`npm run check:bundle` does both). Fails if a context's JavaScript grows
// past its budget, so an accidental heavy import shows up in review rather
// than as a slower service-worker wake or dashboard open.
//
// What each context loads (Vite/crxjs output, see dist/manifest.json and
// dist/src/dashboard/index.html):
//   service worker → service-worker-loader.js → background chunk → shared chunk
//   dashboard      → dashboard chunk + shared chunk + dashboard CSS
// The shared chunk is named after one of its modules (currently
// engagementModel) but holds everything both contexts import, including the
// bundled spam-domain list.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(fileURLToPath(new URL(".", import.meta.url)), "../dist");
const assets = join(dist, "assets");

const KB = 1024;
// Raw (uncompressed) bytes: extension files are read from disk, not gzipped
// over the wire, so raw size is what parse time scales with. Budgets are
// ~25% above the 2026-10-05 sizes.
const BUDGETS = {
  "service worker JS": 340 * KB,
  "dashboard JS": 500 * KB,
  "dashboard CSS": 50 * KB,
};

function file(name) {
  const path = join(assets, name);
  const buf = readFileSync(path);
  return { name, raw: statSync(path).size, gzip: gzipSync(buf).length, text: buf.toString("utf8") };
}

const files = readdirSync(assets).map(file);
const find = (prefix, ext) => files.find((f) => f.name.startsWith(prefix) && f.name.endsWith(ext));
const background = find("background", ".js");
const dashboard = files.find((f) => /^dashboard-.*\.js$/.test(f.name));
const css = find("dashboard", ".css");
if (!background || !dashboard || !css) {
  console.error("check-bundle: expected background/dashboard chunks in dist/assets — run `npm run build` first.");
  process.exit(1);
}

// Chunks the entry chunks import statically.
const importsOf = (f) =>
  [...f.text.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)].map((m) => files.find((x) => x.name === m[1])).filter(Boolean);

const contexts = {
  "service worker JS": [background, ...importsOf(background)],
  "dashboard JS": [dashboard, ...importsOf(dashboard)],
  "dashboard CSS": [css],
};

let failed = false;
for (const [name, parts] of Object.entries(contexts)) {
  const raw = parts.reduce((s, p) => s + p.raw, 0);
  const gzip = parts.reduce((s, p) => s + p.gzip, 0);
  const budget = BUDGETS[name];
  const ok = raw <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name.padEnd(18)} ${(raw / KB).toFixed(1).padStart(7)} KB raw  ${(gzip / KB)
      .toFixed(1)
      .padStart(6)} KB gzip  (budget ${(budget / KB).toFixed(0)} KB)  ← ${parts.map((p) => p.name).join(" + ")}`,
  );
}
process.exit(failed ? 1 : 0);
