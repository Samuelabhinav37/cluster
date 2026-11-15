// Held-out mailbox C (cycle 3): written before the cycle-3 changes, with new
// made-up brands. Heavier on relationships: cold sales and recruiting
// outreach typed in Gmail with fake "Re:" follow-ups, strangers writing on
// threads with your contacts copied, real replies (with In-Reply-To), and a
// fake-thread payment scam, on top of the usual mix.
import { chance, digits, mail, pick, reply, sender, type Tab, type Template } from "./mailboxGen";
import { personPair } from "./tunedMailbox";

export const HELD_OUT_C_SEED = 9001;

const brands = (names: string[], local: string, sub = "") =>
  names.map((b) => [`${local}@${sub}${b.toLowerCase().replace(/[^a-z]/g, "")}.example`, b] as [string, string]);
const SHOPS = brands(["Driftwood Outfitters", "Kiln & Co", "Bramble"], "orders");
const MARKETING = brands(["Driftwood Outfitters", "Kiln & Co", "Bramble", "Lumio", "Ferncraft", "Quarry"], "hi", "e.");
const PUBLISHERS = brands(["Slow Signal", "The Ledger Line", "Weeknotes"], "letters");
const APPS = brands(["Beaconly", "Formstack Lite", "Tilework"], "no-reply");
const BANK = brands(["Copper Valley Bank"], "notices");
const NETWORK = brands(["Meetwell"], "updates");
const DAYS = ["tomorrow", "on thursday", "next week", "this weekend"];

export const HELD_OUT_C: Template[] = [
  // The usual mix, new brands.
  { group: "Code (unlisted)", accept: ["otp"], count: 70, make: () => mail(...sender(APPS), `Your security code is ${digits(6)}`) },
  { group: "Shipping (unlisted)", accept: ["shipping"], count: 110, make: () => mail(...sender(SHOPS), pick(["Your order has shipped", "Out for delivery", "Delivered: your package"])) },
  { group: "Receipt (unlisted)", accept: ["receipt", "shopping", "shipping"], count: 90, make: () => mail(...sender(SHOPS), pick([`Receipt for order ${digits(5)}`, "Thanks for your purchase"]), { purchase: chance(0.6) }) },
  { group: "Bank statement (unlisted)", accept: ["finance", "screener"], count: 50, make: () => mail(...sender(BANK), pick(["Your statement is ready", "Your current balance", "A deposit was posted"])) },
  { group: "Promotion, Promotions tab", accept: ["promotions"], count: 510, make: () => mail(...sender(MARKETING), pick(["Fall sale ends Sunday", "Something new for you", "20% off your next order"]), { unsub: true, tab: "promotions" }) },
  { group: "Newsletter (unlisted)", accept: ["newsletter", "promotions"], count: 240, make: () => mail(...sender(PUBLISHERS), pick([`Weeknote ${digits(2)}`, "This month in review", "Three things I learned"]), { unsub: true, listId: "<letters.list.example>", tab: pick<Tab>(["updates", "promotions"]) }) },
  { group: "Social network, Social tab", accept: ["social", "newsletter"], count: 70, make: () => mail(...sender(NETWORK), pick(["You have 2 new invites", "Events near you"]), { unsub: true, tab: "social" }) },
  { group: "Unknown app notifications", accept: ["screener", "accounts"], count: 90, make: () => mail(...sender(APPS), pick(["Your weekly usage report", "New form submission", "Your workspace was updated"]), { autoSubmitted: chance(0.5) }) },

  // Cold outreach: typed in Gmail, one person per company, follow-ups as fake replies.
  { group: "Cold sales outreach, first touch", accept: ["screener", "personal"], count: 60, make: () => mail(...personPair(["growthly.example", "leadforge.example", "pipelinehq.example"]), pick(["Quick question, Samuel", "Idea for Cluster", "15 minutes next week?"]), { tab: "primary", via: "person" }) },
  { group: "Cold sales outreach, fake Re: follow-up", accept: ["screener"], count: 90, make: () => mail(...personPair(["growthly.example", "leadforge.example", "pipelinehq.example"]), pick(["Re: Quick question, Samuel", "Re: Idea for Cluster", "Re: following up"]), { tab: "primary", via: "person", fakeReply: true }) },
  { group: "Recruiter outreach, fake Re:", accept: ["screener", "jobs"], count: 50, make: () => mail(...personPair(["talentbridge.example", "hirewise.example"]), pick(["Re: Senior Engineer role", "Re: Your background"]), { tab: "primary", via: "person", fakeReply: true }) },

  // People and threads.
  // Strangers on free mail wait in the Screener until you say yes (2026-11-15 decision).
  { group: "Friend, real reply", accept: ["screener", "personal"], count: 120, make: () => mail(...personPair(["gmail.com", "icloud.com", "outlook.com"]), `Re: ${pick(["dinner", "the trip", "photos", "the game"])} ${pick(DAYS)}`, { tab: "primary" }) },
  { group: "Friend, new message", accept: ["screener", "personal"], count: 100, make: () => mail(...personPair(["gmail.com", "yahoo.com"]), `${pick(["coffee", "lunch", "a call", "the hike"])} ${pick(DAYS)}?`, { tab: "primary" }) },
  { group: "Stranger on a thread with your contact copied", accept: ["personal"], count: 60, make: () => mail(...personPair(["vendorco.example", "agencyone.example"]), pick(["Re: offsite planning", "Intro: Priya mentioned you", "Invoice process for the project"]), { tab: "primary", ccTo: ["priya.n@corp.example"], via: pick(["person", "own"] as const) }) },
  { group: "Known contacts", accept: ["personal"], count: 50, make: () => mail(...sender([["priya.n@corp.example", "Priya Nair"], ["dan@friends.example", "Dan Brooks"]]), pick(["Re: notes", "can you call?", "Draft for review"]), { tab: "primary", via: "person" }) },
  { group: "Reply in your thread from a company", accept: ["personal"], count: 30, make: () => reply(mail(...sender(brands(["Tilework"], "support")), `Re: request ${digits(5)}`)) },
  { group: "School (unlisted .edu)", accept: ["education"], count: 50, make: () => mail(...sender([["advising@westbrook.edu", "Westbrook Advising"]]), pick(["Advising appointments open", "Spring course list"])) },
  { group: "Job application (unlisted ATS)", accept: ["jobs", "screener"], count: 50, make: () => mail(...sender(brands(["Applyflow"], "no-reply")), pick(["Thank you for applying", "Update on your application"]), { tab: "primary" }) },

  // Scams.
  { group: "Scam: fake-thread payment request", accept: ["spam", "screener"], count: 30, make: () => mail(personPair(["gmail.com"], () => digits(4))[0], "Accounts Team", "Re: overdue payment - updated bank details attached", { tab: "primary", fakeReply: true }), spoofs: true },
  { group: "Scam campaign: extortion", accept: ["spam", "screener"], count: 40, make: () => mail(personPair(["outlook.com"], () => digits(4))[0], "Unknown", "I have access to your device and your contacts list", { tab: "primary" }), spoofs: true },
  { group: "Scam: lookalike of a listed brand", accept: ["spam", "screener"], count: 30, make: () => mail("alerts@wellsfarg0-online.com", "Wells Fargo", "Action required: verify your account", { tab: "primary" }) },
  { group: "Scam: name of a contact", accept: ["spam", "screener"], count: 10, make: () => mail("priya.nair.work@outlook.com", "Priya Nair", "Re: quick favor", { tab: "primary", fakeReply: true }), spoofs: true },
];
