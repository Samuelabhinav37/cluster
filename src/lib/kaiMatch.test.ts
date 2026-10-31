// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CLUSTER_QUESTIONS } from "../dashboard/kaiGuide";
import { learnPick, matchKai, rememberMiss, type KaiDoc } from "./kaiMatch";

const docs: KaiDoc[] = CLUSTER_QUESTIONS.map((q) => ({ id: q.id, texts: [q.ask, ...(q.phrases ?? [])] }));

// Typed the way people type, none copied from the phrasings.
const CASES: [string, string][] = [
  ["can you see what my emails say", "read"],
  ["is my data sent to a server", "read"],
  ["privacy", "read"],
  ["how do i put emails into labels", "sort"],
  ["sort inbox", "sort"],
  ["organise my mail", "sort"],
  ["why is paypal flagged", "flagged"],
  ["is this phishing", "flagged"],
  ["why the warning", "flagged"],
  ["undo", "undo"],
  ["i trashed the wrong emails", "undo"],
  ["recover deleted mail", "undo"],
  ["unsubscribe", "unsub"],
  ["how to stop getting newsletters", "unsub"],
  ["leave mailing lists", "unsub"],
  ["does sorting continue for new emails", "keep"],
  ["work with chrome closed", "keep"],
  ["what does new senders do", "screener"],
  ["hold strangers", "screener"],
  ["will you delete starred emails", "starred"],
  ["is important mail safe", "starred"],
  ["delete old mail", "cleanup"],
  ["clean up my inbox", "cleanup"],
  ["trash emails i never read", "cleanup"],
  ["get rid of old verification codes", "cleanup"],
  ["make a rule", "rules"],
  ["create filter for amazon", "rules"],
  ["always archive mail from linkedin", "rules"],
  ["block scammer", "block"],
  ["mark this as spam", "block"],
  ["search", "find"],
  ["how do i look for an email", "find"],
  ["find mail from mom", "find"],
  ["who emails me most", "contacts"],
  ["see my contacts", "contacts"],
  ["shortcuts", "keys"],
  ["change keyboard keys", "keys"],
  ["where is quarantined mail", "held"],
  ["release held email", "held"],
  ["my email disappeared", "held"],
];

describe("matchKai", () => {
  it("answers at least 90% of typed questions with the right first answer", () => {
    const wrong = CASES.filter(([q, id]) => matchKai(q, docs)[0]?.id !== id);
    expect(wrong.length / CASES.length, JSON.stringify(wrong.map(([q, id]) => [q, id, matchKai(q, docs)[0]?.id]))).toBeLessThanOrEqual(0.1);
  });

  it("says nothing rather than guess at gibberish", () => {
    expect(matchKai("zzqx blorp", docs)).toEqual([]);
    expect(matchKai("the and of", docs)).toEqual([]);
  });

  it("ranks a picked answer first next time, and the pick fades over time", () => {
    const q = "where are my emails";
    const first = matchKai(q, docs)[0]?.id;
    const target = docs.find((d) => d.id !== first)!.id;
    let learned = {};
    for (let i = 0; i < 3; i++) learned = learnPick(learned, q, target, 0);
    expect(matchKai(q, docs, learned, 0)[0].id).toBe(target);
    const muchLater = 2 * 365 * 86_400_000;
    expect(matchKai(q, docs, learned, muchLater)[0]?.id).not.toBe(target);
  });

  it("keeps the 50 newest misses, without repeats", () => {
    let misses: { q: string; at: number }[] = [];
    for (let i = 0; i < 60; i++) misses = rememberMiss(misses, `q${i}`, i);
    misses = rememberMiss(misses, "q59", 99);
    expect(misses).toHaveLength(50);
    expect(misses[0]).toEqual({ q: "q59", at: 99 });
    expect(misses.filter((m) => m.q === "q59")).toHaveLength(1);
  });
});
