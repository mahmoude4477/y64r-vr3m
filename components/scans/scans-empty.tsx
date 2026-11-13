import { FilterXIcon, PlusIcon, ScanLineIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

/** First run: the institution has no scan yet (the page header leaves its "new scan" action to this state). */
export function ScansEmpty() {
  const t = useTranslations("scans.list.empty");
  return (
    <Empty className="flex-none border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12 rounded-xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-6">
          <ScanLineIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-base">{t("title")}</EmptyTitle>
        <EmptyDescription>{t("description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/scans/new" className={buttonVariants({ size: "lg" })}>
          <PlusIcon aria-hidden />
          {t("action")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/** The filters or the search match nothing: one link back to the whole list. */
export function ScansNoMatch() {
  const t = useTranslations("scans.list.noMatch");
  return (
    <Empty className="flex-none border border-dashed py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FilterXIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/scans" className={buttonVariants({ variant: "outline" })}>
          {t("clear")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
