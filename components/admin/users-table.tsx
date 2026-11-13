import { ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { PlatformRoleBadge, ToneBadge, UserStatusBadges } from "@/components/admin/badges";
import { InitialsAvatar } from "@/components/admin/initials-avatar";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { UserListRow } from "@/lib/admin/queries";
import { isPlatformAdminRole, isProtocolEditorRole } from "@/lib/permissions";

/** Users of one page: a table from md up, a list of cards on phones (no horizontal page scroll at 390 px). */
export function UsersTable({ users, viewerId }: { users: UserListRow[]; viewerId: string }) {
  const t = useTranslations("admin.users");
  const format = useFormatter();

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 [contain:inline-size] md:block">
        <Table>
          <TableCaption className="sr-only">{t("table.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.user")}</TableHead>
              <TableHead>{t("table.role")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="text-end">{t("table.institutions")}</TableHead>
              <TableHead className="pe-4">{t("table.joined")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="ps-4">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={u.name} />
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/admin/users/${u.id}`} className="truncate font-medium hover:underline">
                        <bdi>{u.name}</bdi>
                      </Link>
                      {/* LTR on the truncating box itself: the ellipsis cuts the domain, never the start of the address. */}
<span dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right">{u.email}</span>
                    </div>
                    {u.id === viewerId && <ToneBadge kind="primary">{t("badges.you")}</ToneBadge>}
                  </div>
                </TableCell>
                <TableCell>
                  <PlatformRoleBadge admin={isPlatformAdminRole(u.role)} protocolEditor={isProtocolEditorRole(u.role)} />
                </TableCell>
                <TableCell>
                  <UserStatusBadges bannedNow={u.bannedNow} emailVerified={u.emailVerified} mustChangePassword={u.mustChangePassword} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{format.number(u.memberships, "integer")}</TableCell>
                <TableCell className="pe-4 text-muted-foreground tabular-nums">{format.dateTime(u.createdAt, "date")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={t("table.caption")}>
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <InitialsAvatar name={u.name} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">
                  <bdi>{u.name}</bdi>
                </span>
                {/* LTR on the truncating box itself: the ellipsis cuts the domain, never the start of the address. */}
<span dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right">{u.email}</span>
                <span className="flex flex-wrap gap-1">
                  <PlatformRoleBadge admin={isPlatformAdminRole(u.role)} protocolEditor={isProtocolEditorRole(u.role)} />
                  <UserStatusBadges bannedNow={u.bannedNow} emailVerified={u.emailVerified} mustChangePassword={u.mustChangePassword} />
                  {u.id === viewerId && <ToneBadge kind="primary">{t("badges.you")}</ToneBadge>}
                </span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
