import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  session: null as null | { user: { id: string }; session: { impersonatedBy: string | null } },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }));
vi.mock("@/lib/session", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ name: `name-${where.id}`, role: where.id === "admin-1" ? "admin" : "user" }) },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.rows.push(data);
        return data;
      },
    },
  },
}));

const { writeAudit } = await import("./audit");

describe("writeAudit", () => {
  const impersonation = { user: { id: "u-9" }, session: { impersonatedBy: "admin-1" } };
  beforeEach(() => {
    state.rows = [];
    state.session = null;
  });

  it("names the admin as actor while impersonating (AuthContext)", async () => {
    await writeAudit(impersonation, "scan.finalize", { type: "scan", id: "s-1" }, { score: 80 });
    expect(state.rows[0]).toMatchObject({
      actorId: "admin-1",
      actorName: "name-admin-1",
      actorRole: "admin",
      action: "scan.finalize",
      targetId: "s-1",
      meta: { score: 80, impersonating: "u-9" },
      ip: "203.0.113.9",
    });
  });

  it("applies the same rule to a bare user from the impersonated session", async () => {
    state.session = impersonation;
    await writeAudit({ id: "u-9" }, "scan.delete", { type: "scan", id: "s-2" });
    expect(state.rows[0]).toMatchObject({ actorId: "admin-1", meta: { impersonating: "u-9" } });
  });

  it("keeps the user as actor without impersonation", async () => {
    state.session = { user: { id: "u-9" }, session: { impersonatedBy: null } };
    await writeAudit({ user: { id: "u-9" }, session: { impersonatedBy: null } }, "scan.finalize", { type: "scan", id: "s-3" });
    await writeAudit("u-9", "scan.finalize", { type: "scan", id: "s-4" });
    expect(state.rows.map((r) => [r.actorId, r.meta])).toEqual([
      ["u-9", undefined],
      ["u-9", undefined],
    ]);
  });
});
