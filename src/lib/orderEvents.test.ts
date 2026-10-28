import { describe, expect, it } from "vitest";
import { deliveredUpdates, eventKey, isDelivered } from "./orderEvents";
import type { MessageRecord, SenderSummary } from "./senderModel";

const msg = (id: string, subject: string, at: number, extra: Partial<MessageRecord> = {}): MessageRecord => ({
  id,
  subject,
  receivedAt: at,
  kind: "shipping",
  isProtected: false,
  unread: true,
  sizeBytes: 100,
  providerMarkedPersonal: false,
  looksAutomated: true,
  ...extra,
});

const sender = (messages: MessageRecord[]) =>
  ({ key: "gmail:ship@shop.com", provider: "gmail", address: "ship@shop.com", messages }) as unknown as SenderSummary;

describe("event linking", () => {
  it("links by order number, else thread", () => {
    expect(eventKey(msg("a", "Your order #112-55 has shipped", 1))).toBe("ref:112-55");
    expect(eventKey(msg("b", "Order confirmed", 1, { threadId: "t1" }))).toBe("thread:t1");
    expect(eventKey(msg("c", "Order confirmed", 1))).toBeUndefined();
  });

  it("reads delivered, not soon-to-be delivered", () => {
    expect(isDelivered("Your package was delivered")).toBe(true);
    expect(isDelivered("Delivered: order 4471")).toBe(true);
    expect(isDelivered("Your order will be delivered tomorrow")).toBe(false);
    expect(isDelivered("Out for delivery today")).toBe(false);
  });

  it("moves in-transit updates of delivered orders only", () => {
    const out = deliveredUpdates([
      sender([
        msg("conf", "Order #A1234 confirmed", 1),
        msg("ship", "Order #A1234 has shipped", 2),
        msg("ofd", "Order #A1234 is out for delivery", 3),
        msg("done", "Order #A1234 was delivered", 4),
        msg("other", "Order #B9999 has shipped", 2),
        msg("starred", "Order #A1234 is on its way", 2, { isProtected: true }),
      ]),
    ]);
    expect(out.get("gmail")?.sort()).toEqual(["ofd", "ship"]);
  });
});
