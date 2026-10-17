import { describe, expect, it } from "vitest";
import { toGmailRaw, unsubscribeMailFor, unsubscribeMime } from "./unsubscribeMail";

describe("unsubscribeMailFor", () => {
  it("uses the sender's subject and body, or 'unsubscribe' and nothing", () => {
    expect(unsubscribeMailFor("me@x.example", { to: "l@y.example", subject: "remove", body: "please" })).toEqual({
      from: "me@x.example",
      to: "l@y.example",
      subject: "remove",
      body: "please",
    });
    expect(unsubscribeMailFor("me@x.example", { to: "l@y.example" })).toEqual({
      from: "me@x.example",
      to: "l@y.example",
      subject: "unsubscribe",
      body: "",
    });
  });

  it("refuses oversized fields instead of sending them", () => {
    expect(unsubscribeMailFor("me@x.example", { to: "l@y.example", body: "x".repeat(5000) })).toBeUndefined();
  });
});

describe("unsubscribeMime", () => {
  it("writes a plain new message with no extra headers", () => {
    const mime = unsubscribeMime({ from: "me@x.example", to: "l@y.example", subject: "unsubscribe", body: "" });
    expect(mime).toBe(
      [
        "From: me@x.example",
        "To: l@y.example",
        "Subject: unsubscribe",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        "",
      ].join("\r\n"),
    );
    expect(mime).not.toMatch(/Auto-Submitted|In-Reply-To|References/);
  });

  it("encodes non-ASCII subjects and bodies", () => {
    const mime = unsubscribeMime({ from: "me@x.example", to: "l@y.example", subject: "désabonner", body: "merci\n" });
    expect(mime).toContain("Subject: =?UTF-8?B?ZMOpc2Fib25uZXI=?=");
    expect(mime).toContain("Content-Transfer-Encoding: 7bit");
    const accented = unsubscribeMime({ from: "me@x.example", to: "l@y.example", subject: "x", body: "é" });
    expect(accented).toContain("Content-Transfer-Encoding: base64\r\n\r\nw6k=");
  });

  it("base64url-encodes for the Gmail API", () => {
    expect(toGmailRaw("ab?>")).toBe("YWI_Pg");
  });
});
