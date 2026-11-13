import { describe, expect, it, vi } from "vitest";

// The where-clause builders are pure; the database is never touched here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { activityLookups, organizationListWhere, orgTypeOf, toActivityRows, userListWhere } = await import("./queries");

const NOW = new Date("2026-10-29T12:00:00Z");

describe("user list filters", () => {
  it("is empty without filters", () => {
    expect(userListWhere({ q: "", role: "all", status: "all" }, NOW)).toEqual({});
  });

  it("searches name and e-mail without case", () => {
    expect(userListWhere({ q: "huda", role: "all", status: "all" }, NOW)).toEqual({
      AND: [{ OR: [{ name: { contains: "huda", mode: "insensitive" } }, { email: { contains: "huda", mode: "insensitive" } }] }],
    });
  });

  it("filters platform roles (users include accounts without a role)", () => {
    expect(userListWhere({ q: "", role: "admin", status: "all" }, NOW)).toEqual({ AND: [{ role: { contains: "admin" } }] });
    expect(userListWhere({ q: "", role: "user", status: "all" }, NOW)).toEqual({
      AND: [{ OR: [{ role: null }, { NOT: { role: { contains: "admin" } } }] }],
    });
  });

  it("treats only bans in force as banned, and expired bans as active", () => {
    expect(userListWhere({ q: "", role: "all", status: "banned" }, NOW)).toEqual({
      AND: [{ banned: true, OR: [{ banExpires: null }, { banExpires: { gt: NOW } }] }],
    });
    expect(userListWhere({ q: "", role: "all", status: "active" }, NOW)).toEqual({
      AND: [{ emailVerified: true }, { OR: [{ banned: false }, { banned: null }, { banExpires: { lte: NOW } }] }],
    });
    expect(userListWhere({ q: "", role: "all", status: "unverified" }, NOW)).toEqual({ AND: [{ emailVerified: false }] });
  });
});

describe("institution list filters", () => {
  it("searches both names and the slug", () => {
    const where = organizationListWhere({ q: "fahd", status: "all" }, "admin-1");
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "fahd", mode: "insensitive" } },
            { nameEn: { contains: "fahd", mode: "insensitive" } },
            { slug: { contains: "fahd", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("filters by status, including institutions without an owner", () => {
    expect(organizationListWhere({ q: "", status: "suspended" }, "admin-1")).toEqual({ AND: [{ suspended: true }] });
    expect(organizationListWhere({ q: "", status: "active" }, "admin-1")).toEqual({ AND: [{ OR: [{ suspended: false }, { suspended: null }] }] });
    expect(organizationListWhere({ q: "", status: "no_owner" }, "admin-1")).toEqual({ AND: [{ members: { none: { role: { contains: "owner" } } } }] });
  });

  it("lists the institutions the viewing admin belongs to", () => {
    expect(organizationListWhere({ q: "", status: "mine" }, "admin-1")).toEqual({ AND: [{ members: { some: { userId: "admin-1" } } }] });
  });

  it("knows the institution types", () => {
    expect(orgTypeOf("hospital")).toBe("hospital");
    expect(orgTypeOf("clinic")).toBeNull();
    expect(orgTypeOf(null)).toBeNull();
  });
});

describe("overview activity", () => {
  const base = { createdAt: NOW, actorName: "مدير المنصة", actorDeleted: false, actor: { name: "مدير المنصة" } };
  const stop = { ...base, id: "a1", action: "auth.admin.stop-impersonating", actorId: "admin-1", targetType: "user", targetId: "admin-1", meta: { impersonating: "u-9" } };
  const ban = { ...base, id: "a2", action: "auth.admin.ban-user", actorId: "admin-1", targetType: "user", targetId: "u-3", meta: { userId: "u-3", impersonating: "u-9" } };
  const org = { ...base, id: "a3", action: "organization.suspend", actorId: "admin-1", targetType: "organization", targetId: "o-1", meta: {} };

  it("looks up targets and the user an admin was acting as", () => {
    expect(activityLookups([stop, ban, org])).toEqual({ userIds: ["admin-1", "u-9", "u-3"], orgIds: ["o-1"] });
  });

  it("names the user the admin was acting as, and drops a target that is the actor itself", () => {
    const users = new Map([["admin-1", "مدير المنصة"], ["u-9", "ضحية"], ["u-3", "Huda"]]);
    const [stopRow, banRow, orgRow] = toActivityRows([stop, ban, org], users, new Map([["o-1", { name: "مؤسسة أ", nameEn: null }]]));
    expect(stopRow.target).toBeNull();
    expect(stopRow.impersonating).toEqual({ id: "u-9", name: "ضحية", exists: true });
    expect(banRow.target).toEqual({ type: "user", id: "u-3", name: "Huda", exists: true });
    expect(banRow.impersonating).toEqual({ id: "u-9", name: "ضحية", exists: true });
    expect(orgRow.target).toEqual({ type: "organization", id: "o-1", name: "مؤسسة أ", nameEn: null, exists: true });
    expect(orgRow.impersonating).toBeNull();
  });

  it("keeps a deleted impersonated account anonymous", () => {
    const [row] = toActivityRows([stop], new Map([["admin-1", "مدير المنصة"]]), new Map());
    expect(row.impersonating).toEqual({ id: "u-9", name: null, exists: false });
  });
});
