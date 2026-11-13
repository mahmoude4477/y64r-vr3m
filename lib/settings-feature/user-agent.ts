// A small, dependency-free reading of a User-Agent header for the "active sessions" list: which browser, which
// operating system and what kind of device. Only for display: never for security decisions (the header is set by
// the client). Client-safe and pure.

export type BrowserName = "Edge" | "Opera" | "Samsung Internet" | "Firefox" | "Chrome" | "Safari";
export type OsName = "Windows" | "macOS" | "iOS" | "iPadOS" | "Android" | "ChromeOS" | "Linux";
export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";

export type DeviceInfo = { browser: BrowserName | null; os: OsName | null; device: DeviceKind };

/** Real User-Agent strings are well under 512 characters; longer input is cut before any pattern runs. */
const MAX_LENGTH = 512;

const UNKNOWN: DeviceInfo = { browser: null, os: null, device: "unknown" };

function browserOf(ua: string): BrowserName | null {
  // Order matters: Edge, Opera and Samsung Internet also send "Chrome/" and "Safari/"; Chrome sends "Safari/".
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\b/.test(ua)) return "Opera";
  if (/\bSamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "Firefox";
  if (/\b(?:Headless)?Chrome\/|\bCriOS\/|\bChromium\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "Safari";
  return null;
}

function osOf(ua: string): OsName | null {
  if (/\biPad\b/.test(ua)) return "iPadOS";
  if (/\b(?:iPhone|iPod)\b/.test(ua)) return "iOS";
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/\bCrOS\b/.test(ua)) return "ChromeOS";
  if (/\bWindows\b/.test(ua)) return "Windows";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS";
  if (/\bLinux\b|\bX11\b/.test(ua)) return "Linux";
  return null;
}

function deviceOf(ua: string, os: OsName | null): DeviceKind {
  if (os === "iPadOS" || /\bTablet\b/i.test(ua)) return "tablet";
  if (os === "iOS") return "mobile";
  // Android phones send "Mobile"; Android tablets do not.
  if (os === "Android") return /\bMobile\b/.test(ua) ? "mobile" : "tablet";
  if (/\bMobi/.test(ua)) return "mobile";
  if (os) return "desktop";
  return "unknown";
}

/** Browser, operating system and device kind of a User-Agent header (null parts when not recognised). */
export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo {
  if (!userAgent) return UNKNOWN;
  const ua = userAgent.slice(0, MAX_LENGTH);
  const os = osOf(ua);
  return { browser: browserOf(ua), os, device: deviceOf(ua, os) };
}
