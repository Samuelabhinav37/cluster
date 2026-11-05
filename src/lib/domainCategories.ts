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
    "hm.com", "gap.com", "oldnavy.com", "uniqlo.com", "zara.com", "abercrombie.com",
    "hollisterco.com", "ae.com", "nike.com", "adidas.com", "lululemon.com", "kohls.com",
    "jcpenney.com", "samsclub.com", "poshmark.com", "mercari.com", "depop.com", "stockx.com",
    "ulta.com", "bathandbodyworks.com", "victoriassecret.com", "calvinklein.com", "levi.com",
    "gamestop.com", "crateandbarrel.com", "williams-sonoma.com", "dickssportinggoods.com",
    "rei.com", "footlocker.com", "asos.com", "hellofresh.com", "gopuff.com", "postmates.com",
    "dominos.com", "starbucks.com", "chipotle.com", "subway.com", "mcdonalds.com", "tacobell.com",
    "panerabread.com", "sopost.com", "bigbasket.com", "blinkit.com", "zeptonow.com",
    "tatacliq.com", "croma.com", "jiomart.com", "lenskart.com", "snapdeal.com", "firstcry.com",
    "purplle.com", "decathlon.in",
  ],
  travel: [
    "expedia.com", "booking.com", "airbnb.com", "uber.com", "lyft.com", "delta.com",
    "united.com", "southwest.com", "aa.com", "marriott.com", "hilton.com", "kayak.com",
    "tripadvisor.com", "hotels.com", "priceline.com", "jetblue.com", "airbnb.co.uk",
    "irctc.co.in", "makemytrip.com", "goibibo.com", "goindigo.in", "airindia.com",
    "travelguard.com", "avis.com", "hertz.com", "enterprise.com", "vrbo.com", "amtrak.com",
    "alaskaair.com", "spirit.com", "flyfrontier.com", "britishairways.com", "emirates.com",
    "qatarairways.com", "lufthansa.com", "airfrance.com", "klm.com", "aircanada.com", "ihg.com",
    "hyatt.com", "choicehotels.com", "wyndhamhotels.com", "agoda.com", "trip.com",
    "skyscanner.net", "hopper.com", "greyhound.com", "flixbus.com", "turo.com", "nationalcar.com",
    "budget.com", "alamo.com", "cleartrip.com", "yatra.com", "ixigo.com", "easemytrip.com",
    "redbus.in", "oyorooms.com", "olacabs.com", "spicejet.com", "akasaair.com",
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
    "licindia.com", "citi.com", "navyfederal.org", "usaa.com", "pnc.com", "td.com",
    "synchrony.com", "barclaycardus.com", "marcus.com", "wise.com", "revolut.com", "acorns.com",
    "betterment.com", "wealthfront.com", "vanguard.com", "etrade.com", "webull.com",
    "rocketmoney.com", "nerdwallet.com", "geico.com", "progressive.com", "statefarm.com",
    "allstate.com", "libertymutual.com", "lemonade.com", "proxyvote.com", "cash.app", "kraken.com",
    "crypto.com", "binance.com", "wazirx.com", "coindcx.com", "upstox.com", "angelone.in",
    "cred.club", "bajajfinserv.in", "policybazaar.com", "sbicard.com", "idfcfirstbank.com",
    "mobikwik.com", "razorpay.com",
  ],
  social: [
    "facebook.com", "facebookmail.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "tiktok.com", "reddit.com", "snapchat.com",
    "discord.com", "meetup.com", "nextdoor.com",
    "quora.com", "youtube.com", "threads.net", "bsky.app", "tumblr.com", "strava.com",
    "goodreads.com", "twitch.tv",
  ],
  // Not google.com or microsoft.com: they send security alerts, account
  // notices and ads from the same domain, so the domain says nothing.
  productivity: [
    "slack.com", "notion.so", "atlassian.com", "github.com", "gitlab.com", "dropbox.com",
    "zoom.us", "asana.com", "trello.com", "figma.com",
    "salesforce.com", "hubspot.com", "monday.com", "airtable.com", "calendly.com",
    "docusign.com", "adobe.com",
    "miro.com", "loom.com", "atlassian.net", "linear.app", "clickup.com", "basecamp.com",
    "box.com", "webex.com", "ringcentral.com", "canva.com", "grammarly.com", "vercel.com",
    "netlify.com", "heroku.com", "digitalocean.com", "jetbrains.com", "postman.com", "docker.com",
    "sentry.io", "smartsheet.com", "wrike.com", "todoist.com", "evernote.com", "1password.com",
    "bitwarden.com",
  ],
  newsletter: [
    "substack.com", "medium.com", "mailchimp.com", "nytimes.com", "washingtonpost.com",
    "cnn.com", "bloomberg.com", "theatlantic.com", "wsj.com", "theverge.com",
    "techcrunch.com", "axios.com", "morningbrew.com", "beehiiv.com",
    "tldrnewsletter.com", "tldr.tech", "tldrsec.com", "every.to", "stratechery.com",
    "theinformation.com", "economist.com", "ft.com", "reuters.com", "apnews.com", "npr.org",
    "bbc.com", "theguardian.com", "newyorker.com", "wired.com", "arstechnica.com", "vox.com",
    "politico.com", "businessinsider.com", "forbes.com", "fortune.com", "hbr.org",
    "fastcompany.com", "producthunt.com", "vogue.com", "gq.com", "thehindu.com", "indiatimes.com",
    "hindustantimes.com", "livemint.com", "moneycontrol.com", "ndtv.com",
  ],
  education: [
    "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "duolingo.com",
    "skillshare.com", "instructure.com", "blackboard.com", "brilliant.org", "udacity.com",
    "udemymail.com", "netacad.com", "mygreatlearning.com", "codecademy.com", "datacamp.com",
    "hackerrank.com", "hackerrankmail.com", "leetcode.com", "geeksforgeeks.org",
    "freecodecamp.org", "pluralsight.com", "oreilly.com", "edureka.co", "simplilearn.com",
    "upgrad.com", "scaler.com", "chegg.com", "quizlet.com", "d2l.com", "schoology.com",
    "piazza.com", "gradescope.com", "collegeboard.org", "commonapp.org", "ets.org", "pearson.com",
    "mheducation.com", "cengage.com", "adplist.org", "adplistapp.org", "angelhack.com",
    "devpost.com", "mlh.io", "kaggle.com", "isc2.org", "comptia.org", "credly.com", "sans.org",
    "offsec.com", "tryhackme.com", "hackthebox.com", "cybrary.it",
  ],
  // Job boards and the applicant-tracking systems employers write from.
  jobs: [
    "indeed.com", "indeedemail.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "dice.com",
    "wellfound.com", "joinhandshake.com", "jobright.ai", "simplify.jobs", "builtin.com",
    "naukri.com", "foundit.in", "instahyre.com", "internshala.com", "cutshort.io", "hirist.tech",
    "greenhouse.io", "greenhouse-mail.io", "lever.co", "myworkday.com", "myworkdayjobs.com",
    "smartrecruiters.com", "ashbyhq.com", "icims.com", "workablemail.com",
    "workday.com", "successfactors.com", "taleo.net", "jobvite.com", "ultipro.com", "ukg.com",
    "paylocity.com", "bamboohr.com", "jazzhr.com", "applytojob.com", "breezy-mail.com",
    "breezy.hr", "recruitee.com", "brassring.com", "dayforcehcm.com", "avature.net",
    "eightfold.ai", "hirevue.com", "codesignal.com", "hackerearth.com", "karat.com", "micro1.ai",
    "mercor.com", "tsenta.com", "teksystems.com", "ambitionbox.com", "careerbuilder.com",
    "snagajob.com", "usajobs.gov", "flexjobs.com", "hired.com", "otta.com",
    "welcometothejungle.com", "levels.fyi", "talent.com", "jooble.org", "adzuna.com", "lensa.com",
    "shine.com", "timesjobs.com", "apna.co", "iimjobs.com",
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
  const domains = [...(CATEGORY_DOMAINS[category] ?? [])];
  return category === "jobs" ? [...domains, ...JOB_ADDRESSES] : domains;
}
