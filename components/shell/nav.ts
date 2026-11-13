import {
  BookOpenCheckIcon,
  Building2Icon,
  ChartColumnIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ScanLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquarePenIcon,
} from "lucide-react";

/**
 * App navigation (sidebar + breadcrumbs). Foundation-owned: features never edit it; ask for changes.
 * `show` decides visibility from the server-computed ShellAccess (org staff / platform admin).
 */
export type ShellAccess = {
  orgStaff: boolean;
  platformAdmin: boolean;
  /** Protocol editor (user.role "protocol_editor") or platform admin: global protocols and scenarios. */
  contentEditor?: boolean;
};

export type NavKey = "dashboard" | "protocols" | "simulations" | "scans" | "reports" | "org" | "settings" | "admin" | "content";

export type NavItem = {
  key: NavKey;
  href: `/${string}`;
  icon: LucideIcon;
  group: "workspace" | "manage" | "platform";
  show?: (access: ShellAccess) => boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboardIcon, group: "workspace" },
  { key: "protocols", href: "/protocols", icon: BookOpenCheckIcon, group: "workspace" },
  { key: "simulations", href: "/simulations", icon: GraduationCapIcon, group: "workspace" },
  // Scans are staff-only (no personal scans): trainees and individual users never see the link.
  { key: "scans", href: "/scans", icon: ScanLineIcon, group: "workspace", show: (a) => a.orgStaff },
  { key: "reports", href: "/reports", icon: ChartColumnIcon, group: "workspace" },
  { key: "org", href: "/org", icon: Building2Icon, group: "manage", show: (a) => a.orgStaff },
  { key: "settings", href: "/settings", icon: SettingsIcon, group: "manage" },
  { key: "admin", href: "/admin", icon: ShieldCheckIcon, group: "platform", show: (a) => a.platformAdmin },
  // Protocol editors only reach /admin/protocols and /admin/scenarios; platform admins get them under "admin".
  { key: "content", href: "/admin/protocols", icon: SquarePenIcon, group: "platform", show: (a) => !!a.contentEditor && !a.platformAdmin },
];

/**
 * Sub-page label keys (messages nav.sub.*) for breadcrumbs, by route pattern. "*" = dynamic segment.
 * `parent` (a pattern without "*") adds the list page as a linked crumb between the section and the sub page, so a
 * detail page that sets its own last crumb with <BreadcrumbLabel> keeps the way back to its list.
 */
export const SUB_PAGES: ReadonlyArray<{ pattern: string; label: SubLabel; parent?: string }> = [
  { pattern: "protocols/*", label: "protocolDetail" },
  { pattern: "simulations/attempts/*", label: "simulationAttempt" },
  { pattern: "simulations/*", label: "simulationPlay" },
  { pattern: "scans/new", label: "scanNew" },
  { pattern: "scans/*", label: "scanDetail" },
  { pattern: "reports/trainees/*", label: "reportTrainee" },
  { pattern: "reports/print", label: "reportPrint" },
  { pattern: "org/members", label: "orgMembers" },
  { pattern: "org/departments", label: "orgDepartments" },
  { pattern: "org/protocols", label: "orgProtocols" },
  { pattern: "org/protocols/new", label: "orgProtocolNew", parent: "org/protocols" },
  { pattern: "org/protocols/copy", label: "orgProtocolCopy", parent: "org/protocols" },
  { pattern: "org/protocols/*", label: "orgProtocolEdit", parent: "org/protocols" },
  { pattern: "settings/password", label: "settingsPassword" },
  { pattern: "admin/users", label: "adminUsers" },
  { pattern: "admin/users/*", label: "adminUserDetail", parent: "admin/users" },
  { pattern: "admin/organizations", label: "adminOrganizations" },
  { pattern: "admin/organizations/new", label: "adminOrganizationNew", parent: "admin/organizations" },
  { pattern: "admin/organizations/*", label: "adminOrganizationDetail", parent: "admin/organizations" },
  { pattern: "admin/protocols", label: "adminProtocols" },
  { pattern: "admin/protocols/new", label: "adminProtocolNew", parent: "admin/protocols" },
  { pattern: "admin/protocols/*", label: "adminProtocolEdit", parent: "admin/protocols" },
  { pattern: "admin/scenarios", label: "adminScenarios" },
  { pattern: "admin/scenarios/new", label: "adminScenarioNew", parent: "admin/scenarios" },
  { pattern: "admin/scenarios/*", label: "adminScenarioEdit", parent: "admin/scenarios" },
  { pattern: "admin/scenarios/*/preview", label: "adminScenarioPreview", parent: "admin/scenarios" },
  { pattern: "admin/assessments", label: "adminAssessments" },
  { pattern: "admin/assessments/scans/*", label: "adminScanDetail", parent: "admin/assessments" },
  { pattern: "admin/assessments/attempts/*", label: "adminAttemptDetail", parent: "admin/assessments" },
  { pattern: "admin/ai", label: "adminAi" },
  { pattern: "admin/audit", label: "adminAudit" },
  { pattern: "admin/impersonation", label: "adminImpersonation" },
];

export type SubLabel =
  | "protocolDetail"
  | "simulationPlay"
  | "simulationAttempt"
  | "scanNew"
  | "scanDetail"
  | "reportTrainee"
  | "reportPrint"
  | "orgMembers"
  | "orgDepartments"
  | "orgProtocols"
  | "orgProtocolNew"
  | "orgProtocolCopy"
  | "orgProtocolEdit"
  | "settingsProfile"
  | "settingsPassword"
  | "adminOverview"
  | "adminUsers"
  | "adminUserDetail"
  | "adminOrganizations"
  | "adminOrganizationNew"
  | "adminOrganizationDetail"
  | "adminProtocols"
  | "adminProtocolNew"
  | "adminProtocolEdit"
  | "adminScenarios"
  | "adminScenarioNew"
  | "adminScenarioEdit"
  | "adminScenarioPreview"
  | "adminAssessments"
  | "adminScanDetail"
  | "adminAttemptDetail"
  | "adminAi"
  | "adminAudit"
  | "adminImpersonation"
  | "invite";

export type TrailParent = { label: SubLabel; href: `/${string}` };

/**
 * Breadcrumb trail for a path without the locale prefix, e.g. "/scans/abc" -> scans > scanDetail, and
 * "/admin/protocols/abc" -> admin > adminProtocols (link) > adminProtocolEdit.
 */
export function resolveTrail(pathname: string): { section: NavItem | null; parent: TrailParent | null; sub: SubLabel | null } {
  const segments = pathname.split("/").filter(Boolean);
  const section = NAV_ITEMS.find((item) => item.href === `/${segments[0] ?? ""}`) ?? null;
  if (!section) return { section: null, parent: null, sub: null };
  // Longest matching pattern wins; deeper feature pages fall back to their closest known parent.
  for (let len = segments.length; len >= 2; len--) {
    const prefix = segments.slice(0, len);
    const match = SUB_PAGES.find(({ pattern }) => {
      const parts = pattern.split("/");
      return parts.length === len && parts.every((p, i) => p === "*" || p === prefix[i]);
    });
    if (match) {
      const parentPage = match.parent ? SUB_PAGES.find(({ pattern }) => pattern === match.parent) : undefined;
      const parent = parentPage ? { label: parentPage.label, href: `/${parentPage.pattern}` as const } : null;
      return { section, parent, sub: match.label };
    }
  }
  return { section, parent: null, sub: null };
}
