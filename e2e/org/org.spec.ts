import { authPost, createVerifiedUser } from "../support/auth";
import { TRAINEE_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { inviteLinkFor } from "../support/mail";
import { expectNotFound, fill, institutionWithOwner, memberInNewContext, openNavigation } from "./helpers";

// Institution management (/org, /org/members, /org/departments) and accepting an invitation (/invite/[id]).
// The UI calls Better Auth's organization endpoints; these tests drive the real pages and check what people see.

test.describe("owner", () => {
  test("invites an examiner by e-mail; the examiner accepts from the e-mailed link and gets the staff navigation", async ({
    browser,
    page,
    clientIp,
    uniqueEmail,
    strongPassword,
  }) => {
    test.slow(); // two sign-ups with e-mailed codes, an institution, an invitation e-mail
    const headers = { "x-real-ip": clientIp };
    const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
    const examinerContext = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      await page.goto("/ar/org/members");
      await expect(page.getByRole("heading", { level: 1, name: msg("ar", "nav.sub.orgMembers") })).toBeVisible();
      const inviteButton = page.getByRole("button", { name: msg("ar", "org.invite.button") });
      await waitForHydration(inviteButton);
      await inviteButton.click();

      const dialog = page.getByRole("dialog", { name: msg("ar", "org.invite.title") });
      await expect(dialog).toBeVisible();
      const examinerEmail = uniqueEmail();
      await dialog.locator("#invite-email").fill(examinerEmail);
      await dialog.getByRole("radio", { name: msg("ar", "common.roles.examiner") }).click();
      const since = Date.now();
      await dialog.getByRole("button", { name: msg("ar", "org.invite.submit") }).click();

      // The copyable fallback link and the e-mailed link are the same page.
      const sent = page.getByRole("dialog", { name: msg("ar", "org.invite.sentTitle") });
      await expect(sent).toBeVisible({ timeout: 15_000 });
      const copied = await sent.locator("#invite-link").inputValue();
      const mailed = await inviteLinkFor(examinerEmail, since);
      expect(new URL(copied).pathname).toBe(new URL(mailed).pathname);
      expect(new URL(mailed).pathname).toMatch(/^\/ar\/invite\/[A-Za-z0-9_-]+$/);
      await sent.getByRole("button", { name: msg("ar", "org.invite.done") }).click();

      // The pending invitation is listed for the managers.
      const invitations = page.getByRole("region", { name: msg("ar", "org.invitations.title") });
      await expect(invitations.getByText(examinerEmail)).toBeVisible({ timeout: 20_000 });
      if ((page.viewportSize()?.width ?? 1280) < 640) {
        // On a phone the whole address is shown (wrapped), not cut with a tooltip phones never show (R2-UX-7).
        expect(await invitations.getByText(examinerEmail).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }

      // Resend from the keyboard: the row stays, and so does the focus on its menu button (it was disabled while the
      // request ran, which dropped the focus to <body>, R2-UX-2).
      const inviteActions = invitations.getByRole("button", { name: fill(msg("ar", "org.invitations.actions"), { email: examinerEmail }) });
      await waitForHydration(inviteActions);
      await inviteActions.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: msg("ar", "org.invitations.resend") }).press("Enter");
      await expect(page.getByText(msg("ar", "org.invitations.resent"))).toBeVisible({ timeout: 20_000 });
      await expect(inviteActions).toBeFocused();

      // The examiner signs up with the invited address, opens the link and accepts.
      await createVerifiedUser(examinerContext.request, { email: examinerEmail, password: strongPassword(), name: "مقيّم الاختبار" });
      const examiner = await examinerContext.newPage();
      await examiner.goto(new URL(mailed).pathname);
      await expect(examiner.getByRole("heading", { level: 1, name: fill(msg("ar", "org.invitePage.open.title"), { org: org.name }) })).toBeVisible();
      await expect(examiner.getByText(msg("ar", "org.roleDescriptions.examiner"))).toBeVisible();
      const accept = examiner.getByRole("button", { name: msg("ar", "org.invitePage.open.accept") });
      await waitForHydration(accept);
      await accept.click();
      await expect(examiner).toHaveURL(urlPath("/ar/dashboard"), { timeout: 15_000 });

      // Staff navigation: smart scan and the institution pages (trainees see neither).
      await openNavigation(examiner);
      await expect(examiner.getByRole("link", { name: msg("ar", "nav.scans"), exact: true })).toBeVisible();
      await expect(examiner.getByRole("link", { name: msg("ar", "nav.org"), exact: true })).toBeVisible();

      // The owner sees the new examiner in the list, and the invitation is gone.
      await page.reload();
      const row = page.getByRole("listitem").filter({ hasText: examinerEmail });
      await expect(row.getByText(msg("ar", "common.roles.examiner"))).toBeVisible();
      await expect(page.getByRole("region", { name: msg("ar", "org.invitations.title") }).getByText(msg("ar", "org.invitations.empty"))).toBeVisible();

      // Inviting a member again: the server's answer is shown on the e-mail field, which gets the focus (the Send
      // button that was clicked is disabled during the request, R2-UX-2).
      const again = page.getByRole("button", { name: msg("ar", "org.invite.button") });
      await waitForHydration(again);
      await again.click();
      const againDialog = page.getByRole("dialog", { name: msg("ar", "org.invite.title") });
      await againDialog.locator("#invite-email").fill(examinerEmail);
      await againDialog.getByRole("button", { name: msg("ar", "org.invite.submit") }).click();
      await expect(againDialog.getByText(msg("ar", "org.errors.alreadyMember"))).toBeVisible({ timeout: 15_000 });
      await expect(againDialog.locator("#invite-email")).toBeFocused();
      await expect(againDialog.locator("#invite-email")).toHaveAttribute("aria-invalid", "true");
      await page.keyboard.press("Escape");

      // The used link now says so.
      await examiner.goto(new URL(mailed).pathname);
      await expect(examiner.getByRole("heading", { level: 1, name: fill(msg("ar", "org.invitePage.alreadyMember.title"), { org: org.name }) })).toBeVisible();
    } finally {
      await examinerContext.close();
      await admin.close();
    }
  });

  test("creates departments and assigns a member; focus stays in place; the dialog fits a phone; deleting asks first", async ({
    browser,
    page,
    clientIp,
    uniqueEmail,
    strongPassword,
  }) => {
    test.slow();
    const headers = { "x-real-ip": clientIp };
    const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
    // A long four-part name: it must not widen the members dialog past a 390 px screen (review UX-1).
    const name = "عبدالرحمن بن محمد بن عبدالعزيز آل سعود القحطاني";
    const examiner = await memberInNewContext(browser, page.request, {
      headers,
      organizationId: org.id,
      email: uniqueEmail(),
      password: strongPassword(),
      name,
      role: "examiner",
    });
    try {
      // Create from the overview's first-step link (?create=1 opens the dialog).
      await page.goto("/ar/org/departments?create=1");
      const create = page.getByRole("dialog", { name: msg("ar", "org.departments.createTitle") });
      await expect(create).toBeVisible();
      await waitForHydration(create.locator("#department-name"));
      await create.locator("#department-name").fill("قسم الطوارئ");
      await create.getByRole("button", { name: msg("ar", "common.actions.create") }).click();
      await expect(create).toBeHidden({ timeout: 20_000 });
      const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "قسم الطوارئ" }) });
      await expect(card).toBeVisible();
      await expect(card.getByText(msg("ar", "org.departments.noMembers"))).toBeVisible();

      // On an English page the Arabic name keeps the page's alignment (start side, like the date under it) and is
      // marked Arabic, so it is drawn with the Arabic font (R2-UX-4, R2-UX-6).
      await page.goto("/en/org/departments");
      const enTitle = page.getByRole("heading", { level: 3, name: "قسم الطوارئ" });
      await expect(enTitle).toBeVisible();
      expect(await enTitle.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
      await expect(enTitle.locator("bdi[lang=ar]")).toHaveText("قسم الطوارئ");
      // The first family of the stack is the Arabic one (the page's own stack starts with the Latin one).
      expect(await enTitle.locator("bdi[lang=ar]").evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0])).toMatch(/Arabic/);
      await page.goto("/ar/org/departments");

      // A second department with the same name is refused in the form.
      await page.getByRole("button", { name: msg("ar", "org.departments.create") }).first().click();
      const again = page.getByRole("dialog", { name: msg("ar", "org.departments.createTitle") });
      await again.locator("#department-name").fill("  قسم   الطوارئ ");
      await again.getByRole("button", { name: msg("ar", "common.actions.create") }).click();
      await expect(again.getByText(msg("ar", "org.departments.duplicate"))).toBeVisible();
      await again.getByRole("button", { name: msg("ar", "common.actions.cancel") }).click();
      await expect(again).toBeHidden();

      // Assign the examiner. The dialog opens on its search field (never on a "remove" button, which acts at once) and
      // stays inside the screen with a long name in it.
      await card.getByRole("button", { name: msg("ar", "org.departments.manageAction") }).click();
      const manage = page.getByRole("dialog", { name: fill(msg("ar", "org.departments.manageTitle"), { name: "قسم الطوارئ" }) });
      await expect(manage.locator("#department-add-search")).toBeFocused();
      const overflow = await manage.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, "the members dialog scrolls sideways").toBeLessThanOrEqual(0);
      await manage.getByRole("button", { name: fill(msg("ar", "org.departments.add"), { name }) }).click();
      const removeButton = manage.getByRole("button", { name: fill(msg("ar", "org.departments.removeMember"), { name }) });
      await expect(removeButton).toBeVisible({ timeout: 20_000 });
      // The add button went away with its row: focus is on the search field again, not on <body> (WCAG 2.4.3).
      await expect(manage.locator("#department-add-search")).toBeFocused();
      // Removing and adding again: focus goes to the "in the department" heading after a removal.
      await removeButton.click();
      await expect(manage.getByRole("button", { name: fill(msg("ar", "org.departments.add"), { name }) })).toBeVisible({ timeout: 20_000 });
      await expect(manage.locator("#department-members-title")).toBeFocused();
      await manage.getByRole("button", { name: fill(msg("ar", "org.departments.add"), { name }) }).click();
      await expect(removeButton).toBeVisible({ timeout: 20_000 });
      await manage.getByRole("button", { name: msg("ar", "common.actions.close") }).click();
      await expect(manage).toBeHidden();
      await expect(card.getByText(msg("ar", "org.departments.noMembers"))).toHaveCount(0, { timeout: 20_000 });
      await expect(card.getByText(name)).toHaveCount(1); // the avatar's screen-reader name

      // The only department: deleting it is offered exactly when the server allows it (Better Auth's
      // teams.allowRemovingAllTeams, read by lib/org/capabilities.ts; today it keeps the last department).
      const menuFor = (department: string) =>
        page.getByRole("button", { name: fill(msg("ar", "org.departments.actions"), { name: department }) });
      await menuFor("قسم الطوارئ").click();
      const deleteOnly = page.getByRole("menuitem", { name: msg("ar", "org.departments.deleteAction") });
      if ((await deleteOnly.getAttribute("aria-disabled")) === "true") {
        await expect(page.getByText(msg("ar", "org.departments.lastBlocked"))).toBeVisible();
      } else {
        await expect(page.getByText(msg("ar", "org.departments.lastBlocked"))).toHaveCount(0);
      }
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: msg("ar", "org.departments.create") }).first().click();
      const second = page.getByRole("dialog", { name: msg("ar", "org.departments.createTitle") });
      await second.locator("#department-name").fill("قسم المختبر");
      await second.getByRole("button", { name: msg("ar", "common.actions.create") }).click();
      await expect(second).toBeHidden({ timeout: 20_000 });
      await menuFor("قسم المختبر").click();
      await page.getByRole("menuitem", { name: msg("ar", "org.departments.deleteAction") }).click();
      const sure = page.getByRole("alertdialog", { name: fill(msg("ar", "org.departments.deleteTitle"), { name: "قسم المختبر" }) });
      await sure.getByRole("button", { name: msg("ar", "org.departments.deleteConfirm") }).click();
      await expect(sure).toBeHidden({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "قسم المختبر" })).toHaveCount(0, { timeout: 20_000 });
      await expect(card).toBeVisible();
      // Its card and menu button are gone: focus is on the list heading.
      await expect(page.locator("#departments-title")).toBeFocused();

      // The members page shows the member's department.
      await page.goto("/ar/org/members");
      await expect(page.getByRole("listitem").filter({ hasText: examiner.account.email }).getByText("قسم الطوارئ")).toBeVisible();
    } finally {
      await examiner.context.close();
      await admin.close();
    }
  });

  test("changes a member's role; the demoted member loses the institution pages; stepping down to trainee opens the dashboard", async ({
    browser,
    page,
    clientIp,
    uniqueEmail,
    strongPassword,
  }) => {
    test.slow();
    const headers = { "x-real-ip": clientIp };
    const { admin, org, owner } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
    const name = "هدى المقيّمة";
    const examiner = await memberInNewContext(browser, page.request, {
      headers,
      organizationId: org.id,
      email: uniqueEmail(),
      password: strongPassword(),
      name,
      role: "examiner",
    });
    try {
      // While an examiner, the member sees the institution pages.
      await examiner.page.goto("/ar/org");
      await expect(examiner.page.getByRole("heading", { level: 2, name: org.name })).toBeVisible();

      await page.goto("/ar/org/members");
      const row = page.getByRole("listitem").filter({ hasText: examiner.account.email });
      const actions = row.getByRole("button", { name: fill(msg("ar", "org.members.actions"), { name }) });
      await waitForHydration(actions);
      await actions.click();
      await page.getByRole("menuitem", { name: msg("ar", "org.members.changeRoleAction") }).click();
      const roleDialog = page.getByRole("dialog", { name: fill(msg("ar", "org.members.changeRole.title"), { name }) });
      await roleDialog.getByRole("radio", { name: msg("ar", "common.roles.trainee") }).click();
      await roleDialog.getByRole("button", { name: msg("ar", "org.members.changeRole.submit") }).click();
      await expect(roleDialog).toBeHidden({ timeout: 20_000 });
      await expect(row.getByText(msg("ar", "common.roles.trainee"))).toBeVisible({ timeout: 20_000 });

      // Now a trainee: the institution pages are not found, and the navigation has no staff links.
      await examiner.page.goto("/ar/org");
      await expectNotFound(examiner.page);
      await examiner.page.goto("/ar/org/members");
      await expectNotFound(examiner.page);
      await examiner.page.goto("/ar/dashboard");
      await openNavigation(examiner.page);
      await expect(examiner.page.getByRole("link", { name: msg("ar", "nav.simulations"), exact: true })).toBeVisible();
      await expect(examiner.page.getByRole("link", { name: msg("ar", "nav.org"), exact: true })).toHaveCount(0);

      // The owner (one of two: the platform admin who created it is the other) steps down to trainee: the dialog
      // says the institution pages close, and the dashboard opens instead of a not-found page.
      const self = page.getByRole("listitem").filter({ hasText: msg("ar", "org.members.you") });
      await self.getByRole("button", { name: fill(msg("ar", "org.members.actions"), { name: owner.name }) }).click();
      await page.getByRole("menuitem", { name: msg("ar", "org.members.changeRoleAction") }).click();
      const ownDialog = page.getByRole("dialog", { name: fill(msg("ar", "org.members.changeRole.title"), { name: owner.name }) });
      await expect(ownDialog.getByText(`(${msg("ar", "org.members.changeRole.current")})`)).toBeVisible();
      await ownDialog.getByRole("radio", { name: msg("ar", "common.roles.trainee") }).click();
      await expect(ownDialog.getByText(msg("ar", "org.members.changeRole.selfWarningTrainee"))).toBeVisible();
      await ownDialog.getByRole("button", { name: msg("ar", "org.members.changeRole.submit") }).click();
      await expect(page).toHaveURL(urlPath("/ar/dashboard"), { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1, name: msg("ar", "common.notFound.title") })).toHaveCount(0);
    } finally {
      await examiner.context.close();
      await admin.close();
    }
  });

  test("the last owner cannot step down; removing a member asks first", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    const headers = { "x-real-ip": clientIp };
    const { admin, org, owner } = await institutionWithOwner(browser, page.request, {
      headers,
      email: uniqueEmail(),
      password: strongPassword(),
      name: "سارة المالكة",
    });
    const trainee = await memberInNewContext(browser, page.request, {
      headers,
      organizationId: org.id,
      email: uniqueEmail(),
      password: strongPassword(),
      name: "متدرب للإزالة",
      role: "trainee",
    });
    try {
      // The platform admin (the creator, also an owner) invites someone, then leaves: the page's user is the only owner
      // now, and that invitation needs a new one (its sender is gone).
      const strandedEmail = uniqueEmail();
      const sentByAdmin = await authPost(admin.request, "/organization/invite-member", { email: strandedEmail, role: "trainee", organizationId: org.id });
      expect(sentByAdmin.ok(), await sentByAdmin.text()).toBe(true);
      const left = await authPost(admin.request, "/organization/leave", { organizationId: org.id });
      expect(left.ok(), await left.text()).toBe(true);

      await page.goto("/ar/org/members");

      // "Send a new invitation" from the keyboard: the stale row (and its focused menu button) is replaced by a new
      // waiting one, and the focus goes to the invitations heading, not to <body> (R2-UX-2).
      const invitations = page.getByRole("region", { name: msg("ar", "org.invitations.title") });
      const strandedRow = invitations.getByRole("listitem").filter({ hasText: strandedEmail });
      await expect(strandedRow.getByText(msg("ar", "org.invitations.inviterGone"))).toBeVisible();
      const strandedActions = strandedRow.getByRole("button", { name: fill(msg("ar", "org.invitations.actions"), { email: strandedEmail }) });
      await waitForHydration(strandedActions);
      await strandedActions.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menuitem", { name: msg("ar", "org.invitations.sendAgain") }).press("Enter");
      await expect(page.getByText(msg("ar", "org.invitations.sentAgain"))).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#invitations-title")).toBeFocused();
      await expect(strandedRow).toHaveCount(1, { timeout: 20_000 });
      await expect(strandedRow.getByText(msg("ar", "org.invitations.inviterGone"))).toHaveCount(0, { timeout: 20_000 });
      await expect(page.locator("#invitations-title")).toBeFocused();
      const self = page.getByRole("listitem").filter({ hasText: owner.email });
      await expect(self.getByText(msg("ar", "org.members.you"))).toBeVisible();
      const ownActions = self.getByRole("button", { name: fill(msg("ar", "org.members.actions"), { name: owner.name }) });
      await waitForHydration(ownActions);
      await ownActions.click();
      await expect(page.getByRole("menuitem", { name: msg("ar", "org.members.changeRoleAction") })).toBeDisabled();
      await expect(page.getByText(msg("ar", "org.members.blocked.last_owner"))).toBeVisible();
      await page.keyboard.press("Escape");

      // The server refuses it too (the UI only mirrors the rule).
      const members = (await (await page.request.get(`/api/auth/organization/list-members?organizationId=${org.id}`)).json()) as {
        members: Array<{ id: string; userId: string; user: { email: string } }>;
      };
      const ownMember = members.members.find((m) => m.user.email === owner.email)!;
      const demote = await authPost(page.request, "/organization/update-member-role", { memberId: ownMember.id, role: "admin", organizationId: org.id });
      expect(demote.ok()).toBe(false);
      expect(((await demote.json()) as { code?: string }).code).toBe("YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER");

      // Remove the trainee: a confirmation first, then the row is gone and the trainee loses the institution.
      const row = page.getByRole("listitem").filter({ hasText: trainee.account.email });
      await row.getByRole("button", { name: fill(msg("ar", "org.members.actions"), { name: trainee.account.name }) }).click();
      await page.getByRole("menuitem", { name: msg("ar", "org.members.removeAction") }).click();
      const confirm = page.getByRole("alertdialog", { name: fill(msg("ar", "org.members.remove.title"), { name: trainee.account.name }) });
      await confirm.getByRole("button", { name: msg("ar", "org.members.remove.confirm") }).click();
      await expect(confirm).toBeHidden({ timeout: 20_000 });
      await expect(page.getByRole("listitem").filter({ hasText: trainee.account.email })).toHaveCount(0, { timeout: 20_000 });
      // The row and its menu button are gone: focus is on the list heading, not on <body> (WCAG 2.4.3).
      await expect(page.locator("#members-title")).toBeFocused();
    } finally {
      await trainee.context.close();
      await admin.close();
    }
  });

  test("edits the institution's details", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    const headers = { "x-real-ip": clientIp };
    const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
    try {
      // A new institution shows its first steps; on a phone each step's explanation is shown in full (it was cut to two
      // lines with "…" next to the action button, R2-UX-3).
      const viewport = page.viewportSize();
      await page.setViewportSize({ width: 390, height: 844 });
      for (const locale of ["en", "ar"] as const) {
        await page.goto(`/${locale}/org`);
        const steps = page.getByRole("heading", { level: 2, name: msg(locale, "org.overview.setup.title") }).locator("xpath=ancestor::*[@data-slot='card'][1]");
        const descriptions = steps.locator("[data-slot=item-description]");
        await expect(descriptions.first()).toBeVisible();
        const clipped = await descriptions.evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight + 1).length);
        expect(clipped, locale).toBe(0);
      }
      if (viewport) await page.setViewportSize(viewport);

      await page.goto("/ar/org");
      await expect(page.getByRole("heading", { level: 2, name: org.name })).toBeVisible();
      const edit = page.getByRole("button", { name: msg("ar", "org.overview.edit") }).first();
      await waitForHydration(edit);
      await edit.click();
      const dialog = page.getByRole("dialog", { name: msg("ar", "org.profile.title") });
      await dialog.locator("#org-name-en").fill(`${org.nameEn} Medical City`);
      await dialog.getByRole("button", { name: msg("ar", "org.profile.submit") }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(`${org.nameEn} Medical City`)).toBeVisible({ timeout: 20_000 });

      // English pages show the English name.
      await page.goto("/en/org");
      await expect(page.getByRole("heading", { level: 2, name: `${org.nameEn} Medical City` })).toBeVisible();
    } finally {
      await admin.close();
    }
  });
});

