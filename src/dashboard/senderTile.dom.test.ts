// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

  it("uses the bundled icon pack before asking the favicon service", async () => {
    vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => `ext://${p}` } });
    vi.stubGlobal("fetch", async () => ({ json: async () => ({ icons: { "linkedin.com": "AAAA" } }) }));
    const known = senderTile("news@e.linkedin.com", "LinkedIn").querySelector("img")!;
    const unknown = senderTile("hi@shop.example", "Shop").querySelector("img")!;
    await vi.waitFor(() => expect(unknown.getAttribute("src")).toContain("google.com/s2/favicons"));
    expect(known.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    vi.unstubAllGlobals();
  });

  it("keeps a real logo", () => {
    const tile = senderTile("news@linkedin.com", "LinkedIn");
    loadWith(tile, 128);
    expect(tile.querySelector("img")).not.toBeNull();
  });
});
