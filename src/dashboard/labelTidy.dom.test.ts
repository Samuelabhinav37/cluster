// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// The one-time "Tidy up Cluster's labels" card: shown when older-build
// labels ("Cluster/…", "Declutter/…") exist, renames them on Apply.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

const OLD_LABELS = [
  { id: "INBOX", name: "INBOX", type: "system" as const },
  { id: "L_MUTED", name: "Cluster/Muted", type: "user" as const, messagesTotal: 189 },
  { id: "L_SCREEN", name: "Declutter/Screener", type: "user" as const, messagesTotal: 1434 },
  { id: "L_MINE", name: "Job Applications", type: "user" as const, messagesTotal: 6 },
];

async function cardShown(dash: Awaited<ReturnType<typeof bootDashboard>>) {
  await vi.waitFor(() => {
    if (dash.el("label-tidy-banner").hidden) throw new Error("tidy card not shown yet");
  });
  return dash.el("label-tidy-banner");
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Tidy up Cluster's labels", () => {
  it("previews each old label with its new name and message count, and leaves the user's own out", async () => {
    const dash = await bootDashboard({ labels: OLD_LABELS });
    const card = await cardShown(dash);
    const text = card.textContent ?? "";
    expect(text).toContain("“Cluster/Muted” → “🔇 Muted” · 189 messages");
    expect(text).toContain("“Declutter/Screener” → “✋ Screener” · 1,434 messages");
    expect(text).not.toContain("Job Applications");
  });

  it("renames the ticked labels in place on Apply and logs it", async () => {
    const dash = await bootDashboard({ labels: OLD_LABELS });
    const card = await cardShown(dash);
    dash.button("label-tidy-banner", "Tidy up labels")!.click();

    await vi.waitFor(() => {
      if (!card.textContent?.includes("Tidied labels")) throw new Error("not done yet");
    });
    expect(dash.gmailApi.renameLabel).toHaveBeenCalledWith("gmail-token", "L_MUTED", "🔇 Muted");
    expect(dash.gmailApi.renameLabel).toHaveBeenCalledWith("gmail-token", "L_SCREEN", "✋ Screener");
    expect(dash.gmailApi.deleteLabel).not.toHaveBeenCalled();
    const stored = dash.storedSettings();
    expect(stored.clusterOwnedLabels).toEqual(expect.arrayContaining(["🔇 Muted", "✋ Screener"]));
    expect(stored.actionLog?.[0]?.summary).toBe("Tidied labels: renamed 2 labels");
  });

  it("stays hidden once dismissed, and when there is nothing to tidy", async () => {
    const dismissed = await bootDashboard({ labels: OLD_LABELS, settings: { labelTidyDismissed: true } });
    expect(dismissed.el("label-tidy-banner").hidden).toBe(true);
    expect(dismissed.gmailApi.getLabel).not.toHaveBeenCalled();

    const clean = await bootDashboard({ labels: [{ id: "L", name: "🔇 Muted", type: "user" }] });
    await vi.waitFor(() => {
      if (clean.gmailApi.listLabels.mock.calls.length === 0) throw new Error("not checked yet");
    });
    expect(clean.el("label-tidy-banner").hidden).toBe(true);
  });
});
