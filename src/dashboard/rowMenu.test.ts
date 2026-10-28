// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { rowMenu } from "./rowMenu";

describe("row ⋯ menu", () => {
  it("takes Escape before other document listeners, and gives it back once closed", () => {
    const wrap = rowMenu([{ label: "Mute", run: vi.fn() }]);
    document.body.replaceChildren(wrap);
    const other = vi.fn();
    document.addEventListener("keydown", other);
    const button = wrap.querySelector("button")!;
    const menu = wrap.querySelector<HTMLElement>("[role=menu]")!;

    button.click();
    expect(menu.hidden).toBe(false);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(other).not.toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(other).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", other);
  });
});
