"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { sectionHeadingId } from "./settings-section";

const OPTIONS = [
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
  { value: "system", icon: MonitorIcon },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

const isThemeValue = (v: unknown): v is ThemeValue => OPTIONS.some((o) => o.value === v);

const noopSubscribe = () => () => {};

/**
 * Light / dark / system with next-themes (the same store as the header's ThemeToggle; saved in this browser). The
 * saved choice is only known in the browser, so nothing is selected in the server HTML and the choice appears once
 * the page is interactive (no hydration mismatch, no layout shift: the cards are the same either way).
 */
export function ThemePreference() {
  const t = useTranslations("settings.appearance");
  const names = useTranslations("common.theme");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const value: ThemeValue | null = mounted ? (isThemeValue(theme) ? theme : "system") : null;

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={value}
        onValueChange={(v) => {
          if (isThemeValue(v)) setTheme(v);
        }}
        aria-labelledby={sectionHeadingId("appearance")}
        className="grid gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map(({ value: option, icon: Icon }) => (
          <FieldLabel key={option} htmlFor={`theme-${option}`}>
            <Field orientation="horizontal">
              {/* Named in the server HTML too: Base UI links a wrapping <label> only after hydration. */}
              <RadioGroupItem
                value={option}
                id={`theme-${option}`}
                aria-labelledby={`theme-${option}-title`}
                aria-describedby={`theme-${option}-description`}
              />
              <FieldContent>
                <FieldTitle id={`theme-${option}-title`}>
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  {names(option)}
                </FieldTitle>
                <FieldDescription id={`theme-${option}-description`}>{t(option)}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <p className="text-sm text-muted-foreground">{t("deviceOnly")}</p>
    </div>
  );
}
