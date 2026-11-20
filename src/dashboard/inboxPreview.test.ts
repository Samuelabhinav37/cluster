// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { inboxPreview } from "./inboxPreview";

describe("inbox preview", () => {
  it("fills in: your name, the newest six emails with their label, and the labels you keep", () => {
    const p = inboxPreview();
    const text = (s: string) => Array.from(p.el.querySelectorAll(s), (n) => n.textContent);
    expect(text(".ip-title")).toEqual(["Your inbox"]);
    p.setName("Samuel Boman");
    expect(text(".ip-title")).toEqual(["Samuel's inbox"]);

    expect(p.el.querySelectorAll(".ip-row.is-blank")).toHaveLength(6);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) p.addMail(`Sender ${n}`, "", n === 7 ? null : { emoji: "📦", name: "Orders" });
    expect(text(".ip-words b")).toEqual(["Sender 7", "Sender 6", "Sender 5", "Sender 4", "Sender 3", "Sender 2"]);
    expect(text(".ip-tag")).toHaveLength(5);

    p.setLabels([{ emoji: "📦", name: "Orders" }]);
    expect(text(".ip-label")).toEqual(["📦Orders"]);
  });
});
