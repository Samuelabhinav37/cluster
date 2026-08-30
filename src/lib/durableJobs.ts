import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import { withStorageLock } from "./storageLock";

const JOBS_KEY = "clusterDurableJobs";
const MAX_JOBS = 50;
const DEFAULT_BATCH_SIZE = 100;

export type DurableJobOperation = "trash" | "archive" | "markRead" | "label";
export type DurableJobStatus = "planned" | "running" | "partial" | "complete" | "failed" | "cancelled";

export interface DurableJobFailure {
  id: string;
  message: string;
}

export interface DurableJob {
  id: string;
  provider: ProviderId;
  operation: DurableJobOperation;
  targetIds: string[];
  labelName?: string;
  keepInInbox?: boolean;
  status: DurableJobStatus;
  nextIndex: number;
  succeededIds: string[];
  failures: DurableJobFailure[];
  cancelRequested: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DurableJobPlan {
  provider: ProviderId;
  operation: DurableJobOperation;
  targetIds: string[];
  labelName?: string;
  keepInInbox?: boolean;
}

async function readJobs(): Promise<DurableJob[]> {
  const data = await chrome.storage.local.get(JOBS_KEY);
  return Array.isArray(data[JOBS_KEY]) ? (data[JOBS_KEY] as DurableJob[]) : [];
}

async function mutateJobs(mutate: (jobs: DurableJob[]) => DurableJob[]): Promise<DurableJob[]> {
  return withStorageLock(JOBS_KEY, async () => {
    const next = mutate(await readJobs()).slice(-MAX_JOBS);
    await chrome.storage.local.set({ [JOBS_KEY]: next });
    return next;
  });
}

function makeJobId(): string {
  return `job-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export async function createDurableJob(plan: DurableJobPlan): Promise<DurableJob> {
  const now = Date.now();
  const job: DurableJob = {
    ...plan,
    targetIds: [...new Set(plan.targetIds)],
    id: makeJobId(),
    status: "planned",
    nextIndex: 0,
    succeededIds: [],
    failures: [],
    cancelRequested: false,
    createdAt: now,
    updatedAt: now,
  };
  await mutateJobs((jobs) => [...jobs, job]);
  return job;
}

export async function listDurableJobs(): Promise<DurableJob[]> {
  return readJobs();
}

async function replaceJob(job: DurableJob): Promise<DurableJob> {
  await mutateJobs((jobs) => jobs.map((item) => (item.id === job.id ? job : item)));
  return job;
}

export async function requestJobCancellation(jobId: string): Promise<void> {
  await mutateJobs((jobs) =>
    jobs.map((job) => (job.id === jobId ? { ...job, cancelRequested: true, updatedAt: Date.now() } : job)),
  );
}

function failedIds(error: unknown): Map<string, string> | undefined {
  if (!error || typeof error !== "object" || !("failures" in error)) return undefined;
  const failures = (error as { failures?: unknown }).failures;
  if (!Array.isArray(failures)) return undefined;
  const result = new Map<string, string>();
  for (const failure of failures) {
    if (!failure || typeof failure !== "object") continue;
    const id = "messageId" in failure ? String(failure.messageId) : "";
    const status = "status" in failure ? String(failure.status) : "unknown";
    if (id) result.set(id, `Provider operation failed (${status})`);
  }
  return result.size > 0 ? result : undefined;
}

async function executeBatch(
  provider: EmailProvider,
  token: string,
  job: DurableJob,
  ids: string[],
): Promise<void> {
  if (job.operation === "trash") return provider.trashMessages(token, ids);
  if (job.operation === "archive" && provider.archiveMessages) {
    return provider.archiveMessages(token, ids);
  }
  if (job.operation === "markRead" && provider.markReadMessages) {
    return provider.markReadMessages(token, ids);
  }
  if (job.operation === "label" && provider.labelMessages && job.labelName) {
    return provider.labelMessages(token, ids, job.labelName, job.keepInInbox);
  }
  throw new Error(`${provider.id} does not support durable ${job.operation} jobs`);
}

export async function runDurableJob(
  jobId: string,
  providers: Map<ProviderId, EmailProvider>,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<DurableJob> {
  let job = (await readJobs()).find((item) => item.id === jobId);
  if (!job) throw new Error(`Durable job ${jobId} was not found`);
  if (["complete", "cancelled"].includes(job.status)) return job;
  const provider = providers.get(job.provider);
  if (!provider) throw new Error(`Provider ${job.provider} is unavailable`);
  const token = await provider.getAuthToken(false);
  job = await replaceJob({ ...job, status: "running", updatedAt: Date.now() });

  while (job.nextIndex < job.targetIds.length) {
    const latest = (await readJobs()).find((item) => item.id === jobId) ?? job;
    if (latest.cancelRequested) {
      return replaceJob({ ...latest, status: "cancelled", updatedAt: Date.now() });
    }
    job = latest;
    const batch = job.targetIds.slice(job.nextIndex, job.nextIndex + batchSize);
    let succeeded = batch;
    let failures: DurableJobFailure[] = [];
    try {
      await executeBatch(provider, token, job, batch);
    } catch (error) {
      const perId = failedIds(error);
      if (perId) {
        succeeded = batch.filter((id) => !perId.has(id));
        failures = [...perId].map(([id, message]) => ({ id, message }));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        succeeded = [];
        failures = batch.map((id) => ({ id, message }));
      }
    }
    job = await replaceJob({
      ...job,
      nextIndex: job.nextIndex + batch.length,
      succeededIds: [...job.succeededIds, ...succeeded],
      failures: [...job.failures, ...failures],
      updatedAt: Date.now(),
    });
  }

  const status: DurableJobStatus =
    job.failures.length === 0 ? "complete" : job.succeededIds.length > 0 ? "partial" : "failed";
  return replaceJob({ ...job, status, updatedAt: Date.now() });
}

export async function retryFailedJob(jobId: string): Promise<DurableJob> {
  const existing = (await readJobs()).find((job) => job.id === jobId);
  if (!existing) throw new Error(`Durable job ${jobId} was not found`);
  return createDurableJob({
    provider: existing.provider,
    operation: existing.operation,
    targetIds: existing.failures.map((failure) => failure.id),
    labelName: existing.labelName,
    keepInInbox: existing.keepInInbox,
  });
}

export async function resumeInterruptedJobs(
  providers: Map<ProviderId, EmailProvider>,
): Promise<DurableJob[]> {
  const pending = (await readJobs()).filter((job) => ["planned", "running"].includes(job.status));
  const results: DurableJob[] = [];
  for (const job of pending) results.push(await runDurableJob(job.id, providers));
  return results;
}
