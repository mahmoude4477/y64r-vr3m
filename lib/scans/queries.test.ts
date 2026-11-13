import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/lib/authz";
import { ANALYSIS_STALE_MS } from "./constants";
import { EMPTY_FILTERS } from "./filters";

// The scan list with Prisma mocked: a crashed analysis is listed as "failed", like its own page (effectiveStatus).

const m = vi.hoisted(() => ({ scan: { count: vi.fn(), findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { scan: m.scan } }));

const { listScans } = await import("./queries");

const staff: Scope = { userId: "u1", organizationId: "org1", orgRole: "examiner", isPlatformAdmin: false };
const ago = (ms: number) => new Date(Date.now() - ms);
const row = (id: string, status: string, updatedAt: Date) => ({
  id,
  areaLabel: id,
  status,
  updatedAt,
  score: null,
  riskLevel: null,
  createdAt: updatedAt,
  examinerId: "u1",
  protocol: { titleAr: "ع", titleEn: "P", icon: "droplets" },
  team: null,
  examiner: { name: "Examiner" },
  _count: { photos: 1 },
});

describe("listScans", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows a stale analysis as failed and a running one as analyzing", async () => {
    m.scan.count.mockResolvedValue(3);
    m.scan.findMany.mockResolvedValue([
      row("stale", "analyzing", ago(ANALYSIS_STALE_MS + 60_000)),
      row("running", "analyzing", ago(10_000)),
      row("review", "review", ago(ANALYSIS_STALE_MS * 10)),
    ]);
    const page = await listScans(staff, EMPTY_FILTERS, "en");
    expect(page.rows.map((r) => [r.id, r.status])).toEqual([
      ["stale", "failed"],
      ["running", "analyzing"],
      ["review", "review"],
    ]);
  });

  it("filters ?status=failed on the shown status (failed, or analyzing past the cut-off)", async () => {
    m.scan.count.mockResolvedValue(0);
    m.scan.findMany.mockResolvedValue([]);
    await listScans(staff, { ...EMPTY_FILTERS, status: "failed" }, "en");
    const where = m.scan.count.mock.calls[0][0].where as { AND: Array<Record<string, unknown>> };
    const or = (where.AND[1] as { OR: Array<{ status: string; updatedAt?: { lt: Date } }> }).OR;
    expect(or[0]).toEqual({ status: "failed" });
    expect(or[1].status).toBe("analyzing");
    expect(Math.abs(Date.now() - ANALYSIS_STALE_MS - or[1].updatedAt!.lt.getTime())).toBeLessThan(5_000);
  });
});
