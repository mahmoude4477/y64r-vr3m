import { parseId } from "@/lib/admin/params";
import { requestLogger } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { authorizeApi } from "@/lib/session";
import { isStorageConfigured, presignPhotoView, VIEW_URL_TTL_SECONDS } from "@/lib/storage";

// GET /api/admin/photos/<id>: 302 to a short-lived presigned URL of a scan photo, for PLATFORM ADMINS only (the read-
// only scan detail of /admin/assessments shows photos of any institution). The institution's own staff use
// /api/scans/photos/<id> (photosReadable). Shown as <img src="/api/admin/photos/<id>"> (CONVENTIONS 9: never
// next/image). The redirect is cached privately for less time than the presigned URL lives; failures are never cached.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request, ctx: RouteContext<"/api/admin/photos/[id]">) {
  const a = await authorizeApi({ platformAdmin: true });
  if (!a.ok) return new Response(null, { status: a.response.status, headers: NO_STORE });
  const id = parseId((await ctx.params).id);
  if (!id) return new Response(null, { status: 404, headers: NO_STORE });
  if (!isStorageConfigured()) return new Response(null, { status: 503, headers: NO_STORE });
  try {
    const photo = await prisma.scanPhoto.findUnique({ where: { id }, select: { storageKey: true } });
    if (!photo) return new Response(null, { status: 404, headers: NO_STORE });
    const url = await presignPhotoView(photo.storageKey);
    const maxAge = Math.max(0, Math.floor(VIEW_URL_TTL_SECONDS / 2));
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": `private, max-age=${maxAge}`, Vary: "Cookie" },
    });
  } catch (err) {
    requestLogger(request.headers).error("admin.photo.view_failed", { err });
    return new Response(null, { status: 500, headers: NO_STORE });
  }
}
