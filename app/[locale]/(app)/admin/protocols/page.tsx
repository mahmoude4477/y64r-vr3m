import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AdminProtocols, ManageListSkeleton } from "@/components/protocols/manage/admin-protocols";
import { PageHeader } from "@/components/shared/page-header";
import { getAuthContext } from "@/lib/session";

// Platform admin: the global protocols (create, edit, publish) and a read-only view of institutions' own protocols.
// Static shell = generic title and description only; the gate (requireContentEditor) and the data stream in <Suspense>.
// The title names both lists ("Protocol management"); each list has its own h2 under the tabs.

/** Same rule as the page: anyone but a platform admin gets the not-found title. */
export async function generateMetadata(): Promise<Metadata> {
  const [ctx, t] = await Promise.all([getAuthContext(), getTranslations()]);
  return { title: ctx?.isContentEditor ? t("protocols.admin.title") : t("common.notFound.title") };
}

export default async function AdminProtocolsPage({ searchParams }: PageProps<"/[locale]/admin/protocols">) {
  const t = await getTranslations("protocols.admin");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<ManageListSkeleton />}>
        <AdminProtocols searchParams={searchParams} />
      </Suspense>
    </>
  );
}
