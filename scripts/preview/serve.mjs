// Serves the built extension (dist/) on localhost with chrome-stub.js injected
// ahead of the dashboard bundle, so the real UI runs in an ordinary tab
// against a fake mailbox. `npm run preview:ui` builds first, then runs this.
// See the header of chrome-stub.js for the query flags.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(here, "../../dist");
const stubPath = join(here, "chrome-stub.js");
const port = Number(process.env.PORT ?? 4599);
const DASHBOARD = "/src/dashboard/index.html";
const STUB_URL = "/__preview/chrome-stub.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(302, { location: `${DASHBOARD}?reset` }).end();
      return;
    }
    if (url.pathname === STUB_URL) {
      res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
      res.end(await readFile(stubPath));
      return;
    }
    const filePath = normalize(join(distDir, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403).end();
      return;
    }
    let body = await readFile(filePath);
    if (url.pathname === DASHBOARD) {
      // darkreader-lock: the Dark Reader extension re-tints ordinary
      // localhost pages (it can't touch the real chrome-extension:// page),
      // which would make the preview lie about the theme.
      body = Buffer.from(
        body
          .toString("utf8")
          .replace(
            "<head>",
            `<head>\n    <meta name="darkreader-lock" />\n    <script src="${STUB_URL}"></script>`,
          ),
      );
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Cluster UI preview: http://127.0.0.1:${port}${DASHBOARD}?reset`);
  console.log("Flags: ?reset ?consent ?deny ?offline ?pinned (see scripts/preview/chrome-stub.js)");
});
