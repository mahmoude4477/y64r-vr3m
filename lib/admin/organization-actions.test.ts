import { beforeEach, describe, expect, it, vi } from "vitest";

// Institution actions of the admin panel with every dependency mocked (no database, no session, no Better Auth):
// the row lock that serialises membership writes, and the audit row of an institution delete.

const ctx = { user: { id: "admin-1", email: "admin@example.test" }, session: { impersonatedBy: null } };
const calls: string[] = [];
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
  queryRaw: vi.fn(),
  memberFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  memberCreate: vi.fn(),
  memberDeleteMany: vi.fn(),
  teamMemberFindMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  orgFindUnique: vi.fn(),
  deleteOrganizationWithData: vi.fn(),
  logError: vi.fn(),
}));
const tx = {
  $queryRaw: (...args: unknown[]) => {
    calls.push("lock");
    return mocks.queryRaw(...args);
  },
  member: {
    findFirst: (...args: unknown[]) => {
      calls.push("member.findFirst");
      return mocks.memberFindFirst(...args);
    },
    findMany: (...args: unknown[]) => {
      calls.push("member.findMany");
      return mocks.memberFindMany(...args);
    },
    create: (...args: unknown[]) => {
      calls.push("member.create");
      return mocks.memberCreate(...args);
    },
    deleteMany: mocks.memberDeleteMany,
  },
  teamMember: { findMany: mocks.teamMemberFindMany },
  session: { updateMany: mocks.sessionUpdateMany },
};

vi.mock("@/lib/session", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/data-lifecycle", () => ({ deleteOrganizationWithData: mocks.deleteOrganizationWithData }));
vi.mock("@/lib/account/deletion-lock", () => ({
  AccountLockBusyError: class extends Error {},
  withAccountLock: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `t:${key}` }));
vi.mock("@/lib/log", () => ({ log: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: mocks.orgFindUnique },
    member: { findFirst: mocks.memberFindFirst },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { deleteOrganizationAction, joinOrganizationAction, removeMemberAction } = await import("./organization-actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockReset();
  calls.length = 0;
  mocks.requirePlatformAdmin.mockResolvedValue(ctx);
  mocks.queryRaw.mockResolvedValue([{ id: "o1" }]);
  mocks.teamMemberFindMany.mockResolvedValue([]);
});

describe("joinOrganizationAction", () => {
  it("locks the institution row before it checks for an existing membership and inserts", async () => {
    mocks.memberFindFirst.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue({ id: "m-new" });
    expect(await joinOrganizationAction("ar", { organizationId: "o1" })).toEqual({ ok: true });
    expect(calls).toEqual(["lock", "member.findFirst", "member.create"]);
    // SELECT … FOR UPDATE on that institution
    const [sql, id] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(sql.join("?")).toMatch(/FROM "organization" WHERE id = \? FOR UPDATE/);
    expect(id).toBe("o1");
    expect(mocks.writeAudit.mock.calls[0][1]).toBe("organization.member.add");
    expect(mocks.writeAudit.mock.calls[0][4]).toHaveProperty("tx");
  });

  it("refuses a second membership (the call that waited on the lock sees the first one's row)", async () => {
    mocks.memberFindFirst.mockResolvedValue({ id: "m-existing" });
    expect(await joinOrganizationAction("ar", { organizationId: "o1" })).toMatchObject({ ok: false, error: "alreadyMember" });
    expect(mocks.memberCreate).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("answers not found for an institution that does not exist", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    expect(await joinOrganizationAction("ar", { organizationId: "o1" })).toMatchObject({ ok: false, error: "notFound" });
    expect(calls).toEqual(["lock"]);
  });
});

describe("removeMemberAction", () => {
  it("locks the institution, then removes every row of that person", async () => {
    mocks.memberFindFirst.mockResolvedValue({ role: "owner" });
    mocks.memberFindMany.mockResolvedValue([
      { id: "a1", role: "owner", userId: "admin-1" },
      { id: "a2", role: "owner", userId: "admin-1" },
      { id: "o2", role: "owner", userId: "u2" },
    ]);
    expect(await removeMemberAction("ar", { organizationId: "o1", memberId: "a1" })).toEqual({ ok: true });
    expect(calls).toEqual(["lock", "member.findMany"]);
    expect(mocks.memberDeleteMany).toHaveBeenCalledWith({ where: { organizationId: "o1", userId: "admin-1" } });
  });

  it("keeps the last owner even when that person has a duplicate row", async () => {
    mocks.memberFindFirst.mockResolvedValue({ role: "owner" });
    mocks.memberFindMany.mockResolvedValue([
      { id: "a1", role: "owner", userId: "admin-1" },
      { id: "a2", role: "owner", userId: "admin-1" },
      { id: "m1", role: "trainee", userId: "u1" },
    ]);
    expect(await removeMemberAction("ar", { organizationId: "o1", memberId: "a1" })).toMatchObject({ ok: false, error: "lastOwner" });
    expect(mocks.memberDeleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteOrganizationAction", () => {
  const org = { name: "مؤسسة", nameEn: "Institution", _count: { members: 2, scans: 3 } };

  /** Like the real deleteOrganizationWithData: the audit callback runs inside its transaction; a failure rejects. */
  const deleteRunningAudit = async (_id: string, options?: { audit?: (tx: unknown, purged: { scans: number; attempts: number }) => Promise<void> }) => {
    await options?.audit?.("tx", { scans: 3, attempts: 0 });
    return true;
  };

  it("writes organization.delete inside the delete's transaction", async () => {
    mocks.orgFindUnique.mockResolvedValue(org);
    mocks.deleteOrganizationWithData.mockImplementation(deleteRunningAudit);
    expect(await deleteOrganizationAction("en", { organizationId: "o1", confirmName: "Institution" })).toEqual({ ok: true });
    const call = mocks.writeAudit.mock.calls[0];
    expect(call.slice(0, 4)).toEqual([
      ctx,
      "organization.delete",
      { type: "organization", id: "o1" },
      { name: "مؤسسة", nameEn: "Institution", members: 2, scans: 3 },
    ]);
    expect(call[4]).toEqual({ tx: "tx" });
  });

  it("a failed audit row fails the whole delete (one transaction) with the generic error", async () => {
    mocks.orgFindUnique.mockResolvedValue(org);
    mocks.deleteOrganizationWithData.mockImplementation(deleteRunningAudit);
    mocks.writeAudit.mockRejectedValue(new Error("audit insert failed"));
    expect(await deleteOrganizationAction("en", { organizationId: "o1", confirmName: "مؤسسة" })).toMatchObject({ ok: false, error: "generic" });
    expect(mocks.logError).toHaveBeenCalledWith("admin.organization.delete_failed", expect.anything());
  });

  it("deletes nothing when the typed name does not match", async () => {
    mocks.orgFindUnique.mockResolvedValue(org);
    expect(await deleteOrganizationAction("en", { organizationId: "o1", confirmName: "Other" })).toMatchObject({ ok: false, error: "confirmMismatch" });
    expect(mocks.deleteOrganizationWithData).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
