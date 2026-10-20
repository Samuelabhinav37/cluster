// Labelled threat corpus for evaluation.test.ts. Every case is synthetic:
// shapes taken from the 2026-10-20 research (research/reports/Cluster
// algorithm and security plan.md), the registered it.fails bugs in
// algorithmAudit.test.ts, and Sublime Security's false-positive negations.
//
// `label` is the truth, not what Cluster does today. A case Cluster gets
// wrong stays here and lowers the score; the floors in evaluation.test.ts
// only ratchet up.
//
// Tags group cases so a detector's precision/recall can be read on its own
// slice ("toad", "relay", "lookalike", ...).
import type { NormalizedMessageMetadata } from "../../lib/providers/emailProvider";
import { authResults } from "../mailFixtures";

export type ThreatLabel = "malicious" | "benign";

export interface ThreatCase {
  id: string;
  label: ThreatLabel;
  tags: string[];
  /** Messages from one sender. `fromAddress` is required on each. */
  messages: Array<Partial<NormalizedMessageMetadata> & { fromAddress: string }>;
  /** The user has written to this sender before. */
  knownCorrespondent?: boolean;
}

const fail = (domain: string) => authResults(domain, false);
const pass = (domain: string) => authResults(domain, true);
const domainOf = (address: string) => address.split("@")[1];

/** One message, authenticated as its own domain unless `auth` says otherwise. */
function msg(
  fromAddress: string,
  fromDisplayName: string,
  subject: string,
  over: Partial<NormalizedMessageMetadata> = {},
): Partial<NormalizedMessageMetadata> & { fromAddress: string } {
  return {
    fromAddress,
    fromDisplayName,
    subject,
    authenticationResults: pass(domainOf(fromAddress)),
    ...over,
  };
}

const noUnsub = { unsubscribe: {} };

// ── Brand impersonation from a lookalike domain that fails DMARC ──────────
const LOOKALIKES: Array<[brand: string, display: string, address: string]> = [
  ["paypal", "PayPal Security", "service@paypa1-secure.com"],
  ["paypal", "PayPal", "billing@paypa1.com"],
  ["amazon", "Amazon.com", "order-update@arnazon.com"],
  ["amazon", "Amazon Prime", "prime@amaz0n-billing.com"],
  ["microsoft", "Microsoft 365", "no-reply@rnicrosoft.com"],
  ["microsoft", "Microsoft account team", "security@microsoft-verify-login.com"],
  ["apple", "Apple", "id@app1e-support.com"],
  ["netflix", "Netflix", "billing@netf1ix.com"],
  ["wells fargo", "Wells Fargo Online", "alerts@wellsfarg0.com"],
  ["chase", "Chase Fraud Team", "fraud@chase-alerts-secure.com"],
  ["coinbase", "Coinbase", "support@coinbace.com"],
  ["docusign", "DocuSign", "dse@docusing.net"],
  ["dropbox", "Dropbox", "no-reply@dropboks.com"],
  ["linkedin", "LinkedIn", "messages@linkedln.com"],
  ["fedex", "FedEx Delivery", "track@fedex-redelivery.com"],
];

const lookalikeCases: ThreatCase[] = LOOKALIKES.map(([brand, display, address], i) => ({
  id: `lookalike-${i}-${brand.replace(/\W/g, "")}`,
  label: "malicious",
  tags: ["lookalike", "auth-fail"],
  messages: [
    msg(address, display, "Action required: verify your account", {
      ...noUnsub,
      authenticationResults: fail(domainOf(address)),
    }),
  ],
}));

// Typosquats that pass authentication (the attacker owns the domain) and
// use a neutral display name: only the domain gives them away.
const quietLookalikes: ThreatCase[] = [
  ["billing@paypa1.com", "Billing"],
  ["account@arnazon.com", "Account"],
  ["support@rnicrosoft.com", "Support"],
  ["noreply@g00gle.com", "Accounts"],
].map(([address, display], i) => ({
  id: `lookalike-quiet-${i}`,
  label: "malicious",
  tags: ["lookalike"],
  messages: [msg(address, display, "Your statement is ready", noUnsub)],
}));

