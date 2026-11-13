import * as z from "zod";
import { PROTOCOL_ICONS } from "@/components/shared/protocol-icon";
import {
  MAX_STEP_WEIGHT,
  MAX_STEPS_PER_PROTOCOL,
  MIN_STEP_WEIGHT,
  PROTOCOL_CATEGORIES,
  protocolSchema,
  SLUG_PATTERN,
} from "@/lib/validation/protocol";
import { REPORTED_WORDING_FIELDS } from "./history";

/**
 * The protocol editor's form model (components/protocols/editor), shared by the client form and the server actions
 * (lib/protocols/editor-actions.ts), so both run the SAME rules: lib/validation/protocol.ts (protocolSchema, the seed's
 * rules too) plus the editor's own two (a reference link needs a reference name; the icon must be one we bundle).
 * Pure: no server-only imports, safe in "use client" files.
 *
 * Form values are plain strings and booleans (inputs never hold null). normalizeEditorValues() turns them into the
 * database shape: trimmed, empty optional fields -> null, photo criteria only on photo-checkable steps, critical steps
 * always mandatory.
 */

export type ProtocolCategoryValue = (typeof PROTOCOL_CATEGORIES)[number];

/** Icons the editor offers: the ones components/shared/protocol-icon.tsx bundles. */
export const EDITOR_ICONS = Object.keys(PROTOCOL_ICONS);

export type EditorStepValues = {
  /** Database id; null for a step added in this editing session. */
  id: string | null;
  /** Database key of a saved step. New steps carry a placeholder; the server picks their real key. */
  key: string;
  textAr: string;
  textEn: string;
  rationaleAr: string;
  rationaleEn: string;
  criteriaAr: string;
  criteriaEn: string;
  referenceLabel: string;
  referenceUrl: string;
  isMandatory: boolean;
  isCritical: boolean;
  weight: number;
  visualCheck: boolean;
};

export type EditorValues = {
  /** Only used when an admin creates a global protocol (the address is fixed after that). */
  slug: string;
  category: ProtocolCategoryValue | "";
  icon: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  descriptionAr: string;
  descriptionEn: string;
  steps: EditorStepValues[];
};

/** A random placeholder key for a step added in the browser (valid for the shared schema; the server replaces it). */
export function placeholderStepKey(random: () => number = Math.random): string {
  return `new-${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0")}`;
}

export function emptyStep(key: string = placeholderStepKey()): EditorStepValues {
  return {
    id: null,
    key,
    textAr: "",
    textEn: "",
    rationaleAr: "",
    rationaleEn: "",
    criteriaAr: "",
    criteriaEn: "",
    referenceLabel: "",
    referenceUrl: "",
    isMandatory: true,
    isCritical: false,
    weight: 1,
    visualCheck: false,
  };
}

export function emptyEditorValues(): EditorValues {
  return {
    slug: "",
    category: "",
    icon: "book-open-check",
    titleAr: "",
    titleEn: "",
    summaryAr: "",
    summaryEn: "",
    descriptionAr: "",
    descriptionEn: "",
    steps: [emptyStep()],
  };
}

/** A saved step or protocol row -> form values (null columns become empty inputs). */
export function stepToEditorValues(step: {
  id: string;
  key: string;
  textAr: string;
  textEn: string;
  rationaleAr: string;
  rationaleEn: string;
  criteriaAr: string | null;
  criteriaEn: string | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
  isMandatory: boolean;
  isCritical: boolean;
  weight: number;
  visualCheck: boolean;
}): EditorStepValues {
  return {
    id: step.id,
    key: step.key,
    textAr: step.textAr,
    textEn: step.textEn,
    rationaleAr: step.rationaleAr,
    rationaleEn: step.rationaleEn,
    criteriaAr: step.criteriaAr ?? "",
    criteriaEn: step.criteriaEn ?? "",
    referenceLabel: step.referenceLabel ?? "",
    referenceUrl: step.referenceUrl ?? "",
    isMandatory: step.isMandatory,
    isCritical: step.isCritical,
    weight: step.weight,
    visualCheck: step.visualCheck,
  };
}

export function protocolToEditorValues(protocol: {
  slug: string;
  category: ProtocolCategoryValue;
  icon: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  descriptionAr: string;
  descriptionEn: string;
  steps: Parameters<typeof stepToEditorValues>[0][];
}): EditorValues {
  return {
    slug: protocol.slug,
    category: protocol.category,
    icon: protocol.icon,
    titleAr: protocol.titleAr,
    titleEn: protocol.titleEn,
    summaryAr: protocol.summaryAr,
    summaryEn: protocol.summaryEn,
    descriptionAr: protocol.descriptionAr,
    descriptionEn: protocol.descriptionEn,
    steps: protocol.steps.map(stepToEditorValues),
  };
}

