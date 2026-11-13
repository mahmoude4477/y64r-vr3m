import { expectAccessible } from "../support/a11y";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, waitForHydration } from "../support/fixtures";
import { choose, listStatus, ready, seedAssessments, summaryText } from "./helpers";

// /admin/ai (PRODUCT 6a "AI & settings"): the model settings (saved with setSetting, audited) and the AI calls with
// their status, the failure log and the totals. AI is off on e2e servers: nothing here reaches a model.

test.use({ storageState: ADMIN_STATE });

test("change the daily limit, go back to the server default, refuse an invalid model id (audited)", async ({ page }, testInfo) => {
  // The settings are platform-wide: one project changes them, so two runs never race each other.
  test.skip(testInfo.project.name !== "desktop", "platform-wide setting: desktop project only");
  test.slow();

  await page.goto("/en/admin/ai");
  await ready(page, msg("en", "nav.sub.adminAi"), undefined, "en");
  await expect(page.getByText(msg("en", "admin.ai.service.off"))).toBeVisible();
  // AI is off on e2e servers (ANTHROPIC_API_KEY is blank): the settings still save, and say so.

  const limit = page.getByRole("region", { name: msg("en", "admin.ai.settings.limit.title") });
  const input = limit.getByLabel(msg("en", "admin.ai.settings.limit.label"));
  await waitForHydration(input);
  const next = (await input.inputValue()) === "37" ? "38" : "37";
  await input.fill(next);
  await limit.getByRole("button", { name: msg("en", "admin.ai.settings.save") }).click();
  await expect(page.getByText(msg("en", "admin.ai.settings.saved")).first()).toBeVisible({ timeout: 20_000 });
  await expect(limit.getByText(msg("en", "admin.ai.settings.limit.value").replace("{n}", next))).toBeVisible({ timeout: 20_000 });
  await expect(limit.getByText(msg("en", "admin.ai.settings.source.panelBy").split("{date}")[0])).toBeVisible();

  // Back to the server default: the server's AI_DAILY_LIMIT_PER_USER, or the built-in default without one.
  await limit.getByRole("button", { name: msg("en", "admin.ai.settings.reset") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "admin.ai.settings.reset") }).click();
  await expect(
    limit.getByText(msg("en", "admin.ai.settings.source.default")).or(limit.getByText(msg("en", "admin.ai.settings.source.environment"))),
  ).toBeVisible({ timeout: 20_000 });
  await expect(limit.getByText(msg("en", "admin.ai.settings.source.panelBy").split("{date}")[0])).toHaveCount(0);
  await expect(limit.getByRole("button", { name: msg("en", "admin.ai.settings.reset") })).toHaveCount(0);

  // A model id that is not a Claude id is refused in the form, and the current one stays.
  const model = page.getByRole("region", { name: msg("en", "admin.ai.settings.model.title") });
  const current = await model.locator("code").first().textContent();
  const modelInput = model.getByLabel(msg("en", "admin.ai.settings.model.label"));
  await modelInput.fill("gpt-5");
  await model.getByRole("button", { name: msg("en", "admin.ai.settings.save") }).click();
  await expect(model.getByText(msg("en", "validation.invalidFormat"))).toBeVisible();
  await expect(model.locator("code").first()).toHaveText(current ?? "");

  // The "saved" and "reset" toasts fade out; axe would measure their half-transparent text. Check once they are gone.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
  await expectAccessible(page, testInfo, { label: "ai en light" });

  // Both changes are in the audit log, with the setting's key in the details.
  await page.goto("/en/admin/audit?action=setting.update");
  await ready(page, msg("en", "nav.sub.adminAudit"), undefined, "en");
  const entry = page.getByRole("list", { name: msg("en", "admin.audit.listLabel") }).getByRole("listitem").first();
  await expect(entry.getByText(msg("en", "admin.activity.actions.settingUpdate"))).toBeVisible();
  await entry.getByText(msg("en", "admin.audit.details")).click();
  await expect(entry.getByText("ai.dailyLimitPerUser", { exact: true }).first()).toBeVisible();
  await page.goto("/en/admin/audit?action=setting.reset");
  await expect(
    page.getByRole("list", { name: msg("en", "admin.audit.listLabel") }).getByText(msg("en", "admin.activity.actions.settingReset")).first(),
  ).toBeVisible({ timeout: 20_000 });
});

test("AI calls: every state of one institution, the status filter and the failure log (light and dark)", async ({ page }, testInfo) => {
  test.slow();
  const data = seedAssessments();

  await page.goto(`/ar/admin/ai?org=${data.organization.id}`);
  await ready(page, msg("ar", "nav.sub.adminAi"));
  await expect(listStatus(page, summaryText("ar", 1, 6, 6))).toHaveCount(1, { timeout: 20_000 });
  for (const key of ["settings.title", "totals.title", "failures.title"]) {
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", `admin.ai.${key}`) })).toBeVisible();
  }
  await expect(page.getByText(msg("ar", "admin.ai.errorCodes.overloaded")).first()).toBeVisible();

  await choose(page, msg("ar", "admin.ai.calls.status"), msg("ar", "admin.ai.calls.statusOptions.stalled"));
  await expect(page).toHaveURL(/status=stalled/);
  await expect(listStatus(page, summaryText("ar", 1, 1, 1))).toHaveCount(1, { timeout: 20_000 });
  await choose(page, msg("ar", "admin.ai.calls.status"), msg("ar", "admin.ai.calls.statusOptions.failed"));
  await expect(listStatus(page, summaryText("ar", 1, 3, 3))).toHaveCount(1, { timeout: 20_000 });
  await choose(page, msg("ar", "admin.ai.calls.kind"), msg("ar", "admin.ai.kinds.simulation_debrief"));
  await expect(page.getByRole("heading", { name: msg("ar", "admin.ai.calls.noResults.title") })).toBeVisible({ timeout: 20_000 });

  await page.goto(`/ar/admin/ai?org=${data.organization.id}&status=ok`);
  await expect(listStatus(page, summaryText("ar", 1, 2, 2))).toHaveCount(1, { timeout: 20_000 });
  await expectAccessible(page, testInfo, { label: "ai ar light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "ai ar dark" });
});
