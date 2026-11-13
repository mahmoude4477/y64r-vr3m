import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-page";
import { SignInForm } from "@/components/auth/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("title") };
}

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn");
  return (
    <>
      <AuthHeading title={t("title")} description={t("description")} />
      <SignInForm />
    </>
  );
}
