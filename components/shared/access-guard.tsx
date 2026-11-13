import type { OrgRole } from "@/lib/permissions";
import { requireOrgRole, requirePlatformAdmin } from "@/lib/session";

/**
 * Render inside <Suspense fallback={null}> on an otherwise-static page so a denied user is sent to
 * sign-in / the localized not-found UI. It does NOT hide the page's static siblings: they are in the
 * prerendered shell (and the raw HTML) for everyone, and a denial inside Suspense arrives after an HTTP 200.
 * So nothing beyond generic message strings may sit outside a guarded component, and pages that load data
 * call requireOrgRole / requirePlatformAdmin in their own data component instead.
 */
export async function OrgRoleGuard({ roles }: { roles: readonly OrgRole[] }) {
  await requireOrgRole(roles);
  return null;
}

export async function PlatformAdminGuard() {
  await requirePlatformAdmin();
  return null;
}
