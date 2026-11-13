// Display helpers shared by the admin pages. Pure, safe in Server and Client Components.

/**
 * An institution's name in the page language (Arabic is `name`, English `nameEn`, crosscheck D13) and the other one
 * as a subtitle when it differs.
 */
export function orgNames(org: { name: string; nameEn: string | null }, locale: string): { primary: string; secondary: string | null } {
  if (locale === "en" && org.nameEn) return { primary: org.nameEn, secondary: org.name !== org.nameEn ? org.name : null };
  return { primary: org.name, secondary: org.nameEn && org.nameEn !== org.name ? org.nameEn : null };
}
