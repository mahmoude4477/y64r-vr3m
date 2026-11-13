"use client";

import { UndoIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/** Renders its children except on /admin/** (there the admin panel's own impersonation notice shows the way back). */
export function NotOnAdminPages({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? null : children;
}

/**
 * Ends impersonation (Better Auth stop-impersonating restores the admin's own session; audited as
 * auth.admin.stop-impersonating), then a full page load to the user's admin page, so every server component renders
 * for the admin again.
 */
export function StopImpersonatingButton({ userId }: { userId: string }) {
  const t = useTranslations("common.impersonation");
  const locale = useLocale();
  const [pending, setPending] = useState(false);

  async function stop() {
    setPending(true);
    const { error } = await authClient.admin.stopImpersonating();
    if (error) {
      setPending(false);
      toast.error(t("failed"));
      return;
    }
    window.location.assign(new URL(`/${locale}/admin/users/${encodeURIComponent(userId)}`, window.location.origin).href);
  }

  return (
    <Button size="sm" variant="outline" className="h-8" onClick={stop} disabled={pending}>
      {pending ? <Spinner /> : <UndoIcon aria-hidden />}
      {pending ? t("stopping") : t("stop")}
    </Button>
  );
}
