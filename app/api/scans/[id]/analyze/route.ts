import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { analyzableScanExists, runScanAnalysis } from "@/lib/scans/analysis";
import { apiError, apiJson, guardMutation, handleScanRoute, overRateLimit, tooManyRequests } from "@/lib/scans/api";
import { ID_PATTERN } from "@/lib/scans/constants";
import { authorizeApi } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";

// POST /api/scans/<id>/analyze -> { ok, steps, needsReview } | { error: <code>, retryable? }
// One AI call for a draft (or failed) scan of the active institution: its photos + the protocol's visual steps
// (lib/scans/analysis.ts). Per-user AI limits are enforced by analyzeScan (daily_limit / too_many_requests); this
// route adds app limits against hammering: per user first (refused before anything else is touched), then per scan, and
// the per-scan rule is counted only for a scan of the caller's institution, so unknown ids or another institution's
// scan never create a row or use up that scan's budget. Can take up to two minutes.
export async function POST(request: Request, ctx: RouteContext<"/api/scans/[id]/analyze">) {
  return handleScanRoute(request, "scan.analyze", async (logger) => {
    const guard = guardMutation(request);
    if (guard) return guard;
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const { id } = await ctx.params;
    if (!ID_PATTERN.test(id)) return apiError("not_found", 404);
    if (!isStorageConfigured()) return apiError("storage_off", 503);
    const scope = scopeOf(a.ctx);
    if (await overRateLimit([{ key: `scans:analyze:${scope.userId}`, max: 12, windowSec: 600 }])) return tooManyRequests();
    if (!(await analyzableScanExists(scope, id))) return apiError("not_found", 404);
    if (await overRateLimit([{ key: `scans:analyze-scan:${id}`, max: 6, windowSec: 3600 }])) return tooManyRequests();
    const r = await runScanAnalysis(scope, id, logger);
    if (!r.ok) return apiError(r.error, r.status, r.retryable === undefined ? undefined : { retryable: r.retryable });
    return apiJson(r);
  });
}
