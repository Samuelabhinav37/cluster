// Test-only: builds dummy mailboxes shaped like real ones and reports how
// Cluster sorted them. Shared by the realistic, held-out and metamorphic tests.
//
// Headers follow how mail is really sent (Gmail sender guidelines; ESP
// fingerprints): bulk mail leaves through a sending service whose Return-Path
// and Message-ID show it, or through the brand's own servers; a person's mail
// leaves their mail app (Gmail's Message-IDs end @mail.gmail.com) with a
// Return-Path of their own address. A sender keeps one path for all its mail,
// and 15% of rows carry none of these headers, like old index rows.
import { gmailLabelFields } from "../lib/providers/gmailProvider";
import type { NormalizedMessageMetadata, SentRecord } from "../lib/providers/emailProvider";
import { agreement, type Vote, type Where } from "./sortHarness";

export const NOW = Date.UTC(2026, 10, 15, 12);
export const ME = "samuel@gmail.com";

let seed = 1;
export const rand = () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646;
export const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
export const digits = (n: number) => String(Math.floor(rand() * 10 ** n)).padStart(n, "0");
export const chance = (p: number) => rand() < p;

export type Tab = "primary" | "updates" | "promotions" | "social" | "forums";
const TAB_LABEL: Record<Tab, string> = {
  primary: "CATEGORY_PERSONAL",
  updates: "CATEGORY_UPDATES",
  promotions: "CATEGORY_PROMOTIONS",
  social: "CATEGORY_SOCIAL",
  forums: "CATEGORY_FORUMS",
};

/** How the mail left the sender: a person's app, a sending service, the
 * brand's own domain on a service, or the brand's own servers. */
export type Via = "person" | "esp" | "branded" | "own";

export interface Opts {
  tab?: Tab;
  important?: boolean;
  starred?: boolean;
  unsub?: boolean;
  listId?: string;
  feedbackId?: boolean;
  /** "pass" for the sender's own domain, "fail", or "none" (no header). */
  auth?: "pass" | "fail" | "none";
  /** The DKIM d= that signed it, when not the From domain. */
  signedBy?: string;
  replyTo?: string;
  autoSubmitted?: boolean;
  purchase?: boolean;
  cc?: number;
  via?: Via;
}

const FREE_APPS: Record<string, string> = {
  "gmail.com": "mail.gmail.com",
  "googlemail.com": "mail.gmail.com",
  "outlook.com": "SN6PR04MB4974.namprd04.prod.outlook.com",
  "hotmail.com": "BY5PR11MB3958.namprd11.prod.outlook.com",
  "yahoo.com": "mail.yahoo.com",
  "icloud.com": "icloud.com",
};
const ESPS: [string, string][] = [
  ["sendgrid.net", "geopod-ismtpd-3.sendgrid.net"],
  ["amazonses.com", "email.amazonses.com"],
  ["mcsv.net", "mail210.atl121.mcsv.net"],
  ["mailgun.org", "mailgun.org"],
  ["sparkpostmail.com", "sparkpostmail.com"],
];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

function headers(from: string, id: string, via: Via | undefined): Partial<NormalizedMessageMetadata> {
  if (hash(id) % 100 < 15) return {};
  const domain = from.split("@")[1];
  const h = hash(from);
  const path: Via = via ?? (FREE_APPS[domain] ? "person" : (["esp", "esp", "esp", "esp", "branded", "branded", "branded", "branded", "own", "own"] as const)[h % 10]);
  const token = `${(h % 99991).toString(36)}${id}`;
  if (path === "person") {
    const app = FREE_APPS[domain] ?? (h % 2 ? "mail.gmail.com" : "PH0PR12MB7082.namprd12.prod.outlook.com");
    return { returnPathDomain: domain, messageIdHeader: `<CA+${token}@${app}>` };
  }
  const [espDomain, espHost] = ESPS[h % ESPS.length];
  if (path === "esp") return { returnPathDomain: `bounces.${espDomain}`, messageIdHeader: `<${token}@${espHost}>` };
  if (path === "branded") return { returnPathDomain: `bounce.${domain}`, messageIdHeader: `<${token}@${h % 2 ? espHost : domain}>` };
  return { returnPathDomain: domain, messageIdHeader: `<${token}@${domain}>` };
}

