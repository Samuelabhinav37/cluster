// A held-out 2,000-email mailbox: written after the rules were tuned, with
// senders on no Cluster list (made-up .example brands), so it measures what
// general signals do (subjects, Gmail tabs, bulk headers, sending path,
// people you know) instead of list entries. Same shape as tunedMailbox.ts.
import { chance, digits, mail, ME, pick, reply, sender, type Tab, type Template } from "./mailboxGen";
import { personPair } from "./tunedMailbox";

export const HELD_OUT_SEED = 4242;

// A few made-up brands per kind of business; each keeps one address and name.
const brands = (names: string[], local: string, sub = "") =>
  names.map((b) => [`${local}@${sub}${b.toLowerCase().replace(/[^a-z]/g, "")}.example`, b] as [string, string]);
const STORES = brands(["Brightloom", "Fernhill Goods", "Copperleaf", "Mosswood", "Tidewell", "Larkspur Home"], "orders");
const STORE_MARKETING = brands(["Brightloom", "Fernhill Goods", "Copperleaf", "Mosswood", "Tidewell", "Larkspur Home", "Velvetine", "Northpeak"], "hello", "email.");
const PUBLISHERS = brands(["The Signal Desk", "Field Notes Weekly", "Byte Brief", "Civic Ledger", "Long Read Club"], "newsletter");
const APPS = brands(["Quillnote", "Stackhaven", "Pingwell", "Ledgerly", "Taskmeadow"], "no-reply");
const NETWORKS = brands(["Gatherly", "Pixelpond", "Threadnest", "Climbr"], "notify");
const HOTELS = brands(["Harborview Inns", "Saltmarsh Resorts", "Skylark Air"], "reservations");
const BANKS = brands(["Granite Credit Union", "Bluewater Bank"], "alerts");
const TOOLS = brands(["Trackline", "Sprintboard", "Docuflow"], "notifications");

