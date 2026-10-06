import { describe, expect, it } from "vitest";
import { isDatasetTrusted, verifyDatasetSignature, type DatasetSigResult } from "./datasetSignature";

describe("isDatasetTrusted", () => {
  const cases: [DatasetSigResult, boolean, boolean][] = [
    // result, trusted as allow-list, trusted as block list
    ["ok", true, true],
    ["bad", false, false],
    ["no-sig", false, false],
    ["no-key", false, true],
    ["no-engine", false, false],
  ];
  it.each(cases)("%s: allow %s, block %s", (result, allow, block) => {
    expect(isDatasetTrusted(result, "allow")).toBe(allow);
    expect(isDatasetTrusted(result, "block")).toBe(block);
  });
});

describe("verifyDatasetSignature", () => {
  const bytes = new TextEncoder().encode("[]").buffer as ArrayBuffer;

  it("reports no-key when no public key is configured", async () => {
    expect(await verifyDatasetSignature(bytes, "c2ln", "")).toBe("no-key");
  });

  it("reports no-sig when a key is configured but nothing was served", async () => {
    expect(await verifyDatasetSignature(bytes, null, "A".repeat(43) + "=")).toBe("no-sig");
  });

  it("reports bad for a malformed signature", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const key = btoa(String.fromCharCode(...spki.subarray(12)));
    expect(await verifyDatasetSignature(bytes, "bm90IGEgc2lnbmF0dXJl", key)).toBe("bad");
  });
});
