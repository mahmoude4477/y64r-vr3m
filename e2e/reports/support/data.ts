import { spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import path from "node:path";
import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import { protocols as seedProtocols } from "../../../prisma/seed/protocols";
import { addMember, authPost, createVerifiedUser, sessionUserId } from "../../support/auth";
import { ADMIN_STATE, BASE_URL, E2E_DATABASE_URL, ROOT } from "../../support/env";
import { expect } from "../../support/fixtures";
import type { SeedPlan, SeedResult } from "./types";

// Helpers of the reports specs (e2e/reports/**): institutions with real members (Better Auth endpoints, e-mailed
// codes) and results written straight into the e2e database by seed-results.mts (the scan and simulation flows are
// built by other teams in parallel). Every institution and person is new per run.

export type { SeedPlan, SeedResult };

/** A seed protocol (prisma/seed/protocols.ts): titles and step keys/texts in both languages. */
export function seedProtocol(slug: string) {
  const found = seedProtocols.find((p) => p.slug === slug);
  if (!found) throw new Error(`no seed protocol ${slug}`);
  return found;
}

/** Writes the plan's attempts and scans with e2e/reports/support/seed-results.mts (tsx in its own process). */
export function seedResults(plan: SeedPlan): SeedResult {
  const run = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join("e2e", "reports", "support", "seed-results.mts")],
    {
      cwd: ROOT,
      input: JSON.stringify(plan),
      encoding: "utf8",
      env: { ...process.env, REPORTS_SEED_DATABASE_URL: E2E_DATABASE_URL },
      timeout: 90_000,
    },
  );
  if (run.status !== 0) throw new Error(`seed-results.mts failed (${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "{}") as SeedResult;
}

/** A random 10.x.y.z client address (Better Auth limits sign-ups per IP: one address per person keeps them apart). */
export function randomIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export type Person = {
  id: string;
  email: string;
  name: string;
  /** Session cookies of the person (signed in, the institution active). */
  cookies: Awaited<ReturnType<APIRequestContext["storageState"]>>["cookies"];
};

type Role = "owner" | "admin" | "examiner" | "trainee";

/**
 * A new institution created by the platform admin, with one new verified person per entry of `people`, each a
 * member with the given role and the institution active in their session. Returns ids and session cookies; the
 * request contexts are closed.
 */
export async function newInstitution<K extends string>(
  playwright: PlaywrightWorkerArgs["playwright"],
  people: Record<K, { role: Role; name: string }>,
): Promise<{ organizationId: string; name: string; nameEn: string; people: Record<K, Person> }> {
  const tag = randomUUID().slice(0, 6);
  const name = `مستشفى التقارير ${tag}`;
  const nameEn = `Reports Test Hospital ${tag}`;
  const admin = await playwright.request.newContext({ baseURL: BASE_URL, storageState: ADMIN_STATE, extraHTTPHeaders: { "x-real-ip": randomIp() } });
  try {
    const org = await createInstitution(admin, { name, nameEn });
    const out = {} as Record<K, Person>;
    for (const key of Object.keys(people) as K[]) {
      const { role, name: personName } = people[key];
      const request = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-real-ip": randomIp() } });
      try {
        const email = `e2e-${randomUUID().slice(0, 12)}@example.com`;
        await createVerifiedUser(request, { email, password: `E2e-${randomUUID()}`, name: personName });
        await addMember(admin, request, { organizationId: org.id, email, role });
        const active = await authPost(request, "/organization/set-active", { organizationId: org.id });
        expect(active.ok(), await active.text()).toBe(true);
        const id = await sessionUserId(request);
        if (!id) throw new Error("no session after sign-up");
        out[key] = { id, email, name: personName, cookies: (await request.storageState()).cookies };
      } finally {
        await request.dispose();
      }
    }
    return { organizationId: org.id, name, nameEn, people: out };
  } finally {
    await admin.dispose();
  }
}

/**
 * Creates the institution as the platform admin (support/auth createOrganization, keepCurrentActiveOrganization), and
 * tries again on a 5xx: on a loaded test machine the local database sometimes refuses a new connection within the
 * pool's 5 s ("Connection terminated due to connection timeout"). Any other answer fails at once.
 */
async function createInstitution(admin: APIRequestContext, org: { name: string; nameEn: string }): Promise<{ id: string }> {
  for (let attempt = 1; ; attempt++) {
    const res = await authPost(admin, "/organization/create", {
      ...org,
      slug: `e2e-reports-${randomUUID().slice(0, 12)}`,
      type: "hospital",
      keepCurrentActiveOrganization: true,
    });
    if (res.ok()) return { id: ((await res.json()) as { id: string }).id };
    if (res.status() < 500 || attempt >= 3) {
      expect(res.ok(), `/organization/create answered ${res.status()}: ${await res.text()}`).toBe(true);
    }
  }
}

/** Signs the page's browser context in as `person` (their session cookies). */
export async function signInAs(page: Page, person: Person) {
  await page.context().clearCookies();
  await page.context().addCookies(person.cookies);
}

/** Average of the scored values, rounded (lib/reports/aggregate.ts averageScore). */
export function average(scores: ReadonlyArray<number | null>): number | null {
  const scored = scores.filter((s): s is number => s !== null);
  return scored.length === 0 ? null : Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
}

/** msg() with {placeholders} filled in. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));
}

/** The text between the braces that open at `open` (nested braces included). */
function braced(text: string, open: number): { body: string; end: number } {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
  }
  throw new Error(`unbalanced braces in ${text}`);
}

/**
 * msg() with ICU `{arg, plural, …}` blocks resolved the way next-intl does (an exact `=n` branch first, then the
 * locale's plural category, `#` = the number) and the remaining {placeholders} filled in. Enough for the messages
 * the specs read; not a full ICU implementation.
 */
export function format(locale: "ar" | "en", template: string, values: Record<string, string | number>): string {
  let out = "";
  let i = 0;
  const plural = /\{(\w+), plural, /y;
  while (i < template.length) {
    plural.lastIndex = i;
    const m = plural.exec(template);
    if (!m) {
      out += template[i++];
      continue;
    }
    const { body, end } = braced(template, i);
    const value = Number(values[m[1]]);
    const branches = new Map<string, string>();
    let rest = body.slice(m[0].length - 1);
    while (rest.trim()) {
      const key = /^\s*(=?\w+)\s*/.exec(rest);
      if (!key) break;
      const open = rest.indexOf("{", key[0].length - 1);
      const branch = braced(rest, open);
      branches.set(key[1], branch.body);
      rest = rest.slice(branch.end);
    }
    const chosen = branches.get(`=${value}`) ?? branches.get(new Intl.PluralRules(locale).select(value)) ?? branches.get("other") ?? "";
    out += format(locale, chosen.replaceAll("#", String(value)), values);
    i = end;
  }
  return fill(out, values);
}
