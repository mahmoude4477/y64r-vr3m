import { describe, expect, it } from "vitest";
import type { Scope } from "@/lib/authz";
import { dashboardPlan, FEW_MEMBERS, suggestInvites } from "./plan";

const scope = (over: Partial<Scope>): Scope => ({ userId: "u-1", organizationId: null, orgRole: null, isPlatformAdmin: false, ...over });

describe("dashboardPlan", () => {
  it("an individual user (no institution) gets the personal dashboard", () => {
    expect(dashboardPlan(scope({}))).toEqual({ kind: "personal", platformAdmin: false, manager: false });
  });

  it("a trainee of an institution gets the personal dashboard (no scans, no institution numbers)", () => {
    expect(dashboardPlan(scope({ organizationId: "org-1", orgRole: "trainee" }))).toEqual({ kind: "personal", platformAdmin: false, manager: false });
  });

  it("an examiner gets the institution dashboard but no invitation hint", () => {
    expect(dashboardPlan(scope({ organizationId: "org-1", orgRole: "examiner" }))).toEqual({ kind: "institution", platformAdmin: false, manager: false });
  });

  it("owners and institution admins get the institution dashboard as managers", () => {
    for (const orgRole of ["owner", "admin"] as const) {
      expect(dashboardPlan(scope({ organizationId: "org-1", orgRole }))).toEqual({ kind: "institution", platformAdmin: false, manager: true });
    }
  });

  it("a role without an active institution is not staff", () => {
    expect(dashboardPlan(scope({ organizationId: null, orgRole: "owner" })).kind).toBe("personal");
  });

  it("platform admins get the admin card on top of their own dashboard", () => {
    expect(dashboardPlan(scope({ isPlatformAdmin: true }))).toEqual({ kind: "personal", platformAdmin: true, manager: false });
    expect(dashboardPlan(scope({ isPlatformAdmin: true, organizationId: "org-1", orgRole: "owner" }))).toEqual({
      kind: "institution",
      platformAdmin: true,
      manager: true,
    });
  });
});

describe("suggestInvites", () => {
  it("only managers, only while the institution has few members", () => {
    expect(suggestInvites({ manager: true }, 1)).toBe(true);
    expect(suggestInvites({ manager: true }, FEW_MEMBERS - 1)).toBe(true);
    expect(suggestInvites({ manager: true }, FEW_MEMBERS)).toBe(false);
    expect(suggestInvites({ manager: false }, 1)).toBe(false);
  });
});
