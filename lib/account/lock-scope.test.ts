import { beforeEach, describe, expect, it, vi } from "vitest";

type M = { id: string; userId: string; organizationId: string; role: string; email: string };
const db = vi.hoisted(() => ({ users: new Map<string, string>(), members: [] as M[], reads: 0 }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        db.reads += 1;
        return db.users.has(where.id) ? { role: db.users.get(where.id) } : null;
      },
    },
    member: {
      findFirst: async ({
        where,
      }: {
        where: { id?: string; userId?: string; organizationId: string; user?: { email: { equals: string } } };
      }) => {
        db.reads += 1;
        const m = db.members.find(
          (x) =>
            x.organizationId === where.organizationId &&
            (where.id === undefined || x.id === where.id) &&
            (where.userId === undefined || x.userId === where.userId) &&
            (where.user === undefined || x.email === where.user.email.equals.toLowerCase()),
        );
        return m ? { role: m.role } : null;
      },
    },
  },
}));

const { accountLockDecision, roleList } = await import("./lock-scope");

const LOCK = { lock: true, check: null };
const NO = { lock: false };
const trainee = { userId: "t1", activeOrganizationId: null, platformAdmin: false };
const owner = { userId: "o1", activeOrganizationId: "org-a", platformAdmin: false };
const admin = { userId: "a1", activeOrganizationId: null, platformAdmin: true };

beforeEach(() => {
  db.reads = 0;
  db.users = new Map([
    ["a1", "admin"],
    ["a2", "admin"],
    ["u1", "user"],
  ]);
  db.members = [
    { id: "m-o1", userId: "o1", organizationId: "org-a", role: "owner", email: "o1@example.com" },
    { id: "m-o2", userId: "o2", organizationId: "org-a", role: "owner", email: "o2@example.com" },
    { id: "m-ad", userId: "ad", organizationId: "org-a", role: "admin", email: "ad@example.com" },
    { id: "m-t1", userId: "t1", organizationId: "org-a", role: "trainee", email: "t1@example.com" },
    { id: "m-x", userId: "x1", organizationId: "org-b", role: "owner", email: "x1@example.com" },
  ];
});

describe("who waits for the account lock (review round 2: never any signed-in user)", () => {
  it("a trainee or a non-owner never takes it, whatever the body says", async () => {
    expect(await accountLockDecision("/organization/leave", { organizationId: "does-not-exist" }, trainee)).toEqual(NO);
    expect(await accountLockDecision("/organization/leave", { organizationId: "org-a" }, trainee)).toEqual(NO);
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "m-o1", organizationId: "org-a" }, trainee)).toEqual(NO);
    const manager = { userId: "ad", activeOrganizationId: "org-a", platformAdmin: false };
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "m-o1" }, manager)).toEqual(NO);
    expect(await accountLockDecision("/organization/update-member-role", { memberId: "m-o1", role: "admin" }, manager)).toEqual(NO);
    expect(await accountLockDecision("/organization/leave", {}, trainee)).toEqual(NO); // no read at all
  });

  it("an owner leaving, or removing / demoting another owner, takes it", async () => {
    expect(await accountLockDecision("/organization/leave", { organizationId: "org-a" }, owner)).toEqual(LOCK);
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "m-o2" }, owner)).toEqual(LOCK);
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "O2@Example.com" }, owner)).toEqual(LOCK);
    expect(await accountLockDecision("/organization/update-member-role", { memberId: "m-o2", role: ["admin"] }, owner)).toEqual(LOCK);
    expect(await accountLockDecision("/organization/update-member-role", { memberId: "m-o1", role: "examiner,admin" }, owner)).toEqual(LOCK);
  });

  it("an owner changing a non-owner, keeping an owner an owner, or naming another institution's member does not", async () => {
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "m-t1" }, owner)).toEqual(NO);
    expect(await accountLockDecision("/organization/update-member-role", { memberId: "m-t1", role: "owner" }, owner)).toEqual(NO);
    expect(await accountLockDecision("/organization/update-member-role", { memberId: "m-o2", role: "admin,owner" }, owner)).toEqual(NO);
    expect(await accountLockDecision("/organization/remove-member", { memberIdOrEmail: "m-x" }, owner)).toEqual(NO);
    expect(await accountLockDecision("/organization/leave", { organizationId: "org-b" }, owner)).toEqual(NO);
  });

  it("admin endpoints: only platform admins, and set-role / ban-user only when a platform admin would lose admin", async () => {
    expect(await accountLockDecision("/admin/remove-user", { userId: "u1" }, trainee)).toEqual(NO);
    expect(await accountLockDecision("/admin/remove-user", { userId: "u1" }, admin)).toEqual({
      lock: true,
      check: "deletion",
      targetUserId: "u1",
    });
    const lastAdmin = { lock: true, check: "last_admin", targetUserId: "a2" };
    expect(await accountLockDecision("/admin/set-role", { userId: "a2", role: "user" }, admin)).toEqual(lastAdmin);
    expect(await accountLockDecision("/admin/set-role", { userId: "a1", role: ["user"] }, admin)).toEqual({ ...lastAdmin, targetUserId: "a1" });
    expect(await accountLockDecision("/admin/set-role", { userId: "a2", role: "user,admin" }, admin)).toEqual(NO);
    expect(await accountLockDecision("/admin/set-role", { userId: "u1", role: "user" }, admin)).toEqual(NO);
    expect(await accountLockDecision("/admin/set-role", { userId: "a2", role: "user" }, trainee)).toEqual(NO);
    expect(await accountLockDecision("/admin/ban-user", { userId: "a2" }, admin)).toEqual(lastAdmin);
    expect(await accountLockDecision("/admin/ban-user", { userId: "u1" }, admin)).toEqual(NO);
    expect(await accountLockDecision("/admin/ban-user", { userId: "a1" }, admin)).toEqual(NO); // self: Better Auth refuses
    expect(await accountLockDecision("/admin/ban-user", { userId: "a2" }, trainee)).toEqual(NO);
    expect(db.reads).toBe(5); // one user read per possible target; non-admins, self-bans and "still admin" cost none
  });

  it("other paths never lock", async () => {
    expect(await accountLockDecision("/organization/accept-invitation", { invitationId: "i" }, owner)).toEqual(NO);
  });
});

describe("roleList", () => {
  it("reads Better Auth role values", () => {
    expect(roleList("owner")).toEqual(["owner"]);
    expect(roleList(" admin , owner ")).toEqual(["admin", "owner"]);
    expect(roleList(["examiner", "admin,owner"])).toEqual(["examiner", "admin", "owner"]);
    expect(roleList(undefined)).toEqual([]);
    expect(roleList([1, null])).toEqual([]);
  });
});
