import { ChevronRightIcon, ClipboardCheckIcon, GraduationCapIcon, ImageIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { orgNames } from "@/lib/admin/display";
import type { AttemptListRow, ScanListRow } from "@/lib/admin/assessment-queries";
import { pick } from "@/lib/i18n-content";
import { AttemptStatusBadge, RiskBadge, ScanStatusBadge, ScoreBadge } from "@/components/shared/status-badges";

// The two lists of /admin/assessments: a table from md up, cards on phones (no horizontal page scroll at 390 px).

/** Score and risk once the result is final (finalised scan, completed attempt); a dash before that. */
function Result({ final, score, riskLevel }: { final: boolean; score: number | null; riskLevel: ScanListRow["riskLevel"] }) {
  const t = useTranslations("admin.assessments");
  if (!final) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{t("notFinal")}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <ScoreBadge score={score} />
      {riskLevel && <RiskBadge level={riskLevel} />}
    </span>
  );
}

const cardLink =
  "flex items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function ScansTable({ scans }: { scans: ScanListRow[] }) {
  const t = useTranslations("admin.assessments");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const orgName = (o: ScanListRow["organization"]) => (o ? orgNames(o, locale).primary : t("deletedOrganization"));
  const examiner = (s: ScanListRow) => s.examiner?.name ?? common("deletedUser");
  const protocol = (s: ScanListRow) => (s.protocol ? pick(s.protocol, "title", locale) : "—");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 [contain:inline-size] md:block">
        <Table>
          <TableCaption className="sr-only">{t("scansCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.scan")}</TableHead>
              <TableHead>{t("table.institution")}</TableHead>
              <TableHead>{t("table.examiner")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.result")}</TableHead>
              <TableHead className="pe-4">{t("table.date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="max-w-72 ps-4">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/admin/assessments/scans/${s.id}`} className="truncate font-medium hover:underline">
                      <bdi>{s.areaLabel}</bdi>
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      <bdi>{protocol(s)}</bdi>
                      {s.photos > 0 && <> · {t("photos", { count: s.photos, n: format.number(s.photos, "integer") })}</>}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-56">
                  {s.organization ? (
                    <Link href={`/admin/organizations/${s.organization.id}`} className="block truncate hover:underline">
                      <bdi>{orgName(s.organization)}</bdi>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{orgName(null)}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {s.examiner ? (
                    <Link href={`/admin/users/${s.examiner.id}`} className="hover:underline">
                      <bdi>{s.examiner.name}</bdi>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{examiner(s)}</span>
                  )}
                </TableCell>
                <TableCell>
                  <ScanStatusBadge status={s.status} />
                </TableCell>
                <TableCell>
                  <Result final={s.status === "finalized"} score={s.score} riskLevel={s.riskLevel} />
                </TableCell>
                <TableCell className="pe-4 text-muted-foreground tabular-nums">
                  <time dateTime={s.createdAt.toISOString()}>{format.dateTime(s.createdAt, "dateTime")}</time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={t("scansCaption")}>
        {scans.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/assessments/scans/${s.id}`} className={cardLink}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardCheckIcon aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">
                  <bdi>{s.areaLabel}</bdi>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  <bdi>{protocol(s)}</bdi> · <bdi>{orgName(s.organization)}</bdi>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  <bdi>{examiner(s)}</bdi> · <time dateTime={s.createdAt.toISOString()}>{format.dateTime(s.createdAt, "dateTime")}</time>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <ScanStatusBadge status={s.status} />
                  {s.status === "finalized" && <Result final score={s.score} riskLevel={s.riskLevel} />}
                  {s.photos > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon aria-hidden className="size-3" />
                      {t("photos", { count: s.photos, n: format.number(s.photos, "integer") })}
                    </span>
                  )}
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

export function AttemptsTable({ attempts }: { attempts: AttemptListRow[] }) {
  const t = useTranslations("admin.assessments");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const scenario = (a: AttemptListRow) => (a.scenario ? pick(a.scenario, "title", locale) : "—");
  const protocol = (a: AttemptListRow) => (a.scenario?.protocol ? pick(a.scenario.protocol, "title", locale) : null);
  const orgName = (a: AttemptListRow) => (a.organization ? orgNames(a.organization, locale).primary : t("individual"));
  const trainee = (a: AttemptListRow) => a.user?.name ?? common("deletedUser");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 [contain:inline-size] md:block">
        <Table>
          <TableCaption className="sr-only">{t("attemptsCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">{t("table.scenario")}</TableHead>
              <TableHead>{t("table.trainee")}</TableHead>
              <TableHead>{t("table.institution")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.result")}</TableHead>
              <TableHead className="pe-4">{t("table.started")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attempts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="max-w-72 ps-4">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/admin/assessments/attempts/${a.id}`} className="truncate font-medium hover:underline">
                      <bdi>{scenario(a)}</bdi>
                    </Link>
                    {protocol(a) && (
                      <span className="truncate text-xs text-muted-foreground">
                        <bdi>{protocol(a)}</bdi>
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {a.user ? (
                    <Link href={`/admin/users/${a.user.id}`} className="hover:underline">
                      <bdi>{a.user.name}</bdi>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{trainee(a)}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-56">
                  {a.organization ? (
                    <Link href={`/admin/organizations/${a.organization.id}`} className="block truncate hover:underline">
                      <bdi>{orgName(a)}</bdi>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{orgName(a)}</span>
                  )}
                </TableCell>
                <TableCell>
                  <AttemptStatusBadge status={a.status} />
                </TableCell>
                <TableCell>
                  <Result final={a.status === "completed"} score={a.score} riskLevel={a.riskLevel} />
                </TableCell>
                <TableCell className="pe-4 text-muted-foreground tabular-nums">
                  <time dateTime={a.startedAt.toISOString()}>{format.dateTime(a.startedAt, "dateTime")}</time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={t("attemptsCaption")}>
        {attempts.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/assessments/attempts/${a.id}`} className={cardLink}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GraduationCapIcon aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">
                  <bdi>{scenario(a)}</bdi>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  <bdi>{trainee(a)}</bdi> · <bdi>{orgName(a)}</bdi>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <time dateTime={a.startedAt.toISOString()}>{format.dateTime(a.startedAt, "dateTime")}</time>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <AttemptStatusBadge status={a.status} />
                  {a.status === "completed" && <Result final score={a.score} riskLevel={a.riskLevel} />}
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
