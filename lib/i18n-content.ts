import type { Locale } from "next-intl";

/**
 * Bilingual database content lives in Ar/En column pairs (titleAr / titleEn, ...).
 *
 *   pick(protocol, "title", locale)          -> the column for the locale, falling back to the other one
 *   pickOrNull(step, "criteria", locale)      -> same, but null when both are empty (optional pairs)
 *
 * Never build `${field}${suffix}` strings by hand in features.
 */
type Pair<K extends string> = { [P in `${K}Ar` | `${K}En`]: string | null | undefined };

function read<K extends string>(row: Pair<K>, field: K, locale: Locale): string | null {
  const r = row as Record<string, string | null | undefined>;
  const ar = r[`${field}Ar`];
  const en = r[`${field}En`];
  const primary = locale === "en" ? en : ar;
  const secondary = locale === "en" ? ar : en;
  if (primary && primary.trim() !== "") return primary;
  if (secondary && secondary.trim() !== "") return secondary;
  return null;
}

export function pick<K extends string>(row: NoInfer<Pair<K>>, field: K, locale: Locale): string {
  return read(row, field, locale) ?? "";
}

export function pickOrNull<K extends string>(row: NoInfer<Pair<K>>, field: K, locale: Locale): string | null {
  return read(row, field, locale);
}

/** The column name for a locale, for orderBy / where clauses: localizedColumn("title", "ar") -> "titleAr". */
export function localizedColumn<K extends string>(field: K, locale: Locale): `${K}Ar` | `${K}En` {
  return locale === "en" ? `${field}En` : `${field}Ar`;
}
