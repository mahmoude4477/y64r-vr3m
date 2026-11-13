/**
 * Which dashboard a signed-in user sees (pure, unit-tested). Same rules as the reports (lib/reports/scope.ts):
 * - staff (owner / admin / examiner) of the ACTIVE institution: the institution dashboard (scans, results, gaps);
 * - everyone else (a trainee of an institution, an individual user): their own training dashboard;
 * - platform admins also get a link card to /admin, on top of whichever of the two applies.
 * Scan links appear only on the institution dashboard, i.e. only when isOrgStaff(scope).
 */
import { isOrgManager, isOrgStaff, type Scope } from "@/lib/authz";

export type DashboardKind = "institution" | "personal";

export type DashboardPlan = {
  kind: DashboardKind;
  /** Platform admin (user.role "admin"): show the /admin card. */
  platformAdmin: boolean;
  /** Owner or admin of the active institution: show the member-invitation hint when it has few members. */
  manager: boolean;
};

export function dashboardPlan(scope: Scope): DashboardPlan {
  const staff = isOrgStaff(scope);
  return { kind: staff ? "institution" : "personal", platformAdmin: scope.isPlatformAdmin, manager: staff && isOrgManager(scope) };
}

/** Below this many members (the managers included) the institution dashboard suggests inviting people. */
export const FEW_MEMBERS = 5;

export function suggestInvites(plan: Pick<DashboardPlan, "manager">, members: number): boolean {
  return plan.manager && members < FEW_MEMBERS;
}
