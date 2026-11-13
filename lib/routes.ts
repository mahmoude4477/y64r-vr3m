// Route lists shared by proxy.ts (optimistic redirects) and app/robots.ts (crawl rules). Pure: no imports,
// safe in the proxy, route handlers and scripts. Paths have NO locale prefix.

/** Signed-in areas: guests are sent to sign-in (proxy.ts), crawlers are told to stay out (robots.txt). */
export const APP_PREFIXES = [
  "/dashboard",
  "/protocols",
  "/simulations",
  "/scans",
  "/reports",
  "/settings",
  "/org",
  "/admin",
] as const;

/**
 * Never crawled (robots.txt), but guests may open them: an invitation link (/invite/<id>) shows the institution and
 * the role with "Sign in" / "Create account" links that come back to it (most invitees have no account yet).
 */
export const NO_CRAWL_PREFIXES = [...APP_PREFIXES, "/invite"] as const;

/** Guest-only pages: signed-in users are sent to the dashboard. Crawlable on purpose (they carry noindex). */
export const GUEST_ONLY_PREFIXES = ["/sign-in", "/sign-up"] as const;

/**
 * Sections of the landing page (ids of its <section>s) that the public site header links to from 768 px
 * (components/marketing/site-header.tsx; labels under common.marketing.nav.*). The e2e tests read this list too.
 */
export const LANDING_SECTIONS = [
  { id: "features", key: "features" },
  { id: "how-it-works", key: "howItWorks" },
  { id: "institutions", key: "institutions" },
] as const;

/** `path` is `prefix` or below it ("/scans" matches "/scans" and "/scans/new", not "/scansx"). */
export function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}
