import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { ScenarioPlayer } from "@/components/simulations/player";
import { PlayerSkeleton } from "@/components/simulations/skeletons";
import { redirect } from "@/i18n/navigation";
import { isAppLocale, routing } from "@/i18n/routing";
import { scopeOf } from "@/lib/authz";
import { log } from "@/lib/log";
import { getAuthContext, requireUser } from "@/lib/session";
import { playableVersionSlug, playerData, playerTitle } from "@/lib/simulations/queries";

/** "<scenario> · Simulation" for a user who may play it (tabs and history tell scenarios apart), else the generic title. */
export async function generateMetadata({ params }: PageProps<"/[locale]/simulations/[slug]">): Promise<Metadata> {
  const nav = await getTranslations("nav");
  const fallback = { title: nav("sub.simulationPlay") };
  try {
    const [{ slug, locale: raw }, ctx] = await Promise.all([params, getAuthContext()]);
    if (!ctx || ctx.user.mustChangePassword || !/^[a-z0-9-]{1,120}$/.test(slug)) return fallback;
    const title = await playerTitle(scopeOf(ctx), slug, isAppLocale(raw) ? raw : routing.defaultLocale);
    if (!title) return fallback;
    const t = await getTranslations("simulations.meta");
    return { title: t("playTitle", { title }) };
  } catch (err) {
    unstable_rethrow(err); // prerendering postpones on params / the session: not a failure
    log.warn("simulations.metadata.failed", { page: "player", err });
    return fallback;
  }
}

export default function SimulationPlayPage({ params }: PageProps<"/[locale]/simulations/[slug]">) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: { params: PageProps<"/[locale]/simulations/[slug]">["params"] }) {
  const ctx = await requireUser();
  const { slug } = await params;
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const valid = /^[a-z0-9-]{1,120}$/.test(slug);
  const scope = scopeOf(ctx);
  const data = valid ? await playerData(scope, slug, locale) : null;
  if (!data) {
    // An older version replaced by a newer one opens the version that is published now.
    const current = valid ? await playableVersionSlug(scope, slug) : null;
    if (current) redirect({ href: `/simulations/${current}`, locale });
    // A scenario the user may not play (unpublished, another institution's, unknown) is simply not found.
    notFound();
  }
  return (
    <>
      <BreadcrumbLabel label={data.scenario.title} />
      {/* Remount with fresh state whenever the server state changes: an attempt opened or answered elsewhere, or one
          completed (the router keeps this page alive between visits, so a stale local state must not survive). */}
      <ScenarioPlayer
        key={`${data.attempt?.id ?? "new"}:${data.attempt?.answeredStageIds.length ?? 0}:${data.history.completed}`}
        data={data}
      />
    </>
  );
}
