import { Building2Icon, ChevronDownIcon, ShieldCheckIcon, TagIcon, UserRoundIcon, VenetianMaskIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import { ToneBadge } from "@/components/admin/badges";
import { Link } from "@/i18n/navigation";
import { auditActionKey, auditActorRoleKey, auditActorView, auditMetaEntries, auditTargetTypeKey } from "@/lib/admin/audit-display";
import type { AuditRow } from "@/lib/admin/audit-queries";
import { orgNames } from "@/lib/admin/display";
import { isPlatformAdminRole } from "@/lib/permissions";

// The rows of /admin/audit: who (CONVENTIONS 6 display rule), what, on what and in which institution, when; the
// details (action code, target id, IP, meta) open in a native disclosure. Everything is text (React escapes it):
// meta is never rendered as HTML.

function TargetLabel({ row }: { row: AuditRow }) {
  const t = useTranslations("admin.audit");
  const locale = useLocale();
  // A user or institution row written without an id (e.g. Better Auth's revoke-user-session, which names only the
  // session) is shown by its type: "Deleted" is only for an id whose row no longer exists.
  if ((row.targetType === "user" || row.targetType === "organization") && !row.targetId) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        {row.targetType === "user" ? <UserRoundIcon aria-hidden className="size-3.5 shrink-0" /> : <Building2Icon aria-hidden className="size-3.5 shrink-0" />}
        <span className="sr-only">{t("target")}: </span>
        {t(`targetTypes.${row.targetType}`)}
      </span>
    );
  }
  if (row.targetType === "user") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <UserRoundIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">{t("target")}: </span>
        {row.targetExists ? (
          <Link href={`/admin/users/${row.targetId}`} className="inline-flex min-h-6 items-center truncate hover:text-foreground hover:underline">
            <bdi>{row.targetName}</bdi>
          </Link>
        ) : (
          t("deletedTarget")
        )}
      </span>
    );
  }
  if (row.targetType === "organization") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <Building2Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">{t("target")}: </span>
        {row.targetExists && row.targetName ? (
          <Link
            href={`/admin/organizations/${row.targetId}`}
            className="inline-flex min-h-6 items-center truncate hover:text-foreground hover:underline"
          >
            <bdi>{orgNames({ name: row.targetName, nameEn: row.targetNameEn }, locale).primary}</bdi>
          </Link>
        ) : (
          t("deletedTarget")
        )}
      </span>
    );
  }
  const typeKey = auditTargetTypeKey(row.targetType);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <TagIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{t("target")}: </span>
      {typeKey ? (
        t(`targetTypes.${typeKey}`)
      ) : (
        <code dir="ltr" className="font-mono">
          {row.targetType}
        </code>
      )}
    </span>
  );
}

export function AuditList({ rows }: { rows: AuditRow[] }) {
  const t = useTranslations("admin.audit");
  const activity = useTranslations("admin.activity");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();

  return (
    <ol className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10" aria-label={t("listLabel")}>
      {rows.map((row) => {
        const actor = auditActorView(row);
        const key = auditActionKey(row.action);
        const meta = auditMetaEntries(row.meta);
        const showOrganization = row.organization && row.targetType !== "organization";
        return (
          <li key={row.id} className="flex flex-col gap-1.5 p-3 sm:px-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="min-w-0 text-sm">
                <span className="font-medium">
                  {actor.kind === "deleted" ? (
                    common("deletedUser")
                  ) : actor.kind === "system" ? (
                    common("system")
                  ) : actor.userId ? (
                    <Link href={`/admin/users/${actor.userId}`} className="inline-flex min-h-6 items-center hover:underline">
                      <bdi>{actor.name || common("deletedUser")}</bdi>
                    </Link>
                  ) : (
                    <bdi>{actor.name}</bdi>
                  )}
                </span>{" "}
                <span className="text-muted-foreground">
                  {key ? (
                    activity(`actions.${key}`)
                  ) : (
                    <code className="font-mono text-xs" dir="ltr">
                      {row.action}
                    </code>
                  )}
                </span>
              </p>
              <time dateTime={row.createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {format.dateTime(row.createdAt, "dateTime")}
              </time>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {actor.kind === "user" && isPlatformAdminRole(row.actorRole) && (
                <ToneBadge kind="primary" icon={ShieldCheckIcon}>
                  {common("roles.platformAdmin")}
                </ToneBadge>
              )}
              <TargetLabel row={row} />
              {showOrganization && row.organization && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Building2Icon aria-hidden className="size-3.5 shrink-0" />
                  <span className="sr-only">{t("institution")}: </span>
                  <Link
                    href={`/admin/organizations/${row.organization.id}`}
                    className="inline-flex min-h-6 items-center truncate hover:text-foreground hover:underline"
                  >
                    <bdi>{orgNames(row.organization, locale).primary}</bdi>
                  </Link>
                </span>
              )}
              {row.impersonatingId && (
                <span className="inline-flex items-center gap-1">
                  <VenetianMaskIcon aria-hidden className="size-3.5" />
                  {row.impersonating ? t("actingAs", { name: row.impersonating.name }) : activity("impersonating")}
                </span>
              )}
            </div>
            <details className="group text-xs">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronDownIcon aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
                {t("details")}
              </summary>
              <dl className="mt-1 grid gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 p-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="text-muted-foreground">{t("fields.action")}</dt>
                <dd>
                  <code dir="ltr" className="font-mono break-all">
                    {row.action}
                  </code>
                </dd>
                <dt className="text-muted-foreground">{t("fields.target")}</dt>
                <dd>
                  <code dir="ltr" className="font-mono break-all">
                    {row.targetType}
                    {row.targetId ? ` · ${row.targetId}` : ""}
                  </code>
                </dd>
                {row.actorRole && (
                  <>
                    <dt className="text-muted-foreground">{t("fields.actorRole")}</dt>
                    <dd>
                      {auditActorRoleKey(row.actorRole) ? (
                        common(`roles.${auditActorRoleKey(row.actorRole)!}`)
                      ) : (
                        <code dir="ltr" className="font-mono">
                          {row.actorRole}
                        </code>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("fields.ip")}</dt>
                <dd>
                  {row.ip ? (
                    <code dir="ltr" className="font-mono break-all">
                      {row.ip}
                    </code>
                  ) : (
                    t("fields.none")
                  )}
                </dd>
                {meta.map((m) => (
                  <Fragment key={m.key}>
                    <dt className="text-muted-foreground">
                      <code dir="ltr" className="font-mono">
                        {m.key}
                      </code>
                    </dt>
                    <dd>
                      {/* dir="auto": an Arabic value (an institution's name) keeps its own direction. */}
                      <code dir="auto" className="font-mono break-all whitespace-pre-wrap">
                        {m.value}
                      </code>
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
