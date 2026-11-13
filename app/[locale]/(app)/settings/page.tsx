import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { InstitutionsSection } from "@/components/settings/institutions-section";
import { AppearanceSection, LanguageSection } from "@/components/settings/preference-sections";
import { ProfileSection } from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { getSettingsData } from "@/lib/settings-feature/queries";
import { requireUser } from "@/lib/session";

// /settings: profile, language, appearance, security (password, active sessions) and institutions of the signed-in
// user. Every signed-in user has it (trainees and individual users too). The data component reads the session
// inside Suspense (requireUser: guests go to sign-in, mustChangePassword users to /settings/password); only generic
// strings (title, section links) sit in the static shell. The password change is the foundation page
// /settings/password. No delete-account entry here (postponed, 2026-10-29).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

async function SettingsContent() {
  const ctx = await requireUser();
  const data = await getSettingsData(ctx);
  return (
    <div className="flex flex-col gap-6">
      <ProfileSection profile={data.profile} />
      <LanguageSection saved={data.profile.locale} />
      <AppearanceSection />
      <SecuritySection data={data} />
      <InstitutionsSection data={data} />
    </div>
  );
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:gap-10">
        <SettingsNav />
        <div className="w-full max-w-3xl min-w-0">
          <Suspense fallback={<SettingsSkeleton />}>
            <SettingsContent />
          </Suspense>
        </div>
      </div>
    </>
  );
}
