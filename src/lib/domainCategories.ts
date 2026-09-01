export type DomainCategory =
  | "shopping"
  | "travel"
  | "finance"
  | "social"
  | "productivity"
  | "newsletter"
  | "education"
  | "other";

export const DOMAIN_CATEGORY_LABELS: Record<DomainCategory, string> = {
  shopping: "Shopping",
  travel: "Travel",
  finance: "Finance",
  social: "Social",
  productivity: "Productivity & tools",
  newsletter: "Newsletters & media",
  education: "Education",
  other: "Other",
};

// Hand-curated: no free/reliable API exists for domain->category lookup that
// fits this project's metadata-only, no-server-calls privacy stance. Anything
// not listed here falls back to "other" rather than guessing.
const CATEGORY_DOMAINS: Record<Exclude<DomainCategory, "other">, string[]> = {
  shopping: [
    "amazon.com", "ebay.com", "apple.com", "walmart.com", "target.com", "etsy.com",
    "bestbuy.com", "shopify.com", "aliexpress.com", "wayfair.com", "costco.com",
    "macys.com", "nordstrom.com", "chewy.com", "instacart.com", "doordash.com",
    "ubereats.com", "grubhub.com", "sephora.com", "ikea.com", "homedepot.com",
    "lowes.com", "zappos.com", "newegg.com", "shein.com", "temu.com",
  ],
  travel: [
    "expedia.com", "booking.com", "airbnb.com", "uber.com", "lyft.com", "delta.com",
    "united.com", "southwest.com", "aa.com", "marriott.com", "hilton.com", "kayak.com",
    "tripadvisor.com", "hotels.com", "priceline.com", "jetblue.com", "airbnb.co.uk",
  ],
  finance: [
    "paypal.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "americanexpress.com",
    "capitalone.com", "venmo.com", "robinhood.com", "fidelity.com", "schwab.com",
    "coinbase.com", "stripe.com", "intuit.com", "turbotax.com", "discover.com",
    "citibank.com", "usbank.com", "ally.com", "sofi.com",
  ],
  social: [
    "facebook.com", "facebookmail.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "tiktok.com", "reddit.com", "snapchat.com",
    "discord.com", "meetup.com", "nextdoor.com",
  ],
  productivity: [
    "slack.com", "notion.so", "atlassian.com", "github.com", "gitlab.com", "dropbox.com",
    "zoom.us", "asana.com", "trello.com", "figma.com", "google.com", "microsoft.com",
    "salesforce.com", "hubspot.com", "monday.com", "airtable.com", "calendly.com",
    "docusign.com", "adobe.com",
  ],
  newsletter: [
    "substack.com", "medium.com", "mailchimp.com", "nytimes.com", "washingtonpost.com",
    "cnn.com", "bloomberg.com", "theatlantic.com", "wsj.com", "theverge.com",
    "techcrunch.com", "axios.com", "morningbrew.com", "beehiiv.com",
  ],
  education: [
    "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "duolingo.com",
    "skillshare.com", "instructure.com", "blackboard.com", "brilliant.org", "udacity.com",
  ],
};

const DOMAIN_TO_CATEGORY = new Map<string, DomainCategory>();
for (const [category, domains] of Object.entries(CATEGORY_DOMAINS) as [DomainCategory, string[]][]) {
  for (const domain of domains) DOMAIN_TO_CATEGORY.set(domain, category);
}

export function categorizeDomain(domain: string): DomainCategory {
  return DOMAIN_TO_CATEGORY.get(domain.toLowerCase()) ?? "other";
}

/** The curated domains that map to a category — the source list for the
 * server-side "keep sorting" Gmail filter (`from:(d1 OR d2 …)`). */
export function domainsForCategory(category: DomainCategory): string[] {
  return category === "other" ? [] : [...CATEGORY_DOMAINS[category]];
}
