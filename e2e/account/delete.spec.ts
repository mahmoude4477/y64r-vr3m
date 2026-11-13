import { randomUUID } from "node:crypto";
import { accountErrorsAr } from "../../lib/account/errors-ar";
import { authErrorsAr } from "../../lib/auth-errors-ar";
import { expectAccessible } from "../support/a11y";
import { addMember, authPost, createOrganization, createVerifiedUser, sessionUserId } from "../support/auth";
import { ADMIN_STATE, BASE_URL } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { deletionCodeFor, waitForMail } from "../support/mail";

// "Delete my account" (PRODUCT 9, lib/account/**): the e-mailed code, the password, the blockers, and the admin
// panel's remove-user. Every test makes its own users: deleting is final.

// One after another inside this file (the desktop and mobile projects still run it side by side): every deletion
// and every owner change waits for the one cluster-wide account lock, and the burst test below loads the server on
// purpose. In parallel they slowed each other past the step timeouts (final review).
test.describe.configure({ mode: "default" });

/** The confirm step checks a password (hashing) under the account lock: allow for a busy server. */
const CONFIRM_TIMEOUT = 20_000;
/**
 * Sending a code: after the e-mail the action stores the code, writes the audit row and Next re-renders the page in
 * the same response; inside the full run that took over 10 s once (finish-round fix review).
 */
const SEND_TIMEOUT = 20_000;

test("a user deletes the account with the e-mailed code and the password; the old login stops working", async ({
  page,
  request,
  uniqueEmail,
  strongPassword,
}, testInfo) => {
  // A sign-up, three e-mails, two axe scans, three confirms under the account lock: 15-20 s alone, 44-84 s inside the
  // full local run (4 workers next to the a11y specs, final review), so more room than test.slow()'s 90 s.
  test.setTimeout(180_000);
  const account = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });

  await page.goto("/ar/settings/delete-account");
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "auth.deleteAccount.title") })).toBeVisible();
  const sendCode = page.getByRole("button", { name: msg("ar", "auth.deleteAccount.sendCode") });
  await waitForHydration(sendCode); // a click before hydration does nothing
  const since = Date.now();
  await sendCode.click();
  const code = await deletionCodeFor(account.email, since);
  await expect(page.locator("#delete-code")).toBeVisible({ timeout: SEND_TIMEOUT });
  await expect(page.locator("#delete-code")).toBeFocused(); // focus follows the step that replaced the button
  await expectAccessible(page, testInfo, { label: "code step light" });
  await page.emulateMedia({ colorScheme: "dark" }); // next-themes follows the system setting
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "code step dark" });

  // "Send a new code" from the keyboard: the button keeps focus while it sends, then focus moves to the emptied code
  // input and the status region says a new code was sent (it replaces the first one).
  const resendSince = Date.now();
  const resend = page.getByRole("button", { name: msg("ar", "auth.deleteAccount.resend") });
  await page.locator("#delete-code").fill(code);
  await resend.focus();
  await page.keyboard.press("Enter");
  const newCode = await deletionCodeFor(account.email, resendSince);
  await expect(page.getByRole("status").filter({ hasText: msg("ar", "auth.deleteAccount.codeResent") })).toBeVisible({
    timeout: SEND_TIMEOUT,
  });
  await expect(page.locator("#delete-code")).toBeFocused();
  await expect(page.locator("#delete-code")).toHaveValue("");
  await expect(resend).toBeEnabled();

  // A wrong code is refused: the code input is emptied and gets the focus back.
  const confirm = page.getByRole("button", { name: msg("ar", "auth.deleteAccount.confirm") });
  await page.locator("#delete-code").fill(newCode === "000000" ? "111111" : "000000");
  await page.locator("#delete-password").fill(account.password);
  await page.getByRole("checkbox", { name: msg("ar", "auth.deleteAccount.understand") }).click();
  await confirm.click();
  await expect(page.getByText(msg("ar", "auth.deleteAccount.errors.invalidCode"))).toBeVisible({ timeout: CONFIRM_TIMEOUT });
  await expect(page.locator("#delete-code")).toBeFocused();
  await expect(page.locator("#delete-code")).toHaveValue("");

  // A wrong password is refused (it also uses up one of the code's five tries), focus goes to the password field and
  // nothing is deleted.
  await page.locator("#delete-code").fill(newCode);
  await page.locator("#delete-password").fill(`${account.password}-wrong`);
  await confirm.click();
  await expect(page.getByText(msg("ar", "auth.deleteAccount.errors.invalidPassword"))).toBeVisible({ timeout: CONFIRM_TIMEOUT });
  await expect(page.locator("#delete-password")).toBeFocused();
  await expect(page).toHaveURL(urlPath("/ar/settings/delete-account"));
  expect(await sessionUserId(page.request)).not.toBeNull();

  // The right password (with the NEW code) deletes the account and ends the session.
  await page.locator("#delete-password").fill(account.password);
  await page.getByRole("button", { name: msg("ar", "auth.deleteAccount.confirm") }).click();
  await expect(page).toHaveURL(urlPath("/ar/account-deleted"), { timeout: CONFIRM_TIMEOUT });
  await expect(page.getByRole("heading", { level: 1, name: msg("ar", "auth.accountDeleted.title") })).toBeVisible();
  await waitForMail(account.email, /^account-deleted$/, since);
  expect(await sessionUserId(page.request)).toBeNull();

  const signIn = await authPost(request, "/sign-in/email", { email: account.email, password: account.password });
  expect(signIn.ok()).toBe(false);
  expect(signIn.status()).toBe(401);
});

