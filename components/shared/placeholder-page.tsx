import { HammerIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "./page-header";

/**
 * Temporary page body used by the foundation for routes a feature team has not built yet.
 * Feature teams DELETE its usage when they build their page (never edit this file).
 */
export async function PlaceholderPage({ title, description }: { title: string; description: string }) {
  const t = await getTranslations("common.states");
  return (
    <>
      <PageHeader title={title} description={description} />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HammerIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{t("comingSoon")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
