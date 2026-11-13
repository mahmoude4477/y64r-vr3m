"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/auth/form-parts";
import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * Dark-mode tint for a destructive Button on a muted surface (card or dialog footer). The ui variant's 20 % tint
 * (30 % on hover) leaves the red text at 4.2:1 there; 10 % (15 % on hover) keeps it at 4.5:1 or more (WCAG AA).
 */
export const DESTRUCTIVE_ON_MUTED = "dark:bg-destructive/10 dark:hover:bg-destructive/15";

/**
 * A confirmation for an irreversible step (remove a member, cancel an invitation, delete a department). `onConfirm`
 * returns null on success (the dialog closes) or the error text to show inside the dialog. `finalFocus` (Base UI)
 * chooses where focus goes when the dialog closes, e.g. a heading when the opener disappears after the change.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  onConfirm,
  destructive = true,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel?: string;
  onConfirm: () => Promise<string | null>;
  destructive?: boolean;
  finalFocus?: AlertDialogPrimitive.Popup.Props["finalFocus"];
}) {
  const actions = useTranslations("common.actions");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (next) setError(null);
    onOpenChange(next);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    const failure = await onConfirm();
    setPending(false);
    if (failure) setError(failure);
    else onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel ?? actions("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            className={destructive ? DESTRUCTIVE_ON_MUTED : undefined}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Spinner />}
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
