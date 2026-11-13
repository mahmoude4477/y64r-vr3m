import type { Locale } from "next-intl";
import type admin from "./ar/admin.json";
import type auth from "./ar/auth.json";
import type common from "./ar/common.json";
import type dashboard from "./ar/dashboard.json";
import type email from "./ar/email.json";
import type landing from "./ar/landing.json";
import type meta from "./ar/meta.json";
import type nav from "./ar/nav.json";
import type org from "./ar/org.json";
import type protocols from "./ar/protocols.json";
import type reports from "./ar/reports.json";
import type scans from "./ar/scans.json";
import type settings from "./ar/settings.json";
import type simulations from "./ar/simulations.json";
import type validation from "./ar/validation.json";

/**
 * One JSON file per namespace: messages/{ar,en}/<namespace>.json (file name = namespace, lowercase).
 * Types come from the Arabic files. Adding a namespace = two JSON files + one line in the type
 * and one in `namespaces` (foundation change: ask, do not edit from a feature branch).
 */
export type AppMessages = {
  admin: typeof admin;
  auth: typeof auth;
  common: typeof common;
  dashboard: typeof dashboard;
  email: typeof email;
  landing: typeof landing;
  /** Site metadata: titles, descriptions, Open Graph alt text, web manifest (lib/seo.ts). */
  meta: typeof meta;
  nav: typeof nav;
  org: typeof org;
  protocols: typeof protocols;
  reports: typeof reports;
  scans: typeof scans;
  settings: typeof settings;
  simulations: typeof simulations;
  validation: typeof validation;
};

export const namespaces = [
  "admin",
  "auth",
  "common",
  "dashboard",
  "email",
  "landing",
  "meta",
  "nav",
  "org",
  "protocols",
  "reports",
  "scans",
  "settings",
  "simulations",
  "validation",
] as const satisfies ReadonlyArray<keyof AppMessages>;

export async function loadMessages(locale: Locale): Promise<AppMessages> {
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, (await import(`./${locale}/${ns}.json`)).default] as const),
  );
  return Object.fromEntries(entries) as AppMessages;
}
