"use client";

import { DoorOpenIcon, TriangleAlertIcon, UserPlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { joinOrganizationAction, removeMemberAction } from "@/lib/admin/organization-actions";

/** The platform admin's own membership: join as an owner (to send invitations) or leave again. */
export function OrganizationMembership({
  organizationId,
  displayName,
  membership,
}: {
  organizationId: string;
  displayName: string;
  membership: { memberId: string; roleLabel: string; pendingInvitationsSent: number; ownOwnerInPlace: boolean } | null;
}) {
  const t = useTranslations("admin.org.membership");
  const format = useFormatter();
  const run = useAdminAction();
  const [open, setOpen] = useState(false);

  if (membership) {
    // Its own owner accepted and nothing the admin sent is still waiting: say plainly that it is time to leave, so a
    // platform admin does not keep owner access to a customer's scans, photos and members (that access would even
    // outlive a later demotion from platform admin).
    const shouldLeave = membership.ownOwnerInPlace && membership.pendingInvitationsSent === 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">{t("member", { role: membership.roleLabel })}</p>
        {shouldLeave ? (
          <Alert className="border-warning/40">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t("leaveNowTitle")}</AlertTitle>
            <AlertDescription>{t("leaveNow")}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-muted-foreground">{t("memberHint")}</p>
        )}
        <Button variant={shouldLeave ? "default" : "outline"} className="self-start" onClick={() => setOpen(true)}>
          <DoorOpenIcon aria-hidden className="rtl:-scale-x-100" />
          {t("leave")}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={t("leaveTitle", { name: displayName })}
          description={
            <>
              <p>{t("leaveDescription")}</p>
              {membership.pendingInvitationsSent > 0 && (
                <p className="mt-2">{t("leaveInvitations", { n: format.number(membership.pendingInvitationsSent, "integer") })}</p>
              )}
            </>
          }
          confirmLabel={t("leave")}
          destructive
          onConfirm={async () => errorOf(await run(removeMemberAction, { organizationId, memberId: membership.memberId }, t("left")))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{t("notMember")}</p>
      <p className="text-xs text-muted-foreground">{t("notMemberHint")}</p>
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <UserPlusIcon aria-hidden />
        {t("join")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("joinTitle", { name: displayName })}
        description={t("joinDescription")}
        confirmLabel={t("join")}
        onConfirm={async () => errorOf(await run(joinOrganizationAction, { organizationId }, t("joined")))}
      />
    </div>
  );
}
