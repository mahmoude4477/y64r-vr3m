import { useFormatter, useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { PersonRef, ScanDetail } from "@/lib/scans/detail";
import { cn } from "@/lib/utils";
import { UserText } from "./user-text";

/**
 * Who, what, where and when of one scan. A description list. Names typed by people are isolated (UserText).
 *  - "report": the full record a printed or saved report needs on its own: institution, protocol, area, department,
 *    examiner, dates (the app chrome with the institution switcher is hidden in print).
 *  - "review": what the header does not say already (area and protocol are the title and its subtitle), two columns
 *    even on phones, so the checklist starts sooner.
 */
export function ScanMeta({ scan, variant, className }: { scan: ScanDetail; variant: "review" | "report"; className?: string }) {
  const t = useTranslations("scans.detail.meta");
  const format = useFormatter();
  const report = variant === "report";
  const date = (d: Date) => (
    <time dateTime={d.toISOString()} className="tabular-nums print:whitespace-nowrap">
      {format.dateTime(d, "dateTime")}
    </time>
  );
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm print:grid-cols-3", report ? "sm:grid-cols-2" : "grid-cols-2", className)}>
      {report && (
        <Item label={t("institution")} className="sm:col-span-2 print:col-span-3">
          <UserText className="font-medium">{scan.institution}</UserText>
        </Item>
      )}
      {report && (
        <Item label={t("protocol")} className="sm:col-span-2 print:col-span-3">
          <span className="flex flex-wrap items-center gap-2">
            <ProtocolIcon name={scan.protocol.icon} className="size-4 shrink-0 text-muted-foreground" />
            <Link href={`/protocols/${scan.protocol.slug}`} className="font-medium underline-offset-4 hover:underline print:no-underline">
              {scan.protocol.title}
            </Link>
            {scan.protocol.custom && <Badge variant="secondary">{t("customProtocol")}</Badge>}
          </span>
        </Item>
      )}
      {report && (
        <Item label={t("area")}>
          <UserText>{scan.areaLabel}</UserText>
        </Item>
      )}
      <Item label={t("department")}>
        {scan.department ? <UserText>{scan.department}</UserText> : <span className="text-muted-foreground">{t("noDepartment")}</span>}
      </Item>
      <Item label={t("examiner")}>
        <Person person={scan.examiner} />
      </Item>
      <Item label={t("started")}>{date(scan.startedAt)}</Item>
      <Item label={t("analyzed")}>
        {scan.analyzedAt ? (
          date(scan.analyzedAt)
        ) : (
          <span className="text-muted-foreground">{scan.status === "finalized" ? t("notAnalyzed") : t("notAnalyzedYet")}</span>
        )}
      </Item>
      {scan.finalizedAt && <Item label={t("finalized")}>{date(scan.finalizedAt)}</Item>}
      {scan.finalizedBy && (
        <Item label={t("finalizedBy")}>
          <Person person={scan.finalizedBy} />
        </Item>
      )}
    </dl>
  );
}

function Item({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** A person's name; "(you)" for the viewer on screen only, since a printed report is read by others. */
export function Person({ person }: { person: PersonRef }) {
  const t = useTranslations("scans.detail.meta");
  const common = useTranslations("common");
  if (person.deleted || !person.name) return <span className="text-muted-foreground">{common("deletedUser")}</span>;
  // Only the name is isolated: "(you)" follows the page's direction (an Arabic name on the English page and the reverse).
  return (
    <span>
      <UserText>{person.name}</UserText>
      {person.isMe && <span className="print:hidden"> {t("youSuffix")}</span>}
    </span>
  );
}
