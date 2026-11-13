import { randomUUID } from "node:crypto";
import { addMember, authPost, createOrganization, createVerifiedUser, sessionUserId } from "../support/auth";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { fill, institutionWithOwner } from "../org/helpers";
import { institutionsList, openSettings, savedLocale, sessionsList, signedInElsewhere } from "./helpers";

// /settings with a fresh user per test: edit the profile, the saved language (a full page load into the other
// language), the theme, signing other sessions out (one, then all) and switching the active institution.

test("edits the profile, with errors on the field and the new name in the header", async ({ page, uniqueEmail, strongPassword }) => {
  test.slow(); // a sign-up with an e-mailed code
  const account = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), name: "متدرب اختبار" });
  await openSettings(page);

  const name = page.locator("#settings-name").filter({ visible: true });
  const profession = page.locator("#settings-profession").filter({ visible: true });
  const email = page.locator("#settings-email").filter({ visible: true });
  await expect(name).toHaveValue(account.name);
  await expect(email).toHaveValue(account.email);
  await expect(email).toHaveAttribute("readonly", "");
  // Without an institution the user works with the individual account.
  await expect(page.getByText(msg("ar", "settings.institutions.empty.title"))).toBeVisible();

  // Client validation: the error is on the field and focus moves there.
  await name.fill(" ");
  await page.getByRole("button", { name: msg("ar", "settings.profile.submit") }).click();
  await expect(page.getByText(msg("ar", "validation.required"))).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");

  await name.fill("  نورة القحطاني ");
  await profession.fill("أخصائية مكافحة عدوى");
  await page.getByRole("button", { name: msg("ar", "settings.profile.submit") }).click();
  await expect(page.getByText(msg("ar", "settings.profile.saved"))).toBeVisible({ timeout: 20_000 });
  await expect(name).toHaveValue("نورة القحطاني");

  // Saved on the server: a reload shows it, and so does the account menu in the header.
  await page.reload();
  await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
  await expect(page.locator("#settings-name").filter({ visible: true })).toHaveValue("نورة القحطاني");
  await expect(page.locator("#settings-profession").filter({ visible: true })).toHaveValue("أخصائية مكافحة عدوى");
  await page.getByRole("button", { name: msg("ar", "nav.userMenu.label") }).click();
  await expect(page.getByRole("menu").getByText("نورة القحطاني")).toBeVisible();
  await page.keyboard.press("Escape");

  // Clearing the optional profession is allowed.
  await page.locator("#settings-profession").filter({ visible: true }).fill("");
  await page.getByRole("button", { name: msg("ar", "settings.profile.submit") }).click();
  await expect(page.getByText(msg("ar", "settings.profile.saved")).first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
  await expect(page.locator("#settings-profession").filter({ visible: true })).toHaveValue("");
});

test("saves the language preference and reopens the page in that language", async ({ page, uniqueEmail, strongPassword }) => {
  test.slow();
  await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), locale: "ar" });
  await openSettings(page, "ar");
  const arabic = page.getByRole("radio", { name: msg("ar", "common.localeSwitcher.ar") });
  const english = page.getByRole("radio", { name: msg("ar", "common.localeSwitcher.en") });
  await expect(arabic).toBeChecked();

  await english.click();
  await expect(page).toHaveURL(urlPath("/en/settings"), { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: msg("en", "settings.title") })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("radio", { name: msg("en", "common.localeSwitcher.en") })).toBeChecked();
  expect(await savedLocale(page.request)).toBe("en");

  // Opened in Arabic while English is saved: the page says so and offers the saved language.
  await page.goto("/ar/settings");
  await expect(page.getByText(fill(msg("ar", "settings.language.mismatch"), { language: msg("ar", "common.localeSwitcher.en") }))).toBeVisible();
  await page.getByRole("link", { name: msg("ar", "settings.language.openSaved") }).click();
  await expect(page).toHaveURL(urlPath("/en/settings"));

  // And back to Arabic.
  await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
  await page.getByRole("radio", { name: msg("en", "common.localeSwitcher.ar") }).click();
  await expect(page).toHaveURL(urlPath("/ar/settings"), { timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await savedLocale(page.request)).toBe("ar");
});

test("switches the theme and keeps it after a reload", async ({ page, uniqueEmail, strongPassword }) => {
  test.slow();
  await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
  await page.emulateMedia({ colorScheme: "light" });
  await openSettings(page);
  const dark = page.getByRole("radio", { name: msg("ar", "common.theme.dark") });
  const system = page.getByRole("radio", { name: msg("ar", "common.theme.system") });
  await expect(system).toBeChecked();

  await dark.click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("radio", { name: msg("ar", "common.theme.dark") })).toBeChecked();

  await page.getByRole("radio", { name: msg("ar", "common.theme.system") }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});

