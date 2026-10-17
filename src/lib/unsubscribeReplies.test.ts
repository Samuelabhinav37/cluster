import { describe, expect, it } from "vitest";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { REPLY_WINDOW_MS, classifyUnsubscribeReply, repliesTo } from "./unsubscribeReplies";

const reply = (fromAddress: string, subject: string, receivedAt = 100, extra: Partial<NormalizedMessageMetadata> = {}) =>
  ({ id: subject, provider: "gmail", fromAddress, subject, receivedAt, ...extra }) as NormalizedMessageMetadata;

describe("classifyUnsubscribeReply", () => {
  it("sorts the four kinds of reply", () => {
    expect(classifyUnsubscribeReply(reply("news@shop.example", "You have been unsubscribed"))).toBe("confirmed");
    expect(classifyUnsubscribeReply(reply("news@shop.example", "Please confirm your unsubscribe request"))).toBe(
      "needs-click",
    );
    expect(classifyUnsubscribeReply(reply("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)"))).toBe(
      "bounce",
    );
    expect(classifyUnsubscribeReply(reply("lists@shop.example", "Automatic reply: unsubscribe"))).toBe("auto-reply");
    expect(classifyUnsubscribeReply(reply("news@shop.example", "Big sale this weekend"))).toBeNull();
  });
});

describe("repliesTo", () => {
  const request = { requestedAt: 50, to: "leave@lists.shop.example", sentThreadId: "t1" };

  it("reads replies from the list's company in the 72 hours after the request", () => {
    const rows = [
      reply("noreply@shop.example", "You have been unsubscribed", 60),
      reply("noreply@shop.example", "You have been unsubscribed", 50 + REPLY_WINDOW_MS + 1),
      reply("friend@other.example", "You have been unsubscribed", 60),
    ];
    expect(repliesTo(request, "news@shop.example", rows)).toEqual(["confirmed"]);
  });

  it("counts a bounce only in the request's own thread", () => {
    const bounce = (threadId: string) =>
      reply("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)", 70, { threadId });
    expect(repliesTo(request, "news@shop.example", [bounce("t1")])).toEqual(["bounce"]);
    expect(repliesTo(request, "news@shop.example", [bounce("t9")])).toEqual([]);
  });
});
