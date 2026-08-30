import { describe, expect, it } from "vitest";
import { bucketLabelName, classifySortBucket, DEFAULT_FILE_OUT_OF_INBOX } from "./sortTaxonomy";

describe("classifySortBucket", () => {
  it("uses the message kind when it's a transactional one", () => {
    expect(classifySortBucket("otp", "anything.example")).toBe("otp");
    expect(classifySortBucket("shipping", "amazon.com")).toBe("shipping");
    expect(classifySortBucket("receipt", "some-shop.example")).toBe("receipt");
  });

  it("kind wins over the sender's domain category", () => {
    // amazon.com is a Shopping domain, but a shipping-kind subject files as shipping.
    expect(classifySortBucket("shipping", "amazon.com")).toBe("shipping");
  });

  it("falls back to the domain category when the kind is 'other'", () => {
    expect(classifySortBucket("other", "amazon.com")).toBe("shopping");
    expect(classifySortBucket("other", "chase.com")).toBe("finance");
    expect(classifySortBucket("other", "booking.com")).toBe("travel");
  });

  it("returns null when neither the kind nor the domain is specific", () => {
    expect(classifySortBucket("other", "some-random-domain.example")).toBeNull();
  });

  it("maps kind newsletter/social straight through", () => {
    expect(classifySortBucket("newsletter", "x.example")).toBe("newsletter");
    expect(classifySortBucket("social", "x.example")).toBe("social");
  });
});

describe("bucketLabelName / defaults", () => {
  it("nests every label under Cluster/", () => {
    expect(bucketLabelName("shopping")).toBe("Cluster/Shopping");
    expect(bucketLabelName("otp")).toBe("Cluster/One-time codes");
  });

  it("defaults transactional buckets to filing out of the inbox, category buckets to in-place", () => {
    expect(DEFAULT_FILE_OUT_OF_INBOX.otp).toBe(true);
    expect(DEFAULT_FILE_OUT_OF_INBOX.shipping).toBe(true);
    expect(DEFAULT_FILE_OUT_OF_INBOX.shopping).toBe(false);
    expect(DEFAULT_FILE_OUT_OF_INBOX.finance).toBe(false);
  });
});
