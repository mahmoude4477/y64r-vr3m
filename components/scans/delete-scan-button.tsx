"use client";

import { Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { deleteScanAction } from "@/lib/scans/actions";
import { callAction, reviewErrorKey } from "@/lib/scans/client/review-errors";

/** Deletes an unfinished scan after a confirmation (the server checks who may), then opens the scan list. */
export function DeleteScanButton({ scanId, photoCount }: { scanId: string; photoCount: number }) {
  const t = useTranslations("scans.detail.delete");
  const ts = useTranslations("scans");
  const actions = useTranslations("common.actions");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await callAction(() => deleteScanAction(locale, { scanId }));
      if (!res.ok) {
        setError(ts(reviewErrorKey(res.error)));
        return;
      }
      setOpen(false);
      toast.success(t("done"));
      router.replace("/scans");
    });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" className="h-10 text-destructive hover:text-destructive" />}>
        <Trash2Icon aria-hidden />
        {t("button")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description", { count: photoCount })}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{actions("cancel")}</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner aria-hidden /> : <Trash2Icon aria-hidden />}
            {pending ? t("working") : t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
