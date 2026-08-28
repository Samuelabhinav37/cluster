import { beforeEach, describe, expect, it, vi } from "vitest";
import { athenaOriginPatterns, flushAthenaSecurityEvents, isAthenaConfigured, queueAthenaSecurityEvent } from "./athenaIntegration";

const managed: Record<string, unknown> = {};
const session: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    managed: { get: () => Promise.resolve(managed) },
    session: {
      get: (key: string) => Promise.resolve(key in session ? { [key]: session[key] } : {}),
      set: (values: Record<string, unknown>) => { Object.assign(session, values); return Promise.resolve(); },
    },
  },
});

const config = {
  tenantId: "test-tenant",
  agentId: "00000000-0000-4000-8000-000000000001",
  tokenUrl: "https://athena.example/v1/security/agent-token",
  eventsUrl: "https://athena.example/v1/security/events",
  enrollmentSecret: "enrollment-secret-value",
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("chrome", {
    storage: {
      managed: { get: () => Promise.resolve(managed) },
      session: {
        get: (key: string) => Promise.resolve(key in session ? { [key]: session[key] } : {}),
        set: (values: Record<string, unknown>) => { Object.assign(session, values); return Promise.resolve(); },
      },
    },
  });
  for (const key of Object.keys(managed)) delete managed[key];
  for (const key of Object.keys(session)) delete session[key];
});

describe("Athena integration", () => {
  it("stays dormant unless a complete HTTPS managed configuration exists", () => {
    expect(isAthenaConfigured(undefined)).toBe(false);
    expect(isAthenaConfigured({ ...config, eventsUrl: "http://athena.example/events" })).toBe(false);
    expect(isAthenaConfigured(config)).toBe(true);
  });

  it("requests only the configured Athena HTTPS origin", () => {
    expect(athenaOriginPatterns(config)).toEqual(["https://athena.example/*"]);
  });

  it("exchanges credentials and flushes minimized queued evidence", async () => {
    managed.athena = config;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        access_token: "agent-token", expires_at: new Date(Date.now() + 900_000).toISOString(),
      }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await queueAthenaSecurityEvent({ sourceEventId: "event-1", occurredAt: new Date().toISOString(),
      action: "warned", severity: "high", ruleId: "future-phishing-rule",
      targetIndicator: "suspicious.example", evidence: { signal: "domain" } });
    await flushAthenaSecurityEvents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.athenaSecurityEventQueue).toEqual([]);
  });

  it("does not queue anything for a normal consumer install", async () => {
    await queueAthenaSecurityEvent({ sourceEventId: "event-1", occurredAt: new Date().toISOString(),
      action: "warned", severity: "low", ruleId: "none" });
    expect(session.athenaSecurityEventQueue).toBeUndefined();
  });
});