// ── Brand claims from free mail ───────────────────────────────────────────
const FREEMAIL_CLAIMS: Array<[display: string, address: string]> = [
  ["PayPal Support", "paypal.help.desk@yahoo.com"],
  ["Amazon Customer Service", "amazon.refunds.dept@gmail.com"],
  ["Netflix Billing", "netflix.billing.team@hotmail.com"],
  ["Wells Fargo", "wellsfargo.secure@aol.com"],
  ["Coinbase Support", "coinbase.recovery@protonmail.com"],
  ["DHL Express", "dhl.parcel.notice@gmail.com"],
  ["Bank of America Alerts", "boa.alerts.center@yahoo.com"],
  ["Geek Squad", "geeksquad.renewal@gmail.com"],
];

const freemailCases: ThreatCase[] = FREEMAIL_CLAIMS.map(([display, address], i) => ({
  id: `freemail-claim-${i}`,
  label: "malicious",
  tags: ["freemail-claim"],
  messages: [msg(address, display, "Important notice about your account", noUnsub)],
}));

// Brands whose own free-mail domain is in their brand list: a claim from a
// mailbox there is still a free-mail claim (registered bug).
const ownFreemailCases: ThreatCase[] = [
  ["Microsoft Account Team", "ms.account.recovery@outlook.com"],
  ["Google Security", "google.security.alerts@gmail.com"],
  ["Apple Support", "appleid.support.team@icloud.com"],
  ["Microsoft Support", "microsoft.helpdesk.365@hotmail.com"],
].map(([display, address], i) => ({
  id: `own-freemail-claim-${i}`,
  label: "malicious",
  tags: ["freemail-claim", "own-freemail"],
  messages: [msg(address, display, "Unusual sign-in activity", noUnsub)],
}));

// ── Homograph / punycode ──────────────────────────────────────────────────
const punycodeCases: ThreatCase[] = [
  {
    id: "punycode-apple-cyrillic",
    label: "malicious",
    tags: ["punycode", "lookalike"],
    // xn--80ak6aa92e.com is "аррӏе.com" in Cyrillic.
    messages: [msg("id@xn--80ak6aa92e.com", "Apple ID", "Your Apple ID has been locked", noUnsub)],
  },
  {
    id: "punycode-generic",
    label: "malicious",
    tags: ["punycode"],
    messages: [
      msg("support@xn--pypal-4ve.com", "Support", "Confirm your payment details", {
        ...noUnsub,
        authenticationResults: fail("xn--pypal-4ve.com"),
      }),
    ],
  },
];

// ── Display names disguised from a plain match ───────────────────────────
const disguisedNameCases: ThreatCase[] = [
  ["Pay\u200BPal Support", "help@account-review.example"],
  ["\uFF30\uFF41\uFF59\uFF30\uFF41\uFF4C Security", "alerts@payments-desk.example"],
  ["\u0410pple Support", "support@device-check.example"],
].map(([display, address], i) => ({
  id: `disguised-display-${i}`,
  label: "malicious" as const,
  tags: ["display-disguise"],
  messages: [msg(address, display, "Your account is on hold", noUnsub)],
}));

// ── Known-bad list ────────────────────────────────────────────────────────
const blocklistCases: ThreatCase[] = [
  {
    id: "blocklisted-sender",
    label: "malicious",
    tags: ["blocklist"],
    messages: [msg("invoice@0x1x2x3.top", "Accounts Payable", "Invoice attached", noUnsub)],
  },
];

