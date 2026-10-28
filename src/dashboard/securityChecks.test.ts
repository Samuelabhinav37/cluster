// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SenderSummary } from "../lib/senderModel";
import { securityChecks } from "./securityTab";

const sender = (over: Partial<SenderSummary>): SenderSummary =>
  ({
    threatSignals: [],
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    ...over,
  }) as SenderSummary;

describe("securityChecks", () => {
  it("counts senders per check and flags any that tripped", () => {
    const rows = securityChecks(
      [
        sender({}),
        sender({ authVerdicts: { spf: "pass", dkim: "fail", dmarc: "fail" } }),
        sender({ threatSignals: [{ kind: "lookalike-domain", brand: "paypal", confidence: "high" }] as never }),
      ],
      4,
    );
    expect(rows.map((r) => [r.name, r.value, r.warn])).toEqual([
      ["Sender checks", "1 failed", true],
      ["Fake brand names", "1", true],
      ["Replies sent elsewhere", "None", false],
      ["Known bad links", "None", false],
      ["Held so far", "4", false],
    ]);
  });

  it("says the checks haven't run when no sender has results", () => {
    const rows = securityChecks([sender({ authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" } })], 0);
    expect(rows[0].value).toBe("Not checked yet");
  });
});
