// Ingestion layer: raw Gmail metadata → NormalizedMessageMetadata. Every
// algorithm downstream (sender grouping, protection, threat scoring, lanes,
// unsubscribe) reads only what this mapping produces, so it gets direct
// coverage. The raw API call is mocked; the mapping is real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMessageMetadata = vi.fn();
vi.mock("../gmailApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gmailApi")>()),
  getMessageMetadata,
}));

const { gmailProvider, lanesFromLabelIds } = await import("./gmailProvider");

const GOOGLE_AR =
  "mx.google.com; dkim=pass header.i=@news.example header.s=s1; spf=pass smtp.mailfrom=news.example; dmarc=pass header.from=news.example";

function raw(over: {
  headers?: Record<string, string>;
  labelIds?: string[];
  authenticationResultsHeaders?: string[];
  dkimSignatures?: string[];
}) {
  return {
    headers: { From: '"News" <hello@news.example>', Subject: "Hello", ...over.headers },
    authenticationResultsHeaders: over.authenticationResultsHeaders ?? [GOOGLE_AR],
    dkimSignatures: over.dkimSignatures ?? [],
    labelIds: over.labelIds ?? ["INBOX", "CATEGORY_PROMOTIONS", "UNREAD"],
    internalDate: 1_700_000_000_000,
    sizeEstimate: 12_345,
  };
}

async function normalize(over: Parameters<typeof raw>[0] = {}) {
  getMessageMetadata.mockResolvedValueOnce(raw(over));
  return gmailProvider.getMessageMetadata("token", "m1");
}

beforeEach(() => getMessageMetadata.mockReset());

describe("From parsing", () => {
  it("splits a quoted display name from the address and lowercases the address", async () => {
    const m = await normalize({ headers: { From: '"Lenny Rachitsky" <Lenny@Substack.COM>' } });
    expect(m.fromDisplayName).toBe("Lenny Rachitsky");
    expect(m.fromAddress).toBe("lenny@substack.com");
  });

  it("handles an unquoted display name", async () => {
    const m = await normalize({ headers: { From: "Morning Brew <crew@morningbrew.com>" } });
    expect(m.fromDisplayName).toBe("Morning Brew");
    expect(m.fromAddress).toBe("crew@morningbrew.com");
  });

  it("handles a bare address with no display name", async () => {
    const m = await normalize({ headers: { From: "alerts@chase.com" } });
    expect(m.fromAddress).toBe("alerts@chase.com");
  });

  it("returns an empty address for a missing From (senderModel then drops the message)", async () => {
    const m = await normalize({ headers: { From: "" } });
    expect(m.fromAddress).toBe("");
  });

  // Known gap: anything after the closing ">" defeats the anchored regex, so
  // the whole header becomes the "address" and the sender key is polluted.
  it.fails("KNOWN BUG: a trailing comment after <addr> breaks address extraction", async () => {
    const m = await normalize({ headers: { From: '"Shop" <deals@shop.example> (Promotions)' } });
    expect(m.fromAddress).toBe("deals@shop.example");
  });
});

describe("label-derived fields", () => {
  it("STARRED → isProtected, UNREAD → unread", async () => {
    const m = await normalize({ labelIds: ["INBOX", "STARRED", "UNREAD"] });
    expect(m.isProtected).toBe(true);
    expect(m.unread).toBe(true);
    const read = await normalize({ labelIds: ["INBOX"] });
    expect(read.isProtected).toBe(false);
    expect(read.unread).toBe(false);
  });

  it("IMPORTANT or CATEGORY_PERSONAL → providerMarkedPersonal", async () => {
    expect((await normalize({ labelIds: ["INBOX", "IMPORTANT"] })).providerMarkedPersonal).toBe(true);
    expect((await normalize({ labelIds: ["INBOX", "CATEGORY_PERSONAL"] })).providerMarkedPersonal).toBe(true);
    expect((await normalize({ labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] })).providerMarkedPersonal).toBe(false);
  });

  it("passes size and received time through", async () => {
    const m = await normalize();
    expect(m.sizeBytes).toBe(12_345);
    expect(m.receivedAt).toBe(1_700_000_000_000);
  });
});

describe("lanes", () => {
  it("Promotions/Updates mail in the inbox lands in both lanes", () => {
    expect(lanesFromLabelIds(["INBOX", "CATEGORY_PROMOTIONS"]).sort()).toEqual(["cleanup", "security"]);
    expect(lanesFromLabelIds(["INBOX", "CATEGORY_UPDATES"]).sort()).toEqual(["cleanup", "security"]);
  });

  it("archived mail that matched neither bucket still belongs to cleanup", () => {
    expect(lanesFromLabelIds([])).toEqual(["cleanup"]);
  });

  // Audit finding: the cleanup query and lanes only know Promotions/Updates,
  // so Social-tab notifications (LinkedIn, Facebook, Quora digests) never
  // reach Delete/Organize/Subscriptions — they appear only in the security
  // lane. Flip this when Social/Forums join cleanup.
  it.fails("KNOWN GAP: Social-tab mail is excluded from the cleanup lane", () => {
    expect(lanesFromLabelIds(["INBOX", "CATEGORY_SOCIAL"])).toContain("cleanup");
  });
});

describe("authentication + unsubscribe", () => {
  it("uses only the mx.google.com Authentication-Results, ignoring a forged one", async () => {
    const forged = "evil.example; dkim=pass header.i=@paypal.com; dmarc=pass header.from=paypal.com";
    const m = await normalize({ authenticationResultsHeaders: [forged, GOOGLE_AR] });
    expect(m.authenticationResults).toBe(GOOGLE_AR);
  });

  it("has no trusted result at all when only a forged header exists", async () => {
    const forged = "mx.google.com.evil.example; dmarc=pass";
    const m = await normalize({ authenticationResultsHeaders: [forged] });
    expect(m.authenticationResults).toBeUndefined();
  });

  it("parses Reply-To to a bare lowercased address", async () => {
    const m = await normalize({ headers: { "Reply-To": "Help Desk <Help@Recovery.example>" } });
    expect(m.replyToAddress).toBe("help@recovery.example");
  });

  it("exposes https + mailto unsubscribe, and one-click only with a DKIM signature covering both headers", async () => {
    const headers = {
      From: "News <hello@news.example>",
      "List-Unsubscribe": "<https://news.example/u?id=1>, <mailto:u@news.example>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    const unsigned = await normalize({ headers });
    expect(unsigned.unsubscribe.httpUrl).toBe("https://news.example/u?id=1");
    expect(unsigned.unsubscribe.mailto).toBe("mailto:u@news.example");
    expect(unsigned.unsubscribe.postUrl).toBeUndefined();

    const signed = await normalize({
      headers,
      dkimSignatures: ["v=1; a=rsa-sha256; d=news.example; s=s1; h=from:subject:list-unsubscribe:list-unsubscribe-post; b=x"],
    });
    expect(signed.unsubscribe.postUrl).toBe("https://news.example/u?id=1");
  });

  it("refuses one-click when the DKIM signer doesn't align with From", async () => {
    const m = await normalize({
      headers: {
        From: "News <hello@news.example>",
        "List-Unsubscribe": "<https://esp.example/u>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      authenticationResultsHeaders: ["mx.google.com; dkim=pass header.d=esp.example; dmarc=pass"],
      dkimSignatures: ["v=1; d=esp.example; h=list-unsubscribe:list-unsubscribe-post; b=x"],
    });
    expect(m.unsubscribe.postUrl).toBeUndefined();
  });
});
