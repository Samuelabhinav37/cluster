// A 1,000-email dummy mailbox run through Cluster's real sorting code, in the
// order the background runs it: sender records, replies to you, the scam
// checks, the labeller, then the Personal / Screener pass. Each email says
// where a person would expect it; the test prints where Cluster put it.
// Mis-sorts are reported, not failed: only the safety rules fail the test.
import { describe, expect, it } from "vitest";
import { correctionKey } from "./addressIdentity";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import type { SortOverride } from "./sortTaxonomy";
import { out, sortMailbox, type Where } from "../test/sortHarness";

interface Case {
  group: string;
  expect: Where;
  meta: NormalizedMessageMetadata;
}

const NOW = Date.UTC(2026, 10, 15, 12);
const ME = "samuel@gmail.com";

// Small seeded random so every run builds the same mailbox.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const num = (digits: number) => String(Math.floor(rand() * 10 ** digits)).padStart(digits, "0");

let nextId = 0;
function mail(from: string, name: string, subject: string, extra: Partial<NormalizedMessageMetadata> = {}): NormalizedMessageMetadata {
  const id = `m${++nextId}`;
  return {
    id,
    provider: "gmail",
    fromAddress: from.toLowerCase(),
    fromDisplayName: name,
    replyToAddress: "",
    subject,
    isProtected: false,
    unread: rand() < 0.5,
    sizeBytes: 20_000,
    unsubscribe: {},
    receivedAt: NOW - Math.floor(rand() * 30) * 86_400_000 - 4 * 3_600_000,
    threadId: `t${id}`,
    labelIds: ["INBOX"],
    toAddresses: [ME],
    ccAddresses: [],
    recipientCount: 1,
    referencesCount: 0,
    ...extra,
  };
}
/** A real sender: the address and the name it always uses. */
const from = (pairs: [string, string][]) => pick(pairs);
const mailFrom = ([address, name]: [string, string], subject: string, extra: Partial<NormalizedMessageMetadata> = {}) => mail(address, name, subject, extra);
const list = { unsubscribe: { httpUrl: "https://example.com/unsub" }, listId: "<news.list>" };
const bulk = { autoSubmitted: "auto-generated", precedence: "bulk" };

// People and settings the mailbox is judged against.
const CONTACTS = ["priya.n@corp.example", "sivaram.challa@gmail.com", "alice@yahoo.com", "recruiter@staffing.example"];
const OVERRIDES: Record<string, SortOverride> = {
  [correctionKey("bounce-1001@mail.mybank.example")]: "finance",
  "recruiter@staffing.example": "jobs",
};
const sent: SentRecord[] = [];

