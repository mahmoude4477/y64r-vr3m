import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CreateScenarioForm } from "@/components/simulations/admin/create-form";
import { AdminFormSkeleton } from "@/components/simulations/admin/skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isAppLocale, routing } from "@/i18n/routing";
import { adminCreateOptions } from "@/lib/simulations/admin/queries";
import { requireContentEditor } from "@/lib/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("simulations.admin.create");
  return { title: t("title") };
}

export default async function NewScenarioPage() {
  const t = await getTranslations("simulations.admin.create");
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/scenarios" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>
        <ArrowLeftIcon aria-hidden className="rtl:rotate-180" />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<AdminFormSkeleton />}>
        <CreateForm />
      </Suspense>
    </div>
  );
}

async function CreateForm() {
  await requireContentEditor();
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  return <CreateScenarioForm options={await adminCreateOptions(locale)} />;
}
