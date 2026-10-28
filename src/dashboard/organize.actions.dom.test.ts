// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Organize screen: decision-row primary actions,
// "Sort my inbox", and Smart Views. These push past the existing boot-smoke
// assertion (which only checks that Confirm/Cancel render for Mute) into
// actually completing the flow and asserting on the provider call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep } from "./testHarness";

/** A decision row is `buildDecisionRow`'s `.list-row` + its sibling
 * `.instead-strip` disclosure, both children of one wrapper div appended to
 * `#sender-groups .grouped-list`. Find the wrapper by its visible title. */
function findDecisionRowWrap(container: HTMLElement, title: string): HTMLElement {
  const titleEl = Array.from(container.querySelectorAll(".row-title")).find(
    (t) => t.textContent === title,
  );
  if (!titleEl) throw new Error(`no decision row titled "${title}"`);
  const row = titleEl.closest(".list-row")!;
  return row.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Organize screen — decision rows", () => {
  it("leads with Trash, which moves the sender's mail to Trash after a confirm", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const wrap = findDecisionRowWrap(dash.el("sender-groups"), "Chase");
    const primary = wrap.querySelector<HTMLButtonElement>(".row-actions button")!;
    expect(primary.textContent).toBe("Trash");
    primary.click();

    const trashCell = wrap.querySelector<HTMLElement>('[data-act="trash"]')!;
    const resultText = await confirmStep(trashCell);
    expect(resultText).toContain("Trash");
    expect(dash.gmail.trashMessages).toHaveBeenCalledTimes(1);
    expect((dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(["f1", "f2"]);

    Array.from(trashCell.querySelectorAll("button")).find((b) => b.textContent === "Always do this")!.click();
    await vi.waitFor(() => {
      const [rule] = dash.storedSettings().rules ?? [];
      expect(rule).toMatchObject({ action: "trash", conditions: { fromAddress: "statements@chase.com" } });
      expect(rule.appliesFrom).toBeGreaterThan(0);
    });
  });

  it("keeps Unsubscribe and Mute in the row's ⋯ menu", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const wrap = findDecisionRowWrap(dash.el("sender-groups"), "Shop");
    expect(wrap.querySelector<HTMLButtonElement>(".row-actions button")!.textContent).toBe("Trash");
    const muteCell = wrap.querySelector<HTMLElement>('[data-act="mute"]')!;
    muteCell.querySelector("button")!.click();
    await confirmStep(muteCell);
    expect(dash.gmail.muteSender).toHaveBeenCalledTimes(1);
  });

  it("excludes the fully-starred sender from the decide list, showing it only as the dimmed protected row", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const groups = dash.el("sender-groups");
    const protectedRow = groups.querySelector(".protected-row");
    expect(protectedRow, "no dimmed protected row rendered").toBeTruthy();
    expect(protectedRow!.textContent).toContain("Protected");

    // "A Person" appears exactly once — as the dimmed protected row, not as
    // an actionable decision row (its .row-title lives outside .protected-row
    // for every other sender, but inside it for this one).
    const titledAPerson = Array.from(groups.querySelectorAll(".row-title")).filter(
      (t) => t.textContent === "A Person",
    );
    expect(titledAPerson).toHaveLength(1);
    expect(titledAPerson[0].closest(".protected-row")).toBeTruthy();
  });
});

describe("Details — smart views", () => {
  it("archives the large message from the Large chip", async () => {
    const dash = await bootDashboard();
    const root = dash.el("details");
    root.querySelector<HTMLButtonElement>(".details-tab")!.click();
    const chip = Array.from(root.querySelectorAll<HTMLButtonElement>(".chips button")).find((b) =>
      b.textContent?.includes("Large"),
    );
    expect(chip, "no Large chip in Details").toBeTruthy();
    chip!.click();
    root.querySelector<HTMLInputElement>("tbody .tick:not(:disabled)")!.click();
    const bar = root.querySelector<HTMLElement>(".selbar")!;
    Array.from(bar.querySelectorAll("button")).find((b) => b.textContent === "Archive")!.click();

    await vi.waitFor(() => expect(dash.gmail.archiveMessages).toHaveBeenCalledTimes(1));
    const [, ids] = (dash.gmail.archiveMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["b1"]);
  });
});

describe("Organize screen — Sort my inbox", () => {
  it("previews then applies a sort plan, labelling messages via the provider", async () => {
    const dash = await bootDashboard();
    dash.showScreen("organize");

    const startBtn = dash.el("sort-inbox-btn") as HTMLButtonElement;
    startBtn.click();

    // startSortFlow() awaits listLabelNames() before building the preview.
    await vi.waitFor(() => {
      if (dash.el("sort-inbox-preview").querySelectorAll(".sort-preview-bucket").length === 0) {
        throw new Error("preview not rendered yet");
      }
    });

    const applyBtn = Array.from(
      dash.el("sort-inbox-preview").querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.startsWith("Apply"))!;
    expect(applyBtn.disabled).toBe(false);
    applyBtn.click();

    await vi.waitFor(() => {
      if (dash.gmail.labelMessages === undefined) throw new Error("no labelMessages spy");
      if ((dash.gmail.labelMessages as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("labelMessages not called yet");
      }
    });
    expect(dash.gmail.labelMessages).toHaveBeenCalled();

    // Not covered here (scoped down — see plan P2.5 item 4 for the eventual
    // listRow rebuild of this screen): label-name collision resolution, the
    // per-sender "wrong bucket?" override menu, and the seed-from-existing
    // card. Each is a materially separate flow from the base apply path
    // asserted above.
  });
});
