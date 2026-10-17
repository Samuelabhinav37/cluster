import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOUNCE_STOP,
  MAX_PER_RUN,
  SEND_SPACING_MS,
  classifyGmailSendError,
  enqueueUnsubscribeMails,
  listUnsubscribeQueue,
  markUnsubscribeBounced,
  runUnsubscribeQueue,
  type QueueDeps,
} from "./unsubscribeQueue";

function fakeStorage() {
  let store: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return key in store ? { [key]: structuredClone(store[key]) } : {};
    },
    async set(items: Record<string, unknown>) {
      store = { ...store, ...structuredClone(items) };
    },
  };
}

const NOW = Date.UTC(2026, 9, 16, 12);
const mail = (to: string) => ({
  provider: "gmail" as const,
  senderKey: `gmail:${to}`,
  from: "me@gmail.com",
  to,
  subject: "unsubscribe",
  body: "",
});

function deps(over: Partial<QueueDeps> = {}) {
  const sleeps: number[] = [];
  const d: QueueDeps & { sleeps: number[] } = {
    send: vi.fn(async (item) => ({ id: `sent-${item.to}` })),
    alreadySent: vi.fn(async () => false),
    classify: classifyGmailSendError,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    sleeps,
    ...over,
  };
  return d;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

beforeEach(() => {
  vi.stubGlobal("chrome", { storage: { local: fakeStorage() } });
});

describe("unsubscribe queue", () => {
  it("never queues the same request twice in a day", async () => {
    expect(await enqueueUnsubscribeMails([mail("a@x.example"), mail("A@x.example")], NOW)).toHaveLength(1);
    expect(await enqueueUnsubscribeMails([mail("a@x.example")], NOW)).toHaveLength(0);
  });

  it("sends one at a time, spaced out, and records each result", async () => {
    await enqueueUnsubscribeMails([mail("a@x.example"), mail("b@x.example")], NOW);
    const d = deps();
    const run = await runUnsubscribeQueue(d);
    expect(run.sent.map((i) => i.sentMessageId)).toEqual(["sent-a@x.example", "sent-b@x.example"]);
    expect(d.sleeps).toEqual([SEND_SPACING_MS]);
    expect((await listUnsubscribeQueue()).every((i) => i.status === "sent")).toBe(true);
  });

  it("stops at the per-run cap and leaves the rest queued", async () => {
    await enqueueUnsubscribeMails(
      Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => mail(`l${i}@x.example`)),
      NOW,
    );
    const run = await runUnsubscribeQueue(deps());
    expect(run.sent).toHaveLength(MAX_PER_RUN);
    expect((await listUnsubscribeQueue()).filter((i) => i.status === "queued")).toHaveLength(3);
  });

  it("hands everything left to a compose window when sending is blocked", async () => {
    await enqueueUnsubscribeMails([mail("a@x.example"), mail("b@x.example")], NOW);
    const run = await runUnsubscribeQueue(
      deps({
        send: async () => {
          throw new ApiError(403, "Gmail API /users/me/messages/send failed: 403 Forbidden");
        },
      }),
    );
    expect(run.stopped).toBe("blocked");
    expect((await listUnsubscribeQueue()).map((i) => i.status)).toEqual(["fallback", "fallback"]);
  });

  it("pauses on a sending limit without losing the item", async () => {
    await enqueueUnsubscribeMails([mail("a@x.example")], NOW);
    const run = await runUnsubscribeQueue(
      deps({
        send: async () => {
          throw new ApiError(403, "Daily user sending limit exceeded");
        },
      }),
    );
    expect(run.stopped).toBe("limit");
    expect((await listUnsubscribeQueue())[0].status).toBe("queued");
  });

  it("stops after failures in a row", async () => {
    await enqueueUnsubscribeMails([mail("a@x.example"), mail("b@x.example"), mail("c@x.example")], NOW);
    const failing = await runUnsubscribeQueue(
      deps({
        send: async () => {
          throw new Error("network");
        },
      }),
    );
    expect(failing.stopped).toBe("errors");
    expect(failing.failed).toHaveLength(2);
  });

  it("stops after bounces", async () => {
    const queued = await enqueueUnsubscribeMails(
      Array.from({ length: BOUNCE_STOP }, (_, i) => mail(`b${i}@x.example`)),
      NOW,
    );
    await runUnsubscribeQueue(deps());
    for (const item of queued) await markUnsubscribeBounced(item.key);
    await enqueueUnsubscribeMails([mail("later@x.example")], NOW);
    expect((await runUnsubscribeQueue(deps())).stopped).toBe("bounces");
  });

  it("does not resend an item cut off mid-send when a copy is in Sent", async () => {
    const [item] = await enqueueUnsubscribeMails([mail("a@x.example")], NOW);
    await chrome.storage.local.set({ clusterUnsubscribeQueue: [{ ...item, status: "sending", sentAt: NOW }] });
    const d = deps({ alreadySent: vi.fn(async () => true) });
    await runUnsubscribeQueue(d);
    expect(d.send).not.toHaveBeenCalled();
    expect((await listUnsubscribeQueue())[0]).toMatchObject({ key: item.key, status: "sent" });
  });
});

describe("classifyGmailSendError", () => {
  it("tells limits from blocks", () => {
    expect(classifyGmailSendError(new ApiError(429, "Too many"))).toBe("limit");
    expect(classifyGmailSendError(new ApiError(403, "rateLimitExceeded"))).toBe("limit");
    expect(classifyGmailSendError(new ApiError(403, "Forbidden"))).toBe("blocked");
    expect(classifyGmailSendError(new Error("offline"))).toBe("other");
  });
});
