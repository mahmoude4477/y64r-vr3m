import { ArrowLeftIcon, CircleCheckIcon, CircleIcon, CircleXIcon, SquareCheckIcon, SquareIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AiCallsForTarget, DetailList, StepFlags } from "@/components/admin/assessment-parts";
import { ToneBadge } from "@/components/admin/badges";
import { DeleteAssessment } from "@/components/admin/delete-assessment";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getAttemptDetail } from "@/lib/admin/assessment-queries";
import { orgNames } from "@/lib/admin/display";
import { adminMetadata } from "@/lib/admin/metadata";
import { parseId } from "@/lib/admin/params";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AttemptStatusBadge, RiskBadge, ScoreBadge } from "@/components/shared/status-badges";

// /admin/assessments/attempts/<id>: one simulation attempt of any trainee, read only (PRODUCT 6a "open any report"):
// result, every stage with the options chosen and their feedback, the protocol steps it scored, the debrief and the
// AI calls, and deleting it.

/** The scenario's title with the kind of page ("Hand hygiene | Simulation attempt"), like the page heading. */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/assessments/attempts/[id]">): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("admin.assessment"), getLocale()]);
  return adminMetadata(t("attemptTitle"), async () => {
    const id = parseId((await params).id);
    const attempt = id
      ? await prisma.simulationAttempt.findUnique({ where: { id }, select: { scenario: { select: { titleAr: true, titleEn: true } } } })
      : null;
    return attempt ? { name: pick(attempt.scenario, "title", locale) } : null;
  });
}

