import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYSIS_STALE_MS } from "@/lib/scans/constants";

// GET /api/scans/<id> returns the status the pages show (review-core effectiveStatus): a crashed analysis (still
// "analyzing" long after it started) reads "failed", so the new-scan page and the running-analysis card stop polling
// and show the failure instead of waiting until "slow" (round 2, R2-1).

const m = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/session", () => ({
  authorizeApi: async () => ({
    ok: true,
    ctx: { user: { id: "u1" }, organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false },
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { scan: { findFirst: m.findFirst } } }));

const { GET } = await import("./route");

const ID = "cmvv0000000000000000000000";
const call = () =>
  GET(new Request(`http://127.0.0.1/api/scans/${ID}`), { params: Promise.resolve({ id: ID }) } as RouteContext<"/api/scans/[id]">);
const scan = (status: string, updatedAt: Date) => ({ id: ID, status, updatedAt, analyzedAt: null, photos: [], stepResults: [] });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/scans/[id] status", () => {
  it("reports a stale analysis as failed", async () => {
    m.findFirst.mockResolvedValue(scan("analyzing", new Date(Date.now() - ANALYSIS_STALE_MS - 60_000)));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("failed");
  });

  it("reports a running analysis as analyzing", async () => {
    m.findFirst.mockResolvedValue(scan("analyzing", new Date(Date.now() - 5_000)));
    expect((await (await call()).json()).status).toBe("analyzing");
  });

  it("reads only scans of the caller's institution", async () => {
    m.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(m.findFirst.mock.calls[0][0].where).toMatchObject({ id: ID, organizationId: "org1" });
  });
});
