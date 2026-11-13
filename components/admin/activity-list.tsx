import { Building2Icon, TagIcon, UserRoundIcon, VenetianMaskIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { auditActionKey, auditActorView, auditTargetTypeKey } from "@/lib/admin/audit-display";
import type { ActivityRow } from "@/lib/admin/queries";

/** The newest audit rows: who (CONVENTIONS 6 display rule), what, on which user / institution, and when. */
export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const t = useTranslations("admin.activity");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();

  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ol className="flex flex-col divide-y">
      {rows.map((row) => {
        const actor = auditActorView(row);
        const key = auditActionKey(row.action);
        const impersonating = row.impersonating;
        const target = row.target;
        return (
          <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
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
                  {key ? t(`actions.${key}`) : <code className="font-mono text-xs" dir="ltr">{row.action}</code>}
                </span>
              </p>
              <time dateTime={row.createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {format.dateTime(row.createdAt, "dateTime")}
              </time>
            </div>
            {(target || impersonating) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {target?.type === "user" && (
                  <span className="inline-flex items-center gap-1">
                    <UserRoundIcon aria-hidden className="size-3.5" />
                    <span className="sr-only">{t("targetUser")}: </span>
                    {target.exists ? (
                      <Link href={`/admin/users/${target.id}`} className="inline-flex min-h-6 items-center hover:text-foreground hover:underline">
                        <bdi>{target.name}</bdi>
                      </Link>
                    ) : (
                      t("deletedTarget")
                    )}
                  </span>
                )}
                {target?.type === "organization" && (
                  <span className="inline-flex items-center gap-1">
                    <Building2Icon aria-hidden className="size-3.5" />
                    <span className="sr-only">{t("targetOrganization")}: </span>
                    {target.exists ? (
                      <Link
                        href={`/admin/organizations/${target.id}`}
                        className="inline-flex min-h-6 items-center hover:text-foreground hover:underline"
                      >
                        <bdi>{(locale === "en" && target.nameEn) || target.name}</bdi>
                      </Link>
                    ) : (
                      t("deletedTarget")
                    )}
                  </span>
                )}
                {target?.type === "other" && <OtherTarget label={target.label} />}
                {impersonating && (
                  <span className="inline-flex items-center gap-1">
                    <VenetianMaskIcon aria-hidden className="size-3.5" />
                    {impersonating.exists && impersonating.name ? (
                      <Link
                        href={`/admin/users/${impersonating.id}`}
                        className="inline-flex min-h-6 items-center hover:text-foreground hover:underline"
                      >
                        {/* The name isolated (FSI … PDI), as a <bdi> would, inside the translated sentence. */}
                        {t("actingAs", { name: `⁨${impersonating.name}⁩` })}
                      </Link>
                    ) : (
                      t("impersonating")
                    )}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A target that is neither a known user nor an institution: its type in words (the code only for an unknown type). */
function OtherTarget({ label }: { label: string }) {
  const t = useTranslations("admin.audit");
  const key = auditTargetTypeKey(label);
  return (
    <span className="inline-flex items-center gap-1">
      <TagIcon aria-hidden className="size-3.5" />
      {key ? (
        t(`targetTypes.${key}`)
      ) : (
        <code className="font-mono" dir="ltr">
          {label}
        </code>
      )}
    </span>
  );
}
