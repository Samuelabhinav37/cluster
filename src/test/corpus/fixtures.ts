// The accuracy corpus: synthetic mail with a known true class, scored by
// src/lib/accuracy.test.ts. Synthetic on purpose: no real mailbox, and no
// corpus without a clear licence (research/2026-10-26-gmail-headers-body-and-accuracy.md §6).
//
// Each fixture is one sender. Addresses must be unique so the pipeline never
// merges two fixtures. `variantOf` marks an adversarial copy of another
// fixture (homoglyph, zero-width, run-together); it must never score a lower
// threat tier than the original.
import type { MessageKind } from "../../lib/messageKind";
import type { NormalizedMessageMetadata } from "../../lib/providers/emailProvider";
import { authResults } from "../mailFixtures";

export type TrueClass = "personal" | "transactional" | "otp" | "bulk" | "social" | "phishing";

export interface Fixture {
  id: string;
  cls: TrueClass;
  /** The message kind a correct classifier gives it, when one fits. */
  kind?: MessageKind;
  /** The user has written to this address. */
  correspondent?: boolean;
  variantOf?: string;
  msg: Partial<NormalizedMessageMetadata> & { fromAddress: string };
}

type Extra = Partial<NormalizedMessageMetadata>;
const domainOf = (address: string) => address.split("@")[1] ?? "";

/** A person writing directly: no list headers, authenticated. */
const person = (fromAddress: string, fromDisplayName: string, subject: string, extra: Extra = {}) => ({
  fromAddress,
  fromDisplayName,
  subject,
  unsubscribe: {},
  ...extra,
});

/** Bulk mail with a List-Unsubscribe, authenticated. */
const bulk = (fromAddress: string, fromDisplayName: string, subject: string, extra: Extra = {}) => ({
  fromAddress,
  fromDisplayName,
  subject,
  unsubscribe: { httpUrl: `https://${domainOf(fromAddress)}/u` },
  ...extra,
});

/** System mail: no List-Unsubscribe, Auto-Submitted set (account mail, codes). */
const system = (fromAddress: string, fromDisplayName: string, subject: string, extra: Extra = {}) => ({
  fromAddress,
  fromDisplayName,
  subject,
  unsubscribe: {},
  autoSubmitted: "auto-generated",
  ...extra,
});

const failed = (fromAddress: string): Extra => ({
  authenticationResults: authResults(domainOf(fromAddress), false),
});