let n = 0;
export function mail(from: string, name: string, subject: string, o: Opts = {}): NormalizedMessageMetadata {
  const id = `r${++n}`;
  const domain = from.split("@")[1];
  const labels = ["INBOX", TAB_LABEL[o.tab ?? "updates"]];
  if (o.important) labels.push("IMPORTANT");
  if (o.starred) labels.push("STARRED");
  if (chance(0.55)) labels.push("UNREAD");
  const d = o.signedBy ?? domain;
  const auth =
    (o.auth ?? "pass") === "pass"
      ? `mx.google.com; dkim=pass header.i=@${d}; spf=pass smtp.mailfrom=${domain}; dmarc=pass header.from=${domain}`
      : o.auth === "fail"
        ? `mx.google.com; dkim=fail header.i=@${domain}; spf=fail smtp.mailfrom=${domain}; dmarc=fail header.from=${domain}`
        : undefined;
  return {
    id,
    provider: "gmail",
    fromAddress: from.toLowerCase(),
    fromDisplayName: name,
    replyToAddress: o.replyTo ?? "",
    subject,
    sizeBytes: 30_000,
    unsubscribe: o.unsub ? { httpUrl: `https://${domain}/unsubscribe`, postUrl: `https://${domain}/one-click` } : {},
    receivedAt: NOW - Math.floor(rand() * 60) * 86_400_000 - 5 * 3_600_000,
    threadId: `t${id}`,
    authenticationResults: auth,
    listId: o.listId,
    feedbackId: o.feedbackId ? `${digits(6)}:${domain}` : undefined,
    autoSubmitted: o.autoSubmitted ? "auto-generated" : undefined,
    gmailPurchase: o.purchase,
    toAddresses: [ME],
    ccAddresses: Array.from({ length: o.cc ?? 0 }, (_, i) => `cc${i}@example.com`),
    recipientCount: 1 + (o.cc ?? 0),
    referencesCount: 0,
    ...headers(from.toLowerCase(), id, o.via),
    ...gmailLabelFields(labels),
    // gmailLabelFields can't know a purchase; keep ours.
    ...(o.purchase ? { gmailPurchase: true } : {}),
  };
}

/** A real sender: an address and the name it always uses. */
export const sender = (pairs: [string, string][]): [string, string] => pick(pairs);

export interface Template {
  group: string;
  /** Every answer a person would accept; the first is ideal. */
  accept: Where[];
  count: number;
  make: () => NormalizedMessageMetadata;
  /** The template spoofs names on purpose (scams), so the one-name rule skips it. */
  spoofs?: boolean;
}

export interface Case {
  t: Template;
  meta: NormalizedMessageMetadata;
}

export const sent: SentRecord[] = [];
export const reply = (m: NormalizedMessageMetadata) => {
  sent.push({ id: `s${m.id}`, provider: "gmail", threadId: m.threadId, sentAt: m.receivedAt - 3_600_000, to: [{ address: m.fromAddress, name: "" }], cc: [], bcc: [] });
  return m;
};

/** Builds every template's mail from a fixed seed, so runs repeat exactly. */
export function build(templates: Template[], startSeed: number): { cases: Case[]; sent: SentRecord[] } {
  seed = startSeed;
  n = 0;
  sent.length = 0;
  const cases = templates.flatMap((t) => Array.from({ length: t.count }, () => ({ t, meta: t.make() })));
  return { cases, sent: [...sent] };
}

/** A mistake in the generator, not in Cluster: an address with two names,
 * or one address used both by a scam and by honest mail. */
export function generatorProblems(cases: Case[]): string[] {
  const names = new Map<string, Set<string>>();
  const scam = new Set<string>();
  const honest = new Set<string>();
  for (const c of cases) {
    (c.t.accept[0] === "spam" ? scam : honest).add(c.meta.fromAddress);
    if (c.t.spoofs) continue;
    const set = names.get(c.meta.fromAddress) ?? new Set();
    set.add(c.meta.fromDisplayName);
    names.set(c.meta.fromAddress, set);
  }
  return [
    ...[...names].filter(([, s]) => s.size > 1).map(([a, s]) => `${a} has names ${[...s].join(" / ")}`),
    ...[...scam].filter((a) => honest.has(a)).map((a) => `${a} sends both scams and honest mail`),
  ];
}

const LABELS = new Set<Where>(["personal", "screener", "spam", "inbox"]);

export interface Report {
  text: string;
  ok: number;
  ideal: number;
  total: number;
  /** Of mail Cluster put under a label, the share that doesn't belong there. */
  wrongLabelRate: number;
  /** Share of all mail that got a label. */
  labelled: number;
  screenerShare: number;
  /** People (ideal Personal) that went to the Screener. */
  peopleScreened: number;
  personInSpam: string[];
  scamWithPeople: string[];
}

