import { describe, expect, it } from "vitest";
import { isFreeMailDomain } from "./freeMail";
import { checkMailtoUnsubscribe } from "./mailtoGate";
import type { UnsubscribeDetails } from "./providers/emailProvider";
import { parseListUnsubscribe } from "./unsubscribe";

const AR = (d: string, spf = "pass") =>
  `mx.google.com; dkim=pass header.i=@${d} header.s=s1; spf=${spf} smtp.mailfrom=${d}; dmarc=pass header.from=${d}`;
const SIG = (d: string, h = "from:subject:list-unsubscribe") => `v=1; a=rsa-sha256; d=${d}; s=s1; h=${h}; bh=x; b=y`;

function details(over: Partial<UnsubscribeDetails> & { header?: string } = {}): UnsubscribeDetails {
  const { header = "<mailto:leave@news.example?subject=unsubscribe>", ...rest } = over;
  return {
    messageId: "m1",
    fromAddress: "hello@news.example",
    inSpam: false,
    unsubscribe: parseListUnsubscribe(header, undefined),
    dkimSignatures: [SIG("news.example")],
    authenticationResults: [AR("news.example")],
    returnPathDomain: "bounce.news.example",
    deliveredTo: ["me@gmail.com"],
    ...rest,
  };
}

const check = (d: UnsubscribeDetails, own = ["me@gmail.com"]) =>
  checkMailtoUnsubscribe("gmail", d, own, isFreeMailDomain);

describe("checkMailtoUnsubscribe", () => {
  it("passes a signed request to the sender's own domain", () => {
    expect(check(details())).toEqual({ ok: true, parts: { to: "leave@news.example", subject: "unsubscribe" } });
  });

  it("accepts a known mailing service's unsubscribe domain", () => {
    expect(check(details({ header: "<mailto:unsubscribe-abc123@createsend.com>" })).ok).toBe(true);
  });

  it("accepts the domain of a passing DKIM signer", () => {
    const d = details({
      header: "<mailto:u@esp-mail.example>",
      dkimSignatures: [SIG("esp-mail.example")],
      authenticationResults: [AR("esp-mail.example")],
    });
    expect(check(d).ok).toBe(true);
  });

  it("refuses mail in Spam", () => {
    expect(check(details({ inSpam: true }))).toEqual({ ok: false, reason: "in-spam" });
  });

  it("refuses when the signature doesn't cover List-Unsubscribe", () => {
    expect(check(details({ dkimSignatures: [SIG("news.example", "from:subject")] }))).toEqual({
      ok: false,
      reason: "unsigned-header",
    });
  });

  it("refuses a signature the provider didn't see pass", () => {
    expect(check(details({ authenticationResults: ["evil.example; dkim=pass header.i=@news.example"] }))).toEqual({
      ok: false,
      reason: "unsigned-header",
    });
  });

  it("refuses failed sender checks", () => {
    const failed = "mx.google.com; dkim=pass header.i=@news.example; spf=pass; dmarc=fail header.from=news.example";
    expect(check(details({ authenticationResults: [failed] }))).toEqual({ ok: false, reason: "auth-failed" });
  });

  it("refuses an address that belongs to someone else", () => {
    expect(check(details({ header: "<mailto:victim@stranger.example>" }))).toEqual({
      ok: false,
      reason: "unrelated-address",
    });
  });

  it("refuses the user's own address and company domain, but not a shared free-mail domain", () => {
    expect(check(details({ header: "<mailto:me@gmail.com>" }), ["me@gmail.com"]).ok).toBe(false);
    expect(
      check(details({ fromAddress: "hr@corp.example", header: "<mailto:boss@corp.example>" }), ["me@corp.example"]),
    ).toEqual({ ok: false, reason: "own-address" });
  });

  it("refuses unsafe or missing mailto URLs", () => {
    expect(check(details({ header: "<mailto:a@news.example?cc=b@news.example>" }))).toEqual({
      ok: false,
      reason: "unsafe-mailto",
    });
    expect(check(details({ header: "<https://news.example/u>" }))).toEqual({ ok: false, reason: "no-mailto" });
  });

  it("trusts the envelope domain only as the provider saw it pass SPF", () => {
    const viaEnvelope = (spf: string) =>
      details({
        header: "<mailto:u@bounce-host.example>",
        authenticationResults: [
          `mx.google.com; dkim=pass header.i=@news.example; spf=${spf} smtp.mailfrom=b@bounce-host.example; dmarc=pass header.from=news.example`,
        ],
      });
    expect(check(viaEnvelope("pass")).ok).toBe(true);
    expect(check(viaEnvelope("softfail")).ok).toBe(false);
    // A Return-Path header alone proves nothing.
    expect(check(details({ header: "<mailto:u@bounce-host.example>", returnPathDomain: "bounce-host.example" })).ok).toBe(
      false,
    );
  });
});
