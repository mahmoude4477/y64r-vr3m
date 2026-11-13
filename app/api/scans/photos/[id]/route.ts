import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { apiError, apiJson, guardMutation, handleScanRoute, overRateLimit, tooManyRequests } from "@/lib/scans/api";
import { ID_PATTERN } from "@/lib/scans/constants";
import { discardOwnUpload, ownerOf, photoViewUrl } from "@/lib/scans/photos";
import { authorizeApi } from "@/lib/session";
import { isStorageConfigured, VIEW_URL_TTL_SECONDS } from "@/lib/storage";

// GET /api/scans/photos/<id>: 302 to a short-lived presigned URL of the photo, for staff of the photo's institution
// (photosReadable). Pages show photos as <img src="/api/scans/photos/<id>"> (never next/image). The redirect is
// cached privately for less time than the presigned URL lives.
export async function GET(request: Request, ctx: RouteContext<"/api/scans/photos/[id]">) {
  return handleScanRoute(request, "scan.photo.view", async () => {
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return new Response(null, { status: a.response.status, headers: { "Cache-Control": "no-store" } });
    const { id } = await ctx.params;
    if (!ID_PATTERN.test(id)) return new Response(null, { status: 404 });
    if (!isStorageConfigured()) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    const url = await photoViewUrl(scopeOf(a.ctx), id);
    if (!url) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const maxAge = Math.max(0, Math.floor(VIEW_URL_TTL_SECONDS / 2));
    // A relative or absolute Location both work: the presigned URL is absolute, the e2e store's is same-origin.
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": `private, max-age=${maxAge}` } });
  });
}

// DELETE /api/scans/photos/<id>: removes one of the user's OWN uploads that no scan uses yet (taken off the new-scan
// form, or the scan was cancelled). The row first, in one statement that still requires it to be unattached, then the
// bucket object (lib/scans/photos.ts discardOwnUpload: a scan created at the same moment never loses its file).
export async function DELETE(request: Request, ctx: RouteContext<"/api/scans/photos/[id]">) {
  return handleScanRoute(request, "scan.photo.discard", async () => {
    const guard = guardMutation(request);
    if (guard) return guard;
    const a = await authorizeApi({ roles: ORG_STAFF_ROLES });
    if (!a.ok) return a.response;
    const owner = ownerOf(scopeOf(a.ctx));
    if (!owner) return apiError("forbidden", 403);
    const { id } = await ctx.params;
    if (!ID_PATTERN.test(id)) return apiError("not_found", 404);
    if (!isStorageConfigured()) return apiError("storage_off", 503);
    if (await overRateLimit([{ key: `scans:discard:${owner.userId}`, max: 60, windowSec: 600 }])) return tooManyRequests();
    const r = await discardOwnUpload(owner, id);
    if (!r.ok) return apiError(r.error, r.status);
    return apiJson({ ok: true });
  });
}
