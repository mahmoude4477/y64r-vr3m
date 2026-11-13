"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-parts";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { confirmationMatches } from "@/lib/admin/schemas";

/** Returned by `onConfirm` when success leaves the page (a deleted user or institution). */
export type ConfirmNavigate = { navigate: () => void };

/**
 * Confirmation for an admin action. `onConfirm` returns null on success (the dialog closes), the error text to show
 * inside it, or `{ navigate }`: then the dialog stays open and busy while that navigation runs (a React transition),
 * so nothing on the page that is being left can be clicked again in the meantime. With `typeToConfirm`, the confirm
 * button stays disabled until the admin types one of those values (an e-mail address or an institution name: the
 * strong confirmation of irreversible deletes); `typeValue` shows the value to type on its own line, isolated.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  destructive = false,
  typeToConfirm,
  typeLabel,
  typeValue,
  typeDir,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  onConfirm: (typed: string) => Promise<string | null | ConfirmNavigate>;
  destructive?: boolean;
  typeToConfirm?: Array<string | null | undefined>;
  typeLabel?: string;
  /** The exact text to type, shown under the label (an e-mail is set left to right, wrapping anywhere). */
  typeValue?: string;
  typeDir?: "ltr" | "rtl" | "auto";
}) {
  const actions = useTranslations("common.actions");
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [, startNavigation] = useTransition();
  const busy = pending || leaving;
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const needsTyping = !!typeToConfirm && typeToConfirm.some(Boolean);
  const typedOk = !needsTyping || confirmationMatches(typed, ...(typeToConfirm ?? []));

  function change(next: boolean) {
    if (busy) return;
    if (next) {
      setError(null);
      setTyped("");
    }
    onOpenChange(next);
  }

  async function confirm() {
    if (!typedOk || busy) return;
    setPending(true);
    setError(null);
    try {
      const outcome = await onConfirm(typed);
      if (typeof outcome === "string") setError(outcome);
      else if (outcome) {
        // Stays busy until this component unmounts with the page that is being left.
        setLeaving(true);
        startNavigation(outcome.navigate);
      } else onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {needsTyping && (
          <Field>
            <FieldLabel htmlFor={inputId} className="w-full flex-col items-start gap-1">
              <span>{typeLabel}</span>
              {typeValue && (
                <code dir={typeDir ?? "auto"} className="max-w-full rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
                  {typeValue}
                </code>
              )}
            </FieldLabel>
            <Input
              id={inputId}
              value={typed}
              disabled={leaving}
              dir={typeDir ?? "auto"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirm();
                }
              }}
            />
          </Field>
        )}
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{actions("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} disabled={busy || !typedOk} onClick={confirm}>
            {busy && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
