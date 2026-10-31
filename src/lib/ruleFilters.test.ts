import { describe, expect, it, vi } from "vitest";
import { filterSpec, gmailFilterFor, syncRuleFilters } from "./ruleFilters";
import type { ClusterRule } from "./rules";

const rule = (over: Partial<ClusterRule>): ClusterRule => ({
  id: "r1",
  name: "Amazon",
  enabled: true,
  conditions: { fromDomain: "amazon.in" },
  action: "label",
  labelName: "Shopping",
  ...over,
});

describe("gmailFilterFor", () => {
  it("turns a sender rule into a Gmail filter that labels and files out", () => {
    expect(gmailFilterFor(rule({}))).toEqual({
      criteria: { from: "amazon.in" },
      labelName: "Shopping",
      addLabelIds: [],
      removeLabelIds: ["INBOX"],
    });
  });

  it("keeps a label-in-place rule in the inbox, and maps archive, read and trash", () => {
    expect(gmailFilterFor(rule({ labelKeepInInbox: true }))?.removeLabelIds).toEqual([]);
    const multi = rule({ actions: [{ action: "archive" }, { action: "markRead" }] });
    expect(gmailFilterFor(multi)?.removeLabelIds).toEqual(["INBOX", "UNREAD"]);
    expect(gmailFilterFor(rule({ action: "trash" }))?.addLabelIds).toEqual(["TRASH"]);
  });

  it("writes a sender exception as a not-from", () => {
    const r = rule({ exceptions: { fromAddress: "boss@amazon.in" } });
    expect(gmailFilterFor(r)?.criteria).toEqual({ from: "amazon.in", negatedQuery: "from:boss@amazon.in" });
  });

  it("leaves rules Gmail can't express to Cluster", () => {
    expect(gmailFilterFor(rule({ conditions: { fromDomain: "a.com", olderThanDays: 30 } }))).toBeNull();
    expect(gmailFilterFor(rule({ conditions: { kind: "newsletter" } }))).toBeNull();
    expect(gmailFilterFor(rule({ enabled: false }))).toBeNull();
    expect(gmailFilterFor(rule({ exceptions: { unread: true } }))).toBeNull();
  });

  it("changes its fingerprint when the rule changes", () => {
    expect(filterSpec(gmailFilterFor(rule({}))!)).not.toBe(filterSpec(gmailFilterFor(rule({ labelName: "Orders" }))!));
  });
});

vi.mock("./gmailApi", () => ({
  listFilters: vi.fn(async () => [{ id: "f-live" }, { id: "f-stale" }]),
  deleteFilter: vi.fn(async () => {}),
  createFilter: vi.fn(async () => "f-new"),
  getOrCreateLabel: vi.fn(async () => "Label_1"),
}));

describe("syncRuleFilters", () => {
  it("keeps a matching filter, replaces a stale one and drops one whose rule is gone", async () => {
    const api = await import("./gmailApi");
    const kept = rule({ id: "kept" });
    const changed = rule({ id: "changed", labelName: "Orders" });
    const existing = {
      kept: { id: "f-live", spec: filterSpec(gmailFilterFor(kept)!) },
      changed: { id: "f-stale", spec: "old" },
      gone: { id: "f-gone", spec: "x" },
    };
    const next = await syncRuleFilters([kept, changed], existing, "t");
    expect(next.kept.id).toBe("f-live");
    expect(next.changed.id).toBe("f-new");
    expect(next.gone).toBeUndefined();
    expect(api.deleteFilter).toHaveBeenCalledWith("t", "f-stale");
    expect(api.deleteFilter).not.toHaveBeenCalledWith("t", "f-live");
    expect(api.deleteFilter).not.toHaveBeenCalledWith("t", "f-gone");
    expect(api.createFilter).toHaveBeenCalledWith(
      "t",
      { from: "amazon.in" },
      { addLabelIds: ["Label_1"], removeLabelIds: ["INBOX"] },
    );
  });
});
