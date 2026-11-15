// Held-out mailbox D: 3,000 made-up emails with new brands, written after the
// first-time-stranger screening and the "verify your email" → Accounts move.
// Heavier on people: strangers on free mail (Screener), friends you write to,
// replies in your threads, invites, notes to yourself, and verify-email lures.
import { chance, digits, mail, ME, pick, reply, sender, type Tab, type Template } from "./mailboxGen";
import { personPair } from "./tunedMailbox";

export const HELD_OUT_D_SEED = 31337;

const brands = (names: string[], local: string, sub = "") =>
  names.map((b) => [`${local}@${sub}${b.toLowerCase().replace(/[^a-z]/g, "")}.example`, b] as [string, string]);
const SHOPS = brands(["Saltmarsh Goods", "Pebble & Pine", "Cobalt Cycles"], "orders");
const MARKETING = brands(["Saltmarsh Goods", "Pebble & Pine", "Cobalt Cycles", "Nimbus Tea", "Larkspur", "Ironleaf"], "news", "mail.");
const PUBLISHERS = brands(["Field Notes Daily", "The Quiet Desk", "Orbit Weekly"], "editor");
const APPS = brands(["Notewell", "Planloop", "Shipyard CI"], "no-reply");
const BANK = brands(["Granite Ridge Credit Union"], "alerts");
const AIRLINE = brands(["Skylark Air"], "itinerary");
const FORUM = brands(["Makers Guild"], "digest");
const DAYS = ["tomorrow", "on friday", "next week", "this weekend"];

