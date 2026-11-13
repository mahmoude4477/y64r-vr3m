import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { apiError, apiJson, handleScanRoute, overRateLimit, readJsonBody, tooManyRequests } from "@/lib/scans/api";
import { confirmPhotoUpload, ownerOf } from "@/lib/scans/photos";
import { confirmPhotoSchema } from "@/lib/scans/schemas";
import { authorizeApi } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";

// POST /api/scans/photos { key, width, height } -> 201 { id }: confirms a finished upload. The key must be one the
// sign route made for this user in this institution (isOwnPhotoKey) and the object must exist with an allowed type
// and size (headObject). The ScanPhoto row has no scan yet; POST /api/scans attaches it.
export async function POST(request: Request) {
  return handleScanRoute(request, "scan.photo.confirm", async (logger) => {
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const owner = ownerOf(scopeOf(a.ctx));
    if (!owner) return apiError("forbidden", 403);
    const body = await readJsonBody(request, confirmPhotoSchema);
    if (!body.ok) return body.response;
    if (!isStorageConfigured()) return apiError("storage_off", 503);
    if (await overRateLimit([{ key: `scans:confirm:${owner.userId}`, max: 40, windowSec: 600 }])) return tooManyRequests();
    const r = await confirmPhotoUpload(owner, body.data);
    if (!r.ok) {
      logger.warn("scan.photo.confirm_refused", { errorCode: r.error });
      return apiError(r.error, r.status);
    }
    return apiJson({ id: r.id }, 201);
  });
}
