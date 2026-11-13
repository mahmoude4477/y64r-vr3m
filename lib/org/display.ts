// Display helpers for institution names (client-safe). `name` holds the Arabic name and `nameEn` the English one
// (crosscheck D13): English pages show the English name when there is one.

type Named = { name: string; nameEn?: string | null };

/** The institution's name in the page's language, falling back to the Arabic name. */
export function orgDisplayName(org: Named, locale: string): string {
  const en = org.nameEn?.trim();
  return locale === "en" && en ? en : org.name;
}

/** The name in the other language, when it exists and differs (shown as a secondary line). */
export function orgSecondaryName(org: Named, locale: string): string | null {
  const en = org.nameEn?.trim();
  if (!en) return null;
  const secondary = locale === "en" ? org.name : en;
  return secondary === orgDisplayName(org, locale) ? null : secondary;
}

/** `ORGANIZATION_TYPES` value or null for anything else stored in the column. */
export function orgTypeOf<T extends string>(value: string | null | undefined, types: readonly T[]): T | null {
  return value && (types as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * `text` cut to `max` characters (with "…"), for names read from the database. The forms and the server rules keep
 * names short; this keeps the pages small even for a row written before those rules or around them (a direct API
 * call), so one oversized name cannot make every member's page heavy. A surrogate pair is never split.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = Math.max(0, max - 1);
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** Arabic letters (Arabic, Arabic Supplement, Extended-A and the presentation forms). */
const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufefc]/;

/** True when `text` has Arabic letters: such a name is marked lang="ar" and drawn with the Arabic font on any page. */
export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}
