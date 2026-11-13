import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { LockedScenario } from "@/components/simulations/admin/locked-view";
import { ScenarioEditor } from "@/components/simulations/admin/scenario-editor";
import { AdminFormSkeleton } from "@/components/simulations/admin/skeletons";
import { isAppLocale, routing } from "@/i18n/routing";
import { log } from "@/lib/log";
import { getAuthContext, requireContentEditor } from "@/lib/session";
import { adminEditorData, adminScenarioTitle } from "@/lib/simulations/admin/queries";

/** "Edit: <scenario>" for a platform admin (checked before the read), else the generic title. */
export async function generateMetadata({ params }: PageProps<"/[locale]/admin/scenarios/[id]">): Promise<Metadata> {
  const nav = await getTranslations("nav");
  const fallback = { title: nav("sub.adminScenarios") };
  try {
    const [{ id, locale: raw }, ctx] = await Promise.all([params, getAuthContext()]);
    if (!ctx?.isContentEditor || ctx.user.mustChangePassword || id.length > 64) return fallback;
    const title = await adminScenarioTitle(id, isAppLocale(raw) ? raw : routing.defaultLocale);
    if (!title) return fallback;
    const tm = await getTranslations("simulations.meta");
    return { title: tm("editTitle", { title }) };
  } catch (err) {
    unstable_rethrow(err); // prerendering postpones on params / the session: not a failure
    log.warn("simulations.metadata.failed", { page: "admin-editor", err });
    return fallback;
  }
}

export default function ScenarioEditorPage({ params }: PageProps<"/[locale]/admin/scenarios/[id]">) {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/[locale]/admin/scenarios/[id]">["params"] }) {
  await requireContentEditor();
  const { id } = await params;
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const data = id.length <= 64 ? await adminEditorData(id, locale) : null;
  if (!data) notFound();
  return (
    <>
      <BreadcrumbLabel label={data.title} />
      {/* A scenario with attempts is never edited in place (CONVENTIONS 6): it is shown read-only with "new version". */}
      {data.attempts.total > 0 ? <LockedScenario data={data} /> : <ScenarioEditor key={data.id} data={data} />}
    </>
  );
}
