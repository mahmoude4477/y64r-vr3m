import { VenetianMaskIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ImpersonationPanel } from "@/components/admin/impersonation-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "You are acting as <name>" with the way back. Shown by /admin/impersonation and, while a platform admin acts as a
 * user, by EVERY /admin/** address instead of the not-found page (app/[locale]/(app)/admin/layout.tsx): opening the
 * admin panel is the natural way back, so it must always lead there.
 */
export async function ImpersonationNotice({ name, userId }: { name: string; userId: string }) {
  const [t, locale] = await Promise.all([getTranslations("admin.impersonation"), getLocale()]);
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <VenetianMaskIcon aria-hidden className="size-5" />
        </div>
        <CardTitle>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
        </CardTitle>
        <CardDescription>
          {t.rich("description", { name, b: (chunks) => <bdi className="font-medium text-foreground">{chunks}</bdi> })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("explain")}</p>
        <ImpersonationPanel userId={userId} />
        <p className="text-xs text-muted-foreground">
          {t.rich("comeBack", {
            address: `/${locale}/admin`,
            code: (chunks) => (
              <code dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {chunks}
              </code>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  );
}
