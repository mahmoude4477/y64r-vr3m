// Locale of an API request (Route Handlers and Better Auth endpoints sit outside [locale], where
// next/root-params throws). Same-origin Referer first path segment, e.g. https://host/ar/sign-in -> "ar".
export type RequestLocale = "ar" | "en";

export function localeFromHeaders(headers: Headers | null | undefined): RequestLocale | null {
  const referer = headers?.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
    if (host && url.host !== host) return null; // only trust our own pages
    const first = url.pathname.split("/")[1];
    return first === "ar" || first === "en" ? first : null;
  } catch {
    return null;
  }
}