export function report(cases: Case[], where: Map<string, Where>, templates: Template[]): Report {
  let ok = 0;
  let ideal = 0;
  const lines: string[] = [];
  for (const t of templates) {
    const mine = cases.filter((c) => c.t === t);
    const got = new Map<Where, number>();
    for (const c of mine) got.set(where.get(c.meta.id)!, (got.get(where.get(c.meta.id)!) ?? 0) + 1);
    const okN = mine.filter((c) => t.accept.includes(where.get(c.meta.id)!)).length;
    ok += okN;
    ideal += mine.filter((c) => where.get(c.meta.id) === t.accept[0]).length;
    const spread = [...got].sort((a, b) => b[1] - a[1]).map(([w, k]) => `${w} ${k}`).join(", ");
    lines.push(`${okN === mine.length ? "  " : "✗ "}${t.group.padEnd(48)} ${String(okN).padStart(3)}/${String(mine.length).padEnd(3)}  ${spread}`);
    const missed = mine.filter((c) => !t.accept.includes(where.get(c.meta.id)!)).map((c) => `${c.meta.fromAddress} "${c.meta.subject}" → ${where.get(c.meta.id)}`);
    for (const m of [...new Set(missed)].slice(0, 3)) lines.push(`      ${m}`);
  }
  const total = cases.length;
  const dest = new Map<Where, { all: number; fits: number }>();
  for (const c of cases) {
    const w = where.get(c.meta.id)!;
    const d = dest.get(w) ?? { all: 0, fits: 0 };
    d.all++;
    if (c.t.accept.includes(w)) d.fits++;
    dest.set(w, d);
  }
  const destLines = [...dest].sort((a, b) => b[1].all - a[1].all).map(([w, d]) => `  ${w.padEnd(13)} ${String(d.all).padStart(4)} emails, ${((d.fits / d.all) * 100).toFixed(1)}% belong there`);
  const labelledCases = cases.filter((c) => !LABELS.has(where.get(c.meta.id)!));
  const wrongLabels = labelledCases.filter((c) => !c.t.accept.includes(where.get(c.meta.id)!)).length;
  const people = cases.filter((c) => c.t.accept[0] === "personal");
  const pct = (a: number, b: number) => `${((a / Math.max(b, 1)) * 100).toFixed(1)}%`;
  const personInSpam = people.filter((c) => where.get(c.meta.id) === "spam").map((c) => `${c.t.group}: ${c.meta.fromAddress}`);
  const scamWithPeople = cases
    .filter((c) => c.t.accept[0] === "spam" && !["spam", "screener"].includes(where.get(c.meta.id)!))
    .map((c) => `${c.t.group} → ${where.get(c.meta.id)}`);
  const peopleScreened = people.filter((c) => where.get(c.meta.id) === "screener").length;
  const screener = cases.filter((c) => where.get(c.meta.id) === "screener").length;
  const text = [
    ...lines,
    "",
    `Acceptable: ${ok}/${total} (${pct(ok, total)})   Ideal: ${ideal}/${total} (${pct(ideal, total)})`,
    `Labelled ${pct(labelledCases.length, total)} of mail, ${pct(wrongLabels, labelledCases.length)} of those labels wrong; Screener holds ${pct(screener, total)}; people sent to the Screener ${peopleScreened}/${people.length}`,
    "",
    "By destination:",
    ...destLines,
    "",
    `Safety: people in Spam ${personInSpam.length}, scams shown as mail ${scamWithPeople.length}`,
    ...[...new Set(scamWithPeople)],
  ].join("\n");
  return {
    text,
    ok,
    ideal,
    total,
    wrongLabelRate: wrongLabels / Math.max(labelledCases.length, 1),
    labelled: labelledCases.length / total,
    screenerShare: screener / total,
    peopleScreened,
    personInSpam,
    scamWithPeople,
  };
}

/** How right Cluster is where the signals agree, disagree or say nothing,
 * and what sending all disagreeing mail to the Screener would trade: fewer
 * labels against fewer wrong ones (the risk-coverage trade of selective
 * classification: Geifman and El-Yaniv, ICML 2019). */
export function voteReport(cases: Case[], where: Map<string, Where>, votes: Map<string, Record<string, Vote>>): string {
  const groups = new Map<string, Case[]>();
  for (const c of cases) {
    const g = agreement(votes.get(c.meta.id) ?? {});
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const ok = (c: Case) => c.t.accept.includes(where.get(c.meta.id)!);
  const pct = (a: number, b: number) => `${((a / Math.max(b, 1)) * 100).toFixed(1)}%`;
  const lines = ["Signals:"];
  for (const g of ["agree", "mixed", "conflict", "none"]) {
    const list = groups.get(g) ?? [];
    lines.push(`  ${g.padEnd(9)} ${String(list.length).padStart(4)} emails, ${pct(list.filter(ok).length, list.length)} acceptable`);
  }
  const isLabel = (w: Where) => !LABELS.has(w);
  const labelled = cases.filter((c) => isLabel(where.get(c.meta.id)!));
  const kept = labelled.filter((c) => agreement(votes.get(c.meta.id) ?? {}) !== "conflict");
  const wrong = (list: Case[]) => list.filter((c) => !ok(c)).length;
  lines.push(
    `  Labels now: ${pct(labelled.length, cases.length)} of mail, ${pct(wrong(labelled), labelled.length)} wrong.` +
      ` Person-vs-machine conflicts to the Screener instead: ${pct(kept.length, cases.length)} of mail, ${pct(wrong(kept), kept.length)} wrong.`,
  );
  // One wrong email per kind of mail, with what each signal said.
  const seen = new Set<Template>();
  for (const c of cases.filter((x) => !ok(x))) {
    if (seen.has(c.t)) continue;
    seen.add(c.t);
    lines.push(`    [${agreement(votes.get(c.meta.id) ?? {})}] ${c.meta.fromAddress} "${c.meta.subject}" → ${where.get(c.meta.id)}  ${JSON.stringify(votes.get(c.meta.id))}`);
  }
  return lines.join("\n");
}
