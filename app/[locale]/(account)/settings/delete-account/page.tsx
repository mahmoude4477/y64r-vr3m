import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthHeading } from "@/components/auth/auth-page";
import { DeleteAccountForm } from "@/components/auth/delete-account-form";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { isAppLocale, routing } from "@/i18n/routing";
import { getAccountDeletionInfo } from "@/lib/account/deletion";
import { cn } from "@/lib/utils";

// Foundation-owned (like /settings/password): the focused "delete my account" page, outside the app shell. The
// settings team links here from /settings; the rules are in lib/account/** (docs/CONVENTIONS.md, account section).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.deleteAccount");
  return { title: t("title") };
}

async function DeleteAccountData() {
  const raw = await getLocale();
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const info = await getAccountDeletionInfo(locale); // requireUser() inside: guests -> sign-in
  const t = await getTranslations("auth.deleteAccount");
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="delete-removed" className="flex flex-col gap-1.5 text-sm">
        <h2 id="delete-removed" className="font-medium">
          {t("removedTitle")}
        </h2>
        <p className="text-muted-foreground">{t("removed")}</p>
      </section>
      <section aria-labelledby="delete-kept" className="flex flex-col gap-1.5 text-sm">
        <h2 id="delete-kept" className="font-medium">
          {t("keptTitle")}
        </h2>
        <p className="text-muted-foreground">{t("kept")}</p>
      </section>
      <Separator />
      <DeleteAccountForm info={info} />
      <Link href="/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>
        {t("back")}
      </Link>
    </div>
  );
}

export default async function DeleteAccountPage() {
  const t = await getTranslations("auth.deleteAccount");
  return (
    <>
      <AuthHeading title={t("title")} description={t("description")} />
      <Suspense fallback={<AuthFormSkeleton fields={3} />}>
        <DeleteAccountData />
      </Suspense>
    </>
  );
}
