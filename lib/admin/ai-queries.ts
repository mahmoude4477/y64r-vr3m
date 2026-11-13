import "server-only";
import { AI_CALLS_PAGE_SIZE, AI_PENDING_STALE_MS, aiCallWhere, settingSource, type AiCallFilters, type SettingSource } from "@/lib/admin/ai-display";
import { pageOffset } from "@/lib/admin/params";
import { AI_SETTING_KEYS, type AiSettingKey } from "@/lib/admin/schemas";
import { daysAgo, riyadhDayStart, riyadhMonthStart } from "@/lib/admin/time";
import { DEFAULT_DAILY_LIMIT, estimateCostUsd, getDailyLimit } from "@/lib/ai/limits";
import { AI_EFFORTS, getAiConfig, isAiConfigured } from "@/lib/ai/model";
import { prisma } from "@/lib/prisma";
import { SETTINGS } from "@/lib/settings";

// Read queries of /admin/ai (PRODUCT 6a "AI & settings"): the current model settings and where they come from, the
// AiCall totals of the Riyadh day and month, the failure log and the list of recent calls. Every caller has called
// requirePlatformAdmin(). Queries run one after another (no fan-out over the pool, see lib/admin/queries.ts).

export type AiSettingView<T> = {
  value: T;
  source: SettingSource;
  /** When the panel value was saved and by whom (null when it is not a panel value, or the account was deleted). */
  updatedAt: Date | null;
  updatedBy: { id: string; name: string } | null;
};

/** Reads process.env: call it inside the Suspense'd data component (request time), never in a page's static part. */
export async function aiSettingsView() {
  const config = await getAiConfig();
  const limit = await getDailyLimit();
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...AI_SETTING_KEYS] } },
    select: { key: true, value: true, updatedAt: true, updatedBy: { select: { id: true, name: true } } },
  });
  // getAiConfig() / getDailyLimit() ignore a stored value that no longer validates: so does the source shown here.
  const saved = new Map(
    rows.filter((r) => SETTINGS[r.key as AiSettingKey]?.safeParse(r.value).success).map((r) => [r.key as AiSettingKey, r]),
  );
  const envModel = !!process.env.AI_MODEL?.trim();
  const envEffort = (AI_EFFORTS as readonly string[]).includes(process.env.AI_EFFORT?.trim() ?? "");
  const envLimitRaw = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_USER ?? "", 10);
  const envLimit = Number.isFinite(envLimitRaw) && envLimitRaw >= 0;

  const view = <T>(key: AiSettingKey, value: T, fromEnv: boolean): AiSettingView<T> => {
    const row = saved.get(key);
    return {
      value,
      source: settingSource(!!row, fromEnv),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  };
  return {
    configured: isAiConfigured(),
    model: view("ai.model", config.modelId, envModel),
    effort: view("ai.effort", config.effort, envEffort),
    dailyLimit: view("ai.dailyLimitPerUser", limit, envLimit),
    defaultDailyLimit: DEFAULT_DAILY_LIMIT,
    /** No price on file for this model: its calls get no cost estimate. */
    modelHasPrice: estimateCostUsd(config.modelId, { inputTokens: 1 }) !== null,
  };
}

export type AiSettingsView = Awaited<ReturnType<typeof aiSettingsView>>;

type PeriodRow = {
  calls: bigint | number;
  ok: bigint | number;
  failed: bigint | number;
  running: bigint | number;
  stalled: bigint | number;
  inputTokens: unknown;
  outputTokens: unknown;
  cost: unknown;
  avgLatency: unknown;
};

export type AiPeriodTotals = {
  calls: number;
  ok: number;
  /** error + refused */
  failed: number;
  running: number;
  stalled: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Mean latency of the successful calls, null when there were none. */
  avgLatencyMs: number | null;
};

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

