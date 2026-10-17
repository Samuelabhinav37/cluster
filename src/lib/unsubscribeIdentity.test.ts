import { describe, expect, it } from "vitest";
import { pickUnsubscribeIdentity } from "./unsubscribeIdentity";

const ids = [
  { address: "me@gmail.com", isPrimary: true },
  { address: "work@corp.example", isPrimary: false },
];

describe("pickUnsubscribeIdentity", () => {
  it("sends from the alias the mail was delivered to", () => {
    expect(pickUnsubscribeIdentity(["work@corp.example", "me@gmail.com"], ids)).toEqual({
      from: "work@corp.example",
      sure: true,
    });
  });

  it("asks when the list has a +tag address", () => {
    expect(pickUnsubscribeIdentity(["me+shop@gmail.com"], ids)).toEqual({
      from: "me@gmail.com",
      sure: false,
      why: "plus-address",
    });
  });

  it("falls back to the primary address for forwarded mail, and asks", () => {
    expect(pickUnsubscribeIdentity(["old@isp.example"], ids)).toEqual({
      from: "me@gmail.com",
      sure: false,
      why: "forwarded",
    });
  });

  it("gives nothing without any identity", () => {
    expect(pickUnsubscribeIdentity(["me@gmail.com"], [])).toBeUndefined();
  });
});
