"use client";

import { UserMinusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ToneBadge } from "@/components/admin/badges";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { InitialsAvatar } from "@/components/admin/initials-avatar";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { changeMemberRoleAction, removeMemberAction } from "@/lib/admin/organization-actions";
import { ORG_ROLES, type OrgRole } from "@/lib/permissions";

const RANK: Record<OrgRole, number> = { owner: 3, admin: 2, examiner: 1, trainee: 0 };

/** An owner or admin moved to a role with fewer rights. */
function lowersRights(from: OrgRole | null, to: OrgRole): boolean {
  return (from === "owner" || from === "admin") && RANK[to] < RANK[from];
}

export type MemberView = {
  id: string;
  role: OrgRole | null;
  joinedAt: string;
  user: { id: string; name: string; email: string; bannedNow: boolean };
  pendingInvitationsSent: number;
};

/**
 * Members of an institution with their role (a select per member) and "remove". The server keeps at least one owner
 * while the institution has members (admin.errors.lastOwner) and takes the account lock for owner changes.
 */
export function OrganizationMembers({
  organizationId,
  members,
  viewerId,
}: {
  organizationId: string;
  members: MemberView[];
  viewerId: string;
}) {
  const t = useTranslations("admin.org.members");
  const roles = useTranslations("common.roles");
  const format = useFormatter();
  const run = useAdminAction();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MemberView | null>(null);
  // Taking rights away (an owner or admin moved to a lesser role) asks first, like every other admin change; giving
  // more applies at once.
  const [lowering, setLowering] = useState<{ member: MemberView; role: OrgRole } | null>(null);
  const roleItems = Object.fromEntries(ORG_ROLES.map((r) => [r, roles(r)]));

  if (members.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  async function changeRole(member: MemberView, role: OrgRole) {
    if (role === member.role) return;
    setBusy(member.id);
    const result = await run(changeMemberRoleAction, { organizationId, memberId: member.id, role }, t("roleChanged"));
    setBusy(null);
    const error = errorOf(result);
    if (error) toast.error(error);
  }

  return (
    <>
      <ul className="flex flex-col divide-y">
        {members.map((m) => {
          const self = m.user.id === viewerId;
          return (
            <li key={m.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <InitialsAvatar name={m.user.name} />
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/users/${m.user.id}`} className="truncate text-sm font-medium hover:underline">
                      <bdi>{m.user.name}</bdi>
                    </Link>
                    {self && <ToneBadge kind="primary">{t("you")}</ToneBadge>}
                    {m.user.bannedNow && <ToneBadge kind="danger">{t("banned")}</ToneBadge>}
                  </span>
                  {/* LTR on the truncating box itself: the ellipsis cuts the domain, never the start of the address. */}
<span dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right">{m.user.email}</span>
                  <span className="text-xs text-muted-foreground">{t("joined", { date: format.dateTime(new Date(m.joinedAt), "date") })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <Select
                  items={roleItems}
                  value={m.role}
                  disabled={busy === m.id}
                  onValueChange={(v) => {
                    if (!v || v === m.role) return;
                    if (lowersRights(m.role, v as OrgRole)) setLowering({ member: m, role: v as OrgRole });
                    else void changeRole(m, v as OrgRole);
                  }}
                >
                  <SelectTrigger className="min-w-40 flex-1 sm:flex-none" aria-label={t("roleOf", { name: m.user.name })}>
                    {busy === m.id && <Spinner />}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roles(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" aria-label={t("removeAria", { name: m.user.name })} title={t("remove")} onClick={() => setRemoving(m)}>
                  <UserMinusIcon aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={lowering !== null}
        onOpenChange={(v) => !v && setLowering(null)}
        title={t("lowerTitle", { name: lowering?.member.user.name ?? "", role: lowering ? roles(lowering.role) : "" })}
        description={t("lowerDescription", { from: lowering?.member.role ? roles(lowering.member.role) : "" })}
        confirmLabel={t("lowerConfirm")}
        destructive
        onConfirm={async () =>
          lowering
            ? errorOf(await run(changeMemberRoleAction, { organizationId, memberId: lowering.member.id, role: lowering.role }, t("roleChanged")))
            : null
        }
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t("removeTitle", { name: removing?.user.name ?? "" })}
        description={
          <>
            <p>{t("removeDescription")}</p>
            {removing && removing.pendingInvitationsSent > 0 && (
              <p className="mt-2">{t("removeInvitations", { n: format.number(removing.pendingInvitationsSent, "integer") })}</p>
            )}
          </>
        }
        confirmLabel={t("remove")}
        destructive
        onConfirm={async () => (removing ? errorOf(await run(removeMemberAction, { organizationId, memberId: removing.id }, t("removed"))) : null)}
      />
    </>
  );
}
