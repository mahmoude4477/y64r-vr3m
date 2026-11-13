import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/brand/logo";

async function copyrightYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const t = await getTranslations("common");
  const year = await copyrightYear();
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <LogoMark className="size-6" />
          <span className="font-semibold">{t("appName")}</span>
          <span className="text-muted-foreground">· {t("meta.tagline")}</span>
        </div>
        <p className="max-w-3xl">{t("marketing.disclaimer")}</p>
        <p>{t("marketing.rights", { year: String(year) })}</p>
      </div>
    </footer>
  );
}
