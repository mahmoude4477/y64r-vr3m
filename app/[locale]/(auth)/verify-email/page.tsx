import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthHeading, emailEnabledAtRequest } from "@/components/auth/auth-page";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.verifyEmail");
  return { title: t("title") };
}

async function Form() {
  return <VerifyEmailForm emailEnabled={await emailEnabledAtRequest()} />;
}

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth.verifyEmail");
  return (
    <>
      <AuthHeading title={t("title")} />
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <Form />
      </Suspense>
    </>
  );
}
