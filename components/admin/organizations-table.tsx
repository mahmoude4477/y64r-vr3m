import { Building2Icon, ChevronRightIcon, MailIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { OrgStatusBadges, YourRoleBadge } from "@/components/admin/badges";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { orgNames } from "@/lib/admin/display";
import type { OrgListRow } from "@/lib/admin/queries";

/** Institutions of one page: a table from md up, cards on phones. */
export function OrganizationsTable({ organizations }: { organizations: OrgListRow[] }) {
  const t = useTranslations("admin.organizations");
  const types = useTranslations("common.orgType");
  const format = useFormatter();
  const locale = useLocale();
  const n = (v: number) => format.number(v, "integer");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 [contain:inline-size] md:block">
        <Table>
          <TableCaption className="sr-only">{t("table.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.name")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead className="text-end">{t("table.members")}</TableHead>
              <TableHead className="text-end">{t("table.departments")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="pe-4">{t("table.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((o) => {
              const names = orgNames(o, locale);
              return (
                <TableRow key={o.id}>
                  <TableCell className="ps-4">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/admin/organizations/${o.id}`} className="truncate font-medium hover:underline">
                        <bdi>{names.primary}</bdi>
                      </Link>
                      {names.secondary && (
                        <span className="truncate text-xs text-muted-foreground"><bdi>{names.secondary}</bdi></span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{o.type ? types(o.type) : <span className="text-muted-foreground">{t("noType")}</span>}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    <span className="inline-flex flex-col items-end">
                      {n(o.members)}
                      {o.pendingInvitations > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("badges.invitations", { count: o.pendingInvitations, n: n(o.pendingInvitations) })}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{n(o.departments)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      <OrgStatusBadges suspended={o.suspended} hasOwner={o.hasOwner} />
                      <YourRoleBadge role={o.viewerRole} />
                    </span>
                  </TableCell>
                  <TableCell className="pe-4 text-muted-foreground tabular-nums">{format.dateTime(o.createdAt, "date")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={t("table.caption")}>
        {organizations.map((o) => {
          const names = orgNames(o, locale);
          return (
            <li key={o.id}>
              <Link
                href={`/admin/organizations/${o.id}`}
                className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2Icon aria-hidden className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">
                    <bdi>{names.primary}</bdi>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {o.type ? types(o.type) : t("noType")} · {t("table.members")}: {n(o.members)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <OrgStatusBadges suspended={o.suspended} hasOwner={o.hasOwner} />
                    <YourRoleBadge role={o.viewerRole} />
                    {o.pendingInvitations > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MailIcon aria-hidden className="size-3" />
                        {t("badges.invitations", { count: o.pendingInvitations, n: n(o.pendingInvitations) })}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