// ── Reply-To redirect + failed auth (BEC shape) ───────────────────────────
const becCases: ThreatCase[] = [
  {
    id: "bec-replyto-freemail-authfail",
    label: "malicious",
    tags: ["bec", "reply-to", "auth-fail"],
    messages: [
      msg("ceo@acme-corp.example", "Dana Whitfield", "Urgent wire transfer needed today", {
        ...noUnsub,
        replyToAddress: "dana.whitfield.ceo@gmail.com",
        authenticationResults: fail("acme-corp.example"),
      }),
    ],
  },
  {
    id: "bec-replyto-freemail-lure",
    label: "malicious",
    tags: ["bec", "reply-to"],
    messages: [
      msg("payroll@vendor-billing.example", "Payroll", "Action required: update your direct deposit", {
        ...noUnsub,
        replyToAddress: "payroll.update.dept@outlook.com",
      }),
    ],
  },
];

// ── Risky attachment + lure from a stranger ───────────────────────────────
const attachmentCases: ThreatCase[] = [
  {
    id: "risky-attachment-lure",
    label: "malicious",
    tags: ["attachment"],
    messages: [
      msg("scanner@office-docs.example", "Scanner", "Urgent: payment confirmation required", {
        ...noUnsub,
        hasRiskyAttachment: true,
        authenticationResults: fail("office-docs.example"),
      }),
    ],
  },
];

// ── Trend templates: authenticated, link-less, brand-themed ──────────────
// Native filters let most of these through (research: compromised accounts,
// genuine-platform relays, callback phishing). Cluster misses them today;
// Phase 2.1 detectors target them.
const trendCases: ThreatCase[] = [
  {
    id: "toad-paypal-invoice-genuine",
    label: "malicious",
    tags: ["toad", "relay"],
    messages: [
      msg(
        "service@paypal.com",
        "Norton LifeLock via PayPal",
        "Invoice #8821 – call +1 (808) 555-0199 if you did not authorize",
        noUnsub,
      ),
    ],
  },
  {
    id: "toad-geeksquad-renewal",
    label: "malicious",
    tags: ["toad"],
    messages: [
      msg(
        "billing@renewal-desk.example",
        "Geek Squad",
        "Your subscription renewed for $399.99. Call 1-888-555-0142 to cancel",
        noUnsub,
      ),
    ],
  },
  {
    id: "toad-norton-order",
    label: "malicious",
    tags: ["toad"],
    messages: [
      msg(
        "orders@secure-billing.example",
        "Norton Order Desk",
        "Order confirmation #NT-55821 | Helpline 1 800 555 0199",
        noUnsub,
      ),
    ],
  },
  {
    id: "relay-docusign-microsoft",
    label: "malicious",
    tags: ["relay"],
    messages: [
      msg(
        "dse@docusign.net",
        "Microsoft 365 via Docusign",
        "Please DocuSign: Payroll adjustment Q4",
        noUnsub,
      ),
    ],
  },
  {
    id: "relay-google-forms-paypal",
    label: "malicious",
    tags: ["relay"],
    messages: [
      msg(
        "forms-receipts-noreply@google.com",
        "PayPal Billing (via Google Forms)",
        "Your account has been limited",
        noUnsub,
      ),
    ],
  },
  {
    id: "fake-thread-invoice",
    label: "malicious",
    tags: ["fake-thread"],
    messages: [
      msg(
        "accounts@supplier-payments.example",
        "Accounts Receivable",
        "RE: Overdue invoice 4471 - final notice",
        {
          ...noUnsub,
          referencesCount: 0,
        },
      ),
    ],
  },
  {
    id: "spf-temperror-spoof",
    label: "malicious",
    tags: ["auth-fail", "spf-error"],
    messages: [
      msg("payroll@acme-corp.example", "Payroll", "Updated direct deposit form", {
        ...noUnsub,
        authenticationResults:
          "mx.google.com; spf=temperror (google.com: error in processing during lookup of payroll@acme-corp.example: DNS error) smtp.mailfrom=payroll@acme-corp.example; dkim=none; dmarc=none header.from=acme-corp.example",
      }),
    ],
  },
  {
    id: "sextortion-from-self",
    label: "malicious",
    tags: ["spoofed-self"],
    messages: [
      msg("me@example.com", "me@example.com", "I have access to your device. Read this carefully", {
        ...noUnsub,
        toAddresses: ["me@example.com"],
        authenticationResults: "mx.google.com; spf=softfail smtp.mailfrom=example.com; dkim=none; dmarc=none",
      }),
    ],
  },
  {
    id: "new-gtld-suspension",
    label: "malicious",
    tags: ["risky-tld", "lure"],
    messages: [
      msg(
        "support@account-verify-center.top",
        "Account Services",
        "Your account will be suspended within 24 hours",
        noUnsub,
      ),
    ],
  },
  {
    id: "new-gtld-xyz-mailbox-full",
    label: "malicious",
    tags: ["risky-tld", "lure"],
    messages: [
      msg(
        "admin@mailbox-quota.xyz",
        "Mail Administrator",
        "Mailbox storage full - verify now to keep receiving mail",
        noUnsub,
      ),
    ],
  },
];

