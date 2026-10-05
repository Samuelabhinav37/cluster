import { describe, expect, it, vi } from "vitest";
import type { GmailFilterResource, GmailLabelInfo } from "./gmailApi";
import { migratedLabelNames, planLabelMigration, runLabelMigration, type LabelMigrationApi } from "./labelMigration";

const user = (id: string, name: string): GmailLabelInfo => ({ id, name, type: "user" });

// The label set from a real mailbox on 2026-10-05 (counts dropped).
const LIVE: GmailLabelInfo[] = [
  { id: "INBOX", name: "INBOX", type: "system" },
  user("Label_1", "Notes/Google Code Jam"),
  user("Label_10", "Cluster/One-time codes"),
  user("Label_11", "Cluster/Receipts & invoices"),
  user("Label_12", "Cluster/Order & shipping updates"),
  user("Label_13", "Cluster/Newsletters"),
  user("Label_14", "Cluster/Shopping"),
  user("Label_15", "Cluster/Travel"),
  user("Label_16", "Cluster/Finance"),
  user("Label_17", "Cluster/Productivity"),
  user("Label_18", "Cluster/Muted"),
  user("Label_2", "Notes/Psychology"),
  user("Label_6", "Job Applications"),
  user("Label_7", "Follow Up"),
  user("Label_8", "Declutter/Screener"),
  user("Label_9", "Cluster/Jobright Job Alert"),
  user("Label_X", "Amazon Order"),
];

describe("planLabelMigration", () => {
  it("renames every old Cluster/Declutter label in a real mailbox and leaves the user's own alone", () => {
    const steps = planLabelMigration(LIVE, []);
    expect(steps.every((s) => s.kind === "rename" && s.certain)).toBe(true);
    expect(Object.fromEntries(steps.map((s) => [s.from, s.to]))).toEqual({
      "Cluster/One-time codes": "🔑 One-time codes",
      "Cluster/Receipts & invoices": "🧾 Receipts",
      "Cluster/Order & shipping updates": "📦 Orders & shipping",
      "Cluster/Newsletters": "📰 Newsletters",
      "Cluster/Shopping": "🛍 Shopping",
      "Cluster/Travel": "🧳 Travel",
      "Cluster/Finance": "💳 Finance",
      "Cluster/Productivity": "💼 Work",
      "Cluster/Muted": "🔇 Muted",
      "Declutter/Screener": "✋ Screener",
      "Cluster/Jobright Job Alert": "Jobright Job Alert",
    });
  });

  it("is a no-op once everything is tidied", () => {
    const done = [user("a", "🔇 Muted"), user("b", "Jobright Job Alert"), user("c", "Notes/Psychology")];
    expect(planLabelMigration(done, [])).toEqual([]);
  });

  it("merges an old label into today's when both exist", () => {
    const steps = planLabelMigration([user("old", "Cluster/Muted"), user("new", "🔇 Muted")], []);
    expect(steps).toEqual([
      expect.objectContaining({ kind: "merge", sourceId: "old", targetId: "new", certain: true }),
    ]);
  });

  it("renames the surest old label and merges the rest into it", () => {
    const steps = planLabelMigration(
      [user("plain", "Newsletters"), user("pref", "Cluster/Newsletters")],
      ["Newsletters"],
    );
    expect(steps).toEqual([
      expect.objectContaining({ kind: "rename", sourceId: "pref", to: "📰 Newsletters" }),
      expect.objectContaining({ kind: "merge", sourceId: "plain", targetId: "pref", certain: true, dependsOn: 0 }),
    ]);
  });

  it("marks a plain old name Cluster never recorded making as uncertain", () => {
    const [step] = planLabelMigration([user("u", "Travel")], []);
    expect(step).toMatchObject({ kind: "rename", from: "Travel", certain: false });
    const [owned] = planLabelMigration([user("u", "Travel")], ["Travel"]);
    expect(owned.certain).toBe(true);
  });
});

function fakeApi(filters: GmailFilterResource[] = [], messages: Record<string, string[]> = {}) {
  const api: LabelMigrationApi = {
    renameLabel: vi.fn(async () => {}),
    deleteLabel: vi.fn(async () => {}),
    listMessageIdsInLabel: vi.fn(async (id: string) => messages[id] ?? []),
    batchModify: vi.fn(async () => {}),
    listFilters: vi.fn(async () => filters),
    createFilter: vi.fn(async () => "new-filter"),
    deleteFilter: vi.fn(async () => {}),
  };
  return api;
}

describe("runLabelMigration", () => {
  it("renames in place without touching messages or filters", async () => {
    const steps = planLabelMigration([user("L", "Cluster/Muted")], []);
    const api = fakeApi();
    const res = await runLabelMigration(steps, new Set([0]), api);
    expect(api.renameLabel).toHaveBeenCalledWith("L", "🔇 Muted");
    expect(api.batchModify).not.toHaveBeenCalled();
    expect(res).toEqual({ renamed: 1, merged: 0, messagesMoved: 0, filtersRepointed: 0 });
  });

  it("merges: moves mail, re-points filters, then deletes the old label", async () => {
    const steps = planLabelMigration([user("old", "Cluster/Muted"), user("new", "🔇 Muted")], []);
    const filters: GmailFilterResource[] = [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["old"], removeLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["Label_other"] } },
    ];
    const api = fakeApi(filters, { old: ["m1", "m2"] });
    const res = await runLabelMigration(steps, new Set([0]), api);

    expect(api.batchModify).toHaveBeenCalledWith(["m1", "m2"], ["new"], ["old"]);
    expect(api.createFilter).toHaveBeenCalledTimes(1);
    expect(api.createFilter).toHaveBeenCalledWith(
      { from: "a@x.com" },
      { addLabelIds: ["new"], removeLabelIds: ["INBOX"] },
    );
    expect(api.deleteFilter).toHaveBeenCalledWith("f1");
    expect(api.deleteLabel).toHaveBeenCalledWith("old");
    // The old label goes only after its mail and filters have moved.
    const order = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(order(api.deleteLabel)).toBeGreaterThan(order(api.deleteFilter));
    expect(res).toEqual({ renamed: 0, merged: 1, messagesMoved: 2, filtersRepointed: 1 });
  });

  it("still drops the old filter when Gmail says the re-pointed one already exists", async () => {
    const steps = planLabelMigration([user("old", "Cluster/Muted"), user("new", "🔇 Muted")], []);
    const api = fakeApi([{ id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["old"] } }]);
    vi.mocked(api.createFilter).mockRejectedValueOnce(new Error("400 Filter already exists"));
    await runLabelMigration(steps, new Set([0]), api);
    expect(api.deleteFilter).toHaveBeenCalledWith("f1");
  });

  it("skips a merge whose rename was unticked", async () => {
    const steps = planLabelMigration([user("plain", "Newsletters"), user("pref", "Cluster/Newsletters")], []);
    const api = fakeApi();
    await runLabelMigration(steps, new Set([1]), api);
    expect(api.renameLabel).not.toHaveBeenCalled();
    expect(api.deleteLabel).not.toHaveBeenCalled();
  });

  it("reports the names it left in place", () => {
    const steps = planLabelMigration(LIVE, []);
    const all = new Set(steps.map((_, i) => i));
    expect(migratedLabelNames(steps, all)).toContain("✋ Screener");
  });
});
