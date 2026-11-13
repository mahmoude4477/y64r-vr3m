import { VenetianMaskIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getAuthContext } from "@/lib/session";
import { NotOnAdminPages, StopImpersonatingButton } from "./stop-impersonating-button";

/**
 * While a platform admin acts as a user (Better Auth impersonation), every app page says so and offers the way back.
 * Render inside <Suspense> (it reads the session). Nothing for everyone else. The admin panel's own notice
 * (/admin/impersonation, and every /admin/** address while impersonating) explains more and has the same button, so
 * the banner stays off those pages.
 */
export async function ImpersonationBanner() {
  const ctx = await getAuthContext();
  if (!ctx?.session.impersonatedBy) return null;
  const t = await getTranslations("common.impersonation");
  return (
    <NotOnAdminPages>
      <div
        role="region"
        aria-label={t("label")}
        data-print="hide"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm text-foreground md:px-6"
      >
        <VenetianMaskIcon aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {t.rich("banner", { name: ctx.user.name, b: (chunks) => <bdi className="font-semibold">{chunks}</bdi> })}
        </p>
        <StopImpersonatingButton userId={ctx.user.id} />
      </div>
    </NotOnAdminPages>
  );
}
