import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { APP_PREFIXES, GUEST_ONLY_PREFIXES, matchesPrefix } from "@/lib/routes";

// Next 16 proxy (formerly middleware). Always Node.js; no `runtime` export allowed.
// 1. Unprefixed URLs: next-intl redirects to /ar/... (localePrefix "always"), which comes back here.
// 2. Prefixed URLs: OPTIMISTIC auth redirects from the cookie only. The real checks are
//    lib/session.ts requireUser()/requireOrgRole() in every page, Server Action and Route Handler.
// Route lists live in lib/routes.ts (shared with app/robots.ts). Security headers are NOT set here: the matcher
// skips /api, _next and dotted paths, so next.config.ts headers() sends them on every response instead.
const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const [, first = "", ...rest] = pathname.split("/");
  const locale = (routing.locales as readonly string[]).includes(first) ? first : null;

  if (locale) {
    const path = `/${rest.join("/")}`;
    const hasSession = Boolean(getSessionCookie(request)); // string | null | undefined
    if (!hasSession && matchesPrefix(path, APP_PREFIXES)) {
      const url = new URL(`/${locale}/sign-in`, request.url);
      // Always locale-prefixed and same-origin; the sign-in form re-validates it (lib/safe-callback.ts).
      url.searchParams.set("callbackUrl", pathname + search);
      return NextResponse.redirect(url);
    }
    if (hasSession && matchesPrefix(path, GUEST_ONLY_PREFIXES)) {
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
  }
  return handleI18nRouting(request);
}

export const config = {
  // Skip /api (Better Auth = /api/auth, uploads must not be buffered), Next internals and files with a dot.
  // Keep the double backslash in this source: a lost one turns the dot test into ".*..*" and the proxy
  // then runs only on "/" (check .next/server/functions-config-manifest.json originalSource).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
