// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Rules screen — most importantly "Apply enabled
// rules now", which drives ruleRunner.applyRules through the real dashboard
// UI. This is the exact surface the 2026-09-18 audit found bypassing the
// shared protection gate (commit ffdd1ef fixed it): the rule engine's trash
// action now re-checks live protection immediately before trashing, same as
// every other bulk-delete path. bulkDeleteGuard.test.ts only proves a guard
// call is *present* in the source; this proves it actually excludes the
// right id at runtime, through the UI a user would actually click.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, fixtureMailbox, makeGmailSpy } from "./testHarness";

async function addTrashRuleForDomain(dash: Awaited<ReturnType<typeof bootDashboard>>, domain: string) {
  (dash.el("rule-from-domain") as HTMLInputElement).value = domain;
  (dash.el("rule-action") as HTMLSelectElement).value = "trash";
  (dash.el("rule-add-btn") as HTMLButtonElement).click();
  // ruleForm.onsubmit's ctx.settings write is async.
  await vi.waitFor(() => {
    if ((dash.storedSettings().rules ?? []).length === 0) throw new Error("rule not saved yet");
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Rules screen — manual rule composer", () => {
  it("rejects an untargeted Trash rule (ruleGuardWarning) without saving it", async () => {
    const dash = await bootDashboard();
    dash.showScreen("rules");

    (dash.el("rule-action") as HTMLSelectElement).value = "trash";
    (dash.el("rule-older-days") as HTMLInputElement).value = "30";
    (dash.el("rule-add-btn") as HTMLButtonElement).click();

    expect(dash.el("rule-form-error").textContent).toMatch(/needs a target/i);
    expect(dash.storedSettings().rules ?? []).toHaveLength(0);
  });

  it("saves a domain-targeted Trash rule and lists it", async () => {
    const dash = await bootDashboard();
    dash.showScreen("rules");

    await addTrashRuleForDomain(dash, "shop.example");

    expect(dash.el("rule-form-error").textContent).toBe("");
    const rules = dash.storedSettings().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      conditions: { fromDomain: "shop.example" },
      action: "trash",
      enabled: true,
    });
    expect(dash.el("rules-list").textContent).toContain("shop.example");
  });
});

describe("Rules screen — Apply enabled rules now", () => {
  it("trashes every matching message for a clean rule", async () => {
    const dash = await bootDashboard();
    dash.showScreen("rules");
    await addTrashRuleForDomain(dash, "shop.example");

    const applyBtn = dash.el("rule-apply-btn") as HTMLButtonElement;
    applyBtn.click();
    const resultText = await confirmStep(dash.el("rule-apply-slot"));

    expect(dash.gmail.trashMessages).toHaveBeenCalledTimes(1);
    const [, ids] = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["s1", "s2", "s3"]));
    expect(resultText).toMatch(/applied|moved/i);

    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toMatch(/shop\.example|rule/i);
  });

  it("live re-checks protection before trashing — a rule-matched message starred since the scan is excluded (regression test for the ffdd1ef fix)", async () => {
    // Nothing in the fixture is isProtected for shop.example at scan time,
    // but the live listProtectedMessageIds re-check — inline in
    // ruleRunner.applyRules right before provider.trashMessages, per
    // ffdd1ef — reports s2 starred now. Before that fix this override had no
    // effect at all: the rule engine trashed straight from the stale
    // scan-time match list.
    const gmail = makeGmailSpy(fixtureMailbox(), {
      listProtectedMessageIds: vi.fn(async () => new Set(["s2"])),
    });
    const dash = await bootDashboard({ gmail });
    dash.showScreen("rules");
    await addTrashRuleForDomain(dash, "shop.example");

    const applyBtn = dash.el("rule-apply-btn") as HTMLButtonElement;
    applyBtn.click();
    await confirmStep(dash.el("rule-apply-slot"));

    expect(dash.gmail.trashMessages).toHaveBeenCalledTimes(1);
    const [, ids] = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["s1", "s3"]));
    expect(ids).not.toContain("s2");

    // ruleRunner's own action-log entry names the skip explicitly.
    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("skipped 1 you starred since the scan");
  });

  it("shows an error and applies nothing when there are no enabled rules", async () => {
    const dash = await bootDashboard();
    dash.showScreen("rules");

    const applyBtn = dash.el("rule-apply-btn") as HTMLButtonElement;
    applyBtn.click();

    expect(dash.el("rule-form-error").textContent).toMatch(/no enabled rules/i);
    expect(dash.gmail.trashMessages).not.toHaveBeenCalled();
  });
});

describe("Rules screen — natural-language draft (deterministic fallback)", () => {
  it("falls back to the deterministic parser when the on-device model API doesn't exist (as in jsdom)", async () => {
    // Chrome's on-device LanguageModel/Summarizer API has no jsdom shape at
    // all (not even `undefined` vs a stubbable global — the type doesn't
    // exist), and aiRuleDraft.ts's own availability check is what the index.html
    // copy calls "a deterministic parser is used when the model is
    // unavailable". This only proves that fallback path doesn't throw or
    // hang in an environment with zero AI surface — not the on-device model
    // path itself, which needs a real Chrome build to exercise at all.
    const dash = await bootDashboard();
    dash.showScreen("rules");

    (dash.el("rule-natural-language") as HTMLInputElement).value =
      "Archive unread newsletters older than 14 days";
    const draftBtn = dash.el("rule-draft-btn") as HTMLButtonElement;
    draftBtn.click();

    await vi.waitFor(() => {
      const status = dash.el("rule-draft-status").textContent ?? "";
      if (status === "" || status === "Drafting locally…") throw new Error("still drafting");
    });

    expect(dash.el("rule-draft-status").textContent).toMatch(/deterministic fallback/i);
    const saveBtn = dash.el("rule-save-draft-btn") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });
});