/**
 * Control characters other than tab and line breaks (C0 + DEL). Text pasted from some PDF or Word files carries them,
 * and Postgres cannot store U+0000 at all: they are dropped, never shown to the user as an error they cannot fix.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Invisible format characters: the soft hyphen, the Hangul fillers, the Mongolian vowel separator, the zero-width
 * space, the word joiner and invisible operators, the byte-order mark, and the bidirectional embeddings, overrides and
 * isolates. They show nothing (a title made of them looks blank), and an override reverses the text around it in the
 * library. They are dropped. Two kinds stay, because real text needs them: the zero-width non-joiner and joiner
 * (U+200C, U+200D: Arabic and Persian shaping) and the left-to-right / right-to-left marks (U+200E, U+200F: they only
 * settle the direction of the punctuation next to them, they reorder nothing).
 */
const INVISIBLE_CHARACTERS = /[­ᅟᅠ᠎​‪-‮⁠-⁤⁦-⁩ㅤ﻿ﾠ]/g;

/** Something a reader can see: a letter, a digit, a punctuation mark or a symbol. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

/** `value` without the control characters above. */
export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}

/**
 * Text as the editor stores it: without control and invisible characters, and empty when nothing visible is left
 * (spaces, line breaks and the joiners or marks that stay are not content on their own), so a required field made
 * only of them fails as "required" and an optional one is left out.
 */
export function cleanText(value: string): string {
  const text = stripControlCharacters(value).replace(INVISIBLE_CHARACTERS, "");
  return VISIBLE_CHARACTER.test(text) ? text : "";
}

const clean = cleanText;

const orNull = (value: string) => {
  const v = clean(value).trim();
  return v === "" ? null : v;
};

/** Form values -> the input of protocolSchema (see the file comment). Keeps each step's id next to its data. */
export function normalizeEditorValues(values: EditorValues) {
  return {
    slug: clean(values.slug).trim(),
    category: values.category,
    icon: values.icon,
    titleAr: clean(values.titleAr),
    titleEn: clean(values.titleEn),
    summaryAr: clean(values.summaryAr),
    summaryEn: clean(values.summaryEn),
    descriptionAr: clean(values.descriptionAr),
    descriptionEn: clean(values.descriptionEn),
    steps: values.steps.map((s) => ({
      id: s.id,
      key: s.key,
      textAr: clean(s.textAr),
      textEn: clean(s.textEn),
      rationaleAr: clean(s.rationaleAr),
      rationaleEn: clean(s.rationaleEn),
      criteriaAr: s.visualCheck ? clean(s.criteriaAr) : null,
      criteriaEn: s.visualCheck ? clean(s.criteriaEn) : null,
      referenceLabel: orNull(s.referenceLabel),
      referenceUrl: orNull(s.referenceUrl),
      isMandatory: s.isMandatory || s.isCritical,
      isCritical: s.isCritical,
      weight: s.weight,
      visualCheck: s.visualCheck,
    })),
  };
}

type Checked = { icon: string; steps: Array<{ referenceLabel: string | null; referenceUrl: string | null }> };

/** The editor's own rules on top of protocolSchema. Issues carry validation.* keys (lib/zod-i18n.ts). */
/**
 * The editor's own rules. They run even when other fields already failed (`when` below), so every error shows at once
 * (a disguised link next to an empty title too); hence the defensive reads.
 */
function editorRules(data: Checked, ctx: z.RefinementCtx) {
  if (typeof data?.icon !== "string" || !EDITOR_ICONS.includes(data.icon)) ctx.addIssue({ code: "custom", path: ["icon"], params: { i18n: "invalidOption" } });
  (Array.isArray(data?.steps) ? data.steps : []).forEach((step, index) => {
    if (typeof step?.referenceUrl !== "string") return;
    // The library shows a reference by its name: a link with no name would never be seen.
    if (step.referenceUrl && !step.referenceLabel) {
      ctx.addIssue({ code: "custom", path: ["steps", index, "referenceLabel"], params: { i18n: "required" } });
    }
    // A user name or password in the link (https://who.int@other.example/) disguises where it goes: the library
    // refuses to render such a link (safeReferenceUrl), so the editor refuses to save it.
    if (step.referenceUrl && hasUserInfo(step.referenceUrl)) {
      ctx.addIssue({ code: "custom", path: ["steps", index, "referenceUrl"], params: { i18n: "url" } });
    }
  });
}

/** true when an absolute URL carries a user name or password. Unparseable input is left to the url rule. */
export function hasUserInfo(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.username !== "" || parsed.password !== "";
  } catch {
    return false;
  }
}

const ALWAYS = { when: () => true } as const;
const withSlugSchema = protocolSchema.superRefine(editorRules, ALWAYS);
const withoutSlugSchema = protocolSchema.omit({ slug: true }).superRefine(editorRules, ALWAYS);

