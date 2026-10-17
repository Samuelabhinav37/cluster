import { describe, expect, it } from "vitest";
import { deliveredToAddresses, parseAddressList, relationshipFields } from "./headerFields";

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