export const HELD_OUT: Template[] = [
  // Codes and account notices: only the subject can say what they are.
  { group: "Code from an unlisted app", accept: ["otp", "accounts"], count: 80, make: () => mail(...sender(APPS), pick([`${digits(6)} is your verification code`, `Your login code: ${digits(6)}`, `Use ${digits(6)} to sign in`, "Your sign-in link"]), { autoSubmitted: chance(0.5) }) },
  { group: "Account notice from an unlisted app", accept: ["accounts", "screener"], count: 60, make: () => mail(...sender(APPS), pick(["New sign-in to your account", "Your password was changed", "Security alert: new device", "Verify your email address"]), { important: chance(0.4) }) },

  // Stores.
  { group: "Shipping from an unlisted store", accept: ["shipping"], count: 120, make: () => mail(...sender(STORES), pick([`Your order #${digits(5)} has shipped`, "Out for delivery today", "Your package was delivered", "Track your shipment"]), { autoSubmitted: chance(0.5) }) },
  { group: "Order or receipt from an unlisted store", accept: ["receipt", "shopping", "shipping"], count: 120, make: () => mail(...sender(STORES), pick([`Order #${digits(5)} confirmed`, "Thanks for your order!", `Your receipt from ${pick(["Brightloom", "Mosswood"])}`, "Payment received"]), { purchase: chance(0.6) }) },
  { group: "Promotion, Promotions tab", accept: ["promotions"], count: 410, make: () => mail(...sender(STORE_MARKETING), pick(["30% off this weekend", "Just dropped: winter collection", "You left something in your cart", "Members-only early access", "Last call: free shipping ends tonight"]), { unsub: true, feedbackId: chance(0.5), tab: "promotions" }) },
  { group: "Promotion misfiled in Updates", accept: ["promotions", "newsletter", "shopping"], count: 80, make: () => mail(...sender(STORE_MARKETING), pick(["Ideas for the holidays", "Our gift guide is here", "New in: home"]), { unsub: true, tab: "updates" }) },

  // Lists.
  { group: "Newsletter from an unlisted publisher", accept: ["newsletter", "promotions"], count: 250, make: () => mail(...sender(PUBLISHERS), pick([`Issue #${digits(3)}`, "This week: what changed", "The weekend read", "Five links worth your time"]), { unsub: true, listId: "<weekly.list.example>", tab: pick<Tab>(["updates", "updates", "promotions", "primary"]) }) },
  { group: "Social network, Social tab", accept: ["social", "newsletter"], count: 100, make: () => mail(...sender(NETWORKS), pick(["Maya mentioned you", "You have 3 new followers", "Jordan sent you a message", "Trending in your groups"]), { unsub: true, tab: "social" }) },

  // Businesses we can't name from lists.
  { group: "Hotel / airline (unlisted)", accept: ["travel", "receipt", "screener"], count: 50, make: () => mail(...sender(HOTELS), pick(["Your reservation is confirmed", "Check in now for your flight", "Your upcoming stay", "Your e-ticket receipt"]), { important: chance(0.5) }) },
  { group: "Bank (unlisted)", accept: ["finance", "screener"], count: 40, make: () => mail(...sender(BANKS), pick(["Your statement is ready", "A deposit was made to your account", "Your payment was received", "Low balance alert"]), { important: chance(0.6) }) },
  { group: "Work tool (unlisted)", accept: ["productivity", "newsletter", "screener"], count: 60, make: () => mail(...sender(TOOLS), pick([`[TRK-${digits(3)}] Status changed to Done`, "Jane commented on your document", "Your weekly workspace summary", "You were assigned a task"]), { unsub: chance(0.6) }) },
  { group: "Unknown machine mail", accept: ["screener"], count: 80, make: () => mail(...sender(APPS), pick(["Your weekly report", "Reminder: trial ends in 3 days", "Your export is ready", "We've updated our terms"]), { autoSubmitted: chance(0.5) }) },
  { group: "Company mail, no bulk headers, Primary", accept: ["screener", "promotions", "newsletter"], count: 80, make: () => mail(...sender(brands(["Studio Pilates", "Greenway Dental", "Harbor Car Wash", "Bayside Vet"], "hello")), pick(["Your appointment tomorrow", "A note from our team", "We miss you!", "Your visit summary"]), { tab: "primary" }) },

  // People.
  { group: "New person on free mail", accept: ["personal"], count: 150, make: () => mail(...personPair(["gmail.com", "outlook.com", "yahoo.com", "icloud.com"]), pick(["Re: saturday?", "Fwd: the photos", "Invoice for the cabin split", "Your order of pizza is here lol", "tickets for the game", "quick question", "Happy birthday!"]), { tab: "primary", important: chance(0.6) }) },
  { group: "New colleague at an unlisted company", accept: ["personal"], count: 60, make: () => mail(...personPair(["newco.example", "partnerfirm.example", "clientcorp.example"]), pick(["Q4 roadmap draft", "Question about the invoice", "Updates on the deal", "Intro: our design lead", "Notes from the call"]), { tab: "primary", important: chance(0.6), via: "person" }) },
  { group: "Reply in your thread from a company", accept: ["personal"], count: 30, make: () => reply(mail(...sender(brands(["Quillnote", "Ledgerly"], "support")), `Re: ticket #${digits(5)}`, { autoSubmitted: chance(0.5) })) },
  { group: "Friend misfiled in Updates", accept: ["personal", "screener"], count: 15, make: () => mail(...personPair(["gmail.com", "outlook.com"]), pick(["Re: plans", "dinner?"]), { tab: "updates" }) },
  { group: "Known contacts", accept: ["personal"], count: 40, make: () => mail(...sender([["priya.n@corp.example", "Priya Nair"], ["mom.family@gmail.com", "Mom"], ["dan@friends.example", "Dan Brooks"]]), pick(["Re: next week", "call me", "Draft attached"]), { tab: "primary", via: "person" }) },
  { group: "Note to self", accept: ["personal"], count: 5, make: () => mail(ME, "Samuel", "reading list", { tab: "primary" }) },
  { group: "Mailing list discussion", accept: ["newsletter", "personal", "screener"], count: 20, make: () => mail(...personPair(["gmail.com"]), "Re: [hiking-club] Saturday route", { listId: "<hiking-club.groups.example>", tab: "forums" }) },
  { group: "Bounce notice", accept: ["screener", "inbox", "personal"], count: 10, make: () => mail("mailer-daemon@googlemail.com", "Mail Delivery Subsystem", "Undeliverable: Re: saturday?", { tab: "primary", auth: "none", via: "own" }) },

  // Scams, none of them using a phrase list's exact words where avoidable.
  { group: "Scam: unlisted lookalike with failed auth", accept: ["spam", "screener"], count: 30, make: () => mail("security@bluewater-bank-verify.example", "Bluewater Bank", "Unusual activity on your account", { tab: "primary", auth: "fail" }) },
  { group: "Scam: listed brand on free mail", accept: ["spam", "screener"], count: 25, make: () => mail(`paypal.resolution${digits(3)}@gmail.com`, "PayPal Resolution Center", "Your payment is on hold", { tab: "primary" }), spoofs: true },
  { group: "Scam: lookalike of a listed brand", accept: ["spam", "screener"], count: 25, make: () => mail("billing@amaz0n-orders.com", "Amazon", "Your order could not be processed", { tab: "primary" }) },
  { group: "Scam: lure from free mail", accept: ["spam", "screener"], count: 20, make: () => mail(personPair(["outlook.com"], () => digits(3))[0], "IT Helpdesk", "Your account will be closed today", { tab: "primary" }), spoofs: true },
  { group: "Scam: extortion, new wording", accept: ["spam", "screener"], count: 15, make: () => mail(personPair(["gmail.com"], () => digits(3))[0], "Watcher", "I know what you did. Payment in bitcoin required", { tab: "primary" }), spoofs: true },
  { group: "Scam: gift cards from a contact's name", accept: ["spam", "screener"], count: 15, make: () => mail("dan.brooks.mobile@gmail.com", "Dan Brooks", "Are you free? I need a favor", { tab: "primary" }), spoofs: true },
  { group: "Scam: invoice from free mail", accept: ["spam", "screener"], count: 10, make: () => mail(`billing.office${digits(3)}@gmail.com`, "Billing Office", `Invoice ${digits(5)} past due`, { tab: "primary" }), spoofs: true },
];
