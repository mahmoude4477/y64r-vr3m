import { PlusIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DeleteScanButton } from "@/components/scans/delete-scan-button";
import { PrintButton } from "@/components/scans/print-button";
import { ReportFocus } from "@/components/scans/report-focus";
import { ScanAnalysisCard, ScanAnalysisRunning } from "@/components/scans/scan-analysis-card";
import { ScanDetailSkeleton } from "@/components/scans/scan-detail-skeleton";
import { ScanMeta } from "@/components/scans/scan-meta";
import { ScanNotesForm } from "@/components/scans/scan-notes-form";
import { ScanPhotos } from "@/components/scans/scan-photos";
import { type ReportRecommendation, ScanReport } from "@/components/scans/scan-report";
import { ScanReview } from "@/components/scans/scan-review";
import { PageHeader } from "@/components/shared/page-header";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { breadcrumbText, ScanPageFrame } from "@/components/scans/scan-page";
import { UserText } from "@/components/scans/user-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { checkAiQuota } from "@/lib/ai/limits";
import { type Scope, scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { recommendationsFor } from "@/lib/recommendations";
import { ID_PATTERN } from "@/lib/scans/constants";
import { loadScanDetail, type ScanDetail } from "@/lib/scans/detail";
import { reportOutcome } from "@/lib/scans/review-core";
import { scanServicesAtRequest } from "@/lib/scans/services";
import { scoreScan } from "@/lib/scoring";
import { requireOrgRole } from "@/lib/session";
import { ScanStatusBadge } from "@/components/shared/status-badges";
import { buttonVariants } from "@/components/ui/button";

// One scan of the active institution (staff only: owner / admin / examiner). Before finalising: the examiner's review
// (AI verdicts, overrides, non-visual answers, notes, live score, finalise, delete). After: the read-only, printable
// report. Nothing about the scan is in the static shell: the guarded data component renders the whole page
// (CONVENTIONS 4), so the denial for a trainee or another institution is the not-found page.

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: nav("sub.scanDetail") };
}

export default function ScanPage({ params }: PageProps<"/[locale]/scans/[id]">) {
  return (
    <ScanPageFrame>
      <Suspense fallback={<ScanDetailSkeleton />}>
        <ScanData params={params} />
      </Suspense>
    </ScanPageFrame>
  );
}

async function ScanData({ params }: { params: PageProps<"/[locale]/scans/[id]">["params"] }) {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const scope = scopeOf(ctx);
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  if (!ID_PATTERN.test(id)) notFound();
  const [scan, services] = await Promise.all([loadScanDetail(scope, id, locale), scanServicesAtRequest()]);
  if (!scan) notFound();

  if (scan.status === "finalized") return <ReportView scan={scan} scope={scope} locale={locale} storage={services.storage} />;
  return <ReviewView scan={scan} userId={ctx.user.id} storage={services.storage} ai={services.ai} />;
}

/** The h1 text; focusable so the report can take focus after "Finalize" (ReportFocus). */
function Title({ scan }: { scan: ScanDetail }) {
  return (
    <span id="scan-title" tabIndex={-1} className="outline-none">
      <UserText>{scan.areaLabel}</UserText>
    </span>
  );
}

