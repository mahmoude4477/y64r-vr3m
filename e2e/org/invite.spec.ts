import { authPost, createVerifiedUser } from "../support/auth";
import { BASE_URL } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { fill, institutionWithOwner } from "./helpers";

// /invite/[id]: the states a person can meet, signed out, with the wrong account, after a cancel, and accepting.

test("a guest is sent to sign-in and comes back; the wrong account is told and can switch; the right one accepts", async ({
  browser,
  page,
  clientIp,
  uniqueEmail,
  strongPassword,
}) => {
  test.slow(); // three sign-ups with e-mailed codes, form sign-ins, an institution
  const headers = { "x-real-ip": clientIp };
  const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
  const visitor = await browser.newContext({ extraHTTPHeaders: headers });
  try {
    // The owner invites someone who has no account yet (API: the UI flow is covered in org.spec.ts).
    const invitedEmail = uniqueEmail();
    const invited = await authPost(page.request, "/organization/invite-member", { email: invitedEmail, role: "trainee", organizationId: org.id });
    expect(invited.ok(), await invited.text()).toBe(true);
    const { id } = (await invited.json()) as { id: string };
    const path = `/ar/invite/${id}`;

    // Signed out: guests reach the page (no redirect to a bare sign-in form) and get its guest state.
    const guest = await visitor.newPage();
    await guest.goto(path);
    await expect(guest).toHaveURL(urlPath(path));
    await expect(guest.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.signIn.title") })).toBeVisible();
    await expect(guest.getByText(org.name, { exact: true })).toBeVisible();

    // A visitor whose session cookie is no longer valid (expired, or signed out on another device) reaches the page
    // and gets its guest state: the institution, the role, a masked address and both ways in, each coming back here.
    // On a phone (390 px): invitees open the e-mail's link there.
    const stale = await browser.newContext({ extraHTTPHeaders: headers, viewport: { width: 390, height: 844 } });
    try {
      await stale.addCookies([{ name: "better-auth.session_token", value: "expired.session", url: BASE_URL }]);
      const p = await stale.newPage();
      await p.goto(path);
      await expect(p.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.signIn.title") })).toBeVisible();
      await expect(p.getByText(org.name, { exact: true })).toBeVisible();
      await expect(p.getByText(msg("ar", "common.roles.trainee"), { exact: true })).toBeVisible();
      await expect(p.getByText(invitedEmail)).toHaveCount(0); // masked
      const back = encodeURIComponent(path);
      const signIn = p.getByRole("link", { name: msg("ar", "org.invitePage.signIn.signIn") });
      const signUp = p.getByRole("link", { name: msg("ar", "org.invitePage.signIn.signUp") });
      await expect(signIn).toHaveAttribute("href", `/ar/sign-in?callbackUrl=${back}`);
      await expect(signUp).toHaveAttribute("href", `/ar/sign-up?callbackUrl=${back}`);
      // Both keep their button height in the phone column (they shrank to the 22 px text line, R2-UX-1).
      for (const link of [signIn, signUp]) {
        const box = await link.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
      }
    } finally {
      await stale.close();
    }

    // Signed in with another account: the page says so and offers to switch.
    const other = await createVerifiedUser(visitor.request, { email: uniqueEmail(), password: strongPassword(), name: "حساب آخر" });
    await guest.goto(path);
    await expect(guest.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.wrongAccount.title") })).toBeVisible();
    await expect(guest.getByText(other.email)).toBeVisible();
    await expect(guest.getByText(invitedEmail)).toHaveCount(0); // the invited address is masked
    await expect(guest.getByRole("button", { name: msg("ar", "org.invitePage.open.accept") })).toHaveCount(0);
    const switchButton = guest.getByRole("button", { name: msg("ar", "org.invitePage.wrongAccount.switch") });
    await waitForHydration(switchButton);
    await switchButton.click();
    await expect(guest).toHaveURL(urlPath(`/ar/sign-in?callbackUrl=${encodeURIComponent(path)}`), { timeout: 15_000 });

    // The invited person signs up (another browser), then signs in here and lands back on the invitation.
    const signUpContext = await browser.newContext({ extraHTTPHeaders: headers });
    const password = strongPassword();
    try {
      await createVerifiedUser(signUpContext.request, { email: invitedEmail, password, name: "المدعوّة" });
    } finally {
      await signUpContext.close();
    }
    await waitForHydration(guest.locator("#email"));
    await guest.locator("#email").fill(invitedEmail);
    await guest.locator("#password").fill(password);
    await guest.getByRole("button", { name: msg("ar", "auth.signIn.submit"), exact: true }).click();
    await expect(guest).toHaveURL(urlPath(path), { timeout: 15_000 });
    await expect(guest.getByRole("heading", { level: 1, name: fill(msg("ar", "org.invitePage.open.title"), { org: org.name }) })).toBeVisible();

    // Accept: the institution becomes the active one and the dashboard opens.
    const accept = guest.getByRole("button", { name: msg("ar", "org.invitePage.open.accept") });
    await waitForHydration(accept);
    await accept.click();
    await expect(guest).toHaveURL(urlPath("/ar/dashboard"), { timeout: 15_000 });
    const session = (await (await guest.request.get("/api/auth/get-session")).json()) as { session?: { activeOrganizationId?: string } };
    expect(session.session?.activeOrganizationId).toBe(org.id);
  } finally {
    await visitor.close();
    await admin.close();
  }
});

test("canceled, declined and unknown invitations explain themselves", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
  test.slow();
  const headers = { "x-real-ip": clientIp };
  const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
  const invitee = await browser.newContext({ extraHTTPHeaders: headers });
  try {
    const account = await createVerifiedUser(invitee.request, { email: uniqueEmail(), password: strongPassword(), name: "مدعو" });
    const invite = async () => {
      const res = await authPost(page.request, "/organization/invite-member", { email: account.email, role: "examiner", organizationId: org.id });
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { id: string }).id;
    };
    const p = await invitee.newPage();

    // Canceled by a manager from the members page.
    const first = await invite();
    await page.goto("/ar/org/members");
    const row = page.getByRole("region", { name: msg("ar", "org.invitations.title") }).getByRole("listitem").filter({ hasText: account.email });
    const actions = row.getByRole("button", { name: fill(msg("ar", "org.invitations.actions"), { email: account.email }) });
    await waitForHydration(actions);
    await actions.click();
    await page.getByRole("menuitem", { name: msg("ar", "org.invitations.cancel") }).click();
    const confirm = page.getByRole("alertdialog", { name: fill(msg("ar", "org.invitations.cancelTitle"), { email: account.email }) });
    await confirm.getByRole("button", { name: msg("ar", "org.invitations.cancelConfirm") }).click();
    await expect(confirm).toBeHidden({ timeout: 20_000 });
    await expect(row).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator("#invitations-title")).toBeFocused(); // the row and its menu button are gone
    await p.goto(`/ar/invite/${first}`);
    await expect(p.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.canceled.title") })).toBeVisible();
    // The closed state names the institution.
    await expect(p.getByText(fill(msg("ar", "org.invitePage.canceled.description"), { org: org.name }))).toBeVisible();

    // A member of the institution (here the owner, on a shared computer) who opens the invitee's link is told that it
    // is for another account, not "you are already a member" (R2-SPEC-1).
    const second = await invite();
    await page.goto(`/ar/invite/${second}`);
    await expect(page.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.wrongAccount.title") })).toBeVisible();
    await expect(page.getByRole("button", { name: msg("ar", "org.invitePage.wrongAccount.switch") })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: fill(msg("ar", "org.invitePage.alreadyMember.title"), { org: org.name }) })).toHaveCount(0);

    // Declined by the invitee (with a confirmation).
    await p.goto(`/ar/invite/${second}`);
    const decline = p.getByRole("button", { name: msg("ar", "org.invitePage.open.decline") });
    await waitForHydration(decline);
    await decline.click();
    const sure = p.getByRole("alertdialog", { name: msg("ar", "org.invitePage.open.declineTitle") });
    await sure.getByRole("button", { name: msg("ar", "org.invitePage.open.declineConfirm") }).click();
    const declined = p.getByRole("heading", { level: 1, name: msg("ar", "org.invitePage.rejected.title") });
    await expect(declined).toBeVisible({ timeout: 15_000 });
    // The buttons are gone: focus is on the new heading, not on <body> (WCAG 2.4.3).
    await expect(declined).toBeFocused();

    // Unknown id.
    await p.goto("/en/invite/not-a-real-invitation");
    await expect(p.getByRole("heading", { level: 1, name: msg("en", "org.invitePage.unknown.title") })).toBeVisible();
  } finally {
    await invitee.close();
    await admin.close();
  }
});