test.describe("the only owner of an institution with other members", () => {
  test("cannot delete the account; admins get ACCOUNT_DELETION_BLOCKED, others never learn it", async ({
    browser,
    page,
    request,
    clientIp,
    uniqueEmail,
    strongPassword,
  }) => {
    test.slow(); // two sign-ups with e-mailed codes, an institution, two members, the page: 11-25 s, over 30 s under load
    const headers = { "x-real-ip": clientIp };
    const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: headers });
    const member = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      // owner = the page's user; member = a trainee of the same institution.
      const owner = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
      const trainee = await createVerifiedUser(member.request, { email: uniqueEmail(), password: strongPassword() });
      const ownerId = await sessionUserId(page.request);
      expect(ownerId).toBeTruthy();

      const name = `مستشفى الحذف ${randomUUID().slice(0, 6)}`;
      const org = await createOrganization(admin.request, { name, slug: `e2e-${randomUUID().slice(0, 12)}`, type: "hospital" });
      await addMember(admin.request, page.request, { organizationId: org.id, email: owner.email, role: "owner" });
      await addMember(admin.request, member.request, { organizationId: org.id, email: trainee.email, role: "trainee" });
      // The platform admin (the creator, also an owner) leaves: the page's user is now the ONLY owner.
      const left = await authPost(admin.request, "/organization/leave", { organizationId: org.id });
      expect(left.ok(), await left.text()).toBe(true);

      await page.goto("/ar/settings/delete-account");
      const alert = page.getByRole("alert").filter({ hasText: name });
      await expect(alert).toBeVisible();
      await expect(page.getByRole("button", { name: msg("ar", "auth.deleteAccount.sendCode") })).toHaveCount(0);

      // Admin panel delete: refused before anything is deleted.
      const blocked = await authPost(admin.request, "/admin/remove-user", { userId: ownerId });
      expect(blocked.status()).toBe(400);
      expect(((await blocked.json()) as { code?: string }).code).toBe("ACCOUNT_DELETION_BLOCKED");
      expect(await sessionUserId(page.request)).toBe(ownerId); // still there, still signed in

      // Platform roles are "user" or "admin" only; set-role would otherwise store any string. The answer is in the
      // admin's language (their saved locale is Arabic): errors thrown before the endpoint are translated in lib/auth.ts.
      const badRole = await authPost(admin.request, "/admin/set-role", { userId: ownerId, role: "nonsense" });
      expect(badRole.status()).toBe(400);
      expect(await badRole.json()).toMatchObject({ code: "ROLE_NOT_ALLOWED", message: accountErrorsAr.ROLE_NOT_ALLOWED });
      // create-user takes the role from body.role or body.data.role (Better Auth): both are checked, nobody is created.
      for (const data of [{ role: "nonsense" }, { role: ["superadmin", "x"] }, { role: "admin,x" }]) {
        const email = uniqueEmail();
        const created = await authPost(admin.request, "/admin/create-user", { email, name: "دور غير صالح", password: strongPassword(), data });
        expect(created.status(), JSON.stringify(data)).toBe(400);
        expect(((await created.json()) as { code?: string }).code).toBe("ROLE_NOT_ALLOWED");
        const found = await admin.request.get(`/api/auth/admin/list-users?searchValue=${encodeURIComponent(email)}&searchField=email`);
        expect(((await found.json()) as { total?: number }).total).toBe(0);
      }

      // The same for a guest: the verification flow's refusal for an address that is already verified comes in the
      // language of the page that sent it (Arabic by default).
      const verifyAgain = (referer?: string) =>
        request.post("/api/auth/email-otp/verify-email", {
          data: { email: owner.email, otp: "123456" },
          headers: { origin: new URL(BASE_URL).origin, ...(referer && { referer }) },
        });
      expect(await (await verifyAgain()).json()).toMatchObject({ code: "INVALID_OTP", message: authErrorsAr.INVALID_OTP });
      expect(await (await verifyAgain(`${BASE_URL}/en/verify-email`)).json()).toMatchObject({ code: "INVALID_OTP", message: "Invalid OTP" });

      // A non-admin and a guest get the endpoint's own 403 / 401, never the answer that depends on the target.
      for (const [ctx, status] of [
        [member.request, 403],
        [request, 401],
      ] as const) {
        const res = await authPost(ctx, "/admin/remove-user", { userId: ownerId });
        expect(res.status()).toBe(status);
        expect(await res.text()).not.toContain("ACCOUNT_DELETION_BLOCKED");
        const update = await authPost(ctx, "/admin/update-user", { userId: ownerId, data: { role: "admin" } });
        expect(update.status()).toBe(status);
        expect(await update.text()).not.toContain("FIELD_NOT_ALLOWED");
      }
    } finally {
      await admin.close();
      await member.close();
    }
  });
});