/**
 * The full editor schema. `withSlug` only when an admin creates a global protocol (they choose its address); every
 * other save keeps the address it has (institution protocols get a generated one).
 */
export function editorSchema(withSlug: boolean) {
  return z.preprocess((v) => normalizeEditorValues(v as EditorValues), withSlug ? withSlugSchema : withoutSlugSchema);
}

/**
 * Structural check of untrusted input (a Server Action can be called with anything) BEFORE normalizeEditorValues
 * runs: the right shape and bounded sizes. The real rules come after, from editorSchema().
 */
export const editorValuesShape = z.object({
  slug: z.string().max(200),
  category: z.string().max(40),
  icon: z.string().max(80),
  titleAr: z.string().max(10_000),
  titleEn: z.string().max(10_000),
  summaryAr: z.string().max(10_000),
  summaryEn: z.string().max(10_000),
  descriptionAr: z.string().max(20_000),
  descriptionEn: z.string().max(20_000),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(64).nullable(),
        key: z.string().max(200),
        textAr: z.string().max(10_000),
        textEn: z.string().max(10_000),
        rationaleAr: z.string().max(10_000),
        rationaleEn: z.string().max(10_000),
        criteriaAr: z.string().max(10_000),
        criteriaEn: z.string().max(10_000),
        referenceLabel: z.string().max(10_000),
        referenceUrl: z.string().max(10_000),
        isMandatory: z.boolean(),
        isCritical: z.boolean(),
        weight: z.number().int().min(MIN_STEP_WEIGHT).max(MAX_STEP_WEIGHT),
        visualCheck: z.boolean(),
      }),
    )
    .max(MAX_STEPS_PER_PROTOCOL),
});

/**
 * Saved steps with results whose reported wording (history.ts REPORTED_WORDING_FIELDS: text, rationale, photo
 * criteria) differs between the last saved values and `values`, as 1-based positions in `values`. Past reports show
 * a step's current wording, so the editor asks before such a save; saveProtocol checks the same on the server
 * ("wording_confirm"), in case a step got results after the page loaded. `results(id)`: results of a saved step.
 */
export function rewordedStepsWithResults(saved: EditorValues, values: EditorValues, results: (id: string) => number): number[] {
  const before = new Map(normalizeEditorValues(saved).steps.map((s) => [s.id, s]));
  const out: number[] = [];
  normalizeEditorValues(values).steps.forEach((step, index) => {
    const old = step.id ? before.get(step.id) : undefined;
    if (!old || !step.id || results(step.id) === 0) return;
    if (REPORTED_WORDING_FIELDS.some((f) => (old[f] ?? "").trim() !== (step[f] ?? "").trim())) out.push(index + 1);
  });
  return out;
}

/** Zod issues -> { "steps.2.criteriaAr": message } (first message per field). */
export function issuesToFieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    if (path && !(path in out)) out[path] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Addresses (slugs) and step keys

const MAX_SLUG = 80;

/** Lowercase ASCII words joined by hyphens, cut on a word boundary at `max` characters ("" when nothing is left). */
export function slugify(text: string, max = 60): string {
  const base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > max / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG && SLUG_PATTERN.test(slug);
}

/** `base` (or base-2, base-3 …) that is not in `taken`, within the 80-character limit. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, fallback = "step"): string {
  const root = slugify(base, 40) || fallback;
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A readable key for a new step (from its English text), unique within the protocol. */
export function newStepKey(textEn: string, taken: ReadonlySet<string>): string {
  return uniqueSlug(textEn, taken, "step");
}

/** "<base>-<suffix>" within the 80-character limit (institution copies and new institution protocols). */
export function suffixedSlug(base: string, suffix: string): string {
  const root = slugify(base, MAX_SLUG - suffix.length - 1) || "protocol";
  return `${root}-${suffix}`;
}

/** Six random lowercase letters and digits. */
export function randomSuffix(random: () => number = Math.random): string {
  return Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
}

/** The next free "<base>-v<n>" address for a new version of `slug` (base = slug without a "-v<n>" ending). */
export function nextVersionSlug(slug: string, taken: ReadonlySet<string>): string {
  const match = /^(.*)-v(\d+)$/.exec(slug);
  const base = match ? match[1] : slug;
  let n = match ? Number(match[2]) + 1 : 2;
  for (; ; n++) {
    const end = `-v${n}`;
    const candidate = `${base.slice(0, MAX_SLUG - end.length).replace(/-+$/g, "")}${end}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The address prefix of nextVersionSlug's candidates, for one query of the taken ones. */
export function versionSlugBase(slug: string): string {
  const match = /^(.*)-v(\d+)$/.exec(slug);
  return (match ? match[1] : slug).slice(0, MAX_SLUG - 4);
}
