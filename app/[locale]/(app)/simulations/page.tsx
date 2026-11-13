import { GraduationCapIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { SimulationCatalogue } from "@/components/simulations/catalogue";
import { CatalogueSkeleton } from "@/components/simulations/skeletons";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { isAppLocale, routing } from "@/i18n/routing";
import { scopeOf } from "@/lib/authz";
import { requireUser } from "@/lib/session";
import { parseCatalogueFilters } from "@/lib/simulations/engine";
import { catalogueItems } from "@/lib/simulations/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulations");
  return { title: t("title") };
}

export default async function SimulationsPage({ searchParams }: PageProps<"/[locale]/simulations">) {
  const t = await getTranslations("simulations");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<CatalogueSkeleton />}>
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Catalogue({ searchParams }: { searchParams: PageProps<"/[locale]/simulations">["searchParams"] }) {
  const ctx = await requireUser();
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const [items, params] = await Promise.all([catalogueItems(scopeOf(ctx), locale), searchParams]);

  if (items.length === 0) {
    const t = await getTranslations("simulations.catalogue.empty");
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GraduationCapIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("title")}</EmptyTitle>
          <EmptyDescription>{t("description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const collator = new Intl.Collator(locale);
  const protocols = [...new Map(items.map((i) => [i.protocol.slug, { slug: i.protocol.slug, title: i.protocol.title }])).values()].sort(
    (a, b) => collator.compare(a.title, b.title),
  );
  return <SimulationCatalogue items={items} protocols={protocols} initial={parseCatalogueFilters(params)} />;
}
