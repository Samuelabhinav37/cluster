// The one shared sender-tile builder for the redesigned dashboard.
//
// Renders a rounded tile with the sender-domain favicon layered over a
// coloured monogram: the monogram (from senderLogos.logoFor, no network) is
// always present underneath, and the <img> covers it once it loads. Any
// favicon failure — offline, 404, blocked — just removes the <img> and the
// monogram shows through. This is the only off-origin asset the dashboard
// pulls; see senderLogos.faviconUrl.
import { faviconUrl, logoFor } from "../lib/senderLogos";

export type TileSize = "sz-26" | "sz-30" | "sz-34" | "sz-44";

export function senderTile(
  address: string,
  displayName: string | undefined,
  size: TileSize = "sz-34",
): HTMLElement {
  const logo = logoFor(address, displayName);
  const tile = document.createElement("span");
  tile.className = `logo-tile ${size}`;
  tile.style.background = logo.background;
  tile.style.color = logo.foreground;
  tile.setAttribute("aria-hidden", "true");

  const mono = document.createElement("span");
  mono.className = "logo-mono";
  mono.textContent = logo.monogram;
  tile.appendChild(mono);

  const url = faviconUrl(address);
  if (url) {
    const img = document.createElement("img");
    img.className = "logo-img";
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    // Google returns a generic globe for unknown domains at 200 OK, so we
    // can't distinguish "real logo" from "placeholder" — that's fine, a globe
    // still reads better than nothing. Only a genuine load error falls back.
    img.addEventListener("error", () => img.remove());
    tile.appendChild(img);
  }

  return tile;
}
