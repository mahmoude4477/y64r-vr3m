"use client";

import { RotateCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** What a failed action shows in the dialog: a message, plus a reload button when the page is out of date. */
export type ConfirmFailure = { message: string; reload?: boolean };

/**
 * A button that asks before it acts (publish, unpublish, new version, delete). `onConfirm` resolves to null on
 * success (the dialog closes) or to a failure shown in the dialog (announced, the dialog stays open; `reload` adds
 * a "Reload the page" button, as the save form has for the same conflict). While the action runs the dialog cannot
 * be dismissed.
 */
export function ConfirmAction({
  label,
  icon,
  variant = "outline",
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  disabled = false,
  describedBy,
  ariaLabel,
  className,
  onConfirm,
}: {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "destructive" | "secondary";
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  describedBy?: string;
  /** The trigger's accessible name when its visible label is not enough ("Copy" in a list of protocols). */
  ariaLabel?: string;
  className?: string;
  onConfirm: () => Promise<ConfirmFailure | null>;
}) {
  const tc = useTranslations("common.actions");
  const te = useTranslations("protocols.editor.errors");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ConfirmFailure | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const failure = await onConfirm();
      if (failure === null) setOpen(false);
      else setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger
        disabled={disabled}
        render={<Button variant={variant} className={cn("h-9 w-full", className)} aria-describedby={describedBy} aria-label={ariaLabel} />}
      >
        {icon}
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
            <p>{error.message}</p>
            {error.reload && (
              <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RotateCwIcon aria-hidden />
                {te("reload")}
              </Button>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} disabled={pending} onClick={confirm}>
            {pending && <Spinner aria-hidden />}
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
