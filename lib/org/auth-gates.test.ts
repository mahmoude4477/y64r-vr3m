import { beforeEach, describe, expect, it, vi } from "vitest";

// The server rules for Better Auth's organization endpoints (lib/org/auth-gates.ts) with a fake Prisma client.
const db = vi.hoisted(() => ({
  teams: new Map<string, { organizationId: string; name: string }>(),
  slugs: new Map<string, string>(),
  members: [] as Array<{ userId: string; organizationId: string; role: string }>,
  invitations: new Map<string, { role: string; organizationId: string }>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    team: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const t = db.teams.get(where.id);
        return t ? { organizationId: t.organizationId } : null;
      },
      findMany: async ({ where }: { where: { organizationId: string } }) =>
        [...db.teams.entries()].filter(([, t]) => t.organizationId === where.organizationId).map(([id, t]) => ({ id, name: t.name })),
    },
    organization: {
      findUnique: async ({ where }: { where: { slug: string } }) => (db.slugs.has(where.slug) ? { id: db.slugs.get(where.slug) } : null),
    },
    member: {
      findMany: async ({ where }: { where: { userId: string; organizationId: { in: string[] } } }) =>
        db.members.filter((m) => m.userId === where.userId && where.organizationId.in.includes(m.organizationId)),
      findFirst: async ({ where }: { where: { userId: string; organizationId: string } }) =>
        db.members.find((m) => m.userId === where.userId && m.organizationId === where.organizationId) ?? null,
    },
    invitation: {
      findUnique: async ({ where }: { where: { id: string } }) => db.invitations.get(where.id) ?? null,
    },
  },
}));

const {
  cancelInvitationRefusal,
  departmentNameRefusal,
  isGatedOrgRead,
  isOrgRoleValue,
  orgProfileRefusal,
  orgReadAllowed,
  orgReadRefusal,
  orgRoleRefusal,
  readTargetOrganizations,
  teamAuthGateRefusal,
} = await import("./auth-gates");

/** "ab" followed by a lot of whitespace that String.prototype.trim (so zod .trim()) removes (R2-SEC-1). */
const PADDED = [
  "ab" + " ".repeat(10_000),
  "ab" + "\u3000".repeat(10_000),
  "ab" + "\n".repeat(10_000),
  "ab" + "\u00a0".repeat(10_000),
  " ".repeat(10_000) + "مستشفى",
  "مستشفى\t",
];

beforeEach(() => {
  db.teams = new Map([
    ["t-a", { organizationId: "org-a", name: "قسم الطوارئ" }],
    ["t-a2", { organizationId: "org-a", name: "قسم المختبر" }],
    ["t-b", { organizationId: "org-b", name: "قسم الطوارئ" }],
  ]);
  db.slugs = new Map([["hospital-b", "org-b"]]);
  db.members = [
    { userId: "owner", organizationId: "org-a", role: "owner" },
    { userId: "admin", organizationId: "org-a", role: "admin" },
    { userId: "examiner", organizationId: "org-a", role: "examiner" },
    { userId: "trainee", organizationId: "org-a", role: "trainee" },
    { userId: "admin", organizationId: "org-b", role: "trainee" },
  ];
  db.invitations = new Map([
    ["inv-owner", { role: "owner", organizationId: "org-a" }],
    ["inv-mixed", { role: "admin,owner", organizationId: "org-a" }],
    ["inv-examiner", { role: "examiner", organizationId: "org-a" }],
  ]);
});

