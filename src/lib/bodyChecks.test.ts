import { describe, expect, it } from "vitest";
import { many, senders } from "../test/mailFixtures";
import { applyBodyChecks, bodyCheckKey, checkLinks, withCheck, type BodyCheckStore } from "./bodyChecks";

describe("body checks", () => {
  it("counts mismatched links and keeps no text", () => {
    const check = checkLinks(
      [
        { text: "paypal.com", href: "https://evil.example/login" },
        { text: "Read more", href: "https://news.example/a" },
      ],
      5,
    );
    expect(check).toEqual({ at: 5, mismatchedLinks: 1, badLinks: 0 });
  });

  it("adds a link warning once, naming the message, and never removes one", async () => {
    const [sender] = await senders(many(2, { fromAddress: "a@shop.example" }));
    const before = sender.threatSignals.length;
    const store: BodyCheckStore = {
      [bodyCheckKey(sender, sender.messages[0].id)]: { at: 1, mismatchedLinks: 2, badLinks: 0 },
      [bodyCheckKey(sender, sender.messages[1].id)]: { at: 1, mismatchedLinks: 0, badLinks: 0 },
    };
    applyBodyChecks([sender], store);
    applyBodyChecks([sender], store);
    const added = sender.threatSignals.filter((s) => s.kind === "link-mismatch");
    expect(added).toHaveLength(1);
    expect(added[0].messageIds).toEqual([sender.messages[0].id]);
    expect(sender.threatSignals).toHaveLength(before + 1);
  });

  it("keeps only the newest 500 checks", () => {
    let store: BodyCheckStore = {};
    for (let i = 0; i < 502; i++) store = withCheck(store, `gmail:${i}`, { at: i, mismatchedLinks: 0, badLinks: 0 });
    expect(Object.keys(store)).toHaveLength(500);
    expect(store["gmail:0"]).toBeUndefined();
    expect(store["gmail:501"]).toBeDefined();
  });
});
