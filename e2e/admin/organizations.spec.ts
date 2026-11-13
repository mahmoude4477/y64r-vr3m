import { randomUUID } from "node:crypto";
import { expectAccessible } from "../support/a11y";
import { addMember, authPost, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, urlPath, waitForHydration } from "../support/fixtures";
import { inviteLinkFor } from "../support/mail";
import { choose, ready } from "./helpers";

// /admin/organizations: create an institution and invite its owner, edit, suspend, member roles, leave, delete.
// Each test creates its own institution with the shared platform admin (who becomes its first owner, the Better Auth
// creator rule) and its own users.

// Owner changes and deletes wait for the cluster-wide account lock: one test after another in this file.
test.describe.configure({ mode: "default" });
test.use({ storageState: ADMIN_STATE });

const unique = () => randomUUID().slice(0, 8);

test("create an institution, invite its owner by e-mail, then leave it once the owner has joined", async ({
  page,
  browser,
  clientIp,
  uniqueEmail,
  strongPassword,
}, testInfo) => {
  test.setTimeout(150_000);
  const id = unique();
  const nameAr = `مستشفى الاختبار ${id}`;
  const nameEn = `Test Hospital ${id}`;
  const ownerEmail = uniqueEmail();

  await page.goto("/ar/admin/organizations/new");
  await ready(page, msg("ar", "admin.createOrg.title"), msg("ar", "admin.createOrg.submit"));
  await expectAccessible(page, testInfo, { label: "new ar light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "new ar dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

  // Both names and the type are required; the owner's address is checked.
  await page.getByRole("button", { name: msg("ar", "admin.createOrg.submit") }).click();
  await expect(page.getByText(msg("ar", "validation.required")).first()).toBeVisible();
  await page.getByLabel(msg("ar", "admin.createOrg.nameAr")).fill(nameAr);
  await page.getByLabel(msg("ar", "admin.createOrg.nameEn")).fill(nameEn);
  await choose(page, msg("ar", "admin.createOrg.type"), msg("ar", "common.orgType.hospital"));
  await page.getByLabel(msg("ar", "admin.createOrg.owner")).fill("not-an-address");
  await page.getByRole("button", { name: msg("ar", "admin.createOrg.submit") }).click();
  await expect(page.getByText(msg("ar", "validation.email"))).toBeVisible();
  await page.getByLabel(msg("ar", "admin.createOrg.owner")).fill(ownerEmail);
  const since = Date.now();
  await page.getByRole("button", { name: msg("ar", "admin.createOrg.submit") }).click();

  // Creating the institution and sending the invitation can take a while on a busy server.
  await expect(page).toHaveURL(/\/ar\/admin\/organizations\/(?!new$)[^/]+$/, { timeout: 45_000 });
  await ready(page, nameAr);
  const orgUrl = new URL(page.url()).pathname;
  const invitations = page.getByRole("heading", { level: 2, name: msg("ar", "admin.org.invitations.title") });
  await expect(invitations).toBeVisible();
  await expect(page.getByText(ownerEmail)).toBeVisible();
  // The creator is the first owner (Better Auth), so the admin may send invitations from here.
  await expect(page.getByText(msg("ar", "admin.org.membership.member").replace("{role}", msg("ar", "common.roles.owner")))).toBeVisible();
  // Its owner is invited: the invite form starts with the weakest role, and choosing "owner" again warns first.
  // exact: each member row has its own "Role of <name>" select.
  const inviteRole = page.getByRole("combobox", { name: msg("ar", "admin.org.invitations.role"), exact: true });
  await expect(inviteRole).toContainText(msg("ar", "common.roles.trainee"));
  await expect(page.getByText(msg("ar", "admin.org.invitations.ownerExists"))).toHaveCount(0);
  await waitForHydration(inviteRole);
  await inviteRole.click();
  await page.getByRole("option", { name: msg("ar", "common.roles.owner"), exact: true }).click();
  await expect(page.getByText(msg("ar", "admin.org.invitations.ownerExists"))).toBeVisible();
  await expectAccessible(page, testInfo, { label: "detail ar light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "detail ar dark" });

  // The owner gets the e-mail, signs up and accepts.
  const link = await inviteLinkFor(ownerEmail, since);
  const invitationId = decodeURIComponent(new URL(link).pathname.split("/").pop()!);
  const ownerCtx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
  try {
    await createVerifiedUser(ownerCtx.request, { email: ownerEmail, password: strongPassword(), name: "مالكة الاختبار" });
    const accepted = await authPost(ownerCtx.request, "/organization/accept-invitation", { invitationId });
    expect(accepted.ok(), await accepted.text()).toBe(true);
  } finally {
    await ownerCtx.close();
  }

  await page.reload();
  await ready(page, nameAr, msg("ar", "admin.org.membership.leave"));
  await expect(page.getByText(msg("ar", "admin.org.invitations.empty"))).toBeVisible();
  // Its own owner is in: the panel says plainly that the admin's owner access is no longer needed.
  await expect(page.getByText(msg("ar", "admin.org.membership.leaveNowTitle"))).toBeVisible();
  await page.getByRole("button", { name: msg("ar", "admin.org.membership.leave") }).click();
  const leave = page.getByRole("alertdialog");
  await leave.getByRole("button", { name: msg("ar", "admin.org.membership.leave") }).click();
  await expect(page.getByText(msg("ar", "admin.org.membership.notMember"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(msg("ar", "admin.org.invitations.joinFirst")).first()).toBeVisible();
  expect(orgUrl).toMatch(/^\/ar\/admin\/organizations\//);
});

test("edit, suspend, reactivate and delete an institution", async ({ page }) => {
  test.setTimeout(150_000);
  const id = unique();
  const org = await createOrganization(page.request, { name: `جامعة الاختبار ${id}`, nameEn: `Test University ${id}`, slug: `e2e-${id}`, type: "university" });

  await page.goto(`/en/admin/organizations/${org.id}`);
  await ready(page, `Test University ${id}`, msg("en", "admin.org.edit"), "en");
  // The admin is its only owner (created it, no invitation yet): the invite form starts with "owner", no warning.
  await expect(page.getByRole("combobox", { name: msg("en", "admin.org.invitations.role"), exact: true })).toContainText(msg("en", "common.roles.owner"));
  await expect(page.getByText(msg("en", "admin.org.invitations.ownerExists"))).toHaveCount(0);

  await page.getByRole("button", { name: msg("en", "admin.org.edit") }).click();
  const edit = page.getByRole("dialog", { name: msg("en", "admin.org.editTitle") });
  await edit.getByLabel(msg("en", "admin.createOrg.nameEn")).fill(`Renamed University ${id}`);
  await choose(page, msg("en", "admin.createOrg.type"), msg("en", "common.orgType.training_center"));
  await edit.getByRole("button", { name: msg("en", "admin.org.editSubmit") }).click();
  await expect(edit).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: `Renamed University ${id}` })).toBeVisible();
  await expect(page.getByText(msg("en", "common.orgType.training_center")).first()).toBeVisible();

  // "Institutions I belong to": the admin's own institutions, each marked with the admin's role there.
  await page.goto(`/en/admin/organizations?status=mine&q=${encodeURIComponent(id)}`);
  await expect(page.getByRole("link", { name: `Renamed University ${id}` }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
  const yourRole = msg("en", "admin.organizations.badges.yourRole").replace("{role}", msg("en", "common.roles.owner"));
  await expect(page.getByText(yourRole).filter({ visible: true }).first()).toBeVisible();
  await page.goto(`/en/admin/organizations/${org.id}`);
  await ready(page, `Renamed University ${id}`, msg("en", "admin.org.suspend"), "en");

  await page.getByRole("button", { name: msg("en", "admin.org.suspend") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "admin.org.suspend") }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 20_000 }); // it shows the new label while closing
  await expect(page.getByText(msg("en", "admin.org.suspendedAlert.title"))).toBeVisible({ timeout: 20_000 });
  // Better Auth refuses changes to a suspended institution for its own managers; the platform admin still sees it all.
  await page.getByRole("button", { name: msg("en", "admin.org.unsuspend") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "admin.org.unsuspend") }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 20_000 }); // it shows the new label while closing
  await expect(page.getByText(msg("en", "admin.org.suspendedAlert.title"))).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: msg("en", "admin.org.delete"), exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  const submit = confirm.getByRole("button", { name: msg("en", "admin.org.deleteSubmit") });
  await expect(submit).toBeDisabled();
  // What goes, in one sentence (its one member, the admin; no scans), never "Members who lose access: 1." numbering.
  await expect(confirm.getByText("1 member loses access, and no scans are deleted.")).toBeVisible();
  // The name to type is shown in the dialog (the institution's name in the page language).
  await expect(confirm.locator("code", { hasText: `Renamed University ${id}` })).toBeVisible();
  await confirm.getByLabel(msg("en", "admin.org.deleteConfirm")).fill(`Renamed University ${id}`);
  await submit.click();
  await expect(page).toHaveURL(urlPath("/en/admin/organizations"), { timeout: 30_000 });
  await page.goto(`/en/admin/organizations?q=${encodeURIComponent(id)}`);
  await expect(page.getByRole("heading", { name: msg("en", "admin.organizations.noResults.title") })).toBeVisible();
  await page.goto(`/en/admin/organizations/${org.id}`);
  await expect(page.getByRole("heading", { level: 1, name: msg("en", "common.notFound.title") })).toBeVisible();
});

test("the overview's own-membership figure opens the institutions the admin belongs to", async ({ page }) => {
  const id = unique();
  await createOrganization(page.request, { name: `معهد الاختبار ${id}`, nameEn: `Test Institute ${id}`, slug: `e2e-mine-${id}`, type: "training_center" });
  await page.goto("/en/admin");
  // "Show the institutions you are a member of (n)": the link's name without the count.
  const prefix = msg("en", "admin.overview.organizations.showYourMemberships").split("{n}")[0].replace(/\s*\($/, "");
  const link = page.getByRole("link", { name: prefix });
  await expect(link).toHaveAttribute("href", "/en/admin/organizations?status=mine", { timeout: 20_000 });
  await waitForHydration(link);
  await link.click();
  await expect(page).toHaveURL(/\/en\/admin\/organizations\?status=mine$/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: `Test Institute ${id}` }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
});

test("member roles: an institution always keeps an owner", async ({ page, browser, clientIp, uniqueEmail, strongPassword }, testInfo) => {
  test.setTimeout(150_000);
  const id = unique();
  const org = await createOrganization(page.request, { name: `مركز تدريب ${id}`, nameEn: `Training Center ${id}`, slug: `e2e-${id}`, type: "training_center" });
  const memberCtx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
  const email = uniqueEmail();
  try {
    await createVerifiedUser(memberCtx.request, { email, password: strongPassword(), name: "Member Trainee" });
    await addMember(page.request, memberCtx.request, { organizationId: org.id, email, role: "trainee" });
  } finally {
    await memberCtx.close();
  }

  await page.goto(`/en/admin/organizations/${org.id}`);
  await ready(page, `Training Center ${id}`, msg("en", "admin.org.edit"), "en");
  const roleOf = (name: string) => msg("en", "admin.org.members.roleOf").replace("{name}", name);

  // The trainee becomes an examiner.
  const memberRole = page.getByRole("combobox", { name: roleOf("Member Trainee") });
  await waitForHydration(memberRole);
  await choose(page, roleOf("Member Trainee"), msg("en", "common.roles.examiner"));
  await expect(page.getByText(msg("en", "admin.org.members.roleChanged"))).toBeVisible({ timeout: 20_000 });
  await expect(memberRole).toContainText(msg("en", "common.roles.examiner"));

  // The platform admin (the creator, listed first) is the only owner: demoting them would leave members without one.
  // Taking rights away asks first; the refusal shows in that dialog.
  await page.getByRole("combobox", { name: /^Role of / }).first().click();
  await page.getByRole("option", { name: msg("en", "common.roles.admin"), exact: true }).click();
  const lower = page.getByRole("alertdialog");
  await expect(lower.getByText(msg("en", "admin.org.members.lowerDescription").replace("{from}", msg("en", "common.roles.owner")))).toBeVisible();
  await lower.getByRole("button", { name: msg("en", "admin.org.members.lowerConfirm") }).click();
  await expect(lower.getByText(msg("en", "admin.errors.lastOwner"))).toBeVisible({ timeout: 20_000 });
  await lower.getByRole("button", { name: msg("en", "common.actions.cancel") }).click();
  await expect(lower).toBeHidden();

  // Promote the member to owner, then the admin may step down (leave).
  await choose(page, roleOf("Member Trainee"), msg("en", "common.roles.owner"));
  await expect(memberRole).toContainText(msg("en", "common.roles.owner"), { timeout: 20_000 });
  await page.getByRole("button", { name: msg("en", "admin.org.membership.leave") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "admin.org.membership.leave") }).click();
  await expect(page.getByText(msg("en", "admin.org.membership.notMember"))).toBeVisible({ timeout: 20_000 });

  // The new owner is now the only owner with no one else: removing the last member leaves an empty institution.
  await page.getByRole("button", { name: msg("en", "admin.org.members.removeAria").replace("{name}", "Member Trainee") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: msg("en", "admin.org.members.remove") }).click();
  await expect(page.getByText(msg("en", "admin.org.members.empty"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(msg("en", "admin.org.noOwnerAlert.title"))).toBeVisible();

  // The list finds it among the institutions without an owner.
  await page.goto(`/en/admin/organizations?status=no_owner&q=${encodeURIComponent(id)}`);
  await expect(page.getByRole("link", { name: `Training Center ${id}` }).first()).toBeVisible();
  // The list is a table on wide screens and cards on phones: only one of them is displayed.
  await expect(page.getByText(msg("en", "admin.organizations.badges.noOwner")).filter({ visible: true }).first()).toBeVisible();
  // The list itself (a fresh page load, no toast on screen), light and dark.
  await expectAccessible(page, testInfo, { label: "list en light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expectAccessible(page, testInfo, { label: "list en dark" });
});
