import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EditorSkeleton, EditProtocolView, requireEditor } from "@/components/protocols/editor/editor-views";
import { isOrgManager, scopeOf } from "@/lib/authz";
import { pick } from "@/lib/i18n-content";
import { getEditorProtocolTitles } from "@/lib/protocols/editor-queries";
import { getAuthContext } from "@/lib/session";

// Institution managers: edit one of the active institution's protocols (protocolsEditable). Others: not found.

/** "Edit: <title>" for a manager who may edit it; the not-found title for anyone else (same rule as the page). */
export async function generateMetadata({ params }: PageProps<"/[locale]/org/protocols/[id]">): Promise<Metadata> {
  const [{ id }, ctx, locale, t] = await Promise.all([params, getAuthContext(), getLocale(), getTranslations()]);
  const scope = ctx ? scopeOf(ctx) : null;
  const titles = scope && isOrgManager(scope) ? await getEditorProtocolTitles("institution", scope, id) : null;
  return { title: titles ? t("protocols.editor.metaTitle", { title: pick(titles, "title", locale) }) : t("common.notFound.title") };
}

export default function OrgProtocolPage({ params }: PageProps<"/[locale]/org/protocols/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <OrgProtocol params={params} />
    </Suspense>
  );
}

async function OrgProtocol({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, requireEditor("institution")]);
  return <EditProtocolView kind="institution" id={id} ctx={ctx} />;
}
