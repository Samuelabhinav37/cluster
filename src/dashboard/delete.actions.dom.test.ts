// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Delete screen's by-domain bulk delete — the
// surface the ruleRunner trash-bypass audit (2026-09-18) was originally
// looking for, and the one place bulkDeleteGuard.test.ts's source scan
// can't reach (it checks *that* a guard call is present, not that it
// actually excludes the right ids at runtime). These tests drive the real
// confirm click-through and assert on the provider call args.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, fixtureMailbox, makeGmailSpy } from "./testHarness";

function findDomainRow(container: HTMLElement, domain: string): HTMLTableRowElement {
  const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(domain),
  );
  if (!row) throw new Error(`no domain row for "${domain}"`);
  return row as HTMLTableRowElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Delete screen — by-domain delete", () => {
  it("trashes every message for a clean domain and logs an undoable entry", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const list = dash.el("domain-group-list");
    const row = findDomainRow(list, "shop.example");
    const deleteBtn = Array.from(row.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Delete domain"),
    )!;
    const cell = deleteBtn.closest("td")!;
    deleteBtn.click();

    const resultText = await confirmStep(cell);

    expect(resultText).toContain("Moved 3 to Trash");
    expect(dash.gmail.trashMessages).toHaveBeenCalledTimes(1);
    const [, ids] = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["s1", "s2", "s3"]));

    // Undo button appended, and the action landed in Recently-done.
    const undoBtn = Array.from(cell.querySelectorAll("button")).find((b) =>
      /undo/i.test(b.textContent ?? ""),
    );
    expect(undoBtn, "no Undo button appended after the confirm").toBeTruthy();
    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("shop.example");
  });

  it("live re-checks protection right before trashing, excluding a message starred since the scan", async () => {
    // s2 wasn't isProtected at scan time (fixtureMailbox default), but the
    // live listProtectedMessageIds re-check — the exact guard the rule-engine
    // trash bypass was missing — reports it starred now.
    const gmail = makeGmailSpy(fixtureMailbox(), {
      listProtectedMessageIds: vi.fn(async () => new Set(["s2"])),
    });
    const dash = await bootDashboard({ gmail });
    dash.showScreen("delete");

    const row = findDomainRow(dash.el("domain-group-list"), "shop.example");
    const deleteBtn = Array.from(row.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Delete domain"),
    )!;
    const cell = deleteBtn.closest("td")!;
    deleteBtn.click();
    await confirmStep(cell);

    const [, ids] = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["s1", "s3"]));
    expect(ids).not.toContain("s2");
  });

  it("disables delete for a domain made entirely of protected mail (starred + no-bulk-signal personal mail)", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const row = findDomainRow(dash.el("domain-group-list"), "personal.example");
    // p1 is starred at scan time; p2 has no unsubscribe header and isn't
    // otp/shipping/receipt/newsletter, so protectionDecision's "no-bulk-signal"
    // rule protects it too — a real person's mail, not a company's.
    expect(row.textContent).toContain("2 protected");
    const deleteBtn = Array.from(row.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Delete domain"),
    )!;
    expect(deleteBtn.disabled).toBe(true);
    expect(dash.gmail.trashMessages).not.toHaveBeenCalled();
  });
});

describe("Delete screen — ready-to-clean-up (expiry)", () => {
  it("cleans up the aged OTP and reports the count", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const cleanBtn = dash.el("expiry-cleanup-btn") as HTMLButtonElement;
    expect(cleanBtn.hidden).toBe(false);
    cleanBtn.click();
    const resultText = await confirmStep(dash.el("expiry-cleanup-slot"));

    expect(resultText).toMatch(/Moved 1 to Trash/);
    expect(dash.gmail.trashMessages).toHaveBeenCalled();
    const calledIds = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls.flatMap(
      ([, ids]) => ids as string[],
    );
    expect(calledIds).toContain("o1");
  });
});
