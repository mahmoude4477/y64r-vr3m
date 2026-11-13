import { afterEach, describe, expect, it, vi } from "vitest";

// lib/reports/export.ts helpers with Prisma mocked (the export rows themselves are tested through the route).
const db = vi.hoisted(() => ({ rows: [] as unknown[], values: [] as unknown[][] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      db.values.push(values);
      return db.rows;
    },
  },
}));

const { exportDateTime, rateLimitRetryAfterSec } = await import("./export");

afterEach(() => {
  vi.restoreAllMocks();
  db.rows = [];
  db.values = [];
});

describe("exportDateTime", () => {
  it("writes Riyadh time as YYYY-MM-DD HH:mm, midnight as 00 (not 24), nothing for no date", () => {
    expect(exportDateTime(new Date("2026-10-20T09:05:00Z"))).toBe("2026-10-20 12:05");
    // 21:00 UTC is midnight of the next day in Riyadh.
    expect(exportDateTime(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01-01 00:00");
    expect(exportDateTime(new Date("2026-02-28T20:59:00Z"))).toBe("2026-02-28 23:59");
    expect(exportDateTime(null)).toBe("");
  });

  it("does not build a date formatter per row (a 10,000-row export blocked the server for seconds)", () => {
    exportDateTime(new Date("2026-10-20T09:05:00Z")); // the shared formatter exists from here on
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    const base = Date.UTC(2026, 9, 1);
    const out = Array.from({ length: 500 }, (_, i) => exportDateTime(new Date(base + i * 3_600_000)));
    expect(spy).not.toHaveBeenCalled();
    expect(out[0]).toBe("2026-10-01 03:00");
    expect(out[499]).toBe("2026-10-21 22:00");
  });
});

describe("rateLimitRetryAfterSec", () => {
  it("is what is left of the window, read for the given key", async () => {
    db.rows = [{ seconds: 301 }];
    expect(await rateLimitRetryAfterSec("reports-export:u1", 3600)).toBe(301);
    expect(db.values[0]).toContain("reports-export:u1");
    expect(db.values[0]).toContain(3600);
  });

  it("stays between 1 second and the window, and is the window when there is no row", async () => {
    db.rows = [{ seconds: 0 }];
    expect(await rateLimitRetryAfterSec("k", 3600)).toBe(1);
    db.rows = [{ seconds: 7200 }];
    expect(await rateLimitRetryAfterSec("k", 3600)).toBe(3600);
    db.rows = [];
    expect(await rateLimitRetryAfterSec("k", 3600)).toBe(3600);
    db.rows = [{ seconds: null }];
    expect(await rateLimitRetryAfterSec("k", 3600)).toBe(3600);
  });
});
