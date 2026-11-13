import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CopyPicker, CopyPickerSkeleton } from "@/components/protocols/manage/copy-picker";
import { isOrgManager, scopeOf } from "@/lib/authz";
import { getAuthContext } from "@/lib/session";

// Institution managers: pick a published global protocol to copy into the institution (a draft copy).

/** Same rule as the page: managers of the active institution; anyone else gets the not-found title. */
export async function generateMetadata(): Promise<Metadata> {
  const [ctx, t] = await Promise.all([getAuthContext(), getTranslations()]);
  return { title: ctx && isOrgManager(scopeOf(ctx)) ? t("protocols.org.copyPage.title") : t("common.notFound.title") };
}

export default function CopyProtocolPage() {
  return (
    <Suspense fallback={<CopyPickerSkeleton />}>
      <CopyPicker />
    </Suspense>
  );
}
