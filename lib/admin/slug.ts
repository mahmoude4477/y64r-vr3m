// Organization slugs (Better Auth requires a unique `slug`). Institutions are found by name in the admin panel, so the
// slug is a technical id: the English name in lowercase ASCII plus a short random suffix that keeps it unique and
// unguessable. Pure, unit-tested; the random part is injected.

const MAX_BASE = 40;

/** Lowercase ASCII words of `name` joined by "-" ("King Fahd Hospital" -> "king-fahd-hospital"), "" if none. */
export function slugBase(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/g, "");
}

/** `<base>-<suffix>`, or `institution-<suffix>` when the name has no ASCII letters or digits. */
export function organizationSlug(nameEn: string, suffix: string): string {
  const base = slugBase(nameEn) || "institution";
  const tail = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${base}-${tail}`;
}
