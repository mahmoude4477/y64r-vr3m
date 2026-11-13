import "server-only";
import type { AbstractIntlMessages } from "next-intl";
import { getMessages } from "next-intl/server";
import type { AppMessages } from "@/messages";

type Namespace = keyof AppMessages;

/** Every page's client components may use these (shell, forms, badges, dialogs, not-found and error pages). */
const SHARED: readonly Namespace[] = ["common", "nav", "validation"];

/** Never read by a client component: e-mail templates, site metadata, the static landing page. */
const SERVER_ONLY: readonly Namespace[] = ["email", "meta", "landing"];

/**
 * Messages for a <NextIntlClientProvider> (it REPLACES, never merges, the messages of a provider above it). Each
 * route group hands its client components only what they read, so a public page does not ship the whole app's copy
 * in its RSC payload (the landing used to carry all fifteen namespaces, about 200 KB of Arabic text):
 * - root layout: the shared namespaces;
 * - (auth) / (account): + auth, org, settings;
 * - (app): every namespace except the server-only ones (`"app"`).
 */
export async function clientMessages(extra: readonly Namespace[] | "app" = []): Promise<AbstractIntlMessages> {
  const all = (await getMessages()) as unknown as Record<string, AbstractIntlMessages>;
  const keep = (ns: string) =>
    extra === "app" ? !SERVER_ONLY.includes(ns as Namespace) : SHARED.includes(ns as Namespace) || extra.includes(ns as Namespace);
  return Object.fromEntries(Object.entries(all).filter(([ns]) => keep(ns)));
}
