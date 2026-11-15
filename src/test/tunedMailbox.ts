// The 2,000-email mailbox the rules were tuned on (see realisticMailbox.test.ts).
// Real senders' address and subject formats, Gmail tabs and IMPORTANT marks
// the way Gmail sets them, scams that pass authentication for their own
// domain, recruiters writing templates from personal-looking addresses.
import { chance, digits, mail, ME, pick, reply, sender, type Tab, type Template } from "./mailboxGen";

export const CONTACTS = ["priya.n@corp.example", "mom.family@gmail.com", "sivaram.challa@gmail.com", "support@shop.example", "dan@friends.example"];
export const TUNED_SEED = 2026;

const FIRST = ["Maya", "Jordan", "Chris", "Fatima", "Wei", "Arjun", "Lena", "Omar"];
const LAST = ["Lee", "Patel", "Garcia", "Khan", "Nguyen", "Rossi"];
/** A person: their name, and an address made from it. */
export const personPair = (domains: string[], tail = () => (chance(0.4) ? digits(2) : "")): [string, string] => {
  const first = pick(FIRST);
  const last = pick(LAST);
  return [`${first.toLowerCase()}${pick([".", "", "_"])}${last.toLowerCase()}${tail()}@${pick(domains)}`, `${first} ${last}`];
};


