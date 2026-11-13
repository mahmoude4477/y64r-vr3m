import { beforeEach, describe, expect, it, vi } from "vitest";

type U = { id: string; role: string | null; banned: boolean | null; banExpires: Date | null };
type M = { userId: string; organizationId: string; role: string };
const db = vi.hoisted(() => ({
  users: [] as U[],
  members: [] as M[],
  orgs: new Map<string, { name: string; nameEn: string | null }>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => db.users.find((u) => u.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { not: string }; role: { contains: string } } }) =>
        db.users.filter((u) => u.id !== where.id.not && (u.role ?? "").includes(where.role.contains)),
    },
    member: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        db.members
          .filter((m) => m.userId === where.userId)
          .map((m) => ({
            role: m.role,
            organization: {
              id: m.organizationId,
              ...db.orgs.get(m.organizationId)!,
              members: db.members.filter((x) => x.organizationId === m.organizationId && x.userId !== where.userId).map((x) => ({ role: x.role })),
            },
          })),
    },
  },
}));

const { deletionBlockers, hasRole, isActiveBan, isLastActivePlatformAdmin, soleOwnerOrganizations } = await import("./deletion-rules");

const user = (id: string, role: string | null = "user", banned: boolean | null = false, banExpires: Date | null = null): U => ({ id, role, banned, banExpires });

beforeEach(() => {
  db.users = [user("me"), user("other")];
  db.members = [];
  db.orgs = new Map([
    ["org-a", { name: "مستشفى أ", nameEn: "Hospital A" }],
    ["org-b", { name: "جامعة ب", nameEn: null }],
  ]);
});

describe("role helpers", () => {
  it("reads Better Auth multi-role strings", () => {
    expect(hasRole("owner", "owner")).toBe(true);
    expect(hasRole("admin, owner", "owner")).toBe(true);
    expect(hasRole("examiner", "owner")).toBe(false);
    expect(hasRole(null, "owner")).toBe(false);
  });

  it("an expired ban does not count", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(isActiveBan({ banned: true, banExpires: null }, now)).toBe(true);
    expect(isActiveBan({ banned: true, banExpires: new Date("2026-10-29T00:00:00Z") }, now)).toBe(true);
    expect(isActiveBan({ banned: true, banExpires: new Date("2026-10-27T00:00:00Z") }, now)).toBe(false);
    expect(isActiveBan({ banned: false, banExpires: null }, now)).toBe(false);
    expect(isActiveBan({ banned: null, banExpires: null }, now)).toBe(false);
  });

  it("soleOwnerOrganizations: only owners with other members and no co-owner", () => {
    const org = (id: string, members: string[]) => ({ id, name: id, nameEn: null, members: members.map((role) => ({ role })) });
    expect(
      soleOwnerOrganizations([
        { role: "owner", organization: org("alone", []) },
        { role: "owner", organization: org("stuck", ["trainee", "examiner"]) },
        { role: "owner", organization: org("co-owned", ["owner"]) },
        { role: "admin", organization: org("not-owner", ["trainee"]) },
        { role: "owner,admin", organization: org("multi", ["admin, trainee"]) },
      ]).map((o) => o.id),
    ).toEqual(["stuck", "multi"]);
  });
});

describe("deletionBlockers", () => {
  it("nothing blocks an ordinary member or a user with no institution", async () => {
    expect(await deletionBlockers("me")).toEqual([]);
    db.members = [
      { userId: "me", organizationId: "org-a", role: "trainee" },
      { userId: "other", organizationId: "org-a", role: "owner" },
    ];
    expect(await deletionBlockers("me")).toEqual([]);
  });

  it("the only owner of an institution with other members is blocked, with the institution named", async () => {
    db.members = [
      { userId: "me", organizationId: "org-a", role: "owner" },
      { userId: "other", organizationId: "org-a", role: "examiner" },
      { userId: "me", organizationId: "org-b", role: "owner" },
    ];
    expect(await deletionBlockers("me")).toEqual([
      { kind: "only_owner", organizations: [{ id: "org-a", name: "مستشفى أ", nameEn: "Hospital A" }] },
    ]);
  });

  it("a sole owner who is also the only member may delete; a co-owner may delete", async () => {
    db.members = [{ userId: "me", organizationId: "org-b", role: "owner" }];
    expect(await deletionBlockers("me")).toEqual([]);
    db.members = [
      { userId: "me", organizationId: "org-a", role: "owner" },
      { userId: "other", organizationId: "org-a", role: "owner" },
    ];
    expect(await deletionBlockers("me")).toEqual([]);
  });

  it("the last active platform admin is blocked; a banned or non-admin user does not count as another admin", async () => {
    db.users = [user("me", "admin"), user("banned-admin", "admin", true), user("superadmin-ish", "superadmin"), user("u", "user")];
    expect(await deletionBlockers("me")).toEqual([{ kind: "last_platform_admin" }]);

    db.users.push(user("expired-ban", "admin", true, new Date(Date.now() - 60_000)));
    expect(await deletionBlockers("me")).toEqual([]);
  });

  it("another active admin unblocks; both blockers can apply at once", async () => {
    db.users = [user("me", "admin"), user("other", "user,admin")];
    expect(await deletionBlockers("me")).toEqual([]);
    db.users = [user("me", "admin"), user("other")];
    db.members = [
      { userId: "me", organizationId: "org-a", role: "owner" },
      { userId: "other", organizationId: "org-a", role: "trainee" },
    ];
    expect((await deletionBlockers("me")).map((b) => b.kind)).toEqual(["only_owner", "last_platform_admin"]);
  });

  it("an unknown user has no blockers (already deleted)", async () => {
    expect(await deletionBlockers("ghost")).toEqual([]);
  });
});

describe("isLastActivePlatformAdmin (set-role and ban-user guard too)", () => {
  it("true only for an admin with no other active admin", async () => {
    db.users = [user("me", "admin"), user("b", "admin", true), user("u")];
    expect(await isLastActivePlatformAdmin("me")).toBe(true);
    expect(await isLastActivePlatformAdmin("u")).toBe(false); // not an admin: demoting or banning costs nothing
    expect(await isLastActivePlatformAdmin("ghost")).toBe(false);
    db.users.push(user("c", "admin"));
    expect(await isLastActivePlatformAdmin("me")).toBe(false);
    expect(await isLastActivePlatformAdmin("me", "user")).toBe(false); // the role the caller already read
  });
});