export const HELD_OUT_D: Template[] = [
  // Machine mail, new brands.
  { group: "Code (unlisted)", accept: ["otp"], count: 90, make: () => mail(...sender(APPS), pick([`${digits(6)} is your Notewell code`, `Your login code: ${digits(6)}`])) },
  { group: "Verify your email (unlisted app)", accept: ["accounts", "screener"], count: 70, make: () => mail(...sender(APPS), pick(["Verify your email address", "Please confirm your email", "Email verification required"])) },
  { group: "Account alert (unlisted app)", accept: ["accounts", "screener"], count: 60, make: () => mail(...sender(APPS), pick(["New sign-in to your account", "Your password was changed"]), { important: chance(0.4) }) },
  { group: "Shipping (unlisted)", accept: ["shipping"], count: 210, make: () => mail(...sender(SHOPS), pick(["Your order has shipped", "Out for delivery", "Delivered: your package"])) },
  { group: "Receipt (unlisted)", accept: ["receipt", "shopping", "shipping"], count: 120, make: () => mail(...sender(SHOPS), pick([`Receipt for order ${digits(5)}`, "Thanks for your purchase"]), { purchase: chance(0.6) }) },
  { group: "Bank statement (unlisted)", accept: ["finance", "screener"], count: 70, make: () => mail(...sender(BANK), pick(["Your statement is ready", "Your available balance", "A deposit was posted"])) },
  { group: "Flight itinerary (unlisted)", accept: ["travel", "receipt", "shipping", "screener"], count: 60, make: () => mail(...sender(AIRLINE), pick([`Your trip confirmation ${digits(6)}`, "Check in for your flight"])) },
  { group: "Promotion, Promotions tab", accept: ["promotions"], count: 900, make: () => mail(...sender(MARKETING), pick(["Winter sale starts now", "Picked for you", "Free shipping this week"]), { unsub: true, tab: "promotions" }) },
  { group: "Newsletter (unlisted)", accept: ["newsletter", "promotions"], count: 450, make: () => mail(...sender(PUBLISHERS), pick([`Issue ${digits(3)}`, "The week in review", "Five links worth your time"]), { unsub: true, listId: "<editor.list.example>", tab: pick<Tab>(["updates", "promotions"]) }) },
  { group: "Forum digest, Forums tab", accept: ["newsletter", "social", "screener"], count: 60, make: () => mail(...sender(FORUM), pick(["Top posts this week", "New replies in your topics"]), { unsub: true, tab: "forums" }) },
  { group: "Social network, Social tab", accept: ["social", "newsletter"], count: 100, make: () => mail(...sender(brands(["Circlet"], "notify")), pick(["You have new followers", "Someone mentioned you"]), { unsub: true, tab: "social" }) },
  { group: "Unknown app notifications", accept: ["screener", "accounts", "productivity"], count: 120, make: () => mail(...sender(APPS), pick(["Build passed on main", "Your weekly summary", "A file was shared with you"]), { autoSubmitted: chance(0.5) }) },
  { group: "Job application (unlisted ATS)", accept: ["jobs", "screener"], count: 70, make: () => mail(...sender(brands(["Hireline"], "no-reply")), pick(["Thank you for applying", "Update on your application"]), { tab: "primary" }) },
  { group: "School (unlisted .edu)", accept: ["education"], count: 60, make: () => mail(...sender([["registrar@lakemont.edu", "Lakemont Registrar"]]), pick(["Registration opens Monday", "Your spring schedule"])) },

  // People.
  { group: "Stranger on free mail", accept: ["screener", "personal"], count: 150, make: () => mail(...personPair(["gmail.com", "yahoo.com", "outlook.com", "icloud.com"]), pick(["hey, long time!", "photos from saturday", "Invoice for the cabin split", "quick question"]), { tab: "primary", via: "person" }) },
  { group: "Stranger's calendar invite on free mail", accept: ["screener", "personal"], count: 30, make: () => mail(...personPair(["gmail.com", "outlook.com"]), `Invitation: Coffee @ ${pick(["Mon", "Tue", "Wed"])} 10am`, { tab: "primary" }) },
  { group: "Friend you write to (free mail)", accept: ["personal"], count: 60, make: () => mail(...sender([["mom.family@gmail.com", "Mom"], ["sivaram.challa@gmail.com", "Sivaram Challa"]]), pick(["call me later", "Re: the trip", "dinner sunday?"]), { tab: "primary", via: "person" }) },
  { group: "Reply in your thread (free mail)", accept: ["personal"], count: 60, make: () => reply(mail(...personPair(["gmail.com", "yahoo.com"]), `Re: ${pick(["the apartment", "your listing", "the meetup"])} ${pick(DAYS)}`, { tab: "primary", via: "person" })) },
  { group: "Colleague at an unlisted company", accept: ["personal"], count: 70, make: () => mail(...personPair(["harborline.example", "quillworks.example"]), pick(["Agenda for Thursday", "Notes from the review", "Can you take a look?"]), { tab: "primary", via: "person" }) },
  { group: "Stranger with your contact copied", accept: ["personal"], count: 40, make: () => mail(...personPair(["partnerco.example"]), pick(["Intro: Dan suggested we talk", "Re: venue for the offsite"]), { tab: "primary", ccTo: ["dan@friends.example"], via: "person" }) },
  { group: "Note to self", accept: ["personal"], count: 10, make: () => mail(ME, "Samuel", pick(["groceries", "links for later"]), { tab: "primary" }) },

  // Scams.
  { group: "Scam: verify-email lure on free mail", accept: ["spam", "screener"], count: 25, make: () => mail(personPair(["gmail.com"], () => digits(4))[0], "Netflix Support", "Verify your email address to keep your account", { tab: "primary" }), spoofs: true },
  { group: "Scam: fake-thread payment request", accept: ["spam", "screener"], count: 30, make: () => mail(personPair(["yahoo.com"], () => digits(4))[0], "Billing Dept", "Re: invoice past due - new bank details", { tab: "primary", fakeReply: true }), spoofs: true },
  { group: "Scam campaign: extortion", accept: ["spam", "screener"], count: 40, make: () => mail(personPair(["outlook.com"], () => digits(4))[0], "Unknown", "I recorded you through your camera and have your passwords", { tab: "primary" }), spoofs: true },
  { group: "Scam: lookalike of a listed brand", accept: ["spam", "screener"], count: 30, make: () => mail("security@paypa1-account.com", "PayPal", "Your account is limited until you confirm", { tab: "primary" }) },
  { group: "Scam: name of a contact", accept: ["spam", "screener"], count: 15, make: () => mail("dan.brooks.office@gmail.com", "Dan Brooks", "Re: are you free? need a favor", { tab: "primary", fakeReply: true }), spoofs: true },
];
