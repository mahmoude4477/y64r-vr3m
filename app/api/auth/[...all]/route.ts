import { toNextJsHandler } from "better-auth/next-js";
import { releaseRequestLock } from "@/lib/account/deletion-lock";
import { auth } from "@/lib/auth";
import { boundedRequest } from "@/lib/http";

// Better Auth endpoints (/api/auth/*). /api is outside proxy.ts and outside [locale].
const handlers = toNextJsHandler(auth);

/**
 * Every Better Auth body is small (sign-in, sign-up, profile, invitations: well under 4 KiB), but Route Handlers have
 * no body limit and Better Auth parses whatever arrives: an unauthenticated 60 MB POST to /sign-in/email used to be
 * buffered and parsed in full. Bodies over 64 KiB answer 413 before Better Auth sees them (lib/http.ts).
 */
const MAX_AUTH_BODY_BYTES = 64 * 1024;

// The account lock of lib/auth.ts's before hook is released by its after hook, which Better Auth skips when an
// endpoint throws a plain Error (api/dispatch.mjs). Releasing here too, once the response exists, means such a call
// never keeps the lock until LOCK_HOLD_MS (lib/account/deletion-lock.ts; idempotent, a no-op without a lock).
async function handle(request: Request): Promise<Response> {
  const bounded = await boundedRequest(request, MAX_AUTH_BODY_BYTES);
  if (bounded instanceof Response) return bounded;
  try {
    return await handlers.POST(bounded);
  } finally {
    releaseRequestLock({ request: bounded });
  }
}

export const GET = handle;
export const POST = handle;
