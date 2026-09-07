/**
 * Throwaway complexity bench for Cluster's pure processing pipeline.
 * Run: npx tsx scripts/bench-pipeline.mts
 *
 * Isolates CPU/heap cost of the in-memory stages (metadata assembly, threat
 * scoring, grouping, plans, rules, views) from the network stages, which are
 * quota-bound and covered in research/2026-09-06-gmail-quota-403-audit.md.
 */
import { buildSenderSummariesFromStubs, type SenderSummary } from "../src/lib/senderModel";
import type {
  EmailProvider,
  NormalizedMessageMetadata,
  NormalizedMessageStub,
} from "../src/lib/providers/emailProvider";
import { buildDomainGroups } from "../src/lib/domainGrouping";
import { buildInboxHealth } from "../src/lib/inboxHealth";
import { buildSortPlan } from "../src/lib/autoSort";
import { matchRule, findRuleConflicts, type ClusterRule } from "../src/lib/rules";
import { SMART_VIEWS, smartViewMessageCount } from "../src/lib/smartViews";
import { suggestSpamSenders } from "../src/lib/spamSuggestions";
import { isSpamDomain } from "../src/lib/spamList";
import { isBlockedDomain } from "../src/lib/blocklist";
import type { ClusterSettings } from "../src/lib/settingsStore";

const STUB_SETTINGS = {
  snoozedMessages: {},
  screenerEnabled: false,
  screenedSenders: [],
  actionLog: [],
} as unknown as ClusterSettings;

const SUBJECTS = [
  "Your order has shipped",
  "Your verification code is 448122",
  "Weekly newsletter: 5 things to read",
  "Receipt for your payment",
  "Re: lunch tomorrow?",
  "50% off this weekend only",
  "Your statement is ready",
  "Security alert for your account",
];
const DOMAINS = [
  "amazon.com", "paypal.com", "substack.com", "delta.com", "linkedin.com",
  "randomshop7.example", "news.example", "acme-saas.example", "gmail.com", "unknown-brand.test",
];

function mkStubsAndProvider(nSenders: number, msgsPerSender: number) {
  const stubs: NormalizedMessageStub[] = [];
  const meta = new Map<string, NormalizedMessageMetadata>();
  const now = Date.now();
  for (let s = 0; s < nSenders; s++) {
    const domain = DOMAINS[s % DOMAINS.length];
    const addr = `sender${s}@${domain}`;
    for (let m = 0; m < msgsPerSender; m++) {
      const id = `g_${s}_${m}`;
      stubs.push({ id, provider: "gmail" });
      meta.set(id, {
        id,
        provider: "gmail",
        fromAddress: addr,
        fromDisplayName: `Sender ${s}`,
        replyToAddress: "",
        subject: SUBJECTS[(s + m) % SUBJECTS.length],
        isProtected: m === 0 && s % 11 === 0,
        unread: (s + m) % 3 !== 0,
        sizeBytes: ((s * 7 + m) % 40) * 100_000,
        unsubscribe: s % 2 === 0 ? { postUrl: "https://x.example/u" } : {},
        receivedAt: now - ((s * 13 + m * 97) % 500) * 24 * 3600 * 1000,
        authenticationResults:
          s % 5 === 0
            ? "mx.google.com; spf=pass smtp.mailfrom=x; dkim=pass; dmarc=pass"
            : s % 5 === 1
              ? "mx.google.com; spf=fail; dkim=fail; dmarc=fail header.from=paypal.com"
              : undefined,
      });
    }
  }
  const provider = {
    id: "gmail",
    async getMessageMetadata(_t: string, id: string) {
      return meta.get(id)!;
    },
  } as unknown as EmailProvider;
  return { stubs, provider };
}

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function time<T>(label: string, fn: () => T | Promise<T>): Promise<{ ms: number; heap: number; out: T }> {
  if (global.gc) global.gc();
  const h0 = heapMB();
  const t0 = performance.now();
  const out = await fn();
  const ms = performance.now() - t0;
  const heap = heapMB() - h0;
  return { ms, heap, out };
}

