import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, fail: false }));
const logged = vi.hoisted(() => ({ errors: [] as Array<[string, Record<string, unknown> | undefined]> }));
vi.mock("@/lib/log", () => ({
  log: {
    error: (event: string, fields?: Record<string, unknown>) => logged.errors.push([event, fields]),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "admin-1" ? { name: "Admin One", role: "admin" } : where.id === "nul-1" ? { name: "Ad\u0000min", role: "user" } : null,
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (created.fail) throw new Error("db down");
        created.rows.push(data);
        return data;
      },
    },
  },
}));

const { clientIp, resolveAuditActor, sanitizeAuditMeta, stripNul, withImpersonating, writeAuditRecord } = await import("./audit-core");

/** A fake transaction client whose insert fails. */
function failingTx() {
  return {
    user: { findUnique: async () => null },
    auditLog: {
      create: async () => {
        throw new Error("insert failed inside the transaction");
      },
    },
  } as unknown as Parameters<typeof writeAuditRecord>[1];
}

describe("audit IP", () => {
  it("keeps the full IPv6 address and IPv4 as is", () => {
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8:85a3::8a2e:370:7334" }))).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    expect(clientIp(new Headers({ "x-forwarded-for": "::1" }))).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(null)).toBeNull();
  });
});

describe("audit actor", () => {
  it("names the admin while impersonating, the same rule as the Better Auth audit rows", () => {
    expect(resolveAuditActor("u-9", "admin-1")).toEqual({ actorId: "admin-1", impersonating: "u-9" });
    expect(resolveAuditActor("u-9", null)).toEqual({ actorId: "u-9", impersonating: null });
    expect(resolveAuditActor("u-9", "")).toEqual({ actorId: "u-9", impersonating: null });
    expect(resolveAuditActor(null, undefined)).toEqual({ actorId: null, impersonating: null });
  });

  it("adds meta.impersonating without losing the caller's meta", () => {
    expect(withImpersonating({ scans: 2 }, "u-9")).toEqual({ scans: 2, impersonating: "u-9" });
    expect(withImpersonating(undefined, "u-9")).toEqual({ impersonating: "u-9" });
    expect(withImpersonating(["a"], "u-9")).toEqual({ value: ["a"], impersonating: "u-9" });
    expect(withImpersonating({ scans: 2 }, null)).toEqual({ scans: 2 });
  });

  it("stores a snapshot of the actor so the row survives the account's deletion", async () => {
    created.rows = [];
    await writeAuditRecord({ actorId: "admin-1", action: "user.ban", targetType: "user", targetId: "u-2" });
    await writeAuditRecord({ actorId: null, action: "system.cleanup", targetType: "scan" });
    expect(created.rows[0]).toMatchObject({ actorId: "admin-1", actorName: "Admin One", actorRole: "admin", action: "user.ban", actorDeleted: false });
    expect(created.rows[1]).toMatchObject({ actorId: null, actorName: null, actorRole: null, actorDeleted: false });
  });

  it("writes an account.delete row with no personal data", async () => {
    created.rows = [];
    await writeAuditRecord({ actorId: null, actorName: null, actorRole: null, actorDeleted: true, action: "account.delete", targetType: "user", targetId: "u-gone", ip: null });
    expect(created.rows[0]).toEqual({
      actorId: null,
      actorName: null,
      actorRole: null,
      actorDeleted: true,
      action: "account.delete",
      targetType: "user",
      targetId: "u-gone",
      meta: undefined,
      ip: null,
    });
  });
});

describe("audit transaction behaviour", () => {
  it("without a transaction a failed insert is logged and swallowed", async () => {
    created.fail = true;
    logged.errors = [];
    await expect(writeAuditRecord({ actorId: null, action: "x.y", targetType: "scan" })).resolves.toBeUndefined();
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0][0]).toBe("audit.write_failed");
    expect(logged.errors[0][1]).toMatchObject({ action: "x.y" });
    created.fail = false;
  });

  it("inside the caller's transaction a failed insert is rethrown, so the transaction fails loudly", async () => {
    logged.errors = [];
    await expect(writeAuditRecord({ actorId: null, action: "x.y", targetType: "scan" }, failingTx())).rejects.toThrow(
      "insert failed inside the transaction",
    );
    expect(logged.errors).toHaveLength(0); // the caller's transaction fails; nothing is swallowed or logged here
  });

  it("a successful insert inside a transaction goes through the transaction client", async () => {
    const rows: unknown[] = [];
    const tx = {
      user: { findUnique: async () => ({ name: "T", role: null }) },
      auditLog: { create: async ({ data }: { data: unknown }) => rows.push(data) },
    } as unknown as Parameters<typeof writeAuditRecord>[1];
    created.rows = [];
    await writeAuditRecord({ actorId: "u-1", action: "scan.finalize", targetType: "scan", targetId: "s-1" }, tx);
    expect(rows).toHaveLength(1);
    expect(created.rows).toHaveLength(0);
  });
});

describe("U+0000 is stripped before insert", () => {
  it("from strings, nested meta (keys and values) and the actor snapshot", async () => {
    expect(stripNul("a\u0000b\u0000")).toBe("ab");
    expect(stripNul("plain")).toBe("plain");
    expect(sanitizeAuditMeta({ "k\u0000": "v\u0000", list: ["x\u0000", 1, null, { deep: "d\u0000" }], n: 2, b: true, z: null })).toEqual({
      k: "v",
      list: ["x", 1, null, { deep: "d" }],
      n: 2,
      b: true,
      z: null,
    });
    expect(sanitizeAuditMeta("only\u0000string")).toBe("onlystring");
    expect(sanitizeAuditMeta(undefined)).toBeUndefined();

    created.rows = [];
    await writeAuditRecord({ actorId: "nul-1", action: "scan.notes\u0000", targetType: "scan", targetId: "s\u00001", meta: { note: "a\u0000b" }, ip: "1.2.3.4" });
    await writeAuditRecord({ actorId: null, actorName: "Given\u0000Name", action: "x", targetType: "y" });
    expect(created.rows[0]).toMatchObject({ actorName: "Admin", action: "scan.notes", targetId: "s1", meta: { note: "ab" } });
    expect(created.rows[1]).toMatchObject({ actorName: "GivenName" });
    expect(JSON.stringify(created.rows)).not.toContain("\\u0000");
  });
});
