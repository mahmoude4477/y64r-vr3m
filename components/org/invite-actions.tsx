"use client";

import { Building2Icon, CheckIcon, LogOutIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { ConfirmDialog } from "./confirm-dialog";
import { callAuth, useOrgErrorText } from "./use-org-error";

/**
 * Set right before the page is refreshed after a decline: the refreshed page shows a closed state instead of the
 * buttons, and its heading takes the focus (the decline button that had it is gone). Module state on purpose: it
 * lives exactly as long as this browser tab's JavaScript, across the client-side refresh.
 */
let focusStateHeadingOnMount = false;

/** The h1 of a closed invitation state (declined, canceled, expired, …), focused when it replaces the buttons. */
export function InviteStateHeading({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusStateHeadingOnMount) return;
    focusStateHeadingOnMount = false;
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="text-xl font-semibold text-balance outline-none">
      {children}
    </h1>
  );
}

/**
 * Accept or decline an invitation (/invite/[id], the invited address only). Better Auth's accept-invitation adds the
 * member, joins the invited department and makes the institution the ACTIVE one; lib/auth.ts audits it and refuses it
 * on a suspended institution. The dashboard then renders the (app) layout afresh, so the shell shows the new role.
 */
export function InviteResponse({ invitationId, orgName }: { invitationId: string; orgName: string }) {
  const t = useTranslations("org.invitePage.open");
  const router = useRouter();
  const errorText = useOrgErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    const result = await callAuth(() => authClient.organization.acceptInvitation({ invitationId }));
    if (!result.ok) {
      setPending(false);
      setError(errorText(result.error));
      return;
    }
    toast.success(t("accepted", { org: orgName }));
    // Better Auth made the institution the active one: the dashboard (and the app shell) now load as its member.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="sm:min-w-40" onClick={accept} disabled={pending}>
          {pending ? <Spinner /> : <CheckIcon aria-hidden />}
          {pending ? t("accepting") : t("accept")}
        </Button>
        <Button size="lg" variant="outline" onClick={() => setDeclining(true)} disabled={pending}>
          <XIcon aria-hidden />
          {t("decline")}
        </Button>
      </div>
      <ConfirmDialog
        open={declining}
        onOpenChange={setDeclining}
        title={t("declineTitle")}
        description={t("declineDescription", { org: orgName })}
        confirmLabel={t("declineConfirm")}
        pendingLabel={t("declining")}
        cancelLabel={t("keep")}
        onConfirm={async () => {
          const result = await callAuth(() => authClient.organization.rejectInvitation({ invitationId }));
          if (!result.ok) return errorText(result.error);
          toast.success(t("declined"));
          focusStateHeadingOnMount = true;
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

/** Wrong account: sign out, then sign in with the invited address and come back here (safe, locale-prefixed callback). */
export function SwitchAccountButton({ invitationId }: { invitationId: string }) {
  const t = useTranslations("org.invitePage.wrongAccount");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useOrgErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchAccount() {
    setPending(true);
    setError(null);
    const result = await callAuth(() => authClient.signOut());
    if (!result.ok) {
      setPending(false);
      setError(errorText(result.error));
      return;
    }
    const callbackUrl = `/${locale}/invite/${encodeURIComponent(invitationId)}`;
    router.replace(`/sign-in?${new URLSearchParams({ callbackUrl })}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Button size="lg" onClick={switchAccount} disabled={pending}>
        {pending ? <Spinner /> : <LogOutIcon aria-hidden className="rtl:rotate-180" />}
        {pending ? t("switching") : t("switch")}
      </Button>
    </div>
  );
}

/** Already a member: make that institution the active one and open the dashboard. */
export function OpenOrganizationButton({ organizationId }: { organizationId: string }) {
  const t = useTranslations("org.invitePage.alreadyMember");
  const router = useRouter();
  const errorText = useOrgErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    const result = await callAuth(() => authClient.organization.setActive({ organizationId }));
    if (!result.ok) {
      setPending(false);
      setError(errorText(result.error));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Button size="lg" onClick={open} disabled={pending}>
        {pending ? <Spinner /> : <Building2Icon aria-hidden />}
        {pending ? t("opening") : t("open")}
      </Button>
    </div>
  );
}