test("a burst of owner-change calls from a trainee never takes the account lock or starves the server", async ({
  page,
  request,
  uniqueEmail,
  strongPassword,
}) => {
  // Review round 2: 60 parallel /organization/leave calls from any signed-in user used to queue on the account lock
  // with one pooled connection each, so unrelated requests failed with 500. Only an owner removing an owner (or a
  // platform admin removing a platform admin) may wait for it now (lib/account/lock-scope.ts).
  test.slow();
  await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
  const started = Date.now();
  const burst = Array.from({ length: 40 }, (_, i) =>
    i % 2
      ? authPost(page.request, "/organization/leave", { organizationId: `does-not-exist-${i}` })
      : authPost(page.request, "/organization/remove-member", { memberIdOrEmail: `nobody-${i}`, organizationId: "does-not-exist" }),
  );
  const [session, health] = await Promise.all([page.request.get("/api/auth/get-session"), request.get("/api/health")]);
  const answers = await Promise.all(burst);
  expect(answers.map((r) => r.status()).filter((s) => s >= 500)).toEqual([]); // Better Auth's own 4xx, never a 500
  expect(session.status()).toBe(200);
  expect(health.status()).toBe(200);
  expect(Date.now() - started).toBeLessThan(10_000); // nobody waited for a lock (it used to take 6-12 s)
});
