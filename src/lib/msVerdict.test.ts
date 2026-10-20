import { describe, expect, it } from "vitest";
import {
  microsoftAttackCategory,
  microsoftAuthFailed,
  microsoftFirstContact,
  microsoftSaysSpam,
  parseMicrosoftVerdict,
} from "./msVerdict";

const headers = (list: Array<[string, string]>) => (name: string) =>
  list.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];

const REPORT =
  "CIP:203.0.113.9;CTRY:US;LANG:en;SCL:5;SRV:;IPV:NLI;SFV:SPM;H:mail.example;PTR:mail.example;CAT:PHSH;SFS:(13230040);DIR:INB;SFTY:9.25";

describe("parseMicrosoftVerdict", () => {
  it("reads SCL, SFV, CAT, SFTY, BCL and compauth", () => {
    const verdict = parseMicrosoftVerdict(
      headers([
        ["X-Forefront-Antispam-Report", REPORT],
        ["X-Microsoft-Antispam", "BCL:7;ARA:1444111002"],
      ]),
      "spf=fail smtp.mailfrom=paypa1.example; dkim=none; dmarc=fail action=quarantine header.from=paypal.com;compauth=fail reason=000",
    );
    expect(verdict).toEqual({
      scl: 5,
      sfv: "SPM",
      cat: "PHSH",
      sfty: "9.25",
      bcl: 7,
      compauth: "fail",
      compauthReason: "000",
    });
    expect(microsoftAttackCategory(verdict)).toBe("phishing");
    expect(microsoftAuthFailed(verdict)).toBe("strong");
    expect(microsoftSaysSpam(verdict)).toBe(true);
    expect(microsoftFirstContact(verdict)).toBe(true);
  });

  it("is undefined without any Microsoft header", () => {
    expect(parseMicrosoftVerdict(headers([]), undefined)).toBeUndefined();
  });

  it("reads the topmost copy only (the lookup returns the first)", () => {
    const verdict = parseMicrosoftVerdict(
      headers([
        ["X-Forefront-Antispam-Report", "SCL:1;SFV:NSPM;CAT:SPOOF"],
        ["X-Forefront-Antispam-Report", "SCL:-1;SFV:SKA;CAT:NONE"],
      ]),
      undefined,
    );
    expect(microsoftAttackCategory(verdict)).toBe("spoofing");
  });

  it("a clean verdict is not an attack, spam or failed authentication", () => {
    const verdict = parseMicrosoftVerdict(
      headers([["X-Forefront-Antispam-Report", "SCL:1;SFV:NSPM;CAT:NONE"]]),
      "compauth=pass reason=100",
    );
    expect(microsoftAttackCategory(verdict)).toBeUndefined();
    expect(microsoftSaysSpam(verdict)).toBe(false);
    expect(microsoftAuthFailed(verdict)).toBeUndefined();
  });

  it("an implicit-authentication failure is weak, not strong", () => {
    expect(microsoftAuthFailed(parseMicrosoftVerdict(headers([]), "compauth=fail reason=601"))).toBe("weak");
  });

  it("ignores junk values", () => {
    const verdict = parseMicrosoftVerdict(
      headers([["X-Forefront-Antispam-Report", "SCL:abc;;:x;CAT:"]]),
      undefined,
    );
    expect(verdict).toBeUndefined();
  });
});
