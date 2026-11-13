import { BookOpenCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NewScanForm } from "@/components/scans/new-scan-form";
import { NewScanSkeleton } from "@/components/scans/new-scan-skeleton";
import { ScanPageFrame } from "@/components/scans/scan-page";
import { PageHeader } from "@/components/shared/page-header";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";
import { checkAiQuota } from "@/lib/ai/limits";
import { scopeOf } from "@/lib/authz";
import { ORG_STAFF_ROLES } from "@/lib/permissions";
import { institutionDepartments, newScanProtocols } from "@/lib/scans/queries";
import { scanServicesAtRequest } from "@/lib/scans/services";
import { requireOrgRole } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";

// New scan (staff of the active institution only): protocol + department + area, 1..4 photos (camera or upload),
// then the AI analysis and the review. ?protocol=<id> preselects a protocol (links from the protocol pages).

export async function generateMetadata(): Promise<Metadata> {
  const nav = await getTranslations("nav");
  return { title: nav("sub.scanNew") };
}

export default async function NewScanPage({ searchParams }: PageProps<"/[locale]/scans/new">) {
  const t = await getTranslations("scans.new");
  const nav = await getTranslations("nav");
  return (
    <ScanPageFrame>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title={nav("sub.scanNew")} description={t("description")} />
        <Suspense fallback={<NewScanSkeleton />}>
          <NewScanData searchParams={searchParams} />
        </Suspense>
      </div>
    </ScanPageFrame>
  );
}

async function NewScanData({ searchParams }: { searchParams: PageProps<"/[locale]/scans/new">["searchParams"] }) {
  const ctx = await requireOrgRole(ORG_STAFF_ROLES);
  const scope = scopeOf(ctx);
  const locale = await getLocale();
  const [services, protocols, departments, params] = await Promise.all([
    scanServicesAtRequest(),
    newScanProtocols(scope, locale),
    institutionDepartments(scope),
    searchParams,
  ]);

  if (protocols.length === 0) return <NoProtocols />;

  const quota = services.ai ? await checkAiQuota(ctx.user.id) : null;
  const requested = typeof params.protocol === "string" ? params.protocol : null;
  const defaultProtocolId = requested && protocols.some((p) => p.id === requested) ? requested : null;

  return (
    <NewScanForm
      protocols={protocols}
      departments={departments}
      storage={services.storage}
      ai={services.ai}
      aiRemaining={quota ? quota.remaining : null}
      defaultProtocolId={defaultProtocolId}
    />
  );
}

async function NoProtocols() {
  const t = await getTranslations("scans.new.noProtocols");
  return (
    <Empty className="flex-none border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpenCheckIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/protocols" className={buttonVariants({ variant: "outline" })}>
          {t("action")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
