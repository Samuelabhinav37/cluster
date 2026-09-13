// The one shared sender-tile builder for the redesigned dashboard.
//
// Renders a rounded tile showing the sender-domain favicon, with a coloured
// monogram (from senderLogos.logoFor, no network) as the always-available
// fallback underneath. When a favicon is expected the tile starts on a neutral
// ground so there's no colour flip when the image paints; if the image fails
// (offline, 404, blocked) it's removed and the brand-coloured monogram takes
// over. This is the only off-origin asset the dashboard pulls; see
// senderLogos.faviconUrl.
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
  tile.setAttribute("aria-hidden", "true");

  const mono = document.createElement("span");
  mono.className = "logo-mono";
  mono.textContent = logo.monogram;

  const paintMonogram = () => {
    tile.style.background = logo.background;
    tile.style.color = logo.foreground;
    mono.style.opacity = "1";
  };

  // 128px source so the small tiles stay crisp on HiDPI displays.
  const url = faviconUrl(address, 128);
  if (!url) {
    tile.appendChild(mono);
    paintMonogram();
    return tile;
  }

  // Favicon path: neutral ground now, monogram hidden but ready as the fallback.
  tile.classList.add("has-favicon");
  mono.style.opacity = "0";
  tile.appendChild(mono);

  const img = document.createElement("img");
  img.className = "logo-img";
  img.src = url;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => {
    img.remove();
    tile.classList.remove("has-favicon");
    paintMonogram();
  });
  tile.appendChild(img);

  return tile;
}
