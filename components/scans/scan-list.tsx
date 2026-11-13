import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ImageIcon, LayersIcon, UserIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { type ScanFilters, scanFiltersQuery } from "@/lib/scans/filters";
import type { ScanListPage, ScanListRow } from "@/lib/scans/queries";
import { cn } from "@/lib/utils";
import { UserText } from "./user-text";
import { RiskBadge, ScanStatusBadge, ScoreBadge } from "@/components/shared/status-badges";
import { buttonVariants } from "@/components/ui/button";

/**
 * The institution's scans. Each row / card is one link to the scan. Rendered on the server; numbers come from the
 * database. The layout follows the width the list really has (a container query: the sidebar takes 16rem from 768 px
 * up, so the viewport says little), and no column ever hides in the table's own scroll box:
 *  - under 44rem (phones, tablets with the sidebar open): cards (CONVENTIONS 9: no horizontal scroll at 390 px);
 *  - 44-60rem (small laptops, iPad landscape): a table of area, status, result and date, with the department and the
 *    examiner under the area, as on the cards;
 *  - from 60rem: every column.
 */
export function ScanList({ data, filters }: { data: ScanListPage; filters: ScanFilters }) {
  const t = useTranslations("scans.list");
  return (
    <div className="@container flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("results", { count: data.total })}
      </p>
      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 @min-[44rem]:block">
        <Table>
          <TableCaption className="sr-only">{t("caption")}</TableCaption>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="ps-4">{t("columns.area")}</TableHead>
              <TableHead className={WIDE_ONLY}>{t("columns.department")}</TableHead>
              <TableHead className={WIDE_ONLY}>{t("columns.examiner")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.result")}</TableHead>
              <TableHead className="pe-4">{t("columns.date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <ScanTableRow key={row.id} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 @min-[44rem]:hidden">
        {data.rows.map((row) => (
          <li key={row.id}>
            <ScanCard row={row} />
          </li>
        ))}
      </ul>
      <ScanPagination page={data.page} pages={data.pages} filters={filters} />
    </div>
  );
}

/** Department and examiner get their own columns only when every column fits (60rem); below, they sit under the area. */
const WIDE_ONLY = "hidden @min-[60rem]:table-cell";

function Result({ row }: { row: ScanListRow }) {
  const t = useTranslations("scans.list");
  if (row.status !== "finalized") return <span className="text-sm text-muted-foreground">{t("pending")}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <ScoreBadge score={row.score} />
      {row.riskLevel && <RiskBadge level={row.riskLevel} />}
    </span>
  );
}

function ExaminerName({ row }: { row: ScanListRow }) {
  const common = useTranslations("common");
  if (row.examinerDeleted || !row.examinerName) return <span className="text-muted-foreground">{common("deletedUser")}</span>;
  return <UserText>{row.examinerName}</UserText>;
}

function ScanTableRow({ row }: { row: ScanListRow }) {
  const t = useTranslations("scans.list");
  const format = useFormatter();
  return (
    <TableRow className="relative hover:bg-muted/40 has-[a:focus-visible]:bg-muted/40">
      <TableCell className="max-w-72 ps-4 whitespace-normal [overflow-wrap:anywhere]">
        {/* The link covers the whole row (::after); keyboard focus draws the app's 3 px ring around that row box. */}
        <Link
          href={`/scans/${row.id}`}
          className="font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-sm after:content-[''] hover:underline focus-visible:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
        >
          <UserText>{row.areaLabel}</UserText>
        </Link>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ProtocolIcon name={row.protocolIcon} className="size-3.5 shrink-0" />
          <span className="truncate">{row.protocolTitle}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground @min-[60rem]:hidden">
          <span className="flex items-center gap-1">
            <LayersIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">{t("columns.department")}: </span>
            {row.departmentName ? <UserText>{row.departmentName}</UserText> : t("noDepartment")}
          </span>
          <span className="flex items-center gap-1">
            <UserIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">{t("columns.examiner")}: </span>
            <ExaminerName row={row} />
          </span>
        </span>
      </TableCell>
      <TableCell className={cn(WIDE_ONLY, "max-w-44 whitespace-normal text-muted-foreground [overflow-wrap:anywhere]")}>
        {row.departmentName ? <UserText>{row.departmentName}</UserText> : t("noDepartment")}
      </TableCell>
      <TableCell className={cn(WIDE_ONLY, "max-w-44 whitespace-normal [overflow-wrap:anywhere]")}>
        <ExaminerName row={row} />
      </TableCell>
      <TableCell>
        <ScanStatusBadge status={row.status} />
      </TableCell>
      <TableCell>
        <Result row={row} />
      </TableCell>
      <TableCell className="pe-4 text-muted-foreground tabular-nums">
        <time dateTime={row.createdAt.toISOString()}>{format.dateTime(row.createdAt, "dateTime")}</time>
      </TableCell>
    </TableRow>
  );
}

function ScanCard({ row }: { row: ScanListRow }) {
  const t = useTranslations("scans.list");
  const format = useFormatter();
  return (
    <Link
      href={`/scans/${row.id}`}
      className="group flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ProtocolIcon name={row.protocolIcon} className="size-4.5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium break-words group-hover:underline">
              <UserText>{row.areaLabel}</UserText>
            </span>
            <span className="text-xs text-muted-foreground">{row.protocolTitle}</span>
          </span>
        </span>
        <ScanStatusBadge status={row.status} className="shrink-0" />
      </span>
      <Result row={row} />
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <LayersIcon aria-hidden className="size-3.5" />
          {row.departmentName ? <UserText>{row.departmentName}</UserText> : t("noDepartment")}
        </span>
        <span className="flex items-center gap-1">
          <UserIcon aria-hidden className="size-3.5" />
          <ExaminerName row={row} />
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          <CalendarIcon aria-hidden className="size-3.5" />
          <time dateTime={row.createdAt.toISOString()}>{format.dateTime(row.createdAt, "dateTime")}</time>
        </span>
        <span className="flex items-center gap-1">
          <ImageIcon aria-hidden className="size-3.5" />
          {t("photos", { count: row.photoCount })}
        </span>
      </span>
    </Link>
  );
}

function ScanPagination({ page, pages, filters }: { page: number; pages: number; filters: ScanFilters }) {
  const t = useTranslations("scans.list.pagination");
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = scanFiltersQuery({ ...filters, page: p });
    return q ? `/scans?${q}` : "/scans";
  };
  const linkClass = buttonVariants({ variant: "outline" });
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
          {t("previous")}
        </Link>
      ) : (
        <span aria-hidden className={cn(linkClass, disabled)}>
          <ChevronLeftIcon className="rtl:rotate-180" />
          {t("previous")}
        </span>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        {t("page", { page: String(page), pages: String(pages) })}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          {t("next")}
          <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
        </Link>
      ) : (
        <span aria-hidden className={cn(linkClass, disabled)}>
          {t("next")}
          <ChevronRightIcon className="rtl:rotate-180" />
        </span>
      )}
    </nav>
  );
}
