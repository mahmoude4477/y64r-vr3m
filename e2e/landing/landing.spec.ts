import type { Locator, Page } from "@playwright/test";
import { INSTITUTION_CONTACT } from "../../lib/landing/contact";
import { SAMPLE_DEPARTMENTS } from "../../lib/landing/sample";
import { LANDING_SECTIONS } from "../../lib/routes";
import { expectAccessible } from "../support/a11y";
import { DIR, expect, type Locale, LOCALES, msg, test, urlPath } from "../support/fixtures";
import { FORBIDDEN_COPY } from "./forbidden-copy";

// The public landing page (/ar, /en): content in the right language and direction, every call to action goes to
// sign-up, the section links and keyboard focus stay clear of the sticky header, the product pictures are readable
// and their sample-data tag visible, nothing forbidden is served (PRODUCT.md: no team names, no award line; no
// contact address until one is chosen), and WCAG 2.2 AA in light and dark. Both projects run these, so
// everything is checked on desktop and on a 390 px phone.

const SECTION_TITLES = {
  features: "landing.features.title",
  "how-it-works": "landing.howItWorks.title",
  institutions: "landing.institutions.title",
} as const;

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 640;

/** Bottom edge of whatever stays stuck to the top of the viewport (the site header). */
function stickyBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    let bottom = 0;
    for (const el of document.querySelectorAll("header, nav")) {
      const style = getComputedStyle(el);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      const rect = el.getBoundingClientRect();
      // Stuck = sitting exactly at its `top` offset.
      if (Math.abs(rect.top - (Number.parseFloat(style.top) || 0)) < 1) bottom = Math.max(bottom, rect.bottom);
    }
    return bottom;
  });
}

/** True when the element's centre is not covered by anything else (e.g. the phone in the hero picture). */
async function onTop(target: Locator): Promise<boolean> {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
}

/**
 * The hero's product picture: readable text, a readable sample-data tag, nothing important behind the phone, no
 * empty part in the dashboard card, and the phone's contents inside its frame.
 */
async function checkProductPicture(page: Page, locale: Locale) {
  const picture = page.getByRole("img", { name: msg(locale, "landing.visual.label") });
  await picture.scrollIntoViewIfNeeded();

  // Every text in the picture, at its rendered size (SVG text scaled by its viewBox). On a 390 px phone the
  // whole picture used to shrink to 6-7 px, the "sample data" tag included (landing review r1).
  const texts = await picture.evaluate((root) => {
    const out: { text: string; px: number }[] = [];
    for (const el of root.querySelectorAll("*")) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (!own || el.getClientRects().length === 0) continue;
      let px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (el instanceof SVGElement && el.ownerSVGElement) {
        const svg = el.ownerSVGElement;
        px *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      }
      out.push({ text: own, px: Math.round(px * 10) / 10 });
    }
    return out;
  });
  expect(texts.length).toBeGreaterThan(10);
  const floor = isPhone(page) ? 10 : 9;
  for (const { text, px } of texts) expect(px, `"${text}" in the picture`).toBeGreaterThanOrEqual(floor);
  const sample = texts.find((x) => x.text === msg(locale, "landing.visual.sample"));
  expect(sample?.px, "the sample-data tag").toBeGreaterThanOrEqual(12);

  // The phone covers the reading-start side of the dashboard; what explains the picture stays in front of it:
  // the sample-data tag, the headline figure and the legend of the dashed target line (the y-axis labels it
  // used to cover are gone).
  for (const key of ["landing.visual.sample", "landing.visual.dashboard.compliance", "landing.visual.dashboard.target"]) {
    expect(await onTop(picture.getByText(msg(locale, key), { exact: true })), `${key} is covered`).toBe(true);
  }
  // And no text of the dashboard is half under the phone: a glyph peeking out at its edge or rounded corner
  // reads as a rendering glitch (a lone "1" of the old y-axis, then the first month and the English chart title).
  const peeking = await picture.evaluate((root) => {
    const phone = [...root.querySelectorAll("*")].find((el) => getComputedStyle(el).overflow === "clip");
    const bad: string[] = [];
    for (const el of root.querySelectorAll("*")) {
      if (phone?.contains(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!own || el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      for (const x of [r.left + 1.5, r.left + r.width / 2, r.right - 1.5]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) {
          bad.push((el.textContent ?? "").trim());
          break;
        }
      }
    }
    return bad;
  });
  expect(peeking, "texts partly hidden under the phone").toEqual([]);

  // The phone's contents fit its screen in both languages: the last button sits inside the bezel and the phone
  // kept its drawn proportions (in English the button used to run into the frame and be cut off).
  const fit = await picture.getByText(msg(locale, "common.actions.next"), { exact: true }).evaluate((button) => {
    let phone = button.parentElement;
    while (phone && getComputedStyle(phone).overflow !== "clip") phone = phone.parentElement;
    if (!phone) return null;
    const frame = phone.getBoundingClientRect();
    const bezel = Number.parseFloat(getComputedStyle(phone).borderBottomWidth);
    return { gap: frame.bottom - bezel - button.getBoundingClientRect().bottom, ratio: frame.height / frame.width };
  });
  expect(fit, "phone frame").not.toBeNull();
  expect(fit!.gap, "space under the phone's last button").toBeGreaterThan(2);
  expect(fit!.ratio, "phone proportions").toBeCloseTo(292 / 200, 1);

  // The dashboard card's content reaches its bottom edge. On phones the card was stretched to the height of the
  // (taller) phone and ended in an empty 54 px strip (landing review r2). Its content = what paints a background.
  const strip = await picture.evaluate((root) => {
    const card = root.firstElementChild?.firstElementChild; // the picture's grid > the dashboard card
    if (!card) return null;
    let content = 0;
    for (const el of card.querySelectorAll("*")) {
      if (el.getClientRects().length === 0 || getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)") continue;
      content = Math.max(content, el.getBoundingClientRect().bottom);
    }
    const inner = card.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(card).borderBottomWidth);
    return inner - content;
  });
  expect(strip, "dashboard card").not.toBeNull();
  expect(strip!, "empty strip at the bottom of the dashboard card, px").toBeLessThanOrEqual(2);
}

