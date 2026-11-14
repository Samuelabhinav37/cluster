import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

/** "0.1.0 (584ddec* 2026-11-14 15:50)": * means uncommitted changes. Shown on
 * chrome://extensions and in Settings, so a build Chrome never reloaded is visible. */
function buildStamp(): string {
  let sha = "dev";
  try {
    sha = execSync("git rev-parse --short HEAD").toString().trim();
    if (execSync("git status --porcelain --untracked-files=no").toString().trim()) sha += "*";
  } catch {
    // No git (a source zip): keep "dev".
  }
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  const at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${manifest.version} (${sha} ${at})`;
}

const BUILD = buildStamp();

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [crx({ manifest: { ...manifest, version_name: BUILD } })],
  build: {
    rollupOptions: {
      input: {
        dashboard: "src/dashboard/index.html",
      },
    },
  },
});
