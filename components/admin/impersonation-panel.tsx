"use client";

import { LayoutDashboardIcon, UndoIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/auth/form-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * The way back from impersonation: Better Auth's stop-impersonating restores the admin's own session (audited as
 * auth.admin.stop-impersonating). A full page load afterwards, so every server component renders for the admin again.
 */
export function ImpersonationPanel({ userId }: { userId: string }) {
  const t = useTranslations("admin.impersonation");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setPending(true);
    setError(null);
    const { error: failed } = await authClient.admin.stopImpersonating();
    if (failed) {
      setPending(false);
      setError(t("failed"));
      return;
    }
    // A full page load (absolute URL): every server component must render for the admin's own session again.
    window.location.assign(new URL(`/${locale}/admin/users/${encodeURIComponent(userId)}`, window.location.origin).href);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={stop} disabled={pending}>
          {pending ? <Spinner /> : <UndoIcon aria-hidden />}
          {pending ? t("stopping") : t("stop")}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          <LayoutDashboardIcon aria-hidden />
          {t("open")}
        </Link>
      </div>
      <FormError message={error} />
    </div>
  );
}
