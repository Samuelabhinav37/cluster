import { afterEach, describe, expect, it } from "vitest";
import { setBrandRegistry } from "../lib/brandRegistry";
import { verifiedSender } from "./senderTile";

const reg = { issuers: [], companies: [{ id: "chase", name: "JPMorgan Chase", trust: "certified" as const, domains: ["chase.com"] }] };
const auth = (dmarc: "pass" | "fail" | "none") => ({ spf: "pass", dkim: "pass", dmarc }) as never;

describe("verified sender (plan 3.7)", () => {
  afterEach(() => setBrandRegistry(null));
  it("needs DMARC to pass on the company's own domain", () => {
    setBrandRegistry(reg);
    expect(verifiedSender([{ address: "alerts@chase.com", authVerdicts: auth("pass") }])?.name).toBe("JPMorgan Chase");
    expect(verifiedSender([{ address: "alerts@chase.com", authVerdicts: auth("fail") }])).toBeUndefined();
    expect(verifiedSender([{ address: "alerts@chase.com", authVerdicts: auth("none") }])).toBeUndefined();
    expect(verifiedSender([{ address: "alerts@chase-secure.com", authVerdicts: auth("pass") }])).toBeUndefined();
    expect(verifiedSender([{ address: "a@chase.com", authVerdicts: auth("pass") }, { address: "b@chase.com", authVerdicts: auth("fail") }])).toBeUndefined();
  });
});
