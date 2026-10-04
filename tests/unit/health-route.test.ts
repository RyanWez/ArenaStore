import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbExecute = vi.hoisted(() => vi.fn());
const upstreamGetHealth = vi.hoisted(() => vi.fn());

vi.mock("@arena/db", () => ({
  getDb: () => ({ execute: dbExecute }),
  closeDb: vi.fn(),
}));
vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: { getHealth: upstreamGetHealth },
}));

import { healthRoutes } from "../../apps/api/src/routes/health";

/**
 * /health is the uptime-monitoring contract: 503 + "degraded" when the
 * database is unreachable (UptimeRobot must page on it), 200 with a
 * `degraded` flag when only the upstream partner API is down.
 */
describe("GET /health", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
  });

  it("returns 200 ok when the database and upstream are healthy", async () => {
    dbExecute.mockResolvedValue(undefined);
    upstreamGetHealth.mockResolvedValue({ ok: true, service: "xproseller-partner-api" });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.degraded).toBe(false);
    expect(body.services.database).toBe("connected");
    expect(body.services.upstreamPartnerApi).toBe("healthy");
  });

  it("returns 503 degraded when the database is unreachable", async () => {
    dbExecute.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    upstreamGetHealth.mockResolvedValue({ ok: true, service: "xproseller-partner-api" });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe("degraded");
    expect(body.degraded).toBe(true);
    // Error detail is logged server-side only — never echoed to the public body.
    expect(body.services.database).toBe("error");
    expect(res.body).not.toContain("ECONNREFUSED");
  });

  it("returns 200 with the degraded flag when the upstream API is down", async () => {
    dbExecute.mockResolvedValue(undefined);
    upstreamGetHealth.mockRejectedValue(new Error("upstream timeout"));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.degraded).toBe(true);
    expect(body.services.database).toBe("connected");
    expect(body.services.upstreamPartnerApi).toBe("error");
    expect(res.body).not.toContain("upstream timeout");
  });

  it("returns 200 with the degraded flag when upstream reports ok:false", async () => {
    dbExecute.mockResolvedValue(undefined);
    upstreamGetHealth.mockResolvedValue({ ok: false, service: "xproseller-partner-api" });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.degraded).toBe(true);
    expect(body.services.upstreamPartnerApi).toBe("degraded");
  });
});
