import "server-only";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { log } from "@/lib/log";
import { getAuthContext } from "@/lib/session";

// Document titles of the admin pages: the browser tab says what the page really shows.

/** A record page's part of the title: null when the record does not exist (the page answers not found). */
export type RecordTitle = { name: string | null } | null;

/** Which title an /admin page gets for this visitor (pure, unit-tested). */
export function adminTitleKind(ctx: { isPlatformAdmin: boolean; session: { impersonatedBy?: string | null } } | null) {
  if (ctx?.isPlatformAdmin) return "page" as const;
  // The admin layout shows the "acting as" notice on every /admin address while an admin acts as a user.
  if (ctx?.session.impersonatedBy) return "impersonation" as const;
  // Everyone else gets the not-found page from every data component.
  return "notFound" as const;
}

/** "<record> | <section>", or the section alone when the record has no name of its own. */
export function joinTitle(name: string | null, title: string): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} | ${title}` : title;
}

/**
 * The metadata of an /admin page. `title` is the page's own title; `record` (detail pages, called only for a platform
 * admin) names the record shown, so several open records can be told apart, or returns null when it does not exist.
 * While acting as a user the title is the notice's; for anyone else who is not a platform admin it is "Page not found".
 */
export async function adminMetadata(title: string, record?: () => Promise<RecordTitle>): Promise<Metadata> {
  const ctx = await getAuthContext();
  const kind = adminTitleKind(ctx);
  if (kind === "impersonation") return { title: (await getTranslations("admin.impersonation"))("title") };
  if (kind === "notFound") return { title: (await getTranslations("common.notFound"))("title") };
  if (!record) return { title };
  try {
    const found = await record();
    if (!found) return { title: (await getTranslations("common.notFound"))("title") };
    return { title: joinTitle(found.name, title) };
  } catch (err) {
    // Next's own signals (the prerender pass ends and `params` rejects, a dynamic bail-out) are not failures: they go
    // back to Next, which renders the title at request time. Only a real failed read is logged.
    unstable_rethrow(err);
    // The page itself reports a failed read; the title falls back to the section's.
    log.warn("admin.metadata.record_failed", { err });
    return { title };
  }
}
