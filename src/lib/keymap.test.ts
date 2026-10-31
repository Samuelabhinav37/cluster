import { describe, expect, it } from "vitest";
import { clashes, keysOf, usableKey } from "./keymap";

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
