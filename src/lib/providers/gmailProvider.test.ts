import { describe, expect, it } from "vitest";
import { gmailQueryForPurpose } from "./gmailProvider";

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
