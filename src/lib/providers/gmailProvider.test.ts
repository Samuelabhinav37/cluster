import { describe, expect, it, vi } from "vitest";
import { batchModify } from "../gmailApi";
import { gmailProvider, gmailQueryForPurpose, inIndexScope } from "./gmailProvider";

vi.mock("../gmailApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gmailApi")>()),
  getOrCreateLabel: vi.fn(async () => "L_SUS"),
  batchModify: vi.fn(async () => {}),
  listLabels: vi.fn(async () => [
    { id: "L_REC", name: "🧾 Receipts" },
    { id: "L_OLD", name: "Cluster/Receipts & invoices" },
    { id: "L_MINE", name: "Taxes" },
  ]),
}));

describe("labelSuspicious", () => {
  it("takes every sort label off a held scam, current and older names, and leaves the user's own labels", async () => {
    await gmailProvider.labelSuspicious!("t", ["m1"], false, ["🧾 Receipts"]);
    expect(batchModify).toHaveBeenCalledWith("t", ["m1"], ["L_SUS"], ["INBOX", "L_REC", "L_OLD"]);
  });
});

describe("gmailQueryForPurpose", () => {
  it("applies the age boundary to every non-Primary category", () => {
    expect(gmailQueryForPurpose("cleanup", 180)).toBe(
      "(category:promotions OR category:updates OR category:social OR category:forums) newer_than:180d",
    );
  });

  it("scans the recent Inbox for security instead of cleanup categories", () => {
    expect(gmailQueryForPurpose("security", 30)).toBe("in:inbox newer_than:30d");
  });
});

describe("inIndexScope", () => {
  it("keeps mail filed under a label after it leaves the inbox", () => {
    expect(inIndexScope(["Label_12", "UNREAD"])).toBe(true);
    expect(inIndexScope(["UNREAD"])).toBe(false);
  });

  it("leaves out sent, trashed and spam mail", () => {
    expect(inIndexScope(["Label_12", "SENT"])).toBe(false);
    expect(inIndexScope(["Label_12", "TRASH"])).toBe(false);
  });

  it("lists filed mail in the combined scan", () => {
    expect(gmailQueryForPurpose("combined", 180)).toContain("(has:userlabels -in:sent)");
  });
});
