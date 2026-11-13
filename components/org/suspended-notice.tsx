import { CirclePauseIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import type { SuspendedOrganization } from "@/lib/org/access";
import { orgDisplayName } from "@/lib/org/display";

/**
 * Shown on every /org page while the ACTIVE institution is suspended by the platform (no data, no actions). The way
 * out is the settings page, where the person can switch to another institution or to the individual account.
 */
export function SuspendedNotice({ organization }: { organization: SuspendedOrganization }) {
  const t = useTranslations("org.suspended");
  const locale = useLocale();
  return (
    <Alert role="status" className="border-warning/40 bg-warning/10">
      <CirclePauseIcon aria-hidden className="text-[color-mix(in_oklab,var(--warning),var(--warning-foreground)_50%)] dark:text-warning" />
      <AlertTitle>{t("title")}</AlertTitle>
      {/* Text and a link, no <p>: AlertDescription adds a 16 px margin under every paragraph but the last. */}
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{t("description", { org: orgDisplayName(organization, locale) })}</span>
        <Link href="/settings#institutions" className="font-medium text-foreground">
          {t("hint")}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
