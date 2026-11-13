// Two-letter initials for an avatar ("Huda Al Harbi" -> "HH", "نورة القحطاني" -> "نق"). The Arabic article "ال" is
// skipped (most family names start with it). Pure; kept here because the app header's own helper lives in a Client
// Component (components/shell/user-menu.tsx), which the server cannot call.
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^ال(?=\S{2})/, ""));
  if (parts.length === 0) return "?";
  const letters = parts.length > 1 ? [...parts[0]][0] + [...parts[parts.length - 1]][0] : [...parts[0]].slice(0, 2).join("");
  return letters.toUpperCase();
}
