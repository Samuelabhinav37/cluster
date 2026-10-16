// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — Rules tab: create → dry-run → apply, enable/disable, delete, and
// the untargeted-Trash guard.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, type BootedDashboard } from "./testHarness";
import type { ClusterRule } from "../lib/rules";

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function fillNewRule(
  dash: BootedDashboard,
  fields: {
    name?: string;
    fromDomain?: string;
    unread?: "yes" | "no";
    action: "archive" | "trash" | "markRead" | "label";
    label?: string;
  },
) {
  (dash.el("rule-name") as HTMLInputElement).value = fields.name ?? "Test rule";
  if (fields.fromDomain) (dash.el("rule-from-domain") as HTMLInputElement).value = fields.fromDomain;
  if (fields.unread) (dash.el("rule-unread") as HTMLSelectElement).value = fields.unread;
  const actionSel = dash.el("rule-action") as HTMLSelectElement;
  actionSel.value = fields.action;
  actionSel.dispatchEvent(new Event("change"));
  if (fields.label) (dash.el("rule-label") as HTMLInputElement).value = fields.label;
  submit(dash.el("rule-form") as HTMLFormElement);
}

let dash: BootedDashboard;

describe("create + dry run + apply", () => {
  beforeEach(async () => {
    dash = await bootDashboard();
    dash.showTab("rules");
  });

  it("saves a label rule and shows a non-zero dry run", async () => {
    fillNewRule(dash, {
      name: "Shop → Shopping",
      fromDomain: "shop.example",
      action: "label",
      label: "Shopping",
    });

    await vi.waitFor(() => expect(dash.storedSettings().rules).toHaveLength(1));
    const rule = dash.storedSettings().rules[0] as ClusterRule;
    expect(rule.conditions.fromDomain).toBe("shop.example");
    expect(rule.action).toBe("label");
    expect(rule.labelName).toBe("Shopping");

    const preview = dash.el("rule-preview").textContent ?? "";
    expect(preview).toMatch(/predicted rule application/);
    expect(preview).not.toMatch(/^0 predicted rule applications/);
  });

  it("Apply now labels the matched messages and logs it", async () => {
    fillNewRule(dash, {
      name: "Shop → Shopping",
      fromDomain: "shop.example",
      action: "label",
      label: "Shopping",
    });
    await vi.waitFor(() => expect(dash.storedSettings().rules).toHaveLength(1));

    dash.el("rule-apply-btn").click();
    await confirmStep(dash.el("rule-apply-slot"));

    expect(dash.gmail.labelMessages).toHaveBeenCalled();
    const [, ids, labelName] = (dash.gmail.labelMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(labelName).toBe("Shopping");
    expect((ids as string[]).length).toBeGreaterThan(0);

    dash.showTab("recent");
    expect(dash.el("recent-list").textContent).not.toContain("Nothing done yet");
  });
});

describe("enable / disable / delete", () => {
  const seededRule: ClusterRule = {
    id: "r1",
    name: "Seeded rule",
    enabled: true,
    conditions: { fromDomain: "shop.example" },
    action: "archive",
  };

  it("unchecking a rule disables it and empties the dry run", async () => {
    dash = await bootDashboard({ settings: { rules: [seededRule] } });
    dash.showTab("rules");

    const toggle = dash.el("rules-list").querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => expect(dash.storedSettings().rules[0].enabled).toBe(false));
    expect(dash.el("rule-preview").textContent).toMatch(/Enable a rule/);
  });

  it("Delete removes the rule", async () => {
    dash = await bootDashboard({ settings: { rules: [seededRule] } });
    dash.showTab("rules");

    dash.button("rules-list", "Delete")!.click();
    await vi.waitFor(() => expect(dash.storedSettings().rules).toHaveLength(0));
  });
});

describe("untargeted-Trash guard", () => {
  it("refuses a Trash rule whose only condition is read-state", async () => {
    dash = await bootDashboard();
    dash.showTab("rules");

    fillNewRule(dash, { name: "nuke unread", unread: "yes", action: "trash" });

    expect(dash.el("rule-form-error").textContent).toMatch(/./); // a warning is shown
    expect(dash.storedSettings().rules).toHaveLength(0);
  });
});
