import { routing } from "@/i18n/routing";

const LOCALE_PATH = new RegExp(`^/(${routing.locales.join("|")})(/|$)`);

/**
 * Returns `candidate` only when it is a same-origin, locale-prefixed path (/ar/... or /en/...),
 * otherwise `fallback`. Rejects backslashes ("/\evil.com" resolves to https://evil.com/),
 * protocol-relative "//host", control characters and anything whose resolved origin differs.
 * (crosscheck D12 / C6)
 */
export function safeCallbackUrl(candidate: string | null | undefined, origin: string, fallback: string): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  if (candidate.length > 2048) return fallback;
  if (candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  if (!LOCALE_PATH.test(candidate)) return fallback;
  try {
    const resolved = new URL(candidate, origin);
    if (resolved.origin !== new URL(origin).origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

/** `/ar/scans?x=1` -> `/en/scans?x=1` (only a leading locale segment is replaced; other paths unchanged). */
export function withLocale(path: string, locale: string): string {
  return LOCALE_PREFIX.test(path) ? path.replace(LOCALE_PREFIX, `/${locale}`) : path;
}

/**
 * The URL of the current page in another locale: the path prefix AND a `callbackUrl` query parameter are
 * switched, so someone who switches /ar/sign-in?callbackUrl=/ar/scans to English lands on /en/scans.
 */
export function switchLocaleHref(location: { pathname: string; search: string; hash: string }, locale: string): string {
  const rest = location.pathname.replace(LOCALE_PREFIX, "");
  const params = new URLSearchParams(location.search);
  const callback = params.get("callbackUrl");
  if (callback) params.set("callbackUrl", withLocale(callback, locale));
  const query = params.toString();
  return `/${locale}${rest === "/" ? "" : rest}${query ? `?${query}` : ""}${location.hash}`;
}