async function periodTotals(since: Date, now: Date): Promise<AiPeriodTotals> {
  const stale = new Date(now.getTime() - AI_PENDING_STALE_MS);
  const [row] = await prisma.$queryRaw<PeriodRow[]>`
    SELECT
      count(*) AS "calls",
      count(*) FILTER (WHERE "status" = 'ok') AS "ok",
      count(*) FILTER (WHERE "status" IN ('error', 'refused')) AS "failed",
      count(*) FILTER (WHERE "status" = 'pending' AND "createdAt" >= ${stale}) AS "running",
      count(*) FILTER (WHERE "status" = 'pending' AND "createdAt" < ${stale}) AS "stalled",
      coalesce(sum("inputTokens"), 0) AS "inputTokens",
      coalesce(sum("outputTokens"), 0) AS "outputTokens",
      coalesce(sum("costUsd"), 0) AS "cost",
      avg("latencyMs") FILTER (WHERE "status" = 'ok') AS "avgLatency"
    FROM "ai_call"
    WHERE "createdAt" >= ${since}
  `;
  return {
    calls: num(row.calls),
    ok: num(row.ok),
    failed: num(row.failed),
    running: num(row.running),
    stalled: num(row.stalled),
    inputTokens: num(row.inputTokens),
    outputTokens: num(row.outputTokens),
    costUsd: num(row.cost),
    avgLatencyMs: row.avgLatency === null || row.avgLatency === undefined ? null : Math.round(Number(row.avgLatency)),
  };
}

/** Totals of the Riyadh calendar day and month (the same periods as the daily AI limit and the overview). */
export async function aiTotals(now = new Date()) {
  const today = await periodTotals(riyadhDayStart(now), now);
  const month = await periodTotals(riyadhMonthStart(now), now);
  return { today, month };
}

export const FAILURE_WINDOW_DAYS = 30;

export type FailureGroup = { code: string; status: "error" | "refused" | "stalled"; count: number; lastAt: Date };

/** The failure log: failed, refused and stalled calls of the last 30 days, grouped by error code, most frequent first. */
export async function aiFailureLog(now = new Date()): Promise<FailureGroup[]> {
  const since = daysAgo(FAILURE_WINDOW_DAYS, now);
  const stale = new Date(now.getTime() - AI_PENDING_STALE_MS);
  const failed = await prisma.aiCall.groupBy({
    by: ["status", "errorCode"],
    where: { createdAt: { gte: since }, status: { in: ["error", "refused"] } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const stalled = await prisma.aiCall.aggregate({
    where: { createdAt: { gte: since, lt: stale }, status: "pending" },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const groups: FailureGroup[] = failed.map((g) => ({
    code: g.errorCode ?? (g.status === "refused" ? "refused" : "unknown"),
    status: g.status === "refused" ? "refused" : "error",
    count: g._count._all,
    lastAt: g._max.createdAt ?? since,
  }));
  if (stalled._count._all > 0) {
    groups.push({ code: "stalled", status: "stalled", count: stalled._count._all, lastAt: stalled._max.createdAt ?? since });
  }
  return groups.sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime());
}

export type AiCallRow = {
  id: string;
  kind: "scan_analysis" | "simulation_debrief" | "insight";
  status: "pending" | "ok" | "refused" | "error";
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
  user: { id: string; name: string } | null;
  organization: { id: string; name: string; nameEn: string | null } | null;
};

export async function listAiCalls(filters: AiCallFilters, now = new Date()) {
  const where = aiCallWhere(filters, now);
  const total = await prisma.aiCall.count({ where });
  const { page, skip } = pageOffset(filters.page, total, AI_CALLS_PAGE_SIZE);
  const rows = await prisma.aiCall.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: AI_CALLS_PAGE_SIZE,
    select: {
      id: true,
      kind: true,
      status: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      latencyMs: true,
      errorCode: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      userId: true,
      organizationId: true,
    },
  });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((v): v is string => !!v))];
  const orgs = orgIds.length
    ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, nameEn: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const calls: AiCallRow[] = rows.map(({ userId, organizationId, costUsd, ...r }) => ({
    ...r,
    costUsd: costUsd === null ? null : Number(costUsd),
    user: userId ? (userById.get(userId) ?? null) : null,
    organization: organizationId ? (orgById.get(organizationId) ?? null) : null,
  }));
  return { calls, total, page };
}
