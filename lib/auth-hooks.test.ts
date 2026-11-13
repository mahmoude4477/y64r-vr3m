import { describe, expect, it, vi } from "vitest";

// A small in-memory world: org-a is active and not suspended, org-c is suspended.
const world = vi.hoisted(() => ({
  suspended: new Set(["org-c"]),
  invitations: new Map([
    ["inv-1", "org-from-invitation"],
    ["inv-c", "org-c"],
  ]),
  teams: new Map([
    ["team-a", "org-a"],
    ["team-c", "org-c"],
  ]),
  slugs: new Map([["h", "org-from-slug"]]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invitation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const organizationId = world.invitations.get(where.id);
        return organizationId ? { organizationId } : null;
      },
    },
    team: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const organizationId = world.teams.get(where.id);
        return organizationId ? { organizationId } : null;
      },
    },
    organization: {
      findUnique: async ({ where }: { where: { slug: string } }) => {
        const id = world.slugs.get(where.slug);
        return id ? { id } : null;
      },
      findFirst: async ({ where }: { where: { id: { in: string[] }; suspended: boolean } }) => {
        const id = where.id.in.find((o) => world.suspended.has(o) === where.suspended);
        return id ? { id } : null;
      },
    },
  },
}));

const { authAuditEntry, blockedByMustChangePassword, isGatedAuthPath, isOrganizationWrite, resolveTargetOrganizations, suspendedWriteTarget } =
  await import("./auth-hooks");

const adminSession = { user: { id: "admin-1" }, session: { impersonatedBy: null, activeOrganizationId: "org-1" } };

describe("Better Auth gates", () => {
  it("public auth flows and the password change are never gated", () => {
    for (const path of ["/sign-in/email", "/sign-up/email", "/get-session", "/sign-out", "/change-password", "/email-otp/verify-email", "/email-otp/reset-password"]) {
      expect(isGatedAuthPath(path)).toBe(false);
      expect(blockedByMustChangePassword(path)).toBe(false);
    }
  });

  it("mustChangePassword blocks admin, organization and profile endpoints", () => {
    for (const path of ["/admin/set-role", "/admin/impersonate-user", "/organization/invite-member", "/update-user", "/list-sessions"]) {
      expect(blockedByMustChangePassword(path)).toBe(true);
    }
    expect(blockedByMustChangePassword("/admin/stop-impersonating")).toBe(false);
  });

  it("classifies organization writes (blocked while suspended)", () => {
    for (const path of ["/organization/invite-member", "/organization/update-member-role", "/organization/create-team", "/organization/set-active", "/organization/accept-invitation", "/organization/delete"]) {
      expect(isOrganizationWrite(path)).toBe(true);
    }
    for (const path of ["/organization/list-members", "/organization/get-full-organization", "/organization/leave", "/organization/reject-invitation", "/organization/create", "/organization/has-permission", "/admin/set-role"]) {
      expect(isOrganizationWrite(path)).toBe(false);
    }
  });

  it("resolves the organization an endpoint targets, the way Better Auth does", async () => {
    expect(await resolveTargetOrganizations("/organization/invite-member", { email: "x@y.z" }, "org-active")).toEqual(["org-active"]);
    expect(await resolveTargetOrganizations("/organization/invite-member", { organizationId: "org-2" }, "org-active")).toEqual(["org-2"]);
    expect(await resolveTargetOrganizations("/organization/accept-invitation", { invitationId: "inv-1" }, null)).toEqual(["org-from-invitation"]);
    expect(await resolveTargetOrganizations("/organization/cancel-invitation", { invitationId: "inv-1" }, "org-active")).toEqual(["org-from-invitation"]);
    expect(await resolveTargetOrganizations("/organization/set-active", { organizationId: null }, "org-active")).toEqual([]);
    expect(await resolveTargetOrganizations("/organization/set-active", { organizationSlug: "h" }, null)).toEqual(["org-from-slug"]);
    // update-team reads body.data.organizationId (Better Auth ignores a top-level organizationId there)
    expect(await resolveTargetOrganizations("/organization/update-team", { teamId: "team-x", data: { organizationId: "org-2" } }, "org-active")).toEqual(["org-2"]);
    // team endpoints also check the team row's organization
    expect(await resolveTargetOrganizations("/organization/remove-team", { teamId: "team-c" }, "org-a")).toEqual(["org-a", "org-c"]);
  });

  it("refuses writes to a suspended institution for a manager of two institutions (active one not suspended)", async () => {
    const active = "org-a";
    // direct targets
    expect(await suspendedWriteTarget("/organization/create-team", { name: "x", organizationId: "org-c" }, active)).toBe("org-c");
    expect(await suspendedWriteTarget("/organization/invite-member", { email: "x@y.z", role: "trainee", organizationId: "org-c" }, active)).toBe("org-c");
    // round-2 bypasses: update-team via data.organizationId, cancel-invitation via the invitation row
    expect(await suspendedWriteTarget("/organization/update-team", { teamId: "team-c", data: { name: "n", organizationId: "org-c" } }, active)).toBe("org-c");
    expect(await suspendedWriteTarget("/organization/cancel-invitation", { invitationId: "inv-c" }, active)).toBe("org-c");
    // team id of the suspended institution, no organizationId in the body
    for (const path of ["/organization/update-team", "/organization/remove-team", "/organization/add-team-member", "/organization/remove-team-member"]) {
      expect(await suspendedWriteTarget(path, { teamId: "team-c", userId: "u-1", data: { name: "n" } }, active)).toBe("org-c");
    }
    // the working institution stays writable, reads are never refused
    expect(await suspendedWriteTarget("/organization/update-team", { teamId: "team-a", data: { name: "n" } }, active)).toBeNull();
    expect(await suspendedWriteTarget("/organization/invite-member", { email: "x@y.z", role: "trainee" }, active)).toBeNull();
    expect(await suspendedWriteTarget("/organization/list-members", { organizationId: "org-c" }, active)).toBeNull();
    // an active organization that is itself suspended blocks writes without an explicit target
    expect(await suspendedWriteTarget("/organization/update", { data: { name: "n" } }, "org-c")).toBe("org-c");
  });
});

