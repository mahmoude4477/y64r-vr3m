import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_KEYS, auditMetaEntries, auditOrganizationId, auditTargetTypeKey, META_VALUE_MAX } from "./audit-display";
import { auditParams, auditWhere, isAuditFiltered, parseAction, parseAuditFilters } from "./audit-filters";

describe("audit filters", () => {
  it("accepts dotted action codes only", () => {
    for (const ok of ["auth.admin.ban-user", "scan.delete", "account.sessions.revoke_others", "setting.update"]) expect(parseAction(ok)).toBe(ok);
    for (const bad of [undefined, "", "Scan.Delete", "scan..delete", ".scan", "scan delete", "a.b.c.d.e.f.g", "x".repeat(101)]) {
      expect(parseAction(bad)).toBe("");
    }
  });

  it("parses the URL and treats 'all' as no filter", () => {
    expect(parseAuditFilters({})).toEqual({ action: "", q: "", actor: "", org: "", from: "", to: "", page: 1 });
    expect(parseAuditFilters({ action: "all", org: "all" })).toMatchObject({ action: "", org: "" });
    const f = parseAuditFilters({ action: "scan.delete", q: " huda ", actor: "u1", org: "o1", from: "2026-10-01", to: "2026-10-02", page: "2" });
    expect(f).toEqual({ action: "scan.delete", q: "huda", actor: "u1", org: "o1", from: "2026-10-01", to: "2026-10-02", page: 2 });
    expect(isAuditFiltered(f)).toBe(true);
    expect(isAuditFiltered(parseAuditFilters({ page: "3" }))).toBe(false);
    expect(auditParams(f)).toEqual({ action: "scan.delete", q: "huda", actor: "u1", org: "o1", from: "2026-10-01", to: "2026-10-02" });
  });

  it("builds the where-clause (an institution: the target or meta.organizationId)", () => {
    expect(auditWhere({ action: "", q: "", actor: "", org: "", from: "", to: "" })).toEqual({});
    expect(auditWhere({ action: "auth.admin.set-role", q: "huda", actor: "u1", org: "o1", from: "2026-10-29", to: "" })).toEqual({
      AND: [
        { action: "auth.admin.set-role" },
        { OR: [{ actorName: { contains: "huda", mode: "insensitive" } }, { actor: { name: { contains: "huda", mode: "insensitive" } } }] },
        { actorId: "u1" },
        { OR: [{ targetType: "organization", targetId: "o1" }, { meta: { path: ["organizationId"], equals: "o1" } }] },
        { createdAt: { gte: new Date("2026-10-28T21:00:00Z") } },
      ],
    });
  });
});

describe("audit display", () => {
  it("labels the actions every team writes", () => {
    for (const action of ["scan.delete", "attempt.delete", "setting.update", "setting.reset", "protocol.publish", "scenario.version", "reports.export"]) {
      expect(Object.hasOwn(AUDIT_ACTION_KEYS, action)).toBe(true);
    }
  });

  it("finds the institution of a row", () => {
    expect(auditOrganizationId({ targetType: "organization", targetId: "o1", meta: { organizationId: "o2" } })).toBe("o1");
    expect(auditOrganizationId({ targetType: "scan", targetId: "s1", meta: { organizationId: "o2" } })).toBe("o2");
    expect(auditOrganizationId({ targetType: "user", targetId: "u1", meta: null })).toBeNull();
    expect(auditOrganizationId({ targetType: "user", targetId: "u1", meta: ["o1"] })).toBeNull();
    expect(auditOrganizationId({ targetType: "user", targetId: "u1", meta: { organizationId: 5 } })).toBeNull();
  });

  it("knows the target types it labels", () => {
    expect(auditTargetTypeKey("simulation_attempt")).toBe("simulation_attempt");
    expect(auditTargetTypeKey("something_else")).toBeNull();
  });

  it("shows meta as sorted text entries, whatever its shape", () => {
    expect(auditMetaEntries(null)).toEqual([]);
    expect(auditMetaEntries(undefined)).toEqual([]);
    expect(auditMetaEntries("odd")).toEqual([{ key: "value", value: "odd" }]);
    expect(auditMetaEntries({ to: 30, key: "ai.dailyLimitPerUser", from: null, fields: ["name", "type"], flag: true, nested: { a: 1 } })).toEqual([
      { key: "fields", value: "name, type" },
      { key: "flag", value: "true" },
      { key: "from", value: "null" },
      { key: "key", value: "ai.dailyLimitPerUser" },
      { key: "nested", value: '{"a":1}' },
      { key: "to", value: "30" },
    ]);
  });

  it("never renders markup and cuts long values", () => {
    const [entry] = auditMetaEntries({ x: "<img src=x onerror=alert(1)>" });
    expect(entry.value).toBe("<img src=x onerror=alert(1)>"); // plain text: React escapes it
    const [long] = auditMetaEntries({ x: "a".repeat(META_VALUE_MAX + 50) });
    expect(long.value).toHaveLength(META_VALUE_MAX);
    expect(long.value.endsWith("…")).toBe(true);
    expect(auditMetaEntries(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${String(i).padStart(2, "0")}`, i])))).toHaveLength(30);
  });
});
