/**
 * pnpm brand:assets — regenerates the brand images and COMMITS them (note 07 §2.7). Run by hand after a change to
 * the mark, the brand colours or messages/{ar,en}/meta.json. Never part of `build` or CI.
 *
 * Output:
 *   public/og/ar.png, public/og/en.png       1200×630 Open Graph / Twitter images, one per locale
 *   public/icons/icon-192.png, icon-512.png  web-manifest icons (navy rounded tile, transparent corners)
 *   public/icons/icon-maskable-512.png       full-bleed, mark inside the 80 % safe zone
 *   app/apple-icon.png                       180×180, opaque (iOS fills transparency with black)
 *   app/favicon.ico                          16/32/48 PNG-in-ICO (crawlers and old browsers)
 *   app/icon.svg                             the in-app mark, teal on light / cyan on dark (prefers-color-scheme)
 *
 * Why a browser and not next/og: Next 16.4.3 bundles satori 0.29.0, which crashes on most Arabic fonts and renders
 * Arabic words in reverse order (no bidi). Chromium shapes IBM Plex Sans Arabic correctly.
 *
 * Text comes only from messages/{ar,en}/meta.json (title, description) — no hard-coded copy, no team names, no award.
 * Colours: the deck navy/cyan from lib/brand.ts and the --primary theme tokens read from app/globals.css.
 * Fonts: @fontsource/ibm-plex-sans-arabic (OFL-1.1), served to the page from node_modules (no network).
 * Browser: Edge by default (E2E_CHANNEL=msedge), or E2E_CHROMIUM_PATH=<chrome.exe>; nothing is downloaded.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { BRAND_CYAN, BRAND_NAVY } from "../lib/brand";

const ROOT = path.resolve(import.meta.dirname, "..");
const FONT_DIR = path.join(ROOT, "node_modules", "@fontsource", "ibm-plex-sans-arabic");
const LOCALES = ["ar", "en"] as const;
type Locale = (typeof LOCALES)[number];
const OG_MAX_BYTES = 300 * 1024; // WhatsApp and some crawlers skip larger previews

/** The shield-with-check mark, copied from components/brand/logo.tsx (viewBox 0 0 32 32). Keep in step. */
const SHIELD = "M16 2.5 4.5 7v8.2c0 7.1 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.2 11.5-14.3V7L16 2.5Z";
const CHECK = "m10.5 16.2 3.7 3.7 7.4-7.6";

function markPaths(color: string, fillOpacity = 0.14): string {
  return (
    `<path d="${SHIELD}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${CHECK}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** A square icon: optional navy tile (rx = radius × size) with the mark scaled to `mark` × size, centred. */
function iconSvg(size: number, o: { tile: "rounded" | "full" | "none"; mark: number; color: string; radius?: number }): string {
  const m = size * o.mark;
  const k = m / 32;
  const off = (size - m) / 2;
  const bg =
    o.tile === "none"
      ? ""
      : `<rect width="${size}" height="${size}" rx="${o.tile === "rounded" ? size * (o.radius ?? 0.22) : 0}" fill="${BRAND_NAVY}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `${bg}<g transform="translate(${off} ${off}) scale(${k})">${markPaths(o.color)}</g></svg>`
  );
}

/** --primary of :root and .dark from app/globals.css (oklch(...) strings). */
function primaryTokens(): { light: string; dark: string } {
  const css = readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`globals.css: ${selector} block not found`);
    return css.slice(start, css.indexOf("}", start));
  };
  const primary = (text: string) => {
    const match = /--primary:\s*(oklch\([^)]*\))/.exec(text);
    if (!match) throw new Error("globals.css: --primary not found");
    return match[1];
  };
  return { light: primary(block(":root")), dark: primary(block(".dark")) };
}

/** Exact sRGB hex of any CSS colour, computed by the browser (canvas), so oklch tokens become hex for SVG/PNG. */
async function toHex(page: Page, color: string): Promise<string> {
  return page.evaluate((c) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }, color);
}

