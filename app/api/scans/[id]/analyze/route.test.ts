import { beforeEach, describe, expect, it, vi } from "vitest";

// The analyze route's own limits (SEC-2 of the review): the per-user rule is taken first and refuses before anything
// else, and the per-scan rule is counted only for a scan of the caller's institution, so unknown ids and another
// institution's scans never create a row or use up that scan's hourly budget.

const m = vi.hoisted(() => ({
  takeAppRateLimit: vi.fn(),
  exists: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  authorizeApi: async () => ({
    ok: true,
    ctx: { user: { id: "u1" }, organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false },
  }),
}));
vi.mock("@/lib/app-rate-limit", () => ({ takeAppRateLimit: m.takeAppRateLimit }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  isStorageConfigured: () => true,
}));
vi.mock("@/lib/scans/analysis", () => ({ analyzableScanExists: m.exists, runScanAnalysis: m.run }));

const { POST } = await import("./route");

const call = (id: string) =>
  POST(new Request(`http://127.0.0.1/api/scans/${id}/analyze`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  } as RouteContext<"/api/scans/[id]/analyze">);
const keys = () => m.takeAppRateLimit.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  m.takeAppRateLimit.mockResolvedValue(true);
  m.exists.mockResolvedValue(true);
  m.run.mockResolvedValue({ ok: true, steps: 3, needsReview: 1 });
});

describe("POST /api/scans/[id]/analyze limits", () => {
  it("refuses a throttled user before looking at the scan or counting it", async () => {
    m.takeAppRateLimit.mockResolvedValueOnce(false);
    const res = await call("scan1");
    expect(res.status).toBe(429);
    expect(keys()).toEqual(["scans:analyze:u1"]);
    expect(m.exists).not.toHaveBeenCalled();
    expect(m.run).not.toHaveBeenCalled();
  });

  it("does not count the per-scan rule for an id outside the caller's institution", async () => {
    m.exists.mockResolvedValue(false);
    const res = await call("someone-elses-scan");
    expect(res.status).toBe(404);
    expect(keys()).toEqual(["scans:analyze:u1"]);
    expect(m.run).not.toHaveBeenCalled();
  });

  it("counts both rules for the caller's own scan, then runs the analysis", async () => {
    const res = await call("scan1");
    expect(res.status).toBe(200);
    expect(keys()).toEqual(["scans:analyze:u1", "scans:analyze-scan:scan1"]);
    expect(m.exists.mock.calls[0][1]).toBe("scan1");
    expect(m.run).toHaveBeenCalledTimes(1);
  });

  it("refuses when the scan's own budget is spent", async () => {
    m.takeAppRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await call("scan1")).status).toBe(429);
    expect(m.run).not.toHaveBeenCalled();
  });
});
