import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The export route with its collaborators mocked: authorization, rate limit, audit, translations and Prisma.
const state = vi.hoisted(() => ({
  auth: null as unknown,
  allowed: true,
  audits: [] as unknown[][],
  scans: [] as unknown[],
  scanWhere: null as unknown,
  attempts: [] as unknown[],
  rateKeys: [] as string[],
  /** Rows of the raw query that reads what is left of the rate-limit window (null: the query fails). */
  windowLeft: [] as Array<{ seconds: number | null }> | null,
  rawValues: [] as unknown[][],
}));

vi.mock("@/lib/session", () => ({ authorizeApi: async () => state.auth }));
// The real appRateLimitRetryAfterSec (it reads app_rate_limit through the mocked $queryRaw below).
vi.mock("@/lib/app-rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-rate-limit")>()),
  takeAppRateLimit: async (key: string) => {
    state.rateKeys.push(key);
    return state.allowed;
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: async (...args: unknown[]) => void state.audits.push(args) }));
vi.mock("@/lib/log", () => ({ requestLogger: () => ({ error: () => undefined, info: () => undefined, warn: () => undefined }) }));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string, values?: Record<string, unknown>) =>
      `${locale}:${namespace}.${key}${values ? `(${Object.entries(values).map(([k, v]) => `${k}=${String(v)}`).join(" ")})` : ""}`,
  getFormatter: async () => ({ number: (n: number) => String(n) }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    protocol: { findMany: async () => [{ id: "p1", titleAr: "بروتوكول", titleEn: "Protocol" }] },
    team: { findMany: async () => [{ id: "t1", name: "الطوارئ" }] },
    teamMember: { findMany: async () => [{ userId: "u1", team: { name: "الطوارئ" } }] },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (!text.includes("app_rate_limit")) return [];
      if (state.windowLeft === null) throw new Error("database down");
      state.rawValues.push(values);
      return state.windowLeft;
    },
    scan: {
      findMany: async (args: { where: unknown }) => {
        state.scanWhere = args.where;
        return state.scans;
      },
    },
    simulationAttempt: { findMany: async () => state.attempts },
  },
}));

const { GET, HEAD } = await import("./route");
const { decodeSpreadsheet } = await import("@/lib/reports/csv");
const { EXPORT_ROW_CAP } = await import("@/lib/reports/export");

const staff = {
  ok: true,
  ctx: {
    user: { id: "examiner-1", locale: "ar" },
    session: { impersonatedBy: null },
    organizationId: "org-1",
    orgRole: "examiner",
    memberId: "m1",
    isPlatformAdmin: false,
  },
};

function get(query: string) {
  return GET(new NextRequest(`http://127.0.0.1/api/reports/export${query}`));
}

async function rowsOf(res: Response): Promise<string[][]> {
  return decodeSpreadsheet(new Uint8Array(await res.arrayBuffer()));
}

function attempt(id: string, name: string) {
  return {
    id,
    userId: "u9",
    completedAt: new Date("2026-10-21T18:30:00Z"),
    durationSec: 60,
    score: 80,
    riskLevel: "low",
    user: { name },
    scenario: { titleAr: "س", titleEn: "S", protocol: { titleAr: "ب", titleEn: "P" } },
  };
}

beforeEach(() => {
  state.auth = staff;
  state.allowed = true;
  state.audits = [];
  state.rateKeys = [];
  state.scans = [];
  state.attempts = [];
  state.scanWhere = null;
  state.windowLeft = [];
  state.rawValues = [];
});

