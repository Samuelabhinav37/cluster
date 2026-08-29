// Pure logic behind link-target-mismatch detection: does a link's visible
// text look like a domain/URL that points somewhere other than where the
// link actually goes -- a classic phishing tell ("paypal.com" as the
// clickable text, an attacker-controlled href underneath). Deliberately
// separate from the header-only threatSignals.ts pipeline: this needs the
// message body (HTML), which the background triage's normal scan never
// fetches -- see gmailApi.ts's getMessageLinks and the dashboard's "Deep
// scan" action for why this stays a manual, per-message action rather than
// something the automatic 6-hourly triage does for every message.
export interface ExtractedLink {
  text: string;
  href: string;
}

export interface SuspiciousLink extends ExtractedLink {
  displayedDomain: string;
  actualDomain: string;
}

// Deliberately simple regex extraction, not a DOM/HTML parser dependency --
// good enough for the common case (a standard <a href="...">text</a>), and
// this is an opt-in, per-message action, not something that needs to
// survive adversarial HTML the way a rendering engine does.
const ANCHOR_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const STRIP_TAGS_RE = /<[^>]+>/g;
const DOMAIN_LIKE_RE = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/i;

export function extractLinksFromHtml(html: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const match of html.matchAll(ANCHOR_RE)) {
    const href = match[1];
    const text = match[2]?.replace(STRIP_TAGS_RE, "").trim();
    if (href && text) links.push({ text, href });
  }
  return links;
}

function isSameOrSubdomain(domain: string, other: string): boolean {
  return domain === other || domain.endsWith(`.${other}`) || other.endsWith(`.${domain}`);
}

/** Only flags links whose *visible text* itself looks like a domain --
 * "Click here" or "Unsubscribe" pointing to an unfamiliar domain is normal
 * and not flagged; "paypal.com" as the clickable text pointing anywhere
 * other than paypal.com (or a subdomain of it) is the actual tell. */
export function findMismatchedLinks(links: ExtractedLink[]): SuspiciousLink[] {
  const results: SuspiciousLink[] = [];
  for (const link of links) {
    const displayMatch = DOMAIN_LIKE_RE.exec(link.text);
    if (!displayMatch) continue;
    const displayedDomain = displayMatch[0].toLowerCase();

    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue; // A relative or otherwise unparseable href -- nothing to compare against.
    }
    // mailto:/tel:/etc. parse fine but have no host component (hostname is
    // "") -- explicitly scoped to http(s) rather than relying on hostname
    // being non-empty, so a scheme this doesn't recognize fails safe by
    // being skipped, not by accidentally comparing against an empty string.
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const actualDomain = url.hostname.toLowerCase();

    if (!isSameOrSubdomain(actualDomain, displayedDomain)) {
      results.push({ ...link, displayedDomain, actualDomain });
    }
  }
  return results;
}
