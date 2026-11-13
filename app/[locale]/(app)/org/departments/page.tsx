import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DepartmentsManager } from "@/components/org/departments-manager";
import { OrgSubnav, OrgSubnavSkeleton } from "@/components/org/org-subnav";
import { SuspendedNotice } from "@/components/org/suspended-notice";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrgAccess, orgPageTitle } from "@/lib/org/access";
import { canDeleteLastDepartment } from "@/lib/org/capabilities";
import { listDepartments, listMembers } from "@/lib/org/queries";

// /org/departments: departments (Better Auth teams) of the active institution. Staff see them; managers (owner /
// admin) create, rename and delete them and assign members. Trainees and individual users get the not-found page.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: await orgPageTitle(nav("sub.orgDepartments")) };
}

async function DepartmentsData({ searchParams }: Pick<PageProps<"/[locale]/org/departments">, "searchParams">) {
  const access = await getOrgAccess();
  if (access.kind === "suspended") return <SuspendedNotice organization={access.organization} />;
  const { ctx, canManage } = access;
  const [departments, members, query] = await Promise.all([
    listDepartments(ctx.organizationId),
    canManage ? listMembers(ctx.organizationId) : [],
    searchParams,
  ]);
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnav current="departments" canManage={canManage} />
      <DepartmentsManager
        organizationId={ctx.organizationId}
        canManage={canManage}
        canDeleteLast={canDeleteLastDepartment()}
        departments={departments}
        people={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
        openCreate={canManage && query.create === "1"}
      />
    </div>
  );
}

function DepartmentsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <OrgSubnavSkeleton />
      {/* Same layout as DepartmentsManager: the button under the title on phones, beside it from sm. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full sm:w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function DepartmentsPage({ searchParams }: PageProps<"/[locale]/org/departments">) {
  const t = await getTranslations("org.departments");
  const nav = await getTranslations("nav");
  return (
    <>
      <PageHeader title={nav("sub.orgDepartments")} description={t("description")} />
      <Suspense fallback={<DepartmentsSkeleton />}>
        <DepartmentsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