// ── Benign: brands from their own domains ─────────────────────────────────
const OWN_BRAND: Array<[display: string, address: string, subject: string]> = [
  ["PayPal", "service@paypal.com", "You've got money"],
  ["Amazon.com", "no-reply@email.amazon.com", "Your Amazon.com order has shipped"],
  ["Amazon", "store-news@amazon.com", "Deals picked for you"],
  [
    "Microsoft",
    "account-security-noreply@accountprotection.microsoft.com",
    "Microsoft account security code",
  ],
  ["Apple", "no_reply@email.apple.com", "Your receipt from Apple"],
  ["Google", "no-reply@accounts.google.com", "Security alert"],
  ["Netflix", "info@account.netflix.com", "New sign-in to your account"],
  ["Chase", "no.reply.alerts@chase.com", "Your statement is ready"],
  ["Wells Fargo", "alerts@notify.wellsfargo.com", "Your payment was received"],
  ["LinkedIn", "messages-noreply@linkedin.com", "You appeared in 12 searches this week"],
  ["Facebook", "notification@facebookmail.com", "Priya commented on your post"],
  ["DocuSign", "dse@docusign.net", "Completed: Lease agreement 2026"],
  ["Dropbox", "no-reply@dropbox.com", "Someone shared a folder with you"],
  ["Coinbase", "no-reply@info.coinbase.com", "Your weekly crypto update"],
  ["FedEx", "TrackingUpdates@fedex.com", "Your package is out for delivery"],
  ["UPS", "mcinfo@ups.com", "UPS Update: Package Scheduled for Delivery Today"],
];

const ownBrandCases: ThreatCase[] = OWN_BRAND.map(([display, address, subject], i) => ({
  id: `own-brand-${i}-${domainOf(address)}`,
  label: "benign",
  tags: ["own-brand"],
  messages: [msg(address, display, subject)],
}));

