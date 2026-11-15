// Replays real mail: the file `clusterExportReplay()` saves from the dashboard
// (src/dashboard/replayExport.ts), placed at replay/cluster-replay.json. It is
// git-ignored and never leaves this computer; without it the test skips.
//
// The answer key is your own corrections: each sender you filed somewhere
// (sortOverrides, and label swaps Cluster saw you make) is sorted once with
// all corrections removed, and the test reports how often Cluster would have
// put that sender where you did. It also shows where all your mail lands and
// the senders no signal speaks for.
import { describe, expect, it } from "vitest";
import { correctionKey } from "./addressIdentity";
import { domainOf } from "./domainGrouping";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import { overrideFor, type SortOverride } from "./sortTaxonomy";
import { agreement, out, signalVotes, sortMailbox, type Where } from "../test/sortHarness";

interface Replay {
  metas: NormalizedMessageMetadata[];
  sent: SentRecord[];
  contacts: string[];
  overrides: Record<string, SortOverride>;
  moveVotes: Record<string, { bucket: SortOverride; n: number }>;
}

type NodeFs = { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string };
const fs = (await import("node:" + "fs")) as NodeFs;
const FILE = "replay/cluster-replay.json";
const replay: Replay | undefined = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : undefined;

describe.skipIf(!replay)("replay of your own mail", () => {
  it("scores Cluster against your corrections and reports where your mail lands", async () => {
    const r = replay!;
    const metas = r.metas.filter((m) => m.fromAddress);
    const now = Math.max(...metas.map((m) => m.receivedAt)) + 3_600_000;
    // Your answer key: corrections, then label swaps (moves win only where no correction exists).
    const key: Record<string, SortOverride> = { ...Object.fromEntries(Object.entries(r.moveVotes).map(([k, v]) => [k, v.bucket])), ...r.overrides };
    const setup = { contacts: r.contacts, sent: r.sent, now };
    const where = await sortMailbox(metas, setup);

    // Senders you corrected, sorted without any correction.
    const bySender = new Map<string, { wanted: SortOverride; got: Map<Where, number> }>();
    for (const m of metas) {
      const wanted = overrideFor(m.fromAddress, domainOf(m.fromAddress), key);
      if (!wanted || wanted === "never") continue;
      const row = bySender.get(correctionKey(m.fromAddress)) ?? { wanted, got: new Map() };
      const got = where.get(m.id)!;
      row.got.set(got, (row.got.get(got) ?? 0) + 1);
      bySender.set(correctionKey(m.fromAddress), row);
    }
    let agree = 0;
    const misses = new Map<string, number>();
    for (const { wanted, got } of bySender.values()) {
      const top = [...got].sort((a, b) => b[1] - a[1])[0][0];
      if (top === wanted) agree++;
      else misses.set(`${wanted} → ${top}`, (misses.get(`${wanted} → ${top}`) ?? 0) + 1);
    }

    const dest = new Map<Where, number>();
    for (const w of where.values()) dest.set(w, (dest.get(w) ?? 0) + 1);
    const votes = await signalVotes(metas, setup);
    const groups = new Map<string, number>();
    const silent = new Map<string, number>();
    for (const m of metas) {
      const g = agreement(votes.get(m.id) ?? {});
      groups.set(g, (groups.get(g) ?? 0) + 1);
      if (g === "none" || g === "conflict") silent.set(`[${g}] ${m.fromAddress}`, (silent.get(`[${g}] ${m.fromAddress}`) ?? 0) + 1);
    }
    const pct = (a: number, b: number) => `${((a / Math.max(b, 1)) * 100).toFixed(1)}%`;
    const sorted = <K,>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
    out(
      [
        "",
        `=== Replay: ${metas.length} of your emails, ${bySender.size} corrected senders ===`,
        `Without your corrections, Cluster agrees with you on ${agree}/${bySender.size} senders (${pct(agree, bySender.size)})`,
        ...sorted(misses).map(([k, n]) => `  you said ${k}: ${n} senders`),
        "Where your mail lands:",
        ...sorted(dest).map(([w, n]) => `  ${String(w).padEnd(13)} ${String(n).padStart(6)}  ${pct(n, metas.length)}`),
        `Signals: ${sorted(groups).map(([g, n]) => `${g} ${n}`).join(", ")}`,
        "Busiest senders no signal speaks for, or with a person-vs-machine conflict:",
        ...sorted(silent).slice(0, 15).map(([k, n]) => `  ${k}  ${n}`),
        "",
      ].join("\n"),
    );
    expect(where.size).toBe(metas.length);
  });
});
