import { ArrowLeftIcon, CheckCheckIcon, ImageOffIcon, PencilLineIcon, SparklesIcon, UserRoundCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AiCallsForTarget, DetailList, StepFlags } from "@/components/admin/assessment-parts";
import { ToneBadge } from "@/components/admin/badges";
import { DeleteAssessment } from "@/components/admin/delete-assessment";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getScanDetail } from "@/lib/admin/assessment-queries";
import { orgNames } from "@/lib/admin/display";
import { adminMetadata } from "@/lib/admin/metadata";
import { parseId } from "@/lib/admin/params";
import { scanStepDecision } from "@/lib/admin/scan-decision";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { RiskBadge, ScanStatusBadge, ScoreBadge, VerdictBadge } from "@/components/shared/status-badges";

// /admin/assessments/scans/<id>: one scan of any institution, read only (PRODUCT 6a "open any report"): result,
// photos (through the platform-admin photo route), every step with the AI's verdict and the examiner's decision, the
// AI calls it made, and deleting it with its photos.

/** The area's name with the kind of page ("Treatment room 2 | Scan details"), like the page heading. */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/assessments/scans/[id]">): Promise<Metadata> {
  const t = await getTranslations("admin.assessment");
  return adminMetadata(t("scanTitle"), async () => {
    const id = parseId((await params).id);
    const scan = id ? await prisma.scan.findUnique({ where: { id }, select: { areaLabel: true } }) : null;
    return scan ? { name: scan.areaLabel } : null;
  });
}