// ── Benign: names and domains that merely resemble a brand ────────────────
const resemblesBrandCases: ThreatCase[] = [
  {
    id: "person-named-chase",
    label: "benign",
    tags: ["brand-word-name"],
    messages: [msg("chase.miller@gmail.com", "Chase Miller", "Photos from Saturday", noUnsub)],
  },
  {
    id: "person-named-amber-apple",
    label: "benign",
    tags: ["brand-word-name"],
    messages: [msg("amber.apple@yahoo.com", "Amber Apple", "Are we still on for lunch?", noUnsub)],
  },
  {
    id: "person-named-zoom-adjacent",
    label: "benign",
    tags: ["brand-word-name"],
    messages: [msg("j.discover@outlook.com", "Jordan Discover", "Notes from the meeting", noUnsub)],
  },
  {
    id: "chess-com",
    label: "benign",
    tags: ["lookalike-fp"],
    messages: [msg("hello@chess.com", "Chess.com", "Your weekly chess report")],
  },
  {
    id: "startups-weekly",
    label: "benign",
    tags: ["brand-word-name"],
    messages: [msg("editor@startupsweekly.example", "Start-Ups Weekly", "This week in startups")],
  },
  {
    id: "chime-com",
    label: "benign",
    tags: ["lookalike-fp"],
    messages: [msg("support@chime.com", "Chime", "Your direct deposit arrived")],
  },
  {
    id: "discovery-com",
    label: "benign",
    tags: ["lookalike-fp"],
    messages: [msg("newsletter@discovery.com", "Discovery", "New this week on Discovery")],
  },
  {
    id: "adobe-io",
    label: "benign",
    tags: ["lookalike-fp"],
    messages: [msg("noreply@adobe.io", "Adobe Developer", "Your API credentials")],
  },
  {
    id: "amazon-fr",
    label: "benign",
    tags: ["lookalike-fp", "cctld"],
    messages: [msg("commande@amazon.fr", "Amazon.fr", "Votre commande a été expédiée")],
  },
  {
    id: "google-ca",
    label: "benign",
    tags: ["lookalike-fp", "cctld"],
    messages: [msg("noreply@google.ca", "Google", "Your Google Account summary")],
  },
  {
    id: "fedex-ca",
    label: "benign",
    tags: ["lookalike-fp", "cctld"],
    messages: [msg("tracking@fedex.ca", "FedEx", "Your shipment is on its way")],
  },
  {
    id: "tmobile-com",
    label: "benign",
    tags: ["lookalike-fp"],
    messages: [msg("noreply@tmobile.com", "T-Mobile", "Your bill is ready")],
  },
  {
    id: "usps-informed-delivery",
    label: "benign",
    tags: ["own-brand"],
    messages: [
      msg(
        "USPSInformeddelivery@email.informeddelivery.usps.com",
        "USPS Informed Delivery",
        "Your Daily Digest",
      ),
    ],
  },
];

