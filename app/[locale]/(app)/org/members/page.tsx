import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MembersManager } from "@/components/org/members-manager";
import { OrgSubnav, OrgSubnavSkeleton } from "@/components/org/org-subnav";
import { SuspendedNotice } from "@/components/org/suspended-notice";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { isEmailEnabled } from "@/lib/email";
import { INVITATION_EXPIRES_SECONDS } from "@/lib/email/auth-mail";
import { getOrgAccess, orgPageTitle } from "@/lib/org/access";
import { listDepartmentRefs, listMembers, listPendingInvitations } from "@/lib/org/queries";

// /org/members: staff (owner / admin / examiner) see the members; managers (owner / admin) also invite, change roles,
// remove members and handle pending invitations. Trainees and individual users get the not-found page.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: await orgPageTitle(nav("sub.orgMembers")) };
}

async function MembersData({ searchParams }: Pick<PageProps<"/[locale]/org/members">, "searchParams">) {
  const access = await getOrgAccess();
  if (access.kind === "suspended") return <SuspendedNotice organization={access.organization} />;
  const { ctx, canManage } = access;
  const [members, invitations, departments, query] = await Promise.all([
    listMembers(ctx.organizationId),
    canManage ? listPendingInvitations(ctx.organizationId) : null,
    canManage ? listDepartmentRefs(ctx.organizationId) : [],
    searchParams,
  ]);
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnav current="members" canManage={canManage} />
      <MembersManager
        organizationId={ctx.organizationId}
        actor={{ memberId: ctx.memberId, role: ctx.orgRole }}
        members={members}
        invitations={invitations}
        departments={departments}
        emailEnabled={isEmailEnabled()}
        inviteDays={Math.round(INVITATION_EXPIRES_SECONDS / 86_400)}
        openInvite={canManage && query.invite === "1"}
      />
    </div>
  );
}

function MembersSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnavSkeleton />
      {/* Same layout as MembersManager: the invite button under the title on phones, then the search, then the
          role filter on its own row; one row each from sm. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full sm:w-28" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-full sm:w-56" />
      </div>
      <div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function MembersPage({ searchParams }: PageProps<"/[locale]/org/members">) {
  const t = await getTranslations("org.members");
  const nav = await getTranslations("nav");
  return (
    <>
      <PageHeader title={nav("sub.orgMembers")} description={t("description")} />
      <Suspense fallback={<MembersSkeleton />}>
        <MembersData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
