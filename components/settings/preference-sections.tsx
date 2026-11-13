import { useTranslations } from "next-intl";
import { CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/routing";
import { LanguagePreference } from "./language-preference";
import { SettingsSection } from "./settings-section";
import { ThemePreference } from "./theme-preference";

export function LanguageSection({ saved }: { saved: AppLocale | null }) {
  const t = useTranslations("settings.language");
  return (
    <SettingsSection id="language" title={t("title")} description={t("description")}>
      <CardContent>
        <LanguagePreference saved={saved} />
      </CardContent>
    </SettingsSection>
  );
}

export function AppearanceSection() {
  const t = useTranslations("settings.appearance");
  return (
    <SettingsSection id="appearance" title={t("title")} description={t("description")}>
      <CardContent>
        <ThemePreference />
      </CardContent>
    </SettingsSection>
  );
}