async function AttemptDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const id = parseId((await params).id);
  const detail = id ? await getAttemptDetail(id) : null;
  if (!detail) notFound();
  const [t, common, format, locale] = await Promise.all([
    getTranslations("admin.assessment"),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
  ]);
  const { attempt, user, organization, scenario, protocol, stages, stepResults, aiCalls } = detail;
  const completed = attempt.status === "completed";
  const title = scenario ? pick(scenario, "title", locale) : t("deletedScenario");
  // The debrief is written once, in the trainee's language: show whichever exists, the page language first.
  const debrief = pickOrNull(attempt, "debrief", locale);
  const date = (d: Date | null) => (d ? <time dateTime={d.toISOString()}>{format.dateTime(d, "dateTime")}</time> : "—");
  const answered = stages.filter((s) => s.answer).length;

  return (
    <>
      <BreadcrumbLabel label={title} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("attemptKicker")}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            <bdi>{title}</bdi>
          </h1>
          {protocol && (
            <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <Link href={`/admin/protocols/${protocol.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                <bdi>{pick(protocol, "title", locale)}</bdi>
              </Link>
              {scenario && (
                <Link href={`/admin/scenarios/${scenario.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                  {t("openScenario")}
                </Link>
              )}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <AttemptStatusBadge status={attempt.status} />
            {completed && <ScoreBadge score={attempt.score} />}
            {completed && attempt.riskLevel && <RiskBadge level={attempt.riskLevel} />}
            {!completed && <span className="text-xs text-muted-foreground">{t("notFinal")}</span>}
          </div>
        </div>
        <div className="print:hidden">
          <DeleteAssessment kind="attempt" id={attempt.id} name={title} />
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
                label: t("trainee"),
                value: user ? (
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    <bdi>{user.name}</bdi>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{common("deletedUser")}</span>
                ),
              },
              {
                label: t("institution"),
                value: organization ? (
                  <Link href={`/admin/organizations/${organization.id}`} className="hover:underline">
                    <bdi>{orgNames(organization, locale).primary}</bdi>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t("individual")}</span>
                ),
              },
              { label: t("started"), value: date(attempt.startedAt) },
              { label: t("completed"), value: date(attempt.completedAt) },
              {
                label: t("duration"),
                value:
                  attempt.durationSec === null
                    ? "—"
                    : // Under 30 seconds rounds to 0: "less than a minute" (the =0 form of the message).
                      t("minutes", {
                        count: Math.round(attempt.durationSec / 60),
                        n: format.number(Math.round(attempt.durationSec / 60), "integer"),
                      }),
              },
              {
                label: t("answered"),
                value: t("answeredValue", { n: format.number(answered, "integer"), total: format.number(stages.length, "integer") }),
              },
              scenario?.difficulty && { label: t("difficulty"), value: common(`difficulty.${scenario.difficulty}`) },
              scenario?.organizationId && { label: t("scenarioScope"), value: t("customScenario") },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("stages.title")}</h2>
          </CardTitle>
          <CardDescription>{t("stages.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("stages.none")}</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {stages.map((s, i) => (
                <li key={s.id} className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-medium">
                      <span className="text-muted-foreground">{t("stages.number", { n: format.number(i + 1, "integer") })} </span>
                      {pick(s, "prompt", locale)}
                    </p>
                    {s.answer ? (
                      s.answer.isCorrect ? (
                        <ToneBadge kind="success" icon={CircleCheckIcon}>
                          {t("stages.correct")}
                        </ToneBadge>
                      ) : (
                        <ToneBadge kind="danger" icon={CircleXIcon}>
                          {t("stages.wrong")}
                        </ToneBadge>
                      )
                    ) : (
                      <ToneBadge kind="neutral">{t("stages.unanswered")}</ToneBadge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.kind === "multi" ? t("stages.multi") : t("stages.single")}</p>
                  <ul className="flex flex-col gap-1.5">
                    {s.options.map((o) => {
                      const Icon = s.kind === "multi" ? (o.chosen ? SquareCheckIcon : SquareIcon) : o.chosen ? CircleCheckIcon : CircleIcon;
                      return (
                        <li
                          key={o.id}
                          className={cn(
                            "flex flex-col gap-1 rounded-lg px-3 py-2 text-sm",
                            o.chosen ? "bg-muted ring-1 ring-foreground/15" : "text-muted-foreground",
                          )}
                        >
                          <span className="flex items-start gap-2">
                            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                              {o.chosen && <span className="sr-only">{t("stages.chosen")}: </span>}
                              {pick(o, "text", locale)}
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1 ps-6">
                            {o.isCorrect && <ToneBadge kind="success">{t("stages.correctOption")}</ToneBadge>}
                            {o.isCritical && <ToneBadge kind="danger">{t("stages.criticalOption")}</ToneBadge>}
                          </span>
                          {o.chosen && <p className="ps-6 text-xs text-muted-foreground">{pick(o, "feedback", locale)}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {stepResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("outcomes.title")}</h2>
            </CardTitle>
            <CardDescription>{t("outcomes.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {stepResults.map((r) => (
                <li key={r.step.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-sm">{pick(r.step, "text", locale)}</p>
                    <StepFlags step={r.step} />
                  </div>
                  <span className="flex shrink-0 flex-wrap gap-1">
                    {r.compliant ? (
                      <ToneBadge kind="success" icon={CircleCheckIcon}>
                        {common("verdict.compliant")}
                      </ToneBadge>
                    ) : (
                      <ToneBadge kind="danger" icon={CircleXIcon}>
                        {r.critical ? t("outcomes.criticalViolation") : common("verdict.non_compliant")}
                      </ToneBadge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {debrief && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("debrief.title")}</h2>
            </CardTitle>
            <CardDescription>{t("debrief.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line" dir="auto">
              {debrief}
            </p>
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
      <Skeleton className="h-96 rounded-xl" />
    </>
  );
}

export default async function AdminAttemptPage({ params }: PageProps<"/[locale]/admin/assessments/attempts/[id]">) {
  const t = await getTranslations("admin.assessment");
  return (
    <>
      <Link
        href="/admin/assessments?kind=attempts"
        className="inline-flex min-h-8 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {t("backAttempts")}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <AttemptDetail params={params} />
      </Suspense>
    </>
  );
}