describe("organization reads", () => {
  it("members and departments are for staff, invitations and the full organization for managers", () => {
    const roles = ["owner", "admin", "examiner", "trainee", "member", null];
    const allowed = (path: string) => roles.map((r) => orgReadAllowed(path, r));
    expect(allowed("/organization/list-members")).toEqual([true, true, true, false, false, false]);
    expect(allowed("/organization/list-teams")).toEqual([true, true, true, false, false, false]);
    expect(allowed("/organization/list-team-members")).toEqual([true, true, true, false, false, false]);
    expect(allowed("/organization/list-invitations")).toEqual([true, true, false, false, false, false]);
    expect(allowed("/organization/get-full-organization")).toEqual([true, true, false, false, false, false]);
    expect(orgReadAllowed("/organization/list-members", "trainee,examiner")).toBe(true); // strongest role wins
    expect(isGatedOrgRead("/organization/get-invitation")).toBe(false);
    expect(orgReadAllowed("/organization/get-active-member", "trainee")).toBe(true);
  });

  it("resolves the institution the way Better Auth does", async () => {
    const session = { activeOrganizationId: "org-a", activeTeamId: "t-b" };
    expect(await readTargetOrganizations("/organization/list-members", {}, session)).toEqual(["org-a"]);
    expect(await readTargetOrganizations("/organization/list-members", { organizationId: "org-b" }, session)).toEqual(["org-b"]);
    expect(await readTargetOrganizations("/organization/list-members", { organizationSlug: "hospital-b" }, session)).toEqual(["org-b"]);
    expect(await readTargetOrganizations("/organization/get-full-organization", { organizationSlug: "hospital-b", organizationId: "org-a" }, session)).toEqual(
      ["org-b", "org-a"],
    );
    // list-invitations ignores the slug: the active institution is the one read.
    expect(await readTargetOrganizations("/organization/list-invitations", { organizationSlug: "hospital-b" }, session)).toEqual(["org-a"]);
    expect(await readTargetOrganizations("/organization/list-team-members", { teamId: "t-a" }, session)).toEqual(["org-a"]);
    expect(await readTargetOrganizations("/organization/list-team-members", {}, session)).toEqual(["org-b"]); // the active team
    expect(await readTargetOrganizations("/organization/list-members", {}, { activeOrganizationId: null })).toEqual([]);
  });

  it("refuses trainees and examiners what the pages do not show them", async () => {
    const read = (userId: string, path: string, query: unknown = { organizationId: "org-a" }) =>
      orgReadRefusal({ path, query, userId, session: { activeOrganizationId: "org-a" } });
    expect(await read("trainee", "/organization/list-members")).toMatchObject({ status: "FORBIDDEN", code: "YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS" });
    expect(await read("trainee", "/organization/get-full-organization")).not.toBeNull();
    expect(await read("examiner", "/organization/list-members")).toBeNull();
    expect(await read("examiner", "/organization/list-invitations")).not.toBeNull();
    expect(await read("examiner", "/organization/get-full-organization")).not.toBeNull();
    expect(await read("admin", "/organization/list-invitations")).toBeNull();
    expect(await read("owner", "/organization/get-full-organization")).toBeNull();
    // An admin of A who is a trainee of B cannot read B's members by naming it.
    expect(await read("admin", "/organization/list-members", { organizationId: "org-b" })).not.toBeNull();
    expect(await read("admin", "/organization/list-members", { organizationSlug: "hospital-b" })).not.toBeNull();
    // Not a member at all: refused too (Better Auth would refuse it anyway).
    expect(await read("stranger", "/organization/list-members")).not.toBeNull();
    // Nothing to resolve, or not a gated read: left to Better Auth.
    expect(await orgReadRefusal({ path: "/organization/list-members", query: {}, userId: "trainee", session: {} })).toBeNull();
    expect(await read("trainee", "/organization/get-active-member")).toBeNull();
  });
});

