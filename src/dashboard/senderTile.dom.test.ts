// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { senderTile } from "./senderTile";

function loadWith(tile: HTMLElement, width: number) {
  const img = tile.querySelector("img")!;
  Object.defineProperty(img, "naturalWidth", { value: width });
  img.dispatchEvent(new Event("load"));
}

describe("senderTile", () => {
  it("shows the letter when the favicon service sends its 16px globe", () => {
    const tile = senderTile("mom@family.example", "Mom");
    loadWith(tile, 16);
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.classList.contains("has-favicon")).toBe(false);
  });

  it("keeps a real logo", () => {
    const tile = senderTile("news@linkedin.com", "LinkedIn");
    loadWith(tile, 128);
    expect(tile.querySelector("img")).not.toBeNull();
  });
});
