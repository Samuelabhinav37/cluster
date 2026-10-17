// Non-functional: every parser and classifier that reads sender-controlled
// headers (From, Subject, Reply-To, List-Unsubscribe, DKIM-Signature,
// Authentication-Results) must never throw on garbage, and no regex may
// backtrack catastrophically on a long hostile value (ReDoS). A throw here
// fails the whole scan; a ReDoS freezes the dashboard.
import { describe, expect, it } from "vitest";
import { meta } from "../test/mailFixtures";
import { classifyMessageKind, looksAutomated } from "../lib/messageKind";
import { protectionDecision } from "../lib/protectionPolicy";
import { parseAuthenticationResults, selectTrustedAuthenticationResults } from "../lib/emailAuth";
import { hasVerifiedOneClickSignature, parseListUnsubscribe } from "../lib/unsubscribe";
import { scoreMessageForThreats } from "../lib/threatSignals";
import { detectSubscriptionSignal } from "../lib/subscriptionSignals";
import { registrableDomainCandidates } from "../lib/registrableDomain";
import { isSpamDomain } from "../lib/spamList";
import { parseRetryAfterMs } from "../lib/httpRetry";

// Deterministic PRNG so a failure reproduces.
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const ALPHABET = 'abcAZ09 <>@.,;:="\'()[]{}\\/-_*+?^$|\n\t\u0000‮а​xn--=?UTF-8?B?';

function garbage(r: () => number, max = 300): string {
  const n = Math.floor(r() * max);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return s;
}

function everyParser(s: string) {
  classifyMessageKind(s, s.length % 2 === 0);
  looksAutomated(s.length % 2 === 0, s, s);
  protectionDecision({
    id: "x",
    subject: s,
    receivedAt: 0,
    kind: "other",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
  });
  parseAuthenticationResults(s);
  selectTrustedAuthenticationResults("gmail", [s]);
  selectTrustedAuthenticationResults("outlook", [s]);
  parseListUnsubscribe(s, s, {
    provider: "gmail",
    fromAddress: s,
    authenticationResults: [s, `mx.google.com; ${s}`],
    dkimSignatures: [s],
  });
  hasVerifiedOneClickSignature({ provider: "outlook", fromAddress: `a@${s}`, authenticationResults: [s], dkimSignatures: [s] });
  scoreMessageForThreats(
    meta({ fromAddress: s, fromDisplayName: s, replyToAddress: s, subject: s, authenticationResults: s }),
  );
  detectSubscriptionSignal(s, s);
  registrableDomainCandidates(s);
  parseRetryAfterMs(s);
}

describe("fuzz: sender-controlled header values never throw", () => {
  it("2,000 random header strings", () => {
    const r = rng(20261005);
    for (let i = 0; i < 2_000; i++) {
      const s = garbage(r);
      expect(() => everyParser(s), JSON.stringify(s)).not.toThrow();
    }
  });

  it("known-awkward shapes", () => {
    const cases = [
      "",
      " ",
      "<>",
      "<<<>>>",
      "@",
      "@@@",
      "a@",
      "@b",
      "a@b@c",
      "mx.google.com;",
      ";;;;",
      "dkim=",
      "dkim=pass header.d=",
      "h=:::::",
      "=?UTF-8?B?8J+Ukg==?= <x@y.z>",
      "‮liamg.com@evil",
      "xn--pypal-4ve.com",
      "x".repeat(10_000),
    ];
    for (const s of cases) expect(() => everyParser(s), JSON.stringify(s)).not.toThrow();
  });
});

describe("ReDoS: long hostile values stay fast", () => {
  // Shapes chosen to stress the optional/alternation-heavy regexes:
  // LURE_RE, ACTIVE_OFFER_OR_WINDOW_RE, SENSITIVE_SUBJECT, OTP/SHIPPING/RECEIPT,
  // the auth-result verdict extractors and the DKIM tag reader.
  const hostile = [
    "a".repeat(50_000),
    "verify your account within ".repeat(2_000),
    "account has been ".repeat(3_000),
    "confirm your ".repeat(4_000),
    // Dot-free on purpose: dot-heavy values hit the quadratic domain helper,
    // which has its own deterministic test below.
    "dkim=pass header_d=".repeat(2_000),
    "; h=list-unsubscribe".repeat(2_000),
    "<https://x-example/".repeat(2_000),
    "payment ".repeat(6_000) + "!",
    " ".repeat(50_000) + "x",
    "-".repeat(50_000),
  ];

  for (const [i, s] of hostile.entries()) {
    it(`hostile input #${i + 1} (${s.length.toLocaleString()} chars) parses in under 250 ms`, () => {
      const t0 = performance.now();
      everyParser(s);
      const ms = performance.now() - t0;
      expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(250);
    });
  }
});

describe("domain helpers", () => {
  // KNOWN PERF ISSUE: registrableDomainCandidates rebuilds the suffix string
  // for every label — O(labels²). Measured 15 → 51 → 172 ms for 1k → 2k → 4k
  // labels. Real DNS names stop at 253 chars / 127 labels, so capping the
  // input there makes it constant-bounded. Every blocklist/spam/category
  // lookup goes through it with a sender-controlled domain.
  it.fails("KNOWN PERF: a 4,000-label hostile domain is looked up in under 20 ms", () => {
    const hostileDomain = "a.".repeat(4_000) + "com";
    const t0 = performance.now();
    registrableDomainCandidates(hostileDomain);
    isSpamDomain(hostileDomain);
    expect(performance.now() - t0).toBeLessThan(20);
  });

  it("a real-length domain resolves all parent candidates", () => {
    expect(registrableDomainCandidates("mail.e.delta.com")).toEqual(["mail.e.delta.com", "e.delta.com", "delta.com"]);
  });
});
