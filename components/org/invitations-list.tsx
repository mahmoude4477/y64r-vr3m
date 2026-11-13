"use client";

import { CircleAlertIcon, ClockIcon, CopyIcon, EllipsisVerticalIcon, MailIcon, RotateCwIcon, SendIcon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import type { OrgRole } from "@/lib/permissions";
import { isLiveInvitation } from "@/lib/org/invitation-status";
import type { OrgInvitationRow } from "@/lib/org/queries";
import { canHandleInvitation } from "@/lib/org/roles";
import { ConfirmDialog } from "./confirm-dialog";
import { copyText } from "./copy-link";
import { TAP_SM } from "./dialog-styles";
import { NameText } from "./name-text";
import { RoleBadge } from "./role-badge";
import { callAuth, invitationUrl, useOrgErrorText } from "./use-org-error";

const HEADING_ID = "invitations-title";
const STALE_HEADING_ID = "invitations-stale-title";

/**
 * Pending invitations (managers), in two groups with the same rule as the overview figure (lib/org/invitation-status.ts):
 * the ones still waiting for an answer (copy the link, resend: same link, longer validity) and the ones that need a new
 * invitation (expired, the sender left the institution, or no Waqaya role), which can be sent again or canceled.
 */
export function InvitationsList({
  organizationId,
  actorRole,
  invitations,
  emailEnabled,
}: {
  organizationId: string;
  actorRole: OrgRole;
  invitations: OrgInvitationRow[];
  emailEnabled: boolean;
}) {
  const t = useTranslations("org.invitations");
  const [canceling, setCanceling] = useState<OrgInvitationRow | null>(null);
  const [lastCanceling, setLastCanceling] = useState<OrgInvitationRow | null>(null);
  if (canceling && canceling !== lastCanceling) setLastCanceling(canceling);
  const canceled = useRef(false);
  const errorText = useOrgErrorText();
  const router = useRouter();
  const live = invitations.filter((inv) => isLiveInvitation(inv.health));
  const stale = invitations.filter((inv) => !isLiveInvitation(inv.health));

  const rows = (list: OrgInvitationRow[]) =>
    list.map((inv) => (
      <InvitationRow
        key={inv.id}
        invitation={inv}
        organizationId={organizationId}
        canHandle={canHandleInvitation(actorRole, inv.role)}
        emailEnabled={emailEnabled}
        onCancel={() => setCanceling(inv)}
      />
    ));

  return (
    <section id="invitations" aria-labelledby={HEADING_ID} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={HEADING_ID} tabIndex={-1} className="text-lg font-semibold outline-none">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {invitations.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">{t("empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {live.length > 0 ? (
            <ul aria-labelledby={HEADING_ID} className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {rows(live)}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {stale.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <h3 id={STALE_HEADING_ID} className="text-sm font-semibold">
                  {t("staleTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">{t("staleDescription")}</p>
              </div>
              <ul aria-labelledby={STALE_HEADING_ID} className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                {rows(stale)}
              </ul>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!canceling}
        onOpenChange={(open) => {
          if (!open) setCanceling(null);
        }}
        title={t("cancelTitle", { email: (canceling ?? lastCanceling)?.email ?? "" })}
        description={t("cancelDescription")}
        confirmLabel={t("cancelConfirm")}
        pendingLabel={t("canceling")}
        cancelLabel={t("keep")}
        // The canceled row (and its menu button) goes away: focus the section heading instead of <body>.
        finalFocus={() => {
          const target = canceled.current ? (document.getElementById(HEADING_ID) ?? true) : true;
          canceled.current = false;
          return target;
        }}
        onConfirm={async () => {
          if (!canceling) return null;
          const result = await callAuth(() => authClient.organization.cancelInvitation({ invitationId: canceling.id }));
          if (!result.ok) return errorText(result.error);
          canceled.current = true;
          toast.success(t("canceled"));
          router.refresh();
          return null;
        }}
      />
    </section>
  );
}

function InvitationRow({
  invitation: inv,
  organizationId,
  canHandle,
  emailEnabled,
  onCancel,
}: {
  invitation: OrgInvitationRow;
  organizationId: string;
  canHandle: boolean;
  emailEnabled: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("org.invitations");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useOrgErrorText();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const live = isLiveInvitation(inv.health);
  const role = inv.role;
  const date = format.dateTime(inv.createdAt, "date");

  async function copy() {
    if (await copyText(invitationUrl(locale, inv.id))) toast.success(t("copied"));
    else toast.error(t("copyFailed"));
  }

  async function resend(roleToSend: OrgRole) {
    setBusy(true);
    const teamIds = inv.departments.map((d) => d.id);
    const result = await callAuth(() =>
      authClient.organization.inviteMember({
        email: inv.email,
        role: roleToSend,
        organizationId,
        // A live invitation keeps its id and link (resend: true only extends it); a stale one is replaced.
        ...(live ? { resend: true } : teamIds.length > 0 ? { teamId: teamIds.length === 1 ? teamIds[0] : teamIds } : {}),
      }),
    );
    if (result.ok && inv.health === "expired") {
      // Better Auth already canceled a stale unexpired one (cancelPendingInvitationsOnReInvite); an expired one stays
      // "pending" in the table, so it is canceled here to leave one row per person.
      await callAuth(() => authClient.organization.cancelInvitation({ invitationId: inv.id }));
    }
    setBusy(false);
    if (!result.ok) {
      toast.error(errorText(result.error));
      return;
    }
    if (!live) {
      // This row (and its menu button, which had the focus) is replaced by a new waiting invitation: focus the list
      // heading, as after a cancel, instead of leaving it on <body> (R2-UX-2). A live one keeps its row and button.
      document.getElementById(HEADING_ID)?.focus();
      toast.success(emailEnabled ? t("sentAgain") : t("sentAgainOff"));
    } else {
      toast.success(emailEnabled ? t("resent") : t("resentOff"));
    }
    router.refresh();
  }

  const staleLabel = inv.health === "expired" ? t("expired") : inv.health === "inviter_gone" ? t("inviterGone") : t("invalidRole");

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap">
      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
        <MailIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Left-to-right. The address is all a pending invitation has to name the person: on phones it wraps instead
            of being cut (a title tooltip is never shown there, R2-UX-7); from sm up there is room for one line. */}
        <p dir="ltr" title={inv.email} className="text-left font-medium wrap-anywhere sm:truncate rtl:text-right">
          {inv.email}
        </p>
        <p className="text-xs text-muted-foreground">
          {inv.inviterName ? t("invitedBy", { name: inv.inviterName, date }) : t("invitedOn", { date })}
        </p>
      </div>
      <div className="order-last flex w-full flex-wrap items-center gap-2 ps-12 sm:order-none sm:w-auto sm:justify-end sm:ps-0">
        <RoleBadge role={role} />
        {inv.departments.map((d) => (
          <Badge key={d.id} variant="outline" title={d.name} className="max-w-40">
            <NameText className="truncate">{d.name}</NameText>
          </Badge>
        ))}
        {live ? (
          <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
            <ClockIcon aria-hidden className="size-3.5" />
            {t("expires", { date: format.dateTime(inv.expiresAt, "date") })}
          </span>
        ) : (
          <Badge variant="outline" className="border-transparent bg-warning/15 text-[color-mix(in_oklab,var(--warning),var(--warning-foreground)_50%)] ring-1 ring-warning/30 dark:text-warning">
            <CircleAlertIcon aria-hidden />
            {staleLabel}
          </Badge>
        )}
      </div>
      {canHandle ? (
        <div className="flex items-center gap-1">
          {live && (
            <Button variant="outline" size="sm" className={TAP_SM} onClick={copy}>
              <CopyIcon aria-hidden />
              {/* Icon only on phones (the address needs the room); screen readers still hear the label. */}
              <span className="max-sm:sr-only">{t("copyLink")}</span>
            </Button>
          )}
          {/* While a resend runs the button stays focusable (aria-disabled, the menu does not open): a disabled
              button would drop the keyboard focus to <body> (R2-UX-2). */}
          <DropdownMenu open={menuOpen} onOpenChange={(next) => setMenuOpen(next && !busy)}>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("actions", { email: inv.email })} aria-disabled={busy || undefined} />}
            >
              {busy ? <Spinner /> : <EllipsisVerticalIcon aria-hidden />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {role !== null && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => void resend(role)}>
                      {live ? <RotateCwIcon aria-hidden /> : <SendIcon aria-hidden />}
                      {!live ? t("sendAgain") : emailEnabled ? t("resend") : t("extend")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={onCancel}>
                  <XIcon aria-hidden />
                  {t("cancel")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <p className="w-full ps-12 text-xs text-muted-foreground sm:w-auto sm:max-w-48 sm:ps-0">{t("ownerOnly")}</p>
      )}
    </li>
  );
}