describe("institution profile writes", () => {
  it("update accepts only the edit form's fields, each valid", () => {
    expect(orgProfileRefusal("/organization/update", { organizationId: "org-a", data: { name: "مستشفى الاختبار", nameEn: "", type: "hospital" } })).toBeNull();
    expect(orgProfileRefusal("/organization/update", { data: { nameEn: null } })).toBeNull();
    expect(orgProfileRefusal("/organization/update", { data: { nameEn: "x".repeat(121) } })).toMatchObject({ code: "INVALID_INPUT" });
    expect(orgProfileRefusal("/organization/update", { data: { name: "x" } })).toMatchObject({ code: "INVALID_INPUT" });
    expect(orgProfileRefusal("/organization/update", { data: { name: "   " } })).toMatchObject({ code: "INVALID_INPUT" });
    expect(orgProfileRefusal("/organization/update", { data: { name: "مستشفى\u0000" } })).toMatchObject({ code: "INVALID_INPUT" });
    expect(orgProfileRefusal("/organization/update", { data: { type: "bogus" } })).toMatchObject({ code: "INVALID_INPUT" });
    for (const value of PADDED) {
      expect(orgProfileRefusal("/organization/update", { data: { name: value } }), JSON.stringify(value.slice(0, 8))).toMatchObject({ code: "INVALID_INPUT" });
      expect(orgProfileRefusal("/organization/update", { data: { nameEn: value } }), JSON.stringify(value.slice(0, 8))).toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(orgProfileRefusal("/organization/update", { data: { nameEn: " ".repeat(5000) } })).toMatchObject({ code: "INVALID_INPUT" });
    for (const field of ["slug", "logo", "metadata", "suspended"]) {
      expect(orgProfileRefusal("/organization/update", { data: { [field]: "x" } })).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    }
  });

  it("create checks the names and the type, and leaves the other fields to Better Auth", () => {
    const ok = { name: "مستشفى الاختبار", nameEn: "Test Hospital", type: "hospital", slug: "e2e-x", keepCurrentActiveOrganization: true };
    expect(orgProfileRefusal("/organization/create", ok)).toBeNull();
    expect(orgProfileRefusal("/organization/create", { ...ok, nameEn: undefined, type: undefined })).toBeNull();
    expect(orgProfileRefusal("/organization/create", { ...ok, name: "x".repeat(5000) })).toMatchObject({ code: "INVALID_INPUT" });
    expect(orgProfileRefusal("/organization/create", { ...ok, type: "clinic" })).toMatchObject({ code: "INVALID_INPUT" });
    for (const value of PADDED) {
      expect(orgProfileRefusal("/organization/create", { ...ok, name: value })).toMatchObject({ code: "INVALID_INPUT" });
      expect(orgProfileRefusal("/organization/create", { ...ok, nameEn: value })).toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(orgProfileRefusal("/organization/list-members", { name: "" })).toBeNull();
  });
});

describe("department names", () => {
  it("create-team: a valid name that no other department of the institution has", async () => {
    expect(await departmentNameRefusal("/organization/create-team", { name: "قسم الأشعة", organizationId: "org-a" }, null)).toBeNull();
    expect(await departmentNameRefusal("/organization/create-team", { name: "قسم الطوارئ" }, "org-a")).toMatchObject({ code: "DEPARTMENT_NAME_TAKEN" });
    // Not in the stored form (padding, doubled inner spaces): refused before the duplicate check.
    expect(await departmentNameRefusal("/organization/create-team", { name: "  قسم   الطوارئ " }, "org-a")).toMatchObject({ code: "INVALID_INPUT" });
    for (const value of PADDED) {
      expect(await departmentNameRefusal("/organization/create-team", { name: value, organizationId: "org-a" }, null)).toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(await departmentNameRefusal("/organization/update-team", { teamId: "t-a", data: { name: value } }, null)).toMatchObject({
        code: "INVALID_INPUT",
      });
    }
    expect(await departmentNameRefusal("/organization/create-team", { name: "", organizationId: "org-a" }, null)).toMatchObject({ code: "INVALID_INPUT" });
    expect(await departmentNameRefusal("/organization/create-team", { name: "x".repeat(81), organizationId: "org-a" }, null)).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(await departmentNameRefusal("/organization/create-team", { name: 42, organizationId: "org-a" }, null)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("update-team: the team's own institution decides, and keeping its own name is fine", async () => {
    expect(await departmentNameRefusal("/organization/update-team", { teamId: "t-a", data: { name: "قسم الطوارئ" } }, "org-b")).toBeNull();
    expect(await departmentNameRefusal("/organization/update-team", { teamId: "t-a2", data: { name: "قسم الطوارئ" } }, "org-b")).toMatchObject({
      code: "DEPARTMENT_NAME_TAKEN",
    });
    expect(await departmentNameRefusal("/organization/update-team", { teamId: "t-a", data: { name: "x".repeat(5000) } }, null)).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(await departmentNameRefusal("/organization/update-team", { teamId: "t-a", data: {} }, null)).toBeNull();
    expect(await departmentNameRefusal("/organization/remove-team", { teamId: "t-a" }, null)).toBeNull();
  });
});

describe("roles", () => {
  it("only Waqaya's four institution roles", () => {
    expect(isOrgRoleValue("examiner")).toBe(true);
    expect(isOrgRoleValue("examiner,admin")).toBe(true);
    expect(isOrgRoleValue(["trainee", "examiner"])).toBe(true);
    expect(isOrgRoleValue("member")).toBe(false);
    expect(isOrgRoleValue("trainee,member")).toBe(false);
    expect(isOrgRoleValue([])).toBe(false);
    expect(isOrgRoleValue(7)).toBe(false);
    expect(orgRoleRefusal("/organization/update-member-role", { memberId: "m", role: "member" })).toMatchObject({ code: "ROLE_NOT_FOUND" });
    expect(orgRoleRefusal("/organization/invite-member", { email: "a@example.com", role: ["member"] })).toMatchObject({ code: "ROLE_NOT_FOUND" });
    expect(orgRoleRefusal("/organization/invite-member", { email: "a@example.com", role: "trainee" })).toBeNull();
    expect(orgRoleRefusal("/organization/create-team", { role: "member" })).toBeNull();
  });
});

describe("owner invitations", () => {
  it("only an owner of the institution cancels an invitation that gives the owner role", async () => {
    expect(await cancelInvitationRefusal({ invitationId: "inv-owner" }, "admin")).toMatchObject({
      status: "FORBIDDEN",
      code: "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
    });
    expect(await cancelInvitationRefusal({ invitationId: "inv-mixed" }, "admin")).not.toBeNull();
    expect(await cancelInvitationRefusal({ invitationId: "inv-owner" }, "owner")).toBeNull();
    expect(await cancelInvitationRefusal({ invitationId: "inv-examiner" }, "admin")).toBeNull();
    expect(await cancelInvitationRefusal({ invitationId: "missing" }, "admin")).toBeNull();
    expect(await cancelInvitationRefusal({}, "admin")).toBeNull();
  });
});

describe("teamAuthGateRefusal (the one call lib/auth.ts makes)", () => {
  const base = { query: {}, session: { activeOrganizationId: "org-a" }, platformAdmin: false };

  it("runs the value rules for everyone, platform admins included", async () => {
    const admin = { ...base, userId: "root", platformAdmin: true };
    expect(await teamAuthGateRefusal({ ...admin, path: "/organization/create", body: { name: "ab" + " ".repeat(10_000), slug: "x" } })).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(await teamAuthGateRefusal({ ...admin, path: "/organization/update-member-role", body: { memberId: "m", role: "member" } })).toMatchObject({
      code: "ROLE_NOT_FOUND",
    });
    expect(await teamAuthGateRefusal({ ...admin, path: "/update-user", body: { locale: "fr" } })).toMatchObject({ code: "INVALID_INPUT" });
    expect(await teamAuthGateRefusal({ ...base, userId: "owner", path: "/organization/create-team", body: { name: "قسم الطوارئ" } })).toMatchObject({
      code: "DEPARTMENT_NAME_TAKEN",
    });
  });

  it("runs the permission rules for members only", async () => {
    expect(await teamAuthGateRefusal({ ...base, userId: "trainee", path: "/organization/list-members", body: undefined })).toMatchObject({
      code: "YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS",
    });
    expect(await teamAuthGateRefusal({ ...base, userId: "admin", path: "/organization/cancel-invitation", body: { invitationId: "inv-owner" } })).toMatchObject({
      code: "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
    });
    expect(
      await teamAuthGateRefusal({ ...base, userId: "root", platformAdmin: true, path: "/organization/cancel-invitation", body: { invitationId: "inv-owner" } }),
    ).toBeNull();
    expect(await teamAuthGateRefusal({ ...base, userId: "examiner", path: "/organization/list-members", body: undefined })).toBeNull();
  });

  it("refuses signing sessions out while impersonating, and lets ordinary calls through", async () => {
    const acting = { ...base, userId: "trainee", session: { activeOrganizationId: "org-a", impersonatedBy: "root" } };
    for (const path of ["/revoke-other-sessions", "/revoke-sessions", "/revoke-session"]) {
      expect(await teamAuthGateRefusal({ ...acting, path, body: {} })).toMatchObject({ status: "FORBIDDEN", code: "NOT_WHILE_IMPERSONATING" });
      expect(await teamAuthGateRefusal({ ...base, userId: "trainee", path, body: {} })).toBeNull();
    }
    expect(await teamAuthGateRefusal({ ...base, userId: "owner", path: "/update-user", body: { name: "سارة", profession: null } })).toBeNull();
    expect(await teamAuthGateRefusal({ ...base, userId: "owner", path: "/get-session", body: undefined })).toBeNull();
  });
});
