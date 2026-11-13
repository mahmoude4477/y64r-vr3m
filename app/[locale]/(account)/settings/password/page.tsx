import { ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthHeading } from "@/components/auth/auth-page";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";

// Foundation-owned: the mustChangePassword gate depends on this page. The settings team links here.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.changePassword");
  return { title: t("title") };
}

async function PasswordForm() {
  const ctx = await requireUser({ allowMustChangePassword: true });
  const t = await getTranslations("auth.changePassword");
  const nav = await getTranslations("nav");
  const forced = !!ctx.user.mustChangePassword;
  return (
    <div className="flex flex-col gap-6">
      {forced && (
        <Alert>
          <ShieldAlertIcon aria-hidden />
          <AlertDescription>{t("required")}</AlertDescription>
        </Alert>
      )}
      <ChangePasswordForm />
      <div className="flex items-center justify-between gap-2">
        {forced ? (
          <SignOutButton />
        ) : (
          <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {nav("settings")}
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function ChangePasswordPage() {
  const t = await getTranslations("auth.changePassword");
  return (
    <>
      <AuthHeading title={t("title")} description={t("description")} />
      <Suspense fallback={<AuthFormSkeleton fields={3} />}>
        <PasswordForm />
      </Suspense>
    </>
  );
}
