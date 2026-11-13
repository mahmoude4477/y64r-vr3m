import { ArrowLeftIcon, Building2Icon, InfoIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/i18n-content";
import { getInstitutionProtocolForAdmin } from "@/lib/protocols/editor-queries";
import { summarizeSteps } from "@/lib/protocols/steps";
import { ProtocolStatusBadge } from "../editor/status-badge";
import { CategoryBadge } from "../protocol-badges";
import { StepList } from "../step-list";

/**
 * Platform admin, read-only: an institution's own protocol (/admin/protocols/[id]). Institutions manage their protocols
 * themselves; the admin can look at any of them, in any state. The caller already ran requireContentEditor().
 */
export async function InstitutionProtocolView({ id }: { id: string }) {
  const [protocol, locale] = await Promise.all([getInstitutionProtocolForAdmin(id), getLocale()]);
  if (!protocol) notFound();
  const [t, tm, td, format] = await Promise.all([
    getTranslations("protocols.admin.readOnly"),
    getTranslations("protocols.manage"),
    getTranslations("protocols.detail"),
    getFormatter(),
  ]);
  const title = pick(protocol, "title", locale);
  const org = protocol.organization;
  const orgName = org ? (locale === "en" && org.nameEn ? org.nameEn : org.name) : "";
  const summary = summarizeSteps(protocol.steps);

  return (
    <article className="flex max-w-4xl flex-col gap-6" aria-labelledby={`inst-protocol-title-${protocol.id}`}>
      <BreadcrumbLabel label={title} />
      <header className="flex flex-col gap-3">
        <Link
          href="/admin/protocols?view=institutions"
          className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
          {t("back")}
        </Link>
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ProtocolIcon name={protocol.icon} className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <ProtocolStatusBadge published={protocol.isPublished} />
              <CategoryBadge category={protocol.category} />
            </div>
            <h1 id={`inst-protocol-title-${protocol.id}`} className="text-2xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2Icon aria-hidden className="size-4 shrink-0" />
              {orgName}
            </p>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{pick(protocol, "summary", locale)}</p>
          </div>
        </div>
        <div role="note" className="flex max-w-3xl items-start gap-2.5 rounded-xl bg-secondary/60 p-3 text-sm ring-1 ring-border">
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="leading-relaxed">
            {t("note", { institution: orgName })}{" "}
            {protocol.sourceProtocol
              ? t("basedOn", { title: pick(protocol.sourceProtocol, "title", locale) })
              : t("own")}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <li>{tm("steps", { count: summary.total })}</li>
          <li>{tm("scans", { count: protocol._count.scans })}</li>
          <li>{tm("scenarios", { count: protocol._count.scenarios })}</li>
          <li>{tm("updated", { date: format.dateTime(protocol.updatedAt, "date") })}</li>
        </ul>
      </header>

      <section aria-labelledby={`inst-protocol-about-${protocol.id}`} className="flex flex-col gap-2">
        <h2 id={`inst-protocol-about-${protocol.id}`} className="text-lg font-semibold">
          {td("about")}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-foreground/90">{pick(protocol, "description", locale)}</p>
      </section>
      <section aria-labelledby={`inst-protocol-steps-${protocol.id}`} className="flex flex-col gap-3">
        <h2 id={`inst-protocol-steps-${protocol.id}`} className="text-lg font-semibold">
          {td("steps")}
        </h2>
        <StepList steps={protocol.steps} locale={locale} />
      </section>
    </article>
  );
}
