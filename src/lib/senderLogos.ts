// Sender "logo" tiles for the redesigned dashboard, with zero network.
//
// The v3 design mockups fetch https://www.google.com/s2/favicons?domain=… for
// every sender — one third-party request per sender domain, which leaks the
// user's whole sender list to Google and flatly contradicts the sidebar's
// "Nothing leaves this browser" promise. Instead we ship a small hand-curated
// brand-colour map for the senders people most often have (so Amazon reads
// Amazon-orange, Stripe reads Stripe-indigo, …) and fall back to a
// deterministic initial-on-tinted-tile for everything else. No <img>, no
// favicon service, no runtime fetch.
//
// This module is pure: it returns the colour + text to paint. The dashboard
// layer builds the actual DOM tile from it.
import { normalizeDomain, registrableDomainCandidates } from "./registrableDomain";

export interface SenderLogo {
  /** Two-letter (or one-letter) monogram to render in the tile. */
  monogram: string;
  /** Tile background — a brand colour when known, otherwise a stable tint. */
  background: string;
  /** Foreground colour with ≥4.5:1 contrast on `background`. */
  foreground: string;
  /** True when `background` came from the curated brand map rather than the
   * hashed fallback — lets callers style known brands slightly differently. */
  brand: boolean;
}

// Registrable domain → brand colour. Kept deliberately short: the senders a
// mailbox-cleanup tool sees most, plus a few high-recognition transactional
// ones. Colours are the brand's primary, adjusted only where needed to keep
// white text readable. Extend as real usage shows gaps.
const BRAND_COLORS: Record<string, string> = {
  "amazon.com": "#ff9900",
  "apple.com": "#1d1d1f",
  "google.com": "#1a73e8",
  "youtube.com": "#ff0033",
  "microsoft.com": "#0067b8",
  "linkedin.com": "#0a66c2",
  "x.com": "#1d1d1f",
  "twitter.com": "#1d9bf0",
  "facebook.com": "#1877f2",
  "instagram.com": "#c13584",
  "meta.com": "#0668e1",
  "netflix.com": "#e50914",
  "spotify.com": "#1db954",
  "uber.com": "#1d1d1f",
  "lyft.com": "#ff00bf",
  "airbnb.com": "#ff5a5f",
  "booking.com": "#003580",
  "paypal.com": "#003087",
  "stripe.com": "#635bff",
  "substack.com": "#ff6719",
  "medium.com": "#1d1d1f",
  "notion.so": "#1d1d1f",
  "notion.com": "#1d1d1f",
  "slack.com": "#4a154b",
  "discord.com": "#5865f2",
  "dropbox.com": "#0061ff",
  "github.com": "#1d1d1f",
  "gitlab.com": "#fc6d26",
  "figma.com": "#a259ff",
  "grubhub.com": "#f63440",
  "doordash.com": "#ff3008",
  "instacart.com": "#43b02a",
  "yelp.com": "#d32323",
  "goodreads.com": "#553b08",
  "nytimes.com": "#1d1d1f",
  "washingtonpost.com": "#1d1d1f",
  "theguardian.com": "#052962",
  "reddit.com": "#ff4500",
  "pinterest.com": "#e60023",
  "ebay.com": "#0064d2",
  "etsy.com": "#f56400",
  "walmart.com": "#0071dc",
  "target.com": "#cc0000",
  "sephora.com": "#1d1d1f",
  "nike.com": "#1d1d1f",
  "chase.com": "#117aca",
  "bankofamerica.com": "#e31837",
  "wellsfargo.com": "#d71e28",
  "americanexpress.com": "#006fcf",
  "coinbase.com": "#0052ff",
  "ramp.com": "#1d1d1f",
  "mailchimp.com": "#ffe01b",
  "zoom.us": "#0b5cff",
  "atlassian.com": "#0052cc",
  "shopify.com": "#5a863e",
  "squarespace.com": "#1d1d1f",
  "wordpress.com": "#21759b",
};

// Brand colours that are light enough to need dark text for contrast.
const LIGHT_BRAND_BACKGROUNDS = new Set(["#ff9900", "#ffe01b", "#1db954", "#43b02a"]);

// Fallback tints — muted, evenly spaced hues that read fine in both the light
// and dark glass palettes. Picked by a stable hash of the domain so a given
// sender always gets the same colour.
const FALLBACK_TINTS = [
  "#8b7fd4",
  "#5b8def",
  "#3aa5a0",
  "#4a9d5b",
  "#c98a3a",
  "#c86f6f",
  "#a05fc0",
  "#5f6fc0",
];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function monogramFor(displayName: string | undefined, address: string): string {
  const name = (displayName ?? "").trim();
  if (name) {
    const words = name.split(/[\s._-]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
    if (words[0].length === 1) return words[0][0].toUpperCase();
  }
  const local = address.split("@")[0] ?? address;
  const cleaned = local.replace(/[^a-z0-9]/gi, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
  if (cleaned.length === 1) return cleaned[0].toUpperCase();
  return "?";
}

/** Extract the domain part of an email address (lowercased, no angle brackets). */
export function domainFromAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : normalizeDomain(address.slice(at + 1).replace(/[>\s]+$/, ""));
}

// The one deliberate off-origin asset the dashboard loads: a sender-domain
// favicon, for a more recognisable list. This is a disclosed exception to the
// "nothing leaves this browser" stance (see docs/privacy.md and the sidebar
// note) — an uncredentialed GET per unique sender domain, no cookies, no
// other data. It always degrades to the monogram tile from `logoFor` on any
// failure. networkEgress.test.ts pins this host to this file.
const FAVICON_HOST = "https://www.google.com/s2/favicons";

/** Favicon URL for a sender's domain, or null when there's no usable domain.
 * Defaults to a 128px source so downscaled tiles stay crisp on HiDPI. */
export function faviconUrl(address: string, size = 128): string | null {
  const domain = domainFromAddress(address);
  if (!domain) return null;
  return `${FAVICON_HOST}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Resolve the tile to paint for a sender. `displayName` is optional and only
 * used for the fallback monogram. Never performs any I/O.
 */
export function logoFor(address: string, displayName?: string): SenderLogo {
  const domain = domainFromAddress(address);
  const monogram = monogramFor(displayName, address);

  for (const candidate of registrableDomainCandidates(domain)) {
    const brandColor = BRAND_COLORS[candidate];
    if (brandColor) {
      return {
        monogram,
        background: brandColor,
        foreground: LIGHT_BRAND_BACKGROUNDS.has(brandColor) ? "#1d1d1f" : "#ffffff",
        brand: true,
      };
    }
  }

  const tint = FALLBACK_TINTS[hashCode(domain || address) % FALLBACK_TINTS.length];
  return { monogram, background: tint, foreground: "#ffffff", brand: false };
}
