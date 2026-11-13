import { BotIcon, CircleCheckIcon, CloudOffIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AiCallsTable, AiFailureLog, AiTotals } from "@/components/admin/ai-panels";
import { AiSettingsForms } from "@/components/admin/ai-settings-forms";
import { ToneBadge } from "@/components/admin/badges";
import { ListEmpty } from "@/components/admin/list-empty";
import { ListFilters } from "@/components/admin/list-filters";
import { ListPagination, ListStatus } from "@/components/admin/list-pagination";
import { StatCardUnavailable } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AI_CALL_DEFAULTS, AI_CALLS_PAGE_SIZE, AI_KIND_FILTERS, AI_STATUS_FILTERS, parseAiCallFilters } from "@/lib/admin/ai-display";
import { aiFailureLog, aiSettingsView, aiTotals, FAILURE_WINDOW_DAYS, listAiCalls, type AiSettingsView } from "@/lib/admin/ai-queries";
import { organizationOptions } from "@/lib/admin/assessment-queries";
import { orgNames } from "@/lib/admin/display";
import type { RawSearchParams } from "@/lib/admin/params";
import { log } from "@/lib/log";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/ai (PRODUCT 6a "AI & settings"): the model id, effort and per-user daily limit (saved with setSetting and
// audited), the AI calls of the Riyadh day and month, the failure log of the last 30 days and every call with its
// status, person, duration, tokens and estimated cost. Each block streams on its own; one that fails says so.
// The photo-retention setting is postponed (2026-10-29).

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return adminMetadata(nav("sub.adminAi"));
}

const PATH = "/admin/ai";
const ALL = "all";

/** Runs a read; on failure logs it and returns null, so the card says "could not load" and the page still renders. */
async function load<T>(event: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    log.error(event, { err });
    return null;
  }
}

async function SettingsCard() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.ai");
  const view = await load("admin.ai.settings_failed", aiSettingsView);
  if (!view) return <StatCardUnavailable title={t("settings.title")} icon={BotIcon} />;
  const state = <T,>(s: AiSettingsView["model"] | AiSettingsView["effort"] | AiSettingsView["dailyLimit"], value: T) => ({
    value,
    source: s.source,
    updatedAt: s.updatedAt?.toISOString() ?? null,
    updatedByName: s.updatedBy?.name ?? null,
  });
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>
            <h2>{t("settings.title")}</h2>
          </CardTitle>
          <CardDescription>{t("settings.description")}</CardDescription>
        </div>
        {view.configured ? (
          <ToneBadge kind="success" icon={CircleCheckIcon}>
            {t("service.on")}
          </ToneBadge>
        ) : (
          <ToneBadge kind="warning" icon={CloudOffIcon}>
            {t("service.off")}
          </ToneBadge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!view.configured && <ServiceOffAlert service="ai" />}
        <AiSettingsForms
          model={state(view.model, view.model.value)}
          effort={state(view.effort, view.effort.value)}
          dailyLimit={state(view.dailyLimit, view.dailyLimit.value)}
          defaultDailyLimit={view.defaultDailyLimit}
          modelHasPrice={view.modelHasPrice}
        />
      </CardContent>
    </Card>
  );
}

async function TotalsCard() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.ai");
  const totals = await load("admin.ai.totals_failed", () => aiTotals());
  if (!totals) return <StatCardUnavailable title={t("totals.title")} icon={BotIcon} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("totals.title")}</h2>
        </CardTitle>
        <CardDescription>{t("totals.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AiTotals today={totals.today} month={totals.month} />
      </CardContent>
    </Card>
  );
}

async function FailuresCard() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.ai");
  const groups = await load("admin.ai.failures_failed", () => aiFailureLog());
  if (!groups) return <StatCardUnavailable title={t("failures.title")} icon={BotIcon} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("failures.title")}</h2>
        </CardTitle>
        <CardDescription>{t("failures.description", { days: String(FAILURE_WINDOW_DAYS) })}</CardDescription>
      </CardHeader>
      <CardContent>
        <AiFailureLog groups={groups} />
      </CardContent>
    </Card>
  );
}

async function CallsList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePlatformAdmin();
  const filters = parseAiCallFilters(await searchParams);
  const [t, locale] = await Promise.all([getTranslations("admin.ai"), getLocale()]);
  const organizations = await organizationOptions();
  const { calls, total, page } = await listAiCalls(filters);
  const filtered = filters.status !== "all" || filters.kind !== "all" || filters.org !== "";
  const orgOptions = [
    { value: ALL, label: t("calls.allInstitutions") },
    ...organizations.map((o) => ({ value: o.id, label: orgNames(o, locale).primary })),
  ];
  if (filters.org && !orgOptions.some((o) => o.value === filters.org)) orgOptions.push({ value: filters.org, label: t("calls.selectedInstitution") });
  const params = { status: filters.status, kind: filters.kind, org: filters.org };
  const defaults = { ...AI_CALL_DEFAULTS, org: ALL };

  return (
    <div className="flex flex-col gap-4">
      <ListFilters
        path={PATH}
        label={t("calls.filtersLabel")}
        selects={[
          {
            name: "status",
            label: t("calls.status"),
            value: filters.status,
            defaultValue: "all",
            options: AI_STATUS_FILTERS.map((v) => ({ value: v, label: t(`calls.statusOptions.${v}`) })),
          },
          {
            name: "kind",
            label: t("calls.kind"),
            value: filters.kind,
            defaultValue: "all",
            options: AI_KIND_FILTERS.map((v) => ({ value: v, label: v === "all" ? t("calls.allKinds") : t(`kinds.${v}`) })),
          },
          { name: "org", label: t("calls.institution"), value: filters.org || ALL, defaultValue: ALL, options: orgOptions },
        ]}
      />
      <ListStatus page={page} total={total} shown={calls.length} empty={filtered ? t("calls.noResults.title") : t("calls.empty.title")} pageSize={AI_CALLS_PAGE_SIZE} />
      {calls.length === 0 ? (
        filtered ? (
          <ListEmpty icon={SearchXIcon} title={t("calls.noResults.title")} description={t("calls.noResults.description")} />
        ) : (
          <ListEmpty icon={BotIcon} title={t("calls.empty.title")} description={t("calls.empty.description")} />
        )
      ) : (
        <>
          <AiCallsTable calls={calls} />
          <ListPagination path={PATH} params={params} defaults={defaults} page={page} total={total} pageSize={AI_CALLS_PAGE_SIZE} />
        </>
      )}
    </div>
  );
}

function CardSkeleton({ height }: { height: string }) {
  return <Skeleton className={`${height} w-full rounded-xl`} />;
}

function CallsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 sm:w-44" />
        ))}
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default async function AdminAiPage({ searchParams }: PageProps<"/[locale]/admin/ai">) {
  const [nav, t] = await Promise.all([getTranslations("nav"), getTranslations("admin.ai")]);
  return (
    <>
      <PageHeader title={nav("sub.adminAi")} description={t("description")} />
      <Suspense fallback={<CardSkeleton height="h-96" />}>
        <SettingsCard />
      </Suspense>
      <Suspense fallback={<CardSkeleton height="h-64" />}>
        <TotalsCard />
      </Suspense>
      <Suspense fallback={<CardSkeleton height="h-40" />}>
        <FailuresCard />
      </Suspense>
      <section aria-labelledby="ai-calls" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="ai-calls" className="text-lg font-semibold">
            {t("calls.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("calls.description")}</p>
        </div>
        <Suspense fallback={<CallsSkeleton />}>
          <CallsList searchParams={searchParams} />
        </Suspense>
      </section>
    </>
  );
}
