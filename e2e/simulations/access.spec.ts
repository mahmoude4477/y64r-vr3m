import { randomUUID } from "node:crypto";
import { addMember, createOrganization, createVerifiedUser } from "../support/auth";
import { ADMIN_STATE } from "../support/env";
import { expect, msg, test, urlPath } from "../support/fixtures";
import { correctChoice, playScenario, scenario, SERVER_WAIT, title, wrongChoice } from "./helpers";

// Who may open an attempt's result (CONVENTIONS 4, lib/authz attemptsReadable): its owner, and staff (owner, admin,
// examiner) of the institution the attempt was made in. Nobody else: they get the not-found page, and the debrief
// endpoint answers 404 (it only ever works for the owner, whose AI limit it uses).

const notFound = (locale: "ar" | "en") => ({ level: 1 as const, name: msg(locale, "common.notFound.title") });

test.describe("attempt access", () => {
  test.describe.configure({ timeout: 180_000 }); // two or three sign-ups with e-mailed codes and a full play-through

  test("guests are sent to sign-in, and the debrief endpoint wants a session", async ({ page, request }) => {
    await page.goto("/ar/simulations/attempts/someid");
    await expect(page).toHaveURL(urlPath("/ar/sign-in?callbackUrl=%2Far%2Fsimulations%2Fattempts%2Fsomeid"));
    const res = await request.post("/api/simulations/attempts/someid/debrief", { data: { locale: "ar" } });
    expect(res.status()).toBe(401);
  });

  test("another user cannot open someone's attempt or ask for its debrief", async ({ page, browser, clientIp, uniqueEmail, strongPassword }) => {
    const s = scenario("food-on-night-shift");
    await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword() });
    const id = await playScenario(page, "ar", s, correctChoice);

    const other = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": clientIp } });
    try {
      const otherPage = await other.newPage();
      await createVerifiedUser(other.request, { email: uniqueEmail(), password: strongPassword(), locale: "en" });
      await otherPage.goto(`/en/simulations/attempts/${id}`);
      await expect(otherPage.getByRole("heading", notFound("en"))).toBeVisible({ timeout: SERVER_WAIT });
      await expect(otherPage.getByText(title(s, "en"))).toHaveCount(0);

      const res = await other.request.post(`/api/simulations/attempts/${id}/debrief`, { data: { locale: "en" } });
      expect(res.status()).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });

      // A bad body is refused before anything is read.
      const bad = await page.request.post(`/api/simulations/attempts/${id}/debrief`, { data: { locale: "fr" } });
      expect(bad.status()).toBe(400);
    } finally {
      await other.close();
    }
  });

  test("an examiner of the institution reviews a trainee's attempt; a fellow trainee cannot", async ({
    page,
    browser,
    clientIp,
    uniqueEmail,
    strongPassword,
  }) => {
    const headers = { "x-real-ip": clientIp };
    const admin = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: headers });
    const examiner = await browser.newContext({ extraHTTPHeaders: headers });
    const peer = await browser.newContext({ extraHTTPHeaders: headers });
    try {
      const traineeName = `متدرب ${randomUUID().slice(0, 6)}`;
      const trainee = await createVerifiedUser(page.request, { email: uniqueEmail(), password: strongPassword(), name: traineeName });
      const examinerAccount = await createVerifiedUser(examiner.request, { email: uniqueEmail(), password: strongPassword() });
      const peerAccount = await createVerifiedUser(peer.request, { email: uniqueEmail(), password: strongPassword() });

      const org = await createOrganization(admin.request, {
        name: `مستشفى المحاكاة ${randomUUID().slice(0, 6)}`,
        slug: `e2e-${randomUUID().slice(0, 12)}`,
        type: "hospital",
      });
      // Accepting an invitation makes that institution the member's active one.
      await addMember(admin.request, page.request, { organizationId: org.id, email: trainee.email, role: "trainee" });
      await addMember(admin.request, examiner.request, { organizationId: org.id, email: examinerAccount.email, role: "examiner" });
      await addMember(admin.request, peer.request, { organizationId: org.id, email: peerAccount.email, role: "trainee" });

      // The attempt belongs to the trainee's active institution.
      const s = scenario("hand-hygiene-station-icu");
      const id = await playScenario(page, "ar", s, wrongChoice);

      const examinerPage = await examiner.newPage();
      await examinerPage.goto(`/ar/simulations/attempts/${id}`);
      await expect(examinerPage.getByRole("heading", { level: 1, name: title(s, "ar") })).toBeVisible({ timeout: SERVER_WAIT });
      await expect(examinerPage.getByText(traineeName)).toBeVisible();
      await expect(examinerPage.getByRole("region", { name: msg("ar", "simulations.result.review.title") })).toBeVisible();
      // Staff read the results but never generate the trainee's personal summary (it uses the trainee's AI limit).
      await expect(examinerPage.getByText(msg("ar", "simulations.result.debrief.notRequested"))).toBeVisible();
      await expect(examinerPage.getByRole("link", { name: msg("ar", "simulations.result.actions.tryAgain"), exact: true })).toHaveCount(0);
      // The page speaks about the trainee, not to the reader (SPEC-5): third-person labels, no practice links.
      const review = examinerPage.getByRole("region", { name: msg("ar", "simulations.result.review.title") });
      await expect(review.getByText(msg("ar", "simulations.result.review.stateStaff.chosen_wrong"), { exact: true }).first()).toBeVisible();
      await expect(review.getByText(msg("ar", "simulations.result.review.state.chosen_wrong"), { exact: true })).toHaveCount(0);
      await expect(examinerPage.getByRole("heading", { level: 2, name: msg("ar", "simulations.result.strengths.titleStaff") })).toBeVisible();
      await expect(examinerPage.getByRole("link", { name: msg("ar", "simulations.result.recommendations.practiseAgain") })).toHaveCount(0);
      // The trainee reads the same attempt in the second person, with the way back to the scenario.
      await expect(page.getByRole("link", { name: msg("ar", "simulations.result.actions.tryAgain"), exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: msg("ar", "simulations.result.review.title") }).getByText(msg("ar", "simulations.result.review.state.chosen_wrong"), { exact: true }).first()).toBeVisible();
      const staffDebrief = await examiner.request.post(`/api/simulations/attempts/${id}/debrief`, { data: { locale: "ar" } });
      expect(staffDebrief.status()).toBe(404);

      const peerPage = await peer.newPage();
      await peerPage.goto(`/ar/simulations/attempts/${id}`);
      await expect(peerPage.getByRole("heading", notFound("ar"))).toBeVisible({ timeout: SERVER_WAIT });
    } finally {
      await Promise.all([admin.close(), examiner.close(), peer.close()]);
    }
  });
});
