import { randomUUID } from "node:crypto";
import { expectAccessible } from "../support/a11y";
import { addMember, authPost, createOrganization, createVerifiedUser, sessionUserId } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { choose, expectTitle, listStatus, newAdmin, plain, ready, sharedAdmin, summaryText } from "./helpers";

// /admin/users: find accounts, open one, and the account actions (Better Auth admin endpoints, audited by lib/auth.ts).
// Every test makes its own target accounts; bans, deletes and impersonation never touch the shared accounts.

// Deletes and bans of owners / admins wait for the cluster-wide account lock: one test after another in this file.
test.describe.configure({ mode: "default" });

test.describe("platform admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("search by e-mail, filter by status, open the account", async ({ page, request, uniqueEmail, strongPassword }, testInfo) => {
    test.slow();
    const email = uniqueEmail();
    const target = await createVerifiedUser(request, { email, password: strongPassword(), name: "ريم الشهري" });

    await page.goto("/ar/admin/users");
    await ready(page, msg("ar", "nav.sub.adminUsers"));
    const search = page.getByRole("searchbox", { name: msg("ar", "admin.users.search") });
    await waitForHydration(search);
    await search.fill(email);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/ar/admin/users\\?q=${encodeURIComponent(email).replace(/\./g, "\\.")}`));
    // The list's live region announces the count (and, below, that nothing matches).
    await expect(listStatus(page, summaryText("ar", 1, 1, 1))).toHaveCount(1);
    await expectAccessible(page, testInfo, { label: "list ar light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "list ar dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    // The status filter keeps the search and goes back to page 1; an unverified filter hides the verified account.
    await choose(page, msg("ar", "admin.users.status"), msg("ar", "admin.users.statusOptions.unverified"));
    await expect(page).toHaveURL(/status=unverified/);
    await expect(page.getByRole("heading", { name: msg("ar", "admin.users.noResults.title") })).toBeVisible();
    await expect(listStatus(page, msg("ar", "admin.users.noResults.title"))).toHaveCount(1);
    await page.getByRole("button", { name: msg("ar", "admin.list.clear") }).click();
    await expect(page).toHaveURL(urlPath("/ar/admin/users"));

    await page.goto(`/ar/admin/users?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: target.name }).first().click();
    await ready(page, target.name);
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", "admin.user.profile.title") })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: msg("ar", "admin.user.sessions.title") })).toBeVisible();
    await expect(page.getByText(msg("ar", "admin.user.memberships.empty"))).toBeVisible();
    await expectAccessible(page, testInfo, { label: "detail ar light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "detail ar dark" });
  });

  test("ban with a reason, lift the ban, change the platform role", async ({ page, request, uniqueEmail, strongPassword }) => {
    test.setTimeout(150_000);
    const target = await createVerifiedUser(request, { email: uniqueEmail(), password: strongPassword(), name: "Ban Target", locale: "en" });
    const signIn = await authPost(request, "/sign-in/email", { email: target.email, password: target.password });
    expect(signIn.ok()).toBe(true);
    const targetId = await sessionUserId(request);

    await page.goto(`/en/admin/users/${targetId}`);
    await ready(page, "Ban Target", msg("en", "admin.user.actions.ban"), "en");

    await page.getByRole("button", { name: msg("en", "admin.user.actions.ban") }).click();
    const dialog = page.getByRole("dialog", { name: msg("en", "admin.user.actions.banTitle").replace("{name}", "Ban Target") });
    await expect(dialog).toBeVisible();
    // The reason is required.
    await dialog.getByRole("button", { name: msg("en", "admin.user.actions.banSubmit") }).click();
    await expect(dialog.getByText(msg("en", "validation.required"))).toBeVisible();
    await dialog.getByLabel(msg("en", "admin.user.actions.banReason")).fill("Repeated fake scan uploads");
    await choose(page, msg("en", "admin.user.actions.banDuration"), msg("en", "admin.user.actions.durations.30"));
    await dialog.getByRole("button", { name: msg("en", "admin.user.actions.banSubmit") }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(msg("en", "admin.user.ban.title"))).toBeVisible();
    await expect(page.getByText("Repeated fake scan uploads")).toBeVisible();
    // A banned account cannot be impersonated (the button says why) and is signed out everywhere.
    await expect(page.getByRole("button", { name: msg("en", "admin.user.actions.impersonate") })).toBeDisabled();
    await expect(page.getByText(msg("en", "admin.user.actions.impersonateBanned"))).toBeVisible();
    await expect(page.getByText(msg("en", "admin.user.sessions.empty"))).toBeVisible();
    expect(await sessionUserId(request)).toBeNull();

    await page.getByRole("button", { name: msg("en", "admin.user.actions.unban") }).click();
    const unban = page.getByRole("alertdialog", { name: msg("en", "admin.user.actions.unbanTitle").replace("{name}", "Ban Target") });
    await unban.getByRole("button", { name: msg("en", "admin.user.actions.unban") }).click();
    await expect(unban).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(msg("en", "admin.user.ban.title"))).toHaveCount(0);

    await page.getByRole("button", { name: msg("en", "admin.user.actions.makeAdmin") }).click();
    const promote = page.getByRole("alertdialog");
    await promote.getByRole("button", { name: msg("en", "admin.user.actions.makeAdmin") }).click();
    // The closing dialog re-renders with the new role ("Remove platform admin") until it is gone.
    await expect(promote).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: msg("en", "admin.user.actions.removeAdmin") })).toBeVisible({ timeout: 20_000 });
    // Other platform admins cannot be impersonated.
    await expect(page.getByText(msg("en", "admin.user.actions.impersonateAdmin"))).toBeVisible();
    await page.getByRole("button", { name: msg("en", "admin.user.actions.removeAdmin") }).click();
    const demote = page.getByRole("alertdialog");
    await demote.getByRole("button", { name: msg("en", "admin.user.actions.removeAdmin") }).click();
    await expect(demote).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: msg("en", "admin.user.actions.makeAdmin") })).toBeVisible({ timeout: 20_000 });
  });

  test("end one session, then sign the account out everywhere (both audited with their target)", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.setTimeout(150_000);
    const name = `Session Target ${randomUUID().slice(0, 8)}`;
    const first = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    const second = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const target = await createVerifiedUser(first.request, { email: uniqueEmail(), password: strongPassword(), name, locale: "en" });
      const signIn = await authPost(second.request, "/sign-in/email", { email: target.email, password: target.password });
      expect(signIn.ok(), await signIn.text()).toBe(true);
      const targetId = await sessionUserId(first.request);
      expect(await sessionUserId(second.request)).toBe(targetId);

      await page.goto(`/en/admin/users/${targetId}`);
      await ready(page, name, msg("en", "admin.user.actions.revokeAll"), "en");
      const endButtons = page.getByRole("button", { name: /^End session: / });
      await expect(endButtons).toHaveCount(2);

      // One session: that device is signed out, the other stays.
      await endButtons.first().click();
      const endOne = page.getByRole("alertdialog", { name: msg("en", "admin.user.sessions.revokeTitle") });
      await endOne.getByRole("button", { name: msg("en", "admin.user.sessions.revoke") }).click();
      await expect(endOne).toBeHidden({ timeout: 20_000 });
      await expect(endButtons).toHaveCount(1, { timeout: 20_000 });
      const signedIn = [await sessionUserId(first.request), await sessionUserId(second.request)].filter(Boolean);
      expect(signedIn).toEqual([targetId]);

      // Every session.
      await page.getByRole("button", { name: msg("en", "admin.user.actions.revokeAll") }).click();
      const endAll = page.getByRole("alertdialog", { name: msg("en", "admin.user.actions.revokeAllTitle").replace("{name}", name) });
      await endAll.getByRole("button", { name: msg("en", "admin.user.actions.revokeAll") }).click();
      await expect(endAll).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(msg("en", "admin.user.sessions.empty"))).toBeVisible({ timeout: 20_000 });
      expect(await sessionUserId(first.request)).toBeNull();
      expect(await sessionUserId(second.request)).toBeNull();

      // The audit log: both rows name the account whose sessions ended ("sign out everywhere" and the single session),
      // never an anonymous "Account" or "Deleted" (the account still exists).
      await page.goto("/en/admin/audit?action=auth.admin.revoke-user-sessions");
      await ready(page, msg("en", "nav.sub.adminAudit"), undefined, "en");
      const log = page.getByRole("list", { name: msg("en", "admin.audit.listLabel") });
      await expect(log.getByRole("link", { name }).first()).toBeVisible({ timeout: 20_000 });
      await page.goto("/en/admin/audit?action=auth.admin.revoke-user-session");
      await ready(page, msg("en", "nav.sub.adminAudit"), undefined, "en");
      await expect(log.getByRole("link", { name }).first()).toBeVisible({ timeout: 20_000 });
      await expect(log.getByText(`${msg("en", "admin.audit.target")}: ${msg("en", "admin.audit.deletedTarget")}`, { exact: true })).toHaveCount(0);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("delete an account with the typed address; a blocked delete says why", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    test.setTimeout(150_000);
    // An institution whose only owner still has another member: that owner cannot be deleted (deletion-rules.ts).
    const shared = await sharedAdmin(browser, clientIp);
    const ownerCtx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    const traineeCtx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const owner = await createVerifiedUser(ownerCtx.request, { email: uniqueEmail(), password: strongPassword(), name: "Sole Owner" });
      const trainee = await createVerifiedUser(traineeCtx.request, { email: uniqueEmail(), password: strongPassword(), name: "Deletable Trainee" });
      const org = await createOrganization(shared.request, { name: "مستشفى حذف الحسابات", nameEn: "Delete Test Hospital", slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
      await addMember(shared.request, ownerCtx.request, { organizationId: org.id, email: owner.email, role: "owner" });
      await addMember(shared.request, traineeCtx.request, { organizationId: org.id, email: trainee.email, role: "trainee" });
      const left = await authPost(shared.request, "/organization/leave", { organizationId: org.id });
      expect(left.ok(), await left.text()).toBe(true);
      const ownerId = await sessionUserId(ownerCtx.request);
      const traineeId = await sessionUserId(traineeCtx.request);

      await page.goto(`/en/admin/users/${ownerId}`);
      await ready(page, "Sole Owner", msg("en", "admin.user.actions.delete"), "en");
      await page.getByRole("button", { name: msg("en", "admin.user.actions.delete") }).click();
      const blocked = page.getByRole("dialog", { name: msg("en", "admin.user.actions.blockedTitle") });
      await expect(blocked).toBeVisible();
      await expect(blocked.getByText(/Delete Test Hospital/)).toBeVisible();
      await expect(blocked.getByText(msg("en", "admin.user.actions.blockedDescription").replace("{name}", "Sole Owner"))).toBeVisible();
      // One translated close button (no corner button with an English screen-reader label).
      await expect(blocked.getByRole("button")).toHaveCount(1);
      await blocked.getByRole("button", { name: msg("en", "common.actions.close"), exact: true }).click();
      await expect(blocked).toBeHidden();

      await page.goto(`/en/admin/users/${traineeId}`);
      await ready(page, "Deletable Trainee", msg("en", "admin.user.actions.delete"), "en");
      await page.getByRole("button", { name: msg("en", "admin.user.actions.delete") }).click();
      const confirm = page.getByRole("alertdialog", { name: msg("en", "admin.user.actions.deleteTitle").replace("{name}", "Deletable Trainee") });
      const submit = confirm.getByRole("button", { name: msg("en", "admin.user.actions.deleteSubmit") });
      await expect(submit).toBeDisabled();
      // The address to type is shown on its own line, set left to right (part of the field's label).
      await expect(confirm.locator("code", { hasText: trainee.email })).toHaveAttribute("dir", "ltr");
      const typed = confirm.getByLabel(msg("en", "admin.user.actions.deleteConfirm"));
      await typed.fill("someone-else@example.com");
      await expect(submit).toBeDisabled();
      await typed.fill(trainee.email.toUpperCase());
      await submit.click();
      await expect(page).toHaveURL(urlPath("/en/admin/users"), { timeout: 30_000 });
      await page.goto(`/en/admin/users?q=${encodeURIComponent(trainee.email)}`);
      await expect(page.getByRole("heading", { name: msg("en", "admin.users.noResults.title") })).toBeVisible();
      // The old session is gone with the account.
      expect(await sessionUserId(traineeCtx.request)).toBeNull();
    } finally {
      await shared.close();
      await ownerCtx.close();
      await traineeCtx.close();
    }
  });
});

