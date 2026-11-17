import { describe, expect, it } from "vitest";
import { clashes, keysOf, numberScreen, usableKey } from "./keymap";

describe("keymap", () => {
  it("uses the defaults, then the user's keys", () => {
    expect(keysOf()["search"]).toBe("/");
    expect(keysOf({ search: "F" })["search"]).toBe("f");
  });

  it("marks both shortcuts that share a key, but not a plain key and a G jump", () => {
    expect([...clashes(keysOf({ "go-home": "s" }))].sort()).toEqual(["go-contacts", "go-home"]);
    expect(clashes(keysOf({ search: "h" })).size).toBe(0);
    expect(clashes(keysOf({ help: "g" }))).toEqual(new Set(["help"]));
  });

  it("takes one printable key", () => {
    expect(usableKey("k")).toBe(true);
    expect(usableKey("Enter")).toBe(false);
    expect(usableKey(" ")).toBe(false);
  });
});

describe("numberScreen", () => {
  const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
    numberScreen({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  it("opens the sidebar's sections with 1-4, alone or with Alt", () => {
    expect(key("Digit1")).toBe("overview");
    expect(key("Numpad2")).toBe("delete");
    expect(key("Digit3", { altKey: true })).toBe("organize");
    expect(key("Digit4")).toBe("impersonation");
  });
  it("leaves Ctrl/Cmd+number to Chrome and ignores other keys", () => {
    expect(key("Digit1", { ctrlKey: true })).toBeUndefined();
    expect(key("Digit1", { metaKey: true })).toBeUndefined();
    expect(key("Digit5")).toBeUndefined();
    expect(key("KeyA")).toBeUndefined();
  });
});
