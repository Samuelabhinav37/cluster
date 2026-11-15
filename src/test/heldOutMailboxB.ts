// Held-out mailbox B (cycle 2): written before the cycle-2 changes, with new
// made-up brands. Heavier on what cycle 1 missed: one sender mixing codes,
// statements and ads; bills and statements from unlisted banks; scam
// campaigns (one wording from many free-mail addresses, as sextortion and
// callback-phishing runs are sent); friends with varied subjects, like real ones.
import { chance, digits, mail, pick, reply, sender, type Tab, type Template } from "./mailboxGen";
import { personPair } from "./tunedMailbox";

// Answer-key fix after the first run: "New login detected" is an account
// notice, so Accounts counts as right for app notifications.
export const HELD_OUT_B_SEED = 777;

const brands = (names: string[], local: string, sub = "") =>
  names.map((b) => [`${local}@${sub}${b.toLowerCase().replace(/[^a-z]/g, "")}.example`, b] as [string, string]);
const BANK = brands(["Summit Federal", "Riverbend Savings", "Oakline Card"], "alerts");
const UTILITIES = brands(["Cascade Power", "Lumen Fiber", "Waveline Mobile"], "billing");
const SUBS = brands(["Streamory", "Cloudlocker", "Fitloop"], "no-reply");
const STORES = brands(["Saltbox Supply", "Pinegrove", "Hearthstone Co"], "shipping");
const MARKETING = brands(["Saltbox Supply", "Pinegrove", "Hearthstone Co", "Glimmer", "Rowan & Reed", "Nightjar"], "news", "mail.");
const PUBLISHERS = brands(["The Quiet Index", "Margin Notes", "Daily Circuit", "Open Plot"], "editor");
const NETWORKS = brands(["Huddlr", "Snapgrove"], "notifications");
const TICKETS = brands(["Stagepass", "Venuely"], "tickets");
const SCHOOLS: [string, string][] = [["registrar@northfield.edu", "Northfield Registrar"], ["no-reply@canvas.lakeside.edu", "Lakeside Canvas"]];
const ATS = brands(["Hireloop", "Talentdesk"], "no-reply");
const APPS = brands(["Orbitly", "Notecraft", "Zappyform", "Gridwise"], "noreply");

// Friends write about anything: varied subjects, rarely the same twice.
const TOPICS = ["dinner", "the trip", "mom's birthday", "the game", "rent", "the photos", "saturday", "the car", "grandma", "the wedding", "the playlist", "the move"];
const DAYS = ["tonight", "on friday", "this weekend", "tomorrow", "next week", "on sunday", "later"];
const friendSubject = () => {
  const t = pick(TOPICS);
  return pick([`Re: ${t}`, `${t} ${pick(DAYS)}?`, `about ${t}`, `Fwd: ${t}`, `quick q about ${t}`, `pics from ${t}`, `${t} ${pick(DAYS)}`]);
};

