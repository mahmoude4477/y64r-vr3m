import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthHeading, emailEnabledAtRequest } from "@/components/auth/auth-page";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgotPassword");
  return { title: t("title") };
}

async function Form() {
  return <ForgotPasswordForm emailEnabled={await emailEnabledAtRequest()} />;
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
  return (
    <>
      <AuthHeading title={t("title")} description={t("description")} />
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <Form />
      </Suspense>
    </>
  );
}