function build(): Case[] {
  const cases: Case[] = [];
  const add = (group: string, expect: Where, n: number, make: () => NormalizedMessageMetadata) => {
    for (let i = 0; i < n; i++) cases.push({ group, expect, meta: make() });
  };

  add("One-time codes", "otp", 60, () =>
    mailFrom(from([["noreply@steampowered.com", "Steam"], ["account-security-noreply@accountprotection.microsoft.com", "Microsoft account team"], ["no-reply@chase.com", "Chase"]]),
      pick([`Your verification code is ${num(6)}`, `${num(6)} is your Steam code`, `Use ${num(6)} to sign in`]), bulk));
  add("Account notices", "accounts", 50, () =>
    mailFrom(from([["no-reply@accounts.google.com", "Google"], ["security@mail.instagram.com", "Instagram"], ["noreply@github.com", "GitHub"]]),
      pick(["Security alert: new sign-in on Windows", "Your password was changed", "Login activity on your account"]), bulk));
  add("Shipping", "shipping", 60, () =>
    mailFrom(from([["shipment-tracking@amazon.com", "Amazon.com"], ["orders@target.com", "Target"], ["tracking@ups.com", "UPS"]]),
      pick([`Your package has shipped`, `Out for delivery: order #${num(6)}`, `Delivered: your Target order`]), bulk));
  add("Receipts", "receipt", 60, () =>
    mailFrom(from([["receipts@squareup.example", "Square"], ["billing@acme-saas.example", "Acme"], ["no-reply@spotify.com", "Spotify"]]),
      pick(["Your receipt from Blue Bottle", `Invoice INV-${num(4)} from Acme`, "Your Spotify Premium has renewed"]), { ...bulk, gmailPurchase: rand() < 0.5 }));
  add("Newsletters", "newsletter", 100, () =>
    mail(`${pick(["news", "hello", "digest"])}@${pick(["brewletter", "aiweekly", "devbrief", "thehustle-mail"])}.example`, "The Brief",
      `This week in AI #${num(2)}`, list));
  add("Promotions", "promotions", 100, () =>
    mail(`${pick(["deals", "offers", "promo"])}@${pick(["target.com", "shopnow.example", "temu-mail.example"])}`, "Deals",
      pick(["50% off everything", "Last chance: free shipping", "New arrivals just for you"]),
      { ...list, gmailPromotion: true, labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] }));
  add("Shopping (store mail)", "shopping", 40, () =>
    mailFrom(from([["circle@target.com", "Target"], ["store-news@amazon.com", "Amazon"]]), pick(["Your Target Circle update", "Your Prime membership"]), bulk));
  add("Finance", "finance", 50, () =>
    mailFrom(from([["alerts@capitalone.com", "Capital One"], ["no-reply@chase.com", "Chase"], ["service@paypal.com", "PayPal"]]),
      pick(["Your statement is ready", "Your monthly summary", "A payment was posted"]), list));
  add("Travel", "travel", 30, () =>
    mailFrom(from([["deltaairlines@t.delta.com", "Delta"], ["reservations@marriott.com", "Marriott"]]), pick(["Your trip to Denver", "Check in now for your flight"]), bulk));
  add("Education", "education", 30, () =>
    mail(pick(["registrar@iastate.edu", "news@cs.stanford.edu"]), "University", pick(["Spring registration opens", "Library hours change"]), list));
  add("Jobs", "jobs", 50, () =>
    mail(pick(["careers@people.netapp.example", "jobalerts-noreply@linkedin.com", "no-reply@indeed.com"]), "Careers",
      pick(["New jobs for you", "Your application to Acme", "Thanks for applying"]), bulk));
  add("Social", "social", 30, () =>
    mailFrom(from([["notification@facebookmail.com", "Facebook"], ["messages-noreply@linkedin.com", "LinkedIn"]]),
      pick(["John commented on your post", "You appeared in 5 searches"]), list));
  add("Work tools", "productivity", 20, () =>
    mailFrom(from([["notifications@github.com", "GitHub"], ["feedback@slack.com", "Slack"]]), pick([`[cluster] PR #${num(2)} merged`, "New messages in #general"]), list));

  add("A person, new to you", "personal", 60, () =>
    mail(`${pick(["maya", "jordan", "chris", "fatima", "wei"])}.${pick(["lee", "patel", "garcia", "khan"])}${num(2)}@${pick(["gmail.com", "outlook.com", "yahoo.com"])}`,
      pick(["Maya Lee", "Jordan Patel", "Chris Garcia"]), pick(["Dinner on Friday?", "Photos from the trip", "Quick question"]), { providerMarkedPersonal: rand() < 0.5 }));
  add("Someone you wrote to", "personal", 40, () =>
    mail("priya.n@corp.example", "Priya Nair", pick(["Re: project timeline", "Notes from today", "Can you review this?"])));
  add("A reply in your thread", "personal", 30, () => {
    const m = mail(pick(["support@shop.example", "help@saas.example"]), "Support", "Re: my refund", bulk);
    sent.push({ id: `s${m.id}`, provider: "gmail", threadId: m.threadId, sentAt: m.receivedAt - 3_600_000, to: [{ address: m.fromAddress, name: "" }], cc: [], bcc: [] });
    return m;
  });
  add("Calendar invite", "personal", 20, () =>
    mail("calendar-notification@google.com", "Google Calendar", `Invitation: Sync @ Wed Nov ${18 + Math.floor(rand() * 5)}`, bulk));
  add("A contact, other spelling", "personal", 15, () =>
    mail(pick(["SivaramChalla+work@gmail.com", "sivaram.challa@googlemail.com"]), "Sivaram Challa", "Weekend plans"));

  add("Scam: fake alias of a contact", "spam", 15, () =>
    mail(pick(["alice+friend@yahoo.com", "a.lice@yahoo.com"]), "Alice", "Can you buy gift cards for me?"));
  add("Scam: brand on free mail", "spam", 25, () =>
    mail(`paypal.security${num(2)}@gmail.com`, "PayPal Security", "Your account is limited, verify now"));
  add("Scam: lookalike domain", "spam", 15, () =>
    mail("service@paypa1.com", "PayPal", "Unusual activity on your account", { authenticationResults: "mx.google.com; spf=fail; dkim=fail; dmarc=fail" }));

  add("Unknown machine mail", "screener", 60, () =>
    mail(`noreply@${pick(["app.unknownsaas", "reports.toolco", "notify.widgetly"])}.example`, "Notifications", pick(["Your weekly report", "Status update", "Reminder"]), bulk));
  add("Starred company mail", "screener", 20, () =>
    mail(`hello@${pick(["startup", "hackathon"])}.example`, "Team", "Welcome aboard", { ...bulk, isProtected: true, labelIds: ["INBOX", "STARRED"] }));

  add("Corrected: bank bounce pattern", "finance", 10, () => mail(`bounce-${num(4)}@mail.mybank.example`, "MyBank", "Account update", bulk));
  add("Corrected: recruiter you wrote to", "jobs", 10, () => mail("recruiter@staffing.example", "Dana Recruiter", "Re: the role"));
  return cases;
}

