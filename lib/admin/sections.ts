// The sections of the platform admin area (PRODUCT 6a), in the order of the sub-navigation. /admin/protocols and
// /admin/scenarios are built by the protocols and simulations teams. Pure, unit-tested.

export const ADMIN_SECTION_HREFS = [
  "/admin",
  "/admin/users",
  "/admin/organizations",
  "/admin/protocols",
  "/admin/scenarios",
  "/admin/assessments",
  "/admin/ai",
  "/admin/audit",
] as const;

export type AdminSectionHref = (typeof ADMIN_SECTION_HREFS)[number];

/** The section a path (without locale) belongs to: the overview only on /admin itself, the others on and below. */
export function activeAdminSection(pathname: string): AdminSectionHref | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return "/admin";
  return ADMIN_SECTION_HREFS.find((href) => href !== "/admin" && (path === href || path.startsWith(`${href}/`))) ?? null;
}
