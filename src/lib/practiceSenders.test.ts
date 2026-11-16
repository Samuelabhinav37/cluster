import { describe, expect, it } from "vitest";
import { pickPracticeSenders, practiceOverride } from "./practiceSenders";

const m = (fromAddress: string, subject: string, extra: { promotion?: boolean; listMail?: boolean } = {}) => ({
  fromAddress,
  fromDisplayName: fromAddress.split("@")[1].split(".")[0],
  subject,
  ...extra,
});

describe("pickPracticeSenders", () => {
  const mail = [
    m("ship-confirm@amazon.com", "Your order has shipped"),
    m("ship-confirm@amazon.com", "Delivered: your package"),
    m("deals@mail.nimbus.example", "Winter sale starts now", { promotion: true, listMail: true }),
    m("friend@gmail.com", "dinner sunday?"),
    m("alerts@chase.com", "Your statement is ready"),
    m("news@mail.nimbus.example", "Picked for you", { promotion: true, listMail: true }),
  ];

  it("picks companies, one per domain, never free mail, most frequent first", () => {
    const picked = pickPracticeSenders(mail);
    expect(picked.map((p) => p.host)).not.toContain("gmail.com");
    expect(new Set(picked.map((p) => p.host)).size).toBe(picked.length);
    expect(picked[0].host).toBe("amazon.com");
    expect(picked[0].guess).toBe("shipping");
    expect(picked[0].alt).not.toBe(picked[0].guess);
  });

  it("saves nothing for Cluster's guess, the other label, or never for Keep", () => {
    const [amazon] = pickPracticeSenders(mail);
    expect(practiceOverride(amazon, "guess")).toBeNull();
    expect(practiceOverride(amazon, "alt")).toEqual(["@amazon.com", amazon.alt]);
    expect(practiceOverride(amazon, "keep")).toEqual(["@amazon.com", "never"]);
  });
});
