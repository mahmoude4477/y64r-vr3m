import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";

/**
 * Whether the browser holds a session cookie, for the public site header (components/marketing/header-auth.tsx):
 * guests keep "sign in / create account", a returning user gets "Dashboard". Cookie presence only, like proxy.ts:
 * no database read and no Better Auth rate-limit row per landing visit. Optimistic on purpose: an expired cookie
 * shows "Dashboard", and the app then sends the visitor to sign-in (lib/session.ts). Never cached.
 */
export function GET(request: NextRequest) {
  const signedIn = Boolean(getSessionCookie(request));
  return Response.json({ signedIn }, { headers: { "Cache-Control": "private, no-store" } });
}