describe("GET /api/reports/export", () => {
  it("passes the authorization answer through (guests, trainees, mustChangePassword)", async () => {
    state.auth = { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
    const res = await get("?kind=scans");
    expect(res.status).toBe(403);
    expect(state.rateKeys).toEqual([]);
  });

  it("refuses an unknown kind", async () => {
    expect((await get("?kind=users")).status).toBe(400);
    expect((await get("")).status).toBe(400);
  });

  it("answers 429 when the user exported too often, with what is left of the hour in Retry-After", async () => {
    state.allowed = false;
    // The window started 55 minutes ago: about 5 minutes left, not a whole hour.
    state.windowLeft = [{ seconds: 297 }];
    const res = await get("?kind=scans");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("297");
    expect(await res.json()).toEqual({ error: "too_many_requests" });
    expect(state.rateKeys).toEqual(["reports-export:examiner-1"]);
    // One read of the window, for this user's key.
    expect(state.rawValues).toHaveLength(1);
    expect(state.rawValues[0]).toContain("reports-export:examiner-1");
    expect(state.audits).toEqual([]);
  });

  it("keeps Retry-After between one second and the window, and falls back to the window when it cannot tell", async () => {
    state.allowed = false;
    const retryAfter = async (left: Array<{ seconds: number | null }> | null) => {
      state.windowLeft = left;
      const res = await get("?kind=scans");
      expect(res.status).toBe(429);
      return res.headers.get("retry-after");
    };
    // The window ran out between the refusal and the read.
    expect(await retryAfter([{ seconds: -4 }])).toBe("1");
    expect(await retryAfter([{ seconds: 9000 }])).toBe("3600");
    // The row is gone, the value is missing, or the read failed: the whole window (safe side), never a 500.
    expect(await retryAfter([])).toBe("3600");
    expect(await retryAfter([{ seconds: null }])).toBe("3600");
    expect(await retryAfter(null)).toBe("3600");
  });

  it("answers HEAD with 405 without building a file, auditing or using a rate-limit slot", () => {
    const res = HEAD();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect(state.rateKeys).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("returns a formula-safe UTF-16 TAB-separated file of the institution's finalised scans, audited without personal data", async () => {
    state.scans = [
      {
        id: "scan-1",
        finalizedAt: new Date("2026-10-20T09:05:00Z"),
        areaLabel: '=HYPERLINK("http://evil")',
        score: 75,
        riskLevel: "medium",
        protocol: { titleAr: "بروتوكول", titleEn: "Protocol" },
        team: null,
        examiner: null,
      },
    ];
    const res = await get("?kind=scans&locale=en&from=2026-10-01&to=2026-10-29&protocol=p1&department=unknown");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-16le");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="waqaya-scans-2026-10-01_2026-10-29.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-export-truncated")).toBeNull();
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xfe]);
    const [header, row, ...rest] = decodeSpreadsheet(bytes);
    expect(rest).toEqual([]);
    expect(header).toEqual(
      ["finalizedAt", "area", "protocol", "department", "examiner", "score", "risk", "id"].map((k) => `en:reports.export.columns.${k}`),
    );
    // 12:05 in Riyadh, the area cannot run as a formula, a deleted examiner, no department.
    expect(row).toEqual([
      "2026-10-20 12:05",
      `"'=HYPERLINK(""http://evil"")"`,
      "Protocol",
      "en:reports.export.noDepartment",
      "en:common.deletedUser",
      "75",
      "en:common.risk.medium",
      "scan-1",
    ]);
    // The query is scoped to the active organization (and the unknown department was dropped).
    expect(JSON.stringify(state.scanWhere)).toContain('"organizationId":"org-1"');
    expect(JSON.stringify(state.scanWhere)).not.toContain("unknown");
    expect(state.audits).toHaveLength(1);
    const [actor, action, target, meta] = state.audits[0];
    expect(actor).toBe(staff.ctx);
    expect(action).toBe("reports.export");
    expect(target).toEqual({ type: "organization", id: "org-1" });
    expect(meta).toEqual({
      kind: "scans",
      rows: 1,
      truncated: false,
      from: "2026-10-01",
      to: "2026-10-29",
      protocolId: "p1",
      teamId: null,
    });
  });

  it("exports completed attempts with the trainee's departments", async () => {
    state.attempts = [
      {
        id: "att-1",
        userId: "u1",
        completedAt: new Date("2026-10-21T18:30:00Z"),
        durationSec: 125,
        score: null,
        riskLevel: null,
        user: { name: "@trainee" },
        scenario: { titleAr: "سيناريو", titleEn: "Scenario", protocol: { titleAr: "بروتوكول", titleEn: "Protocol" } },
      },
    ];
    const res = await get("?kind=attempts");
    expect(res.status).toBe(200);
    const row = (await rowsOf(res))[1];
    // Arabic by default (the user's locale), 21:30 Riyadh time, a name starting with @ is neutralised.
    expect(row).toEqual(["2026-10-21 21:30", "'@trainee", "سيناريو", "بروتوكول", "الطوارئ", "", "ar:common.score.notAssessable", "2", "att-1"]);
  });

  it("keeps a name with ; and a line break in its own cell on its own row, with no formula in front", async () => {
    state.attempts = [attempt("a1", "x;=1+1;"), attempt("a2", "z\r\n=7+7;")];
    const rows = await rowsOf(await get("?kind=attempts"));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 9)).toBe(true);
    expect(rows[1][1]).toBe("x;'=1+1;");
    expect(rows[2][1]).toBe("z =7+7;");
  });

  // A full file (10,000 rows built and decoded) on a busy machine: an explicit timeout above vitest's default 5 s.
  it("says in the file and in a header when the export was cut at the row cap", async () => {
    state.scans = Array.from({ length: EXPORT_ROW_CAP + 1 }, (_, i) => ({
      id: `s${i}`,
      finalizedAt: new Date("2026-10-20T09:05:00Z"),
      areaLabel: "Sink",
      score: 90,
      riskLevel: "low",
      protocol: { titleAr: "ب", titleEn: "P" },
      team: null,
      examiner: { name: "E" },
    }));
    const res = await get("?kind=scans&locale=en");
    expect(res.headers.get("x-export-truncated")).toBe("1");
    expect(res.headers.get("x-export-rows")).toBe(String(EXPORT_ROW_CAP));
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1 + EXPORT_ROW_CAP + 2);
    expect(rows.at(-2)).toEqual([""]);
    expect(rows.at(-1)).toEqual([`en:reports.export.truncatedNote(count=${EXPORT_ROW_CAP})`]);
    expect(state.audits[0][3]).toMatchObject({ rows: EXPORT_ROW_CAP, truncated: true });
  }, 20_000);
});
