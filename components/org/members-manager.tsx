"use client";

import { EllipsisVerticalIcon, SearchIcon, ShieldOffIcon, UserMinusIcon, UserRoundCogIcon, UsersRoundIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { ORG_ROLES, type OrgRole } from "@/lib/permissions";
import type { DepartmentRef, OrgInvitationRow, OrgMemberRow } from "@/lib/org/queries";
import { type ActorRef, assignableRoles, compareMembers, isManagerRole, isStaffRole, removeBlock, roleChangeBlock } from "@/lib/org/roles";
import { ConfirmDialog } from "./confirm-dialog";
import { DIALOG_CONTENT, STICKY_FOOTER } from "./dialog-styles";
import { InitialsAvatar } from "./initials-avatar";
import { InvitationsList } from "./invitations-list";
import { InviteDialog } from "./invite-dialog";
import { NameText } from "./name-text";
import { RoleBadge } from "./role-badge";
import { RoleChoice } from "./role-choice";
import { callAuth, useOrgErrorText } from "./use-org-error";

const PAGE_SIZE = 50;
const ALL_ROLES = "all";
/** The list heading: focus goes there when the focused control disappears with its row (WCAG 2.4.3). */
const LIST_HEADING_ID = "members-title";

type OpenDialog = { kind: "role" | "remove"; member: OrgMemberRow } | null;

/**
 * /org/members (client island). Staff see the list; managers (owner / admin) also change roles, remove members and
 * handle invitations. Every change goes through Better Auth's organization endpoints, which enforce the same rules
 * server-side (lib/org/roles.ts mirrors them so the UI never offers what the server refuses), and refreshes the page.
 */
export function MembersManager({
  organizationId,
  actor,
  members,
  invitations,
  departments,
  emailEnabled,
  inviteDays,
  openInvite,
}: {
  organizationId: string;
  actor: ActorRef;
  members: OrgMemberRow[];
  invitations: OrgInvitationRow[] | null;
  departments: DepartmentRef[];
  emailEnabled: boolean;
  inviteDays: number;
  openInvite: boolean;
}) {
  const t = useTranslations("org.members");
  const roleNames = useTranslations("common.roles");
  const format = useFormatter();
  const locale = useLocale();
  const canManage = isManagerRole(actor.role);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<OrgRole | typeof ALL_ROLES>(ALL_ROLES);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const deferredQuery = useDeferredValue(query);

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const sorted = useMemo(() => [...members].sort(compareMembers(locale)), [members, locale]);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase();
    return sorted.filter(
      (m) =>
        (roleFilter === ALL_ROLES || m.role === roleFilter) &&
        (!q || m.name.toLocaleLowerCase().includes(q) || m.email.toLowerCase().includes(q)),
    );
  }, [sorted, deferredQuery, roleFilter]);
  const shown = filtered.slice(0, limit);
  const filtering = deferredQuery.trim() !== "" || roleFilter !== ALL_ROLES;

  const roleItems = { [ALL_ROLES]: t("allRoles"), ...Object.fromEntries(ORG_ROLES.map((r) => [r, roleNames(r)])) };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={LIST_HEADING_ID} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id={LIST_HEADING_ID} tabIndex={-1} className="text-lg font-semibold outline-none">
              {t("listTitle")}
            </h2>
            {/* A status region: while searching it says how many members match (WCAG 4.1.3). */}
            <p role="status" className="text-sm text-muted-foreground">
              {filtering
                ? t("filteredCount", {
                    shown: format.number(filtered.length, "integer"),
                    total: format.number(members.length, "integer"),
                  })
                : t("count", { count: members.length, n: format.number(members.length, "integer") })}
            </p>
          </div>
          {canManage && (
            <InviteDialog
              organizationId={organizationId}
              actorRole={actor.role}
              departments={departments}
              emailEnabled={emailEnabled}
              inviteDays={inviteDays}
              defaultOpen={openInvite}
            />
          )}
        </div>
        {!canManage && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{t("readOnly")}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="members-search" className="sr-only">
              {t("search")}
            </Label>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                id="members-search"
                type="search"
                value={query}
                placeholder={t("searchPlaceholder")}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
              />
            </InputGroup>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="members-role-filter" className="shrink-0 text-muted-foreground">
              {t("roleFilter")}
            </Label>
            <Select
              items={roleItems}
              value={roleFilter}
              onValueChange={(v) => {
                setRoleFilter(((v as string | null) ?? ALL_ROLES) as OrgRole | typeof ALL_ROLES);
                setLimit(PAGE_SIZE);
              }}
            >
              <SelectTrigger id="members-role-filter" className="w-full min-w-40 sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES}>{t("allRoles")}</SelectItem>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleNames(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRoundIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("noResults")}</EmptyTitle>
              {filtering && (
                <EmptyDescription>
                  <Button
                    variant="link"
                    onClick={() => {
                      setQuery("");
                      setRoleFilter(ALL_ROLES);
                    }}
                  >
                    {t("clearFilters")}
                  </Button>
                </EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <ul aria-labelledby={LIST_HEADING_ID} className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {shown.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                actor={actor}
                ownerCount={ownerCount}
                onAction={(kind) => setDialog({ kind, member })}
              />
            ))}
          </ul>
        )}
        {filtered.length > shown.length && (
          <Button variant="outline" className="self-center" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            {t("showMore")}
          </Button>
        )}
      </section>

      {invitations && (
        <InvitationsList organizationId={organizationId} actorRole={actor.role} invitations={invitations} emailEnabled={emailEnabled} />
      )}

      {canManage && (
        <>
          <ChangeRoleDialog
            organizationId={organizationId}
            actor={actor}
            member={dialog?.kind === "role" ? dialog.member : null}
            onClose={() => setDialog(null)}
          />
          <RemoveMemberDialog
            organizationId={organizationId}
            member={dialog?.kind === "remove" ? dialog.member : null}
            onClose={() => setDialog(null)}
          />
        </>
      )}
    </div>
  );
}