// ── Benign: shapes that trip naive rules ──────────────────────────────────
const awkwardBenignCases: ThreatCase[] = [
  {
    id: "substack-replyto-author-gmail",
    label: "benign",
    tags: ["reply-to", "newsletter"],
    messages: [
      msg("lenny@substack.com", "Lenny's Newsletter", "How the best PMs prioritize", {
        replyToAddress: "lenny.rachitsky@gmail.com",
      }),
    ],
  },
  {
    id: "google-group-forward-dkim-broken",
    label: "benign",
    tags: ["forwarded", "list"],
    messages: [
      msg("hiking-club@googlegroups.com", "Sam Lee via Hiking Club", "Trail plan for Sunday", {
        ...noUnsub,
        listId: "<hiking-club.googlegroups.com>",
        authenticationResults:
          "mx.google.com; dkim=fail header.i=@gmail.com; spf=pass smtp.mailfrom=googlegroups.com; dmarc=pass header.from=googlegroups.com",
      }),
    ],
  },
  {
    id: "forwarded-arc-intact",
    label: "benign",
    tags: ["forwarded"],
    messages: [
      msg("alex@university.example", "Alex Rivera", "Fwd: seminar schedule", {
        ...noUnsub,
        authenticationResults:
          "mx.google.com; arc=pass (i=1 spf=pass spfdomain=university.example dkim=pass dkdomain=university.example); spf=fail smtp.mailfrom=university.example; dkim=fail header.i=@university.example; dmarc=none header.from=university.example",
      }),
    ],
  },
  {
    id: "promo-urgent-copy",
    label: "benign",
    tags: ["lure-fp", "newsletter"],
    messages: [
      msg("deals@shop.example", "Shop Deals", "Act now: last chance to verify your discount ends tonight"),
    ],
  },
  {
    id: "real-security-alert-google",
    label: "benign",
    tags: ["lure-fp", "own-brand"],
    messages: [
      msg("no-reply@accounts.google.com", "Google", "Security alert: new sign-in on Windows", noUnsub),
    ],
  },
  {
    id: "colleague-wire-question",
    label: "benign",
    tags: ["known"],
    knownCorrespondent: true,
    messages: [
      msg("dana@acme-corp.example", "Dana Whitfield", "Can you confirm the wire for the venue?", noUnsub),
    ],
  },
  {
    id: "friend-on-gmail",
    label: "benign",
    tags: ["personal"],
    messages: [msg("mom.smith@gmail.com", "Mom", "Call me when you land", noUnsub)],
  },
  {
    id: "small-business-on-gmail",
    label: "benign",
    tags: ["personal", "newsletter"],
    messages: [msg("bakeryonmain@gmail.com", "Bakery on Main", "Fresh sourdough this Saturday")],
  },
  {
    id: "genuine-paypal-invoice",
    label: "benign",
    tags: ["relay", "own-brand"],
    messages: [
      msg("service@paypal.com", "Acme Plumbing via PayPal", "Invoice from Acme Plumbing (#1043)", noUnsub),
    ],
  },
  {
    id: "genuine-docusign",
    label: "benign",
    tags: ["relay", "own-brand"],
    messages: [
      msg(
        "dse@docusign.net",
        "Riverside Property Mgmt via Docusign",
        "Please DocuSign: Lease renewal 2027",
        noUnsub,
      ),
    ],
  },
  {
    id: "real-reply-thread",
    label: "benign",
    tags: ["fake-thread-fp"],
    messages: [
      msg("pat@partner-co.example", "Pat Kim", "RE: Q3 numbers", {
        ...noUnsub,
        inReplyTo: "<abc123@mail.example>",
        referencesCount: 2,
      }),
    ],
  },
  {
    id: "phone-in-legit-subject",
    label: "benign",
    tags: ["toad-fp"],
    messages: [
      msg(
        "appointments@dental-care.example",
        "Dental Care",
        "Reminder: appointment Tue 3pm. Questions? 555-0100",
      ),
    ],
  },
  {
    id: "legit-bill-with-phone",
    label: "benign",
    tags: ["toad-fp"],
    messages: [
      msg(
        "online.communications@alerts.comcast.net",
        "Xfinity",
        "Your bill is ready. Questions about billing? Call 1-800-934-6489",
      ),
    ],
  },
  {
    id: "clinic-reminder-full-phone",
    label: "benign",
    tags: ["toad-fp"],
    messages: [
      msg(
        "reminders@clinic.example",
        "City Clinic",
        "Appointment Tue 3pm - reschedule at (415) 555-0134",
        noUnsub,
      ),
    ],
  },
  {
    id: "note-to-self",
    label: "benign",
    tags: ["self"],
    messages: [
      msg("me@example.com", "Me", "grocery list", {
        ...noUnsub,
        toAddresses: ["me@example.com"],
        authenticationResults: pass("example.com"),
      }),
    ],
  },
  {
    id: "marketer-fake-re",
    label: "benign",
    tags: ["fake-thread-fp", "newsletter"],
    messages: [msg("hello@shop.example", "Shop", "Re: the items in your cart", { referencesCount: 0 })],
  },
  {
    id: "xyz-legit-startup",
    label: "benign",
    tags: ["risky-tld-fp", "newsletter"],
    messages: [msg("hello@buildspace.xyz", "Buildspace", "Demo day recap")],
  },
];

export const THREAT_CORPUS: ThreatCase[] = [
  ...lookalikeCases,
  ...quietLookalikes,
  ...freemailCases,
  ...ownFreemailCases,
  ...punycodeCases,
  ...disguisedNameCases,
  ...blocklistCases,
  ...becCases,
  ...attachmentCases,
  ...trendCases,
  ...ownBrandCases,
  ...resemblesBrandCases,
  ...awkwardBenignCases,
];
