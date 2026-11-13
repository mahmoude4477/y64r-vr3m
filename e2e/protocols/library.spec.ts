import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { cleanup, db, seedProtocol, seedProtocols, testSlug } from "./support";

// The protocol library (/protocols): published global protocols for an individual trainee, category chips and the
// search box, both driven by the URL. Institution protocols are covered in detail.spec.ts.

test.use({ storageState: TRAINEE_STATE });

const categories = (locale: "ar" | "en") => (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: msg(locale, "protocols.library.categoriesLabel") });

test("lists every published global protocol, never an unpublished one", async ({ page }) => {
  test.setTimeout(150_000); // two runs of the database helper (tsx + Prisma) around the page, 8 cards to check
  const draft = testSlug("draft");
  db([{ type: "globalProtocol", slug: draft, isPublished: false, titleAr: `مسودة ${draft}`, titleEn: `Draft ${draft}` }]);
  try {
    await page.goto("/ar/protocols");
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "protocols.title") })).toBeVisible();
    for (const p of seedProtocols) {
      await expect(page.getByRole("link", { name: p.titleAr, exact: true })).toBeVisible();
    }
    await expect(page.getByText(`مسودة ${draft}`)).toHaveCount(0);

    // A card links to its detail page and shows its category.
    const sharps = seedProtocol("sharps-safety");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: sharps.titleAr, exact: true }) });
    await expect(card.getByText(msg("ar", "common.category.safety"), { exact: true })).toBeVisible();
    await card.getByRole("link", { name: sharps.titleAr, exact: true }).click();
    await expect(page).toHaveURL(urlPath("/ar/protocols/sharps-safety"));
    await expect(page.getByRole("heading", { level: 1, name: sharps.titleAr })).toBeVisible();
  } finally {
    cleanup({ protocolSlugs: [draft] });
  }
});

test("filters by category with links that keep a URL", async ({ page }) => {
  await page.goto("/ar/protocols");
  const chips = categories("ar")(page);
  await chips.getByRole("link", { name: msg("ar", "common.category.waste") }).click();
  await expect(page).toHaveURL(urlPath("/ar/protocols?category=waste"));
  await expect(chips.getByRole("link", { name: msg("ar", "common.category.waste") })).toHaveAttribute("aria-current", "true");

  const waste = seedProtocols.filter((p) => p.category === "waste");
  const others = seedProtocols.filter((p) => p.category !== "waste");
  for (const p of waste) await expect(page.getByRole("link", { name: p.titleAr, exact: true })).toBeVisible();
  for (const p of others) await expect(page.getByRole("link", { name: p.titleAr, exact: true })).toHaveCount(0);

  // "All" brings everything back.
  await chips.getByRole("link", { name: msg("ar", "protocols.library.allCategories") }).click();
  await expect(page).toHaveURL(urlPath("/ar/protocols"));
  for (const p of others) await expect(page.getByRole("link", { name: p.titleAr, exact: true })).toBeVisible();
});

test("search matches both languages and Arabic letter variants, and offers a way back", async ({ page }) => {
  const waste = seedProtocol("waste-management");
  const sharps = seedProtocol("sharps-safety");
  await page.goto("/ar/protocols");
  const search = page.getByRole("searchbox", { name: msg("ar", "protocols.library.searchLabel") });
  await waitForHydration(search);

  // "اداره" (no hamza, heh instead of teh marbuta) still finds «إدارة النفايات…».
  await search.fill("اداره");
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByRole("link", { name: waste.titleAr, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: sharps.titleAr, exact: true })).toHaveCount(0);

  // The English title, on the Arabic page.
  await search.fill(sharps.titleEn);
  await expect(page.getByRole("link", { name: sharps.titleAr, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: waste.titleAr, exact: true })).toHaveCount(0);

  // Nothing matches: the empty state and its way back.
  await search.fill("zzzz-nothing");
  await expect(page.getByRole("heading", { name: msg("ar", "common.states.noResults") })).toBeVisible();
  await page.getByRole("link", { name: msg("ar", "protocols.library.noResults.clear") }).click();
  await expect(page).toHaveURL(urlPath("/ar/protocols"));
  await expect(search).toHaveValue("");
  await expect(page.getByRole("link", { name: sharps.titleAr, exact: true })).toBeVisible();
});

test("a shared URL with search and category opens filtered, in English", async ({ page }) => {
  const hygiene = seedProtocols.filter((p) => p.category === "hygiene");
  const target = seedProtocol("hand-hygiene-station");
  await page.goto(`/en/protocols?category=hygiene&q=${encodeURIComponent(target.titleEn)}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("searchbox", { name: msg("en", "protocols.library.searchLabel") })).toHaveValue(target.titleEn);
  await expect(page.getByRole("link", { name: target.titleEn, exact: true })).toBeVisible();
  for (const p of hygiene.filter((h) => h.slug !== target.slug)) {
    await expect(page.getByRole("link", { name: p.titleEn, exact: true })).toHaveCount(0);
  }
  await expect(categories("en")(page).getByRole("link", { name: msg("en", "common.category.hygiene") })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("an unknown category in the URL is ignored", async ({ page }) => {
  await page.goto("/en/protocols?category=secret");
  for (const p of seedProtocols) await expect(page.getByRole("link", { name: p.titleEn, exact: true })).toBeVisible();
  await expect(categories("en")(page).getByRole("link", { name: msg("en", "protocols.library.allCategories") })).toHaveAttribute(
    "aria-current",
    "true",
  );
});
