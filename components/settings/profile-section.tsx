import { CalendarDaysIcon, ShieldCheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { InitialsAvatar } from "@/components/org/initials-avatar";
import { NameText } from "@/components/org/name-text";
import { Badge } from "@/components/ui/badge";
import type { SettingsProfile } from "@/lib/settings-feature/queries";
import { ProfileForm } from "./profile-form";
import { SettingsSection } from "./settings-section";

export function ProfileSection({ profile }: { profile: SettingsProfile }) {
  const t = useTranslations("settings.profile");
  const roles = useTranslations("common.roles");
  const format = useFormatter();
  return (
    <SettingsSection id="profile" title={t("title")} description={t("description")}>
      <ProfileForm name={profile.name} profession={profile.profession} email={profile.email} emailVerified={profile.emailVerified}>
        <div className="flex items-center gap-4">
          <InitialsAvatar name={profile.name} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            {/* bdi, not dir="auto" on the line: an Arabic name on an English page keeps the page's alignment. */}
            <p className="truncate text-base font-semibold">
              <NameText>{profile.name}</NameText>
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {profile.isPlatformAdmin && (
                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                  <ShieldCheckIcon aria-hidden />
                  {roles("platformAdmin")}
                </Badge>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDaysIcon aria-hidden className="size-4" />
                {t("memberSince", { date: format.dateTime(profile.createdAt, "date") })}
              </span>
            </div>
          </div>
        </div>
      </ProfileForm>
    </SettingsSection>
  );
}