export const HELD_OUT_B: Template[] = [
  // One bank sending three kinds of mail.
  { group: "Bank code (mixed sender)", accept: ["otp"], count: 40, make: () => mail(...sender(BANK), `Your one-time passcode is ${digits(6)}`) },
  { group: "Bank statement (mixed sender)", accept: ["finance", "screener"], count: 60, make: () => mail(...sender(BANK), pick(["Your statement is available", "Your available balance is low", "A direct deposit was posted", "Your monthly account summary"]), { important: chance(0.5) }) },
  { group: "Bank offer (mixed sender)", accept: ["promotions", "finance"], count: 40, make: () => mail(...sender(BANK), pick(["You're pre-approved: 0% APR", "Earn 3% cash back this month"]), { unsub: true, tab: "promotions" }) },
  { group: "Credit union statement (unlisted)", accept: ["finance", "screener"], count: 60, make: () => mail(...sender(brands(["Ridgeway Credit Union", "Harbor Lane CU"], "estatements")), pick(["Your eStatement is ready", "Your account summary", "Low balance alert"])) },
  { group: "Utility or phone bill (unlisted)", accept: ["receipt", "finance", "screener"], count: 60, make: () => mail(...sender(UTILITIES), pick(["Your bill is ready", "Autopay scheduled for Nov 20", "Payment received - thank you", "Your invoice is available"])) },
  { group: "Subscription renewal (unlisted)", accept: ["receipt", "screener"], count: 60, make: () => mail(...sender(SUBS), pick(["Your plan renews on Dec 1", "Receipt for your subscription", "Your payment was successful"]), { purchase: chance(0.5) }) },

  // Stores and lists.
  { group: "Shipping (unlisted)", accept: ["shipping"], count: 120, make: () => mail(...sender(STORES), pick(["Your order is on its way", `Shipment ${digits(6)} delivered`, "Arriving tomorrow", "Your tracking number"])) },
  { group: "Promotion, Promotions tab", accept: ["promotions"], count: 480, make: () => mail(...sender(MARKETING), pick(["Weekend sale: 25% off", "New colors just landed", "Free gift with every order", "Last chance for early access"]), { unsub: true, tab: "promotions" }) },
  { group: "Newsletter (unlisted)", accept: ["newsletter", "promotions"], count: 280, make: () => mail(...sender(PUBLISHERS), pick([`No. ${digits(3)}: the week in review`, "Sunday edition", "What we're reading", "A short note on the news"]), { unsub: true, listId: "<edition.list.example>", tab: pick<Tab>(["updates", "promotions", "primary"]) }) },
  { group: "Social network, Social tab", accept: ["social", "newsletter"], count: 80, make: () => mail(...sender(NETWORKS), pick(["You have new connections", "Alex shared a post", "Your weekly highlights"]), { unsub: true, tab: "social" }) },
  { group: "Event tickets (unlisted)", accept: ["receipt", "shopping", "screener", "travel"], count: 50, make: () => mail(...sender(TICKETS), pick(["Your tickets for Saturday", "Order confirmation: 2 tickets", "Your event is tomorrow"]), { purchase: chance(0.5) }) },
  { group: "School (unlisted .edu)", accept: ["education"], count: 60, make: () => mail(...sender(SCHOOLS), pick(["Registration opens Monday", "New announcement in CS 201", "Grades posted"]), { unsub: chance(0.4) }) },
  { group: "Job application (unlisted ATS)", accept: ["jobs", "screener"], count: 60, make: () => mail(...sender(ATS), pick(["Thank you for applying", "Your application was received", "Next steps for your application"]), { tab: "primary" }) },
  { group: "Unknown app notifications", accept: ["screener", "accounts"], count: 100, make: () => mail(...sender(APPS), pick(["Your weekly digest", "Someone viewed your file", "Your trial is ending", "New login detected"]), { autoSubmitted: chance(0.5) }) },

  // People.
  { group: "Friend, varied subject", accept: ["personal"], count: 160, make: () => mail(...personPair(["gmail.com", "outlook.com", "yahoo.com", "icloud.com"]), friendSubject(), { tab: "primary", important: chance(0.6) }) },
  { group: "Friend's group email", accept: ["personal"], count: 30, make: () => mail(...personPair(["gmail.com"]), `${pick(["potluck", "ski trip", "book club"])} plan for ${pick(DAYS)}`, { tab: "primary", cc: 10 }) },
  { group: "New colleague (unlisted company)", accept: ["personal"], count: 60, make: () => mail(...personPair(["northwind.example", "fabrikam.example"]), pick(["Kickoff agenda", "Feedback on the draft", "Can we move our call?", "Budget numbers for Q1"]), { tab: "primary", via: "person" }) },
  { group: "Known contacts", accept: ["personal"], count: 40, make: () => mail(...sender([["priya.n@corp.example", "Priya Nair"], ["mom.family@gmail.com", "Mom"], ["sivaram.challa@gmail.com", "Sivaram Challa"]]), friendSubject(), { tab: "primary", via: "person" }) },
  { group: "Reply in your thread from a company", accept: ["personal"], count: 30, make: () => reply(mail(...sender(brands(["Cloudlocker", "Lumen Fiber"], "help")), `Re: case ${digits(6)}`)) },
  { group: "Bounce notice", accept: ["screener", "inbox", "personal"], count: 10, make: () => mail("postmaster@outlook.com", "Postmaster", "Undeliverable: about the trip", { auth: "none", via: "own" }) },

  // Scam campaigns: one wording, many throwaway addresses.
  { group: "Scam campaign: sextortion", accept: ["spam", "screener"], count: 50, make: () => mail(personPair(["gmail.com", "outlook.com"], () => digits(4))[0], pick(["Anonymous", "Private"]), pick(["Your device was compromised. Read this message carefully", "I recorded everything. You have 48 hours"]), { tab: "primary" }), spoofs: true },
  { group: "Scam campaign: callback renewal", accept: ["spam", "screener"], count: 30, make: () => mail(personPair(["gmail.com"], () => digits(4))[0], "Billing Department", `Your subscription renewed for $${pick(["399.99", "489.00", "299.95"])} - order ${digits(8)}`, { tab: "primary" }), spoofs: true },
  { group: "Scam: lookalike of a listed brand", accept: ["spam", "screener"], count: 20, make: () => mail("support@chase-securemsg.com", "Chase", "We noticed a sign-in from a new device", { tab: "primary" }) },
  { group: "Scam: closure lure, own domain", accept: ["spam", "screener"], count: 20, make: () => mail("admin@mailbox-quota-alert.example", "Mail Admin", "Your mailbox will be deleted. Confirm your account now", { tab: "primary" }) },
];
