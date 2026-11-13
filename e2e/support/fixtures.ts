import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Locator } from "@playwright/test";
import { ROOT } from "./env";

// Fixture callbacks are named `provide`, not `use`: react-hooks/rules-of-hooks flags `use(...)` (note 09 §3.1).

type Fixtures = {
  /** A random 10.x.y.z address sent as X-Real-IP on every request of this test (see below). */
  clientIp: string;
  /** `e2e-<random>@example.com`: a fresh address per call (the mail limit is 6 per address per 15 min). */
  uniqueEmail: () => string;
  /** A random password that passes the policy (10..128 characters). */
  strongPassword: () => string;
};

export const test = base.extend<Fixtures>({
  // Better Auth rate-limits per client IP (sign-up 3/min, sign-in 5/min). One IP per test keeps parallel tests
  // independent. Only ever against our own local/CI server: Railway's edge sets X-Real-IP itself.
  clientIp: async ({}, provide) => {
    await provide(`10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`);
  },
  extraHTTPHeaders: async ({ extraHTTPHeaders, clientIp }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-real-ip": clientIp });
  },
  uniqueEmail: async ({}, provide) => {
    await provide(() => `e2e-${randomUUID().slice(0, 12)}@example.com`);
  },
  strongPassword: async ({}, provide) => {
    await provide(() => `E2e-${randomBytes(18).toString("base64url")}`);
  },
});

export { expect };

export type Locale = "ar" | "en";
export const LOCALES = ["ar", "en"] as const satisfies readonly Locale[];
export const DIR = { ar: "rtl", en: "ltr" } as const satisfies Record<Locale, "rtl" | "ltr">;

const cache = new Map<string, unknown>();

/** Text from messages/{ar,en}/<namespace>.json ("auth.signIn.submit"), so tests follow copy edits in both languages. */
export function msg(locale: Locale, key: string): string {
  const [ns, ...rest] = key.split(".");
  const file = path.join(ROOT, "messages", locale, `${ns}.json`);
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(file, "utf8")));
  const value = rest.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], cache.get(file));
  if (typeof value !== "string") throw new Error(`missing message ${locale}:${key}`);
  return value;
}

/**
 * Waits until React has hydrated `target` (the element carries React's props). Text filled into a form before that
 * can be reset by hydration on a busy server: the sign-in form then submitted an empty e-mail (finish-round fix
 * review). Use it after `page.goto` and before the first `fill` / `click` on a form.
 */
export async function waitForHydration(target: Locator): Promise<void> {
  await expect
    .poll(() => target.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$"))), { timeout: 20_000 })
    .toBe(true);
}

/** Exact-match RegExp for a full URL path (+ optional query) on our server, e.g. urlPath("/ar/dashboard"). */
export function urlPath(pathAndQuery: string): RegExp {
  const escaped = pathAndQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^https?://[^/]+${escaped}$`);
}
