import "server-only";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { strongestOrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { type AuthContext, getAuthContext, type OrgAuthContext, requireUser } from "@/lib/session";
import { isManagerRole, isStaffRole } from "./roles";

export type SuspendedOrganization = { id: string; name: string; nameEn: string | null; type: string | null };

export type OrgAccess =
  /** Staff (owner / admin / examiner) of the active institution. */
  | { kind: "active"; ctx: OrgAuthContext; canManage: boolean }
  /** The active institution is suspended by the platform: the pages say so, nothing else is shown. */
  | { kind: "suspended"; organization: SuspendedOrganization };

/**
 * What the signed-in user may see of the /org pages, or null (the not-found page). getAuthContext() drops a suspended
 * institution (organizationId null), so staff whose ACTIVE institution is suspended are told why instead of getting a
 * not-found page. Deduplicated per request: the page and its generateMetadata share one answer.
 */
const resolveOrgAccess = cache(async (ctx: AuthContext): Promise<OrgAccess | null> => {
  if (ctx.organizationId && ctx.orgRole && ctx.memberId) {
    if (!isStaffRole(ctx.orgRole)) return null;
    return { kind: "active", ctx: ctx as OrgAuthContext, canManage: isManagerRole(ctx.orgRole) };
  }
  const activeId = (ctx.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  if (!activeId) return null;
  const member = await prisma.member.findFirst({
    where: { organizationId: activeId, userId: ctx.user.id },
    select: { role: true, organization: { select: { id: true, name: true, nameEn: true, type: true, suspended: true } } },
  });
  if (member?.organization.suspended && isStaffRole(strongestOrgRole(member.role))) {
    const { id, name, nameEn, type } = member.organization;
    return { kind: "suspended", organization: { id, name, nameEn, type } };
  }
  return null;
});

/**
 * Gate of every /org page (call it inside the page's Suspense'd data component). Trainees, users without an
 * institution and guests never see these pages: guests go to sign-in (requireUser), everyone else gets the not-found
 * UI.
 */
export async function getOrgAccess(): Promise<OrgAccess> {
  const ctx = await requireUser();
  const access = await resolveOrgAccess(ctx);
  if (!access) notFound();
  return access;
}

/**
 * The tab title of an /org page: `title`, or the not-found page's own title for someone the page turns away, so the
 * tab does not name a page the visitor gets "page not found" on (review round 2, R2-UX-7).
 */
export async function orgPageTitle(title: string): Promise<string> {
  const ctx = await getAuthContext();
  if (ctx && (await resolveOrgAccess(ctx))) return title;
  const t = await getTranslations("common.notFound");
  return t("title");
}