test("a platform admin acts as a user and comes back to the admin account", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
  // Two sign-ups with e-mailed codes, a promotion and four full page loads: over 90 s inside a busy full run.
  test.setTimeout(180_000);
  // Its own platform admin: impersonation swaps the session cookie of the browser context it runs in.
  const shared = await sharedAdmin(browser, clientIp);
  try {
    const admin = await newAdmin(page, shared, { email: uniqueEmail(), password: strongPassword(), name: "Acting Admin" });
    const targetCtx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    await createVerifiedUser(targetCtx.request, { email: uniqueEmail(), password: strongPassword(), name: "هند العتيبي" });
    const targetId = await sessionUserId(targetCtx.request);
    await targetCtx.close();

    await page.goto(`/ar/admin/users/${targetId}`);
    await ready(page, "هند العتيبي", msg("ar", "admin.user.actions.impersonate"));
    await page.getByRole("button", { name: msg("ar", "admin.user.actions.impersonate") }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText(plain("ar", "admin.user.actions.impersonateReturn"))).toBeVisible();
    await confirm.getByRole("button", { name: msg("ar", "admin.user.actions.impersonateStart") }).click();

    await expect(page).toHaveURL(urlPath("/ar/admin/impersonation"), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "admin.impersonation.title") })).toBeVisible();
    await expect(page.getByText("هند العتيبي").first()).toBeVisible();
    expect(await sessionUserId(page.request)).toBe(targetId);
    await expect(page.getByText(plain("ar", "admin.impersonation.comeBack", { address: "/ar/admin" }))).toBeVisible();
    await expectAccessible(page, testInfo, { label: "impersonation ar light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectAccessible(page, testInfo, { label: "impersonation ar dark" });
    await page.emulateMedia({ colorScheme: "light" });

    // Out in the user's pages, then back to the admin panel: every /admin address leads to the way back (the session
    // is the user's, so the admin pages themselves stay closed: no user list, no not-found page).
    await page.getByRole("link", { name: msg("ar", "admin.impersonation.open") }).click();
    await expect(page).toHaveURL(urlPath("/ar/dashboard"), { timeout: 30_000 });
    // Every app page outside the admin panel says so, with the way back (components/shell/impersonation-banner.tsx).
    const banner = page.getByRole("region", { name: msg("ar", "common.impersonation.label") });
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner.getByText("هند العتيبي")).toBeVisible();
    await expect(banner.getByRole("button", { name: msg("ar", "common.impersonation.stop") })).toBeVisible();
    for (const path of ["/ar/admin", "/ar/admin/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: msg("ar", "admin.impersonation.title") })).toBeVisible({ timeout: 20_000 });
      // The tab says the same as the page, not the title of the admin page behind the notice.
      await expectTitle(page, msg("ar", "admin.impersonation.title"));
      await expect(page.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: msg("ar", "nav.sub.adminUsers") })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: msg("ar", "admin.nav.label") })).toHaveCount(0);
      // The admin notice has the way back itself: no second banner there.
      await expect(page.getByRole("region", { name: msg("ar", "common.impersonation.label") })).toHaveCount(0);
    }

    const stop = page.getByRole("button", { name: msg("ar", "admin.impersonation.stop") });
    await waitForHydration(stop);
    await stop.click();
    await expect(page).toHaveURL(urlPath(`/ar/admin/users/${targetId}`), { timeout: 30_000 });
    expect(await sessionUserId(page.request)).toBe(admin.id);
    await expect(page.getByRole("heading", { level: 1, name: "هند العتيبي" })).toBeVisible();
    // An account page is titled as one, without the person's name (browser history, shared screens).
    await expectTitle(page, `${msg("ar", "admin.user.pageTitle")} | ${msg("ar", "nav.sub.adminUsers")}`);
    expect(await page.title()).not.toContain("هند العتيبي");
  } finally {
    await shared.close();
  }
});