export const FIXTURES: Fixture[] = [
  // ── personal ────────────────────────────────────────────────────────────
  {
    id: "p-dinner",
    cls: "personal",
    kind: "other",
    msg: person("maya.r@gmail.com", "Maya", "dinner friday?"),
  },
  {
    id: "p-trip",
    cls: "personal",
    kind: "other",
    msg: person("leo.k@gmail.com", "Leo", "Re: photos from the trip"),
  },
  {
    id: "p-lease",
    cls: "personal",
    kind: "other",
    msg: person("landlord.pat@yahoo.com", "Pat Owens", "quick question about the lease"),
  },
  {
    id: "p-chase",
    cls: "personal",
    kind: "other",
    msg: person("chase.miller@gmail.com", "Chase Miller", "running late"),
  },
  {
    id: "p-apple",
    cls: "personal",
    kind: "other",
    msg: person("jordan.apple@gmail.com", "Jordan Apple", "saturday hike"),
  },
  {
    id: "p-draft",
    cls: "personal",
    kind: "other",
    msg: person("ines@studio-nord.de", "Ines Vogel", "Can you review my draft"),
  },
  {
    id: "p-2fa",
    cls: "personal",
    kind: "other",
    msg: person("dev.sam@gmail.com", "Sam", "Enable 2FA on the shared account pls"),
  },
  {
    id: "p-code",
    cls: "personal",
    kind: "other",
    msg: person("ravi.t@acme-labs.io", "Ravi T", "Your code is in the repo now"),
  },
  {
    id: "p-receipt-talk",
    cls: "personal",
    kind: "other",
    msg: person("noor@gmail.com", "Noor", "Tracking down the receipt from dinner"),
  },
  {
    id: "p-bday",
    cls: "personal",
    kind: "other",
    msg: person("aunt.lu@hotmail.com", "Lu", "Mom's birthday plans"),
  },
  {
    id: "p-meeting",
    cls: "personal",
    kind: "other",
    msg: person("kim.park@northwind.com", "Kim Park", "Notes from today's meeting"),
  },
  {
    id: "p-fwd",
    cls: "personal",
    kind: "other",
    msg: person("dad.h@gmail.com", "Dad", "Fwd: lease agreement"),
  },
  {
    id: "p-congrats",
    cls: "personal",
    kind: "other",
    msg: person("old.friend.ty@gmail.com", "Ty", "Congrats on the new job!!"),
  },
  {
    id: "p-rsvp",
    cls: "personal",
    kind: "other",
    msg: person("ana.and.ben@gmail.com", "Ana & Ben", "Re: Re: wedding RSVP"),
  },
  {
    id: "p-msft-friend",
    cls: "personal",
    kind: "other",
    correspondent: true,
    msg: person("priya.s@outlook.com", "Priya (Microsoft)", "interview prep notes"),
  },
  {
    id: "p-treasurer",
    cls: "personal",
    kind: "other",
    msg: person("chess.club.treasurer@gmail.com", "Club Treasurer", "Statement for the club accounts"),
  },
  {
    id: "p-freelance",
    cls: "personal",
    kind: "receipt",
    msg: person("mo@modesign.studio", "Mo", "Here's the invoice for the logo work"),
  },
  {
    id: "p-hr",
    cls: "personal",
    kind: "other",
    msg: person("hr.julia@northwind.com", "Julia (HR)", "Verification of employment letter"),
  },
  {
    id: "p-wifi",
    cls: "personal",
    kind: "other",
    msg: person("roommate.zed@gmail.com", "Zed", "password for the wifi"),
  },
  {
    id: "p-important",
    cls: "personal",
    kind: "other",
    msg: person("coach.dana@gmail.com", "Coach Dana", "practice moved to 6", {
      providerMarkedPersonal: true,
    }),
  },

  // ── transactional ───────────────────────────────────────────────────────
  {
    id: "t-shipped",
    cls: "transactional",
    kind: "shipping",
    msg: bulk("shipment-tracking@amazon.com", "Amazon.com", "Your Amazon.com order #112-334 has shipped"),
  },
  {
    id: "t-apple-receipt",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("no_reply@email.apple.com", "Apple", "Your receipt from Apple"),
  },
  {
    id: "t-tickets",
    cls: "transactional",
    kind: "other",
    msg: bulk("orders@ticketmaster.com", "Ticketmaster", "Your tickets for Taylor Swift | The Eras Tour"),
  },
  {
    id: "t-reservations",
    cls: "transactional",
    kind: "other",
    msg: bulk("noreply@booking.com", "Booking.com", "Your reservations in Lisbon are confirmed"),
  },
  {
    id: "t-invoice",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("billing@acmehosting.com", "Acme Hosting", "Invoice INV-2201 from Acme Hosting"),
  },
  {
    id: "t-signin",
    cls: "transactional",
    kind: "other",
    msg: system("no-reply@accounts.google.com", "Google", "Security alert: new sign-in to your account"),
  },
  {
    id: "t-reset",
    cls: "transactional",
    kind: "other",
    msg: system("account-security@github.com", "GitHub", "Reset your password"),
  },
  {
    id: "t-boarding",
    cls: "transactional",
    kind: "other",
    msg: system("checkin@united.com", "United Airlines", "Your boarding pass for UA 1234"),
  },
  {
    id: "t-appt",
    cls: "transactional",
    kind: "other",
    msg: system("reminders@onemedical.com", "One Medical", "Appointment confirmed: Dr. Lee, Tue 3pm"),
  },
  {
    id: "t-netflix-renew",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("info@account.netflix.com", "Netflix", "Your Netflix membership will renew on Nov 3"),
  },
  {
    id: "t-apple-renew",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("renewals@email.apple.com", "Apple", "Your subscription is renewing soon"),
  },
  {
    id: "t-payment",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("billing@pge.com", "PG&E", "Payment received - thank you"),
  },
  {
    id: "t-estatement",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("alerts@bankofamerica.com", "Bank of America", "Your e-statement is ready"),
  },
  {
    id: "t-ofd",
    cls: "transactional",
    kind: "shipping",
    msg: bulk("pkginfo@ups.com", "UPS", "Out for delivery: your package"),
  },
  {
    id: "t-order-confirmed",
    cls: "transactional",
    kind: "shipping",
    msg: bulk("orders@etsy.com", "Etsy", "Your order is confirmed"),
  },
  {
    id: "t-uber",
    cls: "transactional",
    kind: "receipt",
    msg: bulk("noreply@uber.com", "Uber Receipts", "Your Thursday evening trip with Uber"),
  },
  {
    id: "t-w2",
    cls: "transactional",
    kind: "other",
    msg: system("noreply@adp.com", "ADP", "Your W-2 is available"),
  },
  {
    id: "t-itinerary",
    cls: "transactional",
    kind: "other",
    msg: bulk("travel@expedia.com", "Expedia", "Your flight itinerary: SFO to JFK"),
  },
  {
    id: "t-1099",
    cls: "transactional",
    kind: "other",
    msg: system("documents@fidelity.com", "Fidelity", "Your 1099 tax form is ready"),
  },
  {
    id: "t-rental",
    cls: "transactional",
    kind: "other",
    msg: bulk("reservations@hertz.com", "Hertz", "Your rental agreement and pickup details"),
  },

  // ── one-time codes (fixtures are 10 days old, so these are stale) ──────
  {
    id: "o-verif",
    cls: "otp",
    kind: "otp",
    msg: system("noreply@signup.example.com", "Example", "482913 is your verification code"),
  },
  {
    id: "o-login",
    cls: "otp",
    kind: "otp",
    msg: system("no-reply@notion.so", "Notion", "Your login code: 7731"),
  },
  {
    id: "o-slack",
    cls: "otp",
    kind: "otp",
    msg: system("feedback@slack.com", "Slack", "Slack confirmation code: QXT-882"),
  },
  {
    id: "o-github-device",
    cls: "otp",
    kind: "otp",
    msg: system("noreply@github.com", "GitHub", "[GitHub] Please verify your device"),
  },
  {
    id: "o-signin-num",
    cls: "otp",
    kind: "otp",
    msg: system("noreply@discord.com", "Discord", "Use 9921 to sign in"),
  },
  {
    id: "o-passcode",
    cls: "otp",
    kind: "otp",
    msg: system("no-reply@alertsp.chase.com", "Chase", "Your one-time passcode"),
  },
  {
    id: "o-msft",
    cls: "otp",
    kind: "otp",
    msg: system(
      "account-security-noreply@accountprotection.microsoft.com",
      "Microsoft account team",
      "Microsoft account security code",
    ),
  },
  {
    id: "o-signin-code",
    cls: "otp",
    kind: "otp",
    msg: system("login@figma.com", "Figma", "Your sign-in code"),
  },
  {
    id: "o-confirm-email",
    cls: "otp",
    kind: "otp",
    msg: system("hello@linear.app", "Linear", "Confirm your email address"),
  },
  {
    id: "o-2fa",
    cls: "otp",
    kind: "otp",
    msg: system("security@coinbase.com", "Coinbase", "Two-factor authentication code: 551234"),
  },
  {
    id: "o-french",
    cls: "otp",
    kind: "otp",
    msg: system("noreply@leboncoin.fr", "leboncoin", "Votre code de vérification : 304411"),
  },
  {
    id: "o-spanish",
    cls: "otp",
    kind: "otp",
    msg: system("no-reply@mercadolibre.com", "Mercado Libre", "Tu código de verificación es 7790"),
  },

  // ── bulk: newsletters and marketing ─────────────────────────────────────
  {
    id: "b-free-delivery",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("deals@shopnest.com", "ShopNest", "Free delivery on all orders this weekend"),
  },
  {
    id: "b-tracking-goals",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("hello@fitloop.app", "FitLoop", "Tracking your 2026 fitness goals"),
  },
  {
    id: "b-statement",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("news@cloudbase.io", "Cloudbase", "Our statement on today's outage"),
  },
  {
    id: "b-ends-tonight",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("sale@threadly.com", "Threadly", "Flash sale ends tonight — 40% off"),
  },
  {
    id: "b-tickets-promo",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("news@summerfest.com", "Summerfest", "Last chance: tickets selling fast"),
  },
  {
    id: "b-ai-week",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("digest@aiweekly.news", "AI Weekly", "This week in AI"),
  },
  {
    id: "b-picked",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("recs@marketplace.example.com", "Marketplace", "Deals picked for you"),
  },
  {
    id: "b-arrivals",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("style@lumenwear.com", "Lumen", "New arrivals you'll love"),
  },
  {
    id: "b-digest",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("digest@medium.com", "Medium Daily Digest", "Your weekly digest"),
  },
  {
    id: "b-spring",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("hello@oakandpine.co", "Oak & Pine", "Spring collection is here"),
  },
  {
    id: "b-members",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("members@gymco.com", "GymCo", "Members-only: 30% off"),
  },
  {
    id: "b-getaway",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("offers@travelzoo.com", "Travelzoo", "Book your next getaway and save 20%"),
  },
  {
    id: "b-webinar",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("events@pgcloud.dev", "PG Cloud", "Webinar: scaling Postgres"),
  },
  {
    id: "b-brew",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("crew@morningbrew.com", "Morning Brew", "☕ The chip war heats up"),
  },
  {
    id: "b-coupon",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("save@petsupply.com", "PetSupply", "Expires soon: your 15% coupon"),
  },
  {
    id: "b-cart",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("alerts@gadgethub.com", "GadgetHub", "Price drop on items in your cart"),
  },
  {
    id: "b-bf",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("vip@bigbox.com", "BigBox", "Black Friday early access starts now"),
  },
  {
    id: "b-free-shipping",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("shop@candleco.com", "CandleCo", "Order now and get free shipping"),
  },
  {
    id: "b-tax-tips",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("blog@budgetwise.com", "BudgetWise", "Tax season tips from our blog"),
  },
  {
    id: "b-security-tips",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("news@safebank.example", "SafeBank", "Security alert: phishing scams to watch this holiday"),
  },
  {
    id: "b-substack",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("lenny@substack.com", "Lenny's Newsletter", "How the best PMs prioritize"),
  },
  {
    id: "b-substack-2",
    cls: "bulk",
    kind: "newsletter",
    msg: bulk("platformer@substack.com", "Platformer", "The week in tech policy"),
  },

  // ── social and notifications ────────────────────────────────────────────
  {
    id: "s-commented",
    cls: "social",
    kind: "social",
    msg: bulk("notifications-noreply@linkedin.com", "LinkedIn", "Priya commented on your post"),
  },
  {
    id: "s-follower",
    cls: "social",
    kind: "social",
    msg: bulk("notify@twitter.com", "X", "You have a new follower"),
  },
  {
    id: "s-mentioned",
    cls: "social",
    kind: "social",
    msg: bulk("notification@facebookmail.com", "Facebook", "Alex mentioned you in a comment"),
  },
  {
    id: "s-liked",
    cls: "social",
    kind: "social",
    msg: bulk("no-reply@mail.instagram.com", "Instagram", "Sam liked your photo"),
  },
  {
    id: "s-friend",
    cls: "social",
    kind: "social",
    msg: bulk("friends@facebookmail.com", "Facebook", "New friend request from Jordan"),
  },
  {
    id: "s-searches",
    cls: "social",
    kind: "social",
    msg: bulk("messages-noreply@linkedin.com", "LinkedIn", "You appeared in 12 searches this week"),
  },
  {
    id: "s-tagged",
    cls: "social",
    kind: "social",
    msg: bulk("tags@facebookmail.com", "Facebook", "Dana tagged you in a photo"),
  },
  {
    id: "s-viewed",
    cls: "social",
    kind: "social",
    msg: bulk("profile@linkedin.com", "LinkedIn", "Someone viewed your profile"),
  },
  {
    id: "s-reddit",
    cls: "social",
    kind: "social",
    msg: bulk("noreply@redditmail.com", "Reddit", "Trending in r/askscience"),
  },
  {
    id: "s-network",
    cls: "social",
    kind: "social",
    msg: bulk("updates@linkedin.com", "LinkedIn", "Trending in your network"),
  },
  {
    id: "s-group",
    cls: "social",
    kind: "social",
    msg: bulk("groups-noreply@nextdoor.com", "Nextdoor", "3 new posts in your neighborhood"),
  },
  {
    id: "s-anniversary",
    cls: "social",
    kind: "social",
    msg: bulk("celebrate@linkedin.com", "LinkedIn", "Congratulate Ana on her work anniversary"),
  },

  // ── phishing and scams ──────────────────────────────────────────────────
  {
    id: "x-paypa1",
    cls: "phishing",
    msg: person(
      "service@paypa1-secure.com",
      "PayPal Security",
      "Your account has been suspended",
      failed("service@paypa1-secure.com"),
    ),
  },
  {
    id: "x-paypal-name",
    cls: "phishing",
    msg: person("notify@secure-mailer.net", "PayPal", "Your account has been suspended"),
  },
  {
    id: "x-paypal-cyrillic",
    cls: "phishing",
    variantOf: "x-paypal-name",
    msg: person("notify@secure-mailer2.net", "PаyPal", "Your account has been suspended"),
  },
  {
    id: "x-paypal-zwsp",
    cls: "phishing",
    variantOf: "x-paypal-name",
    msg: person("notify@secure-mailer3.net", "Pay​Pal", "Your account has been suspended"),
  },
  {
    id: "x-paypal-runon",
    cls: "phishing",
    variantOf: "x-paypal-name",
    msg: person("notify@secure-mailer4.net", "PayPalSupport", "Your account has been suspended"),
  },
  {
    id: "x-combosquat",
    cls: "phishing",
    msg: person("service@paypal-account-verify.com", "PayPal", "Confirm your identity now"),
  },
  {
    id: "x-arnazon",
    cls: "phishing",
    msg: person("orders@arnazon.com", "Amazon", "Your order could not be shipped"),
  },
  {
    id: "x-google-gmail",
    cls: "phishing",
    msg: person("google.security.team@gmail.com", "Google Security", "Unusual sign-in activity"),
  },
  {
    id: "x-google-gmail-zwsp",
    cls: "phishing",
    variantOf: "x-google-gmail",
    msg: person("google.security.team2@gmail.com", "Goo​gle Security", "Unusual sign-in activity"),
  },
  {
    id: "x-msft-outlook",
    cls: "phishing",
    msg: person("ms.account.team@outlook.com", "Microsoft Account Team", "Your password will expire today"),
  },
  {
    id: "x-apple-icloud",
    cls: "phishing",
    msg: person("appleid.support@icloud.com", "Apple Support", "Your Apple ID has been locked"),
  },
  {
    id: "x-apple-icloud-cyrillic",
    cls: "phishing",
    variantOf: "x-apple-icloud",
    msg: person("appleid.support2@icloud.com", "Аpple Support", "Your Apple ID has been locked"),
  },
  {
    id: "x-blocklisted",
    cls: "phishing",
    msg: person("billing@airtickts.com", "Accounts", "Invoice overdue"),
  },
  {
    id: "x-chase-spoof",
    cls: "phishing",
    msg: person("alerts@chase.com", "Chase", "Unusual activity on your card", {
      ...failed("alerts@chase.com"),
      replyToAddress: "chasehelp.desk@gmail.com",
    }),
  },
  {
    id: "x-punycode",
    cls: "phishing",
    msg: person("security@xn--pypal-4ve.com", "PayPal", "Verify your account within 24 hours"),
  },
  {
    id: "x-failed-lure",
    cls: "phishing",
    msg: person(
      "billing@acme-billing.co",
      "Billing",
      "Final notice: payment failed",
      failed("billing@acme-billing.co"),
    ),
  },
  {
    id: "x-dhl",
    cls: "phishing",
    msg: person("track@dh1-express.com", "DHL Express", "Your parcel is on hold"),
  },
  {
    id: "x-netflix",
    cls: "phishing",
    msg: person(
      "support@netflix-billing-update.com",
      "Netflix",
      "Payment declined: update your billing details to avoid suspension",
    ),
  },
  {
    id: "x-irs",
    cls: "phishing",
    msg: person("refunds@irs-gov-refund.com", "IRS", "You are eligible for a tax refund"),
  },
  {
    id: "x-attachment",
    cls: "phishing",
    msg: person("accounts@randomco.biz", "Accounts Payable", "Overdue invoice attached", {
      hasRiskyAttachment: true,
    }),
  },
  {
    id: "x-coinbsae",
    cls: "phishing",
    msg: person("no-reply@coinbsae.com", "Coinbase", "New device sign-in"),
  },
  {
    id: "x-wells-freemail",
    cls: "phishing",
    msg: person("wellsfargo.alerts@yahoo.com", "Wells Fargo", "Your account access will be closed"),
  },
  {
    id: "x-ceo",
    cls: "phishing",
    msg: person("ceo.office.mark@gmail.com", "Mark (CEO)", "Urgent wire request"),
  },
  {
    id: "x-giftcard",
    cls: "phishing",
    msg: person("pastor.james.office@gmail.com", "Pastor James", "Are you available?"),
  },
];