function messages(locale: Locale): { title: string; description: string } {
  const json = JSON.parse(readFileSync(path.join(ROOT, "messages", locale, "meta.json"), "utf8")) as Record<string, string>;
  if (!json.title || !json.description) throw new Error(`messages/${locale}/meta.json: title/description missing`);
  return { title: json.title, description: json.description };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** fontsource's own @font-face rules (Arabic + Latin subsets, 500/700), pointed at the local route below. */
function fontCss(): string {
  return ["500", "700"]
    .flatMap((w) => [`arabic-${w}.css`, `latin-${w}.css`])
    .map((f) => readFileSync(path.join(FONT_DIR, f), "utf8").replaceAll("url(./files/", "url(http://brand.local/files/"))
    .join("\n");
}

function ogHtml(locale: Locale): string {
  const own = messages(locale);
  const other = messages(locale === "ar" ? "en" : "ar");
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><style>
${fontCss()}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { background: ${BRAND_NAVY}; color: #e6f1f4; font-family: "IBM Plex Sans Arabic", sans-serif; position: relative;
  -webkit-font-smoothing: antialiased; }
.glow { position: absolute; inset: 0;
  background: radial-gradient(55% 75% at ${dir === "rtl" ? "88%" : "12%"} 12%, rgba(95,208,227,.20), transparent 70%),
              radial-gradient(45% 60% at ${dir === "rtl" ? "8%" : "92%"} 105%, rgba(95,208,227,.10), transparent 70%); }
.wrap { position: absolute; inset: 0; padding: 84px 96px 96px; display: flex; flex-direction: column; justify-content: center; gap: 44px; }
.brand { display: flex; align-items: center; gap: 40px; }
.brand svg { width: 176px; height: 176px; flex: none; }
.names { display: flex; flex-direction: column; gap: 10px; }
.name { font-size: 128px; font-weight: 700; line-height: 1.05; color: ${BRAND_CYAN}; }
.other { font-size: 36px; font-weight: 500; line-height: 1.2; color: #8fb3bd; }
.desc { font-size: 44px; font-weight: 500; line-height: 1.5; max-width: 1000px; color: #e6f1f4; text-wrap: balance; }
.bar { position: absolute; inset-inline: 0; bottom: 0; height: 12px; background: linear-gradient(to left, ${BRAND_CYAN}, #2aa7b8); }
</style></head><body>
<div class="glow"></div>
<div class="wrap">
  <div class="brand">${iconSvg(176, { tile: "none", mark: 1, color: BRAND_CYAN })}
    <div class="names"><div class="name">${escapeHtml(own.title)}</div>
    <div class="other" lang="${locale === "ar" ? "en" : "ar"}">${escapeHtml(other.title)}</div></div>
  </div>
  <p class="desc">${escapeHtml(own.description)}</p>
</div>
<div class="bar"></div>
</body></html>`;
}

/** PNG-in-ICO (Vista+ and every current browser read PNG entries). */
function ico(pngs: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

function write(rel: string, data: Buffer | string) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`brand-assets: ${rel} (${(statSync(file).size / 1024).toFixed(1)} KB)`);
}

const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_PATH
    ? { executablePath: process.env.E2E_CHROMIUM_PATH }
    : { channel: process.env.E2E_CHANNEL ?? "msedge" },
);
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route("http://brand.local/**", async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "");
    if (!/^files\/ibm-plex-sans-arabic-[a-z-]+-\d00-normal\.woff2?$/.test(rel)) return route.fulfill({ status: 404 });
    await route.fulfill({ body: readFileSync(path.join(FONT_DIR, rel)), contentType: "font/woff2" });
  });
  await page.goto("http://brand.local/files/none").catch(() => undefined); // gives the page an origin for the fonts

  // Open Graph images
  await page.setViewportSize({ width: 1200, height: 630 });
  for (const locale of LOCALES) {
    await page.setContent(ogHtml(locale), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(
      ([title]) => document.fonts.check(`700 128px "IBM Plex Sans Arabic"`, title),
      [messages(locale).title],
    );
    if (!loaded) throw new Error(`IBM Plex Sans Arabic did not load for ${locale}`);
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
    write(`public/og/${locale}.png`, png);
    if (png.length > OG_MAX_BYTES) console.warn(`brand-assets: public/og/${locale}.png is over ${OG_MAX_BYTES / 1024} KB`);
  }

  // Square icons (transparent page background so rounded corners stay transparent)
  const shot = async (svg: string, size: number) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
    return page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  for (const size of [192, 512]) {
    write(`public/icons/icon-${size}.png`, await shot(iconSvg(size, { tile: "rounded", mark: 0.64, color: BRAND_CYAN }), size));
  }
  write("public/icons/icon-maskable-512.png", await shot(iconSvg(512, { tile: "full", mark: 0.56, color: BRAND_CYAN }), 512));
  write("app/apple-icon.png", await shot(iconSvg(180, { tile: "full", mark: 0.62, color: BRAND_CYAN }), 180));
  const favicons = [];
  for (const size of [16, 32, 48]) {
    favicons.push({ size, data: await shot(iconSvg(size, { tile: "rounded", mark: 0.8, color: BRAND_CYAN, radius: 0.2 }), size) });
  }
  write("app/favicon.ico", ico(favicons));

  // app/icon.svg: the in-app mark in the theme's --primary (light) and its dark variant.
  const tokens = primaryTokens();
  const light = await toHex(page, tokens.light);
  const dark = await toHex(page, tokens.dark);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<style>.m{color:${light}}@media (prefers-color-scheme:dark){.m{color:${dark}}}</style>` +
    `<g class="m">${markPaths("currentColor")}</g></svg>\n`;
  write("app/icon.svg", svg);
} finally {
  await browser.close();
}
