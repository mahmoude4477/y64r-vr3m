"use client";

import { LogOutIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, DESTRUCTIVE_ON_MUTED } from "@/components/org/confirm-dialog";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { revokeOtherSessions, revokeSession } from "@/lib/settings-feature/actions";
import { cn } from "@/lib/utils";
import { focusHeading, sectionHeadingId } from "./settings-section";

// Client islands of the sessions list. The actions refresh the page in the same round trip, so the row (or the
// whole list) is gone when they return: focus then moves to the sessions heading instead of falling to <body>.

/** "Sign out" on one other session. The visible text stays in the accessible name (WCAG 2.5.3). */
export function RevokeSessionButton({ sessionId, device }: { sessionId: string; device: string }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [pending, setPending] = useState(false);

  async function revoke() {
    if (pending) return;
    setPending(true);
    let result: Awaited<ReturnType<typeof revokeSession>> | null = null;
    try {
      result = await revokeSession(locale, { sessionId });
    } catch {
      result = null;
    }
    setPending(false);
    if (!result?.ok) {
      toast.error(result?.message ?? t("errors.network"));
      return;
    }
    toast.success(t("security.sessions.signedOut", { device }));
    focusHeading("sessions");
  }

  return (
    <Button
      type="button"
      variant="outline"
      aria-disabled={pending}
      aria-label={pending ? undefined : t("security.sessions.signOutLabel", { device })}
      onClick={() => void revoke()}
    >
      {pending ? <Spinner /> : <LogOutIcon aria-hidden className="rtl:rotate-180" />}
      {pending ? t("security.sessions.signingOut") : t("security.sessions.signOut")}
    </Button>
  );
}

/**
 * "Sign out other sessions" (the card footer) with a confirmation. The dialog stays mounted when the footer goes away
 * (no other session left after the sign-out), so its finalFocus can still move focus to the sessions heading.
 */
export function RevokeOthersFooter({ show }: { show: boolean }) {
  const t = useTranslations("settings.security.sessions");
  const errors = useTranslations("settings.errors");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const done = useRef(false);

  async function confirm(): Promise<string | null> {
    let result: Awaited<ReturnType<typeof revokeOtherSessions>> | null = null;
    try {
      result = await revokeOtherSessions(locale);
    } catch {
      result = null;
    }
    if (!result?.ok) return result?.message ?? errors("network");
    done.current = true;
    toast.success(t("signedOutOthers", { count: result.count }));
    return null;
  }

  return (
    <>
      {show && (
        <CardFooter className="justify-end">
          <Button
            type="button"
            variant="destructive"
            className={cn("w-full sm:w-auto", DESTRUCTIVE_ON_MUTED)}
            onClick={() => {
              done.current = false;
              setOpen(true);
            }}
          >
            <LogOutIcon aria-hidden className="rtl:rotate-180" />
            {t("signOutOthers")}
          </Button>
        </CardFooter>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={t("confirmDescription")}
        confirmLabel={t("confirm")}
        pendingLabel={t("signingOut")}
        onConfirm={confirm}
        // After a sign-out the button is gone (no other sessions left): focus the list heading instead.
        finalFocus={() => {
          if (!done.current) return true;
          return document.getElementById(sectionHeadingId("sessions")) ?? true;
        }}
      />
    </>
  );
}
