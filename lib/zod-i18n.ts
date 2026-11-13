import type { createTranslator, Locale, Messages } from "next-intl";
import * as z from "zod";

/** Same type on the server (getTranslations("validation")) and the client (useTranslations("validation")). */
export type ValidationT = ReturnType<typeof createTranslator<Messages, "validation">>;
type ValidationKey = Parameters<ValidationT>[0];

const zodLocales = { ar: z.locales.ar, en: z.locales.en } satisfies Record<
  Locale,
  () => { localeError: z.core.$ZodErrorMap }
>;

/**
 * Translated zod errors:  schema.safeParse(data, { error: zodErrorMap(t, locale) })
 * or with RHF:            zodResolver(schema, { error: zodErrorMap(t, locale) })
 *
 * Schemas carry NO inline messages (an inline message beats this map). For custom refinements use
 * `.refine(fn, { params: { i18n: "passwordsMismatch" } })` with a key from messages/<l>/validation.json.
 * Never call z.config() on the server (it is process-global).
 */
export function zodErrorMap(t: ValidationT, locale: Locale): z.core.$ZodErrorMap {
  const fallback = zodLocales[locale]().localeError;
  return (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null || issue.input === ""
          ? t("required")
          : t("invalidType");
      case "too_small":
        if (issue.origin === "string")
          return issue.input === "" ? t("required") : t("tooShort", { min: String(issue.minimum) });
        return t("tooSmall", { min: String(issue.minimum) });
      case "too_big":
        return issue.origin === "string"
          ? t("tooLong", { max: String(issue.maximum) })
          : t("tooBig", { max: String(issue.maximum) });
      case "invalid_format":
        if (issue.format === "email") return t("email");
        if (issue.format === "url") return t("url");
        return t("invalidFormat");
      case "invalid_value":
        return t("invalidOption");
      case "custom": {
        const key = issue.params?.i18n as ValidationKey | undefined;
        return key && t.has(key) ? (t as unknown as (k: string) => string)(key) : fallback(issue);
      }
      default:
        return fallback(issue);
    }
  };
}
