import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";

// A session cookie without a valid session (expired, revoked, banned user) would bounce between the
// proxy guest-only redirect (/sign-in -> /dashboard) and requireUser() (/dashboard -> /sign-in).
// lib/session.ts sends such requests here: if the session really is invalid, clear the cookies and go
// to sign-in; if it is valid, go back to the app. GET only clears cookies that no longer work, so a
// cross-site link cannot sign anybody out.
const COOKIE_NAMES = [
  "better-auth.session_token",
  "better-auth.session_data",
  "better-auth.dont_remember",
  "__Secure-better-auth.session_token",
  "__Secure-better-auth.session_data",
  "__Secure-better-auth.dont_remember",
];

/**
 * A RELATIVE Location (RFC 9110 allows it; the browser resolves it against the address it used). Never build it from
 * request.url: under `next start` that is the server's own host and port (http://localhost:<PORT> on Railway), not
 * the public domain, so the browser would land on "cannot connect" (review round 2). The proxy's redirects are
 * relativised by Next itself; Route Handler redirects are not.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("locale");
  const locale = (routing.locales as readonly string[]).includes(requested ?? "") ? requested! : routing.defaultLocale;
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (session) return redirectTo(`/${locale}/dashboard`);

  const response = redirectTo(`/${locale}/sign-in`);
  for (const name of COOKIE_NAMES) {
    if (request.cookies.has(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0, secure: name.startsWith("__Secure-") });
    }
  }
  return response;
}