test("signs one other session out, then all the others", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
  test.slow(); // a sign-up, two more sign-ins and two revocations
  const headers = { "x-real-ip": clientIp };
  const account = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
  const laptop = await signedInElsewhere(browser, account, headers);
  const phone = await signedInElsewhere(browser, account, headers);
  try {
    await openSettings(page);
    const list = sessionsList(page);
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const current = list.getByRole("listitem").filter({ hasText: msg("ar", "settings.security.sessions.current") });
    await expect(current).toHaveCount(1);
    await expect(current.getByText(msg("ar", "settings.security.sessions.lastActive.now"))).toBeVisible();
    // The current session has no sign-out button here (that is the account menu's sign-out).
    await expect(current.getByRole("button")).toHaveCount(0);

    // One session.
    const signOutOne = list.getByRole("button", { name: msg("ar", "settings.security.sessions.signOut") });
    await expect(signOutOne).toHaveCount(2);
    await waitForHydration(signOutOne.first());
    await signOutOne.first().click();
    await expect(list.getByRole("listitem")).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator("#sessions-heading")).toBeFocused();
    const stillIn = [await sessionUserId(laptop.request), await sessionUserId(phone.request)].filter(Boolean);
    expect(stillIn).toHaveLength(1);

    // All the others, after a confirmation.
    await page.getByRole("button", { name: msg("ar", "settings.security.sessions.signOutOthers") }).click();
    const dialog = page.getByRole("alertdialog", { name: msg("ar", "settings.security.sessions.confirmTitle") });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: msg("ar", "settings.security.sessions.confirm") }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText(msg("ar", "settings.security.sessions.onlyThis"))).toBeVisible();
    await expect(page.getByRole("button", { name: msg("ar", "settings.security.sessions.signOutOthers") })).toHaveCount(0);
    await expect(page.locator("#sessions-heading")).toBeFocused();

    expect(await sessionUserId(laptop.request)).toBeNull();
    expect(await sessionUserId(phone.request)).toBeNull();
    expect(await sessionUserId(page.request)).not.toBeNull(); // this device stays signed in
  } finally {
    await laptop.close();
    await phone.close();
  }
});

test("switches the active institution and back to the individual account", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
  test.slow(); // a sign-up, two institutions and two invitations
  const headers = { "x-real-ip": clientIp };
  const { admin, org, owner } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
  try {
    const tag = randomUUID().slice(0, 6);
    const secondName = `مركز التدريب ${tag}`;
    const second = await createOrganization(admin.request, {
      name: secondName,
      nameEn: `Training Center ${tag}`,
      slug: `e2e-settings-${randomUUID().slice(0, 12)}`,
      type: "training_center",
    });
    await addMember(admin.request, page.request, { organizationId: second.id, email: owner.email, role: "examiner" });

    await page.goto("/ar/settings#institutions");
    await waitForHydration(page.locator("#settings-name").filter({ visible: true }));
    const list = institutionsList(page);
    await expect(list.getByRole("listitem")).toHaveCount(3); // two institutions and the individual account
    const first = list.getByRole("listitem").filter({ hasText: org.name });
    const other = list.getByRole("listitem").filter({ hasText: secondName });
    const personal = list.getByRole("listitem").filter({ hasText: msg("ar", "settings.institutions.personal.title") });
    await expect(first.getByText(msg("ar", "common.roles.owner"))).toBeVisible();
    await expect(other.getByText(msg("ar", "common.roles.examiner"))).toBeVisible();

    // Whichever is active now, switch to the other one explicitly and check the badge follows.
    const activeBadge = msg("ar", "settings.institutions.active");
    const switchTo = async (row: typeof first, name: string, message: string) => {
      const button = row.getByRole("button", { name: fill(msg("ar", "settings.institutions.switchLabel"), { name }) });
      await waitForHydration(button);
      await button.click();
      await expect(page.getByText(message)).toBeVisible({ timeout: 20_000 });
      await expect(row.getByText(activeBadge)).toBeVisible({ timeout: 20_000 });
      await expect(row.getByRole("button")).toHaveCount(0);
    };
    if (await first.getByText(activeBadge).count()) {
      await switchTo(other, secondName, fill(msg("ar", "settings.institutions.switched"), { name: secondName }));
      await expect(first.getByText(activeBadge)).toHaveCount(0);
    }
    await switchTo(first, org.name, fill(msg("ar", "settings.institutions.switched"), { name: org.name }));
    await expect(other.getByText(activeBadge)).toHaveCount(0);
    // Owners and examiners of the active institution get a link to its page.
    await expect(first.getByRole("link", { name: msg("ar", "settings.institutions.open") })).toHaveAttribute("href", "/ar/org");
    // The header follows: the institution switcher names the active one.
    await expect(page.getByRole("button", { name: `${msg("ar", "nav.orgSwitcher.label")}: ${org.name}` })).toBeVisible();

    const personalButton = personal.getByRole("button", { name: msg("ar", "settings.institutions.personal.switchLabel") });
    await personalButton.click();
    await expect(page.getByText(msg("ar", "settings.institutions.personal.switched"))).toBeVisible({ timeout: 20_000 });
    await expect(personal.getByText(activeBadge)).toBeVisible({ timeout: 20_000 });
    await expect(first.getByText(activeBadge)).toHaveCount(0);
    await expect(page.locator("#institutions-heading")).toBeFocused();
  } finally {
    await admin.close();
  }
});

test("lists an invitation to the user's address with a link to it", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
  test.slow();
  const headers = { "x-real-ip": clientIp };
  const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
  const invitee = await browser.newContext({ extraHTTPHeaders: headers });
  try {
    const email = uniqueEmail();
    await createVerifiedUser(invitee.request, { email, password: strongPassword(), name: "مدعوة" });
    const sent = await authPost(page.request, "/organization/invite-member", { email, role: "trainee", organizationId: org.id });
    expect(sent.ok(), await sent.text()).toBe(true);
    const p = await invitee.newPage();
    await p.goto("/ar/settings");
    const invitations = p.getByRole("list", { name: msg("ar", "settings.institutions.invitations.title") });
    const row = invitations.getByRole("listitem").filter({ hasText: org.name });
    await expect(row).toBeVisible();
    await expect(row.getByText(fill(msg("ar", "settings.institutions.invitations.role"), { role: msg("ar", "common.roles.trainee") }))).toBeVisible();
    await row.getByRole("link", { name: msg("ar", "settings.institutions.invitations.view") }).click();
    await expect(p).toHaveURL(/\/ar\/invite\//);
    await expect(p.getByRole("button", { name: msg("ar", "org.invitePage.open.accept") })).toBeVisible();
  } finally {
    await invitee.close();
    await admin.close();
  }
});
