import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { ScenarioPreview } from "@/components/simulations/admin/preview";
import { PlayerSkeleton } from "@/components/simulations/skeletons";
import { isAppLocale, routing } from "@/i18n/routing";
import { log } from "@/lib/log";
import { getAuthContext, requireContentEditor } from "@/lib/session";
import { adminPreviewData, adminScenarioTitle } from "@/lib/simulations/admin/queries";

/** "Preview: <scenario>" for a platform admin (checked before the read), else the generic title. */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/scenarios/[id]/preview">): Promise<Metadata> {
  const t = await getTranslations("simulations.admin.actions");
  const fallback = { title: t("preview") };
  try {
    const [{ id, locale: raw }, ctx] = await Promise.all([params, getAuthContext()]);
    if (!ctx?.isContentEditor || ctx.user.mustChangePassword || id.length > 64) return fallback;
    const title = await adminScenarioTitle(id, isAppLocale(raw) ? raw : routing.defaultLocale);
    if (!title) return fallback;
    const tm = await getTranslations("simulations.meta");
    return { title: tm("previewTitle", { title }) };
  } catch (err) {
    unstable_rethrow(err); // prerendering postpones on params / the session: not a failure
    log.warn("simulations.metadata.failed", { page: "admin-preview", err });
    return fallback;
  }
}

export default function ScenarioPreviewPage({ params }: PageProps<"/[locale]/admin/scenarios/[id]/preview">) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: PageProps<"/[locale]/admin/scenarios/[id]/preview">["params"] }) {
  await requireContentEditor();
  const { id } = await params;
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  // Correct answers are in this payload on purpose: the page is platform admin only (checked above).
  const data = id.length <= 64 ? await adminPreviewData(id, locale) : null;
  if (!data) notFound();
  return (
    <>
      <BreadcrumbLabel label={data.scenario.title} />
      <ScenarioPreview key={data.scenario.id} data={data} />
    </>
  );
}
