import { describe, expect, it } from "vitest";
import { dueReplyReminders, type ThreadView } from "./replyReminders";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 27);
const t = (id: string, ...messages: Array<[string, number, string[]]>): ThreadView => ({
  id,
  messages: messages.map(([mid, daysAgo, labelIds]) => ({ id: mid, at: NOW - daysAgo * DAY, labelIds })),
});

describe("dueReplyReminders", () => {
  it("brings back a thread whose newest message is yours and older than the wait", () => {
    const threads = [
      t("asked", ["a1", 6, ["INBOX"]], ["a2", 4, ["SENT"]]),
      t("answered", ["b1", 5, ["SENT"]], ["b2", 2, ["INBOX"]]),
      t("too-soon", ["c1", 1, ["SENT"]]),
      t("draft-after", ["d1", 5, ["SENT"]], ["d2", 1, ["DRAFT"]]),
      t("to-myself", ["e1", 5, ["SENT", "INBOX"]]),
    ];
    expect(dueReplyReminders(threads, NOW, 3, {})).toEqual([
      { threadId: "asked", messageId: "a2" },
      { threadId: "draft-after", messageId: "d1" },
    ]);
  });

  it("brings each message back once, but again after you follow up", () => {
    const thread = t("asked", ["a1", 4, ["SENT"]]);
    expect(dueReplyReminders([thread], NOW, 3, { asked: "a1" })).toEqual([]);
    const followed = t("asked", ["a1", 9, ["SENT"]], ["a3", 4, ["SENT"]]);
    expect(dueReplyReminders([followed], NOW, 3, { asked: "a1" })).toEqual([{ threadId: "asked", messageId: "a3" }]);
  });
});
