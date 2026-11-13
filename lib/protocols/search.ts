/**
 * Protocol library search and filters (pure, unit-tested; no DB, no session).
 *
 * The library is small (the global protocols plus the active institution's own), so the list page loads every
 * readable published protocol once and filters in memory. That gives a search Postgres `contains` cannot:
 * Arabic letters are normalised (أ إ آ ٱ → ا, ة → ه, ى → ي, diacritics and tatweel dropped, Arabic-Indic
 * digits → Latin), both languages are searched whatever the interface language, and title hits rank first.
 */
import { PROTOCOL_CATEGORIES } from "@/lib/validation/protocol";

export type ProtocolCategoryValue = (typeof PROTOCOL_CATEGORIES)[number];

/** Longest search text we keep from the URL (longer input is cut, never rejected). */
export const MAX_QUERY_LENGTH = 100;

export type LibraryFilters = {
  category: ProtocolCategoryValue | null;
  /** Trimmed search text as typed (not normalised), "" when none. */
  q: string;
};

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isProtocolCategory(value: unknown): value is ProtocolCategoryValue {
  return typeof value === "string" && (PROTOCOL_CATEGORIES as readonly string[]).includes(value);
}

/** Search text as the URL keeps it: whitespace collapsed, trimmed, at most MAX_QUERY_LENGTH characters. */
export function cleanQuery(q: string | null | undefined): string {
  return (q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

/** URL search params -> filters. Unknown categories are ignored, the query is trimmed and capped. */
export function parseLibraryFilters(params: Record<string, SearchParamValue> | null | undefined): LibraryFilters {
  const category = first(params?.category);
  return { category: isProtocolCategory(category) ? category : null, q: cleanQuery(first(params?.q)) };
}

/** "/protocols" with the filters as a query string (stable order, empty values left out). */
export function libraryHref(filters: Partial<LibraryFilters>): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  const q = cleanQuery(filters.q);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/protocols?${query}` : "/protocols";
}

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Lowercase, accent-free, Arabic-normalised text for matching (never shown to users). */
export function normalizeForSearch(text: string): string {
  return (
    text
      // Decompose (compatibility forms too: Arabic presentation forms, ligatures, full-width letters) so hamza
      // and madda on alef, waw and yeh become separate marks (أ = ا + ٔ), then drop every mark (harakat, shadda,
      // sukun, superscript alef, Latin accents).
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/ـ/g, "") // tatweel
      .replace(/ٱ/g, "ا") // alef wasla -> alef
      .replace(/ة/g, "ه") // teh marbuta -> heh
      .replace(/ى/g, "ي") // alef maksura -> yeh
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/** Normalised words of a query; empty when there is nothing to search for. */
export function queryTokens(q: string): string[] {
  const normalized = normalizeForSearch(q);
  return normalized ? normalized.split(" ") : [];
}

/** The text a protocol is searched in, both languages. */
export type SearchableProtocol = {
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  descriptionAr: string;
  descriptionEn: string;
  steps: ReadonlyArray<{ textAr: string; textEn: string }>;
};

export type SearchIndex = { title: string; summary: string; body: string };

export function searchIndex(p: SearchableProtocol): SearchIndex {
  return {
    title: normalizeForSearch(`${p.titleAr} ${p.titleEn}`),
    summary: normalizeForSearch(`${p.summaryAr} ${p.summaryEn}`),
    body: normalizeForSearch([p.descriptionAr, p.descriptionEn, ...p.steps.flatMap((s) => [s.textAr, s.textEn])].join(" ")),
  };
}

/**
 * How well a protocol matches: 0 = every word in the title, 1 = in title + summary, 2 = anywhere (description,
 * steps), null = some word is missing. With no words everything matches at rank 0.
 */
export function matchRank(index: SearchIndex, tokens: readonly string[]): 0 | 1 | 2 | null {
  if (tokens.length === 0) return 0;
  const all = (text: string) => tokens.every((token) => text.includes(token));
  if (all(index.title)) return 0;
  const head = `${index.title} ${index.summary}`;
  if (all(head)) return 1;
  if (all(`${head} ${index.body}`)) return 2;
  return null;
}

export type LibraryEntry<T> = {
  item: T;
  category: ProtocolCategoryValue;
  /** Belongs to the active institution (shown before global ones). */
  own: boolean;
  /** Localised title, for sorting. */
  title: string;
  index: SearchIndex;
};

export type LibraryResult<T> = {
  /** Matching items, best first. */
  items: T[];
  /** Readable published protocols before any filter. */
  total: number;
  /** Per category, among the protocols that match the search text (the chips show these). */
  categoryCounts: Record<ProtocolCategoryValue, number>;
  /** Matches of the search text in every category (the "All" chip). */
  searchTotal: number;
};

/**
 * Applies the filters: the search text first (it also drives the category counts), then the category.
 * Order: search rank, then the institution's own protocols, then the localised title (Intl.Collator).
 */
export function filterLibrary<T>(entries: ReadonlyArray<LibraryEntry<T>>, filters: LibraryFilters, locale: string): LibraryResult<T> {
  const tokens = queryTokens(filters.q);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const categoryCounts = Object.fromEntries(PROTOCOL_CATEGORIES.map((c) => [c, 0])) as Record<ProtocolCategoryValue, number>;

  const matched: Array<{ entry: LibraryEntry<T>; rank: number }> = [];
  for (const entry of entries) {
    const rank = matchRank(entry.index, tokens);
    if (rank === null) continue;
    categoryCounts[entry.category] += 1;
    if (filters.category && entry.category !== filters.category) continue;
    matched.push({ entry, rank });
  }
  matched.sort(
    (a, b) =>
      a.rank - b.rank || Number(b.entry.own) - Number(a.entry.own) || collator.compare(a.entry.title, b.entry.title),
  );
  const searchTotal = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0);
  return { items: matched.map((m) => m.entry.item), total: entries.length, categoryCounts, searchTotal };
}
