import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CreateProtocolView, EditorSkeleton } from "@/components/protocols/editor/editor-views";
import { getAuthContext } from "@/lib/session";

// Platform admin: a new global protocol (a draft until it is published).

/** Same rule as the page: anyone but a platform admin gets the not-found title. */
export async function generateMetadata(): Promise<Metadata> {
  const [ctx, t] = await Promise.all([getAuthContext(), getTranslations()]);
  return { title: ctx?.isContentEditor ? t("protocols.editor.newTitle") : t("common.notFound.title") };
}

export default function NewGlobalProtocolPage() {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <CreateProtocolView kind="global" />
    </Suspense>
  );
}
