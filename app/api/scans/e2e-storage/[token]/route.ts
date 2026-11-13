import { connection } from "next/server";
import { fileStorageAllowed } from "@/lib/storage";

// E2E ONLY: the "bucket" of the local-disk photo store (lib/scans/e2e/file-storage.ts). PUT = presigned upload,
// GET = presigned view, both with a signed, expiring token instead of S3's signature. Answers 404 to everything unless
// STORAGE_PROVIDER=file passes fileStorageAllowed() (WAQAYA_E2E=1, a loopback http BETTER_AUTH_URL and no RAILWAY_*
// variable), so on any real deployment this route does not exist in practice. The driver module is loaded only after
// that check.

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

async function driver() {
  return (await import("@/lib/scans/e2e/file-storage")).fileStorageDriver;
}

export async function PUT(request: Request, ctx: RouteContext<"/api/scans/e2e-storage/[token]">) {
  if (!fileStorageAllowed()) return notFound();
  const { token } = await ctx.params;
  const body = new Uint8Array(await request.arrayBuffer());
  const result = await (await driver()).acceptUpload(token, request.headers.get("content-type"), body);
  if (result === "ok") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/scans/e2e-storage/[token]">) {
  await connection(); // never prerendered: the guard reads the server's environment at request time
  if (!fileStorageAllowed()) return notFound();
  const { token } = await ctx.params;
  const file = await (await driver()).readForView(token);
  if (!file) return notFound();
  return new Response(Buffer.from(file.bytes), {
    status: 200,
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
