// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { listGroup, listRow } from "./listRow";

describe("listRow", () => {
  it("renders title and sub with no optional cells", () => {
    const row = listRow({ title: "Shop", sub: "3 messages" });
    expect(row.className).toBe("list-row list-row--media");
    expect(row.querySelector(".row-title")?.textContent).toBe("Shop");
    expect(row.querySelector(".row-sub")?.textContent).toBe("3 messages");
  });

  it("sets a title attribute for ellipsis truncation", () => {
    const row = listRow({ title: "A very long sender name" });
    expect(row.querySelector(".row-title")?.getAttribute("title")).toBe("A very long sender name");
  });

  it("wraps a lead element with the title/sub in .row-media", () => {
    const tile = document.createElement("span");
    tile.className = "tile";
    const row = listRow({ lead: tile, title: "Shop" });
    const media = row.querySelector(".row-media");
    expect(media?.firstElementChild).toBe(tile);
  });

  it("renders a checkbox and wires onChange", () => {
    const onChange = vi.fn();
    const row = listRow({
      title: "Shop",
      selectable: { checked: true, label: "Select Shop", onChange },
    });
    const input = row.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.getAttribute("aria-label")).toBe("Select Shop");
    input.checked = false;
    input.onchange?.(new Event("change"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("sets extra data-* attributes on the checkbox for cross-row sync", () => {
    const row = listRow({
      title: "Shop",
      selectable: { checked: false, label: "Select Shop", onChange: () => {}, data: { senderKey: "gmail:a@shop.example" } },
    });
    const input = row.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(input.dataset.senderKey).toBe("gmail:a@shop.example");
  });

  it("wraps title/sub onto multiple lines when wrapText is set", () => {
    const row = listRow({ title: "A long sentence", sub: "another one", wrapText: true });
    expect(row.querySelector(".row-title")?.className).toBe("row-title wrap");
    expect(row.querySelector(".row-sub")?.className).toBe("row-sub wrap");
  });

  it("puts title badges alongside the title in a wrapping line", () => {
    const badge = document.createElement("span");
    badge.className = "pill danger";
    badge.textContent = "Needs review";
    const row = listRow({ title: "Spam senders", titleBadges: [badge] });
    const line = row.querySelector(".row-title-line");
    expect(line?.children).toHaveLength(2);
    expect(line?.querySelector(".row-title")?.textContent).toBe("Spam senders");
    expect(line?.querySelector(".pill.danger")).toBe(badge);
  });

  it("appends meta and actions as their own cells", () => {
    const meta = document.createElement("div");
    meta.className = "meta";
    const action = document.createElement("button");
    action.textContent = "Mute";
    const row = listRow({ title: "Shop", meta, actions: [action] });
    expect(row.querySelector(".meta")).toBe(meta);
    expect(row.querySelector(".row-actions")?.children).toHaveLength(1);
    expect(row.querySelector(".row-actions button")?.textContent).toBe("Mute");
  });

  it("names the grid modifier from which cells are present", () => {
    const meta = document.createElement("div");
    const action = document.createElement("button");
    const row = listRow({
      title: "Shop",
      selectable: { checked: false, label: "Select", onChange: () => {} },
      meta,
      actions: [action],
    });
    expect(row.className).toBe("list-row list-row--check-media-meta-actions");
  });

  it("returns the row alone when there is no disclosure", () => {
    const row = listRow({ title: "Shop" });
    expect(row.tagName).toBe("DIV");
    expect(row.classList.contains("list-row")).toBe(true);
  });

  it("wraps row + disclosure as siblings when disclosure is given", () => {
    const disclosure = document.createElement("div");
    disclosure.className = "instead-strip";
    const wrap = listRow({ title: "Shop", disclosure });
    expect(wrap.classList.contains("list-row")).toBe(false);
    expect(wrap.children).toHaveLength(2);
    expect(wrap.children[0]?.classList.contains("list-row")).toBe(true);
    expect(wrap.children[1]).toBe(disclosure);
  });

  it("makes the row a clickable/keyboard-activatable link when href is given", () => {
    const onActivate = vi.fn();
    const row = listRow({ title: "Shop", href: onActivate });
    expect(row.getAttribute("role")).toBe("button");
    expect(row.tabIndex).toBe(0);
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("does not fire href when the click lands on an inner button", () => {
    const onActivate = vi.fn();
    const button = document.createElement("button");
    button.textContent = "Mute";
    listRow({ title: "Shop", actions: [button], href: onActivate });
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("listGroup", () => {
  it("wraps rows in a grouped-list with no separator before the first row", () => {
    const rows = [listRow({ title: "A" }), listRow({ title: "B" }), listRow({ title: "C" })];
    const group = listGroup(rows);
    expect(group.className).toBe("grouped-list");
    expect(group.children).toHaveLength(5); // 3 rows + 2 separators
    expect(group.children[0]?.classList.contains("row-sep")).toBe(false);
    expect(group.children[1]?.classList.contains("row-sep")).toBe(true);
    expect(group.children[1]?.classList.contains("inset")).toBe(true);
  });

  it("omits the inset modifier when inset: false", () => {
    const rows = [listRow({ title: "A" }), listRow({ title: "B" })];
    const group = listGroup(rows, { inset: false });
    expect(group.children[1]?.className).toBe("row-sep");
  });
});