describe("1,000-email mailbox", () => {
  it("sorts every kind of mail, and never puts a person in Spam or a scam with people", async () => {
    // HOLD_MAX pages 100 at a time in real runs; here every email is one page.
    const cases = build();
    expect(cases).toHaveLength(1000);
    const where = await sortMailbox(cases.map((c) => c.meta), { contacts: CONTACTS, overrides: OVERRIDES, sent, now: NOW });

    const rows = new Map<string, { expected: Where; n: number; right: number; got: Map<Where, number> }>();
    for (const c of cases) {
      const got = where.get(c.meta.id)!;
      const row = rows.get(c.group) ?? { expected: c.expect, n: 0, right: 0, got: new Map() };
      row.n++;
      if (got === c.expect) row.right++;
      row.got.set(got, (row.got.get(got) ?? 0) + 1);
      rows.set(c.group, row);
    }
    const right = [...rows.values()].reduce((a, r) => a + r.right, 0);
    const lines = [...rows].map(([group, r]) => {
      const wrong = [...r.got].filter(([w]) => w !== r.expected).map(([w, n]) => `${n} → ${w}`).join(", ");
      return `${group.padEnd(34)} ${String(r.n).padStart(4)}  expect ${r.expected.padEnd(12)} right ${String(r.right).padStart(4)}${wrong ? `   wrong: ${wrong}` : ""}`;
    });
    out(`\n${lines.join("\n")}\n\nRight: ${right} of 1000 (${(right / 10).toFixed(1)}%)\n`);

    // Safety rules.
    const people = cases.filter((c) => c.expect === "personal");
    const scams = cases.filter((c) => c.expect === "spam");
    expect(people.filter((c) => ["spam", "screener"].includes(where.get(c.meta.id)!)).map((c) => c.meta.fromAddress)).toEqual([]);
    expect(scams.filter((c) => !["spam", "screener"].includes(where.get(c.meta.id)!)).map((c) => c.meta.fromAddress)).toEqual([]);
  });
});