async function ScanDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const id = parseId((await params).id);
  const detail = id ? await getScanDetail(id) : null;
  if (!detail) notFound();
  const [t, common, format, locale] = await Promise.all([
    getTranslations("admin.assessment"),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
  ]);
  const { scan, organization, team, protocol, examiner, finalizedBy, stepResults, photos, aiCalls } = detail;
  const final = scan.status === "finalized";
  const storageOn = isStorageConfigured();
  const overall = pickOrNull(scan, "overallNotes", locale);
  const date = (d: Date | null) => (d ? <time dateTime={d.toISOString()}>{format.dateTime(d, "dateTime")}</time> : "—");
  const person = (p: { id: string; name: string } | null, missing = common("deletedUser")) =>
    p ? (
      <Link href={`/admin/users/${p.id}`} className="hover:underline">
        <bdi>{p.name}</bdi>
      </Link>
    ) : (
      <span className="text-muted-foreground">{missing}</span>
    );

  return (
    <>
      <BreadcrumbLabel label={scan.areaLabel} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("scanKicker")}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            <bdi>{scan.areaLabel}</bdi>
          </h1>
          {protocol && (
            <p className="text-sm text-muted-foreground">
              {/* The protocol in the admin panel: the editor for a global one, the read-only view for an institution's. */}
              <Link href={`/admin/protocols/${protocol.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                <bdi>{pick(protocol, "title", locale)}</bdi>
              </Link>
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ScanStatusBadge status={scan.status} />
            {final && <ScoreBadge score={scan.score} />}
            {final && scan.riskLevel && <RiskBadge level={scan.riskLevel} />}
            {!final && <span className="text-xs text-muted-foreground">{t("notFinal")}</span>}
          </div>
        </div>
        <div className="print:hidden">
          <DeleteAssessment kind="scan" id={scan.id} name={scan.areaLabel} photos={photos.length} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("about")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              {
                label: t("institution"),
                value: organization ? (
                  <Link href={`/admin/organizations/${organization.id}`} className="hover:underline">
                    <bdi>{orgNames(organization, locale).primary}</bdi>
                  </Link>
                ) : (
                  "—"
                ),
              },
              { label: t("department"), value: team ? <bdi>{team.name}</bdi> : <span className="text-muted-foreground">{t("noDepartment")}</span> },
              { label: t("examiner"), value: person(examiner) },
              { label: t("started"), value: date(scan.startedAt) },
              { label: t("analyzed"), value: date(scan.analyzedAt) },
              { label: t("finalized"), value: final ? date(scan.finalizedAt) : "—" },
              final && { label: t("finalizedBy"), value: person(finalizedBy) },
              {
                label: t("aiModel"),
                value: scan.aiModel ? (
                  <code dir="ltr" className="font-mono text-xs">
                    {scan.aiModel}
                  </code>
                ) : (
                  "—"
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("photos.title")}</h2>
          </CardTitle>
          <CardDescription>{t("photos.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageOffIcon aria-hidden className="size-4" />
              {t("photos.none")}
            </p>
          ) : !storageOn ? (
            <Alert>
              <ImageOffIcon aria-hidden />
              <AlertDescription>{t("photos.storageOff", { n: format.number(photos.length, "integer") })}</AlertDescription>
            </Alert>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <a
                    href={`/api/admin/photos/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- photos come from the authenticated 302 route (CONVENTIONS 9) */}
                    <img
                      src={`/api/admin/photos/${p.id}`}
                      alt={t("photos.alt", { n: format.number(i + 1, "integer"), total: format.number(photos.length, "integer") })}
                      width={p.width}
                      height={p.height}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square size-full object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("steps.title")}</h2>
          </CardTitle>
          <CardDescription>{t("steps.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stepResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("steps.none")}</p>
          ) : (
            <ol className="flex flex-col divide-y">
              {stepResults.map((r, i) => {
                const evidence = pickOrNull(r, "evidence", locale);
                // The decision the stored score and risk were computed from (lib/scoring.ts scanStepOutcome).
                const decision = scanStepDecision({ finalized: final, aiVerdict: r.aiVerdict, finalVerdict: r.finalVerdict });
                const by = r.overriddenBy?.name;
                return (
                  <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                        {format.number(i + 1, "integer")}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="text-sm font-medium">{pick(r.step, "text", locale)}</p>
                        <StepFlags step={r.step} />
                      </div>
                    </div>
                    <div className="grid gap-2 ps-9 text-sm sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{t("steps.ai")}</span>
                        {r.aiVerdict ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <VerdictBadge verdict={r.aiVerdict} />
                            {r.aiConfidence !== null && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {t("steps.confidence", { value: format.number(r.aiConfidence, "percent") })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{r.step.visualCheck ? t("steps.noAi") : t("steps.notVisual")}</span>
                        )}
                        {evidence && <p className="text-xs text-muted-foreground">{evidence}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{t("steps.final")}</span>
                        {decision.kind === "examiner" ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <VerdictBadge verdict={decision.verdict} />
                            {decision.relation === "changed" ? (
                              <ToneBadge kind="neutral" icon={PencilLineIcon}>
                                {by ? t("steps.overriddenBy", { name: by }) : t("steps.overridden")}
                              </ToneBadge>
                            ) : decision.relation === "confirmed" ? (
                              <ToneBadge kind="neutral" icon={CheckCheckIcon}>
                                {by ? t("steps.confirmedBy", { name: by }) : t("steps.confirmed")}
                              </ToneBadge>
                            ) : (
                              <ToneBadge kind="neutral" icon={UserRoundCheckIcon}>
                                {by ? t("steps.answeredBy", { name: by }) : t("steps.answered")}
                              </ToneBadge>
                            )}
                          </span>
                        ) : decision.kind === "aiAccepted" ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <VerdictBadge verdict={decision.verdict} />
                            <ToneBadge kind="neutral" icon={SparklesIcon}>
                              {t("steps.aiAccepted")}
                            </ToneBadge>
                          </span>
                        ) : decision.kind === "unresolved" ? (
                          <span className="text-muted-foreground">{t("steps.unresolved")}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("steps.noFinal")}</span>
                        )}
                        {r.note && (
                          <p className="text-xs whitespace-pre-line text-muted-foreground">
                            <span className="font-medium">{t("steps.note")}: </span>
                            <bdi>{r.note}</bdi>
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {(overall || scan.notes) && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("notes.title")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {overall && (
              <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SparklesIcon aria-hidden className="size-3.5" />
                  {t("notes.ai")}
                </h3>
                <p className="whitespace-pre-line">{overall}</p>
              </div>
            )}
            {scan.notes && (
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">{t("notes.examiner")}</h3>
                <p className="whitespace-pre-line">
                  <bdi>{scan.notes}</bdi>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("aiCalls")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AiCallsForTarget calls={aiCalls} />
        </CardContent>
      </Card>
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </>
  );
}

export default async function AdminScanPage({ params }: PageProps<"/[locale]/admin/assessments/scans/[id]">) {
  const t = await getTranslations("admin.assessment");
  return (
    <>
      <Link
        href="/admin/assessments"
        className="inline-flex min-h-8 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {t("backScans")}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <ScanDetail params={params} />
      </Suspense>
    </>
  );
}
