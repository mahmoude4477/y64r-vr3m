import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CreateProtocolView, EditorSkeleton } from "@/components/protocols/editor/editor-views";
import { isOrgManager, scopeOf } from "@/lib/authz";
import { getAuthContext } from "@/lib/session";

// Institution managers: a protocol of the institution's own, written from scratch (a draft until it is published).

/** Same rule as the page: managers of the active institution; anyone else gets the not-found title. */
export async function generateMetadata(): Promise<Metadata> {
  const [ctx, t] = await Promise.all([getAuthContext(), getTranslations()]);
  return { title: ctx && isOrgManager(scopeOf(ctx)) ? t("protocols.org.newPage.title") : t("common.notFound.title") };
}

export default function NewInstitutionProtocolPage() {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <CreateProtocolView kind="institution" />
    </Suspense>
  );
}
