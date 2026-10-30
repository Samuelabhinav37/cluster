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
import { companyForDomain, companyLogo, type RegistryCompany } from "../lib/brandRegistry";

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

/** The certified company behind an address, if a mark certificate names its domain. */
export function certifiedCompany(address: string): RegistryCompany | undefined {
  const company = companyForDomain(domainOf(address));
  return company?.trust === "certified" ? company : undefined;
}

/** The small check that marks a verified sender. */
export function verifiedTick(): HTMLElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "verified-tick");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Verified");
  for (const d of [
    "M12 2.5 14.6 5l3.5-.4.8 3.4 3 1.9-1.4 3.2 1.4 3.2-3 1.9-.8 3.4-3.5-.4L12 21.5 9.4 19l-3.5.4-.8-3.4-3-1.9 1.4-3.2L2.1 9.9l3-1.9.8-3.4 3.5.4z",
    "m8.5 12 2.5 2.5 4.5-5",
  ]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg as unknown as HTMLElement;
}

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

  // A certified company's own logo, from its mark certificate (brand-logos.json).
  const company = certifiedCompany(address);
  if (company?.logo) {
    tile.classList.add("has-favicon", "certified");
    mono.style.opacity = "0";
    tile.appendChild(mono);
    const img = Object.assign(document.createElement("img"), { className: "logo-img", alt: "" });
    tile.appendChild(img);
    void companyLogo(company).then((svg) => {
      if (svg) img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      else {
        img.remove();
        tile.classList.remove("has-favicon", "certified");
        paintMonogram();
      }
    });
    return tile;
  }

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
  const fallBack = () => {
    img.remove();
    tile.classList.remove("has-favicon");
    paintMonogram();
  };
  img.addEventListener("error", fallBack);
  // The favicon service answers an unknown site with a 16px globe; a letter reads better.
  img.addEventListener("load", () => {
    if (img.naturalWidth <= 16) fallBack();
  });
  tile.appendChild(img);

  return tile;
}
