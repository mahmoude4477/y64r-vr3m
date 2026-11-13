import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrgSubnav } from "@/components/org/org-subnav";
import { OrgLinks, OrgOverviewSkeleton, OrgProfileCard, OrgStats, RoleComposition, SetupChecklist } from "@/components/org/overview";
import { SuspendedNotice } from "@/components/org/suspended-notice";
import { PageHeader } from "@/components/shared/page-header";
import { getOrgAccess, orgPageTitle } from "@/lib/org/access";
import { getOrgSummary } from "@/lib/org/queries";

// /org: the institution's profile, figures and first steps. Staff only (owner / admin / examiner): getOrgAccess()
// sends trainees and individual users to the not-found page. Only generic strings sit outside Suspense.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org");
  return { title: await orgPageTitle(t("title")) };
}

async function OrgOverview() {
  const access = await getOrgAccess();
  if (access.kind === "suspended") return <SuspendedNotice organization={access.organization} />;
  const { ctx, canManage } = access;
  const summary = await getOrgSummary(ctx.organizationId);
  if (!summary) notFound();
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnav current="overview" canManage={canManage} />
      <section aria-labelledby="org-profile">
        <OrgProfileCard summary={summary} role={ctx.orgRole} canManage={canManage} />
      </section>
      {canManage && <SetupChecklist summary={summary} />}
      <OrgStats summary={summary} canManage={canManage} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <RoleComposition summary={summary} />
        <OrgLinks canManage={canManage} />
      </div>
    </div>
  );
}

export default async function OrgPage() {
  const t = await getTranslations("org");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<OrgOverviewSkeleton />}>
        <OrgOverview />
      </Suspense>
    </>
  );
}