async function ReviewView({ scan, userId, storage, ai }: { scan: ScanDetail; userId: string; storage: boolean; ai: boolean }) {
  const t = await getTranslations("scans.detail");
  const nav = await getTranslations("nav");
  const canAnalyze = (scan.status === "draft" || scan.status === "failed") && scan.visualSteps > 0 && scan.photos.length > 0 && storage;
  const quota = canAnalyze && ai ? await checkAiQuota(userId) : null;
  const hasAi = scan.steps.some((s) => s.aiVerdict);
  const deleteButton = scan.canDelete ? <DeleteScanButton scanId={scan.id} photoCount={scan.photos.length} /> : null;

  const header = (
    <PageHeader
      title={<Title scan={scan} />}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ScanStatusBadge status={scan.status} />
          <span>{scan.protocol.title}</span>
        </span>
      }
      // Phones: the delete button goes to the end of the page (the checklist comes first, and it is out of a thumb's way).
      actions={deleteButton && <div className="hidden sm:contents">{deleteButton}</div>}
    />
  );
  const meta = (
    <section aria-label={nav("sub.scanDetail")} className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <ScanMeta scan={scan} variant="review" />
    </section>
  );
  const photos = (
    <section aria-labelledby="scan-photos-title" className="flex flex-col gap-3">
      <h2 id="scan-photos-title" className="text-lg font-semibold">
        {t("photos.title")}
      </h2>
      <ScanPhotos photos={scan.photos} area={scan.areaLabel} storage={storage} />
    </section>
  );

  if (scan.status === "analyzing") {
    return (
      <>
        <BreadcrumbLabel label={breadcrumbText(scan.areaLabel)} />
        {header}
        <div className="flex flex-col gap-6">
          <ScanAnalysisRunning scanId={scan.id} />
          {meta}
          {photos}
        </div>
      </>
    );
  }

  return (
    <>
      <BreadcrumbLabel label={breadcrumbText(scan.areaLabel)} />
      {header}
      <p className="-mt-3 max-w-3xl text-sm text-muted-foreground">{hasAi ? t("review.description") : t("review.descriptionManual")}</p>
      <ScanReview
        // A finished analysis (router.refresh) brings new AI verdicts: start the review state again from them.
        key={`${scan.status}-${scan.analyzedAt?.getTime() ?? 0}`}
        scanId={scan.id}
        steps={scan.steps}
        after={<ScanNotesForm scanId={scan.id} notes={scan.notes} />}
      >
        {canAnalyze && (
          <ScanAnalysisCard scanId={scan.id} failed={scan.status === "failed"} ai={ai} aiRemaining={quota ? quota.remaining : null} />
        )}
        {(scan.status === "draft" || scan.status === "failed") && scan.visualSteps === 0 && (
          <p className="text-sm text-muted-foreground">{t("analysis.noVisual")}</p>
        )}
        {meta}
        {photos}
        {(scan.overallNotes || hasAi) && (
          <Alert>
            <SparklesIcon aria-hidden />
            <AlertTitle>{t("review.aiSummary")}</AlertTitle>
            <AlertDescription>
              {scan.overallNotes && <p>{scan.overallNotes}</p>}
              <p className="font-medium text-foreground">{t("review.aiCaution")}</p>
            </AlertDescription>
          </Alert>
        )}
      </ScanReview>
      {deleteButton && <div className="flex justify-end border-t pt-4 sm:hidden">{deleteButton}</div>}
    </>
  );
}

async function ReportView({ scan, scope, locale, storage }: { scan: ScanDetail; scope: Scope; locale: Locale; storage: boolean }) {
  const t = await getTranslations("scans.detail.report");
  const result = scoreScan(
    scan.steps,
    scan.steps.map((s) => ({ stepId: s.id, aiVerdict: s.aiVerdict, finalVerdict: s.finalVerdict })),
  );
  // The reason and the critical / mandatory marks follow the STORED score and risk (a step's flags may change later).
  const outcome = reportOutcome(result, { score: scan.score, riskLevel: scan.riskLevel });
  const critical = new Set(outcome.criticalViolations);
  const violated = new Set(result.violated);
  const numberOf = new Map(scan.steps.map((s, i) => [s.id, i + 1]));
  const recs = await recommendationsFor(
    scope,
    scan.steps
      .filter((s) => violated.has(s.id))
      .map((s) => ({ ...s, isCritical: critical.has(s.id) })),
    outcome.criticalViolations,
  );
  const recommendations: ReportRecommendation[] = recs.map((r) => ({
    step: r.step,
    number: numberOf.get(r.step.id) ?? 0,
    critical: r.critical,
    scenario: r.scenario,
    scenarioTitle: r.scenario ? pick(r.scenario, "title", locale) : null,
  }));

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <BreadcrumbLabel label={breadcrumbText(scan.areaLabel)} />
      <ReportFocus scanId={scan.id} targetId="scan-title" />
      <p className="hidden text-sm font-medium text-muted-foreground print:block">{t("printTitle")}</p>
      <PageHeader
        title={<Title scan={scan} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ScanStatusBadge status="finalized" />
            <span>{scan.protocol.title}</span>
          </span>
        }
        actions={
          <>
            <PrintButton />
            <Link
              href={`/scans/new?protocol=${encodeURIComponent(scan.protocol.id)}`}
              className={buttonVariants({ variant: "outline", className: "h-10" })}
            >
              <PlusIcon aria-hidden />
              {t("newScan")}
            </Link>
          </>
        }
      />
      <ScanReport
        scan={scan}
        result={result}
        reason={outcome.reason}
        recommendations={recommendations}
        photos={<ScanPhotos photos={scan.photos} area={scan.areaLabel} storage={storage} eager />}
      />
    </div>
  );
}
