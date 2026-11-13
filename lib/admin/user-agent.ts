// A short, human description of a session's user agent ("Edge on Windows") for the admin user page. Only the browser
// family and the operating system are shown, never the raw string (it fingerprints the device and is noise for an
// admin who wants to recognise a session). Pure, unit-tested; unknown agents fall back to null parts.

export type BrowserName = "edge" | "chrome" | "firefox" | "safari" | "opera" | "samsung";
export type OsName = "windows" | "macos" | "ios" | "android" | "linux" | "chromeos";
export type DeviceKind = "mobile" | "desktop";

export type UserAgentInfo = { browser: BrowserName | null; os: OsName | null; device: DeviceKind | null };

export function describeUserAgent(ua: string | null | undefined): UserAgentInfo {
  const s = (ua ?? "").slice(0, 512);
  if (!s.trim()) return { browser: null, os: null, device: null };

  let browser: BrowserName | null = null;
  if (/EdgA?\/|Edg\//.test(s)) browser = "edge";
  else if (/OPR\/|Opera/.test(s)) browser = "opera";
  else if (/SamsungBrowser\//.test(s)) browser = "samsung";
  else if (/Firefox\/|FxiOS\//.test(s)) browser = "firefox";
  else if (/Chrome\/|CriOS\//.test(s)) browser = "chrome";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "safari";

  let os: OsName | null = null;
  if (/iPhone|iPad|iPod/.test(s)) os = "ios";
  else if (/Android/.test(s)) os = "android";
  else if (/CrOS/.test(s)) os = "chromeos";
  else if (/Windows NT/.test(s)) os = "windows";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macos";
  else if (/Linux/.test(s)) os = "linux";

  const device: DeviceKind | null = os === null ? null : /Mobi|iPhone|iPod|Android.*Mobile/.test(s) ? "mobile" : "desktop";
  return { browser, os, device };
}