export const TUNED: Template[] = [
  // Codes and account notices.
  { group: "Code: Google G-code", accept: ["otp"], count: 30, make: () => mail("noreply@google.com", "Google", `G-${digits(6)} is your Google verification code`) },
  { group: "Code: short app code", accept: ["otp"], count: 25, make: () => mail(...sender([["no-reply@uber.com", "Uber"], ["noreply@doordash.com", "DoorDash"], ["account@venmo.com", "Venmo"]]), pick([`Your Uber code is ${digits(4)}`, `${digits(6)} is your DoorDash verification code`, `Venmo: your code is ${digits(6)}`])) },
  { group: "Code: magic link / confirm", accept: ["otp", "accounts"], count: 30, make: () => mail(...sender([["notify@mail.notion.so", "Notion"], ["no-reply@slack.com", "Slack"], ["hello@figma.com", "Figma"]]), pick(["Your sign-in link for Notion", "Slack confirmation code: " + digits(3) + "-" + digits(3), "Confirm your email address"])) },
  { group: "Account: sign-in alert", accept: ["accounts"], count: 45, make: () => mail(...sender([["no-reply@accounts.google.com", "Google"], ["security@mail.instagram.com", "Instagram"], ["no_reply@email.apple.com", "Apple"], ["account-security-noreply@accountprotection.microsoft.com", "Microsoft account team"]]), pick(["Security alert", "New login to Instagram from Chrome on Windows", "Your Apple ID was used to sign in to iCloud via a web browser", "Microsoft account unusual sign-in activity", "Your password was changed"]), { important: chance(0.5) }) },

  // Shopping, orders, receipts.
  { group: "Order shipped (Amazon/Target/Walmart)", accept: ["shipping"], count: 90, make: () => mail(...sender([["shipment-tracking@amazon.com", "Amazon.com"], ["orders@oe.target.com", "Target"], ["help@walmart.com", "Walmart.com"]]), pick([`Your Amazon.com order #112-${digits(7)}-${digits(7)} has shipped`, "Your order is on its way!", `Shipped: "Anker USB-C Charger..."`, "Arriving today: your package"])) },
  { group: "Carrier tracking (UPS/FedEx/USPS)", accept: ["shipping"], count: 40, make: () => mail(...sender([["mcinfo@ups.com", "UPS"], ["trackingupdates@fedex.com", "FedEx"], ["USPSInformeddelivery@email.informeddelivery.usps.com", "USPS Informed Delivery"]]), pick(["UPS Update: Package Scheduled for Delivery Today", "Your package has been delivered", "Your Daily Digest for Mon, 11/9"]), { unsub: chance(0.5) }) },
  { group: "Order confirmed (Amazon/DoorDash/Shopify store)", accept: ["receipt", "shopping", "shipping"], count: 60, make: () => mail(...sender([["auto-confirm@amazon.com", "Amazon.com"], ["no-reply@doordash.com", "DoorDash"], ["store+12345@t.shopifyemail.com", "Mellow Mug Coffee"]]), pick([`Your Amazon.com order of "Kindle Paperwhite"`, "Your order from Chipotle", `Order #${digits(4)} confirmed`]), { purchase: chance(0.6) }) },
  { group: "Receipt (Apple/Netflix/Spotify)", accept: ["receipt"], count: 45, make: () => mail(...sender([["no_reply@email.apple.com", "Apple"], ["info@account.netflix.com", "Netflix"], ["no-reply@spotify.com", "Spotify"]]), pick(["Your receipt from Apple.", "Your Netflix membership has been renewed", "Your Spotify Premium receipt"]), { purchase: chance(0.5), unsub: chance(0.3) }) },
  { group: "Ride and food receipts (Uber/Lyft)", accept: ["receipt", "travel", "shopping"], count: 30, make: () => mail(...sender([["noreply@uber.com", "Uber Receipts"], ["no-reply@lyftmail.com", "Lyft"]]), pick(["Your Friday evening trip with Uber", "Your ride with Ahmed on November 3", "Your Uber Eats order with Chipotle"]), { unsub: true }) },

  // Money.
  { group: "Bank and card statements", accept: ["finance"], count: 40, make: () => mail(...sender([["no.reply.alerts@chase.com", "Chase"], ["onlinebanking@ealerts.bankofamerica.com", "Bank of America"], ["capitalone@notification.capitalone.com", "Capital One"]]), pick(["Your credit card statement is available", "Your available balance", "A payment of $82.14 was posted", "Your statement is ready"]), { important: chance(0.6) }) },
  { group: "Payments and investing (Venmo/PayPal/Robinhood)", accept: ["finance", "receipt"], count: 35, make: () => mail(...sender([["venmo@venmo.com", "Venmo"], ["service@paypal.com", "PayPal"], ["noreply@robinhood.com", "Robinhood"]]), pick(["You paid Alex $12.00", "You've got money", "Your monthly statement is ready", "Receipt for your payment to Steam"]), { purchase: chance(0.3) }) },

  // Lists.
  { group: "Newsletter (Substack/beehiiv)", accept: ["newsletter"], count: 130, make: () => mail(...sender([["lenny@substack.com", "Lenny's Newsletter"], ["pragmaticengineer@substack.com", "The Pragmatic Engineer"], ["hello@mail.beehiiv.com", "The Rundown AI"]]), pick(["How the best PMs prioritize", "The Pulse #112", "OpenAI's new model, explained"]), { unsub: true, listId: "<list.substack.com>", tab: pick<Tab>(["updates", "primary", "promotions"]) }) },
  { group: "Newsletter (media)", accept: ["newsletter"], count: 100, make: () => mail(...sender([["nytdirect@nytimes.com", "The New York Times"], ["crew@morningbrew.com", "Morning Brew"], ["noreply@medium.com", "Medium Daily Digest"], ["newsletters@theverge.com", "The Verge"]]), pick(["The Morning: Election results", "☕ Big tech's big week", "Stories for you", "Verge Deals"]), { unsub: true, feedbackId: true, tab: pick<Tab>(["updates", "promotions"]) }) },
  { group: "Promotion (Promotions tab)", accept: ["promotions"], count: 400, make: () => mail(...sender([["nike@official.nike.com", "Nike"], ["sephora@beauty.sephora.com", "Sephora"], ["bestbuy@emailinfo.bestbuy.com", "Best Buy"], ["oldnavy@email.oldnavy.com", "Old Navy"], ["uniqlo@mail.uniqlo.com", "UNIQLO"], ["hello@em.temu.com", "Temu"]]), pick(["Members get 25% off", "Black Friday starts NOW", "Your cart misses you", "New arrivals just dropped", "⚡ Flash sale: 70% off"]), { unsub: true, feedbackId: true, tab: "promotions" }) },
  { group: "Promotion (misfiled in Updates/Primary)", accept: ["promotions", "newsletter", "shopping"], count: 60, make: () => mail(...sender([["deals@email.dell.com", "Dell"], ["offers@info.cinemark.com", "Cinemark"], ["news@email.ikea.com", "IKEA"]]), pick(["Save up to 40% this week", "Movie Club perks inside", "Ideas for the holidays"]), { unsub: true, tab: pick<Tab>(["updates", "primary"]) }) },
  { group: "Store promo from a bank or airline", accept: ["promotions", "finance", "travel"], count: 30, make: () => mail(...sender([["bank-offers@email.capitalone.com", "Capital One"], ["southwestairlines@luv.southwest.com", "Southwest Airlines"]]), pick(["You're pre-approved for a new card", "Fares from $49 one way"]), { unsub: true, tab: "promotions" }) },
  { group: "Old bulk mail, no unsubscribe link", accept: ["promotions", "newsletter", "screener"], count: 30, make: () => mail(...sender([["surveys@ipsos-mail.example", "Ipsos iSay"], ["rewards@rakuten-mail.example", "Rakuten"]]), pick(["Share your opinion, earn points", "Cash Back alert"]), { feedbackId: true, tab: "primary" }) },

  // Social and jobs.
  { group: "Social network notices", accept: ["social"], count: 100, make: () => mail(...sender([["invitations@linkedin.com", "LinkedIn"], ["notify@x.com", "X"], ["noreply@redditmail.com", "Reddit"], ["notifications@discord.com", "Discord"], ["no-reply@mail.instagram.com", "Instagram"]]), pick(["You have 1 new invitation", "Maya liked your post", "Top posts from r/programming", "New message from Jordan", "See who viewed your profile"]), { unsub: true, tab: "social" }) },
  { group: "Job alerts (LinkedIn/Indeed/Handshake)", accept: ["jobs"], count: 60, make: () => mail(...sender([["jobalerts-noreply@linkedin.com", "LinkedIn Job Alerts"], ["alert@indeed.com", "Indeed"], ["noreply@joinhandshake.com", "Handshake"]]), pick(["Software Engineer: Stripe and 9 more jobs", "15 new jobs for 'data engineer'", "Jobs picked for you"]), { unsub: true }) },
  { group: "Applicant tracking (Greenhouse/Lever/Workday)", accept: ["jobs"], count: 50, make: () => mail(...sender([["no-reply@us.greenhouse-mail.io", "Stripe Recruiting"], ["no-reply@hire.lever.co", "Figma"], ["netapp@myworkday.com", "NetApp"]]), pick(["Thank you for applying to Stripe", "Your application to Figma", "Application received: Software Engineer II", "Update on your application"]), { important: chance(0.5), tab: "primary" }) },
  { group: "Recruiter template from a person's address", accept: ["jobs", "personal", "screener"], count: 50, make: () => mail(...personPair(["techminds-staffing.example", "cyberthink.example", "kforce.example"]), pick(["Urgent requirement: Java Developer, Dallas TX", "Immediate need - Data Engineer - Remote", "Re: Your profile for a Python role"]), { tab: "primary", important: chance(0.4), fakeReply: true }) },

  // Travel, school, work.
  { group: "Airline / hotel / stays", accept: ["travel"], count: 40, make: () => mail(...sender([["DeltaAirLines@t.delta.com", "Delta Air Lines"], ["unitedairlines@news.united.com", "United Airlines"], ["automated@airbnb.com", "Airbnb"], ["noreply@booking.com", "Booking.com"], ["marriott@email-marriott.com", "Marriott Bonvoy"]]), pick(["Your Delta eTicket receipt", "Check in for your flight to SFO", "Reservation confirmed for Lisbon", "Your booking is confirmed", "Your stay is coming up"]), { important: chance(0.6) }) },
  { group: "School (Canvas/university/Coursera)", accept: ["education"], count: 45, make: () => mail(...sender([["notifications@instructure.com", "Canvas"], ["registrar@iastate.edu", "Iowa State Registrar"], ["no-reply@m.mail.coursera.org", "Coursera"], ["news@cs.stanford.edu", "Stanford CS"]]), pick(["Assignment due tomorrow: Lab 4", "Spring registration opens Monday", "Continue your course", "Seminar this Friday"]), { unsub: chance(0.5) }) },
  { group: "Work tools (GitHub/Jira/Docs/Zoom)", accept: ["productivity"], count: 60, make: () => mail(...sender([["notifications@github.com", "GitHub"], ["jira@acme.atlassian.net", "Jira"], ["comments-noreply@docs.google.com", "Google Docs"], ["no-reply@zoom.us", "Zoom"], ["notify@mail.notion.so", "Notion"]]), pick([`[cluster] Fix scan card (#${digits(3)})`, `[JIRA] (ACME-${digits(3)}) Update login flow`, "Jane commented on 'Q4 plan'", "Cloud recording is now available", "Updates in Team Wiki"]), { unsub: chance(0.6) }) },

  // People.
  // Strangers on free mail wait in the Screener until you say yes (2026-11-15 decision).
  { group: "Family (a contact)", accept: ["personal"], count: 28, make: () => mail("mom.family@gmail.com", "Mom", pick(["Re: weekend plans", "Happy birthday!!", "call me when free"]), { tab: "primary", important: chance(0.7) }) },
  { group: "Friend, new to you", accept: ["screener", "personal"], count: 66, make: () => mail(...personPair(["gmail.com", "yahoo.com", "outlook.com", "icloud.com"]), pick(["Re: weekend plans", "Fwd: photos from the trip", "Happy birthday!!", "Dinner Thursday?", "call me when free"]), { tab: "primary", important: chance(0.7) }) },
  { group: "Colleague or contact", accept: ["personal"], count: 40, make: () => mail(...sender([["priya.n@corp.example", "Priya Nair"], ["dan@friends.example", "Dan Brooks"]]), pick(["Re: project timeline", "Notes from today", "Can you review this?"]), { tab: "primary", important: true, cc: chance(0.4) ? 2 : 0, via: "person" }) },
  { group: "Reply from a company you wrote to", accept: ["personal"], count: 25, make: () => reply(mail(pick(["support@shop.example", "help@acme-saas.example"]), "Support Team", "Re: refund for order " + digits(5), { autoSubmitted: chance(0.5), tab: "updates" })) },
  { group: "Calendar invite", accept: ["personal"], count: 25, make: () => mail(...sender([["calendar-notification@google.com", "Google Calendar"], ["priya.n@corp.example", "Priya Nair"]]), pick(["Invitation: 1:1 @ Thu Nov 19, 2pm", "Updated invitation: Team sync", "Accepted: Interview with Samuel"]), { tab: "primary" }) },
  { group: "Google Groups discussion", accept: ["newsletter", "personal", "screener"], count: 20, make: () => mail(...personPair(["gmail.com"]), "Re: [isu-cs-club] hackathon teams", { listId: "<isu-cs-club.googlegroups.com>", tab: "forums" }) },
  { group: "Note to self", accept: ["personal"], count: 8, make: () => mail(ME, "Samuel", "links to read", { tab: "primary", important: true }) },

  // Unknown machine mail.
  { group: "Unknown app notifications", accept: ["screener"], count: 55, make: () => mail(...sender([["no-reply@app.rippleplan.example", "RipplePlan"], ["no-reply@notify.taskbird.example", "Taskbird"], ["no-reply@mail.quickforms.example", "QuickForms"]]), pick(["Your weekly summary", "New response to your form", "Reminder: trial ends in 3 days"]), { autoSubmitted: true }) },
  { group: "Bounce notice", accept: ["screener", "inbox", "personal"], count: 10, make: () => mail("mailer-daemon@googlemail.com", "Mail Delivery Subsystem", "Delivery Status Notification (Failure)", { tab: "primary", auth: "none" }) },
  { group: "Starred company mail", accept: ["screener", "promotions", "newsletter"], count: 20, make: () => mail("team@hackathon-hub.example", "Hackathon Hub", "You're registered!", { starred: true, tab: "updates" }) },

  // Scams. Spam is right; the Screener at least keeps them out of sight.
  { group: "Scam: DocuSign lure (own domain, auth passes)", accept: ["spam", "screener"], count: 12, make: () => mail("dse@docsign-secure.example", "DocuSign", "Please DocuSign: Payment_Invoice_Nov.pdf", { tab: "primary" }) },
  { group: "Scam: USPS redelivery", accept: ["spam", "screener"], count: 10, make: () => mail("redelivery@usps-track-help.xyz", "USPS", "Your package could not be delivered. Update your address", { tab: "primary", auth: pick(["pass", "fail"] as const) }) },
  { group: "Scam: Microsoft 365 password expiry", accept: ["spam", "screener"], count: 10, make: () => mail("it-support@m365-account-security.example", "Microsoft 365", "Your password expires today. Keep current password", { tab: "primary" }) },
  { group: "Scam: brand on free mail", accept: ["spam", "screener"], count: 10, make: () => mail(`coinbase.support${digits(2)}@outlook.com`, "Coinbase Support", "Your wallet has been suspended", { tab: "primary", auth: "pass" }) },
  { group: "Scam: lookalike domain", accept: ["spam", "screener"], count: 8, make: () => mail("billing@netf1ix-billing.com", "Netflix", "Payment declined: update your card", { tab: "primary" }) },
  { group: "Scam: boss impersonation (name match)", accept: ["spam", "screener"], count: 6, make: () => mail("priya.nair.office@gmail.com", "Priya Nair", "Are you available? Need a quick favor", { tab: "primary" }), spoofs: true },
  { group: "Scam: prize with reply-to free mail", accept: ["spam", "screener"], count: 8, make: () => mail("promo@winner-rewards.example", "Rewards Center", "You've won a $500 Amazon gift card", { replyTo: "claim.rewards@gmail.com", tab: "primary" }) },
  { group: "Scam: fake invoice from free mail", accept: ["spam", "screener"], count: 8, make: () => mail(`accounts.dept${digits(2)}@gmail.com`, "Accounts Payable", `Invoice #INV-${digits(4)} overdue, payment required`, { tab: "primary" }) },
  { group: "Scam: extortion from free mail", accept: ["spam", "screener"], count: 6, make: () => mail(personPair(["gmail.com"], () => digits(3))[0], "Hacker", "I have your password. Read this carefully", { tab: "primary" }), spoofs: true },
];
