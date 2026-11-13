import { scansReadable, scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { apiError, apiJson, handleScanRoute } from "@/lib/scans/api";
import { ID_PATTERN } from "@/lib/scans/constants";
import { effectiveStatus } from "@/lib/scans/review-core";
import { authorizeApi } from "@/lib/session";

// GET /api/scans/<id> -> { id, status, analyzedAt, photoIds, results: [{ stepId, visual, aiVerdict, aiConfidence }] }
// Status of one scan of the active institution (scansReadable). The new-scan page polls it when the connection
// dropped during the analysis (the model call keeps running on the server and saves its result with the scan).
// The status is the one the pages show (effectiveStatus): a crashed analysis reads "failed", so the polling stops.
export async function GET(request: Request, ctx: RouteContext<"/api/scans/[id]">) {
  return handleScanRoute(request, "scan.status", async () => {
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const { id } = await ctx.params;
    if (!ID_PATTERN.test(id)) return apiError("not_found", 404);
    const scan = await prisma.scan.findFirst({
      where: { id, ...scansReadable(scopeOf(a.ctx)) },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        analyzedAt: true,
        photos: { select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        stepResults: {
          select: { stepId: true, aiVerdict: true, aiConfidence: true, step: { select: { order: true, visualCheck: true } } },
        },
      },
    });
    if (!scan) return apiError("not_found", 404);
    return apiJson({
      id: scan.id,
      status: effectiveStatus(scan),
      analyzedAt: scan.analyzedAt?.toISOString() ?? null,
      photoIds: scan.photos.map((p) => p.id),
      results: scan.stepResults
        .sort((x, y) => x.step.order - y.step.order)
        .map((r) => ({ stepId: r.stepId, visual: r.step.visualCheck, aiVerdict: r.aiVerdict, aiConfidence: r.aiConfidence })),
    });
  });
}
