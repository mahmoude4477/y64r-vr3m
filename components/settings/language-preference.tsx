"use client";

import { InfoIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { TAP_SM } from "@/components/org/dialog-styles";
import { buttonVariants } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { type AppLocale, isAppLocale, localeDir, routing } from "@/i18n/routing";
import { switchLocaleHref } from "@/lib/safe-callback";
import { saveLocalePreference } from "@/lib/settings-feature/actions";
import { cn } from "@/lib/utils";
import { sectionHeadingId } from "./settings-section";

/**
 * The saved language (user.locale). Choosing one saves it first (Server Action, validated on the server), then, when it
 * differs from the page, loads the same page in that language with a FULL page load, exactly like the header's
 * LocaleSwitcher (CONVENTIONS 9: never a client-side locale switch). The group is read-only while saving, not
 * disabled, so keyboard focus stays on the radio.
 */
export function LanguagePreference({ saved }: { saved: AppLocale | null }) {
  const t = useTranslations("settings");
  const names = useTranslations("common.localeSwitcher");
  const raw = useLocale();
  const pageLocale: AppLocale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const [value, setValue] = useState<AppLocale>(saved ?? pageLocale);
  const [pending, setPending] = useState<AppLocale | null>(null);

  async function choose(next: AppLocale) {
    if (pending || next === value) return;
    const previous = value;
    setValue(next);
    setPending(next);
    let result: Awaited<ReturnType<typeof saveLocalePreference>> | null = null;
    try {
      result = await saveLocalePreference(pageLocale, { locale: next });
    } catch {
      result = null;
    }
    if (!result?.ok) {
      setValue(previous);
      setPending(null);
      toast.error(result?.message ?? t("errors.network"));
      return;
    }
    if (next !== pageLocale) {
      // Keep the spinner: the page is replaced by the other language.
      window.location.assign(switchLocaleHref(window.location, next));
      return;
    }
    setPending(null);
    toast.success(t("language.saved"));
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={value}
        onValueChange={(v) => {
          if (isAppLocale(v)) void choose(v);
        }}
        readOnly={pending !== null}
        aria-labelledby={sectionHeadingId("language")}
        aria-busy={pending !== null}
        className="grid gap-3 sm:grid-cols-2"
      >
        {routing.locales.map((l) => (
          <FieldLabel key={l} htmlFor={`language-${l}`}>
            <Field orientation="horizontal">
              {/* Named in the server HTML too: Base UI links a wrapping <label> only after hydration. */}
              <RadioGroupItem
                value={l}
                id={`language-${l}`}
                aria-labelledby={`language-${l}-title`}
                aria-describedby={`language-${l}-description`}
              />
              <FieldContent>
                <FieldTitle id={`language-${l}-title`} lang={l} dir={localeDir[l]}>
                  {names(l)}
                </FieldTitle>
                <FieldDescription id={`language-${l}-description`}>{t(`language.direction.${localeDir[l]}`)}</FieldDescription>
              </FieldContent>
              {pending === l && <Spinner aria-label={t("language.saving")} />}
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      {saved && saved !== pageLocale ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-muted-foreground">
            <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("language.mismatch", { language: names(saved) })}
          </p>
          {/* A plain <a>: switching language is a full page load (CONVENTIONS 9), never a client-side transition. */}
          <a
            href={`/${saved}/settings`}
            hrefLang={saved}
            // cn(): buttonVariants alone keeps the base border-transparent next to the outline border color.
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP_SM)}
          >
            {t("language.openSaved")}
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("language.hint")}</p>
      )}
    </div>
  );
}
