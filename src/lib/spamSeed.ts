// Hand-curated spam / junk sender domains, edited directly in this file as you
// come across them. Kept separate from data/spamDomains.generated.json -- the
// machine-refreshed disposable + StopForumSpam slice -- so `npm run refresh:spam`
// never touches anything you added by hand.
//
// One registrable domain per entry, lowercase, no scheme, no path, no leading
// "www.". A subdomain match is automatic -- listing "spammer.example" also
// covers "mail.spammer.example". This feeds the "Suggested spam" section of the
// Clean up tab; it never deletes anything on its own.
export const SPAM_SEED: readonly string[] = [
  // "bulk-deals-daily.example",
  // "newsletter.throwaway-marketing.example",
];
