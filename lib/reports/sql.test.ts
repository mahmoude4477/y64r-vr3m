import { describe, expect, it } from "vitest";
import { parseReportFilters } from "./filters";
import { attemptConditions, bucketSql, inList, scanConditions } from "./sql";

const TODAY = "2026-10-29";

describe("report SQL fragments", () => {
  it("scopes scans to the organization first, finalised only, with the range as bound parameters", () => {
    const sql = scanConditions("org_1", parseReportFilters({ from: "2026-10-01", to: "2026-10-29" }, TODAY));
    expect(sql.text.startsWith('s."organizationId" = $1')).toBe(true);
    expect(sql.text).toContain(`s."status" = 'finalized'`);
    expect(sql.values).toEqual(["org_1", "2026-09-30T21:00:00.000Z", "2026-10-29T21:00:00.000Z"]);
    expect(sql.text).not.toContain("protocolId");
    expect(sql.text).not.toContain("teamId");
  });

  it("adds the protocol and department filters as parameters, never as text", () => {
    const filters = parseReportFilters({ protocol: "p_1", department: "t_1" }, TODAY);
    const scans = scanConditions("org_1", filters);
    expect(scans.text).toContain('s."protocolId" = $4');
    expect(scans.text).toContain('s."teamId" = $5');
    expect(scans.values.slice(3)).toEqual(["p_1", "t_1"]);

    const attempts = attemptConditions("org_1", filters);
    expect(attempts.text.startsWith('a."organizationId" = $1')).toBe(true);
    expect(attempts.text).toContain(`a."status" = 'completed'`);
    expect(attempts.text).toContain('sc."protocolId" = $4');
    expect(attempts.text).toContain('tm."teamId" = $5 AND tm."userId" = a."userId"');
    expect(attempts.values).toEqual(["org_1", expect.any(String), expect.any(String), "p_1", "t_1"]);
  });

  it("buckets in Riyadh time, weeks from Sunday", () => {
    expect(bucketSql("scan", "week").text).toBe(
      `to_char(date_trunc('week', ((s."finalizedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh') + interval '1 day') - interval '1 day', 'YYYY-MM-DD')`,
    );
    expect(bucketSql("attempt", "month").text).toBe(
      `to_char(date_trunc('month', ((a."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh')), 'YYYY-MM-DD')`,
    );
  });

  it("binds every id of an IN list and refuses an empty one", () => {
    const sql = inList(["u1", "u2"]);
    expect(sql.text).toBe("($1,$2)");
    expect(sql.values).toEqual(["u1", "u2"]);
    expect(() => inList([])).toThrow();
  });
});
