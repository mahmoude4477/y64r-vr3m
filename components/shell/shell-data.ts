import "server-only";
import { cache } from "react";
import { strongestOrgRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { ShellData } from "./types";

/**
 * Everything the app shell (sidebar) needs, once per request. Calls requireUser(), so the sidebar sends
 * guests to sign-in and mustChangePassword users to /settings/password, but it streams independently of
 * the page: it is not an access check for page content (see app/[locale]/(app)/layout.tsx).
 */
export const getShellData = cache(async (): Promise<ShellData> => {
  const ctx = await requireUser();
  const memberships = await prisma.member.findMany({
    where: { userId: ctx.user.id, organization: { OR: [{ suspended: null }, { suspended: false }] } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, nameEn: true, logo: true } },
    },
  });
  return {
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, image: ctx.user.image ?? null },
    isPlatformAdmin: ctx.isPlatformAdmin,
    isContentEditor: ctx.isContentEditor,
    activeOrganizationId: ctx.organizationId,
    orgRole: ctx.orgRole,
    orgs: memberships.map((m) => ({ ...m.organization, role: strongestOrgRole(m.role) })),
  };
});
