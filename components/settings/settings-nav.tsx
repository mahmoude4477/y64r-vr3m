import { Building2Icon, LanguagesIcon, type LucideIcon, ShieldCheckIcon, SunMoonIcon, UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SettingsSectionId } from "./settings-section";

const SECTIONS: ReadonlyArray<{ id: SettingsSectionId; icon: LucideIcon }> = [
  { id: "profile", icon: UserRoundIcon },
  { id: "language", icon: LanguagesIcon },
  { id: "appearance", icon: SunMoonIcon },
  { id: "security", icon: ShieldCheckIcon },
  { id: "institutions", icon: Building2Icon },
];

/**
 * In-page links to the settings sections, beside the cards on wide screens (static: generic strings only, no
 * request data). On phones the cards simply follow each other, so the list is hidden there.
 */
export function SettingsNav() {
  const t = useTranslations("settings.nav");
  return (
    <nav aria-label={t("label")} className="hidden lg:sticky lg:top-20 lg:block">
      <ul className="flex flex-col gap-0.5">
        {SECTIONS.map(({ id, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {t(id)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
