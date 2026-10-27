import { describe, expect, it } from "vitest";
import { deliveredToAddresses, outlookVerdict, parseAddressList, relationshipFields, shapeFields } from "./headerFields";

describe("parseAddressList", () => {
  it("keeps a quoted name with a comma as one address", () => {
    expect(parseAddressList('"Smith, Jane" <Jane@Example.com>, bob@example.org')).toEqual([
      { address: "jane@example.com", name: "Smith, Jane" },
      { address: "bob@example.org", name: "" },
    ]);
  });

  it("reads unquoted names, escapes and group syntax", () => {
    expect(parseAddressList('Team: Ann Lee <ann@x.com>, "Bo \\"B\\" Ray" <bo@x.com>;, plain@y.com')).toEqual([
      { address: "ann@x.com", name: "Ann Lee" },
      { address: "bo@x.com", name: 'Bo "B" Ray' },
      { address: "plain@y.com", name: "" },
    ]);
  });

  it("drops entries without an address", () => {
    expect(parseAddressList("undisclosed-recipients:;")).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("relationshipFields", () => {
  const headers: Record<string, string> = {
    to: "me@home.com, Ann <ann@x.com>",
    cc: "ann@x.com, cat@y.com",
    "message-id": "<abc@mail.x.com>",
    "in-reply-to": "<parent@mail.me.com>",
    references: "<root@a> <mid@b>\r\n <parent@mail.me.com>",
    "list-id": "Weekly News <news.list.example.com>",
    "return-path": "<bounce-123@mailer.esp.example>",
    "feedback-id": "campaign:42:esp ",
    sender: "Ops <ops@x.com>",
  };
  const fields = relationshipFields((name) => headers[name.toLowerCase()]);

  it("reads recipients and counts each address once", () => {
    expect(fields.toAddresses).toEqual(["me@home.com", "ann@x.com"]);
    expect(fields.ccAddresses).toEqual(["ann@x.com", "cat@y.com"]);
    expect(fields.recipientCount).toBe(3);
  });

  it("reads thread, list and sending-service headers", () => {
    expect(fields).toMatchObject({
      messageIdHeader: "<abc@mail.x.com>",
      inReplyTo: "<parent@mail.me.com>",
      referencesCount: 3,
      listId: "news.list.example.com",
      returnPathDomain: "mailer.esp.example",
      feedbackId: "campaign:42:esp",
      senderHeaderAddress: "ops@x.com",
    });
  });

  it("leaves absent headers empty", () => {
    expect(relationshipFields(() => undefined)).toEqual({
      toAddresses: [],
      ccAddresses: [],
      recipientCount: 0,
      messageIdHeader: undefined,
      inReplyTo: undefined,
      referencesCount: 0,
      listId: undefined,
      returnPathDomain: undefined,
      feedbackId: undefined,
      senderHeaderAddress: undefined,
    });
  });
});

describe("deliveredToAddresses", () => {
  it("puts the delivery headers before To and Cc, each address once", () => {
    const headers: Record<string, string> = {
      "delivered-to": "me+news@x.example",
      "x-original-to": "alias@x.example",
      to: "Me <me@x.example>, alias@x.example",
      cc: "team@x.example",
    };
    expect(deliveredToAddresses((name) => headers[name.toLowerCase()])).toEqual([
      "me+news@x.example",
      "alias@x.example",
      "me@x.example",
      "team@x.example",
    ]);
  });
});

describe("shapeFields", () => {
  const lookup = (headers: Record<string, string>) => (name: string) => headers[name];
  it("reads MIME type, List-Post kind, auto-response suppress and the claimed date", () => {
    expect(
      shapeFields(
        lookup({
          "Content-Type": 'Multipart/Report; report-type="delivery-status"',
          "List-Post": "NO",
          "X-Auto-Response-Suppress": " All ",
          Date: "Tue, 27 Oct 2026 10:00:00 +0000",
        }),
      ),
    ).toEqual({
      contentType: "multipart/report",
      listPost: "no",
      autoResponseSuppress: "all",
      claimedSentAt: Date.UTC(2026, 9, 27, 10),
    });
    expect(shapeFields(lookup({ "List-Post": "<mailto:group@x.org>", Date: "garbage" }))).toEqual({
      listPost: "mailto",
    });
  });
});

describe("outlookVerdict", () => {
  const all = (headers: [string, string][]) => (name: string) =>
    headers.filter(([n]) => n === name).map(([, v]) => v);
  it("keeps any flag and the highest BCL across copies, so a forged clean copy can't win", () => {
    expect(
      outlookVerdict(
        all([
          ["X-Microsoft-Antispam", "BCL:0;"],
          ["X-Microsoft-Antispam", "BCL:7;ARA:123"],
          ["X-Forefront-Antispam-Report", "CIP:1.2.3.4;CAT:NONE;SFV:NSPM"],
          ["X-Forefront-Antispam-Report", "CIP:1.2.3.4;CTRY:US;CAT:PHSH;SFV:SPM"],
        ]),
      ),
    ).toEqual({ bulkComplaintLevel: 7, flagged: true });
    expect(outlookVerdict(all([["X-Forefront-Antispam-Report", "CAT:BULK;SFV:NSPM"]]))).toEqual({
      bulkComplaintLevel: undefined,
      flagged: false,
    });
  });
});
