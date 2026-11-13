import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DashboardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/shared/page-header";

// /dashboard: the home after sign-in. Only generic strings are static here; the session, the role and every number
// are read inside <Suspense> (DashboardView calls requireUser() first), and each card streams in on its own.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardView />
      </Suspense>
    </>
  );
}
