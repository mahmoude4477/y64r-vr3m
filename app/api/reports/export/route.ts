import type { NextRequest } from "next/server";
import { getFormatter, getTranslations } from "next-intl/server";
import { isAppLocale, routing } from "@/i18n/routing";
import { takeAppRateLimit } from "@/lib/app-rate-limit";
import { writeAudit } from "@/lib/audit";
import { scopeOf } from "@/lib/authz";
import { requestLogger } from "@/lib/log";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { SPREADSHEET_CONTENT_TYPE, toSpreadsheet } from "@/lib/reports/csv";
import { attemptExport, EXPORT_ROW_CAP, type ExportLabels, isExportKind, rateLimitRetryAfterSec, scanExport } from "@/lib/reports/export";
import { parseReportFilters, todayInRiyadh } from "@/lib/reports/filters";
import { reportFilterOptions, resolveFilters } from "@/lib/reports/institution";
import { institutionScope } from "@/lib/reports/scope";
import { authorizeApi } from "@/lib/session";

/**
 * GET /api/reports/export?kind=scans|attempts&locale=ar|en (+ the report filters: from, to, protocol, department)
 * -> a spreadsheet file (.csv) of the ACTIVE institution's finalised scans or completed simulation attempts
 * (institution staff only: owner / admin / examiner). UTF-16LE with BOM and TAB-separated, so Excel opens it in
 * columns in every regional format (Arabic ones split .csv files on ";"), formula-safe cells (lib/reports/csv.ts),
 * newest first, at most EXPORT_ROW_CAP rows: when cut, the file ends with a note saying so and the response carries
 * X-Export-Truncated: 1 (the export menu shows it too). Audited as "reports.export" (no personal data in meta),
 * limited to EXPORTS_PER_HOUR per user (a refusal says in Retry-After how long is left of the window). Never cached.
 * Errors are JSON { error } (the export menu shows them).
 */

const EXPORTS_PER_HOUR = 30;
const WINDOW_SEC = 3600;

function jsonError(error: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * HEAD would otherwise run GET (Next answers HEAD with the GET handler): a link checker or preview holding the
 * session would build the file, write an audit row and use up a rate-limit slot without anything being downloaded.
 */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authorizeApi({ roles: ORG_STAFF_ROLES });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;
  const inst = institutionScope(scopeOf(ctx));
  if (!inst) return jsonError("forbidden", 403);

  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  if (!isExportKind(kind)) return jsonError("invalid_kind", 400);
  const requested = params.get("locale");
  const locale = isAppLocale(requested) ? requested : isAppLocale(ctx.user.locale) ? ctx.user.locale : routing.defaultLocale;

  const logger = requestLogger(request.headers);
  try {
    const rateKey = `reports-export:${ctx.user.id}`;
    if (!(await takeAppRateLimit(rateKey, EXPORTS_PER_HOUR, WINDOW_SEC))) {
      // What is left of the window (the export menu turns it into minutes); the whole window if that read fails.
      const retryAfter = await rateLimitRetryAfterSec(rateKey, WINDOW_SEC).catch((err: unknown) => {
        logger.warn("reports.export.retry_after_failed", { err });
        return WINDOW_SEC;
      });
      return jsonError("too_many_requests", 429, { "Retry-After": String(retryAfter) });
    }
    const options = await reportFilterOptions(inst);
    const filters = resolveFilters(parseReportFilters(Object.fromEntries(params), todayInRiyadh()), options);

    const [t, common, format] = await Promise.all([
      getTranslations({ locale, namespace: "reports.export" }),
      getTranslations({ locale, namespace: "common" }),
      getFormatter({ locale }),
    ]);
    const columns: Record<string, string> = {
      finalizedAt: t("columns.finalizedAt"),
      completedAt: t("columns.completedAt"),
      area: t("columns.area"),
      protocol: t("columns.protocol"),
      scenario: t("columns.scenario"),
      department: t("columns.department"),
      examiner: t("columns.examiner"),
      trainee: t("columns.trainee"),
      score: t("columns.score"),
      risk: t("columns.risk"),
      minutes: t("columns.minutes"),
      id: t("columns.id"),
    };
    const labels: ExportLabels = {
      columns: (key) => columns[key] ?? key,
      risk: (level) => common(`risk.${level}`),
      notAssessable: common("score.notAssessable"),
      noDepartment: t("noDepartment"),
      deletedUser: common("deletedUser"),
    };
    const table = kind === "scans" ? await scanExport(inst, filters, locale, labels) : await attemptExport(inst, filters, locale, labels);
    const notes = table.truncated ? [t("truncatedNote", { count: format.number(EXPORT_ROW_CAP, "integer") })] : [];
    const body = toSpreadsheet(table.header, table.rows, notes);

    await writeAudit(
      ctx,
      "reports.export",
      { type: "organization", id: inst.organizationId },
      {
        kind,
        rows: table.rows.length,
        truncated: table.truncated,
        from: filters.from,
        to: filters.to,
        protocolId: filters.protocolId,
        teamId: filters.teamId,
      },
    );

    const filename = `waqaya-${kind}-${filters.from}_${filters.to}.csv`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": SPREADSHEET_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Rows": String(table.rows.length),
        ...(table.truncated ? { "X-Export-Truncated": "1" } : {}),
      },
    });
  } catch (err) {
    logger.error("reports.export.failed", { err, kind });
    return jsonError("failed", 500);
  }
}
