import { describe, expect, it, vi } from "vitest";

// lib/auth.ts builds the Better Auth instance; the database is never touched by these checks.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { isContentEditorRole, isPlatformAdminRole, isProtocolEditorRole, orgRoles, platformRoles } = await import("./permissions");
const { auth } = await import("./auth");

describe("institution delete", () => {
  it("no institution role may delete the institution (platform admins use deleteOrganizationWithData)", () => {
    for (const role of Object.values(orgRoles)) {
      expect(role.authorize({ organization: ["delete"] }).success).toBe(false);
    }
    expect(orgRoles.owner.authorize({ organization: ["update"] }).success).toBe(true);
    expect(orgRoles.owner.authorize({ member: ["create", "update", "delete"], invitation: ["create", "cancel"] }).success).toBe(true);
  });

  it("Better Auth's /organization/delete is disabled for everyone", () => {
    const org = auth.options.plugins.find((p) => p.id === "organization") as { options?: { disableOrganizationDeletion?: boolean } } | undefined;
    expect(org?.options?.disableOrganizationDeletion).toBe(true);
  });

  it("the endpoint refuses before it reads a session or touches a row", async () => {
    await expect(auth.api.deleteOrganization({ body: { organizationId: "org-1" }, headers: new Headers() })).rejects.toMatchObject({
      body: { code: "ORGANIZATION_DELETION_DISABLED" },
    });
  });
});

describe("platform roles", () => {
  it("a protocol editor is a content editor but not a platform admin", () => {
    expect(isProtocolEditorRole("protocol_editor")).toBe(true);
    expect(isPlatformAdminRole("protocol_editor")).toBe(false);
    expect(isContentEditorRole("protocol_editor")).toBe(true);
    expect(isContentEditorRole("admin")).toBe(true);
    expect(isContentEditorRole("user")).toBe(false);
    expect(isContentEditorRole(null)).toBe(false);
    expect(isProtocolEditorRole("user,protocol_editor")).toBe(true);
  });

  it("the protocol editor has no admin-plugin permission", () => {
    expect(platformRoles.protocol_editor.authorize({ user: ["list"] }).success).toBe(false);
    expect(platformRoles.protocol_editor.authorize({ user: ["set-role"] }).success).toBe(false);
    expect(platformRoles.admin.authorize({ user: ["set-role"] }).success).toBe(true);
  });
});