const RULES: ClusterRule[] = [
  { id: "r1", name: "old newsletters", enabled: true, conditions: { kind: "newsletter", olderThanDays: 30 }, action: "archive" },
  { id: "r2", name: "shopping", enabled: true, conditions: { fromDomainCategory: "shopping" }, action: "label", labelName: "Shopping" },
  { id: "r3", name: "unread promos", enabled: true, conditions: { hasUnsubscribe: true, unread: true }, action: "markRead" },
];

async function runSize(nSenders: number, msgsPerSender: number) {
  const total = nSenders * msgsPerSender;
  const { stubs, provider } = mkStubsAndProvider(nSenders, msgsPerSender);

  const build = await time("buildSenderSummariesFromStubs", () =>
    buildSenderSummariesFromStubs([{ provider, token: "t", stubs }]),
  );
  const senders = build.out as SenderSummary[];

  const dg = await time("buildDomainGroups", () => buildDomainGroups(senders));
  const health = await time("buildInboxHealth", () =>
    buildInboxHealth({ senders, securitySenders: senders, settings: STUB_SETTINGS }),
  );
  const sort = await time("buildSortPlan", () => buildSortPlan(senders));
  const rules = await time("matchRule x3", () => RULES.map((r) => matchRule(r, senders)));
  const conflicts = await time("findRuleConflicts x3", () => findRuleConflicts(RULES, senders));
  const views = await time("smartViews x5", () =>
    SMART_VIEWS.map((v) => smartViewMessageCount(v, senders)),
  );
  const spam = await time("suggestSpamSenders", () => suggestSpamSenders(senders));

  const row = (label: string, r: { ms: number; heap: number }) =>
    `  ${label.padEnd(30)} ${r.ms.toFixed(2).padStart(9)} ms   ${r.heap >= 0 ? "+" : ""}${r.heap.toFixed(1).padStart(6)} MB`;

  console.log(`\n=== ${nSenders} senders x ${msgsPerSender} msgs = ${total} messages ===`);
  console.log(row("buildSenderSummariesFromStubs", build));
  console.log(row("buildDomainGroups", dg));
  console.log(row("buildInboxHealth (aggregate)", health));
  console.log(row("buildSortPlan", sort));
  console.log(row("matchRule x3", rules));
  console.log(row("findRuleConflicts x3", conflicts));
  console.log(row("smartViews x5", views));
  console.log(row("suggestSpamSenders", spam));
  console.log(
    `  -> senders=${senders.length} retained heap for senders[] ~ ${(heapMB()).toFixed(1)} MB resident`,
  );
}

async function microDomainLookups() {
  const test = ["mail.amazon.com", "x.paypal.com", "totally-unknown-9f8a.example", "sub.sub.evil.test", "gmail.com"];
  const N = 200_000;
  const t0 = performance.now();
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const d = test[i % test.length];
    if (isSpamDomain(d)) hits++;
    if (isBlockedDomain(d)) hits++;
  }
  const ms = performance.now() - t0;
  console.log(
    `\n=== domain-list matcher micro-bench ===\n  ${2 * N} lookups (spam list 10.7k + blocklist 388, parent-walk) in ${ms.toFixed(1)} ms  => ${((2 * N) / (ms / 1000) / 1e6).toFixed(1)} M lookups/s  (hits ${hits})`,
  );
}

async function main() {
  console.log("Cluster pipeline complexity bench —", global.gc ? "gc exposed" : "no --expose-gc (heap deltas noisy)");
  for (const [s, m] of [
    [100, 3],
    [500, 3],
    [2000, 3],
    [5000, 4],
    [10000, 4],
  ] as const) {
    await runSize(s, m);
  }
  // Pathological: one sender, many messages (worst case for per-sender inner loops)
  await runSize(1, 20000);
  await microDomainLookups();
}

main();
