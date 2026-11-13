import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EditorSkeleton, EditProtocolView, ProtocolPageSkeleton, ReadOnlyProtocolSkeleton } from "@/components/protocols/editor/editor-views";
import { InstitutionProtocolView } from "@/components/protocols/manage/institution-protocol-view";
import { pick } from "@/lib/i18n-content";
import { getProtocolTitlesForAdmin, protocolOwnerKind } from "@/lib/protocols/editor-queries";
import { getAuthContext, requireContentEditor } from "@/lib/session";

// Platform admin: edit a global protocol, or look at an institution's protocol (read-only: institutions manage their own).

/** "Edit: <title>" for a global protocol, the title for an institution's one, "Page not found" for anyone else. */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/protocols/[id]">): Promise<Metadata> {
  const [{ id }, ctx, locale, t] = await Promise.all([params, getAuthContext(), getLocale(), getTranslations()]);
  const row = ctx?.isContentEditor ? await getProtocolTitlesForAdmin(id) : null;
  if (!row) return { title: t("common.notFound.title") };
  const title = pick(row, "title", locale);
  return { title: row.organizationId === null ? t("protocols.editor.metaTitle", { title }) : title };
}

export default function AdminProtocolPage({ params }: PageProps<"/[locale]/admin/protocols/[id]">) {
  return (
    <Suspense fallback={<ProtocolPageSkeleton />}>
      <AdminProtocol params={params} />
    </Suspense>
  );
}

/** The gate and the owner first; then the editor (global) or the read-only view, each with its own skeleton. */
async function AdminProtocol({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, requireContentEditor()]);
  const owner = await protocolOwnerKind(id);
  if (owner === null) notFound();
  if (owner === "institution") {
    return (
      <Suspense fallback={<ReadOnlyProtocolSkeleton />}>
        <InstitutionProtocolView id={id} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditProtocolView kind="global" id={id} ctx={ctx} />
    </Suspense>
  );
}
