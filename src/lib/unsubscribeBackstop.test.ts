import { describe, expect, it } from "vitest";
import { backstopCriteria } from "./unsubscribeBackstop";

describe("backstopCriteria", () => {
  it("matches the exact sender and its mailing list, never the domain", () => {
    expect(backstopCriteria("news@shop.example", "deals.shop.example")).toEqual({
      from: "news@shop.example",
      query: "list:(deals.shop.example)",
    });
  });

  it("makes no filter without a usable List-Id, so receipts stay in the inbox", () => {
    expect(backstopCriteria("orders@shop.example", undefined)).toBeUndefined();
    expect(backstopCriteria("news@shop.example", 'a") OR (from:*')).toBeUndefined();
  });
});