describe("authAuditEntry", () => {
  it("audits admin actions with the target user and no secrets", () => {
    const e = authAuditEntry({
      path: "/admin/set-user-password",
      body: { userId: "u-2", newPassword: "hunter2hunter2" },
      returned: { status: true },
      session: adminSession,
    });
    expect(e).toEqual({ actorId: "admin-1", action: "auth.admin.set-user-password", targetType: "user", targetId: "u-2", meta: { userId: "u-2" } });
    expect(JSON.stringify(e)).not.toContain("hunter2");

    const revoke = authAuditEntry({ path: "/admin/revoke-user-session", body: { sessionToken: "secret-token" }, returned: { success: true }, session: adminSession });
    expect(JSON.stringify(revoke)).not.toContain("secret-token");

    const ban = authAuditEntry({ path: "/admin/ban-user", body: { userId: "u-3", banReason: "abuse", banExpiresIn: 3600 }, returned: {}, session: adminSession });
    expect(ban?.meta).toEqual({ userId: "u-3", banExpiresIn: 3600 }); // never the free-text reason
  });

  it("audits a user's own account changes only while an admin acts as them, without values", () => {
    const acting = { user: { id: "u-9" }, session: { impersonatedBy: "admin-1" } };
    const e = authAuditEntry({ path: "/update-user", body: { name: "New Name", locale: "en" }, returned: { status: true }, session: acting });
    expect(e).toEqual({
      actorId: "admin-1",
      action: "auth.user.update-user",
      targetType: "user",
      targetId: "u-9",
      meta: { impersonating: "u-9", fields: ["locale", "name"] },
    });
    expect(JSON.stringify(e)).not.toContain("New Name");
    const pw = authAuditEntry({ path: "/change-password", body: { currentPassword: "a-secret", newPassword: "b-secret" }, returned: {}, session: acting });
    expect(pw?.action).toBe("auth.user.change-password");
    expect(JSON.stringify(pw)).not.toContain("secret");
    // Without impersonation these stay the user's own business.
    expect(authAuditEntry({ path: "/update-user", body: { name: "x" }, returned: {}, session: { user: { id: "u-9" }, session: {} } })).toBeNull();
  });

  it("records the real admin as actor while impersonating", () => {
    const impersonated = { user: { id: "u-9" }, session: { impersonatedBy: "admin-1", activeOrganizationId: "org-1" } };
    const stop = authAuditEntry({ path: "/admin/stop-impersonating", body: {}, returned: { session: {} }, session: impersonated });
    expect(stop).toMatchObject({ actorId: "admin-1", targetId: "u-9", meta: { impersonating: "u-9" } });
    const remove = authAuditEntry({ path: "/organization/remove-member", body: { memberIdOrEmail: "a@b.c" }, returned: { member: { organizationId: "org-1" } }, session: impersonated });
    expect(remove).toMatchObject({ actorId: "admin-1", targetType: "organization", targetId: "org-1", meta: { impersonating: "u-9" } });
    expect(JSON.stringify(remove)).not.toContain("a@b.c"); // no e-mail addresses in audit meta
  });

  it("audits organization changes with the organization as target", () => {
    expect(
      authAuditEntry({ path: "/organization/update-member-role", body: { memberId: "m-1", role: "examiner" }, returned: { id: "m-1" }, session: adminSession }),
    ).toEqual({
      actorId: "admin-1",
      action: "auth.organization.update-member-role",
      targetType: "organization",
      targetId: "org-1",
      meta: { memberId: "m-1", role: "examiner" },
    });
    expect(authAuditEntry({ path: "/organization/create", body: { name: "H", slug: "h" }, returned: { id: "org-new" }, session: { ...adminSession, session: { activeOrganizationId: null } } })?.targetId).toBe("org-new");
    expect(authAuditEntry({ path: "/organization/invite-member", body: { email: "x@y.z", role: "trainee" }, returned: { id: "inv-1", organizationId: "org-1" }, session: adminSession })?.meta).toEqual({ role: "trainee", invitationId: "inv-1" });
    expect(authAuditEntry({ path: "/organization/update", body: { data: { name: "N", logo: "l" } }, returned: {}, session: adminSession })?.meta).toEqual({ fields: ["logo", "name"] });
  });

  it("ignores reads and non-audited paths", () => {
    expect(authAuditEntry({ path: "/organization/list-members", body: {}, returned: [], session: adminSession })).toBeNull();
    expect(authAuditEntry({ path: "/organization/set-active", body: {}, returned: {}, session: adminSession })).toBeNull();
    expect(authAuditEntry({ path: "/sign-in/email", body: {}, returned: {}, session: null })).toBeNull();
  });
});
