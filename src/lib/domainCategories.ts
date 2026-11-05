import { lookupDomainInMap } from "./registrableDomain";

export type DomainCategory =
  | "shopping"
  | "travel"
  | "finance"
  | "social"
  | "productivity"
  | "newsletter"
  | "education"
  | "jobs"
  | "other";

export const DOMAIN_CATEGORY_LABELS: Record<DomainCategory, string> = {
  shopping: "Shopping",
  travel: "Travel",
  finance: "Finance",
  social: "Social",
  productivity: "Productivity & tools",
  newsletter: "Newsletters & media",
  education: "Education",
  jobs: "Jobs",
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
    // Amazon's country stores are their own registrable domains.
    "amazon.in", "amazon.co.uk", "amazon.ca", "amazon.de", "amazon.com.au", "amazon.co.jp",
    "flipkart.com", "myntra.com", "ajio.com", "meesho.com", "nykaa.com", "swiggy.in", "zomato.com",
  ],
  travel: [
    "expedia.com", "booking.com", "airbnb.com", "uber.com", "lyft.com", "delta.com",
    "united.com", "southwest.com", "aa.com", "marriott.com", "hilton.com", "kayak.com",
    "tripadvisor.com", "hotels.com", "priceline.com", "jetblue.com", "airbnb.co.uk",
    "irctc.co.in", "makemytrip.com", "goibibo.com", "goindigo.in", "airindia.com",
    "travelguard.com", "avis.com", "hertz.com", "enterprise.com", "vrbo.com", "amtrak.com",
  ],
  finance: [
    "paypal.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "americanexpress.com",
    "capitalone.com", "venmo.com", "robinhood.com", "fidelity.com", "schwab.com",
    "coinbase.com", "stripe.com", "intuit.com", "turbotax.com", "discover.com",
    "citibank.com", "usbank.com", "ally.com", "sofi.com", "amazonpay.in", "paytm.com",
    "hdfcbank.com", "hdfcbank.net", "icicibank.com", "sbi.co.in", "axisbank.com", "kotak.com",
    "phonepe.com", "zerodha.com", "groww.in",
    "klarna.com", "affirm.com", "chime.com", "experian.com", "equifax.com", "transunion.com",
    "creditkarma.com", "afterpay.com", "licindia.in",
  ],
  social: [
    "facebook.com", "facebookmail.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "tiktok.com", "reddit.com", "snapchat.com",
    "discord.com", "meetup.com", "nextdoor.com",
  ],
  // Not google.com or microsoft.com: they send security alerts, account
  // notices and ads from the same domain, so the domain says nothing.
  productivity: [
    "slack.com", "notion.so", "atlassian.com", "github.com", "gitlab.com", "dropbox.com",
    "zoom.us", "asana.com", "trello.com", "figma.com",
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
    "udemymail.com", "netacad.com", "mygreatlearning.com", "codecademy.com", "datacamp.com",
  ],
  // Job boards and the applicant-tracking systems employers write from.
  jobs: [
    "indeed.com", "indeedemail.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "dice.com",
    "wellfound.com", "joinhandshake.com", "jobright.ai", "simplify.jobs", "builtin.com",
    "naukri.com", "foundit.in", "instahyre.com", "internshala.com", "cutshort.io", "hirist.tech",
    "greenhouse.io", "greenhouse-mail.io", "lever.co", "myworkday.com", "myworkdayjobs.com",
    "smartrecruiters.com", "ashbyhq.com", "icims.com", "workablemail.com",
  ],
};

/** Senders whose domain says nothing but whose address does: LinkedIn sends
 * job alerts and social notices from the same domain. */
const JOB_ADDRESSES = new Set([
  "jobalerts-noreply@linkedin.com",
  "jobs-noreply@linkedin.com",
  "jobs-listings@linkedin.com",
]);

export function isJobAddress(address: string): boolean {
  return JOB_ADDRESSES.has(address.toLowerCase());
}

const DOMAIN_TO_CATEGORY = new Map<string, DomainCategory>();
for (const [category, domains] of Object.entries(CATEGORY_DOMAINS) as [DomainCategory, string[]][]) {
  for (const domain of domains) DOMAIN_TO_CATEGORY.set(domain, category);
}

export function categorizeDomain(domain: string): DomainCategory {
  // lookupDomainInMap walks parent labels so a sending subdomain matches the
  // registrable domain: email.amazon.com -> amazon.com, e.delta.com ->
  // delta.com. Stops before the bare TLD so that could never match.
  return lookupDomainInMap(domain, DOMAIN_TO_CATEGORY) ?? "other";
}

/** The curated domains that map to a category — the source list for the
 * server-side "keep sorting" Gmail filter (`from:(d1 OR d2 …)`). */
export function domainsForCategory(category: DomainCategory): string[] {
  if (category === "other") return [];
  const domains = [...CATEGORY_DOMAINS[category]];
  return category === "jobs" ? [...domains, ...JOB_ADDRESSES] : domains;
}
