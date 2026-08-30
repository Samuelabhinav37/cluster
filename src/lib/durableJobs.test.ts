import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDurableJob,
  listDurableJobs,
  requestJobCancellation,
  retryFailedJob,
  runDurableJob,
} from "./durableJobs";
import type { EmailProvider } from "./providers/emailProvider";

function fakeStorage() {
  let store: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return key in store ? { [key]: store[key] } : {};
    },
    async set(items: Record<string, unknown>) {
      store = { ...store, ...items };
    },
  };
}

function provider(trashMessages = vi.fn(async () => {})): EmailProvider {
  return {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "token"),
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(),
    trashMessages,
  };
}

beforeEach(() => {
  vi.stubGlobal("chrome", { storage: { local: fakeStorage() } });
});

describe("durable jobs", () => {
  it("checkpoints every batch and completes with per-id receipts", async () => {
    const trash = vi.fn(async () => {});
    const gmail = provider(trash);
    const job = await createDurableJob({
      provider: "gmail",
      operation: "trash",
      targetIds: ["a", "b", "c"],
    });
    const result = await runDurableJob(job.id, new Map([["gmail", gmail]]), 2);
    expect(result.status).toBe("complete");
    expect(result.succeededIds).toEqual(["a", "b", "c"]);
    expect(trash).toHaveBeenCalledTimes(2);
    expect((await listDurableJobs())[0].nextIndex).toBe(3);
  });

  it("records failures truthfully and can plan a retry with failed ids only", async () => {
    const gmail = provider(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const job = await createDurableJob({
      provider: "gmail",
      operation: "trash",
      targetIds: ["a", "b"],
    });
    const result = await runDurableJob(job.id, new Map([["gmail", gmail]]));
    expect(result.status).toBe("failed");
    expect(result.failures.map((failure) => failure.id)).toEqual(["a", "b"]);
    const retry = await retryFailedJob(job.id);
    expect(retry.targetIds).toEqual(["a", "b"]);
    expect(retry.status).toBe("planned");
  });

  it("honors a persisted cancellation request before doing work", async () => {
    const trash = vi.fn(async () => {});
    const job = await createDurableJob({
      provider: "gmail",
      operation: "trash",
      targetIds: ["a"],
    });
    await requestJobCancellation(job.id);
    const result = await runDurableJob(job.id, new Map([["gmail", provider(trash)]]));
    expect(result.status).toBe("cancelled");
    expect(trash).not.toHaveBeenCalled();
  });

  it("runs a resumable label job with its label policy intact", async () => {
    const labelMessages = vi.fn(async () => {});
    const gmail = provider();
    gmail.labelMessages = labelMessages;
    const job = await createDurableJob({
      provider: "gmail",
      operation: "label",
      targetIds: ["a", "b"],
      labelName: "Cluster/Read Later",
      keepInInbox: false,
    });
    const result = await runDurableJob(job.id, new Map([["gmail", gmail]]));
    expect(result.status).toBe("complete");
    expect(labelMessages).toHaveBeenCalledWith("token", ["a", "b"], "Cluster/Read Later", false);
  });
});
