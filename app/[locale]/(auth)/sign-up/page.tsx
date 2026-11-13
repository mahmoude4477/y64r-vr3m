import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthHeading } from "@/components/auth/auth-page";
import { SignUpForm } from "@/components/auth/sign-up-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  return (
    <>
      <AuthHeading title={t("title")} description={t("description")} />
      <Suspense fallback={<AuthFormSkeleton fields={4} />}>
        <SignUpForm />
      </Suspense>
    </>
  );
}
