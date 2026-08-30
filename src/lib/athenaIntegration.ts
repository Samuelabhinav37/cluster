import { withStorageLock } from "./storageLock";

export interface AthenaManagedConfig {
  tenantId: string;
  agentId: string;
  tokenUrl: string;
  eventsUrl: string;
  enrollmentSecret: string;
}

export interface ClusterSecurityEvent {
  sourceEventId: string;
  occurredAt: string;
  action: "warned" | "quarantined" | "allowed_override";
  severity: "low" | "medium" | "high" | "critical";
  ruleId: string;
  policyVersion?: string;
  subjectPseudonym?: string;
  targetIndicator?: string;
  evidence?: Record<string, unknown>;
}

interface AgentSession { token: string; expiresAt: number }

const SESSION_KEY = "athenaAgentSession";
const QUEUE_KEY = "athenaSecurityEventQueue";
const MAX_QUEUE_LENGTH = 200;
const EXPIRY_BUFFER_MS = 60_000;

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function isAthenaConfigured(value: unknown): value is AthenaManagedConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Partial<AthenaManagedConfig>;
  return Boolean(config.tenantId && config.agentId && config.enrollmentSecret &&
    config.tokenUrl && config.eventsUrl && isHttpsUrl(config.tokenUrl) && isHttpsUrl(config.eventsUrl));
}

export async function getAthenaConfig(): Promise<AthenaManagedConfig | null> {
  try {
    const managed = await chrome.storage.managed.get("athena");
    return isAthenaConfigured(managed.athena) ? managed.athena : null;
  } catch { return null; }
}

export function athenaOriginPatterns(config: AthenaManagedConfig): string[] {
  return [...new Set([config.tokenUrl, config.eventsUrl].map((value) => `${new URL(value).origin}/*`))];
}

async function getSession(config: AthenaManagedConfig): Promise<AgentSession | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const current = stored[SESSION_KEY] as Partial<AgentSession> | undefined;
  if (typeof current?.token === "string" && typeof current.expiresAt === "number" &&
      current.expiresAt - EXPIRY_BUFFER_MS > Date.now()) return current as AgentSession;
  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: config.tenantId, agent_id: config.agentId,
        enrollment_secret: config.enrollmentSecret }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: unknown; expires_at?: unknown };
    if (typeof body.access_token !== "string" || typeof body.expires_at !== "string") return null;
    const expiresAt = Date.parse(body.expires_at);
    if (!Number.isFinite(expiresAt)) return null;
    const session = { token: body.access_token, expiresAt };
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    return session;
  } catch { return null; }
}

// Every read-modify-write of QUEUE_KEY runs through withStorageLock (see
// storageLock.ts). chrome.storage has no atomic update, so a dashboard
// deep-scan enqueue racing the background alarm's enqueue/flush would otherwise
// read the same array and the second write would clobber the first's events.
const withQueueLock = <T>(fn: () => Promise<T>) => withStorageLock(QUEUE_KEY, fn);

async function appendToQueue(events: ClusterSecurityEvent[]): Promise<void> {
  await withQueueLock(async () => {
    const stored = await chrome.storage.session.get(QUEUE_KEY);
    const queue = Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] as ClusterSecurityEvent[] : [];
    queue.push(...events);
    await chrome.storage.session.set({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE_LENGTH) });
  });
}

export async function queueAthenaSecurityEvent(event: ClusterSecurityEvent): Promise<void> {
  return queueAthenaSecurityEvents([event]);
}

/** Batched enqueue -- one config check, one locked read-modify-write for the
 * whole set, instead of that round-trip per event. */
export async function queueAthenaSecurityEvents(events: ClusterSecurityEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (!(await getAthenaConfig())) return;
  await appendToQueue(events);
}

export async function flushAthenaSecurityEvents(): Promise<void> {
  const config = await getAthenaConfig();
  if (!config) return;
  const stored = await chrome.storage.session.get(QUEUE_KEY);
  const queue = Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] as ClusterSecurityEvent[] : [];
  if (queue.length === 0) return;
  const session = await getSession(config);
  if (!session) return;
  let sent = 0;
  try {
    for (const event of queue) {
      const response = await fetch(config.eventsUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ source_event_id: event.sourceEventId, occurred_at: event.occurredAt,
          action: event.action, severity: event.severity, rule_id: event.ruleId,
          policy_version: event.policyVersion, subject_pseudonym: event.subjectPseudonym,
          target_indicator: event.targetIndicator, evidence: event.evidence ?? {} }),
      });
      if (!response.ok) break;
      sent += 1;
    }
  } catch { /* keep whatever we managed to send below */ }
  if (sent === 0) return;
  // Re-read under the lock and drop only the first `sent` entries: events
  // enqueued while the POSTs were in flight were appended after them, so
  // they survive. Server-side dedup by source_event_id makes an occasional
  // re-send of an already-delivered event harmless.
  await withQueueLock(async () => {
    const current = await chrome.storage.session.get(QUEUE_KEY);
    const currentQueue = Array.isArray(current[QUEUE_KEY]) ? current[QUEUE_KEY] as ClusterSecurityEvent[] : [];
    await chrome.storage.session.set({ [QUEUE_KEY]: currentQueue.slice(sent) });
  });
}
