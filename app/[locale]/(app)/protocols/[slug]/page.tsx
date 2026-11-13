import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProtocolDetailSkeleton, ProtocolDetailView } from "@/components/protocols/protocol-detail";
import { scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { getProtocolTitles } from "@/lib/protocols/queries";
import { getAuthContext } from "@/lib/session";

// One protocol: steps with why / reference, training scenarios, scan action for staff, print layout.
// Everything comes from the request (slug, session), so the whole body streams in <Suspense>.

/**
 * The protocol title when this user may read it (same rule as the page); a signed-in user who may not gets the
 * not-found title, as the page body does. Guests are sent to sign in by the page.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/protocols/[slug]">): Promise<Metadata> {
  const [{ slug }, ctx, locale, t] = await Promise.all([params, getAuthContext(), getLocale(), getTranslations()]);
  if (!ctx) return { title: t("nav.sub.protocolDetail") };
  const titles = await getProtocolTitles(scopeOf(ctx), slug);
  return { title: titles ? pick(titles, "title", locale) : t("common.notFound.title") };
}

export default function ProtocolPage({ params }: PageProps<"/[locale]/protocols/[slug]">) {
  return (
    <Suspense fallback={<ProtocolDetailSkeleton />}>
      <ProtocolDetailView params={params} />
    </Suspense>
  );
}