for (const locale of LOCALES) {
  test.describe(`/${locale}`, () => {
    test("headline, sections and illustrations in the page's language and direction", async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", DIR[locale]);
      const title = `${msg(locale, "landing.meta.title")} | ${msg(locale, "meta.title")}`;
      await expect(page).toHaveTitle(title);
      await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
        "content",
        msg(locale, "landing.meta.description"),
      );
      // Share cards name the product too (socialMetadata alone sets the bare page title).
      await expect(page.locator('head meta[property="og:title"]')).toHaveAttribute("content", title);
      await expect(page.locator('head meta[name="twitter:title"]')).toHaveAttribute("content", title);

      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(`${msg(locale, "landing.hero.titleLead")} ${msg(locale, "landing.hero.titleAccent")}`);

      for (const key of Object.values(SECTION_TITLES)) {
        await expect(page.getByRole("heading", { level: 2, name: msg(locale, key) })).toBeAttached();
      }
      await expect(page.getByRole("heading", { level: 2, name: msg(locale, "landing.closing.titleEnd") })).toBeAttached();

      // The product pictures are single images with a label, so their sample values are never read out as data.
      await expect(page.getByRole("img", { name: msg(locale, "landing.visual.label") })).toBeVisible();
      await expect(page.getByRole("img", { name: msg(locale, "landing.institutions.chart.label") })).toBeAttached();

      // The footer keeps the educational disclaimer.
      await expect(page.getByRole("contentinfo")).toContainText(msg(locale, "common.marketing.disclaimer"));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
    });

    test("every call to action goes to sign-up, under one name", async ({ page }) => {
      await page.goto(`/${locale}`);
      // One destination, one label: the page used three near-identical names for the same link (landing review r2).
      const label = msg(locale, "landing.hero.primaryCta");
      const sections = ["section[aria-labelledby=hero-title]", "section[aria-labelledby=closing-title]"];
      if (INSTITUTION_CONTACT === null) sections.push("section#institutions");
      const ctas = sections.map((section) => page.locator(section).getByRole("link", { name: label, exact: true }));
      for (const cta of ctas) await expect(cta).toHaveAttribute("href", `/${locale}/sign-up`);
      const signUpLinks = page.getByRole("main").locator(`a[href="/${locale}/sign-up"]`);
      await expect(signUpLinks).toHaveCount(sections.length);
      for (const link of await signUpLinks.all()) await expect(link).toHaveAccessibleName(label);

      await ctas[0].click();
      await expect(page).toHaveURL(urlPath(`/${locale}/sign-up`));
      await expect(page.locator("#email")).toBeVisible();
    });

    test("sign-in is one tap away on every screen size", async ({ page }) => {
      await page.goto(`/${locale}`);
      // The site header shows its sign-in link from 640 px; on a phone the hero offers it instead.
      const phone = isPhone(page);
      const inHero = page
        .locator("section[aria-labelledby=hero-title]")
        .getByRole("link", { name: msg(locale, "landing.hero.signIn"), exact: true });
      const inHeader = page.getByRole("banner").getByRole("link", { name: msg(locale, "common.marketing.signIn"), exact: true });
      const link = phone ? inHero : inHeader;
      await expect(phone ? inHeader : inHero).toBeHidden();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/${locale}/sign-in`);
      await link.click();
      await expect(page).toHaveURL(urlPath(`/${locale}/sign-in`));
    });

    test("section links land on their section, below the sticky header", async ({ page }) => {
      test.slow(); // several clicks and scrolls; next to axe scans on 4 workers it outgrew 30 s
      await page.goto(`/${locale}`);
      // The site header shows the section links from 768 px (md); phones scroll the page and use the hero's link.
      const wide = (page.viewportSize()?.width ?? 1280) >= 768;
      const nav = page.getByRole("banner").getByRole("navigation", { name: msg(locale, "common.marketing.nav.label") });
      if (!wide) await expect(nav).toBeHidden();

      for (const { id, key } of wide ? LANDING_SECTIONS : []) {
        const link = nav.getByRole("link", { name: msg(locale, `common.marketing.nav.${key}`), exact: true });
        await expect(link).toHaveAttribute("href", `/${locale}#${id}`);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}#${id}$`));
        const heading = page.getByRole("heading", { level: 2, name: msg(locale, SECTION_TITLES[id]) });
        await expect(heading).toBeInViewport();
        const box = await heading.boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.y, `${id}: heading hidden under the sticky header`).toBeGreaterThanOrEqual((await stickyBottom(page)) - 1);
      }

      // The hero's secondary call to action jumps to "how it works".
      await page.evaluate(() => window.scrollTo(0, 0));
      // In the hero (in English the page links say "How it works" too).
      const hero = page.locator("section[aria-labelledby=hero-title]");
      const how = hero.getByRole("link", { name: msg(locale, "landing.hero.secondaryCta"), exact: true });
      await expect(how).toHaveAttribute("href", "#how-it-works");
      await how.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}#how-it-works$`));
      await expect(page.getByRole("heading", { level: 2, name: msg(locale, SECTION_TITLES["how-it-works"]) })).toBeInViewport();
    });

    test("keyboard focus is never hidden under the sticky header (WCAG 2.2 2.4.11)", async ({ page }) => {
      // Shift+Tab back to a link just above the viewport makes the browser scroll it to the top edge: without a
      // scroll margin it landed fully under the header (landing review r1, 390 px, Arabic).
      await page.goto(`/${locale}`);
      await page.getByRole("main").getByRole("link").last().focus();
      let visited = 0;
      for (let step = 0; step < 30; step++) {
        await page.keyboard.press("Shift+Tab");
        const focused = await page.evaluate(async () => {
          const el = document.activeElement;
          if (!el || !el.closest("main")) return null;
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          const box = el.getBoundingClientRect();
          return {
            name: (el.textContent ?? "").trim(),
            top: box.top,
            bottom: box.bottom,
            header: document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
            viewport: window.innerHeight,
          };
        });
        if (!focused) break;
        visited++;
        expect(focused.top, `"${focused.name}" is under the sticky header`).toBeGreaterThanOrEqual(focused.header - 1);
        expect(focused.bottom, `"${focused.name}" is below the viewport`).toBeLessThanOrEqual(focused.viewport + 1);
      }
      // The hero's calls to action and the institutions one (the closing one was the start).
      expect(visited, "links walked inside main").toBeGreaterThanOrEqual(3);
    });

    test("the product picture: readable text, a readable sample-data tag, nothing important behind the phone", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await checkProductPicture(page, locale);
    });

    test("the product picture at 1024 px, the narrowest the two-column hero makes it", async ({ page }, testInfo) => {
      // At 1024 px (iPad landscape, small laptops) the picture is only 476 px wide: the phone's texts were 8.5 px
      // there (landing review r2). A desktop width: the phone project would only repeat the desktop run.
      test.skip(testInfo.project.name !== "desktop", "a desktop width");
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`/${locale}`);
      await checkProductPicture(page, locale);
    });

    test("the department chart shows every department name in full", async ({ page }) => {
      await page.goto(`/${locale}`);
      const chart = page.getByRole("img", { name: msg(locale, "landing.institutions.chart.label") });
      await chart.scrollIntoViewIfNeeded();
      for (const { key } of SAMPLE_DEPARTMENTS) {
        const label = chart.getByText(msg(locale, `landing.institutions.chart.departments.${key}`), { exact: true });
        await expect(label).toBeVisible();
        const clipped = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
        expect(clipped, `${key} is cut off`).toBe(false);
      }
    });

    test("the closing slogan keeps its two halves on lines of their own", async ({ page }) => {
      // «من اكتشاف الخلل بعد وقوعه،» / «إلى التنبّه له قبل أن يتحوّل إلى خطر.»: on phones the halves ran inline and
      // the first line ended on a dangling «إلى» (landing review r2).
      await page.goto(`/${locale}`);
      const title = page.locator("#closing-title");
      await title.scrollIntoViewIfNeeded();
      await expect(title.locator(":scope > span")).toHaveText([
        msg(locale, "landing.closing.titleStart"),
        msg(locale, "landing.closing.titleEnd"),
      ]);
      const gap = await title.evaluate((heading) => {
        const [start, end] = [...heading.querySelectorAll(":scope > span")].map((span) => [...span.getClientRects()]);
        return end[0].top - start[start.length - 1].bottom;
      });
      expect(gap, "the second half starts on the last line of the first one").toBeGreaterThanOrEqual(-1);
    });

    test("no team names, no award line, no invented contact address", async ({ page }) => {
      await page.goto(`/${locale}`);
      const visible = await page.locator("body").innerText();
      const head = await page.evaluate(() =>
        [
          document.title,
          ...[...document.querySelectorAll("meta[content]")].map((m) => m.getAttribute("content") ?? ""),
          ...[...document.querySelectorAll("[aria-label]")].map((m) => m.getAttribute("aria-label") ?? ""),
        ].join("\n"),
      );
      for (const pattern of FORBIDDEN_COPY) {
        expect(visible, `visible text matches ${pattern}`).not.toMatch(pattern);
        expect(head, `metadata or labels match ${pattern}`).not.toMatch(pattern);
      }
      // Everything the server sends, not only what is rendered: attributes, hidden elements, JSON-LD and the RSC
      // payload, which carries every message of every namespace (the root layout gives next-intl's client provider
      // all messages), and the web manifest.
      for (const path of [`/${locale}`, `/${locale}/manifest.webmanifest`]) {
        const raw = await (await page.request.get(path)).text();
        expect(raw.length, path).toBeGreaterThan(100);
        for (const pattern of FORBIDDEN_COPY) expect(raw, `${path} matches ${pattern}`).not.toMatch(pattern);
      }
      if (INSTITUTION_CONTACT === null) {
        await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
        expect(visible).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      }
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`accessible (${scheme})`, async ({ page }, testInfo) => {
        test.slow(); // a full WCAG 2.2 scan of a long page; next to other scans it outgrew 30 s
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/${locale}`);
        if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expectAccessible(page, testInfo, { label: `${locale}-${scheme}` });
      });
    }
  });
}

// Focus styles, print colours and caching do not depend on the language: checked once, on the Arabic page.

for (const scheme of ["light", "dark"] as const) {
  test(`keyboard focus on every link of the page is solid and 3:1 against the page (${scheme})`, async ({ page }) => {
    // WCAG 2.2 1.4.11 asks 3:1 of a focus indicator. The section links and the hero's "sign in" only had the 50 %
    // ring halo: 1.9:1 in light, 2.7:1 in dark (landing review r2); so did the outline calls to action in dark mode,
    // where the button's dark border overrode its focus border. axe does not check focus styles.
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/ar");
    if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    // The resting border of every control, to tell a focus border from it.
    await page.evaluate(() => {
      const store = window as unknown as { restingBorder: Map<Element, string> };
      store.restingBorder = new Map(
        [...document.querySelectorAll("main a, main button")].map((el) => [el, getComputedStyle(el).borderTopColor]),
      );
    });
    const visited: string[] = [];
    for (let step = 0; step < 60; step++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(async () => {
        const el = document.activeElement;
        if (!el || !el.closest("main")) return null;
        // Apply the focus styles (reading a style does), then let their transitions finish.
        void getComputedStyle(el).outlineColor;
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)));

        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const rgba = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return { r, g, b, a };
        };
        const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        // The colour around the control: its nearest ancestor that paints an opaque background.
        let around = rgba("#fff");
        for (let node = el.parentElement; node; node = node.parentElement) {
          const color = rgba(getComputedStyle(node).backgroundColor);
          if (color.a === 255) {
            around = color;
            break;
          }
        }
        const style = getComputedStyle(el);
        const resting = (window as unknown as { restingBorder: Map<Element, string> }).restingBorder.get(el);
        const indicators: Array<[string, string]> = [];
        if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2) {
          indicators.push(["outline", style.outlineColor]);
        }
        if (Number.parseFloat(style.borderTopWidth) >= 1 && style.borderTopColor !== resting) {
          indicators.push(["border", style.borderTopColor]);
        }
        let contrast = 0;
        let indicator = "only a translucent halo, or nothing";
        for (const [kind, value] of indicators) {
          const color = rgba(value);
          if (color.a !== 255) continue; // a translucent halo is not a solid indicator
          const [hi, lo] = [luminance(color), luminance(around)].sort((x, y) => y - x);
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio > contrast) [contrast, indicator] = [ratio, `${kind} ${value}`];
        }
        return { name: (el.textContent ?? "").trim(), contrast: Math.round(contrast * 100) / 100, indicator };
      });
      if (!focus) {
        if (visited.length > 0) break; // past the last control of the page
        continue; // still in the site header
      }
      visited.push(focus.name);
      expect(focus.contrast, `focus on "${focus.name}": ${focus.indicator}`).toBeGreaterThanOrEqual(3);
    }
    // The hero's calls to action, the institutions and the closing ones.
    expect(visited.length, "controls walked inside main").toBeGreaterThanOrEqual(4);
  });
}

test("printing keeps the colours of the whole page, the site header included", async ({ page }) => {
  // With the browser's default print settings (no backgrounds), the header's "create account" button printed as a
  // pale label with no fill: it sits outside the landing's own wrapper (landing review r2).
  await page.goto("/ar");
  await page.emulateMedia({ media: "print" });
  const adjust = (target: Locator) =>
    target.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.getPropertyValue("print-color-adjust") || style.getPropertyValue("-webkit-print-color-adjust");
    });
  expect(await adjust(page.getByRole("banner")), "site header").toBe("exact");
  const cta = page
    .locator("section[aria-labelledby=hero-title]")
    .getByRole("link", { name: msg("ar", "landing.hero.primaryCta"), exact: true });
  expect(await adjust(cta), "hero call to action").toBe("exact");
});

test("the landing is fully static, so it can be cached", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one HTTP check is enough");
  // The site header reads no request data (its signed-in switch is a client island, components/marketing/header-auth),
  // so /ar and /en are fully static: no postponed Suspense hole, cacheable, and the RSC payload is not inlined twice.
  for (const locale of LOCALES) {
    const response = await request.get(`/${locale}`);
    expect(response.status(), `/${locale}`).toBe(200);
    expect(response.headers()["x-nextjs-postponed"], `/${locale}: postponed (partly static)`).toBeUndefined();
    expect(response.headers()["cache-control"], `/${locale}: cache-control`).not.toMatch(/private|no-store/);
  }
});
