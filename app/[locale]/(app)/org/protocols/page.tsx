import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrgProtocols, OrgProtocolsSkeleton } from "@/components/protocols/manage/org-protocols";
import { isOrgStaff, scopeOf } from "@/lib/authz";
import { getAuthContext } from "@/lib/session";

// The active institution's own protocols: owners and admins manage them, examiners read the published ones.
// Everything (title included, it depends on the role) streams in <Suspense> behind requireOrgRole(ORG_STAFF_ROLES).

/** Same rule as the page: staff of the active institution; anyone else gets the not-found title. */
export async function generateMetadata(): Promise<Metadata> {
  const [ctx, t] = await Promise.all([getAuthContext(), getTranslations()]);
  return { title: ctx && isOrgStaff(scopeOf(ctx)) ? t("nav.sub.orgProtocols") : t("common.notFound.title") };
}

export default function OrgProtocolsPage() {
  return (
    <Suspense fallback={<OrgProtocolsSkeleton />}>
      <OrgProtocols />
    </Suspense>
  );
}
