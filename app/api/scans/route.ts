import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { apiError, apiJson, handleScanRoute, overRateLimit, readJsonBody, tooManyRequests } from "@/lib/scans/api";
import { createScan } from "@/lib/scans/create";
import { createScanSchema } from "@/lib/scans/schemas";
import { authorizeApi } from "@/lib/session";

// POST /api/scans { protocolId, teamId?, areaLabel, photoIds } -> 201 { id }: a DRAFT scan in the active institution
// with the user's own confirmed uploads attached (1..4). Analysis is a separate call (POST /api/scans/<id>/analyze),
// so a scan exists even when the AI is off, over its limit or fails: the examiner then answers every step by hand.
export async function POST(request: Request) {
  return handleScanRoute(request, "scan.create", async (logger) => {
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const body = await readJsonBody(request, createScanSchema);
    if (!body.ok) return body.response;
    const scope = scopeOf(a.ctx);
    if (await overRateLimit([{ key: `scans:create:${scope.userId}`, max: 30, windowSec: 600 }])) return tooManyRequests();
    const r = await createScan(scope, body.data);
    if (!r.ok) {
      logger.warn("scan.create.refused", { errorCode: r.error });
      return apiError(r.error, r.status);
    }
    logger.info("scan.create.done", { scanId: r.id, photos: body.data.photoIds.length });
    return apiJson({ id: r.id }, 201);
  });
}
