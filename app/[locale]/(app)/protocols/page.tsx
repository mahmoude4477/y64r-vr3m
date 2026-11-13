import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProtocolLibrary, ProtocolLibrarySkeleton } from "@/components/protocols/protocol-library";
import { PageHeader } from "@/components/shared/page-header";

// The protocol library: published global protocols + the active institution's own (lib/protocols/queries.ts).
// Static shell = title and description only; the session, the URL filters and the data stream in <Suspense>.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("protocols");
  return { title: t("title") };
}

export default async function ProtocolsPage({ searchParams }: PageProps<"/[locale]/protocols">) {
  const t = await getTranslations("protocols");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<ProtocolLibrarySkeleton />}>
        <ProtocolLibrary searchParams={searchParams} />
      </Suspense>
    </>
  );
}
