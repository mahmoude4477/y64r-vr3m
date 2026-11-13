// Initials for avatars of institutions and members (no logos or photos: nothing to upload, nothing for the CSP).
// Client-safe and pure.

const ZWNJ = "‌"; // zero-width non-joiner: Arabic initials stay separate letters instead of joining into a word
const ARABIC_LETTER = /\p{Script=Arabic}/u;
const FIRST_SIGNIFICANT = /[\p{L}\p{N}]/u;

/** First letter or digit of a word; the Arabic article "ال" is skipped ("الملك" -> "م"). */
function firstLetter(word: string): string | null {
  const chars = Array.from(word);
  const start = chars[0] === "ا" && chars[1] === "ل" && chars.length > 3 ? 2 : 0;
  return chars.slice(start).find((c) => FIRST_SIGNIFICANT.test(c)) ?? null;
}

/**
 * Up to two initials from the first two words that carry a letter or digit:
 * "مستشفى الملك فهد" -> "م‌م" (separated by a ZWNJ), "King Fahd Hospital" -> "KF", "" -> "".
 */
export function initialsOf(name: string | null | undefined): string {
  const letters = (name ?? "")
    .trim()
    .split(/\s+/)
    .map(firstLetter)
    .filter((c): c is string => c !== null)
    .slice(0, 2);
  if (letters.length === 0) return "";
  const arabic = letters.some((c) => ARABIC_LETTER.test(c));
  return arabic ? letters.join(ZWNJ) : letters.join("").toLocaleUpperCase("en");
}
