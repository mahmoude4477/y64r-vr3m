"use client";

import { CopyIcon, CopyPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { copyGlobalProtocol } from "@/lib/protocols/editor-actions";
import { ConfirmAction, type ConfirmFailure } from "../editor/confirm-action";
import { toConfirmFailure } from "../editor/status-panel";

/**
 * Copies a published global protocol into the active institution, then opens the copy in the editor.
 * `again`: the institution already has a copy, so this is the secondary "make another copy" action, behind a
 * confirmation (a second copy is a separate protocol with the same title).
 */
export function CopyProtocolButton({ sourceProtocolId, title, again = false }: { sourceProtocolId: string; title: string; again?: boolean }) {
  const t = useTranslations("protocols");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(): Promise<ConfirmFailure | null> {
    try {
      const r = await copyGlobalProtocol(locale, { sourceProtocolId });
      if (!r.ok) return toConfirmFailure(r);
      toast.success(t("editor.toasts.copied"));
      router.push(`/org/protocols/${r.id}`);
      return null;
    } catch {
      return { message: t("editor.errors.network") };
    }
  }

  if (again) {
    return (
      <ConfirmAction
        label={t("org.copyPage.again")}
        icon={<CopyPlusIcon aria-hidden />}
        className="w-auto"
        ariaLabel={t("org.copyPage.againLabel", { title })}
        title={t("org.copyPage.againTitle")}
        description={t("org.copyPage.againDescription", { title })}
        confirmLabel={t("org.copyPage.again")}
        pendingLabel={t("org.copyPage.copying")}
        onConfirm={run}
      />
    );
  }

  async function copy() {
    setPending(true);
    const failure = await run();
    if (failure) {
      toast.error(failure.message);
      setPending(false);
    }
  }

  return (
    <Button type="button" className="h-9" disabled={pending} onClick={copy} aria-label={t("org.copyPage.actionLabel", { title })}>
      {pending ? <Spinner aria-hidden /> : <CopyIcon aria-hidden />}
      {pending ? t("org.copyPage.copying") : t("org.copyPage.action")}
    </Button>
  );
}