function MemberRow({
  member,
  actor,
  ownerCount,
  onAction,
}: {
  member: OrgMemberRow;
  actor: ActorRef;
  ownerCount: number;
  onAction: (kind: "role" | "remove") => void;
}) {
  const t = useTranslations("org.members");
  const format = useFormatter();
  const self = member.id === actor.memberId;
  const canManage = isManagerRole(actor.role);
  const roleBlock = roleChangeBlock(actor, member, ownerCount);
  const removeBlocked = removeBlock(actor, member, ownerCount);
  const reason = roleBlock === "owner_only" || roleBlock === "last_owner" ? roleBlock : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap">
      <InitialsAvatar name={member.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          {/* title: the full name of a long name cut on a phone. */}
          <NameText title={member.name} className="truncate">
            {member.name}
          </NameText>
          {self && <Badge variant="secondary">{t("you")}</Badge>}
        </p>
        {/* Left-to-right and cut at its end, so the start of the address stays readable on a phone. */}
        <p dir="ltr" title={member.email} className="truncate text-left text-sm text-muted-foreground rtl:text-right">
          {member.email}
        </p>
      </div>
      <div className="order-last flex w-full flex-wrap items-center gap-2 ps-12 sm:order-none sm:w-auto sm:max-w-[45%] sm:justify-end sm:ps-0">
        <RoleBadge role={member.role} />
        {member.departments.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            <span className="sr-only">{t("departmentsLabel")}: </span>
            {member.departments.map((d) => (
              <Badge key={d.id} variant="outline" title={d.name} className="max-w-40">
                <NameText className="truncate">{d.name}</NameText>
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("noDepartment")}</span>
        )}
        <span className="text-xs whitespace-nowrap text-muted-foreground">{t("joined", { date: format.dateTime(member.joinedAt, "date") })}</span>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("actions", { name: member.name })} />}>
            <EllipsisVerticalIcon aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">{member.name}</DropdownMenuLabel>
              <DropdownMenuItem disabled={!!roleBlock} onClick={() => onAction("role")}>
                <UserRoundCogIcon aria-hidden />
                {t("changeRoleAction")}
              </DropdownMenuItem>
              {!self && (
                <DropdownMenuItem variant="destructive" disabled={!!removeBlocked} onClick={() => onAction("remove")}>
                  <UserMinusIcon aria-hidden />
                  {t("removeAction")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {reason && (
              <>
                <DropdownMenuSeparator />
                <p className="flex items-start gap-1.5 px-1.5 py-1 text-xs text-muted-foreground">
                  <ShieldOffIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {t(`blocked.${reason}`)}
                </p>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function ChangeRoleDialog({
  organizationId,
  actor,
  member,
  onClose,
}: {
  organizationId: string;
  actor: ActorRef;
  member: OrgMemberRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("org.members.changeRole");
  const roleNames = useTranslations("common.roles");
  const actions = useTranslations("common.actions");
  const errorText = useOrgErrorText();
  const router = useRouter();
  const [role, setRole] = useState<OrgRole>("trainee");
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the choice each time the dialog opens for a member (state derived from props, no effect).
  if (member && member.id !== shownFor) {
    setShownFor(member.id);
    setRole(member.role ?? "trainee");
    setError(null);
  }

  const self = !!member && member.id === actor.memberId;
  const roles = assignableRoles(actor.role);

  async function save() {
    if (!member) return;
    setPending(true);
    setError(null);
    const result = await callAuth(() => authClient.organization.updateMemberRole({ memberId: member.id, role, organizationId }));
    setPending(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    toast.success(t("success", { name: member.name, role: roleNames(role) }));
    setShownFor(null);
    onClose();
    // A trainee has no institution pages: after stepping down that far, the dashboard opens instead of a not-found
    // page. The refresh renders the app shell again, without the staff navigation.
    if (self && !isStaffRole(role)) router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Dialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setShownFor(null);
          onClose();
        }
      }}
    >
      <DialogContent showCloseButton={false} className={DIALOG_CONTENT}>
        <DialogHeader>
          <DialogTitle>{t("title", { name: member?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <RoleChoice id="change-role" legend={t("legend")} roles={roles} value={role} onChange={setRole} current={member?.role ?? null} />
        {self && !isManagerRole(role) && (
          <p role="status" className="rounded-lg bg-warning/12 px-3 py-2 text-sm">
            {isStaffRole(role) ? t("selfWarning") : t("selfWarningTrainee")}
          </p>
        )}
        <FormError message={error} />
        <DialogFooter className={STICKY_FOOTER}>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{actions("cancel")}</DialogClose>
          <Button onClick={save} disabled={pending || !member || role === member.role}>
            {pending && <Spinner />}
            {pending ? t("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({ organizationId, member, onClose }: { organizationId: string; member: OrgMemberRow | null; onClose: () => void }) {
  const t = useTranslations("org.members.remove");
  const errorText = useOrgErrorText();
  const router = useRouter();
  const [last, setLast] = useState<OrgMemberRow | null>(member);
  if (member && member !== last) setLast(member);
  const shown = member ?? last; // keeps the text while the dialog animates out
  const removed = useRef(false);

  return (
    <ConfirmDialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("title", { name: shown?.name ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      pendingLabel={t("removing")}
      // The row (and its menu button) goes away with the member: focus the list heading instead of <body>.
      finalFocus={() => {
        const target = removed.current ? (document.getElementById(LIST_HEADING_ID) ?? true) : true;
        removed.current = false;
        return target;
      }}
      onConfirm={async () => {
        if (!member) return null;
        const result = await callAuth(() => authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId }));
        if (!result.ok) return errorText(result.error);
        removed.current = true;
        toast.success(t("success", { name: member.name }));
        router.refresh();
        return null;
      }}
    />
  );
}
