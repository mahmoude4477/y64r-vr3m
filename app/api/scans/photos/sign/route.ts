import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { apiError, apiJson, handleScanRoute, overRateLimit, readJsonBody, tooManyRequests } from "@/lib/scans/api";
import { ownerOf, signPhotoUpload } from "@/lib/scans/photos";
import { signPhotoSchema } from "@/lib/scans/schemas";
import { authorizeApi } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";

// POST /api/scans/photos/sign { contentType, size } -> { url, key, headers }: a presigned PUT for ONE photo of a new
// scan (5 minutes, exact type and size signed). Staff of the active institution only; the key is made here.
export async function POST(request: Request) {
  return handleScanRoute(request, "scan.photo.sign", async (logger) => {
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const owner = ownerOf(scopeOf(a.ctx));
    if (!owner) return apiError("forbidden", 403);
    const body = await readJsonBody(request, signPhotoSchema);
    if (!body.ok) return body.response;
    if (!isStorageConfigured()) return apiError("storage_off", 503);
    if (
      await overRateLimit([
        { key: `scans:sign:${owner.userId}`, max: 40, windowSec: 600 },
        { key: `scans:sign-day:${owner.userId}`, max: 400, windowSec: 86_400 },
      ])
    ) {
      logger.warn("scan.photo.sign_limited");
      return tooManyRequests();
    }
    return apiJson(await signPhotoUpload(owner, body.data));
  });
}