test.describe("examiner", () => {
  test("sees members and departments read-only", async ({ browser, page, clientIp, uniqueEmail, strongPassword }) => {
    test.slow();
    const headers = { "x-real-ip": clientIp };
    const { admin, org } = await institutionWithOwner(browser, page.request, { headers, email: uniqueEmail(), password: strongPassword() });
    const examiner = await memberInNewContext(browser, page.request, {
      headers,
      organizationId: org.id,
      email: uniqueEmail(),
      password: strongPassword(),
      name: "مقيّم للقراءة",
      role: "examiner",
    });
    try {
      const p = examiner.page;
      await p.goto("/ar/org");
      await expect(p.getByRole("heading", { level: 2, name: org.name })).toBeVisible();
      await expect(p.getByRole("button", { name: msg("ar", "org.overview.edit") })).toHaveCount(0);
      await expect(p.getByRole("link", { name: msg("ar", "nav.sub.orgProtocols") })).toHaveCount(0);

      await p.goto("/ar/org/members");
      await expect(p.getByText(msg("ar", "org.members.readOnly"))).toBeVisible();
      await expect(p.getByRole("button", { name: msg("ar", "org.invite.button") })).toHaveCount(0);
      await expect(p.getByRole("region", { name: msg("ar", "org.invitations.title") })).toHaveCount(0);
      await expect(p.getByRole("listitem").filter({ hasText: examiner.account.email })).toBeVisible();
      // Searching says how many members match (a status message, WCAG 4.1.3).
      await waitForHydration(p.locator("#members-search"));
      await p.locator("#members-search").fill("zzzz-nobody");
      await expect(p.getByRole("status").filter({ hasText: fill(msg("ar", "org.members.filteredCount"), { shown: "0", total: "3" }) })).toBeVisible();
      await expect(p.getByText(msg("ar", "org.members.noResults"))).toBeVisible();

      await p.goto("/ar/org/departments");
      await expect(p.getByText(msg("ar", "org.departments.readOnly"))).toBeVisible();
      await expect(p.getByText(msg("ar", "org.departments.emptyViewer"))).toBeVisible();
      await expect(p.getByRole("button", { name: msg("ar", "org.departments.create") })).toHaveCount(0);
    } finally {
      await examiner.context.close();
      await admin.close();
    }
  });
});

test.describe("trainee without an institution", () => {
  test.use({ storageState: TRAINEE_STATE });

  test("never sees the institution pages", async ({ page }) => {
    for (const path of ["/ar/org", "/ar/org/members", "/en/org/departments"]) {
      await page.goto(path);
      await expectNotFound(page, path.startsWith("/en") ? "en" : "ar");
    }
  });
});
