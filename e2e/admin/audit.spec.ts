import { randomUUID } from "node:crypto";
import { expectAccessible } from "../support/a11y";
import { authPost, createOrganization, createVerifiedUser, sessionUserId } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { choose, openFilters, ready } from "./helpers";

// /admin/audit (PRODUCT 6a): who did what. The rows come from the real actions (Better Auth's audited endpoints): a
// new institution and a ban of a fresh account, by the shared platform admin.

test.use({ storageState: ADMIN_STATE });

test("an institution and a ban show up, filtered by institution, action and actor; details are plain text", async ({
  page,
  request,
  uniqueEmail,
  strongPassword,
}, testInfo) => {
  test.slow();
  const id = randomUUID().slice(0, 8);
  const org = await createOrganization(page.request, { name: `معهد التدقيق ${id}`, nameEn: `Audit Institute ${id}`, slug: `e2e-audit-${id}`, type: "training_center" });
  const target = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword(), name: `حساب للحظر ${id}` });
  const signIn = await authPost(request, "/sign-in/email", { email: target.email, password: target.password });
  expect(signIn.ok()).toBe(true);
  const targetId = await sessionUserId(request);
  const ban = await authPost(page.request, "/admin/ban-user", { userId: targetId, banReason: "e2e audit check" });
  expect(ban.ok(), await ban.text()).toBe(true);
  const unban = await authPost(page.request, "/admin/unban-user", { userId: targetId });
  expect(unban.ok(), await unban.text()).toBe(true);
  const adminId = await sessionUserId(page.request);

  // The institution filter: its creation, with a link to it.
  await page.goto(`/ar/admin/audit?org=${org.id}`);
  await ready(page, msg("ar", "nav.sub.adminAudit"));
  const list = page.getByRole("list", { name: msg("ar", "admin.audit.listLabel") });
  const created = list.getByRole("listitem").filter({ hasText: msg("ar", "admin.activity.actions.orgCreate") }).first();
  await expect(created).toBeVisible();
  await expect(created.getByRole("link", { name: `معهد التدقيق ${id}` })).toHaveAttribute("href", `/ar/admin/organizations/${org.id}`);
  await created.getByText(msg("ar", "admin.audit.details")).click();
  await expect(created.getByText("auth.organization.create", { exact: true })).toBeVisible();
  await expectAccessible(page, testInfo, { label: "audit ar light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "audit ar dark" });
  await page.emulateMedia({ colorScheme: "light" });

  // The action filter (a select of the actions in the log), then the actor chip from a link.
  await page.goto(`/ar/admin/audit?actor=${adminId}`);
  await ready(page, msg("ar", "nav.sub.adminAudit"));
  await choose(page, msg("ar", "admin.audit.action"), msg("ar", "admin.activity.actions.banUser"));
  await expect(page).toHaveURL(/action=auth\.admin\.ban-user/);
  await expect(page).toHaveURL(new RegExp(`actor=${adminId}`));
  const banned = list.getByRole("listitem").filter({ hasText: `حساب للحظر ${id}` }).first();
  await expect(banned).toBeVisible({ timeout: 20_000 });
  await expect(banned.getByText(msg("ar", "admin.activity.actions.banUser"))).toBeVisible();
  // The ban reason stays on the user row: never in the audit details.
  await banned.getByText(msg("ar", "admin.audit.details")).click();
  await expect(banned.getByText("e2e audit check")).toHaveCount(0);
  await expect(banned.getByText(targetId ?? "", { exact: true }).first()).toBeVisible();

  // Clearing the actor chip keeps the other filters.
  await page.getByRole("link", { name: msg("ar", "admin.audit.actorChipClear") }).click();
  await expect(page).toHaveURL(urlPath("/ar/admin/audit?action=auth.admin.ban-user"));
});

test("the day range narrows the log (a past day: nothing), and clear brings everything back", async ({ page }) => {
  test.slow();
  await page.goto("/en/admin/audit");
  await ready(page, msg("en", "nav.sub.adminAudit"), undefined, "en");
  await expect(page.getByRole("list", { name: msg("en", "admin.audit.listLabel") })).toBeVisible();
  // Phones: the day range sits in the "Filters" disclosure.
  await openFilters(page);
  const to = page.getByLabel(msg("en", "admin.list.to"), { exact: true });
  await waitForHydration(to);
  await to.fill("2001-01-01");
  await expect(page).toHaveURL(/to=2001-01-01/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: msg("en", "admin.audit.noResults.title") })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: msg("en", "admin.list.clear") }).click();
  await expect(page).toHaveURL(urlPath("/en/admin/audit"));
  await expect(page.getByRole("list", { name: msg("en", "admin.audit.listLabel") })).toBeVisible({ timeout: 20_000 });
});
