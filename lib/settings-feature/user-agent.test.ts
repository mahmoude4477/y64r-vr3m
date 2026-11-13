import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./user-agent";

// Real User-Agent strings of current browsers (2026), and the ones our e2e runs send.
const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  chromeAndroidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  operaWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/125.0.0.0",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 16181.47.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  headless:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  playwrightApi: "Playwright/1.58.0 (x64; windows 10.0) node/24.20",
};

describe("parseUserAgent", () => {
  it.each([
    ["chromeWindows", "Chrome", "Windows", "desktop"],
    ["edgeWindows", "Edge", "Windows", "desktop"],
    ["safariMac", "Safari", "macOS", "desktop"],
    ["firefoxLinux", "Firefox", "Linux", "desktop"],
    ["safariIphone", "Safari", "iOS", "mobile"],
    ["chromeIphone", "Chrome", "iOS", "mobile"],
    ["safariIpad", "Safari", "iPadOS", "tablet"],
    ["chromeAndroidPhone", "Chrome", "Android", "mobile"],
    ["chromeAndroidTablet", "Chrome", "Android", "tablet"],
    ["samsungAndroid", "Samsung Internet", "Android", "mobile"],
    ["operaWindows", "Opera", "Windows", "desktop"],
    ["firefoxIphone", "Firefox", "iOS", "mobile"],
    ["chromeOs", "Chrome", "ChromeOS", "desktop"],
    ["headless", "Chrome", "Windows", "desktop"],
  ] as const)("%s -> %s on %s (%s)", (key, browser, os, device) => {
    expect(parseUserAgent(UA[key])).toEqual({ browser, os, device });
  });

  it("reads nothing it does not recognise", () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, device: "unknown" });
    expect(parseUserAgent("")).toEqual({ browser: null, os: null, device: "unknown" });
    expect(parseUserAgent("curl/8.9.1")).toEqual({ browser: null, os: null, device: "unknown" });
  });

  it("does not guess a browser for API clients", () => {
    expect(parseUserAgent(UA.playwrightApi).browser).toBeNull();
  });

  it("only reads the first 512 characters", () => {
    const padded = `${"x".repeat(600)} Firefox/144.0 (Windows NT 10.0)`;
    expect(parseUserAgent(padded)).toEqual({ browser: null, os: null, device: "unknown" });
  });
});
