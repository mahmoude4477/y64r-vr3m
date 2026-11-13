"use client";

import { EyeOffIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { setProtocolPublished } from "@/lib/protocols/editor-actions";
import type { EditorScope } from "@/lib/protocols/editor-scope";
import { ConfirmAction, type ConfirmFailure } from "./confirm-action";
import { EDITOR_TOAST } from "./editor-toast";
import { toConfirmFailure } from "./status-panel";

/**
 * On a published new version whose old version is still published too: unpublish the old one from here, so members
 * stop seeing two protocols with the same title. Its past results stay with it; the dialog says what else changes
 * (its training scenarios are hidden with it; institution copies of it then train with this version's scenarios).
 */
export function UnpublishOldVersion({
  kind,
  id,
  title,
  scenarios,
  copies,
}: {
  kind: EditorScope;
  /** The OLD version. */
  id: string;
  title: string;
  /** Training scenarios still linked to the old version (hidden with it). */
  scenarios: number;
  /** Institution copies made from the old version (global protocols only). */
  copies: number;
}) {
  const t = useTranslations("protocols.editor");
  const locale = useLocale();
  const router = useRouter();

  async function unpublish(): Promise<ConfirmFailure | null> {
    try {
      const r = await setProtocolPublished(locale, kind, { id, publish: false });
      if (!r.ok) return toConfirmFailure(r);
      toast.success(t("toasts.oldUnpublished"), EDITOR_TOAST);
      router.refresh();
      return null;
    } catch {
      return { message: t("errors.network") };
    }
  }

  return (
    <ConfirmAction
      label={t("actions.unpublishOld")}
      icon={<EyeOffIcon aria-hidden />}
      className="mt-2 w-fit"
      title={t("dialogs.unpublishOld.title")}
      description={
        <>
          {t("dialogs.unpublishOld.description", { title })}
          {scenarios > 0 && <span className="block pt-2">{t("dialogs.unpublishOld.scenarios", { count: scenarios })}</span>}
          {copies > 0 && <span className="block pt-2">{t("dialogs.unpublishOld.copies", { count: copies })}</span>}
        </>
      }
      confirmLabel={t("actions.unpublish")}
      pendingLabel={t("actions.unpublishing")}
      onConfirm={unpublish}
    />
  );
}
