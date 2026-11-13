import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CreateOrganizationForm } from "@/components/admin/organization-form";
import { BreadcrumbLabel } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { adminMetadata } from "@/lib/admin/metadata";
import { requirePlatformAdmin } from "@/lib/session";

// /admin/organizations/new: create an institution and invite its first owner (PRODUCT 6a). The form renders only
// after requirePlatformAdmin(); the action checks it again.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.createOrg");
  return adminMetadata(t("title"));
}

async function CreateOrganization() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.createOrg");
  return (
    <>
      <BreadcrumbLabel label={t("title")} />
      <CreateOrganizationForm />
    </>
  );
}

export default async function NewOrganizationPage() {
  const [t, org] = await Promise.all([getTranslations("admin.createOrg"), getTranslations("admin.org")]);
  return (
    <>
      <Link href="/admin/organizations" className="inline-flex min-h-8 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        {org("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense
        fallback={
          <div className="flex max-w-2xl flex-col gap-4">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        }
      >
        <CreateOrganization />
      </Suspense>
    </>
  );
}
