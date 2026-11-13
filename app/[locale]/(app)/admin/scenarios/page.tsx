import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { AdminScenarioListView } from "@/components/simulations/admin/scenario-list";
import { AdminListSkeleton } from "@/components/simulations/admin/skeletons";
import { isAppLocale, routing } from "@/i18n/routing";
import { parseAdminListFilters } from "@/lib/simulations/admin/list-filters";
import { adminScenarioList } from "@/lib/simulations/admin/queries";
import { requireContentEditor } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: nav("sub.adminScenarios") };
}

// Platform admin only. The static part holds generic strings only (CONVENTIONS 4); the list, its counts and every
// action render inside the Suspense'd component that calls requireContentEditor().
export default async function AdminScenariosPage({ searchParams }: PageProps<"/[locale]/admin/scenarios">) {
  const t = await getTranslations("simulations.admin.list");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<AdminListSkeleton />}>
        <ScenarioList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ScenarioList({ searchParams }: { searchParams: PageProps<"/[locale]/admin/scenarios">["searchParams"] }) {
  await requireContentEditor();
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const filters = parseAdminListFilters(await searchParams);
  const data = await adminScenarioList(filters, locale);
  return <AdminScenarioListView data={data} filters={{ ...filters, page: data.page }} />;
}
